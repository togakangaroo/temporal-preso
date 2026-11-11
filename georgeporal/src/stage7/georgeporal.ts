import type { Command, Workflow } from "../stage3/georgeporal.js";

// Anything a worker can be asked to do.
export type TaskCommand =
  | Command
  | { type: "activity"; activity: string; args: unknown[] };

type Entry =
  | TaskCommand
  | { type: "taskStarted"; task: number; worker?: string }
  | { type: "taskCompleted"; task: number; result?: unknown }
  | { type: "signalReceived"; signal: string; arg: unknown }
  | { type: "signalHandled"; signal: string; result?: unknown };

export type HistoryEvent = Entry & { seq: number };
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;
type SignalHandler = (arg: any) => unknown;

export const HISTORY_KEY = "georgeporal:stage7:history";
export const QUEUE_KEY = "georgeporal:stage7:queue";
export const POLL_MS = 100;

export function loadHistory(): HistoryEvent[] {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
}

// The task queue: a localStorage key that every open tab shares.
export type Task = {
  id: number; // seq of the event that scheduled it
  command: TaskCommand;
  worker?: string;
  startedAt?: number;
  done?: boolean;
  result?: unknown;
};

export function loadQueue(): Task[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
}

// Every change is a read-modify-write, and another tab could slip its own in
// between. The Web Lock is held across all tabs, so one goes at a time.
export function updateQueue<T>(change: (queue: Task[]) => T): Promise<T> {
  return navigator.locks.request(QUEUE_KEY, () => {
    const queue = loadQueue();
    const result = change(queue);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return result;
  });
}

export const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

let history: HistoryEvent[] = [];
let cursor = 0;
let notify: OnEvent = () => {};
const handlers = new Map<string, SignalHandler>();

function callHandler(signal: string, arg: unknown): unknown {
  const handler = handlers.get(signal);
  if (!handler) throw new Error(`No handler for signal "${signal}"`);
  return handler(arg);
}

// A signal landed at this exact point last time, so its handler runs here again.
function replaySignals(): void {
  let event = history[cursor];
  while (event?.type === "signalReceived") {
    const { signal, arg } = event;
    cursor++;
    notify(event, true);

    const handled: Entry = {
      type: "signalHandled",
      signal,
      result: callHandler(signal, arg),
    };
    if (!replay(handled)) record(handled);
    event = history[cursor];
  }
}

// Returns the next recorded event if we're still replaying, otherwise undefined.
// Only the fields the workflow already knows are compared: which worker ran a
// task and what it returned are what we're here to read.
function replay(expected: Entry): HistoryEvent | undefined {
  if (expected.type !== "signalHandled") replaySignals();

  const recorded = history[cursor];
  if (!recorded) return undefined;

  const actual = Object.fromEntries(
    Object.keys(expected).map((key) => [key, (recorded as any)[key]]),
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Nondeterminism at event #${recorded.seq}: history has ` +
      `${JSON.stringify(recorded)}, workflow did ${JSON.stringify(expected)}`,
    );
  }

  cursor++;
  notify(recorded, true);
  return recorded;
}

function record(entry: Entry): HistoryEvent {
  const event = { ...entry, seq: history.length + 1 };
  history.push(event);
  cursor++;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  notify(event, false);
  return event;
}

// georgeporal no longer does anything itself. It puts a task on the queue,
// then polls until some worker, in any tab, has done it.
async function perform(command: TaskCommand): Promise<unknown> {
  const task = (replay(command) ?? record(command)).seq;

  let started = replay({ type: "taskStarted", task });
  const completed = started && replay({ type: "taskCompleted", task });
  if (completed) return (completed as { result?: unknown }).result;

  // If we crashed while this was in flight, it's already on the queue.
  await updateQueue((queue) => {
    if (!queue.some((t) => t.id === task)) queue.push({ id: task, command });
  });

  while (true) {
    await pause(POLL_MS);
    const { worker, done, result } = loadQueue().find((t) => t.id === task)!;
    if (worker && !started) {
      started = record({ type: "taskStarted", task, worker });
    }
    if (done) {
      await updateQueue((queue) =>
        queue.splice(queue.findIndex((t) => t.id === task), 1),
      );
      record({ type: "taskCompleted", task, result });
      return result;
    }
  }
}

export function onSignal<Arg>(
  signal: string,
  handler: (arg: Arg) => unknown,
): void {
  handlers.set(signal, handler);
}

export function sendSignal(signal: string, arg: unknown): void {
  record({ type: "signalReceived", signal, arg });
  record({ type: "signalHandled", signal, result: callHandler(signal, arg) });
}

// Only the activity's name goes on the queue. Whichever worker picks it up
// has to have registered an activity by that name.
export async function callActivity<Args extends unknown[], Result>(
  activity: (...args: Args) => Promise<Result>,
  args: Args,
): Promise<Result> {
  const command = { type: "activity" as const, activity: activity.name, args };
  return (await perform(command)) as Result;
}

export async function run(
  workflow: Workflow,
  onEvent: OnEvent,
): Promise<void> {
  history = loadHistory();
  cursor = 0;
  notify = onEvent;
  handlers.clear();

  const execution = workflow();
  let step = await execution.next();

  while (!step.done) {
    await perform(step.value);
    step = await execution.next();
  }

  replaySignals();
  if (cursor < history.length) {
    throw new Error(
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,
    );
  }
}
