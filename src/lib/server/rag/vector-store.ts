// Server-only: Cannot be imported in client components
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { JSONLoader } from 'langchain/document_loaders/fs/json';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import path from 'path';

class VectorStoreManager {
  private vectorStore: Chroma | null = null;
  private embeddings: OpenAIEmbeddings;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY!,
      modelName: 'text-embedding-3-small'
    });
  }

  async initialize() {
    try {
      // Try to load existing collection
      this.vectorStore = await Chroma.fromExistingCollection(
        this.embeddings,
        {
          collectionName: 'candidates',
          url: process.env.CHROMA_URL || 'http://localhost:8000'
        }
      );
      console.log('✅ Loaded existing vector store');
    } catch (error) {
      // Create new collection if it doesn't exist
      console.log('📝 Creating new vector store...');
      await this.createVectorStore();
    }
  }

  private async createVectorStore() {
    const dataDir = path.join(process.cwd(), 'data', 'candidates');

    // Load documents from data directory
    const loader = new DirectoryLoader(dataDir, {
      '.json': (filePath: string) => new JSONLoader(filePath),
      '.md': (filePath: string) => new TextLoader(filePath),
      '.txt': (filePath: string) => new TextLoader(filePath)
    });

    const docs = await loader.load();

    // Split documents into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });

    const splitDocs = await splitter.splitDocuments(docs);

    // Create vector store
    this.vectorStore = await Chroma.fromDocuments(splitDocs, this.embeddings, {
      collectionName: 'candidates',
      url: process.env.CHROMA_URL || 'http://localhost:8000'
    });

    console.log(`✅ Created vector store with ${splitDocs.length} documents`);
  }

  async query(question: string, maxResults: number = 5) {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    const results = await this.vectorStore.similaritySearch(question, maxResults);
    return results.map(doc => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      score: 0 // Chroma doesn't return scores by default
    }));
  }

  async addDocuments(docs: any[]) {
    if (!this.vectorStore) {
      throw new Error('Vector store not initialized');
    }

    await this.vectorStore.addDocuments(docs);
  }
}

// Singleton instance
let vectorStoreManager: VectorStoreManager | null = null;

export async function getVectorStoreManager() {
  if (!vectorStoreManager) {
    vectorStoreManager = new VectorStoreManager();
    await vectorStoreManager.initialize();
  }
  return vectorStoreManager;
}