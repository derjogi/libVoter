// Server-only types (cannot be imported in client components)
export interface ServerConfig {
  apiKey: string;
  libsqlUrl: string;
  libsqlAuthToken?: string;
  chromaUrl: string;
}

export interface DatabaseCandidate {
  id: string;
  name: string;
  party: string;
  profileData: any; // JSON from libSQL
  createdAt: string;
}
