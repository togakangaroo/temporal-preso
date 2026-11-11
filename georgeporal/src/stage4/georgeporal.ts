import { zipLongest } from "../shared/zipLongest.js";
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
  // Zip a copy, since we append to history as we go.
  const steps = zipLongest([...history], workflow());
  let step = await steps.next();

  while (!step.done) {
    const [recorded, command] = step.value;

    if (!command) {
      throw new Error(
        `Nondeterminism: workflow finished before event #${recorded?.seq}`,
      );
    }

    if (recorded) {
      // Replay: same command as last time? Then it already happened, skip it.
      if (JSON.stringify(recorded.command) !== JSON.stringify(command)) {
        throw new Error(
          `Nondeterminism at event #${recorded.seq}: history has ` +
          `${JSON.stringify(recorded.command)}, workflow yielded ` +
          `${JSON.stringify(command)}`,
        );
      }
      onEvent(recorded, true);
    } else {
      await execute(command, output);

      const event = { seq: history.length + 1, command };
      history.push(event);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      onEvent(event, false);
    }

    step = await steps.next();
  }
}
