// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
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
  | { type: "callActivity"; activity: string; args: unknown[] };                        // r

export type HistoryEvent = Entry & { seq: number; result?: unknown };                   // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                        // w

export const HISTORY_KEY = "georgeporal:stage5:history";                                // w

export function loadHistory(): HistoryEvent[] {                                         // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                         // w
}                                                                                       // w

let history: HistoryEvent[] = [];                                                       // w
let cursor = 0;                                                                         // e
let notify: OnEvent = () => {};                                                         // w

// The activity function can't be stored, so history keeps its name instead.            // w
function entryOf(command: Command): Entry {                                             // w
  if (command.type !== "callActivity") return command;                                  // w
  return { type: "callActivity", activity: command.activity.name, args: command.args }; // w
}                                                                                       // w

// Returns the next recorded event if we're still replaying, otherwise undefined.       // e
function replay(expected: Entry): HistoryEvent | undefined {                            // e
  const recorded = history[cursor];                                                     // e
  if (!recorded) return undefined;                                                      // e

// The result is what we're here to read, so it isn't part of the comparison.           // e
  const actual = { ...recorded, seq: undefined, result: undefined };                    // e
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

function record(entry: Entry, result?: unknown): void {                                 // w
  const event = { ...entry, seq: history.length + 1, result };                          // w
  history.push(event);                                                                  // w
  cursor++;                                                                             // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                           // w
  notify(event, false);                                                                 // w
}                                                                                       // w

export async function execute(                                                          // q
  command: Command,                                                                     // q
  output: (text: string) => void,                                                       // q
): Promise<unknown> {                                                                   // q
  switch (command.type) {                                                               // q
    case "print":                                                                       // q
      return output(command.text);                                                      // q
    case "sleep":                                                                       // q
      return new Promise<void>((resolve) => setTimeout(resolve, command.ms));           // q
    case "callActivity":                                                                // r
      return command.activity(...command.args);                                         // r
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

  const execution = workflow();                                                         // q
  let next = await execution.next();                                                    // q
  while (!next.done) {                                                                  // q
    const entry = entryOf(next.value);                                                  // w
    const recorded = replay(entry);                                                     // e
    const result = recorded ? recorded.result : await execute(next.value, output);      // q
    if (!recorded) record(entry, result);                                               // w
    next = await execution.next(result);                                                // q
  }                                                                                     // q

  if (cursor < history.length) {                                                        // e
    throw new Error(                                                                    // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,         // e
    );                                                                                  // e
  }                                                                                     // e
}                                                                                       // q
