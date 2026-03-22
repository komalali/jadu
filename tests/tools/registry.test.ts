import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tools/registry";

describe("ToolRegistry", () => {
  it("registers a tool and returns its definition", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "test_tool",
      description: "A test tool",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "string", description: "Test input" },
        },
        required: ["input"],
      },
      handler: (params: Record<string, unknown>) =>
        `echo: ${params.input}`,
    });

    const definitions = registry.getToolDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toEqual({
      name: "test_tool",
      description: "A test tool",
      input_schema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Test input" },
        },
        required: ["input"],
      },
    });
  });

  it("executes a registered tool by name", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "greet",
      description: "Greet someone",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Name" },
        },
        required: ["name"],
      },
      handler: (params: Record<string, unknown>) =>
        `Hello, ${params.name}!`,
    });

    const result = registry.execute("greet", { name: "Alice" });
    expect(result).toBe("Hello, Alice!");
  });

  it("throws when executing an unregistered tool", () => {
    const registry = new ToolRegistry();

    expect(() => registry.execute("nonexistent", {})).toThrow(
      'Unknown tool: "nonexistent"'
    );
  });

  it("reports whether a tool is a custom tool", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "my_tool",
      description: "test",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      handler: () => "ok",
    });

    expect(registry.isCustomTool("my_tool")).toBe(true);
    expect(registry.isCustomTool("web_search")).toBe(false);
  });
});
