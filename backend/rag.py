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
        self.embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001")
        self.llm = ChatGoogleGenerativeAI(model="models/gemini-2.0-flash-lite", temperature=0)
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

    def ingest_documents(self, clauses: List[Dict], namespace: str = "session"):
        """Ingest documents into vector store."""
        if not clauses:
            return None
            
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

    def clear_index(self, namespace: str = "session"):
        """Clear a specific namespace in the vector index."""
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

    def retrieve_similar_clauses(self, query_text: str, top_k: int = 5, doc_id: int = None, use_kb: bool = False):
        if self.vector_store is None:
            return []
            
        namespaces = ["session"]
        if use_kb:
            namespaces.append("permanent")
            
        all_results = []
        
        if self.use_pinecone:
            # Search across specified namespaces
            for ns in namespaces:
                try:
                    results = self.vector_store.similarity_search_with_score(
                        query_text, 
                        k=top_k * 2, 
                        namespace=ns
                    )
                    all_results.extend(results)
                except Exception as e:
                    print(f"DEBUG: Pinecone search error in namespace {ns}: {e}")
            
            # Re-sort combined results by score (descending for similarity, but score is usually distance)
            # Pinecone score in similarity_search_with_score is usually similarity (higher is better)
            all_results.sort(key=lambda x: x[1], reverse=True)
        else:
            # FAISS search
            all_results = self.vector_store.similarity_search_with_score(query_text, k=top_k * 2)
        
        if doc_id:
            filtered_docs = [
                (doc, score) for doc, score in all_results 
                if doc.metadata.get('doc_id') == str(doc_id)
            ]
            return filtered_docs[:top_k]
            
        return all_results[:top_k]

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

    def answer_general_question(self, query: str, context: str):
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a helpful compliance assistant with multilingual capabilities. 
            Answer the user's question accurately based ON THE PROVIDED document context.
            
            CITATION STYLE (IMPORTANT):
            1. Use numerical citations in your text, e.g., "The network must support 10kV [1]."
            2. At the very end of your response, list your sources in a "SOURCES" section.
            3. Each source should look like: "[1] File: filename.pdf | Clause: A.1 | Page: 5"
            4. This keeps the main response clean while providing full traceability at the bottom.
            
            MULTILINGUAL RULES:
            1. If the document context is in a language other than the user's query, translate the relevant information automatically.
            2. Even if the context is technical (numbers, section titles), explain what those sections represent.
            3. NEVER say "no information available in English" if there is information in ANY language. Translate it!
            
            Context:
            {context}"""),
            ("user", "{query}")
        ])
        
        chain = prompt | self.llm
        res = chain.invoke({"query": query, "context": context})
        return res.content


# Global RAG instance
rag_engine = RAGEngine()
