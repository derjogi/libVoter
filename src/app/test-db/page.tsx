import { loadCandidates } from "@/lib/actions/database";

export default async function TestDBPage() {
  const result = await loadCandidates();

  if (!result.success) {
    return <div>Error: {result.error}</div>;
  }

  return (
    <div>
      <h1>Database Test</h1>
      <ul>
        {result.data?.map((candidate) => (
          <li key={candidate.id}>
            {candidate.name} - {candidate.party}
          </li>
        ))}
      </ul>
    </div>
  );
}
