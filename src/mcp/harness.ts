/**
 * In-app agent harness: a WebMcpModelContext that keeps a local copy of every
 * registered tool so the tools can be exercised from the page even when the
 * browser exposes no `document.modelContext`. When a real context exists,
 * registration is forwarded so both stay in step.
 */
import type { WebMcpModelContext, WebMcpRegisterOptions, WebMcpTool } from "./webmcp";

export interface HarnessModelContext {
  /** Drop-in registration target for the register*Tools functions. */
  modelContext: WebMcpModelContext;
  /** Every tool registered so far, in registration order. */
  readonly tools: readonly WebMcpTool[];
  /** Look up a tool by name, or undefined when it is not registered. */
  find(name: string): WebMcpTool | undefined;
}

export function createHarnessModelContext(
  real: WebMcpModelContext | null,
): HarnessModelContext {
  const tools: WebMcpTool[] = [];
  return {
    get tools() {
      return tools;
    },
    find(name: string) {
      return tools.find((tool) => tool.name === name);
    },
    modelContext: {
      async registerTool(tool: WebMcpTool, options?: WebMcpRegisterOptions): Promise<void> {
        if (options?.signal?.aborted) return;
        const index = tools.findIndex((existing) => existing.name === tool.name);
        if (index >= 0) tools.splice(index, 1);
        tools.push(tool);
        if (real !== null) {
          await real.registerTool(tool, options);
        }
      },
      async unregisterTool(name: string): Promise<void> {
        const index = tools.findIndex((tool) => tool.name === name);
        if (index >= 0) tools.splice(index, 1);
        await real?.unregisterTool?.(name);
      },
    },
  };
}
