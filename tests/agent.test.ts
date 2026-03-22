import { describe, it, expect, vi } from "vitest";
import { AgentLoop } from "../src/agent";
import { ToolRegistry } from "../src/tools/registry";

function makeTextResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    stop_reason: "end_turn" as const,
  };
}

function makeToolUseResponse(toolName: string, toolInput: Record<string, unknown>, toolId: string) {
  return {
    content: [
      {
        type: "tool_use" as const,
        id: toolId,
        name: toolName,
        input: toolInput,
      },
    ],
    stop_reason: "tool_use" as const,
  };
}

function makePauseTurnResponse() {
  return {
    content: [{ type: "text" as const, text: "Searching..." }],
    stop_reason: "pause_turn" as const,
  };
}

describe("AgentLoop", () => {
  it("returns text when Claude responds with end_turn", async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce(makeTextResponse("Hello!"));
    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Hi");

    expect(result).toBe("Hello!");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("executes a tool call and sends result back", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(
        makeToolUseResponse("test_tool", { input: "abc" }, "tool_1")
      )
      .mockResolvedValueOnce(makeTextResponse("Done!"));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "test_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: (params: Record<string, unknown>) => `result: ${params.input}`,
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use the tool");

    expect(result).toBe("Done!");
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Verify the second call includes the tool result in history
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0].type).toBe("tool_result");
    expect(toolResultMessage.content[0].tool_use_id).toBe("tool_1");
    expect(toolResultMessage.content[0].content).toBe("result: abc");
  });

  it("handles multiple tool calls in one response", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use" as const, id: "t1", name: "tool_a", input: {} },
          { type: "tool_use" as const, id: "t2", name: "tool_b", input: {} },
        ],
        stop_reason: "tool_use" as const,
      })
      .mockResolvedValueOnce(makeTextResponse("Both done!"));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "tool_a",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "result_a",
    });
    registry.register({
      name: "tool_b",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "result_b",
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use both tools");

    expect(result).toBe("Both done!");

    // Verify both tool results were sent back
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content).toHaveLength(2);
    expect(toolResultMessage.content[0].tool_use_id).toBe("t1");
    expect(toolResultMessage.content[1].tool_use_id).toBe("t2");
  });

  it("sends tool errors back with is_error flag", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(
        makeToolUseResponse("bad_tool", {}, "tool_2")
      )
      .mockResolvedValueOnce(makeTextResponse("I see the error."));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "bad_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => {
        throw new Error("Something went wrong");
      },
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use the bad tool");

    expect(result).toBe("I see the error.");

    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0].is_error).toBe(true);
    expect(toolResultMessage.content[0].content).toBe("Something went wrong");
  });

  it("continues on pause_turn and eventually gets end_turn", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(makePauseTurnResponse())
      .mockResolvedValueOnce(makeTextResponse("Search complete."));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Search the web");

    expect(result).toBe("Search complete.");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("stops after max iterations", async () => {
    const mockCreate = vi.fn().mockResolvedValue(
      makeToolUseResponse("loop_tool", {}, "tool_loop")
    );

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "loop_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "ok",
    });

    const agent = new AgentLoop(mockClient, registry, { maxIterations: 3 });
    const result = await agent.run("Loop forever");

    expect(result).toContain("maximum number of tool calls");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});
