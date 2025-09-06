# server-client-rules.md

# 🚨 CRITICAL: Client-Server Architecture Guidelines

## Overview
This project uses Next.js 15 with the App Router. **Proper separation between client and server code is essential** to prevent webpack bundling errors and ensure security.

## 🏗️ Architecture Principles

### 1. Client vs Server Code Separation
- **Client Components**: Run in browser, can use React hooks, browser APIs
- **Server Components**: Run on server, have access to Node.js APIs and file system
- **Server Actions**: Async functions that run on server, called from client components

### 2. Module Import Rules

#### ❌ NEVER import these in client code:
```typescript
// These will cause webpack bundling errors:
import { ChromaClient } from 'chromadb';           // ❌ Client component
import { OpenAIEmbeddings } from '@langchain/openai'; // ❌ Client component
import * as fs from 'fs/promises';                 // ❌ Client component
import * as path from 'path';                      // ❌ Client component
import { execSync } from 'child_process';          // ❌ Client component
```

#### ✅ Safe to import in client code, but ❌ NOT to be used on the server:
```typescript
// These require to be run on the client:
// Generally, any _hooks_ need to be client side!
import { useState, useEffect } from 'react';       // ✅ Client hooks
import { supabase } from '@/lib/supabase/client';  // ✅ Supabase client
import { zodResolver } from '@hookform/resolvers/zod'; // ✅ Client libraries
```

### 3. File Organization Patterns

#### Server-Only Code Structure:
```
src/lib/
├── server/                    # Server-only utilities
│   ├── rag/                  # Server RAG implementation
│   ├── ai/                   # Server AI operations
│   └── file-operations.ts    # File system operations
└── client/                   # Client-safe utilities
    ├── api-client.ts         # API communication
    ├── hooks/                # React hooks
    └── services/             # Client services
```

#### Component Organization:
```typescript
// ✅ Server Component (default)
export default function MyComponent() {
  // Runs on server, can access databases, files, etc.
  const data = await fetchDataFromDB();
  return <div>{data}</div>;
}

// ✅ Client Component (with 'use client')
'use client';
export default function InteractiveComponent() {
  const [state, setState] = useState();
  // Cannot access server APIs directly
  return <button onClick={() => setState('clicked')}>Click me</button>;
}
```

## 🔧 Implementation Patterns

### API Routes Pattern
```typescript
// src/app/api/example/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Server-side logic here
    const data = await serverOperation();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Process request...
}
```

### Server Actions Pattern
```typescript
// src/lib/actions/example.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createItem(formData: FormData) {
  try {
    // Server-side logic
    const result = await serverDatabaseOperation(formData);

    // Revalidate cache if needed
    revalidatePath('/items');

    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Client Service Pattern
```typescript
// src/lib/client/services/api-service.ts
export class ApiService {
  private baseUrl = '/api';

  async fetchData(endpoint: string): Promise<APIResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async postData(endpoint: string, data: any): Promise<APIResponse> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  }
}
```

## 🚨 Common Pitfalls & Solutions

### Pitfall 1: Importing Server Libraries in Client Code
```typescript
// ❌ WRONG - Will cause webpack errors
'use client';
import { ChromaClient } from 'chromadb'; // Node.js module!

export default function MyComponent() {
  const client = new ChromaClient(); // Fails at build time
}
```

```typescript
// ✅ CORRECT - Use API routes or server actions
'use client';
import { useServerAction } from '@/lib/hooks/useServerAction';

export default function MyComponent() {
  const { data, loading, error } = useServerAction(queryRAGData);
}
```

### Pitfall 2: File System Access in Client Components
```typescript
// ❌ WRONG
'use client';
import * as fs from 'fs/promises';

export default function FileComponent() {
  const [files] = useState(() => fs.readdirSync('.')); // Browser doesn't have fs
}
```

```typescript
// ✅ CORRECT
'use client';
import { useFiles } from '@/hooks/useFiles';

export default function FileComponent() {
  const { files, loading } = useFiles(); // Calls server API
}
```

### Pitfall 3: Database Operations in Client Code
```typescript
// ❌ WRONG
'use client';
import { PrismaClient } from '@prisma/client';

export default function DataComponent() {
  const prisma = new PrismaClient(); // Not available in browser
}
```

```typescript
// ✅ CORRECT
'use client';
import { useCandidates } from '@/hooks/useCandidates';

export default function DataComponent() {
  const { candidates } = useCandidates(); // Calls Supabase client
}
```

## 🔒 Security Guidelines

### Server-Only Operations
- All database operations must be server-side
- File system access only in server components/actions
- API keys and secrets only accessible server-side
- Input validation must happen server-side

### Client-Side Data Handling
- Never expose sensitive data to client
- Use environment variables with `NEXT_PUBLIC_` prefix for client-safe config
- Validate all user inputs on both client and server
- Implement proper error handling without exposing internal details

## 📋 Checklist for New Features

### Before Implementing:
- [ ] Is this client-side or server-side functionality?
- [ ] What Node.js modules are required?
- [ ] Can client components access this functionality?
- [ ] Do I need API routes or server actions?
- [ ] How will errors be handled?

### Implementation Steps:
- [ ] Create server-side logic first
- [ ] Add API routes or server actions
- [ ] Create client-safe interfaces
- [ ] Implement client components
- [ ] Add proper error handling
- [ ] Test the implementation
- [ ] Update documentation

### Security Review:
- [ ] Are sensitive operations server-side only?
- [ ] Is input validation implemented?
- [ ] Are errors handled securely?
- [ ] Is data properly sanitized?

## 🎯 Best Practices

1. **Always prefer server components** when possible
2. **Use 'use client' only when necessary** (interactivity, browser APIs)
3. **Keep server operations in dedicated modules**
4. **Use TypeScript interfaces** for client-server communication
5. **Implement proper error boundaries**
6. **Test both client and server code paths**
7. **Document client/server boundaries** clearly

## 📞 Support

If you're unsure about client vs server implementation:
1. Check existing patterns in the codebase
2. Ask: "Does this need browser APIs or React hooks?"
3. If it needs Node.js APIs → Server component/action
4. If it needs React state/events → Client component
5. When in doubt, use server components with client components for interactivity