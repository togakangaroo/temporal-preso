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
  explainer: [
    {
      heading: "What's going on",
      body: [
        "georgeporal stops using `for await` and steps the generator by hand with `execution.next()`. After carrying out each command, it appends `{ seq, command }` to an event history and writes the whole history to localStorage.",
        "The history panel shows each event as it's recorded. After a crash, it's still there when the page loads, in italics.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "Every Temporal workflow execution has an Event History: an append-only log of everything that happened to it, kept by the Temporal server. That history, not any process's memory, is the source of truth for where a workflow is. Workers can come and go because the history stays.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "We record everything and read nothing. Press Start after a crash and the history is overwritten from event #1.",
        "Note too that the command runs before it's recorded. A crash in the gap between them means it runs a second time on the next attempt. That gap never fully goes away: it's why Temporal gives at-least-once guarantees for side effects, not exactly-once.",
      ],
    },
  ],
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
