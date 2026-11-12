import { mountPage } from "../shared/page.js";

const page = mountPage({
  stage: 1,
  blurb:
    "The workflow is a plain synchronous function and georgeporal just calls it.",
  tryThis:
    "let it count for a bit, then crash. All of its state was in local variables, so it starts over from 1.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "The workflow is an ordinary synchronous function. all the georgeporal framework does is call that function. Bing, bang boom. ",
				"For proper abstraction the `print` method is passed in and the whole thing runs in a Web Worker. The workflow holds its thread for its whole life, with `sleep` spinning, so on the main thread the page could never repaint and you'd see nothing until all 1000 lines had finished.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is kind of the platonic ideal. Rather than workflow diagrams and infrastructure documents, you want a workflow to be \"just code\". You write it and - somehow through magic - the code runs across durably and across multiple computers. In many ways, Temporal is a system aiming to be that, and everything else is compromises.",
      ],
    },
    {
      heading: "This is just where we start",
      body: [
        "This is also ultimately just a function being called. Let's now figure out the magic bits.",
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
