import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory, loadHistory, run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 3,
  showHistory: true,
  blurb:
    "georgeporal now unwinds the generator by hand, recording every command it carries out to an event history in localStorage.",
  tryThis:
    "crash, and the history is still there. Press Start and it gets overwritten from 1: we've recorded everything but nothing reads it yet.",
  sources: [
    { label: "src/stage3/workflow.ts", path: "./src/stage3/workflow.ts" },
    { label: "src/stage3/georgeporal.ts", path: "./src/stage3/georgeporal.ts" },
  ],
});

page.addControl("Clear history", () => {
  clearHistory();
  location.reload();
});

for (const event of loadHistory()) {
  page.addEvent(describeEvent(event), "stored");
}

page.onStart(() =>
  run(fizzbuzzWorkflow, page.print, (event) =>
    page.addEvent(describeEvent(event)),
  ),
);
