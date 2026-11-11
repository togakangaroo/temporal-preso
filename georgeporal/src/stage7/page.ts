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
  explainer: [
    {
      heading: "What's going on",
      body: [
        "georgeporal no longer carries out commands itself. Each command, and each activity call, becomes a task on a shared queue in localStorage, and georgeporal polls until the task is done. Every open tab runs a worker that polls the same queue ten times a second, takes a task, runs it, and marks it finished. Each line prints in whichever tab's worker took the task, and the tasks that are yours show in green.",
        "Taking a task is a read-modify-write of one localStorage key, and any tab could slip its own write in between. `updateQueue` wraps every change in a Web Lock (`navigator.locks.request`), which is held across every tab on the origin, so no two workers can grab the same task.",
        "When georgeporal sees a worker take a task, it records `taskStarted` with that worker's name, then `taskCompleted` with the result. Replay compares only the fields the workflow can know, so which worker ran a task is just something to read back.",
        "If a task is still unfinished 5 seconds after a worker took it, that worker is assumed lost, and any worker may take the task again. Close a tab in the middle of a sleep to watch that happen.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is how Temporal actually runs work. The server never calls your code. Workers long-poll named task queues and pull work when they have room for it. To scale, you start more workers. To route work, you name queues. Workers can run anywhere that can reach the server.",
        "Temporal finds lost workers with timeouts: start-to-close, schedule-to-start and heartbeat timeouts. When one fires, the activity is retried somewhere else. So activities run at least once, which means they should be idempotent.",
        "Two simplifications here. In real Temporal, workflow code also runs on workers, as workflow tasks, and is replayed on whichever worker picks it up. Here it stays in the tab that pressed Start. And sleeps are server-side timers, not tasks a worker has to wait out.",
      ],
    },
    {
      heading: "What breaks",
      body: [
        "Press Start in two tabs and you have two georgeporals writing one history. Temporal's server prevents that by owning the history and handing out one workflow task at a time. Also, a slow worker that isn't actually dead can still finish its task after the timeout has given it to someone else. That's the at-least-once caveat in action.",
      ],
    },
  ],
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
