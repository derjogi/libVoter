import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fromExistingCollection = vi.fn();
  const createEmbeddingModel = vi.fn(() => ({}));
  const isMockMode = vi.fn(() => false);

  return {
    fromExistingCollection,
    createEmbeddingModel,
    isMockMode,
  };
});

vi.mock("@langchain/community/vectorstores/chroma", () => ({
  Chroma: class Chroma {
    static fromExistingCollection = mocks.fromExistingCollection;

    ensureCollection = vi.fn();
  },
}));

vi.mock("@/lib/server/ai/model-factory", () => ({
  createEmbeddingModel: mocks.createEmbeddingModel,
  isMockMode: mocks.isMockMode,
}));

describe("VectorStoreManager initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("shares a single initialization promise across concurrent callers", async () => {
    mocks.fromExistingCollection.mockResolvedValue({
      collection: { count: async () => 12 },
    });

    const { getVectorStoreManager } = await import(
      "@/lib/server/rag/vector-store"
    );

    await Promise.all([
      getVectorStoreManager(),
      getVectorStoreManager(),
      getVectorStoreManager(),
      getVectorStoreManager(),
    ]);

    expect(mocks.fromExistingCollection).toHaveBeenCalledTimes(1);
  });

  it("does not seed an empty collection during normal app startup", async () => {
    mocks.fromExistingCollection.mockResolvedValue({
      collection: { count: async () => 0 },
    });

    const { VectorStoreManager } = await import(
      "@/lib/server/rag/vector-store"
    );
    const manager = new VectorStoreManager({} as never);
    const populate = vi.spyOn(manager, "populate").mockResolvedValue(0);

    await manager.initialize();

    expect(populate).not.toHaveBeenCalled();
  });

  it("can seed an empty collection when explicitly requested by the offline embed script", async () => {
    mocks.fromExistingCollection.mockResolvedValue({
      collection: { count: async () => 0 },
    });

    const { VectorStoreManager } = await import(
      "@/lib/server/rag/vector-store"
    );
    const manager = new VectorStoreManager({} as never);
    const populate = vi.spyOn(manager, "populate").mockResolvedValue(7);

    await manager.initialize({ seedIfEmpty: true });

    expect(populate).toHaveBeenCalledTimes(1);
  });
});
