import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory, loadHistory, run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 3,
  showHistory: true,
  blurb:
    "Now we start writing down everything that happens. Every command georgeporal carries out gets saved to an event history in localStorage.",
  tryThis:
    "Let it run a bit, then crash. The history survives, but press Start and it gets overwritten from 1 anyway.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "We ditch the `for await` and step through the generator by hand with `execution.next()`. That gives us a spot between commands to do stuff. After running each command we append `{ seq, command }` to a history and shove the whole thing into localStorage.",
        "The history panel shows events as they're recorded. Crash and reload and it's all still there, in italics.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "Every Temporal workflow has an Event History. It's an append-only log of everything that ever happened to it, and it lives on the Temporal server. That log is the source of truth for where a workflow is, *not* whatever's in some process's memory. Workers can come and go all they want because the history sticks around.",
      ],
    },
    {
      heading: "Still not useful",
      body: [
        "We write everything down and then never read it. Hit Start after a crash and we just start over and stomp on the old history.",
        "Also notice we run the command *before* we record it. Crash in between and that command runs again next time. You can shrink that gap but you can never fully close it, which is why Temporal gives you at-least-once for side effects and not exactly-once.",
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
