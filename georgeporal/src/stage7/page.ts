import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory } from "../stage3/georgeporal.js";
import {
  HISTORY_KEY,
  loadHistory,
  loadQueue,
  POLL_MS,
  QUEUE_KEY,
  run,
  sendSignal,
  type HistoryEvent,
  type Task,
} from "./georgeporal.js";
import { startWorker } from "./worker.js";
import { fizzbuzzWorkflow, generateRandomNumberActivity } from "./workflow.js";

const workerName = `worker-${Math.random().toString(36).slice(2, 5)}`;

const page = mountPage({
  stage: 7,
  showHistory: true,
  showQueue: true,
  outputTitle: `Output from ${workerName}`,
  blurb:
    "georgeporal stops carrying out commands itself. Each one becomes a task on a queue in localStorage, and every open tab runs a worker that polls that queue ten times a second. Taking a task off the queue happens under a Web Lock, so two tabs can never grab the same one. A worker's start and finish go into the history as taskStarted and taskCompleted.",
  tryThis:
    "open this page in a second tab and leave it alone, then Start here. Each line prints in whichever tab's worker took the task. Crash the other tab mid-sleep: about 5 seconds later its task times out and a worker here takes it over.",
  sources: [
    { label: "src/stage7/workflow.ts", path: "./src/stage7/workflow.ts" },
    { label: "src/stage7/georgeporal.ts", path: "./src/stage7/georgeporal.ts" },
    { label: "src/stage7/worker.ts", path: "./src/stage7/worker.ts" },
  ],
});
document.title = `${workerName} · ${document.title}`;

function describe({ seq, ...command }: HistoryEvent): string {
  return describeEvent({ seq, command });
}

function describeTask({ id, command, worker, done, result }: Task): string {
  const status = done ? `done by ${worker}` : worker ? `running on ${worker}` : "queued";
  return `${describeEvent({ seq: id, command, result })}  [${status}]`;
}

startWorker(workerName, { generateRandomNumberActivity }, page.print);
setInterval(
  () =>
    page.setQueue(
      loadQueue().map((task) => ({
        text: describeTask(task),
        className: task.worker === workerName ? "mine" : "",
      })),
    ),
  POLL_MS,
);

const input = Object.assign(document.createElement("input"), {
  type: "number",
  value: "500",
});
const jump = page.addControl("Jump to number", () => {
  if (Number.isInteger(input.valueAsNumber)) {
    sendSignal("jump to number", input.valueAsNumber);
  }
});
jump.before(input);

const setRunning = (running: boolean) => {
  input.disabled = jump.disabled = !running;
};
setRunning(false);

page.addControl("Clear history", () => {
  clearHistory(HISTORY_KEY);
  clearHistory(QUEUE_KEY);
  location.reload();
});

const stored = loadHistory();
for (const event of stored) page.addEvent(describe(event), "stored");
if (stored.length > 0) {
  page.setStartLabel("Resume");
  page.setStatus(`${stored.length} events in history`);
}

page.onStart(async () => {
  setRunning(true);
  try {
    await run(fizzbuzzWorkflow, (event, replayed) => {
      const className = replayed ? "replayed" : "";
      page.addEvent(describe(event), className);
      if (replayed && event.type === "print") page.print(event.text, className);
    });
  } finally {
    setRunning(false);
  }
});
