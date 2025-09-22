#!/usr/bin/env python3

import chromadb
import json

def get_first_10():
    client = chromadb.HttpClient(host="localhost", port=8000)
    
    print("=== First 10 Candidates ===\n")
    
    collection = client.get_collection("candidates")
    
    # Get first 10 documents
    results = collection.get(limit=100, include=['metadatas', 'documents'])
    
    for i, doc_id in enumerate(results['ids'], 1):
        print(f"Entry {i}:")
        print(f"  ID: {doc_id}")
        
        if results['metadatas'] and i-1 < len(results['metadatas']):
            metadata = results['metadatas'][i-1]
            print(f"  Ward: {metadata.get('ward', 'N/A')}")
            print(f"  Party: {metadata.get('party', 'N/A')}")
            print(f"  Candidate ID: {metadata.get('id', 'N/A')}")
            print(f"  Location Range: {metadata.get('locFrom', 'N/A')} - {metadata.get('locTo', 'N/A')}")
        
        if results['documents'] and i-1 < len(results['documents']):
            content = results['documents'][i-1]
            # Show first 300 characters of content
            if content:
                if len(content) > 300:
                    print(f"  Content: {content[:300]}...")
                else:
                    print(f"  Content: {content}")
        
        print("-" * 60)

if __name__ == "__main__":
    get_first_10()