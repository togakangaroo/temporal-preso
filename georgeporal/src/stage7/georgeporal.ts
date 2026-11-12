// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
// t: signals
// y: task queue and workers
// </token_keys>
import { execute, type Command } from "../stage3/georgeporal.js";                  // q

// Anything a worker can be asked to do.                                           // y
export type TaskCommand =                                                          // y
  | Command                                                                        // q
  | { type: "callActivity"; activity: string; args: unknown[] };                   // r

export type Execution = AsyncGenerator<TaskCommand, void, any>;                    // q
export type Workflow = () => Execution;                                            // q

type Entry =                                                                       // w
  | TaskCommand                                                                    // y
  | { type: "taskStarted"; task: number; worker?: string }                         // y
  | { type: "taskCompleted"; task: number; result?: unknown }                      // y
  | { type: "signalReceived"; signal: string; arg: unknown };                      // t

export type HistoryEvent = Entry & { seq: number; result?: unknown };              // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                   // w

export const HISTORY_KEY = "georgeporal:stage7:history";                           // w
export const QUEUE_KEY = "georgeporal:stage7:queue";                               // y
export const POLL_MS = 100;                                                        // y

export const pause = (ms: number) =>                                               // y
  new Promise<void>((resolve) => setTimeout(resolve, ms));                         // y

export function loadHistory(): HistoryEvent[] {                                    // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                    // w
}                                                                                  // w

// Every tab appends under the same Web Lock. Given `expected`, it only writes if  // w
// no other tab has written since this one last looked.                            // w
function append(entry: Entry, expected?: number): Promise<HistoryEvent | undefined> { // w
  return navigator.locks.request(HISTORY_KEY, () => {                              // w
    const history = loadHistory();                                                 // w
    if (expected !== undefined && history.length !== expected) return undefined;  // w
    const event = { ...entry, seq: history.length + 1 };                           // w
    localStorage.setItem(HISTORY_KEY, JSON.stringify([...history, event]));        // w
    return event;                                                                  // w
  });                                                                              // w
}                                                                                  // w

// The task queue: a localStorage key that every open tab shares.                  // y
export type Task = {                                                               // y
  id: number; // seq of the event that scheduled it                                // y
  command: TaskCommand;                                                            // y
  worker?: string;                                                                 // y
  startedAt?: number;                                                              // y
  done?: boolean;                                                                  // y
  result?: unknown;                                                                // y
};                                                                                 // y

export function loadQueue(): Task[] {                                              // y
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");                      // y
}                                                                                  // y

// Every change is a read-modify-write, and another tab could slip its own in      // y
// between. The Web Lock is held across all tabs, so one goes at a time.           // y
export function updateQueue<T>(change: (queue: Task[]) => T): Promise<T> {         // y
  return navigator.locks.request(QUEUE_KEY, () => {                                // y
    const queue = loadQueue();                                                     // y
    const result = change(queue);                                                  // y
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));                        // y
    return result;                                                                 // y
  });                                                                              // y
}                                                                                  // y

// Finds the task on the queue, putting it there first if it's missing, say        // y
// because we crashed before queueing it.                                          // y
function queued(task: number, command: TaskCommand): Promise<Task> {               // y
  return updateQueue((queue) => {                                                  // y
    let current = queue.find((t) => t.id === task);                                // y
    if (!current) queue.push((current = { id: task, command }));                   // y
    return current;                                                                // y
  });                                                                              // y
}                                                                                  // y

let history: HistoryEvent[] = [];                                                  // w
let cursor = 0;                                                                    // e
// The history length as of this tab's last read or write.                         // w
let known = 0;                                                                     // w
let shown = 0;                                                                     // w
let notify: OnEvent = () => {};                                                    // w
const handlers = new Map<string, (arg: any) => unknown>();                         // t

// Thrown when another tab wrote to history first. The run starts over from there. // w
class Stale extends Error {}                                                       // w

// Appends an event this tab just decided on, unless another tab got there first.  // w
async function commit(entry: Entry): Promise<HistoryEvent> {                       // w
  const event = await append(entry, known);                                        // w
  if (!event) throw new Stale();                                                   // w
  known = event.seq;                                                               // w
  announce(event, false);                                                          // w
  return event;                                                                    // w
}                                                                                  // w

// A restart replays events this run already showed, so each is shown only once.   // w
function announce(event: HistoryEvent, replayed: boolean): void {                  // w
  if (event.seq <= shown) return;                                                  // w
  shown = event.seq;                                                               // w
  notify(event, replayed);                                                         // w
}                                                                                  // w

// A signal landed at this exact point in history, so its handler runs here again. // t
function replaySignals(): void {                                                   // t
  let event = history[cursor];                                                     // t
  while (event?.type === "signalReceived") {                                       // t
    cursor++;                                                                      // t
    announce(event, true);                                                         // t
    handlers.get(event.signal)!(event.arg);                                        // t
    event = history[cursor];                                                       // t
  }                                                                                // t
}                                                                                  // t

// Returns the next recorded event if we're still replaying, otherwise undefined.  // e
// Only the fields the workflow already knows are compared: which worker ran a     // e
// task and what it returned are what we're here to read.                          // e
function replay(expected: Entry): HistoryEvent | undefined {                       // e
  replaySignals();                                                                 // t

  const recorded = history[cursor];                                                // e
  if (!recorded) return undefined;                                                 // e

  const actual = Object.fromEntries(                                               // e
    Object.keys(expected).map((key) => [key, (recorded as any)[key]]),             // e
  );                                                                               // e
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                       // e
    throw new Error(                                                               // e
      `Nondeterminism at event #${recorded.seq}: history has ` +                   // e
      `${JSON.stringify(recorded)}, workflow did ${JSON.stringify(expected)}`,     // e
    );                                                                             // e
  }                                                                                // e

  cursor++;                                                                        // e
  announce(recorded, true);                                                        // e
  return recorded;                                                                 // e
}                                                                                  // e

