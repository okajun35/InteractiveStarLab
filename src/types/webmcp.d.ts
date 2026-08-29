import type { WebMcpModelContext } from "../mcp/webmcp";

declare global {
  interface Document {
    readonly modelContext?: WebMcpModelContext;
  }
}

export {};
