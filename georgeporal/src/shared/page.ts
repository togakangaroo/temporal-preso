// Demo chrome only: nothing in here is part of georgeporal itself.

import { highlight } from "./highlight.js";

const STAGES = [
  "Sync function",
  "Async iterable",
  "Event history",
  "Replay",
  "Activities",
  "Signals",
  "Task queue",
];

type PageOptions = {
  stage: number;
  blurb: string;
  tryThis: string;
  sources: { label: string; path: string }[];
  showHistory?: boolean;
  showQueue?: boolean;
  outputTitle?: string;
  // Below the fold: what this stage demonstrates. `backticks` become <code>.
  explainer: { heading: string; body: string[] }[];
};

type RecordedEvent = {
  seq: number;
  command: { type: string };
  result?: unknown;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function panel(title: string, body: HTMLElement): HTMLElement {
  const toggle = el(
    "button",
    { className: "expand", title: "Maximize", ariaLabel: "Maximize" },
    "🗖",
  );
  const section = el(
    "section",
    { className: "panel" },
    el("h2", {}, title, toggle),
    body,
  );
  toggle.onclick = () => {
    const maximized = section.classList.toggle("maximized");
    toggle.textContent = maximized ? "🗕" : "🗖";
    toggle.title = toggle.ariaLabel = maximized ? "Minimize" : "Maximize";
    // Resizing a log moves it off the bottom, which would stop it following output.
    if (body.classList.contains("log")) body.scrollTop = body.scrollHeight;
  };
  return section;
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelector<HTMLElement>(".panel.maximized .expand")?.click();
});

function prose(text: string): (Node | string)[] {
  return text
    .split("`")
    .map((part, i) => (i % 2 ? el("code", {}, part) : part));
}

function append(log: HTMLElement, text: string, className: string): void {
  const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  log.append(el("div", { className }, text));
  if (pinned) log.scrollTop = log.scrollHeight;
}

export function describeEvent({ seq, command, result }: RecordedEvent): string {
  const { type, ...args } = command;
  const returned = result === undefined ? "" : ` → ${JSON.stringify(result)}`;
  const shownArgs = Object.values(args)
    .filter((arg) => arg !== undefined)
    .map((arg) => JSON.stringify(arg));
  return `#${seq} ${type}(${shownArgs.join(", ")})${returned}`;
}

export function mountPage(options: PageOptions) {
  const { stage, blurb, tryThis, sources, showHistory, showQueue } = options;
  document.title = `Stage ${stage}: ${STAGES[stage - 1]}`;

  const start = el("button", { className: "primary" }, "Start");
  const controls = el("div", { className: "controls" }, start);
  const status = el("span", { className: "status" }, "idle");
  const output = el("div", { className: "log" });
  const history = el("div", { className: "log" });
  const queue = el("div", { className: "log" });

  const crash = el("button", {}, "Crash (reload page)");
  crash.onclick = () => location.reload();
  controls.append(crash, status);

  const nav = el(
    "nav",
    {},
    el("a", { href: "./index.html" }, "georgeporal"),
    ...STAGES.map((name, i) =>
      el(
        "a",
        {
          href: `./stage-${i + 1}.html`,
          className: i + 1 === stage ? "current" : "",
        },
        `${i + 1}. ${name}`,
      ),
    ),
  );

  const runPanels = el(
    "div",
    { className: "column" },
    panel(options.outputTitle ?? "Output", output),
  );
  if (showHistory) runPanels.append(panel("Event history", history));
  if (showQueue) runPanels.append(panel("Task queue", queue));

  const codePanels = el("div", { className: "column" });
  for (const { label, path } of sources) {
    const code = el("pre", { className: "hljs" }, "loading…");
    codePanels.append(panel(label, code));
    fetch(path)
      .then((response) => response.text())
      .then((text) => (code.innerHTML = highlight(text)));
  }

  document.body.append(
    nav,
    el("h1", {}, `Stage ${stage}: ${STAGES[stage - 1]}`),
    el("p", { className: "blurb" }, blurb),
    el("p", { className: "try" }, el("strong", {}, "Try this: "), tryThis),
    controls,
    el("main", {}, runPanels, codePanels),
    el(
      "article",
      { className: "explainer" },
      ...options.explainer.flatMap(({ heading, body }) => [
        el("h3", {}, heading),
        ...body.map((paragraph) => el("p", {}, ...prose(paragraph))),
      ]),
    ),
  );

  const setStatus = (text: string, className = "") => {
    status.textContent = text;
    status.className = `status ${className}`;
  };

  return {
    setStatus,
    setStartLabel: (label: string) => (start.textContent = label),
    addControl(label: string, onClick: () => void) {
      const button = el("button", {}, label);
      button.onclick = onClick;
      crash.before(button);
      return button;
    },
    print: (text: string, className = "") => append(output, text, className),
    addEvent: (text: string, className = "") =>
      append(history, text, className),
    setQueue: (lines: { text: string; className?: string }[]) =>
      queue.replaceChildren(
        ...lines.map(({ text, className = "" }) => el("div", { className }, text)),
      ),
    onStart(run: () => Promise<void>) {
      start.onclick = async () => {
        start.disabled = true;
        output.replaceChildren();
        history.replaceChildren();
        setStatus("running", "running");
        try {
          await run();
          setStatus("completed", "completed");
        } catch (error) {
          setStatus(String(error), "failed");
        }
      };
    },
  };
}
