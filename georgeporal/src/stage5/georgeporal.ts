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
  | { type: "callActivity"; activity: Activity; args: unknown[]; maxAttempts?: number }; // r

export type Execution = AsyncGenerator<Command, void, any>;                             // q
export type Workflow = () => Execution;                                                 // q

export const print = (text: string): Command => ({ type: "print", text });              // q
export const sleep = (ms: number): Command => ({ type: "sleep", ms });                  // q
export const callActivity = (                                                           // r
  activity: Activity,                                                                   // r
  args: unknown[],                                                                      // r
  { maxAttempts }: { maxAttempts?: number } = {},                                       // r
): Command => ({ type: "callActivity", activity, args, maxAttempts });                  // r

type Entry =                                                                            // w
  | { type: "print"; text: string }                                                     // q
  | { type: "sleep"; ms: number }                                                       // q
  | { type: "activityStarted"; activity: string; args: unknown[] }                      // r
  | { type: "activityFailed"; activity: string; attempt: number }                       // r
  | { type: "activityCompleted"; activity: string; result?: unknown };                  // r

export type HistoryEvent = Entry & { seq: number; result?: unknown };                   // w
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;                        // w

export const HISTORY_KEY = "georgeporal:stage5:history";                                // w

export function loadHistory(): HistoryEvent[] {                                         // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                         // w
}                                                                                       // w

let history: HistoryEvent[] = [];                                                       // w
let cursor = 0;                                                                         // e
let notify: OnEvent = () => {};                                                         // w

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

function record(entry: Entry & { result?: unknown }): void {                            // w
  const event = { ...entry, seq: history.length + 1 };                                  // w
  history.push(event);                                                                  // w
  cursor++;                                                                             // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                           // w
  notify(event, false);                                                                 // w
}                                                                                       // w

// Each command records the events it produces. A callActivity records one event when it  // r
// starts, one for each failed attempt, and one when it completes. On replay all of them  // r
// are read back from history, so the activity isn't run again.                           // r
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
      const maxAttempts = command.maxAttempts ?? Infinity;                              // r
      const started = { type: "activityStarted", activity, args: command.args } as const; // r
      if (!replay(started)) record(started);                                            // r

      for (let attempt = 1; ; attempt++) {                                              // r
        const failed = { type: "activityFailed", activity, attempt } as const;          // r
        if (history[cursor]?.type === "activityFailed") {                               // e
          const failure = replay(failed);                                               // e
          if (attempt === maxAttempts) throw new Error(String(failure?.result));        // e
          continue;                                                                     // e
        }

        const recorded = replay({ type: "activityCompleted", activity });               // e
        if (recorded) return recorded.result;                                           // e

        let result: unknown;                                                            // r
        try {                                                                           // r
          result = await command.activity(...command.args);                             // r
        } catch (error) {                                                               // r
          record({ ...failed, result: String(error) });                                 // r
          if (attempt === maxAttempts) throw error;                                     // r
          continue;                                                                     // r
        }                                                                               // r
        record({ type: "activityCompleted", activity, result });                        // r
        return result;                                                                  // r
      }                                                                                 // r
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

  const execution = workflow();                                                         // q
  let next = await execution.next();                                                    // q
  while (!next.done) {                                                                  // q
    next = await execution.next(await execute(next.value, output));                     // q
  }                                                                                     // q

  if (cursor < history.length) {                                                        // e
    throw new Error(                                                                    // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,         // e
    );                                                                                  // e
  }                                                                                     // e
}                                                                                       // q
