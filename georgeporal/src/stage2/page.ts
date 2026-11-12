import { mountPage } from "../shared/page.js";
import { run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 2,
  blurb:
  "The first compromise: the workflow is now an async generator that just describes the commands it would like to take.",
  tryThis:
  "Notice the page runs on the main thread with no worker now. The state still lives only in the generator's locals, so a crash still loses it.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "The workflow is now an async generator. Instead of printing or sleeping itself, it yields commands: plain objects like `{ type: \"sleep\", ms: 1500 }` that describe what it wants done. The framework knows how to carry out those commands, and does so as the generator requests them.",
        "Because we're asynchronous now, sleeping can run on the built-in event loop with `setTimeout`, so the whole thing runs comfortably on the main thread.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is the most important idea in Temporal. Workflow code doesn't *do* anything. It has no side effects. Instead it produces commands that describe the activity they want and the runtime decides how and when it happens. When you `await sleep(\"1 day\")` in a Temporal workflow, nothing waits a day, it simply generates a command to do so.",
      ],
    },
    {
      heading: "This is just worse",
      body: [
        "We haven't gained any advantages yet. We've only made compromises.",
      ],
    },
  ],
  sources: [
    { label: "src/stage2/workflow.ts", path: "./src/stage2/workflow.ts" },
    { label: "src/stage2/georgeporal.ts", path: "./src/stage2/georgeporal.ts" },
  ],
});

page.onStart(() => run(fizzbuzzWorkflow, page.print));
