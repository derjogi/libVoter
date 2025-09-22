#!/usr/bin/env python3

import chromadb

def simple_inspect():
    client = chromadb.HttpClient(host="localhost", port=8000)
    
    print("=== Chroma DB Summary ===\n")
    
    collections = client.list_collections()
    print(f"Collections: {len(collections)}")
    
    for collection_info in collections:
        collection = client.get_collection(collection_info.name)
        count = collection.count()
        print(f"  - {collection_info.name}: {count} documents")
        
        # Get all document IDs and metadata (without embeddings to avoid the error)
        if count > 0:
            all_docs = collection.get(include=['metadatas', 'documents'])
            print(f"    Sample metadata keys: {list(all_docs['metadatas'][0].keys()) if all_docs['metadatas'] and all_docs['metadatas'][0] else 'None'}")

if __name__ == "__main__":
    simple_inspect()