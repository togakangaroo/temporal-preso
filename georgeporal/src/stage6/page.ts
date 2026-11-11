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
  explainer: [
    {
      heading: "What's going on",
      body: [
        "A signal is input from outside a running workflow, here the \"Jump to number\" button. `sendSignal` records `signalReceived` at whatever point in history it arrives, runs the workflow's registered handler, and records `signalHandled` with the result.",
        "On replay, whenever the next event is a `signalReceived`, georgeporal runs the handler again at that exact point. Unlike an activity, the handler is not memoized: its whole job is changing the workflow's local state (`n`), and that state only exists if the handler really runs again during replay.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "Temporal signals work the same way. Each one is appended to the history as a `WorkflowExecutionSignaled` event, and its handler is workflow code that re-runs on replay. That means handlers have to be deterministic too. Temporal also has queries for read-only access and updates for request/response.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "A handler has to be registered before its signal is replayed, and it must do the same thing every time. Signals also arrive while the workflow is in the middle of something, such as a sleep. Where a signal lands in the history is part of the history, and replay has to deliver it at exactly that spot.",
      ],
    },
  ],
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
