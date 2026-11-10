import { mountPage } from "../shared/page.js";
import { run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 2,
  blurb:
    "The workflow is now an async generator. It no longer does anything itself: it yields commands describing what it wants, and georgeporal carries them out. Control comes back to the runtime at every yield.",
  tryThis:
    "notice the page runs on the main thread with no worker now. Then crash: the state is still only in the generator's locals, so it's still lost.",
  sources: [
    { label: "src/stage2/workflow.ts", path: "./src/stage2/workflow.ts" },
    { label: "src/stage2/georgeporal.ts", path: "./src/stage2/georgeporal.ts" },
  ],
});

page.onStart(() => run(fizzbuzzWorkflow, page.print));
