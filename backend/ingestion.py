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
    """Parse PDF and extract clauses + table data."""
    reader = PdfReader(BytesIO(file_content))
    clauses = []
    
    # regex for clause-like patterns
    pattern = r'(?m)^(\d+\.[\d\.]+|[A-Z]\.[\d\.]+|Article\s+\d+:?)\s+(.*)'
    
    # --- Extract tables using pdfplumber ---
    try:
        import pdfplumber
        pdf_plumber = pdfplumber.open(BytesIO(file_content))
        
        for page_num, page in enumerate(pdf_plumber.pages):
            tables = page.extract_tables()
            for t_idx, table in enumerate(tables):
                if not table or len(table) < 2:
                    continue
                
                # Convert table to markdown-style text
                # First row as headers
                headers = [str(cell).strip() if cell else "" for cell in table[0]]
                table_lines = [" | ".join(headers)]
                table_lines.append(" | ".join(["---"] * len(headers)))
                
                for row in table[1:]:
                    cells = [str(cell).strip() if cell else "" for cell in row]
                    table_lines.append(" | ".join(cells))
                
                table_text = "\n".join(table_lines)
                
                if len(table_text.strip()) > 30:
                    # Try to find a table caption/title from nearby text
                    page_text = page.extract_text() or ""
                    # Look for "Table X.Y.Z" references near this table
                    table_ref_match = re.search(r'(Table\s+[\d\.]+[-\d]*)', page_text)
                    table_label = table_ref_match.group(1) if table_ref_match else f"Table-P{page_num+1}-T{t_idx+1}"
                    
                    clauses.append({
                        "clause_id": f"TBL-{page_num+1}-{t_idx+1}",
                        "text": f"{table_label}:\n{table_text}",
                        "page_number": page_num + 1,
                        "severity": "DATA"
                    })
        
        pdf_plumber.close()
        print(f"DEBUG: Extracted {sum(1 for c in clauses if c['clause_id'].startswith('TBL'))} tables from {filename}")
    except Exception as e:
        print(f"DEBUG: pdfplumber table extraction failed for {filename}: {e}")
    
    # --- Extract regular text using pypdf ---
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


def chunk_text(text: str, chunk_size: int = 800, chunk_overlap: int = 150) -> List[str]:
    """Simple character-based chunking as a proxy for token-based chunking."""
    if not text:
        return []
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
        
    return chunks


def parse_document(file_content: bytes, filename: str, file_type: str, version: str = "1.0", namespace: str = None, session_id: str = None) -> int:
    """
    Parse a document (PDF, DOCX, or XLSX) and store in memory.
    Returns the document ID.
    """
    # Determine file type and parse
    filename_lower = filename.lower()
    
    raw_clauses = []
    if filename_lower.endswith('.pdf'):
        raw_clauses = parse_pdf(file_content, filename)
    elif filename_lower.endswith('.docx'):
        raw_clauses = parse_docx(file_content, filename)
    elif filename_lower.endswith('.xlsx'):
        raw_clauses = parse_xlsx(file_content, filename)
    else:
        raise ValueError(f"Unsupported file type: {filename}")
    
    # Add document to in-memory store
    doc = store.add_document(session_id=session_id, filename=filename, file_type=file_type, version=version)
    
    ingest_clauses = []
    
    # Process structured clauses if found, or chunk the whole thing if not
    for c in raw_clauses:
        # Add to structured store
        store.add_clause(
            session_id=session_id,
            document_id=doc.id,
            clause_id=c['clause_id'],
            text=c['text'],
            page_number=c['page_number'],
            severity=c['severity']
        )
        
        # If clause text is very long, we further chunk it for vector store compatibility
        if len(c['text']) > 2500:
            sub_chunks = chunk_text(c['text'])
            for i, sub_text in enumerate(sub_chunks):
                ingest_clauses.append({
                    "clause_id": f"{c['clause_id']}-part{i+1}",
                    "doc_id": doc.id,
                    "doc_name": filename,
                    "text": sub_text,
                    "page_number": c['page_number']
                })
        else:
            ingest_clauses.append({
                "clause_id": c['clause_id'],
                "doc_id": doc.id,
                "doc_name": filename,
                "text": c['text'],
                "page_number": c['page_number']
            })
    
    # Ingest into Vector DB
    chunk_count = len(ingest_clauses)
    if ingest_clauses:
        rag_engine.ingest_documents(ingest_clauses, session_id=session_id, namespace=namespace)
    
    return doc.id, chunk_count
