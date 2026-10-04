import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  setItemDecision,
  type ItemDecision,
  type PlanProposal,
} from "../proposals/model";
import { createObservationPlanFromStarIds } from "../mcp/services";
import { useObservation } from "./observation";
import type { ObservationMission } from "../types/observation";

export interface ProposalState {
  /** The staged proposal under review, or null. A new proposal replaces it. */
  proposal: PlanProposal | null;
  propose: (proposal: PlanProposal) => void;
  decideItem: (starId: string, decision: ItemDecision) => void;
  /**
   * Materializes the accepted subset into a real Mission via the normal
   * creation path and marks the proposal committed. The Mission itself is
   * immutable from creation, exactly like one created directly.
   */
  commit: (proposal: PlanProposal, starIds: string[]) => Promise<ObservationMission>;
}

const ProposalContext = createContext<ProposalState | null>(null);

export function ProposalProvider({ children }: { children: React.ReactNode }) {
  const { createMissionAndPersist } = useObservation();
  const [proposal, setProposal] = useState<PlanProposal | null>(null);

  const propose = useCallback((next: PlanProposal) => {
    setProposal(next);
  }, []);

  const decideItem = useCallback((starId: string, decision: ItemDecision) => {
    setProposal((previous) =>
      previous === null ? previous : setItemDecision(previous, starId, decision),
    );
  }, []);

  const commit = useCallback(
    async (proposalToCommit: PlanProposal, starIds: string[]): Promise<ObservationMission> => {
      const planned = createObservationPlanFromStarIds({
        site: { ...proposalToCommit.siteSnapshot },
        dateTime: proposalToCommit.dateTime,
        maxMagnitude: proposalToCommit.maxMagnitude,
        starIds,
      });
      const mission = await createMissionAndPersist({
        dateTime: planned.dateTime,
        maxMagnitude: planned.maxMagnitude,
        targets: planned.targets,
      });
      setProposal((previous) =>
        previous !== null && previous.id === proposalToCommit.id
          ? { ...previous, status: "committed", commitMissionId: mission.id }
          : previous,
      );
      return mission;
    },
    [createMissionAndPersist],
  );

  const value = useMemo<ProposalState>(
    () => ({ proposal, propose, decideItem, commit }),
    [proposal, propose, decideItem, commit],
  );

  return <ProposalContext.Provider value={value}>{children}</ProposalContext.Provider>;
}

export function useProposals(): ProposalState {
  const context = useContext(ProposalContext);
  if (context === null) throw new Error("useProposals must be used inside <ProposalProvider>");
  return context;
}
