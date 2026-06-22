I am writing a voting app that is supposed to associate data of candidates with all sorts of information about them, e.g. what they said in parliament, what they voted for, donations they received or have given, etc... 
Now initially I wanted to have a database / vector store where each candidate has a few of these auxillary documents associated with them and I look through them when filtering for candidates. 
However, now I realize, this might not be as clean or sufficient as I thought, because while one person may be the speaker of a given speech, or the author of a policy etc, the candidate that I'm interested in might also be mentioned within that speech, giving information through that. And Maybe there are some other relationships that I haven't considered yet. I'm right now mainly wanting to use documents from hansard (for the NZ elections). 

What approach would you suggest?

I’d treat this as an information architecture problem, not just a retrieval problem: model the documents, the people, and the relationships separately, then let retrieval traverse those relationships. I’ll ground the suggestion in what NZ Parliament exposes for Hansard and similar material, then propose a practical MVP path.

One important finding: NZ Hansard is useful but not a neat “candidate document set.” Parliament’s own Hansard UI distinguishes speeches, dailies, volumes, indexes, votes, oral questions and events, and lets users filter by MP name, date, document type and portfolio. That maps naturally to a graph-like model rather than a flat candidate-to-documents table.

Thought for 49s

I would not model this as “candidate → associated documents” only. That is too lossy. I’d model it as a provenance-backed political knowledge graph + vector search over source passages.

The key idea: documents are evidence, not ownership containers. A Hansard speech, vote record, donation return, bill, committee report, or article can contain multiple relationships to multiple people.

Recommended architecture

Use three layers:

1. Canonical entity layer

Create stable records for:

Person — candidate, MP, former MP, minister, donor if individual.
Party
Electorate
Organisation
Bill / Act / Policy
Vote
Speech / Hansard item
Donation / loan / return
Topic

This matters because one candidate may appear as speaker, minister answering, person criticised, bill sponsor, party member, donor recipient, or merely mentioned.

Hansard is particularly suitable for this because NZ Parliament’s own interface distinguishes speeches, dailies, votes, oral questions, events, document type, MP name, date and portfolio filters. It also notes that online Hansard goes back to February 2003 and that items may move through draft/edited/final stages.

2. Evidence/document layer

Store every source item as a first-class document:

document
- id
- source_type: hansard_speech | hansard_vote | legislation | donation_return | candidate_profile | news | ...
- source_url
- title
- date
- parliament_number
- raw_text
- parsed_metadata
- publication_status

Then split documents into chunks:

chunk
- id
- document_id
- text
- start_offset
- end_offset
- embedding

Do embeddings at the chunk level, not just the document level. A 30-minute debate may mention many people and issues; whole-document embeddings will blur those relationships.

3. Relationship / graph layer

Instead of “candidate has documents,” use typed edges:

edge
- subject_entity_id
- relation_type
- object_entity_id
- evidence_chunk_id
- confidence
- date
- extraction_method

Useful relationship types:

SPOKE_IN
MENTIONED_IN
ASKED_QUESTION_IN
ANSWERED_QUESTION_IN
VOTED_FOR
VOTED_AGAINST
ABSTAINED_ON
PARTY_VOTED_FOR
PARTY_VOTED_AGAINST
RESPONSIBLE_FOR_BILL
MEMBER_OF_PARTY_AT_TIME
REPRESENTED_ELECTORATE_AT_TIME
DONATED_TO
RECEIVED_DONATION_FROM
CRITICISED
SUPPORTED
OPPOSED
QUOTED
CO_MENTIONED_WITH

The distinction between speaker and mentioned person is essential. “Alice said X” and “Bob said X about Alice” are different evidence types and should be presented differently.

Practical MVP model

If you are already using Postgres or Supabase, I would start with Postgres + pgvector rather than immediately using a dedicated graph database.

Minimum tables:

person
person_alias
party
person_party_membership
document
chunk
entity_mention
edge
vote
bill
donation_return

entity_mention is important:

entity_mention
- id
- chunk_id
- entity_id
- surface_text
- role: speaker | mentioned | addressee | minister | bill_member | donor | recipient | unknown
- confidence
- span_start
- span_end

This lets you ask:

“Find evidence about Candidate X on climate change”

and retrieve:

things Candidate X said
things Candidate X voted for/against
bills Candidate X was connected to
speeches where others mentioned Candidate X
party-level positions during Candidate X’s membership period
donation records involving Candidate X or their party

That is much cleaner than pre-attaching documents to candidates.

Suggested retrieval flow

For a user query like:

“Which candidates are strong on housing affordability?”

Do this:

