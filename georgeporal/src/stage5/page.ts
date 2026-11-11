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
  explainer: [
    {
      heading: "What's going on",
      body: [
        "An activity is a plain async function, here one that picks a random number. The workflow doesn't call it directly. It calls `callActivity(fn, args)`, which records `activityStarted` with the name and args, runs the function, then records `activityCompleted` with the result.",
        "On replay, `callActivity` finds both events already in the history and returns the recorded result without running the function at all. The randomness happened once. Replay just reads back what it was.",
        "`callActivity` is awaited rather than yielded, so it never passes through `run`'s loop. It reaches the running workflow's history through module-level state instead.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is the core split in Temporal. Workflows are deterministic orchestration, and activities are everything else: network calls, databases, randomness, anything that can fail or vary. An activity's result is stored in the Event History, and replay reads that result instead of running the activity again. Real activities also get retries and timeouts.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "Replay still compares the activity's name and args. Change the args in the workflow and Resume, and you get a nondeterminism error. Results also have to be serializable, because they live in the history. In real Temporal, big results bloat the history, and there are size limits.",
      ],
    },
  ],
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
