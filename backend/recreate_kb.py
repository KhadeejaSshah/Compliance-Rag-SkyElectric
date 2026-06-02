import os
import re
import asyncio
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from pinecone import Pinecone
from backend.rag import rag_engine
from backend.models import store
from backend.ingestion import parse_document
from backend.main import save_kb_metadata, STORAGE_DIR

def get_clean_filename(name):
    # Strip prefixes like kb_1_, 10_, kb_
    name = re.sub(r'^(kb_\d+_|kb_|\d+_)', '', name)
    return name

async def main():
    print("--- Starting Pinecone Wiping & KB Recreation ---")
    
    # 1. Clear Pinecone Index across all namespaces
    print("Connecting to Pinecone...")
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index = pc.Index(rag_engine.index_name)
    
    print("Retrieving index stats...")
    stats = index.describe_index_stats()
    namespaces = list(stats.get('namespaces', {}).keys())
    print(f"Found namespaces in index: {namespaces}")
    
    for ns in namespaces:
        print(f"Wiping namespace: '{ns}'...")
        index.delete(delete_all=True, namespace=ns)
    print("Pinecone index cleared successfully!")
    
    # Reset in-memory store for 'permanent' session
    store.reset(session_id="permanent")
    
    # 2. Collect files from storage
    supported_extensions = {'.pdf', '.docx', '.xlsx', '.csv'}
    files_to_ingest = []
    
    for filename in os.listdir(STORAGE_DIR):
        file_path = os.path.join(STORAGE_DIR, filename)
        if os.path.isfile(file_path):
            ext = os.path.splitext(filename)[1].lower()
            if ext in supported_extensions:
                files_to_ingest.append((filename, file_path))
                
    print(f"Found {len(files_to_ingest)} files in storage directory to recreate.")
    
    # Temporarily read all files into memory so we can safely clean up storage dir
    in_memory_files = []
    for filename, file_path in files_to_ingest:
        with open(file_path, "rb") as f:
            content = f.read()
        clean_name = get_clean_filename(filename)
        in_memory_files.append((clean_name, content))
        
    # Clean storage directory (except kb_metadata.json)
    print("Cleaning up older physical files in storage directory...")
    for filename in os.listdir(STORAGE_DIR):
        file_path = os.path.join(STORAGE_DIR, filename)
        if os.path.isfile(file_path) and filename != "kb_metadata.json":
            os.remove(file_path)
            
    # 3. Ingest each file back as a permanent document
    for i, (clean_name, content) in enumerate(in_memory_files):
        print(f"\n[{i+1}/{len(in_memory_files)}] Ingesting {clean_name} into Knowledge Base...")
        
        try:
            # Parse document & ingest into Vector DB (permanent namespace)
            doc_id = parse_document(
                file_content=content,
                filename=clean_name,
                file_type="regulation",
                version="1.0",
                namespace="permanent",
                session_id="permanent"
            )
            
            # Save the file to physical storage under its new ID
            new_filename = f"kb_{doc_id}_{clean_name}"
            new_file_path = os.path.join(STORAGE_DIR, new_filename)
            with open(new_file_path, "wb") as f:
                f.write(content)
                
            print(f"  Ingested successfully as doc_id={doc_id}, saved as '{new_filename}'")
            
        except Exception as e:
            print(f"  ERROR ingesting {clean_name}: {e}")
            
    # 4. Save metadata to disk
    print("\nSaving updated Knowledge Base metadata...")
    save_kb_metadata()
    print("--- KB Recreation completed successfully! ---")

if __name__ == "__main__":
    asyncio.run(main())
