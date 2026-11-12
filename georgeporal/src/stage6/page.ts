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
    "Signals let the outside world reach into a running workflow. Here they are modeled as event-style callbacks that are free to modify system state.",
  tryThis:
    "while it's running, send a signal to jump to 500, then crash and Resume. It resumes right back where it was with the external signal recorded into the event history and replayed.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "Workflows sell themselves as code running on human time scales. This requires a model for how the outside world can interact with the workflow state. A signal is exactly is. Here the \"Jump to number\" button. `sendSignal` records `signalReceived` at whatever point in history it arrives, runs the workflow's registered handler, and records `signalHandled` with the result.",
        "On replay, a `signalReceived` is handled by running the handler again which allows it to change workflow state as it did on the first pass. Note this means that signal handlers *do* have to be deterministic.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "You interact with temporal workflows in the the same way. For example, a workflow can encapsulate a patient's SMS confersation with an AI agent. A component in your infrastructure can receive a webhook from Twilio then use the Temporal SDK to trigger the corresponding signal on the patient's workflow. The signal handler records the message received into a local vairable and it is now available for your workflow code to make decisions about. Temporal also offers extensions on the concept with queries for read-only access and updates for request/response.",
      ],
    },
    {
      heading: "We're almost there",
      body: [
        "We can now interact with the outside world and workflows can crash and restart durably. That's all we really need, but this setup has one more really useful trick up its sleeve.",
      ],
    },
  ],
  sources: [
    { label: "src/stage6/workflow.ts", path: "./src/stage6/workflow.ts" },
    { label: "src/stage6/georgeporal.ts", path: "./src/stage6/georgeporal.ts" },
  ],
});

function describe({ seq, result, ...command }: HistoryEvent): string {
  return describeEvent({ seq, command, result });
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
