from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from .models import store, Document, Clause, Assessment, AssessmentResult
from .ingestion import parse_document
from .rag import rag_engine
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import io
import os
import asyncio
from datetime import datetime, timedelta
from fastapi.responses import FileResponse
import shutil

# Ensure storage directory exists
STORAGE_DIR = "backend/storage"
os.makedirs(STORAGE_DIR, exist_ok=True)

async def session_cleanup_task():
    """Background task to clear inactive sessions after 15 minutes."""
    while True:
        try:
            await asyncio.sleep(60)  # Check every minute
            now = datetime.utcnow()
            sessions_to_purge = []
            
            for session_id, session_data in store.sessions.items():
                if now - session_data.last_activity > timedelta(minutes=15):
                    sessions_to_purge.append(session_id)
            
            for session_id in sessions_to_purge:
                print(f"DEBUG: Purging inactive session: {session_id}")
                # Clear from RAG (Pinecone)
                rag_engine.clear_index(session_id=session_id)
                # Clear from memory
                store.reset(session_id=session_id)
                
                # Optionally delete physical files for this session
                # (Files are prefixed with {doc_id}_ but we don't easily know session_id from filename)
                # For now, we'll keep the storage cleanup simple or rely on a separate script.
                
        except Exception as e:
            print(f"DEBUG: Session cleanup error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # List KB documents on startup
    try:
        if rag_engine.use_pinecone:
            from pinecone import Pinecone
            pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
            index = pc.Index(rag_engine.index_name)
            stats = index.describe_index_stats()
            permanent_ns = stats.get('namespaces', {}).get('permanent', {})
            vector_count = permanent_ns.get('vector_count', 0)
            print(f"\n{'='*60}")
            print(f"  KNOWLEDGE BASE: {vector_count} vectors in 'permanent' namespace")
            
            # Sample a few vectors to list doc names
            if vector_count > 0:
                try:
                    # Use a dummy query to fetch some KB docs and extract unique filenames
                    sample_results = rag_engine.vector_store.similarity_search(
                        "compliance regulation standard", k=min(50, vector_count), namespace="permanent"
                    )
                    doc_names = set()
                    for doc in sample_results:
                        name = doc.metadata.get('doc_name', doc.metadata.get('source', 'Unknown'))
                        doc_names.add(name)
                    print(f"  Documents found ({len(doc_names)} unique):")
                    for name in sorted(doc_names):
                        print(f"    📄 {name}")
                except Exception as e:
                    print(f"  (Could not list doc names: {e})")
            
            # List all namespaces
            print(f"  All namespaces: {list(stats.get('namespaces', {}).keys())}")
            print(f"{'='*60}\n")
    except Exception as e:
        print(f"DEBUG: KB listing failed: {e}")
    
    # Start cleanup task
    cleanup_task = asyncio.create_task(session_cleanup_task())
    yield
    cleanup_task.cancel()

app = FastAPI(title="3D Compliance Intelligence API", lifespan=lifespan)

# Dependency to get session ID
def get_sid(x_session_id: str = Header("default")):
    return x_session_id

# CORS setup for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.xlsx'}

@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),  # 'regulation' | 'customer'
    version: str = Form("1.0"),
    namespace: str = Form(None),
    session_id: str = Depends(get_sid)
):
    # Check file extension
    filename_lower = file.filename.lower()
    if not any(filename_lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=400, 
            detail=f"Only {', '.join(ALLOWED_EXTENSIONS)} files are supported."
        )
    
    print(f"DEBUG: Uploading {file.filename} as {file_type} to session {session_id}")
    content = await file.read()
    doc_id, chunk_count = parse_document(content, file.filename, file_type, version, namespace=namespace, session_id=session_id)
    
    # Save the file to physical storage
    file_path = os.path.join(STORAGE_DIR, f"{doc_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)
        
    print(f"DEBUG: Uploaded {file.filename}, doc_id: {doc_id}, chunks: {chunk_count} in session {session_id}")
    return {"doc_id": doc_id, "filename": file.filename, "chunk_count": chunk_count}

@app.get("/documents/{doc_id}/download")
def download_document(doc_id: int, session_id: str = Depends(get_sid)):
    doc = store.get_document(session_id, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Find the file in storage
    # We prefix with doc_id_ to avoid name collisions
    file_path = None
    for f in os.listdir(STORAGE_DIR):
        if f.startswith(f"{doc_id}_"):
            file_path = os.path.join(STORAGE_DIR, f)
            break
            
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found in storage")
        
    return FileResponse(file_path, filename=doc.filename)

@app.get("/documents")
def list_documents(session_id: str = Depends(get_sid)):
    docs = store.get_all_documents(session_id)
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
def delete_document(doc_id: int, session_id: str = Depends(get_sid)):
    doc = store.get_document(session_id, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Delete related assessments
    assessments = store.get_assessments_by_doc(session_id, doc_id)
    for a in assessments:
        store.delete_assessment(session_id, a.id)
    
    # Delete document and its clauses
    store.delete_document(session_id, doc_id)
    
    return {"message": "Document deleted"}

@app.patch("/documents/{doc_id}/type")
def update_document_type(doc_id: int, file_type: str = Form(...), session_id: str = Depends(get_sid)):
    doc = store.get_document(session_id, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if file_type not in ["regulation", "customer"]:
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    doc.file_type = file_type
    return {"message": "Document type updated", "file_type": file_type}

@app.post("/reset")
def reset_data(session_id: str = Depends(get_sid)):
    store.reset(session_id)
    rag_engine.clear_index(session_id=session_id)
    return {"message": f"Data cleared for session {session_id}"}

@app.post("/assess")
async def assess_compliance(
    customer_doc_id: int = Form(...),
    regulation_doc_id: int = Form(...),
    use_kb: bool = Form(False),
    session_id: str = Depends(get_sid)
):
    print(f"DEBUG: Assessing compliance for session {session_id}. Customer Doc: {customer_doc_id}, Reg Doc: {regulation_doc_id}")
    customer_clauses = store.get_clauses_by_document(session_id, customer_doc_id)
    print(f"DEBUG: Found {len(customer_clauses)} clauses in customer doc")
    
    if not customer_clauses:
        print(f"DEBUG: FAILURE - No clauses for customer doc {customer_doc_id}")
        raise HTTPException(status_code=400, detail="No clauses found in customer document")
    
    assessment = store.add_assessment(
        session_id=session_id,
        customer_doc_id=customer_doc_id, 
        regulation_doc_id=regulation_doc_id
    )
    
    import asyncio
    semaphore = asyncio.Semaphore(10)
    
    async def process_clause(c_clause):
        async with semaphore:
            # Retrieve similar regulation clauses
            similar_docs = rag_engine.retrieve_similar_clauses(c_clause.text, doc_id=regulation_doc_id, use_kb=use_kb, session_id=session_id)
            
            if not similar_docs:
                return None
                
            best_match_doc, score = similar_docs[0]
            reg_clause_id_val = best_match_doc.metadata['clause_id']
            reg_clause = store.get_clause_by_doc_and_clause_id(session_id, regulation_doc_id, reg_clause_id_val)
            
            if not reg_clause:
                return None
                
            # Run LLM Analysis
            analysis = await rag_engine.analyze_compliance(c_clause.text, reg_clause.text)
            
            # Defensive logging
            if not isinstance(analysis, dict) or 'status' not in analysis:
                print(f"DEBUG: CRITICAL ERROR - Analysis returned invalid object: {analysis}")
            
            try:
                return store.add_result(
                    session_id=session_id,
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

@app.get("/debug/namespaces")
async def debug_namespaces():
    """Diagnostic endpoint to check Pinecone namespaces."""
    if not rag_engine.use_pinecone:
        return {"error": "Pinecone is not enabled"}
    
    try:
        from pinecone import Pinecone
        pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        index = pc.Index(rag_engine.index_name)
        stats = index.describe_index_stats()
        return {
            "index_name": rag_engine.index_name,
            "namespaces": stats.to_dict().get('namespaces', {}),
            "total_vector_count": stats.get('total_vector_count', 0)
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/debug/vector-store")
def debug_vector_store(session_id: str = Depends(get_sid)):
    info = {
        "vector_store_exists": rag_engine.vector_store is not None,
        "total_documents": len(store.get_session(session_id).documents),
        "total_clauses": len(store.get_session(session_id).clauses),
        "session_id": session_id
    }
    
    if rag_engine.vector_store is not None:
        try:
            # Note: This is a hacky way to check size, might not be accurate for Pinecone
            info["vector_store_size"] = "Dynamic (Pinecone)"
        except Exception as e:
            info["vector_store_error"] = str(e)
    
    return info

@app.post("/chat")
async def chat_with_docs(
    query: str = Form(...),
    use_kb: bool = Form(False),
    session_id: str = Depends(get_sid)
):
    # Retrieve chat history
    history = store.get_history(session_id)
    
    # Get list of uploaded document names for this session
    session_docs = store.get_all_documents(session_id)
    uploaded_doc_names = [d.filename for d in session_docs]
    
    # Search across documents with optional knowledge base
    similar_docs = rag_engine.retrieve_similar_clauses(query, top_k=20, use_kb=use_kb, session_id=session_id)
    
    # Separate KB and DOC results
    kb_results = [(d, s) for d, s in similar_docs if d.metadata.get('source_type') == 'KB'] if similar_docs else []
    doc_results = [(d, s) for d, s in similar_docs if d.metadata.get('source_type') != 'KB'] if similar_docs else []
    
    print(f"DEBUG /chat: use_kb={use_kb}, total={len(similar_docs) if similar_docs else 0} (KB={len(kb_results)}, DOC={len(doc_results)})")
    
    if not similar_docs:
        # Still allow the LLM to answer from history/general knowledge if no docs found
        if history:
            answer = rag_engine.answer_general_question(query, "No document context available.", history=history, uploaded_doc_names=uploaded_doc_names)
            store.add_history_message(session_id, "user", query)
            store.add_history_message(session_id, "bot", answer)
            return {"answer": answer}
        return {"answer": "I couldn't find any relevant information. Please upload some documents or enable the Knowledge Base to get started."}
    
    # Build separate context strings for KB and DOC
    def build_context(results, label):
        parts = []
        refs = []
        for i, (d, score) in enumerate(results, 1):
            doc_id = d.metadata.get('doc_id')
            doc_obj = store.get_document(session_id, int(doc_id)) if doc_id else None
            doc_name = doc_obj.filename if doc_obj else d.metadata.get('doc_name', 'Unknown')
            clause_id = d.metadata.get('clause_id', 'N/A')
            page = d.metadata.get('page_number', 'N/A')
            
            parts.append(
                f"REF [{label} {i}]:\n"
                f"File: {doc_name} | Clause: {clause_id} | Page: {page}\n"
                f"Content: {d.page_content}"
            )
            snippet = d.page_content[:200].replace('\n', ' ').replace('\r', '')
            refs.append(f"- [{label}] File: {doc_name} | Clause: {clause_id} | Page: {page} ||| {snippet}")
        
        return "\n\n---\n\n".join(parts), "\n".join(refs)
    
    kb_context, kb_refs = build_context(kb_results, "KB") if kb_results else ("", "")
    doc_context, doc_refs = build_context(doc_results, "DOC") if doc_results else ("", "")
    
    # --- DUAL-RETRIEVAL + SYNTHESIS PIPELINE ---
    
    if kb_results and doc_results:
        # Both sources have results → run both LLM calls in parallel, then synthesize
        print("DEBUG /chat: Dual-retrieval mode — running KB + DOC calls in parallel")
        
        import concurrent.futures
        loop = asyncio.get_event_loop()
        
        with concurrent.futures.ThreadPoolExecutor() as pool:
            kb_future = loop.run_in_executor(
                pool, 
                lambda: rag_engine.answer_from_source(query, kb_context, "KNOWLEDGE BASE", history)
            )
            doc_future = loop.run_in_executor(
                pool,
                lambda: rag_engine.answer_from_source(query, doc_context, "UPLOADED DOCUMENT", history)
            )
            kb_answer, doc_answer = await asyncio.gather(kb_future, doc_future)
        
        print(f"DEBUG /chat: KB answer length={len(kb_answer)}, DOC answer length={len(doc_answer)}")
        
        # Check if either returned no relevant info
        kb_has_info = "NO_RELEVANT_INFO" not in kb_answer
        doc_has_info = "NO_RELEVANT_INFO" not in doc_answer
        
        if kb_has_info and doc_has_info:
            # Both have useful info → synthesize
            answer = rag_engine.synthesize_responses(query, kb_answer, doc_answer, kb_refs, doc_refs)
        elif kb_has_info:
            answer = kb_answer + f"\n\nSOURCES:\n{kb_refs}"
        elif doc_has_info:
            answer = doc_answer + f"\n\nSOURCES:\n{doc_refs}"
        else:
            answer = rag_engine.answer_general_question(query, "No relevant context found.", history=history)
    
    elif kb_results:
        # Only KB results
        print("DEBUG /chat: KB-only mode")
        answer = rag_engine.answer_from_source(query, kb_context, "KNOWLEDGE BASE", history)
        if "NO_RELEVANT_INFO" not in answer:
            answer += f"\n\nSOURCES:\n{kb_refs}"
        else:
            answer = rag_engine.answer_general_question(query, "No relevant context found.", history=history)
    
    else:
        # Only DOC results
        print("DEBUG /chat: DOC-only mode")
        answer = rag_engine.answer_from_source(query, doc_context, "UPLOADED DOCUMENT", history)
        if "NO_RELEVANT_INFO" not in answer:
            answer += f"\n\nSOURCES:\n{doc_refs}"
        else:
            answer = rag_engine.answer_general_question(query, "No relevant context found.", history=history)
    
    # Save to history
    store.add_history_message(session_id, "user", query)
    store.add_history_message(session_id, "bot", answer)
    
    return {"answer": answer}

@app.get("/graph/{assessment_id}")
def get_graph_data(assessment_id: int, session_id: str = Depends(get_sid)):
    assessment = store.get_assessment(session_id, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    results = store.get_results_by_assessment(session_id, assessment_id)
    
    nodes = []
    edges = []
    
    # Add regulation nodes (planets)
    reg_clauses = store.get_clauses_by_document(session_id, assessment.regulation_doc_id)
    for rc in reg_clauses:
        nodes.append({
            "id": f"reg_{rc.id}",
            "label": rc.clause_id,
            "type": "regulation",
            "page": rc.page_number,
            "doc_id": assessment.regulation_doc_id,
            "text": rc.text[:100] + "..."
        })
        
    # Add customer nodes and edges
    for r in results:
        cust_clause = store.get_clause(session_id, r.customer_clause_id)
        nodes.append({
            "id": f"cust_{r.customer_clause_id}",
            "label": cust_clause.clause_id if cust_clause else str(r.customer_clause_id),
            "type": "customer",
            "status": r.status,
            "risk": r.risk,
            "doc_id": assessment.customer_doc_id,
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
def generate_report(assessment_id: int, session_id: str = Depends(get_sid)):
    assessment = store.get_assessment(session_id, assessment_id)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    results = store.get_results_by_assessment(session_id, assessment_id)
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements = []
    
    styles = getSampleStyleSheet()
    elements.append(Paragraph(f"SkyEngineering Report", styles['Title']))
    elements.append(Spacer(1, 12))
    
    # Header info
    customer_doc = store.get_document(session_id, assessment.customer_doc_id)
    reg_doc = store.get_document(session_id, assessment.regulation_doc_id)
    
    elements.append(Paragraph(f"Project Document: {customer_doc.filename if customer_doc else 'N/A'}", styles['Normal']))
    elements.append(Paragraph(f"Regulatory Standard: {reg_doc.filename if reg_doc else 'N/A'}", styles['Normal']))
    elements.append(Paragraph(f"Date: {assessment.created_at.strftime('%Y-%m-%d %H:%M:%S')}", styles['Normal']))
    elements.append(Spacer(1, 24))
    
    # Table data
    data = [["Clause ID", "Status", "Risk", "Reasoning"]]
    for r in results:
        cust_clause = store.get_clause(session_id, r.customer_clause_id)
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

# Mount the frontend static files
# Make sure to build the frontend first: npm run build
DIST_PATH = "frontend/dist"
if os.path.exists(DIST_PATH):
    app.mount("/assets", StaticFiles(directory=f"{DIST_PATH}/assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Serve the file if it exists, otherwise serve index.html for SPA routing
        local_path = os.path.join(DIST_PATH, full_path)
        if full_path != "" and os.path.exists(local_path):
            return FileResponse(local_path)
        return FileResponse(os.path.join(DIST_PATH, "index.html"))
else:
    print(f"WARNING: Static files not found at {DIST_PATH}. Frontend will not be served.")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
