import { mountPage } from "../shared/page.js";
import { run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 2,
  blurb:
    "The workflow is now an async generator. It no longer does anything itself: it yields commands describing what it wants, and georgeporal carries them out. Control comes back to the runtime at every yield.",
  tryThis:
    "notice the page runs on the main thread with no worker now. Then crash: the state is still only in the generator's locals, so it's still lost.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "The workflow is now an async generator. Instead of printing or sleeping itself, it yields commands: plain objects like `{ type: \"sleep\", ms: 1500 }` that describe what it wants done. georgeporal loops over them with `for await` and carries each one out.",
        "Every `yield` hands control back to the runtime. Sleeping is a real `setTimeout` now instead of a busy-wait, so the whole thing runs comfortably on the main thread.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is the most important idea in Temporal. Workflow code doesn't perform side effects. It produces commands (start a timer, schedule an activity, complete the workflow) and the runtime decides how and when they happen. When you `await sleep(\"1 day\")` in a Temporal workflow, no thread waits a day. A timer command goes to the server.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "The runtime now sees every command, but it forgets each one as soon as it's done. The state is still only in the generator's local variables, so a crash still sends you back to 1.",
      ],
    },
  ],
  sources: [
    { label: "src/stage2/workflow.ts", path: "./src/stage2/workflow.ts" },
    { label: "src/stage2/georgeporal.ts", path: "./src/stage2/georgeporal.ts" },
  ],
});

page.onStart(() => run(fizzbuzzWorkflow, page.print));
