// <token_keys>
// b: replaying history
// c: running commands
// d: recording history
// </token_keys>
import { zipLongest } from "../shared/zipLongest.js";                           // b
import {                                                                        // c
  execute,                                                                      // c
  loadHistory,                                                                  // d
  type HistoryEvent,                                                            // d
  type Workflow,                                                                // c
} from "../stage3/georgeporal.js";                                              // c

export const HISTORY_KEY = "georgeporal:stage4:history";                        // d

export async function run(                                                      // c
  workflow: Workflow,                                                           // c
  output: (text: string) => void,                                               // c
  onEvent: (event: HistoryEvent, replayed: boolean) => void,                    // c
): Promise<void> {                                                              // c
  const history = loadHistory(HISTORY_KEY);                                     // d
  // Zip a copy, since we append to history as we go.                           // b
  const steps = zipLongest([...history], workflow());                           // b
  let step = await steps.next();                                                // b

  while (!step.done) {                                                          // c
    const [recorded, command] = step.value;                                     // b

    if (!command) {                                                             // b
      throw new Error(                                                          // b
        `Nondeterminism: workflow finished before event #${recorded?.seq}`,     // b
      );                                                                        // b
    }                                                                           // b

    if (recorded) {                                                             // b
      // Replay: same command as last time? Then it already happened, skip it.  // b
      if (JSON.stringify(recorded.command) !== JSON.stringify(command)) {       // b
        throw new Error(                                                        // b
          `Nondeterminism at event #${recorded.seq}: history has ` +            // b
          `${JSON.stringify(recorded.command)}, workflow yielded ` +            // b
          `${JSON.stringify(command)}`,                                         // b
        );                                                                      // b
      }                                                                         // b
      onEvent(recorded, true);                                                  // b
    } else {                                                                    // c
      await execute(command, output);                                           // c

      const event = { seq: history.length + 1, command };                       // d
      history.push(event);                                                      // d
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));               // d
      onEvent(event, false);                                                    // d
    }                                                                           // c

    step = await steps.next();                                                  // c
  }                                                                             // c
}                                                                               // c
