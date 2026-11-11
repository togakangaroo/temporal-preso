// Imported by relative path because the browser can't resolve bare package names.
// @ts-expect-error the browser build ships without type declarations
import hljs from "../../node_modules/@highlightjs/cdn-assets/es/core.min.js";
// @ts-expect-error the browser build ships without type declarations
import typescript from "../../node_modules/@highlightjs/cdn-assets/es/languages/typescript.min.js";

hljs.registerLanguage("typescript", typescript);

// A line ending in a tag like `// a` belongs to that group. The tag is shown as
// the line's background, so it's stripped from the text along with its padding.
const GROUP_TAG = /\s*\/\/ ([a-z])\s*$/;

// The file names its groups in a header, which becomes each line's tooltip:
//   // <token_keys>
//   // a: signals
//   // </token_keys>
const KEYS_HEADER = /^\/\/ <token_keys>\n([\s\S]*?)\/\/ <\/token_keys>\n/;

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

export function highlight(code: string): string {
  const header = code.match(KEYS_HEADER);
  const labels = new Map(
    [...(header?.[1] ?? "").matchAll(/^\/\/ ([a-z]): (.*)$/gm)].map(
      ([, key, label]) => [key, label],
    ),
  );
  const source = code.slice(header?.[0].length ?? 0).split("\n");
  const groups = source.map((line) => line.match(GROUP_TAG)?.[1]);
  const stripped = source.map((line) => line.replace(GROUP_TAG, "")).join("\n");
  const html: string = hljs.highlight(stripped, { language: "typescript" }).value;

  // A highlighted span can run across lines (a long comment, say), so each line
  // closes the spans still open at its end and the next line reopens them.
  let open: string[] = [];
  const lines = html.split("\n").map((line, i) => {
    const reopened = open.join("");
    for (const [tag] of line.matchAll(/<span[^>]*>|<\/span>/g)) {
      if (tag === "</span>") open.pop();
      else open.push(tag);
    }
    const key = groups[i];
    const group = key ? ` group-${key}` : "";
    const label = key && labels.get(key);
    const title = label ? ` title="${escapeAttribute(label)}"` : "";
    const body = reopened + line + "</span>".repeat(open.length);
    return `<span class="line${group}"${title}>${body}</span>`;
  });
  return `<span class="lines">${lines.join("")}</span>`;
}
