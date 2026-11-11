// <token_keys>
// b: replaying history
// c: running commands
// d: recording history
// e: activities
// </token_keys>
import { execute, type Command, type Workflow } from "../stage3/georgeporal.js";      // c

type Entry =                                                                          // d
  | Command                                                                           // c
  | { type: "activityStarted"; activity: string; args: unknown[] }                    // e
  | { type: "activityCompleted"; activity: string; result?: unknown };                // e

export type HistoryEvent = Entry & { seq: number };                                   // d
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                      // d

export const HISTORY_KEY = "georgeporal:stage5:history";                              // d

export function loadHistory(): HistoryEvent[] {                                       // d
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                       // d
}                                                                                     // d

// callActivity is awaited rather than yielded, so it never passes through            // e
// run's loop. It reaches the running workflow's history through these instead.       // e
let history: HistoryEvent[] = [];                                                     // d
let cursor = 0;                                                                       // b
let notify: OnEvent = () => {};                                                       // d

// Returns the next recorded event if we're still replaying, otherwise undefined.     // b
function replay(expected: Entry): HistoryEvent | undefined {                          // b
  const recorded = history[cursor];                                                   // b
  if (!recorded) return undefined;                                                    // b

  // The result is what we're here to read, so it isn't part of the comparison.       // b
  const actual = { ...recorded, seq: undefined, result: undefined };                  // b
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

  const execution = workflow();                                                       // c
  let step = await execution.next();                                                  // c

  while (!step.done) {                                                                // c
    if (!replay(step.value)) {                                                        // b
      await execute(step.value, output);                                              // c
      record(step.value);                                                             // d
    }                                                                                 // c
    step = await execution.next();                                                    // c
  }                                                                                   // c

  if (cursor < history.length) {                                                      // b
    throw new Error(                                                                  // b
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,       // b
    );                                                                                // b
  }                                                                                   // b
}                                                                                     // c
