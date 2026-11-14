import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory } from "../stage3/georgeporal.js";
import {
  HISTORY_KEY,
  INBOX_KEY,
  loadHistory,
  loadQueue,
  POLL_MS,
  QUEUE_KEY,
  sendSignal,
  startServer,
  startWorker,
  startWorkflow,
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
  tryThis: "Start this, then open the page in a second tab. Work is shared between them! Close the tab marked server and watch another take over.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "Every open tab runs a worker, and one of them is also the server. The server is the only thing that writes the event history or puts tasks on the queue. Workers poll the queue and report back to the server's inbox.",
        "There are two kinds of task. A command task (print, sleep, or an activity) is carried out, and the worker reports the result. An `advanceWorkflow` task means: replay the workflow from scratch against the history up to this point, and report the one new command it wants. So the workflow code runs on whichever worker picks the task up, and by replaying history every worker can recreate the exact state it needs to take the next step.",
        "The server records each report in history and queues whatever comes next: a command becomes a command task, and a result or a signal becomes another `advanceWorkflow` task. A report about an old step, say because a signal arrived meanwhile, is simply dropped; a newer task is already on its way.",
        "Shared state lives in localStorage, and because updates need to be atomic, we wrap changes in a Web Lock (`navigator.locks.request`), which is held across every tab on the origin. This prevents a race where two workers grab the same task. The server is picked with a Web Lock too: every tab asks for it, one gets it and never lets go. Close that tab and the next one in line takes over.",
        "If a task is still unfinished 5 seconds after a worker took it, that worker is assumed lost, and any worker may take the task again. Close a tab in the middle of a sleep to watch that happen.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "Temporal itself is really infrastructure built around these simple concepts. Temporal server simply maintains task queues and distributes event histories. Workflow code runs on workers that you host yourself, and those workers send events about its execution to the server. The server decides if and when tasks should enter the task queue and distributes the event history as needed.",
        "Temporal finds lost workers with timeouts: start-to-close, schedule-to-start and heartbeat timeouts. When one fires, the activity is retried somewhere else. This means that an activity might start again if it did not run to completion. This is where you'll hear the common recommendation that activities should be idempotent.",
        "Our `advanceWorkflow` tasks are Temporal's workflow tasks, and our command tasks are its activity tasks. Two simplifications here. Real Temporal workers are \"sticky\": they keep a workflow in memory between workflow tasks instead of replaying the whole history each time. And sleeps are server-side timers, not tasks a worker has to wait out.",
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

function describeTask({ id, work, worker }: Task): string {
  const status = worker ? `running on ${worker}` : "queued";
  return `${describeEvent({ seq: id, command: work })}  [${status}]`;
}

page.setStatus(workerName);
startServer(() => {
  page.setStatus(`${workerName} + server`, "running");
  document.title = `${workerName} (server) · ${document.title}`;
});
startWorker(workerName, fizzbuzzWorkflow, { generateRandomNumberActivity }, page.print);

page.start.onclick = () => startWorkflow();

// Only the server writes history, so every tab just shows whatever is new.
let shown = 0;
setInterval(() => {
  const history = loadHistory();
  for (const event of history.slice(shown)) page.addEvent(describe(event));
  shown = history.length;
  page.start.disabled = history.length > 0;
  page.setQueue(
    loadQueue().map((task) => ({
      text: describeTask(task),
      className: task.worker === workerName ? "mine" : "",
    })),
  );
}, POLL_MS);

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
  clearHistory(INBOX_KEY);
  location.reload();
});
