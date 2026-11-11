// <token_keys>
// a: signals
// b: replaying history
// c: running commands
// d: recording history
// e: activities
// f: task queue
// </token_keys>
import type { Command, Workflow } from "../stage3/georgeporal.js";                 // c

// Anything a worker can be asked to do.                                           // f
export type TaskCommand =                                                          // f
  | Command                                                                        // c
  | { type: "activity"; activity: string; args: unknown[] };                       // e

type Entry =                                                                       // d
  | TaskCommand                                                                    // f
  | { type: "taskStarted"; task: number; worker?: string }                         // f
  | { type: "taskCompleted"; task: number; result?: unknown }                      // f
  | { type: "signalReceived"; signal: string; arg: unknown }                       // a
  | { type: "signalHandled"; signal: string; result?: unknown };                   // a

export type HistoryEvent = Entry & { seq: number };                                // d
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                   // d
type SignalHandler = (arg: any) => unknown;                                        // a

export const HISTORY_KEY = "georgeporal:stage7:history";                           // d
export const QUEUE_KEY = "georgeporal:stage7:queue";                               // f
export const POLL_MS = 100;                                                        // f

export function loadHistory(): HistoryEvent[] {                                    // d
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                    // d
}                                                                                  // d

// The task queue: a localStorage key that every open tab shares.                  // f
export type Task = {                                                               // f
  id: number; // seq of the event that scheduled it                                // f
  command: TaskCommand;                                                            // f
  worker?: string;                                                                 // f
  startedAt?: number;                                                              // f
  done?: boolean;                                                                  // f
  result?: unknown;                                                                // f
};                                                                                 // f

export function loadQueue(): Task[] {                                              // f
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");                      // f
}                                                                                  // f

// Every change is a read-modify-write, and another tab could slip its own in      // f
// between. The Web Lock is held across all tabs, so one goes at a time.           // f
export function updateQueue<T>(change: (queue: Task[]) => T): Promise<T> {         // f
  return navigator.locks.request(QUEUE_KEY, () => {                                // f
    const queue = loadQueue();                                                     // f
    const result = change(queue);                                                  // f
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));                        // f
    return result;                                                                 // f
  });                                                                              // f
}                                                                                  // f

export const pause = (ms: number) =>                                               // f
  new Promise<void>((resolve) => setTimeout(resolve, ms));                         // f

let history: HistoryEvent[] = [];                                                  // d
let cursor = 0;                                                                    // b
let notify: OnEvent = () => {};                                                    // d
const handlers = new Map<string, SignalHandler>();                                 // a

function callHandler(signal: string, arg: unknown): unknown {                      // a
  const handler = handlers.get(signal);                                            // a
  if (!handler) throw new Error(`No handler for signal "${signal}"`);              // a
  return handler(arg);                                                             // a
}                                                                                  // a

// A signal landed at this exact point last time, so its handler runs here again.  // a
function replaySignals(): void {                                                   // a
  let event = history[cursor];                                                     // a
  while (event?.type === "signalReceived") {                                       // a
    const { signal, arg } = event;                                                 // a
    cursor++;                                                                      // a
    notify(event, true);                                                           // a

    const handled: Entry = {                                                       // a
      type: "signalHandled",                                                       // a
      signal,                                                                      // a
      result: callHandler(signal, arg),                                            // a
    };                                                                             // a
    if (!replay(handled)) record(handled);                                         // b
    event = history[cursor];                                                       // a
  }                                                                                // a
}                                                                                  // a

