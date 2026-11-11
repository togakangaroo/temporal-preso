import { mountPage } from "../shared/page.js";

const page = mountPage({
  stage: 1,
  blurb:
    "The workflow is a plain synchronous function and georgeporal just calls it. Once called, nobody else gets a say until it returns.",
  tryThis:
    "let it count for a bit, then crash. All of its state was in local variables, so it starts over from 1.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "The workflow is an ordinary synchronous function. georgeporal's `run` hands it a context with a `print` method and calls it, and that's the whole runtime. Even the sleep is a busy-wait loop, because a synchronous function has no way to give up the thread while it waits.",
        "That's also why this stage runs in a Web Worker. The workflow holds its thread for its whole life, so on the main thread the page could never repaint and you'd see nothing until all 1000 lines had finished.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is the mental model most people start with: a workflow is \"just code\". Temporal's pitch really is that you write plain code, but making that code durable means the runtime has to be able to step in between the lines. A plain function call leaves it no room to do that.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "All of the workflow's state, meaning `n` and its place in the loop, lives on one call stack. Crash the page and the stack is gone, so the next run starts again at 1. The runtime can't save what it can't see, and right now it sees nothing until the function returns.",
      ],
    },
  ],
  sources: [
    { label: "src/stage1/workflow.ts", path: "./src/stage1/workflow.ts" },
    { label: "src/stage1/georgeporal.ts", path: "./src/stage1/georgeporal.ts" },
  ],
});

page.onStart(
  () =>
    new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
      worker.onerror = (event) => reject(new Error(event.message));
      worker.onmessage = ({ data }) =>
        data === null ? resolve() : page.print(data);
    }),
);
