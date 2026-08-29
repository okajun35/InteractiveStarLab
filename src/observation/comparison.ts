import type { ObservationComparison, ObservationRecord } from "../types/observation";

export function compareObservationRecord(record: ObservationRecord): ObservationComparison {
  return {
    predicted: record.targets.filter((target) => target.predictedVisible).length,
    visible: record.results.filter((result) => result.status === "visible").length,
    notVisible: record.results.filter((result) => result.status === "not_visible").length,
    unsure: record.results.filter((result) => result.status === "unsure").length,
  };
}
