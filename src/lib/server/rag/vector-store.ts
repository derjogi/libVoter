// Server-only: Cannot be imported in client components
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { DirectoryLoader } from "langchain/document_loaders/fs/directory";
import { JSONLoader } from "langchain/document_loaders/fs/json";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { Document } from "langchain/document";
import path from "path";
import { db } from "../db";
import { candidates } from "../../db/schema";
import { createEmbeddingModel } from "../ai/model-factory";
import type { EmbeddingModel } from "../ai/model-factory";

class VectorStoreManager {
  private vectorStore: Chroma | null = null;
  private embeddings: EmbeddingModel;

  constructor() {
    this.embeddings = createEmbeddingModel();
  }

  async initialize() {
    try {
      // Try to load existing collection
      this.vectorStore = await Chroma.fromExistingCollection(this.embeddings, {
        collectionName: "candidates",
        url: process.env.CHROMA_URL || "http://localhost:8000",
      });
      const count = await this.vectorStore!.collection!.count();
      if (count === 0) {
        console.log("📝 Vector store is empty, populating with data...");
        await this.populateVectorStore();
      } else {
        console.log(`✅ Loaded existing vector store with ${count} documents`);
      }
    } catch (error) {
      // Create new collection if it doesn't exist
      console.log("📝 Creating new vector store...");
      await this.createVectorStore();
    }
  }

  private async createVectorStore() {
    console.log(
      "⚙️ Creating vector store with embedding model: ",
      this.embeddings.model
    );

    // Create empty vector store first
    this.vectorStore = new Chroma(this.embeddings, {
      collectionName: "candidates",
      url: process.env.CHROMA_URL || "http://localhost:8000",
    });

    // Then populate it
    await this.populateVectorStore();
  }

