This is an AI-driven voting advisor for the **New Zealand elections**. 
A user picks their ward/region, the app asks adaptive questions, 
to filter for candidates matches with AI-generated explanations.

Single-page Next.js 15 (App Router, React 19, Tailwind/shadcn, Bun runtime).
LangChain orchestrates LLMs (OpenAI / Anthropic / **OpenRouter**). Candidate
data lives in a committed SQLite file (`voting-advisor.db`) via Drizzle ORM.
RAG uses **Chroma** in Docker with **local HuggingFace embeddings** (no
embedding API costs).


## Getting Started

First, run the development server:

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.