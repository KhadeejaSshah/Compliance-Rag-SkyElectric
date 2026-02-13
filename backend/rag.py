import os
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from typing import List, Dict

load_dotenv()

# Check if Pinecone is configured
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
USE_PINECONE = PINECONE_API_KEY and PINECONE_API_KEY != "your-pinecone-api-key"

if USE_PINECONE:
    from langchain_pinecone import PineconeVectorStore
    from pinecone import Pinecone
else:
    from langchain_community.vectorstores import FAISS

class RAGEngine:
    def __init__(self):
        # Using Gemini-2.0-flash-lite for enhanced performance and efficiency
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/gemini-embedding-001",
            output_dimensionality=768
        )
        self.llm = ChatGoogleGenerativeAI(
            model="models/gemini-2.0-flash-lite", 
            temperature=0,
            max_output_tokens=4096  # Explicit high limit for long answer lists
        )
        self.use_pinecone = USE_PINECONE
        self.index_name = os.getenv("PINECONE_INDEX_NAME", "compliance-rag")
        self.vector_store = None
        
        if self.use_pinecone:
            try:
                # We don't initialize vector_store globally with a namespace here 
                # because we want to switch between namespaces dynamically
                self.vector_store = PineconeVectorStore(index_name=self.index_name, embedding=self.embeddings)
                print(f"DEBUG: Using Pinecone index: {self.index_name}")
            except Exception as e:
                print(f"DEBUG: Pinecone init failed, falling back to FAISS: {e}")
                self.use_pinecone = False
                self.vector_store = None
        else:
            print("DEBUG: Using in-memory FAISS (Pinecone not configured)")
            self.vector_store = None

    def get_session_namespace(self, session_id: str) -> str:
        """Helper to generate session-specific namespace."""
        return f"session_{session_id}"

    def ingest_documents(self, clauses: List[Dict], session_id: str = None, namespace: str = None):
        """Ingest documents into vector store."""
        if not clauses:
            return None
            
        # Determine namespace
        if not namespace:
            namespace = self.get_session_namespace(session_id) if session_id else "session"
            
        texts = [c['text'] for c in clauses]
        metadatas = [
            {
                "clause_id": str(c['clause_id']), 
                "doc_id": str(c['doc_id']),
                "doc_name": c.get('doc_name', 'Unknown'),
                "page_number": int(c.get('page_number', 1))
            } 
            for c in clauses
        ]
        
        try:
            if self.use_pinecone:
                try:
                    # Specific namespace for ingestion
                    self.vector_store.add_texts(texts, metadatas=metadatas, namespace=namespace)
                    print(f"DEBUG: Ingested {len(texts)} texts into namespace: {namespace}")
                except Exception as e:
                    if "dimension" in str(e).lower():
                        print(f"CRITICAL: Pinecone dimension mismatch. GEMINI uses 768, current index uses older dimension.")
                        raise Exception("Pinecone Dimension Mismatch: Please recreate your Pinecone index with 768 dimensions for Gemini.")
                    raise e
            else:
                # FAISS mode (no namespaces in basic FAISS wrapper)
                if self.vector_store is None:
                    self.vector_store = FAISS.from_texts(texts, self.embeddings, metadatas=metadatas)
                else:
                    self.vector_store.add_texts(texts, metadatas=metadatas)
        except Exception as e:
            print(f"DEBUG: Vector Store Ingestion Error: {e}")
            raise e
        
        return self.vector_store

    def clear_index(self, session_id: str = None, namespace: str = None):
        """Clear a specific namespace in the vector index."""
        if not namespace:
            namespace = self.get_session_namespace(session_id) if session_id else "session"
            
        if self.use_pinecone:
            try:
                from pinecone import Pinecone
                pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
                index = pc.Index(self.index_name)
                # Note: deleting with delete_all=True only works if we don't specify namespace? 
                # Actually index.delete(delete_all=True, namespace=namespace) is correct for Pinecone.
                index.delete(delete_all=True, namespace=namespace)
                print(f"DEBUG: Cleared Pinecone namespace: {namespace}")
            except Exception as e:
                print(f"DEBUG: Pinecone Clear Index Error (Namespace: {namespace}): {e}")
        else:
            self.vector_store = None

    def reciprocal_rank_fusion(self, search_results_list: List[List[tuple]], k=60, source_weights: List[float] = None):
        """
        Reciprocal Rank Fusion (RRF) to merge results from different sources.
        search_results_list: List of result lists, each result is (doc, score)
        source_weights: Optional per-source weight multiplier (e.g., [1.5, 1.0] to boost first source)
        """
        if source_weights is None:
            source_weights = [1.0] * len(search_results_list)
        
        fused_scores = {}
        for src_idx, results in enumerate(search_results_list):
            weight = source_weights[src_idx] if src_idx < len(source_weights) else 1.0
            for rank, (doc, _) in enumerate(results):
                # Composite key: source_type + doc_name + clause_id
                source_type = doc.metadata.get('source_type', 'UNKNOWN')
                doc_name = doc.metadata.get('doc_name', 'Unknown')
                clause_id = doc.metadata.get('clause_id', 'Unknown')
                key = f"{source_type}_{doc_name}_{clause_id}"
                
                if key not in fused_scores:
                    fused_scores[key] = (doc, 0)
                
                # RRF Formula with source weight: weight * 1 / (k + rank + 1)
                fused_scores[key] = (doc, fused_scores[key][1] + weight * (1 / (k + rank + 1)))
        
        # Sort by fused score descending
        fused_results = sorted(fused_scores.values(), key=lambda x: x[1], reverse=True)
        return fused_results

    def retrieve_similar_clauses(self, query_text: str, top_k: int = 8, use_kb: bool = False, session_id: str = None, doc_id: int = None):
        if self.vector_store is None:
            return []
            
        session_ns = self.get_session_namespace(session_id) if session_id else "session"
        
        kb_results = []
        doc_results = []
        
        if self.use_pinecone:
            # Search Session Store (Uploaded Docs)
            try:
                doc_results = self.vector_store.similarity_search_with_score(
                    query_text, 
                    k=top_k, 
                    namespace=session_ns
                )
                # Label source for clarity
                for d, s in doc_results: d.metadata["source_type"] = "DOC"
            except Exception as e:
                print(f"DEBUG: Pinecone session search error: {e}")
                
            # Search Knowledge Base (Permanent) — fetch more to capture table/value chunks
            if use_kb:
                try:
                    kb_results = self.vector_store.similarity_search_with_score(
                        query_text, 
                        k=top_k * 2, 
                        namespace="permanent"
                    )
                    # Label source for clarity
                    for d, s in kb_results: d.metadata["source_type"] = "KB"
                    print(f"DEBUG: KB search returned {len(kb_results)} results")
                except Exception as e:
                    print(f"DEBUG: Pinecone KB search error: {e}")
        else:
            # FAISS fallback (no namespaces)
            all_res = self.vector_store.similarity_search_with_score(query_text, k=top_k * 2)
            for d, s in all_res: d.metadata["source_type"] = "FAISS"
            return all_res[:top_k]

        # Filter by doc_id if specified (usually for compliance assessment against a specific reg)
        if doc_id:
            combined = doc_results + kb_results
            filtered = [
                (doc, score) for doc, score in combined 
                if doc.metadata.get('doc_id') == str(doc_id)
            ]
            return filtered[:top_k]

        # Use RRF to fuse KB and Uploaded Doc results
        # KB gets 1.5× weight boost since it's the authoritative source
        fused = self.reciprocal_rank_fusion([kb_results, doc_results], source_weights=[1.5, 1.0])
        return fused[:top_k + 5]  # Return slightly more to improve coverage

    async def analyze_compliance(self, customer_clause: str, regulation_context: str):
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a compliance expert. Compare the provided customer clause against the regulation context.
            Identify if it is COMPLIANT, PARTIAL, or NON_COMPLIANT.
            Provide:
            1. Status
            2. Risk Level (HIGH, MEDIUM, LOW)
            3. Reasoning
            4. Literal Evidence (quote from the regulation)
            5. Confidence score (0.0 to 1.0)
            
            Format response as JSON with those keys."""),
            ("user", "Customer Clause: {customer}\n\nRegulation Context: {context}")
        ])
        
        chain = prompt | self.llm
        print(f"DEBUG: Calling LLM for compliance analysis...")
        try:
            res = await chain.ainvoke({"customer": customer_clause, "context": regulation_context})
            print(f"DEBUG: LLM response received")
        except Exception as e:
            print(f"DEBUG: LLM Invocation Error: {e}")
            return {
                "status": "UNKNOWN",
                "risk": "HIGH",
                "reasoning": f"AI analysis failed: {str(e)}",
                "evidence_text": "N/A",
                "confidence": 0.0
            }
        
        import json
        import re
        
        try:
            content = res.content.strip()
            start = content.find('{')
            end = content.rfind('}')
            
            if start != -1 and end != -1:
                content = content[start:end+1]
            
            data = json.loads(content)
            
            normalized = {}
            for k, v in data.items():
                key = str(k).lower().replace(" ", "_")
                normalized[key] = v
                
            final = {
                "status": normalized.get("status", normalized.get("compliance_status", "UNKNOWN")),
                "risk": normalized.get("risk", normalized.get("risk_level", "HIGH")),
                "reasoning": normalized.get("reasoning", normalized.get("description", "No reasoning provided")),
                "evidence_text": normalized.get("evidence_text", normalized.get("literal_evidence", normalized.get("evidence", "N/A"))),
                "confidence": normalized.get("confidence", normalized.get("confidence_score", 0.0))
            }
            return final
        except Exception as e:
            print(f"DEBUG: CRITICAL - JSON Parse Error in rag.py: {e}")
            print(f"DEBUG: RAW content was: {res.content}")
            return {
                "status": "UNKNOWN",
                "risk": "HIGH",
                "reasoning": f"Failed to interpret AI response: {str(e)}",
                "evidence_text": "N/A",
                "confidence": 0.0
            }

    def answer_from_source(self, query: str, context: str, source_label: str, history: List[Dict] = None):
        """Answer a query using a single source context (KB or DOC)."""
        system_prompt = f"""You are a compliance assistant for SkyElectric. Answer the user's query using ONLY the provided {source_label} context below.

