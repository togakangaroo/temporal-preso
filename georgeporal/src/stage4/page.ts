import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory, loadHistory } from "../stage3/georgeporal.js";
import { HISTORY_KEY, run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 4,
  showHistory: true,
  blurb:
    "Before doing anything real, georgeporal walks the recorded history alongside the generator. The workflow re-runs from line 1 and rebuilds its own local state, and the side effects are skipped. The sleep is a fixed 3 seconds now: a fresh Math.random() on replay wouldn't match the history.",
  tryThis:
    "crash, then Resume. Replay takes no time because no sleep really happens, and the count picks up where it left off. Then change the workflow's code and Resume again.",
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
