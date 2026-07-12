import { getSeatsForCurrentElection } from "@/lib/actions/database";

export default async function TestDBPage() {
  const result = await getSeatsForCurrentElection();

  if (!result.success) {
    return <div>Error: {result.error}</div>;
  }

  return (
    <div>
      <h1>Election Database Test</h1>
      <ul>
        {result.data?.map((seat) => (
          <li key={seat}>{seat}</li>
        ))}
      </ul>
    </div>
  );
}
