/**
 * Transport for the consultation loop: POSTs the Converse transcript to the
 * Lambda proxy and returns the model's next step. The API URL comes from
 * VITE_AGENT_API_URL at build time; when unset the consult UI stays hidden.
 */
import type { AgentRequest, AgentResponse } from "./loop";

export class AgentApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function agentApiUrl(): string | null {
  const url = import.meta.env.VITE_AGENT_API_URL;
  return typeof url === "string" && url.trim() !== "" ? url.trim() : null;
}

export function createAgentCaller(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): (request: AgentRequest) => Promise<AgentResponse> {
  return async (request) => {
    const response = await fetchImpl(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text === "" ? null : JSON.parse(text);
    } catch {
      // Non-JSON error bodies (proxy HTML pages, etc.) fall through to status handling.
    }
    if (!response.ok) {
      const serverError = (parsed as { error?: { code?: string; message?: string } } | null)?.error;
      throw new AgentApiError(
        response.status,
        serverError?.code ?? `http_${response.status}`,
        serverError?.message ?? `agent request failed (${response.status})`,
      );
    }
    const body = parsed as AgentResponse | null;
    if (body === null || typeof body.stopReason !== "string" || !Array.isArray(body.content)) {
      throw new AgentApiError(response.status, "bad_response", "agent response was malformed");
    }
    return body;
  };
}
