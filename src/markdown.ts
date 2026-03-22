import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

let _marked: Marked | null = null;

export function renderMarkdown(text: string): string {
  if (!_marked) {
    _marked = new Marked(
      markedTerminal({
        // Use consistent heading style (no right-aligned first heading)
        firstHeading: chalk.bold.green,
        heading: chalk.bold.green,
        // Don't show section prefix (the ## markers)
        showSectionPrefix: false,
      })
    );
  }
  return (_marked.parse(text) as string).replace(/\n+$/, "");
}