RULES:
- Provide direct, substantive answers. NEVER say "I will answer" or defer.
- If the context contains questions (test plan, questionnaire), answer ALL of them with detailed content.
- NEVER list questions without answering them.
- **ALWAYS provide actual numerical values, measurements, thresholds, and limits** when they appear in the context. Do NOT just reference "see Table X" or "as per Clause Y" — quote the actual data.
- If the context references a table or figure but the actual values are NOT present in the provided text, explicitly state: "The exact values from [Table/Figure X] are not available in the retrieved context."
- **SELF-CONTAINED ANSWERS**: The user CANNOT see the source documents. Your answer must be fully self-contained and understandable on its own. If the context references a standard (e.g., "criteria A per JIS C 61000"), a performance level, or a classification, you MUST explain what that standard/criteria/level actually means and requires in practical terms. Never assume the user knows what "Performance criteria A" or similar shorthand means — spell it out completely.
- If the context does not contain relevant information for the query, respond with: "NO_RELEVANT_INFO"
- Use **bold** for key terms.
- Do NOT include a SOURCES section — just provide the answer content.

{source_label} Context:
{{context}}"""

        messages = [("system", system_prompt)]
        
        if history:
            recent_history = history[-6:]
            for m in recent_history:
                role = "human" if m["role"] == "user" else "ai"
                messages.append((role, m["content"]))
        
        messages.append(("human", "{query}"))
        
        prompt = ChatPromptTemplate.from_messages(messages)
        chain = prompt | self.llm
        res = chain.invoke({"query": query, "context": context})
        return res.content

    def synthesize_responses(self, query: str, kb_answer: str, doc_answer: str, kb_context_refs: str, doc_context_refs: str):
        """Synthesize KB and DOC answers into a single, well-attributed response."""
        system_prompt = """You are a compliance assistant for SkyElectric. You have received two separate analyses of the same query — one from the verified Knowledge Base (KB) and one from a user-uploaded Document (DOC).

