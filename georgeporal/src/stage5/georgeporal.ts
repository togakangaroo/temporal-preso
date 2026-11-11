import { execute, type Command, type Workflow } from "../stage3/georgeporal.js";

type Entry =
  | Command
  | { type: "activityStarted"; activity: string; args: unknown[] }
  | { type: "activityCompleted"; activity: string; result?: unknown };

export type HistoryEvent = Entry & { seq: number };
type OnEvent = (event: HistoryEvent, replayed: boolean) => void;

export const HISTORY_KEY = "georgeporal:stage5:history";

export function loadHistory(): HistoryEvent[] {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
}

// callActivity is awaited rather than yielded, so it never passes through
// run's loop. It reaches the running workflow's history through these instead.
let history: HistoryEvent[] = [];
let cursor = 0;
let notify: OnEvent = () => {};

// Returns the next recorded event if we're still replaying, otherwise undefined.
function replay(expected: Entry): HistoryEvent | undefined {
  const recorded = history[cursor];
  if (!recorded) return undefined;

  // The result is what we're here to read, so it isn't part of the comparison.
  const actual = { ...recorded, seq: undefined, result: undefined };
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

  const execution = workflow();
  let step = await execution.next();

  while (!step.done) {
    if (!replay(step.value)) {
      await execute(step.value, output);
      record(step.value);
    }
    step = await execution.next();
  }

  if (cursor < history.length) {
    throw new Error(
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,
    );
  }
}
