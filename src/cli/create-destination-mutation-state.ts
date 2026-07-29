import type { SigintCleanupOutcome } from "./register-sigint-handler.js";

type DestinationMutationPhase = "completed" | "none" | "started";

export function createDestinationMutationState(): {
  readonly getSigintOutcome: () => SigintCleanupOutcome;
  readonly onMutationPhase: (phase: Exclude<DestinationMutationPhase, "none">) => void;
} {
  let phase: DestinationMutationPhase = "none";

  return {
    getSigintOutcome: () => {
      if (phase === "completed") {
        return "destination-moved-to-trash";
      }
      return phase === "started" ? "destination-may-be-incomplete" : "none";
    },
    onMutationPhase: (nextPhase) => {
      phase = nextPhase;
    },
  };
}
