import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG, getApiKey } from "./config";
import { createDatabase } from "./db/connection";
import { ToolRegistry } from "./tools/registry";
import { registerDatabaseTools } from "./tools/database";
import { registerDateTools } from "./tools/date";
import { AgentLoop } from "./agent";

function main(): void {
  // Initialize
  const apiKey = getApiKey();
  const client = new Anthropic({ apiKey });
  const db = createDatabase(CONFIG.dbPath);

  // Set up tool registry
  const registry = new ToolRegistry();
  registerDatabaseTools(registry, db);
  registerDateTools(registry);

  // Create agent
  const agent = new AgentLoop(client, registry);

  // Set up REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Jadu — Gardening Assistant");
  console.log('Type your message, or "exit" to quit.\n');

  function prompt(): void {
    rl.question("> ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        shutdown();
        return;
      }

      try {
        const response = await agent.run(trimmed);
        console.log(`\n${response}\n`);
      } catch (error) {
        console.error(
          "\nError:",
          error instanceof Error ? error.message : String(error),
          "\n"
        );
      }

      prompt();
    });
  }

  let isShuttingDown = false;

  function shutdown(): void {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nGoodbye!");
    db.close();
    rl.close();
    process.exit(0);
  }

  // Handle Ctrl+C and Ctrl+D gracefully
  rl.on("close", shutdown);
  process.on("SIGINT", shutdown);

  prompt();
}

main();
