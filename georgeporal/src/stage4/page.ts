import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory, loadHistory } from "../stage3/georgeporal.js";
import { HISTORY_KEY, run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 4,
  showHistory: true,
  blurb:
    "Before doing anything real, georgeporal walks the recorded history alongside the generator. The workflow re-runs from line 1 and rebuilds its own local state, and the side effects are skipped. The sleep is a fixed 1.5 seconds now: a fresh Math.random() on replay wouldn't match the history.",
  tryThis:
    "crash, then Resume. Replay takes no time because no sleep really happens, and the count picks up where it left off. Then change the workflow's code and Resume again.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "On Resume, georgeporal zips the stored history together with a brand-new run of the workflow. The workflow starts over from its first line, and for each command it yields, georgeporal checks it against the recorded event at that position. If they match, the command already happened, so it's skipped: no print, no sleep. Once the history runs out, georgeporal is caught up and starts carrying out commands for real again.",
        "Re-running the code is what rebuilds the workflow's state. Nothing about `n` was ever saved. It comes back because the same code, fed the same history, reaches the same place.",
        "If a yielded command doesn't match the history, georgeporal throws a nondeterminism error. That's why the sleep is a fixed 1.5 seconds here. With `Math.random()`, replay would yield a different duration than the one recorded.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is exactly how a Temporal worker recovers a workflow, or picks one up on a different machine. It replays the workflow code against the Event History, matching commands to events, until it reaches the end. A mismatch raises a nondeterminism error. It's the source of Temporal's best-known rule: workflow code must be deterministic.",
        "Temporal's TypeScript SDK runs workflows in a sandbox that makes `Math.random()` and `Date.now()` deterministic for you. Changing a running workflow's code safely takes versioning, with `patched()` or worker versioning.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "Try editing the workflow so it yields something different, then Resume: replay fails. And we had to give up randomness entirely. Real workflows have to call APIs, read clocks and roll dice, so they need somewhere to put that kind of work.",
      ],
    },
  ],
  sources: [
    { label: "src/stage4/workflow.ts", path: "./src/stage4/workflow.ts" },
    { label: "src/stage4/georgeporal.ts", path: "./src/stage4/georgeporal.ts" },
  ],
});

page.addControl("Clear history", () => {
  clearHistory(HISTORY_KEY);
  location.reload();
});

const stored = loadHistory(HISTORY_KEY);
for (const event of stored) page.addEvent(describeEvent(event), "stored");
if (stored.length > 0) {
  page.setStartLabel("Resume");
  page.setStatus(`${stored.length} events in history`);
}

page.onStart(() =>
  run(fizzbuzzWorkflow, page.print, (event, replayed) => {
    const className = replayed ? "replayed" : "";
    page.addEvent(describeEvent(event), className);
    if (replayed && event.command.type === "print") {
      page.print(event.command.text, className);
    }
  }),
);
