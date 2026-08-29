import type { ObservationGuideModel } from "../guides/types";
import type { CloudMissionSnapshotReference } from "../cloud/snapshotReference";
import { assertObject, assertOnlyKeys, optionalInteger, requiredString, ToolExecutionError } from "./input";
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface GuideToolState {
  getMissions: () => readonly { id: string }[];
  getSelectedGuide: () => ObservationGuideModel | null;
  prepareGuide: (missionId: string, options?: { title?: string; durationMinutes?: number; timeZone?: string }) => ObservationGuideModel | null;
  generatePdfForGuide: (guide: ObservationGuideModel) => Promise<{ fileName: string; downloadUrl: string }>;
  openGuide: () => void;
  getSnapshotInfo?: (missionId: string) => Promise<CloudMissionSnapshotReference | null>;
}

function safeExecuteAsync<T>(operation: () => Promise<T>): Promise<string> {
  return operation()
    .then((value) => JSON.stringify({ ok: true, data: value }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Guide generation failed";
      const code = error instanceof ToolExecutionError
        ? error.code
        : message.includes("PDF download") || message.includes("PDF")
          ? "GUIDE_PDF_UNAVAILABLE"
          : "INVALID_ARGUMENT";
      return JSON.stringify({ ok: false, error: { code, message } });
    });
}

function generateObservationGuideTool(state: GuideToolState): WebMcpTool {
  return {
    name: "generate_observation_guide",
    title: "Prepare observation guide",
    description: "Prepares a print-ready Observation Guide using the Mission creation-time site, date, and fixed star predictions. It includes a deterministic Mission Sky Snapshot as inline SVG and generates a PDF directly in the browser. The tool does not return the PDF binary to the Agent; it starts a browser download, while the Guide screen also offers Print / Save as PDF.",
    inputSchema: {
      type: "object",
      properties: {
        missionId: { type: "string", description: "Existing Mission ID" },
        title: { type: "string", minLength: 1, maxLength: 80, description: "Optional guide title" },
        durationMinutes: { type: "integer", minimum: 5, maximum: 180, description: "Optional observation duration" },
        timeZone: { type: "string", description: "Optional IANA time zone for printed time" },
      },
      required: ["missionId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: async (input) => safeExecuteAsync(async () => {
      const object = assertObject(input);
      assertOnlyKeys(object, ["missionId", "title", "durationMinutes", "timeZone"]);
      const missionId = requiredString(object, "missionId");
      if (!state.getMissions().some((mission) => mission.id === missionId)) {
        throw new ToolExecutionError("MISSION_NOT_FOUND", `mission not found: ${missionId}`);
      }
      let title: string | undefined;
      if (object.title !== undefined) {
        if (typeof object.title !== "string") throw new Error("title must be a string");
        title = object.title;
      }
      const durationMinutes = optionalInteger(object, "durationMinutes");
      let timeZone: string | undefined;
      if (object.timeZone !== undefined) {
        if (typeof object.timeZone !== "string") throw new Error("timeZone must be a string");
        timeZone = object.timeZone;
      }
      const guide = state.prepareGuide(missionId, {
        ...(title === undefined ? {} : { title }),
        ...(durationMinutes === undefined ? {} : { durationMinutes }),
        ...(timeZone === undefined ? {} : { timeZone }),
      });
      if (guide === null) throw new ToolExecutionError("MISSION_NOT_FOUND", `mission not found: ${missionId}`);
      const pdf = await state.generatePdfForGuide(guide);
      const snapshot = state.getSnapshotInfo === undefined ? null : await state.getSnapshotInfo(missionId);
      state.openGuide();
      return {
        guideId: guide.descriptor.guideId,
        missionId: guide.descriptor.missionId,
        status: "ready" as const,
        view: "guide" as const,
        fileNameHint: pdf.fileName,
        pdfGenerated: true,
        downloadAvailable: true,
        downloadUrl: pdf.downloadUrl,
        snapshotIncluded: true,
        snapshotSource: snapshot === null
          ? "mission" as const
          : "stored_actual_canvas_and_mission_vector_guide" as const,
        snapshotArchived: snapshot !== null,
        ...(snapshot === null ? {} : {
          snapshotId: snapshot.snapshotId,
          snapshotCapturedAt: snapshot.createdAt,
        }),
        snapshotArchiveSource: snapshot === null
          ? "mission_vector_guide_only" as const
          : "stored_actual_canvas_and_mission_vector_guide" as const,
        snapshotDateTime: guide.skySnapshot.dateTime,
        targetCount: guide.targets.length,
        actionRequired: "PDF download started",
      };
    }),
  };
}

export async function registerGuideTools(
  modelContext: WebMcpModelContext,
  state: GuideToolState,
  options: WebMcpRegisterOptions = {},
): Promise<void> {
  await modelContext.registerTool(generateObservationGuideTool(state), options);
}