  private async populateVectorStore() {
    let docs: Document[] = [];
    const dataDir = path.join(process.cwd(), "data", "candidates");

    try {
      // Load documents from data directory
      const loader = new DirectoryLoader(dataDir, {
        ".json": (filePath: string) => new JSONLoader(filePath),
        ".md": (filePath: string) => new TextLoader(filePath),
        ".txt": (filePath: string) => new TextLoader(filePath),
      });

      docs.push(...(await loader.load()));
    } catch (error: any) {
      // Probably the data dir doesn't exist or something like that. Ignore.
      console.warn(`Failed to load documents from ${dataDir}: `, error.Error);
    }

    // ... and now also check the database and get all candidates from there:
    try {
      const allCandidates = await db.select().from(candidates);
      console.log(`📊 Loaded ${allCandidates.length} candidates from database`);

      const validCandidates = allCandidates.filter(
        (candidate) => candidate.name && candidate.ward
      );
      console.log(
        `✅ ${validCandidates.length} candidates passed validation (${
          allCandidates.length - validCandidates.length
        } filtered out)`
      );

      if (allCandidates.length !== validCandidates.length) {
        const invalidCandidates = allCandidates.filter(
          (candidate) => !candidate.name || !candidate.ward
        );
        console.log(
          "❌ Invalid candidates:",
          invalidCandidates.map((c) => ({
            id: c.id,
            name: c.name,
            ward: c.ward,
          }))
        );
      }

      docs = validCandidates.map((candidate) => {
        // Safely parse key_positions
        let keyPositions: Record<string, string> = {};
        if (candidate.key_positions) {
          try {
            keyPositions =
              typeof candidate.key_positions === "string"
                ? JSON.parse(candidate.key_positions)
                : candidate.key_positions;
          } catch (error) {
            console.warn(
              `Failed to parse key_positions for candidate ${candidate.id}:`,
              error
            );
            console.warn("Raw key_positions value:", candidate.key_positions);
          }
        }

        // Safely parse supporting_links
        let supportingLinks: string[] = [];
        if (candidate.supporting_links) {
          try {
            supportingLinks =
              typeof candidate.supporting_links === "string"
                ? JSON.parse(candidate.supporting_links)
                : candidate.supporting_links;
          } catch (error) {
            console.warn(
              `Failed to parse supporting_links for candidate ${candidate.id}:`,
              error
            );
          }
        }

        const content = `${candidate.name} - ${
          candidate.party || "Independent"
        } - ${candidate.ward}\n\nStatement: ${
          candidate.candidate_statement || ""
        }\n\nKey Positions: ${Object.entries(keyPositions)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}\n\nWhy: ${candidate.why || ""}\n\nKey Skills: ${
          candidate.key_skills || ""
        }\n\nTop Issues: ${candidate.top_issues || ""}`;

        const metadata = {
          ward: candidate.ward,
          party: candidate.party || "Independent",
          id: candidate.id.toString(),
        };

        // Validate the document before returning
        if (!content || content.trim().length === 0) {
          console.warn(`Empty content for candidate ${candidate.id}`);
        }

        return new Document({ pageContent: content, metadata });
      });

      console.log(
        `📄 Created ${docs.length} documents from database candidates`
      );

      // Log first few documents for inspection
      console.log("🔍 Sample documents:");
      docs.slice(0, 3).forEach((doc, index) => {
        console.log(`  Doc ${index + 1}:`, {
          contentLength: doc.pageContent?.length || 0,
          contentPreview: doc.pageContent?.substring(0, 100),
          metadata: doc.metadata,
        });
      });
    } catch (error) {
      console.error("Failed to load candidates from database:", error);
    }

    // Split documents into chunks
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await splitter.splitDocuments(docs);

    console.log(
      `📄 Loaded and split ${docs.length} documents into ${splitDocs.length} chunks.`
    );

    // Validate splitDocs before adding to vector store
    console.log("🔍 Validating splitDocs...");
    const invalidDocs = splitDocs.filter((doc, index) => {
      if (!doc.pageContent || doc.pageContent.trim().length === 0) {
        console.error(`Invalid document at index ${index}:`, {
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        });
        return true;
      }
      return false;
    });

    if (invalidDocs.length > 0) {
      console.error(
        `Found ${invalidDocs.length} invalid documents out of ${splitDocs.length}`
      );
    } else {
      console.log("✅ All splitDocs are valid");
    }

    console.log(
      "⚙️ Adding documents to vector store with embedding model: ",
      this.embeddings.model
    );

    console.log("Initiated adding documents in batches...");
    console.time("Add Documents");

    // Process documents in batches to avoid overwhelming the system
    const BATCH_SIZE = 50; // Process 50 documents at a time
    let processedCount = 0;

    for (let i = 0; i < splitDocs.length; i += BATCH_SIZE) {
      const batch = splitDocs.slice(i, i + BATCH_SIZE);
      console.log(
        `📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
          splitDocs.length / BATCH_SIZE
        )} (${batch.length} documents)`
      );

      try {
        await this.vectorStore!.addDocuments(batch);
        processedCount += batch.length;
        console.log(
          `✅ Successfully added batch. Total processed: ${processedCount}/${splitDocs.length}`
        );

        // Add a small delay between batches to prevent overwhelming the system
        if (i + BATCH_SIZE < splitDocs.length) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
        }
      } catch (error) {
        console.error(
          `❌ Failed to add batch ${Math.floor(i / BATCH_SIZE) + 1}:`,
          error
        );
        console.error(
          `   Batch contained ${batch.length} documents starting from index ${i}`
        );
        // Continue with the next batch instead of failing entirely
      }
    }

    console.timeEnd("Add Documents");
    console.log(
      `✅ Added ${processedCount}/${splitDocs.length} documents to vector store`
    );
  }

  async query(question: string, maxResults: number = 5) {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    console.time("Similarity Search");
    const results = await this.vectorStore.similaritySearch(
      question,
      maxResults
    );
    console.timeEnd("Similarity Search");

    if (!results) {
      console.error("❌ similaritySearch returned undefined");
      return [];
    }

    console.log("Found RAG results: ", JSON.stringify(results));
    return results.map((doc) => ({
      content: doc.pageContent,
      metadata: doc.metadata,
      score: 0, // Chroma doesn't return scores by default
    }));
  }

  async addDocuments(docs: any[]) {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    await this.vectorStore.addDocuments(docs);
  }
}

// Singleton instance
let vectorStoreManager: VectorStoreManager | null = null;

export async function getVectorStoreManager() {
  if (!vectorStoreManager) {
    console.log("Creating new VectorStoreManager");
    vectorStoreManager = new VectorStoreManager();
    await vectorStoreManager.initialize();
  }
  return vectorStoreManager;
}
