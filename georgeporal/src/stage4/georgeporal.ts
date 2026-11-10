import {
  execute,
  loadHistory,
  type HistoryEvent,
  type Workflow,
} from "../stage3/georgeporal.js";

export const HISTORY_KEY = "georgeporal:stage4:history";

export async function run(
  workflow: Workflow,
  output: (text: string) => void,
  onEvent: (event: HistoryEvent, replayed: boolean) => void,
): Promise<void> {
  const history = loadHistory(HISTORY_KEY);
  const execution = workflow();
  let cursor = 0;
  let result: unknown;

  for (
    let step = await execution.next();
    !step.done;
    step = await execution.next(result)
  ) {
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
      cursor++;
      onEvent(recorded, true);
      continue;
    }

    result = await execute(step.value, output);

    const event = { seq: history.length + 1, command: step.value, result };
    history.push(event);
    cursor++;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    onEvent(event, false);
  }

  if (cursor < history.length) {
    throw new Error(
      `Nondeterminism: workflow finished with ` +
        `${history.length - cursor} events left in its history`,
    );
  }
}
