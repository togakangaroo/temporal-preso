import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory } from "../stage3/georgeporal.js";
import {
  HISTORY_KEY,
  loadHistory,
  run,
  type HistoryEvent,
} from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 5,
  showHistory: true,
  blurb:
    "Activities are plain async functions, where non-deterministic work belongs. Workflows await them through callActivity, which records when one starts and what it returned. On replay the activity isn't run at all: the recorded result comes straight out of history.",
  tryThis:
    "crash, then Resume: the same random numbers come back without the activity running. Then change the args passed to callActivity and Resume again.",
  sources: [
    { label: "src/stage5/workflow.ts", path: "./src/stage5/workflow.ts" },
    { label: "src/stage5/georgeporal.ts", path: "./src/stage5/georgeporal.ts" },
  ],
});

function describe({ seq, ...command }: HistoryEvent): string {
  return describeEvent({ seq, command });
}

page.addControl("Clear history", () => {
  clearHistory(HISTORY_KEY);
  location.reload();
});

const stored = loadHistory();
for (const event of stored) page.addEvent(describe(event), "stored");
if (stored.length > 0) {
  page.setStartLabel("Resume");
  page.setStatus(`${stored.length} events in history`);
}

page.onStart(() =>
  run(fizzbuzzWorkflow, page.print, (event, replayed) => {
    const className = replayed ? "replayed" : "";
    page.addEvent(describe(event), className);
    if (replayed && event.type === "print") page.print(event.text, className);
  }),
);
