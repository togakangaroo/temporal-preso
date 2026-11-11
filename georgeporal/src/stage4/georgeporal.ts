import {
  execute as executeStage3,
  loadHistory,
  type Command as Stage3Command,
} from "../stage3/georgeporal.js";

export { print, sleep } from "../stage3/georgeporal.js";

export type Command =
  | Stage3Command
  | { type: "random"; min: number; max: number };

export type HistoryEvent = { seq: number; command: Command; result?: unknown };
export type Execution = AsyncGenerator<Command, void, any>;
export type Workflow = () => Execution;

export const random = (min: number, max: number): Command => ({
  type: "random",
  min,
  max,
});

export const HISTORY_KEY = "georgeporal:stage4:history";

async function execute(
  command: Command,
  output: (text: string) => void,
): Promise<unknown> {
  if (command.type !== "random") return executeStage3(command, output);
  return Math.round(command.min + Math.random() * (command.max - command.min));
}

export async function run(
  workflow: Workflow,
  output: (text: string) => void,
  onEvent: (event: HistoryEvent, replayed: boolean) => void,
): Promise<void> {
  const history = loadHistory(HISTORY_KEY) as HistoryEvent[];
  const execution = workflow();
  let cursor = 0;
  let result: unknown;
  let step = await execution.next();

  while (!step.done) {
    const recorded = history[cursor];

    if (recorded) {
      // Replay: same command as last time? Hand back the old result, do nothing.
      if (JSON.stringify(recorded.command) !== JSON.stringify(step.value)) {
        throw new Error(
          `Nondeterminism at event #${recorded.seq}: history has ` +
          `${JSON.stringify(recorded.command)}, workflow yielded ` +
          `${JSON.stringify(step.value)}`,
        );
      }
      result = recorded.result;
      onEvent(recorded, true);
    } else {
      result = await execute(step.value, output);

      const event = { seq: history.length + 1, command: step.value, result };
      history.push(event);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      onEvent(event, false);
    }

    cursor++;
    step = await execution.next(result);
  }

  if (cursor < history.length) {
    throw new Error(
      `Nondeterminism: workflow finished with ` +
      `${history.length - cursor} events left in its history`,
    );
  }
}
