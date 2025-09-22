#!/usr/bin/env python3

import chromadb
import json
from pprint import pprint

def inspect_chroma_db():
    try:
        # Connect to the running Chroma instance
        client = chromadb.HttpClient(host="localhost", port=8000)
        
        print("=== Chroma Database Inspection ===\n")
        
        # Get all collections
        print("1. Listing all collections...")
        collections = client.list_collections()
        
        if not collections:
            print("No collections found.")
            return
        
        print(f"Found {len(collections)} collection(s):")
        for i, collection in enumerate(collections, 1):
            print(f"  {i}. {collection.name}")
        
        print("\n" + "="*50 + "\n")
        
        # Inspect each collection
        for collection_info in collections:
            collection_name = collection_info.name
            print(f"2. Inspecting collection: '{collection_name}'")
            
            try:
                # Get the collection
                collection = client.get_collection(collection_name)
                
                # Get collection metadata
                print(f"   Metadata: {collection.metadata}")
                
                # Count documents
                count = collection.count()
                print(f"   Document count: {count}")
                
                if count > 0:
                    # Get a few sample documents (limit to 3 for brevity)
                    sample_limit = min(3, count)
                    print(f"   Fetching {sample_limit} sample documents...")
                    
                    # Get documents with all their data
                    results = collection.get(limit=sample_limit, include=['metadatas', 'documents', 'embeddings'])
                    
                    print(f"   Sample documents:")
                    for i, doc_id in enumerate(results['ids']):
                        print(f"     Document {i+1}:")
                        print(f"       ID: {doc_id}")
                        
                        if results['metadatas'] and i < len(results['metadatas']):
                            print(f"       Metadata: {results['metadatas'][i]}")
                        
                        if results['documents'] and i < len(results['documents']):
                            doc_content = results['documents'][i]
                            # Truncate long documents for display
                            if doc_content and len(doc_content) > 200:
                                doc_content = doc_content[:200] + "..."
                            print(f"       Content: {doc_content}")
                        
                        if results['embeddings'] and i < len(results['embeddings']):
                            embedding_length = len(results['embeddings'][i]) if results['embeddings'][i] else 0
                            print(f"       Embedding length: {embedding_length}")
                        
                        print()
                
            except Exception as e:
                print(f"   Error inspecting collection '{collection_name}': {e}")
            
            print("-" * 30 + "\n")
        
    except Exception as e:
        print(f"Error connecting to Chroma DB: {e}")
        print("Make sure Chroma is running on localhost:8000")

if __name__ == "__main__":
    inspect_chroma_db()