import os
import sys
import argparse
from pathlib import Path
import requests

def process_directory(directory_path: str, file_type: str = "regulation", base_url: str = "http://localhost:8000", namespace: str = "permanent"):
    path = Path(directory_path)
    if not path.is_dir():
        print(f"Error: {directory_path} is not a directory.")
        return

    # Supported extensions
    extensions = [".pdf", ".docx", ".xlsx"]
    files = []
    for ext in extensions:
        files.extend(list(path.glob(f"**/*{ext}")))
        
    print(f"Found {len(files)} documents to process in {directory_path}")

    upload_url = f"{base_url}/upload"

    for i, file_path in enumerate(files):
        print(f"[{i+1}/{len(files)}] Uploading {file_path.name} to namespace {namespace}...")
        
        try:
            with open(file_path, "rb") as f:
                files_payload = {
                    'file': (file_path.name, f, 'application/octet-stream')
                }
                data_payload = {
                    'file_type': file_type,
                    'version': '1.0',
                    'namespace': namespace
                }
                
                response = requests.post(upload_url, files=files_payload, data=data_payload)
                
                if response.status_code == 200:
                    result = response.json()
                    print(f"  Successfully ingested: {result.get('filename')} (ID: {result.get('doc_id')})")
                else:
                    print(f"  Failed to upload {file_path.name}: {response.status_code} - {response.text}")

        except Exception as e:
            print(f"  Error processing {file_path.name}: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch ingest documents into Pinecone via API.")
    parser.add_argument("--dir", type=str, required=True, help="Directory containing documents")
    parser.add_argument("--type", type=str, default="regulation", help="Type of documents (regulation or customer)")
    parser.add_argument("--url", type=str, default="http://localhost:8000", help="Backend API base URL")
    parser.add_argument("--namespace", type=str, default="permanent", help="Pinecone namespace (session or permanent)")
    
    args = parser.parse_args()
    
    # Check if backend is reachable
    try:
        requests.get(args.url)
    except:
        print(f"Warning: Backend at {args.url} seems unreachable. Make sure the server is running.")
        
    process_directory(args.dir, args.type, args.url, args.namespace)
    print("\nBatch ingestion complete!")
