/**
 * Ghost plan proposals: an agent's staged plan a human reviews before anything
 * becomes a Mission. Proposals are not missions — they never enter the persisted
 * Mission list and disappear when the session ends. Only `commit` turns the
 * accepted items into a real Mission, which is immutable from that point on.
 *
 * Pure module: no React, no DOM, no persistence.
 */
import { STAR_BY_ID } from "../astronomy/stars";
import type { ObservationSite } from "../types/observation";

export type ItemDecision = "accepted" | "rejected";

export interface ProposalItem {
  starId: string;
  name: string;
  /** Items start "accepted" so the human only has to opt out of bad picks. */
  decision: ItemDecision;
}

/** The conditions the proposal was computed against — staleness compares these. */
export interface ProposalBasis {
  latitude: number;
  longitude: number;
  dateTime: string;
}

export interface PlanProposal {
  id: string;
  createdAt: string;
  siteSnapshot: ObservationSite;
  dateTime: string;
  maxMagnitude: number;
  items: ProposalItem[];
  basis: ProposalBasis;
  status: "pending" | "committed";
  commitMissionId?: string;
}

export interface StaleReason {
  field: "site" | "dateTime";
  expected: string;
  actual: string;
}

export interface ProposalDependencies {
  id: string;
  now: Date;
}

export function createPlanProposal(
  input: {
    site: ObservationSite;
    dateTime: string;
    maxMagnitude: number;
    starIds: string[];
  },
  deps: ProposalDependencies,
): PlanProposal {
  const items: ProposalItem[] = input.starIds.map((starId) => {
    const star = STAR_BY_ID.get(starId);
    if (star === undefined) throw new Error(`star not found: ${starId}`);
    return { starId, name: star.name, decision: "accepted" as const };
  });
  return {
    id: deps.id,
    createdAt: deps.now.toISOString(),
    siteSnapshot: { ...input.site },
    dateTime: input.dateTime,
    maxMagnitude: input.maxMagnitude,
    items,
    basis: {
      latitude: input.site.latitude,
      longitude: input.site.longitude,
      dateTime: input.dateTime,
    },
    status: "pending",
  };
}

export function setItemDecision(
  proposal: PlanProposal,
  starId: string,
  decision: ItemDecision,
): PlanProposal {
  if (!proposal.items.some((item) => item.starId === starId)) return proposal;
  return {
    ...proposal,
    items: proposal.items.map((item) =>
      item.starId === starId ? { ...item, decision } : item,
    ),
  };
}

export function acceptedStarIds(proposal: PlanProposal): string[] {
  return proposal.items
    .filter((item) => item.decision === "accepted")
    .map((item) => item.starId);
}

/**
 * Compares the proposal's basis to live conditions. A proposal is stale when the
 * site or the observation time it was computed against no longer matches, so the
 * human knows its per-star predictions may not hold any more.
 */
export function detectPlanStale(
  proposal: PlanProposal,
  current: { site: Pick<ObservationSite, "latitude" | "longitude">; dateTime: string },
): StaleReason[] {
  const reasons: StaleReason[] = [];
  if (
    proposal.basis.latitude !== current.site.latitude ||
    proposal.basis.longitude !== current.site.longitude
  ) {
    reasons.push({
      field: "site",
      expected: `${proposal.basis.latitude},${proposal.basis.longitude}`,
      actual: `${current.site.latitude},${current.site.longitude}`,
    });
  }
  const basisMs = new Date(proposal.basis.dateTime).getTime();
  const currentMs = new Date(current.dateTime).getTime();
  if (Number.isFinite(basisMs) && Number.isFinite(currentMs) && basisMs !== currentMs) {
    reasons.push({
      field: "dateTime",
      expected: proposal.basis.dateTime,
      actual: current.dateTime,
    });
  }
  return reasons;
}