Convert the query into structured topics: housing, rent, planning, RMA, Kainga Ora, social housing, etc.
Retrieve candidate-related evidence through graph expansion:
direct speeches by candidate
direct votes by candidate
party votes if relevant
mentions of candidate
bills/policies associated with candidate
donation/interest records
Semantic-search only inside the candidate-relevant evidence set.
Re-rank results by:
directness
source authority
recency
confidence
relevance to query
Aggregate into evidence buckets:
“What they said”
“How they voted”
“What others said about them”
“Financial / donation context”
“Party context”
Generate a summary with citations back to exact source passages.

Do not merge those buckets into one vague AI-written candidate profile. Keep the epistemic status visible.

For example:

Candidate X: Housing

Direct speech:
- Said ...
- Source: Hansard, date, link

Voting record:
- Voted for ...
- Voted against ...
- Source: Hansard vote / bill stage

Party context:
- Party voted ...
- Candidate was party member at the time

Mentions by others:
- Mentioned by Minister Y in context of ...

Donations:
- Received disclosed donation from ...
Weight the evidence differently

Not all relationships mean the same thing. I would assign rough default weights like this:

1.00  direct vote by candidate
1.00  official donation / return record
0.90  direct speech by candidate
0.75  bill responsibility / sponsorship
0.60  answer given as minister
0.45  mentioned by another MP
0.35  party vote while candidate was member
0.25  co-mentioned in same debate

This prevents bad inference such as:

“Candidate X was mentioned in a corruption debate, therefore candidate X is associated with corruption.”

A mention is evidence that the document is relevant, not evidence that the claim is true.

Hansard-specific notes

NZ Hansard is an official report of debate in the House of Representatives and is intended to be close to verbatim, but MPs can request only limited corrections such as factual corrections. That makes it a strong source for “what was said,” but not automatically for “what is true.”

For votes, expect some messiness. There have been public requests for a centralised MP/party voting API, and the data.govt.nz request notes that votes are available through Hansard but hard to collect centrally; the Office of the Clerk responded that work on accessibility is complex and dependent on other systems. A newer Parliament open-data test site says subscription requests are not currently being approved and that an official API/developer hub is being worked on. So for now, plan for scraping/parsing unless a usable official endpoint becomes available.

For legislation, use the NZ Legislation API where possible. It provides programmatic access to legislation records, with a model of works, versions and formats, including HTML/PDF/XML links where available.

For donations, candidate-level and party-level data should be separate. Candidate election returns report donations over $1,500 and loans after each election; party annual returns have different thresholds and reporting rules. The Electoral Commission also publishes candidate expenses, donations and loans pages with downloadable summary spreadsheets for past elections.

Extraction pipeline

I’d build the pipeline like this:

1. Ingest source
   - Hansard pages
   - legislation API
   - Electoral Commission donation files
   - candidate/party metadata

2. Normalize entities
   - canonical person IDs
   - aliases, titles, name variants
   - party membership over time
   - electorate over time

3. Parse source structure
   - speaker
   - date
   - debate title
   - bill name
   - question number
   - vote result

4. Chunk text
   - preserve source offsets
   - avoid mixing multiple speakers in one chunk

5. Entity-link mentions
   - deterministic alias matching first
   - NER/LLM second
   - store confidence

6. Extract relationships
   - speaker → speech
   - person → mentioned_in → chunk
   - person/party → vote → bill
   - donor → donation → candidate/party

7. Embed chunks
   - embeddings for semantic retrieval
   - metadata filters for candidate, topic, date, party, source

8. Query + re-rank
   - combine graph traversal and vector search

9. Generate user-facing answer
   - cite exact source chunks
   - separate direct evidence from indirect evidence
My concrete recommendation

Start with Postgres/Supabase + pgvector + an edge table. Do not start with a pure vector DB. Also do not start with Neo4j unless you already know graph querying will be central to your UI.

A good MVP stack would be:

Postgres / Supabase:
- canonical structured data
- edge table
- source documents
- chunks
- pgvector embeddings

Python/Rust ingestion jobs:
- scrape/parse Hansard
- fetch legislation API
- download donation spreadsheets
- entity linking
- relationship extraction

LLM layer:
- classify relevance
- extract candidate/topic relationships
- summarize evidence
- never act as the only source of truth

The core design principle should be:

Store every political claim as an evidence-backed relationship between entities, not as text attached to a candidate.

That gives you a system that can answer “what did this person say?”, “what did others say about this person?”, “how did they vote?”, “what policies are they linked to?”, and “what financial relationships exist?” without collapsing all of those into one ambiguous pile of documents.

I'm using chroma, Is that a suitable storage tech?

