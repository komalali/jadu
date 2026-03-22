import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";

let _marked: Marked | null = null;

export function renderMarkdown(text: string): string {
  if (!_marked) {
    _marked = new Marked(markedTerminal());
  }
  return (_marked.parse(text) as string).replace(/\n+$/, "");
}
