from pypdf import PdfReader
from io import BytesIO
from typing import List, Dict
import re
from .models import store
from .rag import rag_engine

# Try to import python-docx
try:
    from docx import Document as DocxDocument
    DOCX_AVAILABLE = True
except ImportError:
    DOCX_AVAILABLE = False


def parse_xlsx(file_content: bytes, filename: str) -> List[Dict]:
    """Parse XLSX and extract clauses. Each row is treated as a context block."""
    if not XLSX_AVAILABLE:
        raise ImportError("openpyxl is not installed. Run: pip install openpyxl")
    
    wb = openpyxl.load_workbook(BytesIO(file_content), data_only=True)
    clauses = []
    
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        for row_idx, row in enumerate(sheet.iter_rows(values_only=True)):
            if not row:
                continue
            
            # Combine row values into a single string
            row_text = " | ".join([str(cell) for cell in row if cell is not None]).strip()
            
            if len(row_text) > 20:
                clauses.append({
                    "clause_id": f"{sheet_name}-R{row_idx+1}",
                    "text": row_text,
                    "page_number": 1,
                    "severity": "MUST" if any(word in row_text.lower() for word in ["shall", "must", "required"]) else "SHOULD"
                })
    
    return clauses


def parse_pdf(file_content: bytes, filename: str) -> List[Dict]:
    """Parse PDF and extract clauses."""
    reader = PdfReader(BytesIO(file_content))
    clauses = []
    
    # regex for clause-like patterns
    pattern = r'(?m)^(\d+\.[\d\.]+|[A-Z]\.[\d\.]+|Article\s+\d+:?)\s+(.*)'
    
    for page_num, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if not page_text:
            continue
        
        matches = list(re.finditer(pattern, page_text))
        
        if not matches:
            # Fallback: split by double newlines on this page
            paragraphs = page_text.split("\n\n")
            for i, p in enumerate(paragraphs):
                if len(p.strip()) > 20:
                    clauses.append({
                        "clause_id": f"P-{page_num}-{i}",
                        "text": p.strip(),
                        "page_number": page_num + 1,
                        "severity": "UNKNOWN"
                    })
        else:
            for i in range(len(matches)):
                start = matches[i].start()
                end = matches[i+1].start() if i + 1 < len(matches) else len(page_text)
                clause_id = matches[i].group(1).strip()
                text = page_text[start:end].strip()
                clauses.append({
                    "clause_id": clause_id,
                    "text": text,
                    "page_number": page_num + 1,
                    "severity": "MUST" if "shall" in text.lower() or "must" in text.lower() else "SHOULD"
                })
    
    return clauses


def parse_docx(file_content: bytes, filename: str) -> List[Dict]:
    """Parse DOCX and extract clauses."""
    if not DOCX_AVAILABLE:
        raise ImportError("python-docx is not installed. Run: pip install python-docx")
    
    doc = DocxDocument(BytesIO(file_content))
    clauses = []
    
    # regex for clause-like patterns
    pattern = r'^(\d+\.[\d\.]+|[A-Z]\.[\d\.]+|Article\s+\d+:?)\s+'
    
    current_text = []
    current_clause_id = None
    paragraph_counter = 0
    
    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue
        
        match = re.match(pattern, text)
        
        if match:
            # Save previous clause if exists
            if current_clause_id and current_text:
                full_text = "\n".join(current_text)
                clauses.append({
                    "clause_id": current_clause_id,
                    "text": full_text,
                    "page_number": 1,  # DOCX doesn't have reliable page numbers
                    "severity": "MUST" if "shall" in full_text.lower() or "must" in full_text.lower() else "SHOULD"
                })
            
            current_clause_id = match.group(1).strip()
            current_text = [text]
        elif current_clause_id:
            current_text.append(text)
        else:
            # No clause structure found, treat as paragraph
            if len(text) > 20:
                clauses.append({
                    "clause_id": f"Para-{paragraph_counter}",
                    "text": text,
                    "page_number": 1,
                    "severity": "UNKNOWN"
                })
                paragraph_counter += 1
    
    # Save last clause
    if current_clause_id and current_text:
        full_text = "\n".join(current_text)
        clauses.append({
            "clause_id": current_clause_id,
            "text": full_text,
            "page_number": 1,
            "severity": "MUST" if "shall" in full_text.lower() or "must" in full_text.lower() else "SHOULD"
        })
    
    return clauses


def parse_document(file_content: bytes, filename: str, file_type: str, version: str = "1.0", namespace: str = "session") -> int:
    """
    Parse a document (PDF, DOCX, or XLSX) and store in memory.
    Returns the document ID.
    """
    # Determine file type and parse
    filename_lower = filename.lower()
    
    if filename_lower.endswith('.pdf'):
        clauses = parse_pdf(file_content, filename)
    elif filename_lower.endswith('.docx'):
        clauses = parse_docx(file_content, filename)
    elif filename_lower.endswith('.xlsx'):
        clauses = parse_xlsx(file_content, filename)
    else:
        raise ValueError(f"Unsupported file type: {filename}")
    
    # Add document to in-memory store
    doc = store.add_document(filename=filename, file_type=file_type, version=version)
    
    # Add clauses to store and prepare for vector ingestion
    ingest_clauses = []
    for c in clauses:
        store.add_clause(
            document_id=doc.id,
            clause_id=c['clause_id'],
            text=c['text'],
            page_number=c['page_number'],
            severity=c['severity']
        )
        ingest_clauses.append({
            "status": "INGESTED", # Temporary placeholder
            "clause_id": c['clause_id'],
            "doc_id": doc.id,
            "doc_name": filename,  # Include filename for chat responses
            "text": c['text'],
            "page_number": c['page_number']
        })
    
    # Ingest all documents into Vector DB (not just regulations)
    # This enables chatting with any uploaded document
    if ingest_clauses:
        rag_engine.ingest_documents(ingest_clauses, namespace=namespace)
    
    return doc.id
