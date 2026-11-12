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
    "Activities are plain async functions. This is where non-deterministic work belongs. A workflow awaits them through callActivity, which lets georgeporal record and memoize the results.",
  tryThis:
    "crash, then Resume: the same random numbers come back without the activity running. Then change the args passed to callActivity and Resume again.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "An activity is a plain async function. Activities are free to be non-deterministic, and ours just picks a random number. Rather than calling the function directly, the workflow creates a `callActivity` command saying it would like that function run. Our framework then runs the command, recording `activityStarted` and `activityCompleted` events, including the result.",
        "On replay, `run` finds both events already in the history and treats the function call as memoized, returning the recorded result; the function never runs again after its first success. In this way, even non-deterministic code can fit into our scheme.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is the core split in Temporal. Workflows are deterministic orchestration, and activities are everything else: network calls, databases, randomness, anything that can fail or vary. An activity's result is stored in the event history, and replay reads that result instead of running the activity again. Real activities also get retries and timeouts. You can hopefully see how easy that becomes in a system like this.",
      ],
    },
    {
      heading: "So that's it then?",
      body: [
        "Full durability, isn't that neat?",
        "There's more, though. Let's see what else we can get this setup to do.",
      ],
    },
  ],
  sources: [
    { label: "src/stage5/workflow.ts", path: "./src/stage5/workflow.ts" },
    { label: "src/stage5/georgeporal.ts", path: "./src/stage5/georgeporal.ts" },
  ],
});

function describe({ seq, result, ...command }: HistoryEvent): string {
  return describeEvent({ seq, command, result });
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
