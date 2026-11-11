// <token_keys>
// q: running commands
// w: recording history
// </token_keys>
export type Command =                                                          // q
  | { type: "print"; text: string }                                            // q
  | { type: "sleep"; ms: number };                                             // q

export type HistoryEvent = { seq: number; command: Command };                  // w
export type Execution = AsyncGenerator<Command, void, void>;                   // q
export type Workflow = () => Execution;                                        // q

export const print = (text: string): Command => ({ type: "print", text });     // q
export const sleep = (ms: number): Command => ({ type: "sleep", ms });         // q

const HISTORY_KEY = "georgeporal:stage3:history";                              // w

export function loadHistory(key = HISTORY_KEY): HistoryEvent[] {               // w
  return JSON.parse(localStorage.getItem(key) ?? "[]");                        // w
}                                                                              // w

export async function execute(                                                 // q
  command: Command,                                                            // q
  output: (text: string) => void,                                              // q
): Promise<void> {                                                             // q
  switch (command.type) {                                                      // q
    case "print":                                                              // q
      return output(command.text);                                             // q
    case "sleep":                                                              // q
      return new Promise<void>((resolve) => setTimeout(resolve, command.ms));  // q
  }                                                                            // q
}                                                                              // q

export async function run(                                                     // q
  workflow: Workflow,                                                          // q
  output: (text: string) => void,                                              // q
  onEvent: (event: HistoryEvent) => void,                                      // q
): Promise<void> {                                                             // q
  const history: HistoryEvent[] = [];                                          // w
  const execution = workflow();                                                // q

  let step = await execution.next();                                           // q
  while (!step.done) {                                                         // q
    await execute(step.value, output);                                         // q

    const event = { seq: history.length + 1, command: step.value };            // w
    history.push(event);                                                       // w
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                // w
    onEvent(event);                                                            // w
    step = await execution.next();                                             // q
  }                                                                            // q
}                                                                              // q

export function clearHistory(key = HISTORY_KEY): void {                        // w
  localStorage.removeItem(key);                                                // w
}                                                                              // w
