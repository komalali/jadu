import { ToolRegistry } from "./registry";

export function getCurrentDateHandler(_params: Record<string, unknown>): string {
  return new Date().toISOString();
}

export function registerDateTools(registry: ToolRegistry): void {
  registry.register({
    name: "get_current_date",
    description: "Get the current date and time in ISO 8601 format.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: getCurrentDateHandler,
  });
}
