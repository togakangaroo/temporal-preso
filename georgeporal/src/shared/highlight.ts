// Imported by relative path because the browser can't resolve bare package names.
// @ts-expect-error the browser build ships without type declarations
import hljs from "../../node_modules/@highlightjs/cdn-assets/es/core.min.js";
// @ts-expect-error the browser build ships without type declarations
import typescript from "../../node_modules/@highlightjs/cdn-assets/es/languages/typescript.min.js";

hljs.registerLanguage("typescript", typescript);

export function highlight(code: string): string {
  return hljs.highlight(code, { language: "typescript" }).value;
}
