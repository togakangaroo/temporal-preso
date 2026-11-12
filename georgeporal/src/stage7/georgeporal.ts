// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
// t: signals
// y: task queue
// </token_keys>
import type { Command } from "../stage3/georgeporal.js";                           // q

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
  | { type: "signalReceived"; signal: string; arg: unknown }                       // t
  | { type: "signalHandled"; signal: string; result?: unknown };                   // t

export type HistoryEvent = Entry & { seq: number };                                // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                   // w
type SignalHandler = (arg: any) => unknown;                                        // t

export const HISTORY_KEY = "georgeporal:stage7:history";                           // w
export const QUEUE_KEY = "georgeporal:stage7:queue";                               // y
export const POLL_MS = 100;                                                        // y

export function loadHistory(): HistoryEvent[] {                                    // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                    // w
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

export const pause = (ms: number) =>                                               // y
  new Promise<void>((resolve) => setTimeout(resolve, ms));                         // y

let history: HistoryEvent[] = [];                                                  // w
let cursor = 0;                                                                    // e
let notify: OnEvent = () => {};                                                    // w
const handlers = new Map<string, SignalHandler>();                                 // t

function callHandler(signal: string, arg: unknown): unknown {                      // t
  const handler = handlers.get(signal);                                            // t
  if (!handler) throw new Error(`No handler for signal "${signal}"`);              // t
  return handler(arg);                                                             // t
}                                                                                  // t

// A signal landed at this exact point last time, so its handler runs here again.  // t
function replaySignals(): void {                                                   // t
  let event = history[cursor];                                                     // t
  while (event?.type === "signalReceived") {                                       // t
    const { signal, arg } = event;                                                 // t
    cursor++;                                                                      // t
    notify(event, true);                                                           // t

    const handled: Entry = {                                                       // t
      type: "signalHandled",                                                       // t
      signal,                                                                      // t
      result: callHandler(signal, arg),                                            // t
    };                                                                             // t
    if (!replay(handled)) record(handled);                                         // e
    event = history[cursor];                                                       // t
  }                                                                                // t
}                                                                                  // t

// Returns the next recorded event if we're still replaying, otherwise undefined.  // e
// Only the fields the workflow already knows are compared: which worker ran a     // e
// task and what it returned are what we're here to read.                          // e
function replay(expected: Entry): HistoryEvent | undefined {                       // e
  if (expected.type !== "signalHandled") replaySignals();                          // t

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
  notify(recorded, true);                                                          // e
  return recorded;                                                                 // e
}                                                                                  // e

function record(entry: Entry): HistoryEvent {                                      // w
  const event = { ...entry, seq: history.length + 1 };                             // w
  history.push(event);                                                             // w
  cursor++;                                                                        // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                      // w
  notify(event, false);                                                            // w
  return event;                                                                    // w
}                                                                                  // w

// georgeporal no longer does anything itself. It puts a task on the queue,        // y
// then polls until some worker, in any tab, has done it.                          // y
async function perform(command: TaskCommand): Promise<unknown> {                   // y
  const task = (replay(command) ?? record(command)).seq;                           // e

  let started = replay({ type: "taskStarted", task });                             // e
  const completed = started && replay({ type: "taskCompleted", task });            // e
  if (completed) return (completed as { result?: unknown }).result;                // e

  // If we crashed while this was in flight, it's already on the queue.            // y
  await updateQueue((queue) => {                                                   // y
    if (!queue.some((t) => t.id === task)) queue.push({ id: task, command });      // y
  });                                                                              // y

  while (true) {                                                                   // y
    await pause(POLL_MS);                                                          // y
    const { worker, done, result } = loadQueue().find((t) => t.id === task)!;      // y
    if (worker && !started) {                                                      // y
      started = record({ type: "taskStarted", task, worker });                     // w
    }                                                                              // y
    if (done) {                                                                    // y
      await updateQueue((queue) =>                                                 // y
        queue.splice(queue.findIndex((t) => t.id === task), 1),                    // y
      );                                                                           // y
      record({ type: "taskCompleted", task, result });                             // w
      return result;                                                               // y
    }                                                                              // y
  }                                                                                // y
}                                                                                  // y

export function onSignal<Arg>(                                                     // t
  signal: string,                                                                  // t
  handler: (arg: Arg) => unknown,                                                  // t
): void {                                                                          // t
  handlers.set(signal, handler);                                                   // t
}                                                                                  // t

export function sendSignal(signal: string, arg: unknown): void {                   // t
  record({ type: "signalReceived", signal, arg });                                 // t
  record({ type: "signalHandled", signal, result: callHandler(signal, arg) });     // t
}                                                                                  // t

// Only the activity's name goes on the queue. Whichever worker picks it up        // r
// has to have registered an activity by that name.                                // r
export const callActivity = (                                                      // r
  activity: (...args: any[]) => Promise<unknown>,                                  // r
  args: unknown[],                                                                 // r
): TaskCommand => ({ type: "callActivity", activity: activity.name, args });       // r

export async function run(                                                         // q
  workflow: Workflow,                                                              // q
  onEvent: OnEvent,                                                                // q
): Promise<void> {                                                                 // q
  history = loadHistory();                                                         // w
  cursor = 0;                                                                      // e
  notify = onEvent;                                                                // w
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
