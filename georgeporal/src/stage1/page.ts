import { mountPage } from "../shared/page.js";

const page = mountPage({
  stage: 1,
  blurb:
    "The workflow is a plain synchronous function and georgeporal just calls it. Once called, nobody else gets a say until it returns.",
  tryThis:
    "let it count for a bit, then crash. All of its state was in local variables, so it starts over from 1.",
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
