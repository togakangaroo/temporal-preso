// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// </token_keys>
import {                                                                        // q
  execute,                                                                      // q
  loadHistory,                                                                  // w
  type HistoryEvent,                                                            // w
  type Workflow,                                                                // q
} from "../stage3/georgeporal.js";                                              // q

export const HISTORY_KEY = "georgeporal:stage4:history";                        // w

export async function run(                                                      // q
  workflow: Workflow,                                                           // q
  output: (text: string) => void,                                               // q
  onEvent: (event: HistoryEvent, replayed: boolean) => void,                    // q
): Promise<void> {                                                              // q
  const history = loadHistory(HISTORY_KEY);                                     // w
  const recordedCount = history.length;                                         // e
  let seq = 0;                                                                  // w

  for await (const command of workflow()) {                                     // q
    seq++;                                                                      // w

    if (seq <= recordedCount) {                                                 // e
      const recorded = history[seq - 1];                                        // e
      // Replay: same command as last time? Then it already happened, skip it.  // e
      if (JSON.stringify(recorded.command) !== JSON.stringify(command)) {       // e
        throw new Error(                                                        // e
          `Nondeterminism at event #${recorded.seq}: history has ` +            // e
          `${JSON.stringify(recorded.command)}, workflow yielded ` +            // e
          `${JSON.stringify(command)}`,                                         // e
        );                                                                      // e
      }                                                                         // e
      onEvent(recorded, true);                                                  // e
    } else {                                                                    // q
      await execute(command, output);                                           // q

      const event = { seq, command };                                           // w
      history.push(event);                                                      // w
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));               // w
      onEvent(event, false);                                                    // w
    }                                                                           // q
  }                                                                             // q

  if (seq < recordedCount) {                                                    // e
    throw new Error(                                                            // e
      `Nondeterminism: workflow finished before event #${seq + 1}`,             // e
    );                                                                          // e
  }                                                                             // e
}                                                                               // q
