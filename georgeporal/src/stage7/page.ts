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
  startWorker,
  type HistoryEvent,
  type Task,
} from "./georgeporal.js";
import { fizzbuzzWorkflow, generateRandomNumberActivity } from "./workflow.js";

const workerName = `worker-${Math.random().toString(36).slice(2, 5)}`;

const page = mountPage({
  stage: 7,
  showHistory: true,
  showQueue: true,
  outputTitle: `Output from ${workerName}`,
  blurb: "We go full event-sourcing and split the event history from the commands. Commands get written into a task queue, and a \"worker loop\" repeatedly polls it for things it can do next. As long as workers can share the task queue and event history, you can run as many as you like and everything works!",
  tryThis: "Run this, then open the page in a second tab and start there too. Work is shared between them!",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "Commands are no longer carried out by the workflow runner. Each command becomes a task on a shared queue. A separate worker polls this queue and executes work. Every open tab shares the same task queue and event history but runs its own worker so work can be distributed. By replaying the event history, every worker can recreate the exact state it needs to generate the next step.",
        "Because updates need to be atomic, we wrap changes to shared utilities in a Web Lock (`navigator.locks.request`), which is held across every tab on the origin. This prevents a race where two workers grab the same task.",
        "If a task is still unfinished 5 seconds after a worker took it, that worker is assumed lost, and any worker may take the task again. Close a tab in the middle of a sleep to watch that happen.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "Temporal itself is really infrastructure built around these simple concepts. Temporal server simply maintains task queues and distributes event histories. Workflow code runs on workers that you host yourself, and those workers send events about its execution to the server. The server decides if and when tasks should enter the task queue and distributes the event history as needed.",
        "Temporal finds lost workers with timeouts: start-to-close, schedule-to-start and heartbeat timeouts. When one fires, the activity is retried somewhere else. This means that an activity might start again if it did not run to completion. This is where you'll hear the common recommendation that activities should be idempotent.",
        "Two simplifications here. In real Temporal, workflow code also runs on workers, as workflow tasks, and is replayed on whichever worker picks it up. Here every tab that pressed Start replays the same history to keep its own copy of the workflow. And sleeps are server-side timers, not tasks a worker has to wait out.",
      ],
    },
    {
      heading: "Is that it?",
      body: [
        "Yes and no. Yes, these are the big ideas and the mental model that will help you understand how to work with Temporal. However, this is a whole new way of running code. It has amazing benefits that are particularly key in the era of both agents and parallel computing, but it also has its own limitations and opportunities. How does this change SRE and monitoring? How should you think about deploying changes to code? When should you start a new workflow versus use a long-running one with signals? How should you distribute work between task queues? These are all very much open questions for developers to work out.",
        "But these are also things developers already work on, and Temporal gives them the tools to do this in their most familiar paradigm: code."
      ],
    },
  ],
  sources: [
    { label: "src/stage7/workflow.ts", path: "./src/stage7/workflow.ts" },
    { label: "src/stage7/georgeporal.ts", path: "./src/stage7/georgeporal.ts" },
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

page.onStart(() =>
  run(fizzbuzzWorkflow, (event, replayed) => {
    const className = replayed ? "replayed" : "";
    page.addEvent(describe(event), className);
    if (replayed && event.type === "print") page.print(event.text, className);
  }),
);
