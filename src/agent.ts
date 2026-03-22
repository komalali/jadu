import Anthropic from "@anthropic-ai/sdk";
import { ToolRegistry } from "./tools/registry";
import { CONFIG } from "./config";
import { renderMarkdown } from "./markdown";

interface AgentOptions {
  maxIterations?: number;
}

export class AgentLoop {
  private client: Anthropic;
  private registry: ToolRegistry;
  private maxIterations: number;
  private history: Anthropic.MessageParam[] = [];

  constructor(
    client: Anthropic,
    registry: ToolRegistry,
    options: AgentOptions = {}
  ) {
    this.client = client;
    this.registry = registry;
    this.maxIterations = options.maxIterations ?? CONFIG.maxIterations;
  }

  async run(userMessage: string): Promise<string> {
    this.history.push({ role: "user", content: userMessage });

    let iterations = 0;
    let fullText = "";

    while (iterations < this.maxIterations) {
      iterations++;

      // Build the tools array: custom tool definitions + built-in server-side tools
      const tools: Anthropic.Messages.ToolUnion[] = [
        ...this.registry.getToolDefinitions(),
        { type: "web_search_20260209", name: "web_search" },
        { type: "code_execution_20260120", name: "code_execution" },
      ];

      // Stream the response — text tokens print to stdout as they arrive
      const stream = this.client.messages.stream({
        model: CONFIG.model,
        max_tokens: CONFIG.maxTokens,
        thinking: { type: "adaptive" },
        system: CONFIG.systemPrompt,
        tools,
        messages: [...this.history],
      });

      // Save cursor position before streaming, so we can rewrite with markdown after
      let iterationText = "";
      process.stdout.write("\x1b[s"); // save cursor position

      // Print text deltas as they arrive
      stream.on("text", (delta) => {
        process.stdout.write(delta);
        iterationText += delta;
        fullText += delta;
      });

      // Wait for the complete message
      const response = await stream.finalMessage();

      // Append assistant response to history BEFORE processing tool calls
      this.history.push({ role: "assistant", content: response.content });

      // If Claude is done talking, replace raw text with rendered markdown
      if (response.stop_reason === "end_turn") {
        if (iterationText) {
          // Restore cursor to saved position and clear everything after it
          process.stdout.write("\x1b[u\x1b[0J");

          // Render and print markdown
          const rendered = renderMarkdown(iterationText);
          process.stdout.write(rendered);
        }
        return fullText;
      }

      // Server-side tool hit its iteration limit — re-send to continue
      if (response.stop_reason === "pause_turn") {
        continue;
      }

      // Claude wants to call tools
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            // Show tool call status (dim text so it doesn't compete with output)
            process.stderr.write(`\x1b[2m  ↳ ${block.name}\x1b[0m\n`);

            // Only dispatch custom tools — server-side tools are handled by Anthropic
            if (this.registry.isCustomTool(block.name)) {
              try {
                const result = this.registry.execute(
                  block.name,
                  block.input as Record<string, unknown>
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                });
              } catch (error) {
                process.stderr.write(
                  `\x1b[2m  ↳ error: ${error instanceof Error ? error.message : String(error)}\x1b[0m\n`
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content:
                    error instanceof Error ? error.message : String(error),
                  is_error: true,
                });
              }
            }
          }
        }

        if (toolResults.length > 0) {
          this.history.push({ role: "user", content: toolResults });
        }
      }
    }

    return "I've reached the maximum number of tool calls for this turn.";
  }
}
