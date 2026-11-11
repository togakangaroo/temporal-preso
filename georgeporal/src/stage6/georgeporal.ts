import { execute, type Command, type Workflow } from "../stage3/georgeporal.js";

type Entry =
  | Command
  | { type: "activityStarted"; activity: string; args: unknown[] }
  | { type: "activityCompleted"; activity: string; result?: unknown }
  | { type: "signalReceived"; signal: string; arg: unknown }
  | { type: "signalHandled"; signal: string; result?: unknown };

export type HistoryEvent = Entry & { seq: number };
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;
type SignalHandler = (arg: any) => unknown;

export const HISTORY_KEY = "georgeporal:stage6:history";

export function loadHistory(): HistoryEvent[] {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
}

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
function replay(expected: Entry): HistoryEvent | undefined {
  if (expected.type !== "signalHandled") replaySignals();

  const recorded = history[cursor];
  if (!recorded) return undefined;

  // An activity's result is what we're here to read, so it can't be compared.
  const { result } = recorded as { result?: unknown };
  const actual = {
    ...recorded,
    seq: undefined,
    result: "result" in expected ? result : undefined,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Nondeterminism at event #${recorded.seq}: history has ` +
      `${JSON.stringify(actual)}, workflow did ${JSON.stringify(expected)}`,
    );
  }

  cursor++;
  notify(recorded, true);
  return recorded;
}

function record(entry: Entry): void {
  const event = { ...entry, seq: history.length + 1 };
  history.push(event);
  cursor++;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  notify(event, false);
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

export async function callActivity<Args extends unknown[], Result>(
  activity: (...args: Args) => Promise<Result>,
  args: Args,
): Promise<Result> {
  const started: Entry = { type: "activityStarted", activity: activity.name, args };
  if (!replay(started)) record(started);

  const completed: Entry = { type: "activityCompleted", activity: activity.name };
  const recorded = replay(completed);
  if (recorded) return (recorded as typeof completed).result as Result;

  const result = await activity(...args);
  record({ ...completed, result });
  return result;
}

export async function run(
  workflow: Workflow,
  output: (text: string) => void,
  onEvent: OnEvent,
): Promise<void> {
  history = loadHistory();
  cursor = 0;
  notify = onEvent;
  handlers.clear();

  const execution = workflow();
  let step = await execution.next();

  while (!step.done) {
    if (!replay(step.value)) {
      await execute(step.value, output);
      record(step.value);
    }
    step = await execution.next();
  }

  replaySignals();
  if (cursor < history.length) {
    throw new Error(
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,
    );
  }
}
