export interface WebMcpSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: readonly (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: WebMcpSchemaProperty;
  properties?: Record<string, WebMcpSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
  oneOf?: WebMcpJsonSchema[];
}

export interface WebMcpJsonSchema extends WebMcpSchemaProperty {
  type: "object";
}

export interface WebMcpToolExecutionContext {
  signal: AbortSignal;
}

export interface WebMcpTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: WebMcpJsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: unknown,
    context?: WebMcpToolExecutionContext,
  ) => string | Promise<string>;
}

export interface WebMcpRegisterOptions {
  signal?: AbortSignal;
}

export interface WebMcpModelContext {
  registerTool(
    tool: WebMcpTool,
    options?: WebMcpRegisterOptions,
  ): Promise<void>;
  unregisterTool?(name: string): Promise<void> | void;
}

export type WebMcpAvailability = "unknown" | "ready" | "unavailable" | "error";

export function getModelContext(): WebMcpModelContext | null {
  if (typeof document === "undefined") return null;
  return document.modelContext ?? null;
}
