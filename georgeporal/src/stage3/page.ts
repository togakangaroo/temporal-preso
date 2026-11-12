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
        "Same as before, but now we simply store a history of our commands. The history panel shows events as they're recorded. Crash and reload and it's all still there.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "The event history is a central Temporal concept. It's an append-only log of everything that ever happened to it, and it lives on the Temporal server. The state of a workflow can always be recreated from its history, and the history survives even when workers crash.",
      ],
    },
    {
      heading: "That's a neat trick",
      body: [
        "An audit log is really useful, and you can kind of see the durability if you squint.",
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