// georgeporal no longer does anything itself. It schedules a task, then polls     // y
// until some worker, in any tab, has done it. Each step is committed first, so    // y
// if another tab already took it, this one starts over.                           // y
async function perform(command: TaskCommand): Promise<unknown> {                   // y
  const task = (replay(command) ?? (await commit(command))).seq;                   // e
  let started = !!replay({ type: "taskStarted", task });                           // e
  const completed = started && replay({ type: "taskCompleted", task });            // e
  if (completed) return completed.result;                                          // e

  while (true) {                                                                   // y
    await pause(POLL_MS);                                                          // y
    if (loadHistory().length !== known) throw new Stale();                         // w
    const { worker, done, result } = await queued(task, command);                  // y
    if (worker && !started) {                                                      // y
      started = true;                                                              // y
      await commit({ type: "taskStarted", task, worker });                         // w
    }                                                                              // y
    if (done) {                                                                    // y
      await commit({ type: "taskCompleted", task, result });                       // w
      await updateQueue((queue) => {                                               // y
        const index = queue.findIndex((t) => t.id === task);                       // y
        if (index !== -1) queue.splice(index, 1);                                  // y
      });                                                                          // y
      return result;                                                               // y
    }                                                                              // y
  }                                                                                // y
}                                                                                  // y

// One pass: replay whatever history holds, then carry on live from there.         // q
async function runOnce(workflow: Workflow): Promise<void> {                        // q
  history = loadHistory();                                                         // w
  known = history.length;                                                          // w
  cursor = 0;                                                                      // e
  handlers.clear();                                                                // t

  const execution = workflow();                                                    // q
  let next = await execution.next();                                               // q
  while (!next.done) {                                                             // q
    next = await execution.next(await perform(next.value));                        // q
  }                                                                                // q

  replaySignals();                                                                 // t
  if (cursor < history.length) {                                                   // e
    throw new Error(                                                               // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,    // e
    );                                                                             // e
  }                                                                                // e
}                                                                                  // q

export async function run(workflow: Workflow, onEvent: OnEvent): Promise<void> {   // q
  shown = 0;                                                                       // w
  notify = onEvent;                                                                // w
  while (true) {                                                                   // q
    try {                                                                          // q
      return await runOnce(workflow);                                              // q
    } catch (error) {                                                              // q
      if (!(error instanceof Stale)) throw error;                                  // q
    }                                                                              // q
  }                                                                                // q
}                                                                                  // q

export function onSignal<Arg>(signal: string, handler: (arg: Arg) => unknown) {    // t
  handlers.set(signal, handler);                                                   // t
}                                                                                  // t

// Any tab can send a signal. Every running tab applies it when it next replays.   // t
export const sendSignal = (signal: string, arg: unknown) =>                        // t
  append({ type: "signalReceived", signal, arg });                                 // t

// Only the activity's name goes on the queue. Whichever worker picks it up        // r
// has to have registered an activity by that name.                                // r
export const callActivity = (                                                      // r
  activity: (...args: any[]) => Promise<unknown>,                                  // r
  args: unknown[],                                                                 // r
): TaskCommand => ({ type: "callActivity", activity: activity.name, args });       // r

type Activities = Record<string, (...args: any[]) => Promise<unknown>>;            // r

// A task still unfinished this long after a worker took it is assumed lost         // y
// along with that worker (a crashed tab, say), so any worker may take it again.    // y
const START_TO_CLOSE_TIMEOUT_MS = 5000;                                            // y

// Under the lock, so two workers polling at once can't both take the same task.    // y
function take(worker: string): Promise<Task | undefined> {                         // y
  return updateQueue((queue) => {                                                  // y
    const task = queue.find(                                                       // y
      (t) =>                                                                       // y
        !t.worker ||                                                               // y
        (!t.done && Date.now() - t.startedAt! > START_TO_CLOSE_TIMEOUT_MS),        // y
    );                                                                             // y
    if (task) Object.assign(task, { worker, startedAt: Date.now() });              // y
    return task;                                                                   // y
  });                                                                              // y
}                                                                                  // y

function finish(id: number, result: unknown): Promise<void> {                      // y
  return updateQueue((queue) => {                                                  // y
    const task = queue.find((t) => t.id === id);                                   // y
    if (task) Object.assign(task, { done: true, result });                         // y
  });                                                                              // y
}                                                                                  // y

export async function startWorker(                                                 // y
  name: string,                                                                    // y
  activities: Activities,                                                          // y
  output: (text: string) => void,                                                  // y
): Promise<never> {                                                                // y
  while (true) {                                                                   // y
    const task = await take(name);                                                 // y
    if (!task) {                                                                   // y
      await pause(POLL_MS);                                                        // y
      continue;                                                                    // y
    }                                                                              // y

    const { command } = task;                                                      // y
    const result =                                                                 // y
      command.type === "callActivity"                                              // y
        ? await activities[command.activity](...command.args)                      // y
        : await execute(command, output);                                          // y
    await finish(task.id, result);                                                 // y
  }                                                                                // y
}                                                                                  // y
