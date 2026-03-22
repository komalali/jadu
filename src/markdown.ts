import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import chalk from "chalk";

let _marked: Marked | null = null;

export function renderMarkdown(text: string): string {
  if (!_marked) {
    // Downgrade h1 to h2 so marked-terminal doesn't center the first heading
    const preprocessor = {
      extensions: [
        {
          name: "heading" as const,
          level: "block" as const,
          tokenizer(): undefined {
            return undefined; // fall through to default
          },
        },
      ],
      hooks: {
        preprocess(src: string): string {
          // Replace leading "# " with "## " so all headings render the same
          return src.replace(/^# /gm, "## ");
        },
      },
    };

    _marked = new Marked(
      preprocessor,
      markedTerminal({
        firstHeading: chalk.bold.green,
        heading: chalk.bold.green,
        showSectionPrefix: false,
      })
    );
  }
  return (_marked.parse(text) as string).replace(/\n+$/, "");
}
