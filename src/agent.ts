import Anthropic from "@anthropic-ai/sdk";
import ora, { type Ora } from "ora";
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
  private containerId: string | undefined;

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
    let spinner: Ora | null = null;

    try {
      while (iterations < this.maxIterations) {
        iterations++;

        const tools: Anthropic.Messages.ToolUnion[] = [
          ...this.registry.getToolDefinitions(),
          { type: "web_search_20260209", name: "web_search" },
        ];

        const params: Anthropic.MessageCreateParams = {
          model: CONFIG.model,
          max_tokens: CONFIG.maxTokens,
          thinking: { type: "adaptive" },
          system: CONFIG.systemPrompt,
          tools,
          messages: [...this.history],
          ...(this.containerId ? { container: this.containerId } : {}),
        };

        // Show spinner while waiting for API response
        if (spinner) spinner.stop();
        spinner = ora({ text: "Thinking...", stream: process.stderr }).start();

        const response = await this.client.messages.create(params);

        // Track container ID for server-side tool reuse
        if (response.container?.id) {
          this.containerId = response.container.id;
        }

        // Append assistant response to history BEFORE processing tool calls
        this.history.push({ role: "assistant", content: response.content });

        // If Claude is done talking, render markdown and return
        if (response.stop_reason === "end_turn") {
          spinner.stop();
          spinner = null;
          const text = this.extractText(response.content);
          fullText += text;
          if (text) {
            process.stdout.write(renderMarkdown(text));
          }
          return fullText;
        }

        // Server-side tool hit its iteration limit — re-send to continue
        if (response.stop_reason === "pause_turn") {
          spinner.text = "Continuing...";
          continue;
        }

        // Claude wants to call tools
        if (response.stop_reason === "tool_use") {
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of response.content) {
            if (block.type === "tool_use") {
              spinner.text = block.name;

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

      if (spinner) spinner.stop();
      return "I've reached the maximum number of tool calls for this turn.";
    } catch (error) {
      if (spinner) spinner.stop();
      throw error;
    }
  }

  private extractText(content: Anthropic.Messages.ContentBlock[]): string {
    return content
      .filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === "text"
      )
      .map((block) => block.text)
      .join("\n");
  }
}
