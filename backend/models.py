"""
In-memory data store for temporary document storage.
Data is cleared when the server restarts.
"""
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class Document:
    id: int
    filename: str
    file_type: str  # 'regulation' or 'customer'
    version: str
    uploaded_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Clause:
    id: int
    document_id: int
    clause_id: str  # e.g., "A.5.1"
    text: str
    page_number: int
    severity: str  # "MUST", "SHOULD", etc.


@dataclass
class Assessment:
    id: int
    customer_doc_id: int
    regulation_doc_id: int
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class AssessmentResult:
    id: int
    assessment_id: int
    customer_clause_id: int
    regulation_clause_id: int
    status: str  # "COMPLIANT", "PARTIAL", "NON_COMPLIANT"
    risk: str  # "HIGH", "MEDIUM", "LOW"
    reasoning: str
    evidence_text: str
    confidence: float


@dataclass
class SessionData:
    documents: Dict[int, Document] = field(default_factory=dict)
    clauses: Dict[int, Clause] = field(default_factory=dict)
    assessments: Dict[int, Assessment] = field(default_factory=dict)
    assessment_results: Dict[int, AssessmentResult] = field(default_factory=dict)
    doc_counter: int = 0
    clause_counter: int = 0
    assessment_counter: int = 0
    result_counter: int = 0
    last_activity: datetime = field(default_factory=datetime.utcnow)

class InMemoryStore:
    """Thread-safe in-memory data store with multi-session support."""
    
    def __init__(self):
        self.sessions: Dict[str, SessionData] = {}
    
    def get_session(self, session_id: str) -> SessionData:
        if session_id not in self.sessions:
            print(f"DEBUG: Initializing new session: {session_id}")
            self.sessions[session_id] = SessionData()
        session = self.sessions[session_id]
        session.last_activity = datetime.utcnow()
        return session

    def reset(self, session_id: str = None):
        """Clear data for a specific session or all sessions."""
        if session_id:
            if session_id in self.sessions:
                print(f"DEBUG: Resetting session {session_id}")
                del self.sessions[session_id]
        else:
            print("DEBUG: Resetting all sessions")
            self.sessions = {}
    
    def update_activity(self, session_id: str):
        """Refresh last activity timestamp for a session."""
        if session_id in self.sessions:
            self.sessions[session_id].last_activity = datetime.utcnow()

    # Document operations
    def add_document(self, session_id: str, filename: str, file_type: str, version: str = "1.0") -> Document:
        s = self.get_session(session_id)
        s.doc_counter += 1
        doc = Document(
            id=s.doc_counter,
            filename=filename,
            file_type=file_type,
            version=version
        )
        s.documents[doc.id] = doc
        return doc
    
    def get_document(self, session_id: str, doc_id: int) -> Optional[Document]:
        return self.get_session(session_id).documents.get(doc_id)
    
    def get_all_documents(self, session_id: str) -> List[Document]:
        return list(self.get_session(session_id).documents.values())
    
    def delete_document(self, session_id: str, doc_id: int) -> bool:
        s = self.get_session(session_id)
        if doc_id not in s.documents:
            return False
        del s.documents[doc_id]
        # Delete related clauses
        clause_ids_to_delete = [c.id for c in s.clauses.values() if c.document_id == doc_id]
        for cid in clause_ids_to_delete:
            del s.clauses[cid]
        return True
    
    # Clause operations
    def add_clause(self, session_id: str, document_id: int, clause_id: str, text: str, 
                   page_number: int, severity: str) -> Clause:
        s = self.get_session(session_id)
        s.clause_counter += 1
        clause = Clause(
            id=s.clause_counter,
            document_id=document_id,
            clause_id=clause_id,
            text=text,
            page_number=page_number,
            severity=severity
        )
        s.clauses[clause.id] = clause
        return clause
    
    def get_clause(self, session_id: str, clause_id: int) -> Optional[Clause]:
        return self.get_session(session_id).clauses.get(clause_id)
    
    def get_clauses_by_document(self, session_id: str, doc_id: int) -> List[Clause]:
        return [c for c in self.get_session(session_id).clauses.values() if c.document_id == doc_id]
    
    def get_clause_by_doc_and_clause_id(self, session_id: str, doc_id: int, clause_id_str: str) -> Optional[Clause]:
        for c in self.get_session(session_id).clauses.values():
            if c.document_id == doc_id and c.clause_id == clause_id_str:
                return c
        return None
    
    # Assessment operations
    def add_assessment(self, session_id: str, customer_doc_id: int, regulation_doc_id: int) -> Assessment:
        s = self.get_session(session_id)
        s.assessment_counter += 1
        assessment = Assessment(
            id=s.assessment_counter,
            customer_doc_id=customer_doc_id,
            regulation_doc_id=regulation_doc_id
        )
        s.assessments[assessment.id] = assessment
        return assessment
    
    def get_assessment(self, session_id: str, assessment_id: int) -> Optional[Assessment]:
        return self.get_session(session_id).assessments.get(assessment_id)
    
    def get_assessments_by_doc(self, session_id: str, doc_id: int) -> List[Assessment]:
        return [a for a in self.get_session(session_id).assessments.values() 
                if a.customer_doc_id == doc_id or a.regulation_doc_id == doc_id]
    
    # Assessment result operations
    def add_result(self, session_id: str, assessment_id: int, customer_clause_id: int, 
                   regulation_clause_id: int, status: str, risk: str,
                   reasoning: str, evidence_text: str, confidence: float) -> AssessmentResult:
        s = self.get_session(session_id)
        s.result_counter += 1
        result = AssessmentResult(
            id=s.result_counter,
            assessment_id=assessment_id,
            customer_clause_id=customer_clause_id,
            regulation_clause_id=regulation_clause_id,
            status=status,
            risk=risk,
            reasoning=reasoning,
            evidence_text=evidence_text,
            confidence=confidence
        )
        s.assessment_results[result.id] = result
        return result
    
    def get_results_by_assessment(self, session_id: str, assessment_id: int) -> List[AssessmentResult]:
        return [r for r in self.get_session(session_id).assessment_results.values() if r.assessment_id == assessment_id]
    
    def delete_results_by_assessment(self, session_id: str, assessment_id: int):
        s = self.get_session(session_id)
        result_ids = [r.id for r in s.assessment_results.values() if r.assessment_id == assessment_id]
        for rid in result_ids:
            del s.assessment_results[rid]

    def delete_assessment(self, session_id: str, assessment_id: int):
        self.delete_results_by_assessment(session_id, assessment_id)
        s = self.get_session(session_id)
        if assessment_id in s.assessments:
            del s.assessments[assessment_id]


# Global in-memory store instance
store = InMemoryStore()