YOUR TASK: Combine both analyses into a single, comprehensive response.

SYNTHESIS RULES:
1. **Merge intelligently** — do not simply concatenate. Weave information from both sources into a coherent answer.
2. **KB provides authority** — when KB and DOC agree, lead with KB content. When they differ, present both perspectives.
3. **DOC provides user context** — the uploaded document may contain questions, project-specific details, or site data. Always acknowledge this content.
4. **Citation format**:
   - Mark information from Knowledge Base as [KB]
   - Mark information from uploaded Document as [DOC]
   - Use these inline in your response
5. **If one source returned "NO_RELEVANT_INFO"**, use the other source's answer as the primary response and note the gap.
6. NEVER say "Based on the KB answer" or "Based on the DOC answer" — write as if you are the single authoritative source.
7. Use **bold** for key terms and numbered lists for multiple items.

MANDATORY: End your response with a SOURCES section listing the reference details provided below.

KB Source References:
{kb_refs}

DOC Source References:
{doc_refs}

SOURCES FORMAT:
SOURCES:
- [KB] File: filename | Clause: ID | Page: #
- [DOC] File: filename | Clause: ID | Page: #

---

KB ANALYSIS:
{kb_answer}

DOC ANALYSIS:
{doc_answer}"""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "{query}")
        ])
        chain = prompt | self.llm
        res = chain.invoke({
            "query": query,
            "kb_answer": kb_answer,
            "doc_answer": doc_answer,
            "kb_refs": kb_context_refs,
            "doc_refs": doc_context_refs
        })
        return res.content

    def answer_general_question(self, query: str, context: str, history: List[Dict] = None, uploaded_doc_names: List[str] = None):
        system_prompt = """You are a helpful compliance assistant for SkyElectric.

