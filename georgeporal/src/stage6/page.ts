import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory } from "../stage3/georgeporal.js";
import {
  HISTORY_KEY,
  loadHistory,
  run,
  sendSignal,
  type HistoryEvent,
} from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 6,
  showHistory: true,
  blurb:
    "Signals let the outside world reach into a running workflow. georgeporal records each one at the exact point in history it landed, along with its handler's result. Unlike an activity, a handler is not memoized: on replay it really runs again at that same point, because changing the workflow's local state is its whole job.",
  tryThis:
    "while it's running, jump to 52, then crash and Resume. It comes back on the far side of the jump, because replay re-ran the handler.",
  sources: [
    { label: "src/stage6/workflow.ts", path: "./src/stage6/workflow.ts" },
    { label: "src/stage6/georgeporal.ts", path: "./src/stage6/georgeporal.ts" },
  ],
});

function describe({ seq, ...command }: HistoryEvent): string {
  return describeEvent({ seq, command });
}

const input = Object.assign(document.createElement("input"), {
  type: "number",
  value: "500",
});
const jump = page.addControl("Jump to number", () => {
  if (Number.isInteger(input.valueAsNumber)) {
    sendSignal("jump to number", input.valueAsNumber);
  }
});
jump.before(input);

const setRunning = (running: boolean) => {
  input.disabled = jump.disabled = !running;
};
setRunning(false);

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

page.onStart(async () => {
  setRunning(true);
  try {
    await run(fizzbuzzWorkflow, page.print, (event, replayed) => {
      const className = replayed ? "replayed" : "";
      page.addEvent(describe(event), className);
      if (replayed && event.type === "print") page.print(event.text, className);
    });
  } finally {
    setRunning(false);
  }
});
