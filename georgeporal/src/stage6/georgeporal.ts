// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
// t: signals
// </token_keys>
export type Activity = (...args: any[]) => Promise<unknown>;                            // r

export type Command =                                                                   // q
  | { type: "print"; text: string }                                                     // q
  | { type: "sleep"; ms: number }                                                       // q
  | { type: "callActivity"; activity: Activity; args: unknown[] };                      // r

export type Execution = AsyncGenerator<Command, void, any>;                             // q
export type Workflow = () => Execution;                                                 // q

export const print = (text: string): Command => ({ type: "print", text });              // q
export const sleep = (ms: number): Command => ({ type: "sleep", ms });                  // q
export const callActivity = (activity: Activity, args: unknown[]): Command =>           // r
  ({ type: "callActivity", activity, args });                                           // r

type Entry =                                                                            // w
  | { type: "print"; text: string }                                                     // q
  | { type: "sleep"; ms: number }                                                       // q
  | { type: "activityStarted"; activity: string; args: unknown[] }                      // r
  | { type: "activityCompleted"; activity: string; result?: unknown }                   // r
  | { type: "signalReceived"; signal: string; arg: unknown }                            // t
  | { type: "signalHandled"; signal: string; result?: unknown };                        // t

export type HistoryEvent = Entry & { seq: number; result?: unknown };                   // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                        // w
type SignalHandler = (arg: any) => unknown;                                             // t

export const HISTORY_KEY = "georgeporal:stage6:history";                                // w

export function loadHistory(): HistoryEvent[] {                                         // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                         // w
}                                                                                       // w

let history: HistoryEvent[] = [];                                                       // w
let cursor = 0;                                                                         // e
let notify: OnEvent = () => {};                                                         // w
const handlers = new Map<string, SignalHandler>();                                      // t

function callHandler(signal: string, arg: unknown): unknown {                           // t
  const handler = handlers.get(signal);                                                 // t
  if (!handler) throw new Error(`No handler for signal "${signal}"`);                   // t
  return handler(arg);                                                                  // t
}                                                                                       // t

// A signal landed at this exact point last time, so its handler runs here again.       // t
function replaySignals(): void {                                                        // t
  let event = history[cursor];                                                          // t
  while (event?.type === "signalReceived") {                                            // t
    const { signal, arg } = event;                                                      // t
    cursor++;                                                                           // t
    notify(event, true);                                                                // t

    const handled: Entry = {                                                            // t
      type: "signalHandled",                                                            // t
      signal,                                                                           // t
      result: callHandler(signal, arg),                                                 // t
    };                                                                                  // t
    if (!replay(handled)) record(handled);                                              // e
    event = history[cursor];                                                            // t
  }                                                                                     // t
}                                                                                       // t

// Returns the next recorded event if we're still replaying, otherwise undefined.       // e
function replay(expected: Entry): HistoryEvent | undefined {                            // e
  if (expected.type !== "signalHandled") replaySignals();                               // t

  const recorded = history[cursor];                                                     // e
  if (!recorded) return undefined;                                                      // e

  // An activity's result is what we're here to read, so it can't be compared.          // e
  const { result } = recorded;                                                          // e
  const actual = {                                                                      // e
    ...recorded,                                                                        // e
    seq: undefined,                                                                     // e
    result: "result" in expected ? result : undefined,                                  // e
  };                                                                                    // e
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                            // e
    throw new Error(                                                                    // e
      `Nondeterminism at event #${recorded.seq}: history has ` +                        // e
      `${JSON.stringify(actual)}, workflow did ${JSON.stringify(expected)}`,            // e
    );                                                                                  // e
  }                                                                                     // e

  cursor++;                                                                             // e
  notify(recorded, true);                                                               // e
  return recorded;                                                                      // e
}                                                                                       // e

function record(entry: Entry): void {                                                   // w
  const event = { ...entry, seq: history.length + 1 };                                  // w
  history.push(event);                                                                  // w
  cursor++;                                                                             // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                           // w
  notify(event, false);                                                                 // w
}                                                                                       // w

export function onSignal<Arg>(                                                          // t
  signal: string,                                                                       // t
  handler: (arg: Arg) => unknown,                                                       // t
): void {                                                                               // t
  handlers.set(signal, handler);                                                        // t
}                                                                                       // t

export function sendSignal(signal: string, arg: unknown): void {                        // t
  record({ type: "signalReceived", signal, arg });                                      // t
  record({ type: "signalHandled", signal, result: callHandler(signal, arg) });          // t
}                                                                                       // t

// Each command records the events it produces. A callActivity leaves two, one when it    // r
// starts and one when it completes, so on replay both are read back from history.       // r
export async function execute(                                                          // q
  command: Command,                                                                     // q
  output: (text: string) => void,                                                       // q
): Promise<unknown> {                                                                   // q
  switch (command.type) {                                                               // q
    case "print":                                                                       // q
      if (!replay(command)) {                                                           // e
        output(command.text);                                                           // q
        record(command);                                                                // w
      }                                                                                 // q
      return undefined;                                                                 // q
    case "sleep":                                                                       // q
      if (!replay(command)) {                                                           // e
        await new Promise<void>((resolve) => setTimeout(resolve, command.ms));          // q
        record(command);                                                                // w
      }                                                                                 // q
      return undefined;                                                                 // q
    case "callActivity": {                                                              // r
      const activity = command.activity.name;                                           // r
      const started = { type: "activityStarted", activity, args: command.args } as const; // r
      if (!replay(started)) record(started);                                            // r

      const recorded = replay({ type: "activityCompleted", activity });                 // e
      if (recorded) return recorded.result;                                             // e

      const result = await command.activity(...command.args);                           // r
      record({ type: "activityCompleted", activity, result });                          // r
      return result;                                                                    // r
    }                                                                                   // r
  }                                                                                     // q
}                                                                                       // q

export async function run(                                                              // q
  workflow: Workflow,                                                                   // q
  output: (text: string) => void,                                                       // q
  onEvent: OnEvent,                                                                     // q
): Promise<void> {                                                                      // q
  history = loadHistory();                                                              // w
  cursor = 0;                                                                           // e
  notify = onEvent;                                                                     // w
  handlers.clear();                                                                     // t

  const execution = workflow();                                                         // q
  let next = await execution.next();                                                    // q
  while (!next.done) {                                                                  // q
    next = await execution.next(await execute(next.value, output));                     // q
  }                                                                                     // q

  replaySignals();                                                                      // t
  if (cursor < history.length) {                                                        // e
    throw new Error(                                                                    // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,         // e
    );                                                                                  // e
  }                                                                                     // e
}                                                                                       // q