TASK 1: INTENT DETECTION
- If the user says "hi", "hello", or general greetings, respond with a BRIEF, friendly greeting.
- If the user asks a question, PROVIDE DIRECT ANSWERS IMMEDIATELY.

STRICT CONSTRAINTS:
- NEVER say "I will proceed to answer", "I will now answer", "I am ready to provide the answers", or similar planning phrases.
- NEVER list questions without providing their answers in the SAME message.
- NEVER ask the user to "specify which questions" or "which document" — if you have document context, USE IT IMMEDIATELY.
- NEVER say "I have access to the following documents" and then list them without answering. Just ANSWER.
- You have full memory of this conversation. Use previous messages to maintain continuity and context.

CRITICAL BEHAVIORAL RULE — ANSWERING DOCUMENT QUESTIONS:
When a user uploads a document that contains questions (like a test plan, questionnaire, or exam) and asks you to "answer the questions", you MUST:
1. Read each question found in the document context
2. IMMEDIATELY provide a detailed, substantive answer for EACH question using the Knowledge Base context AND your internal expertise
3. Number your answers to match the questions
4. DO NOT simply list the questions — ANSWER THEM with real content
5. Use [KB] and [DOC] citations where applicable
If there are many questions, answer ALL of them. Do not summarize or defer.

SOURCE PRIORITY & ATTRIBUTION:
1. **Knowledge Base [KB] is AUTHORITATIVE**: KB contains verified compliance and regulatory data. Use KB sources to provide authoritative, verified answers.
2. **Uploaded Documents [DOC] provide USER CONTEXT**: DOC sources contain the user's uploaded content — questions, project details, site-specific data. ALWAYS reference DOC when quoting or paraphrasing the user's uploaded content.
3. **Use BOTH together**: When both KB and DOC context is available, use KB content for authoritative answers AND cite DOC for the user's specific content. For example, if a DOC contains questions, cite the question source as [DOC n] and the answer substance from KB as [KB n].
4. **If ONLY [DOC] sources match**, still answer using DOC content but note it hasn't been verified against the Knowledge Base.
5. **Internal Knowledge**: Use your expertise for general concepts, but cite provided documents over unsourced claims.

CITATION RULES:
- Use BOTH [KB n] and [DOC n] citations where applicable — do not favor one exclusively over the other.
- Look at ALL the REF entries in the context below and use whichever are relevant.
- Assign ONE UNIQUE index per UNIQUE (File + Clause) pair.
- If you use content from a specific file/clause multiple times, use the same index throughout.

RESPONSE FORMAT:
1. Lead with the primary answer(s).
2. Use a numbered list for multiple answers.
3. Use **bold** for key terms.
4. **MANDATORY**: If you used ANY [KB n] or [DOC n] tags in your response, you MUST end with a SOURCES section.

SOURCES SECTION FORMAT (MANDATORY WHEN CITATIONS USED):
SOURCES:
- [KB] File: filename | Clause: ID | Page: #
- [DOC] File: filename | Clause: ID | Page: #
(List KB sources first, then DOC sources. Each unique filename/clause combo listed ONCE only)

Context:
{context}"""

        # Build proper multi-turn message list
        messages = [("system", system_prompt)]
        
        if history:
            # Include last 10 messages (roughly 5 conversation turns)
            recent_history = history[-10:]
            for m in recent_history:
                role = "human" if m["role"] == "user" else "ai"
                messages.append((role, m["content"]))
        
        messages.append(("human", "{query}"))
        
        prompt = ChatPromptTemplate.from_messages(messages)
        chain = prompt | self.llm
        res = chain.invoke({"query": query, "context": context})
        return res.content


# Global RAG instance
rag_engine = RAGEngine()
