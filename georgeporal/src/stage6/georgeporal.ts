// <token_keys>
// a: signals
// b: replaying history
// c: running commands
// d: recording history
// e: activities
// </token_keys>
import { execute, type Command, type Workflow } from "../stage3/georgeporal.js";      // c

type Entry =                                                                          // d
  | Command                                                                           // c
  | { type: "activityStarted"; activity: string; args: unknown[] }                    // e
  | { type: "activityCompleted"; activity: string; result?: unknown }                 // e
  | { type: "signalReceived"; signal: string; arg: unknown }                          // a
  | { type: "signalHandled"; signal: string; result?: unknown };                      // a

export type HistoryEvent = Entry & { seq: number };                                   // d
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                      // d
type SignalHandler = (arg: any) => unknown;                                           // a

export const HISTORY_KEY = "georgeporal:stage6:history";                              // d

export function loadHistory(): HistoryEvent[] {                                       // d
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                       // d
}                                                                                     // d

let history: HistoryEvent[] = [];                                                     // d
let cursor = 0;                                                                       // b
let notify: OnEvent = () => {};                                                       // d
const handlers = new Map<string, SignalHandler>();                                    // a

function callHandler(signal: string, arg: unknown): unknown {                         // a
  const handler = handlers.get(signal);                                               // a
  if (!handler) throw new Error(`No handler for signal "${signal}"`);                 // a
  return handler(arg);                                                                // a
}                                                                                     // a

// A signal landed at this exact point last time, so its handler runs here again.     // a
function replaySignals(): void {                                                      // a
  let event = history[cursor];                                                        // a
  while (event?.type === "signalReceived") {                                          // a
    const { signal, arg } = event;                                                    // a
    cursor++;                                                                         // a
    notify(event, true);                                                              // a

    const handled: Entry = {                                                          // a
      type: "signalHandled",                                                          // a
      signal,                                                                         // a
      result: callHandler(signal, arg),                                               // a
    };                                                                                // a
    if (!replay(handled)) record(handled);                                            // b
    event = history[cursor];                                                          // a
  }                                                                                   // a
}                                                                                     // a

// Returns the next recorded event if we're still replaying, otherwise undefined.     // b
function replay(expected: Entry): HistoryEvent | undefined {                          // b
  if (expected.type !== "signalHandled") replaySignals();                             // a

  const recorded = history[cursor];                                                   // b
  if (!recorded) return undefined;                                                    // b

  // An activity's result is what we're here to read, so it can't be compared.        // b
  const { result } = recorded as { result?: unknown };                                // b
  const actual = {                                                                    // b
    ...recorded,                                                                      // b
    seq: undefined,                                                                   // b
    result: "result" in expected ? result : undefined,                                // b
  };                                                                                  // b
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                          // b
    throw new Error(                                                                  // b
      `Nondeterminism at event #${recorded.seq}: history has ` +                      // b
      `${JSON.stringify(actual)}, workflow did ${JSON.stringify(expected)}`,          // b
    );                                                                                // b
  }                                                                                   // b

  cursor++;                                                                           // b
  notify(recorded, true);                                                             // b
  return recorded;                                                                    // b
}                                                                                     // b

function record(entry: Entry): void {                                                 // d
  const event = { ...entry, seq: history.length + 1 };                                // d
  history.push(event);                                                                // d
  cursor++;                                                                           // d
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                         // d
  notify(event, false);                                                               // d
}                                                                                     // d

export function onSignal<Arg>(                                                        // a
  signal: string,                                                                     // a
  handler: (arg: Arg) => unknown,                                                     // a
): void {                                                                             // a
  handlers.set(signal, handler);                                                      // a
}                                                                                     // a

export function sendSignal(signal: string, arg: unknown): void {                      // a
  record({ type: "signalReceived", signal, arg });                                    // a
  record({ type: "signalHandled", signal, result: callHandler(signal, arg) });        // a
}                                                                                     // a

export async function callActivity<Args extends unknown[], Result>(                   // e
  activity: (...args: Args) => Promise<Result>,                                       // e
  args: Args,                                                                         // e
): Promise<Result> {                                                                  // e
  const started: Entry = { type: "activityStarted", activity: activity.name, args };  // e
  if (!replay(started)) record(started);                                              // e

  const completed: Entry = { type: "activityCompleted", activity: activity.name };    // e
  const recorded = replay(completed);                                                 // e
  if (recorded) return (recorded as typeof completed).result as Result;               // e

  const result = await activity(...args);                                             // e
  record({ ...completed, result });                                                   // e
  return result;                                                                      // e
}                                                                                     // e

export async function run(                                                            // c
  workflow: Workflow,                                                                 // c
  output: (text: string) => void,                                                     // c
  onEvent: OnEvent,                                                                   // c
): Promise<void> {                                                                    // c
  history = loadHistory();                                                            // d
  cursor = 0;                                                                         // b
  notify = onEvent;                                                                   // d
  handlers.clear();                                                                   // a

  const execution = workflow();                                                       // c
  let step = await execution.next();                                                  // c

  while (!step.done) {                                                                // c
    if (!replay(step.value)) {                                                        // b
      await execute(step.value, output);                                              // c
      record(step.value);                                                             // d
    }                                                                                 // c
    step = await execution.next();                                                    // c
  }                                                                                   // c

  replaySignals();                                                                    // a
  if (cursor < history.length) {                                                      // b
    throw new Error(                                                                  // b
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,       // b
    );                                                                                // b
  }                                                                                   // b
}                                                                                     // c