// Returns the next recorded event if we're still replaying, otherwise undefined.  // b
// Only the fields the workflow already knows are compared: which worker ran a     // b
// task and what it returned are what we're here to read.                          // b
function replay(expected: Entry): HistoryEvent | undefined {                       // b
  if (expected.type !== "signalHandled") replaySignals();                          // a

  const recorded = history[cursor];                                                // b
  if (!recorded) return undefined;                                                 // b

  const actual = Object.fromEntries(                                               // b
    Object.keys(expected).map((key) => [key, (recorded as any)[key]]),             // b
  );                                                                               // b
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                       // b
    throw new Error(                                                               // b
      `Nondeterminism at event #${recorded.seq}: history has ` +                   // b
      `${JSON.stringify(recorded)}, workflow did ${JSON.stringify(expected)}`,     // b
    );                                                                             // b
  }                                                                                // b

  cursor++;                                                                        // b
  notify(recorded, true);                                                          // b
  return recorded;                                                                 // b
}                                                                                  // b

function record(entry: Entry): HistoryEvent {                                      // d
  const event = { ...entry, seq: history.length + 1 };                             // d
  history.push(event);                                                             // d
  cursor++;                                                                        // d
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                      // d
  notify(event, false);                                                            // d
  return event;                                                                    // d
}                                                                                  // d

// georgeporal no longer does anything itself. It puts a task on the queue,        // f
// then polls until some worker, in any tab, has done it.                          // f
async function perform(command: TaskCommand): Promise<unknown> {                   // f
  const task = (replay(command) ?? record(command)).seq;                           // b

  let started = replay({ type: "taskStarted", task });                             // b
  const completed = started && replay({ type: "taskCompleted", task });            // b
  if (completed) return (completed as { result?: unknown }).result;                // b

  // If we crashed while this was in flight, it's already on the queue.            // f
  await updateQueue((queue) => {                                                   // f
    if (!queue.some((t) => t.id === task)) queue.push({ id: task, command });      // f
  });                                                                              // f

  while (true) {                                                                   // f
    await pause(POLL_MS);                                                          // f
    const { worker, done, result } = loadQueue().find((t) => t.id === task)!;      // f
    if (worker && !started) {                                                      // f
      started = record({ type: "taskStarted", task, worker });                     // d
    }                                                                              // f
    if (done) {                                                                    // f
      await updateQueue((queue) =>                                                 // f
        queue.splice(queue.findIndex((t) => t.id === task), 1),                    // f
      );                                                                           // f
      record({ type: "taskCompleted", task, result });                             // d
      return result;                                                               // f
    }                                                                              // f
  }                                                                                // f
}                                                                                  // f

export function onSignal<Arg>(                                                     // a
  signal: string,                                                                  // a
  handler: (arg: Arg) => unknown,                                                  // a
): void {                                                                          // a
  handlers.set(signal, handler);                                                   // a
}                                                                                  // a

export function sendSignal(signal: string, arg: unknown): void {                   // a
  record({ type: "signalReceived", signal, arg });                                 // a
  record({ type: "signalHandled", signal, result: callHandler(signal, arg) });     // a
}                                                                                  // a

// Only the activity's name goes on the queue. Whichever worker picks it up        // e
// has to have registered an activity by that name.                                // e
export async function callActivity<Args extends unknown[], Result>(                // e
  activity: (...args: Args) => Promise<Result>,                                    // e
  args: Args,                                                                      // e
): Promise<Result> {                                                               // e
  const command = { type: "activity" as const, activity: activity.name, args };    // e
  return (await perform(command)) as Result;                                       // e
}                                                                                  // e

export async function run(                                                         // c
  workflow: Workflow,                                                              // c
  onEvent: OnEvent,                                                                // c
): Promise<void> {                                                                 // c
  history = loadHistory();                                                         // d
  cursor = 0;                                                                      // b
  notify = onEvent;                                                                // d
  handlers.clear();                                                                // a

  const execution = workflow();                                                    // c
  let step = await execution.next();                                               // c

  while (!step.done) {                                                             // c
    await perform(step.value);                                                     // c
    step = await execution.next();                                                 // c
  }                                                                                // c

  replaySignals();                                                                 // a
  if (cursor < history.length) {                                                   // b
    throw new Error(                                                               // b
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,    // b
    );                                                                             // b
  }                                                                                // b
}                                                                                  // c
