import os
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from contextlib import asynccontextmanager
from .models import SessionLocal, init_db, Document, Clause, Assessment, AssessmentResult
from .ingestion import parse_pdf
from .rag import rag_engine
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import io

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="3D Compliance Intelligence API", lifespan=lifespan)

# CORS setup for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...), # 'regulation' | 'customer'
    version: str = Form("1.0"),
    db: Session = Depends(get_db)
):
    content = await file.read()
    doc_id = parse_pdf(content, file.filename, file_type, version)
    return {"doc_id": doc_id, "filename": file.filename}

@app.get("/documents")
def list_documents(db: Session = Depends(get_db)):
    return db.query(Document).all()

@app.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # 1. Find all assessments involving this document
    assessments = db.query(Assessment).filter(
        (Assessment.customer_doc_id == doc_id) | 
        (Assessment.regulation_doc_id == doc_id)
    ).all()
    
    for a in assessments:
        # 2. Delete all results for these assessments
        db.query(AssessmentResult).filter(AssessmentResult.assessment_id == a.id).delete()
        db.delete(a)
    
    # 3. Delete clauses for this document
    db.query(Clause).filter(Clause.document_id == doc_id).delete()
    
    # 4. Finally delete the document
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}

@app.post("/reset")
def reset_data(db: Session = Depends(get_db)):
    db.query(AssessmentResult).delete()
    db.query(Assessment).delete()
    db.query(Clause).delete()
    db.query(Document).delete()
    db.commit()
    # Also clear FAISS index
    import shutil
    if os.path.exists("backend/data/faiss_index"):
        shutil.rmtree("backend/data/faiss_index")
    return {"message": "All data cleared"}

@app.post("/assess")
async def assess_compliance(
    customer_doc_id: int,
    regulation_doc_id: int,
    db: Session = Depends(get_db)
):
    customer_clauses = db.query(Clause).filter(Clause.document_id == customer_doc_id).all()
    
    assessment = Assessment(customer_doc_id=customer_doc_id, regulation_doc_id=regulation_doc_id)
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    
    results = []
    for c_clause in customer_clauses:
        # Retrieve similar regulation clauses
        similar_docs = rag_engine.retrieve_similar_clauses(c_clause.text, doc_id=regulation_doc_id)
        
        if not similar_docs:
            continue
            
        best_match_doc, score = similar_docs[0]
        reg_clause_id_val = best_match_doc.metadata['clause_id']
        reg_clause = db.query(Clause).filter(
            Clause.document_id == regulation_doc_id, 
            Clause.clause_id == reg_clause_id_val
        ).first()
        
        if not reg_clause:
            continue
            
        # Run LLM Analysis
        analysis = rag_engine.analyze_compliance(c_clause.text, reg_clause.text)
        
        res = AssessmentResult(
            assessment_id=assessment.id,
            customer_clause_id=c_clause.id,
            regulation_clause_id=reg_clause.id,
            status=analysis['status'],
            risk=analysis['risk'],
            reasoning=analysis['reasoning'],
            evidence_text=analysis.get('evidence_text', 'N/A'),
            confidence=analysis['confidence']
        )
        db.add(res)
        results.append(res)
        
    db.commit()
    return {"assessment_id": assessment.id, "results_count": len(results)}

@app.get("/graph/{assessment_id}")
def get_graph_data(assessment_id: int, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).get(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    results = db.query(AssessmentResult).filter(AssessmentResult.assessment_id == assessment_id).all()
    
    nodes = []
    edges = []
    
    # Add regulation nodes (planets)
    reg_clauses = db.query(Clause).filter(Clause.document_id == assessment.regulation_doc_id).all()
    for rc in reg_clauses:
        nodes.append({
            "id": f"reg_{rc.id}",
            "label": rc.clause_id,
            "type": "regulation",
            "page": rc.page_number,
            "text": rc.text[:100] + "..."
        })
        
    # Add customer nodes and edges
    for r in results:
        cust_clause = db.query(Clause).get(r.customer_clause_id)
        nodes.append({
            "id": f"cust_{r.customer_clause_id}",
            "label": cust_clause.clause_id if cust_clause else str(r.customer_clause_id),
            "type": "customer",
            "status": r.status,
            "risk": r.risk,
            "page": cust_clause.page_number if cust_clause else None,
            "reasoning": r.reasoning,
            "evidence": r.evidence_text
        })
        edges.append({
            "from": f"cust_{r.customer_clause_id}",
            "to": f"reg_{r.regulation_clause_id}",
            "status": r.status
        })
        
    return {"nodes": nodes, "edges": edges}

@app.get("/report/{assessment_id}")
def generate_report(assessment_id: int, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).get(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    results = db.query(AssessmentResult).filter(AssessmentResult.assessment_id == assessment_id).all()
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    elements.append(Paragraph(f"Compliance Assessment Report", styles['Title']))
    elements.append(Spacer(1, 12))
    
    # Header info
    customer_doc = db.query(Document).get(assessment.customer_doc_id)
    reg_doc = db.query(Document).get(assessment.regulation_doc_id)
    
    elements.append(Paragraph(f"Customer Document: {customer_doc.filename}", styles['Normal']))
    elements.append(Paragraph(f"Regulation Document: {reg_doc.filename}", styles['Normal']))
    elements.append(Paragraph(f"Date: {assessment.created_at.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    elements.append(Spacer(1, 24))
    
    # Table data
    data = [["Clause ID", "Status", "Risk", "Reasoning"]]
    for r in results:
        cust_clause = db.query(Clause).get(r.customer_clause_id)
        # Truncate reasoning for table
        reasoning = r.reasoning
        data.append([
            cust_clause.clause_id if cust_clause else f"Clause {r.customer_clause_id}",
            r.status,
            r.risk,
            Paragraph(reasoning, styles['Normal'])
        ])
    
    table = Table(data, colWidths=[80, 80, 60, 280])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#6366f1")),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    
    elements.append(table)
    doc.build(elements)
    
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f"attachment; filename=compliance_report_{assessment_id}.pdf"
    })

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
