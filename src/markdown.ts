import { Marked } from "marked";

let _marked: Marked | null = null;

export async function renderMarkdown(text: string): Promise<string> {
  if (!_marked) {
    const markedTerminal = (await import("marked-terminal")).default;
    _marked = new Marked(markedTerminal() as any);
  }
  return (_marked.parse(text) as string).replace(/\n+$/, "");
}
