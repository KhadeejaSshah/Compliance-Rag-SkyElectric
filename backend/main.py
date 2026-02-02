import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .models import store, Document, Clause, Assessment, AssessmentResult
from .ingestion import parse_document
from .rag import rag_engine
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from langchain_community.vectorstores import FAISS
import io

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Clear any existing data on startup (fresh session)
    store.reset()
    rag_engine.clear_index()
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

ALLOWED_EXTENSIONS = {'.pdf', '.docx'}

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),  # 'regulation' | 'customer'
    version: str = Form("1.0"),
):
    # Check file extension
    filename_lower = file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400, 
            detail=f"Only {', '.join(ALLOWED_EXTENSIONS)} files are supported."
        )
    
    print(f"DEBUG: Uploading {file.filename} as {file_type}")
    content = await file.read()
    doc_id = parse_document(content, file.filename, file_type, version)
    print(f"DEBUG: Uploaded {file.filename}, doc_id: {doc_id}")
    return {"doc_id": doc_id, "filename": file.filename}

@app.get("/documents")
def list_documents():
    docs = store.get_all_documents()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "file_type": d.file_type,
            "version": d.version,
            "uploaded_at": d.uploaded_at.isoformat()
        }
        for d in docs
    ]

@app.delete("/documents/{doc_id}")
def delete_document(doc_id: int):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete related assessments
    assessments = store.get_assessments_by_doc(doc_id)
    for a in assessments:
        store.delete_assessment(a.id)
    
    # Delete document and its clauses
    store.delete_document(doc_id)
    
    return {"message": "Document deleted"}

@app.patch("/documents/{doc_id}/type")
def update_document_type(doc_id: int, file_type: str = Form(...)):
    doc = store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if file_type not in ["regulation", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    doc.file_type = file_type
    return {"message": "Document type updated", "file_type": file_type}

@app.post("/reset")
def reset_data():
    store.reset()
    rag_engine.clear_index()
    return {"message": "All data cleared"}

@app.post("/assess")
async def assess_compliance(
    customer_doc_id: int,
    regulation_doc_id: int,
):
    print(f"DEBUG: Assessing compliance. Customer Doc: {customer_doc_id}, Reg Doc: {regulation_doc_id}")
    customer_clauses = store.get_clauses_by_document(customer_doc_id)
    print(f"DEBUG: Found {len(customer_clauses)} clauses in customer doc")
    
    if not customer_clauses:
        print(f"DEBUG: FAILURE - No clauses for customer doc {customer_doc_id}")
        raise HTTPException(status_code=400, detail="No clauses found in customer document")
    
    assessment = store.add_assessment(
        customer_doc_id=customer_doc_id, 
        regulation_doc_id=regulation_doc_id
    )
    
    import asyncio
    semaphore = asyncio.Semaphore(10)
    
    async def process_clause(c_clause):
        async with semaphore:
            # Retrieve similar regulation clauses
            similar_docs = rag_engine.retrieve_similar_clauses(c_clause.text, doc_id=regulation_doc_id)
            
            if not similar_docs:
                return None
                
            best_match_doc, score = similar_docs[0]
            reg_clause_id_val = best_match_doc.metadata['clause_id']
            reg_clause = store.get_clause_by_doc_and_clause_id(regulation_doc_id, reg_clause_id_val)
            
            if not reg_clause:
                return None
                
            # Run LLM Analysis
            analysis = await rag_engine.analyze_compliance(c_clause.text, reg_clause.text)
            
            # Defensive logging
            if not isinstance(analysis, dict) or 'status' not in analysis:
                print(f"DEBUG: CRITICAL ERROR - Analysis returned invalid object: {analysis}")
            
            try:
                return store.add_result(
                    assessment_id=assessment.id,
                    customer_clause_id=c_clause.id,
                    regulation_clause_id=reg_clause.id,
                    status=analysis.get('status', 'UNKNOWN'),
                    risk=analysis.get('risk', 'HIGH'),
                    reasoning=analysis.get('reasoning', 'Analysis failed'),
                    evidence_text=analysis.get('evidence_text', 'N/A'),
                    confidence=analysis.get('confidence', 0.0)
                )
            except Exception as e:
                print(f"DEBUG: Error adding result to store: {e}")
                print(f"DEBUG: Analysis was: {analysis}")
                return None

    # Process all clauses in parallel with concurrency limit
    results_raw = await asyncio.gather(*[process_clause(c) for c in customer_clauses])
    results = [r for r in results_raw if r is not None]
        
    return {"assessment_id": assessment.id, "results_count": len(results)}

@app.get("/debug/vector-store")
def debug_vector_store():
    info = {
        "vector_store_exists": rag_engine.vector_store is not None,
        "total_documents": len(store.documents),
        "total_clauses": len(store.clauses),
    }
    
    if rag_engine.vector_store is not None:
        try:
            info["vector_store_size"] = len(rag_engine.vector_store.docstore._dict)
        except Exception as e:
            info["vector_store_error"] = str(e)
    
    return info

@app.post("/chat")
async def chat_with_docs(
    query: str = Form(...),
):
    # Search across all documents for the most relevant context
    similar_docs = rag_engine.retrieve_similar_clauses(query, top_k=5)
    
    if not similar_docs:
        return {"answer": "I couldn't find any relevant information in your documents. Please upload some documents first."}
    
    # Build context with document NAME (not just ID), numbered for citation mapping
    context_parts = []
    for i, (d, score) in enumerate(similar_docs, 1):
        doc_obj = store.get_document(d.metadata.get('doc_id'))
        doc_name = doc_obj.filename if doc_obj else 'Unknown Document'
        clause_id = d.metadata.get('clause_id', 'N/A')
        page = d.metadata.get('page_number', 'N/A')
        context_parts.append(
            f"REF [{i}]:\n"
            f"File: {doc_name} | Clause: {clause_id} | Page: {page}\n"
            f"Content: {d.page_content}"
        )
    
    context = "\n\n---\n\n".join(context_parts)
    
    # Use LLM to answer the question based on context
    answer = rag_engine.answer_general_question(query, context)
    return {"answer": answer}

@app.get("/graph/{assessment_id}")
def get_graph_data(assessment_id: int):
    assessment = store.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    results = store.get_results_by_assessment(assessment_id)
    
    nodes = []
    edges = []
    
    # Add regulation nodes (planets)
    reg_clauses = store.get_clauses_by_document(assessment.regulation_doc_id)
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
        cust_clause = store.get_clause(r.customer_clause_id)
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
def generate_report(assessment_id: int):
    assessment = store.get_assessment(assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    results = store.get_results_by_assessment(assessment_id)
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    elements.append(Paragraph(f"SkyCompliance™ Engineering Report", styles['Title']))
    elements.append(Spacer(1, 12))
    
    # Header info
    customer_doc = store.get_document(assessment.customer_doc_id)
    reg_doc = store.get_document(assessment.regulation_doc_id)
    
    elements.append(Paragraph(f"Project Document: {customer_doc.filename if customer_doc else 'N/A'}", styles['Normal']))
    elements.append(Paragraph(f"Regulatory Standard: {reg_doc.filename if reg_doc else 'N/A'}", styles['Normal']))
    elements.append(Paragraph(f"Date: {assessment.created_at.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    elements.append(Spacer(1, 24))
    
    # Table data
    data = [["Clause ID", "Status", "Risk", "Reasoning"]]
    for r in results:
        cust_clause = store.get_clause(r.customer_clause_id)
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
