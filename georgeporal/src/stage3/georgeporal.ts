export type Command =
  | { type: "print"; text: string }
  | { type: "random"; min: number; max: number }
  | { type: "sleep"; ms: number };

export type HistoryEvent = { seq: number; command: Command; result?: unknown };
export type Execution = AsyncGenerator<Command, void, any>;
export type Workflow = () => Execution;

export const print = (text: string): Command => ({ type: "print", text });
export const sleep = (ms: number): Command => ({ type: "sleep", ms });
export const random = (min: number, max: number): Command => ({
  type: "random",
  min,
  max,
});

const HISTORY_KEY = "georgeporal:stage3:history";

export function loadHistory(key = HISTORY_KEY): HistoryEvent[] {
  return JSON.parse(localStorage.getItem(key) ?? "[]");
}

export async function execute(
  command: Command,
  output: (text: string) => void,
): Promise<unknown> {
  switch (command.type) {
    case "print":
      return output(command.text);
    case "random":
      return Math.round(
        command.min + Math.random() * (command.max - command.min),
      );
    case "sleep":
      return new Promise<void>((resolve) => setTimeout(resolve, command.ms));
  }
}

export async function run(
  workflow: Workflow,
  output: (text: string) => void,
  onEvent: (event: HistoryEvent) => void,
): Promise<void> {
  const history: HistoryEvent[] = [];
  const execution = workflow();
  let result: unknown;

  // for-await can't hand a value back to the workflow; next(result) can.
  let step = await execution.next();
  while (!step.done) {
    result = await execute(step.value, output);

    const event = { seq: history.length + 1, command: step.value, result };
    history.push(event);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    onEvent(event);
    step = await execution.next(result);
  }
}

export function clearHistory(key = HISTORY_KEY): void {
  localStorage.removeItem(key);
}
