import type {
  ClaimContent,
  ClaimOperation,
  ExtractionResult,
  SessionResponse,
  SessionSnapshot,
  VoterClaimRevision,
} from "@/types/voter-claims.zod";

export interface SessionReducerDependencies {
  createId: () => string;
  now: () => string;
}

export function createSessionSnapshot(
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const now = dependencies.now();
  return {
    schemaVersion: 1,
    sessionId: dependencies.createId(),
    createdAt: now,
    updatedAt: now,
    selectedRace: null,
    profileVersion: 0,
    responses: [],
    claims: [],
    extractions: [],
    queuedExtractionResults: [],
    pendingClaimOperations: [],
    transcriptSteps: [],
  };
}

export function recordResponse(
  snapshot: SessionSnapshot,
  response: SessionResponse,
): SessionSnapshot {
  if (snapshot.responses.some(({ id }) => id === response.id)) return snapshot;

  return {
    ...snapshot,
    updatedAt: response.submittedAt,
    responses: [...snapshot.responses, response],
    extractions: [
      ...snapshot.extractions,
      {
        responseId: response.id,
        baseProfileVersion: snapshot.profileVersion,
        status: response.kind === "political" ? "pending" : "skipped",
      },
    ],
  };
}

function createClaimRevision(
  claimId: string,
  revision: number,
  responseId: string,
  content: ClaimContent,
  dependencies: SessionReducerDependencies,
): VoterClaimRevision {
  return {
    ...content,
    claimId,
    revisionId: dependencies.createId(),
    revision,
    confirmedImportance: null,
    status: "active",
    sourceResponseId: responseId,
    createdAt: dependencies.now(),
  };
}

function applyOperation(
  claims: VoterClaimRevision[],
  operation: ClaimOperation,
  responseId: string,
  dependencies: SessionReducerDependencies,
): VoterClaimRevision[] {
  if (operation.kind === "uncertain") return claims;
  if (operation.kind === "create") {
    const claimId = dependencies.createId();
    return [
      ...claims,
      createClaimRevision(
        claimId,
        1,
        responseId,
        operation.content,
        dependencies,
      ),
    ];
  }

  const activeIndex = claims.findIndex(
    (claim) =>
      claim.claimId === operation.targetClaimId && claim.status === "active",
  );
  if (activeIndex < 0) {
    throw new Error(`Active claim not found: ${operation.targetClaimId}`);
  }

  const previous = claims[activeIndex];
  if (!previous) return claims;

  const superseded = claims.map((claim, index) =>
    index === activeIndex
      ? {
          ...claim,
          status: operation.kind === "retract" ? "retracted" : "superseded",
        }
      : claim,
  ) as VoterClaimRevision[];

  if (operation.kind === "retract") return superseded;

  return [
    ...superseded,
    createClaimRevision(
      previous.claimId,
      previous.revision + 1,
      responseId,
      operation.content,
      dependencies,
    ),
  ];
}

function applyReadyExtractionResult(
  snapshot: SessionSnapshot,
  result: ExtractionResult,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const extractionIndex = snapshot.extractions.findIndex(
    ({ responseId }) => responseId === result.responseId,
  );
  if (extractionIndex < 0) return snapshot;

  const extraction = snapshot.extractions[extractionIndex];
  if (
    !extraction ||
    (extraction.status !== "pending" && extraction.status !== "queued")
  ) {
    return snapshot;
  }

  const baseMatches =
    extraction.baseProfileVersion === result.baseProfileVersion &&
    snapshot.profileVersion === result.baseProfileVersion;
  const canRebaseIndependentOperations =
    result.operations.length > 0 &&
    result.operations.every(
      (operation) =>
        operation.kind === "create" ||
        (operation.kind === "uncertain" && operation.targetClaimId === null),
    );
  if (!baseMatches && !canRebaseIndependentOperations) {
    return {
      ...snapshot,
      updatedAt: dependencies.now(),
      extractions: snapshot.extractions.map((state, index) =>
        index === extractionIndex ? { ...state, status: "stale" } : state,
      ),
    };
  }

  let claims = snapshot.claims;
  const pendingClaimOperations = [...snapshot.pendingClaimOperations];
  try {
    for (const operation of result.operations) {
      if (operation.kind === "uncertain") {
        pendingClaimOperations.push({
          responseId: result.responseId,
          targetClaimId: operation.targetClaimId,
          content: operation.content,
          reason: operation.reason,
          createdAt: dependencies.now(),
        });
        continue;
      }
      claims = applyOperation(
        claims,
        operation,
        result.responseId,
        dependencies,
      );
    }
  } catch (error) {
    return {
      ...snapshot,
      updatedAt: dependencies.now(),
      extractions: snapshot.extractions.map((state, index) =>
        index === extractionIndex
          ? {
              ...state,
              status: "failed",
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown reducer error",
            }
          : state,
      ),
    };
  }

  return {
    ...snapshot,
    updatedAt: dependencies.now(),
    profileVersion: snapshot.profileVersion + 1,
    claims,
    pendingClaimOperations,
    extractions: snapshot.extractions.map((state, index) =>
      index === extractionIndex ? { ...state, status: "applied" } : state,
    ),
  };
}

