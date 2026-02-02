import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS
from langchain.prompts import ChatPromptTemplate
from typing import List, Dict

load_dotenv()

class RAGEngine:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings()
        self.llm = ChatOpenAI(model="gpt-4-turbo-preview", temperature=0)
        self.vector_store = None  # In-memory only, no persistence

    def ingest_documents(self, clauses: List[Dict]):
        """Ingest documents into in-memory FAISS index."""
        if not clauses:
            return None
            
        texts = [c['text'] for c in clauses]
        metadatas = [
            {
                "clause_id": c['clause_id'], 
                "doc_id": c['doc_id'],
                "doc_name": c.get('doc_name', 'Unknown'),  # Include document filename
                "page_number": c.get('page_number', 1)
            } 
            for c in clauses
        ]
        
        if self.vector_store is None:
            # Create new index
            self.vector_store = FAISS.from_texts(texts, self.embeddings, metadatas=metadatas)
        else:
            # Add to existing index
            self.vector_store.add_texts(texts, metadatas=metadatas)
        
        return self.vector_store

    def clear_index(self):
        """Clear the in-memory FAISS index."""
        self.vector_store = None

    def retrieve_similar_clauses(self, query_text: str, top_k: int = 5, doc_id: int = None):
        if self.vector_store is None:
            return []
            
        # We increase k because we might filter out some documents
        docs_with_scores = self.vector_store.similarity_search_with_score(query_text, k=top_k * 2)
        
        if doc_id:
            filtered_docs = [
                (doc, score) for doc, score in docs_with_scores 
                if doc.metadata.get('doc_id') == doc_id
            ]
            return filtered_docs[:top_k]
            
        return docs_with_scores[:top_k]

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
            # More robust JSON extraction
            content = res.content.strip()
            # Find the first { and last }
            start = content.find('{')
            end = content.rfind('}')
            
            if start != -1 and end != -1:
                content = content[start:end+1]
            
            data = json.loads(content)
            
            # Normalize keys to lowercase and map variants
            normalized = {}
            for k, v in data.items():
                key = str(k).lower().replace(" ", "_")
                normalized[key] = v
                
            # Map specific variants to expected keys
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
