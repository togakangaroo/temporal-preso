// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
// </token_keys>
import { execute, type Command, type Workflow } from "../stage3/georgeporal.js";      // q

type Entry =                                                                          // w
  | Command                                                                           // q
  | { type: "activityStarted"; activity: string; args: unknown[] }                    // r
  | { type: "activityCompleted"; activity: string; result?: unknown };                // r

export type HistoryEvent = Entry & { seq: number };                                   // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                      // w

export const HISTORY_KEY = "georgeporal:stage5:history";                              // w

export function loadHistory(): HistoryEvent[] {                                       // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                       // w
}                                                                                     // w

// callActivity is awaited rather than yielded, so it never passes through            // r
// run's loop. It reaches the running workflow's history through these instead.       // r
let history: HistoryEvent[] = [];                                                     // w
let cursor = 0;                                                                       // e
let notify: OnEvent = () => {};                                                       // w

// Returns the next recorded event if we're still replaying, otherwise undefined.     // e
function replay(expected: Entry): HistoryEvent | undefined {                          // e
  const recorded = history[cursor];                                                   // e
  if (!recorded) return undefined;                                                    // e

  // The result is what we're here to read, so it isn't part of the comparison.       // e
  const actual = { ...recorded, seq: undefined, result: undefined };                  // e
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                          // e
    throw new Error(                                                                  // e
      `Nondeterminism at event #${recorded.seq}: history has ` +                      // e
      `${JSON.stringify(actual)}, workflow did ${JSON.stringify(expected)}`,          // e
    );                                                                                // e
  }                                                                                   // e

  cursor++;                                                                           // e
  notify(recorded, true);                                                             // e
  return recorded;                                                                    // e
}                                                                                     // e

function record(entry: Entry): void {                                                 // w
  const event = { ...entry, seq: history.length + 1 };                                // w
  history.push(event);                                                                // w
  cursor++;                                                                           // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                         // w
  notify(event, false);                                                               // w
}                                                                                     // w

export async function callActivity<Args extends unknown[], Result>(                   // r
  activity: (...args: Args) => Promise<Result>,                                       // r
  args: Args,                                                                         // r
): Promise<Result> {                                                                  // r
  const started: Entry = { type: "activityStarted", activity: activity.name, args };  // r
  if (!replay(started)) record(started);                                              // r

  const completed: Entry = { type: "activityCompleted", activity: activity.name };    // r
  const recorded = replay(completed);                                                 // r
  if (recorded) return (recorded as typeof completed).result as Result;               // r

  const result = await activity(...args);                                             // r
  record({ ...completed, result });                                                   // r
  return result;                                                                      // r
}                                                                                     // r

export async function run(                                                            // q
  workflow: Workflow,                                                                 // q
  output: (text: string) => void,                                                     // q
  onEvent: OnEvent,                                                                   // q
): Promise<void> {                                                                    // q
  history = loadHistory();                                                            // w
  cursor = 0;                                                                         // e
  notify = onEvent;                                                                   // w

  for await (const command of workflow()) {                                           // q
    if (!replay(command)) {                                                           // e
      await execute(command, output);                                                 // q
      record(command);                                                                // w
    }                                                                                 // q
  }                                                                                   // q

  if (cursor < history.length) {                                                      // e
    throw new Error(                                                                  // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,       // e
    );                                                                                // e
  }                                                                                   // e
}                                                                                     // q