Chroma can be a good part of the system, but I would not make it the whole storage model. I’ll check its current capabilities against the kind of candidate/document/relationship queries you described, then give you a practical architecture.

Thought for 16s

Yes — Chroma is suitable as the vector-retrieval layer, but I would not use Chroma as the primary database for the whole voting app.

Use it for:

semantic search over Hansard chunks, policy text, donation notes, candidate profiles, etc.

Do not use it as the only place to store:

candidates, parties, elections, votes, donations, entity relationships, provenance, aliases, time ranges

Chroma’s own docs frame collections as storing embeddings, documents and metadata for retrieval/filtering, which is exactly the vector-search part of your problem. It also supports metadata filtering via where, so you can narrow retrieval to things like candidate_id, source_type, role, date, or party_id.

Recommended setup

Use:

Postgres / SQLite / Supabase / other relational DB
= source of truth

Chroma
= semantic index over text chunks

So your structured DB contains:

candidate
party
candidate_party_membership
document
chunk
entity_mention
relationship_edge
vote
bill
donation

And Chroma contains retrievable chunk records like:

{
  "id": "chunk_123__person_456__mentioned",
  "document": "The relevant Hansard text chunk...",
  "metadata": {
    "chunk_id": "chunk_123",
    "document_id": "hansard_2024_05_14_x",
    "source_type": "hansard",
    "person_id": "person_456",
    "person_name": "Jane Candidate",
    "role": "mentioned",
    "speaker_id": "person_789",
    "date": "2024-05-14",
    "topic": "housing",
    "parliament": "54"
  }
}

Chroma docs explicitly support storing external document references by using Chroma IDs to associate vector records with documents stored elsewhere. That is the pattern I would use here.

The important design choice

For your case, I would probably index candidate-document relationships, not only chunks.

That means one Hansard chunk might create several Chroma records:

chunk_123 + speaker = Winston Peters
chunk_123 + mentioned_person = Chris Hipkins
chunk_123 + mentioned_person = Christopher Luxon
chunk_123 + bill = Residential Tenancies Amendment Bill
chunk_123 + topic = housing

This avoids the trap where the chunk is only attached to the speaker. A speech can be evidence about the speaker, the person being discussed, a party, a bill, or a topic.

What Chroma is good for here

Chroma is good for questions like:

Find passages relevant to this candidate and climate change.
Find Hansard text semantically similar to "housing affordability".
Find candidate-related evidence about co-governance.
Find speeches where this person was mentioned in relation to donations.

It supports vector queries over stored embeddings/documents, and query text can be embedded by the collection’s embedding function.

It is also good for fast prototyping. If you are using local Chroma, note that PersistentClient is described as intended for local development and testing; for production, Chroma’s docs recommend a server-backed Chroma instance.

What Chroma is weak for

Chroma is not the right primary store for:

candidate X belonged to party Y from date A to date B
candidate X voted for bill Z at committee stage
candidate X received donation D from donor Q
candidate X was mentioned by speaker Y in Hansard item H
candidate X and candidate Y are co-mentioned in debate D

Those are graph/relational facts. You want them queryable with exact semantics, joins, constraints, and auditability.

For example, this should be a SQL/graph query, not a vector query:

SELECT *
FROM relationship_edge
WHERE subject_person_id = :candidate_id
  AND relation_type = 'MENTIONED_IN'
  AND date BETWEEN '2023-01-01' AND '2023-10-14';

Then you can send the resulting chunk_ids to Chroma or use Chroma only inside that filtered evidence set.

Best pattern for your app

I’d structure retrieval like this:

1. User asks:
   "Which candidates are strong on housing?"

2. Structured DB:
   Find candidate IDs, party memberships, relevant votes, bills, donation links,
   and Hansard chunks where candidate was speaker or mentioned.

3. Chroma:
   Semantic search within relevant chunks:
   "housing affordability", "rent", "zoning", "social housing", "first home buyers"

4. Re-ranker:
   Prefer direct votes and direct speeches over weak mentions.

5. Answer:
   Separate evidence buckets:
   - What they said
   - How they voted
   - What others said about them
   - Party context
   - Donation/contextual evidence
My concrete recommendation

Keep using Chroma, but demote it from database to retrieval index.

A solid MVP would be:

Relational DB:
- candidates
- parties
- documents
- chunks
- mentions
- relationships
- votes
- donations

Chroma:
- one vector record per useful chunk/person/role relationship
- metadata for filtering
- IDs pointing back to your relational DB

That gives you the best of both worlds: Chroma for fuzzy semantic discovery, and a proper database for exact political facts, provenance, and relationship modelling.