function drainQueuedResults(
  snapshot: SessionSnapshot,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  let current = snapshot;

  while (true) {
    const extractionIndex = current.extractions.findIndex(
      (state, index) =>
        state.status === "queued" &&
        !current.extractions
          .slice(0, index)
          .some(({ status }) => status === "pending" || status === "queued"),
    );
    if (extractionIndex < 0) return current;

    const responseId = current.extractions[extractionIndex]?.responseId;
    const result = current.queuedExtractionResults.find(
      (queued) => queued.responseId === responseId,
    );
    if (!result) return current;

    current = applyReadyExtractionResult(
      {
        ...current,
        queuedExtractionResults: current.queuedExtractionResults.filter(
          (queued) => queued.responseId !== responseId,
        ),
      },
      result,
      dependencies,
    );
  }
}

export function applyExtractionResult(
  snapshot: SessionSnapshot,
  result: ExtractionResult,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const extractionIndex = snapshot.extractions.findIndex(
    ({ responseId }) => responseId === result.responseId,
  );
  if (extractionIndex < 0) return snapshot;

  const extraction = snapshot.extractions[extractionIndex];
  if (!extraction || extraction.status !== "pending") return snapshot;

  const hasUnresolvedPredecessor = snapshot.extractions
    .slice(0, extractionIndex)
    .some(({ status }) => status === "pending" || status === "queued");

  if (hasUnresolvedPredecessor) {
    return {
      ...snapshot,
      updatedAt: dependencies.now(),
      extractions: snapshot.extractions.map((state, index) =>
        index === extractionIndex ? { ...state, status: "queued" } : state,
      ),
      queuedExtractionResults: [...snapshot.queuedExtractionResults, result],
    };
  }

  return drainQueuedResults(
    applyReadyExtractionResult(snapshot, result, dependencies),
    dependencies,
  );
}

export function retagClaim(
  snapshot: SessionSnapshot,
  claimId: string,
  topicTags: string[],
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const uniqueTags = [
    ...new Set(topicTags.map((tag) => tag.trim()).filter(Boolean)),
  ];
  const activeIndex = snapshot.claims.findIndex(
    (claim) => claim.claimId === claimId && claim.status === "active",
  );
  const current = snapshot.claims[activeIndex];
  if (
    !current ||
    JSON.stringify(current.topicTags) === JSON.stringify(uniqueTags)
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    updatedAt: dependencies.now(),
    claims: snapshot.claims.map((claim, index) =>
      index === activeIndex ? { ...claim, topicTags: uniqueTags } : claim,
    ),
  };
}

export function confirmClaimImportance(
  snapshot: SessionSnapshot,
  claimId: string,
  importance: number,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  if (importance < 0 || importance > 1) {
    throw new Error("Claim importance must be between 0 and 1");
  }
  const activeIndex = snapshot.claims.findIndex(
    (claim) => claim.claimId === claimId && claim.status === "active",
  );
  const current = snapshot.claims[activeIndex];
  if (!current || current.confirmedImportance === importance) return snapshot;
  return {
    ...snapshot,
    updatedAt: dependencies.now(),
    profileVersion: snapshot.profileVersion + 1,
    claims: snapshot.claims.map((claim, index) =>
      index === activeIndex
        ? { ...claim, confirmedImportance: importance }
        : claim,
    ),
  };
}

export function failExtraction(
  snapshot: SessionSnapshot,
  responseId: string,
  error: string,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const index = snapshot.extractions.findIndex(
    (state) => state.responseId === responseId,
  );
  const extraction = snapshot.extractions[index];
  if (!extraction || extraction.status !== "pending") return snapshot;
  return drainQueuedResults(
    {
      ...snapshot,
      updatedAt: dependencies.now(),
      extractions: snapshot.extractions.map((state, stateIndex) =>
        stateIndex === index ? { ...state, status: "failed", error } : state,
      ),
    },
    dependencies,
  );
}

export function retryExtraction(
  snapshot: SessionSnapshot,
  responseId: string,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  const index = snapshot.extractions.findIndex(
    (state) => state.responseId === responseId,
  );
  const extraction = snapshot.extractions[index];
  if (
    !extraction ||
    (extraction.status !== "failed" && extraction.status !== "stale")
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    updatedAt: dependencies.now(),
    extractions: snapshot.extractions.map((state, stateIndex) =>
      stateIndex === index
        ? {
            responseId: state.responseId,
            baseProfileVersion: snapshot.profileVersion,
            status: "pending",
          }
        : state,
    ),
  };
}

export function selectRace(
  snapshot: SessionSnapshot,
  selectedRace: string,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  if (snapshot.selectedRace === selectedRace) return snapshot;
  return { ...snapshot, selectedRace, updatedAt: dependencies.now() };
}

export function resetSession(
  _snapshot: SessionSnapshot,
  dependencies: SessionReducerDependencies,
): SessionSnapshot {
  return createSessionSnapshot(dependencies);
}
