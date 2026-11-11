// <token_keys>
// c: running commands
// d: recording history
// </token_keys>
export type Command =                                                          // c
  | { type: "print"; text: string }                                            // c
  | { type: "sleep"; ms: number };                                             // c

export type HistoryEvent = { seq: number; command: Command };                  // d
export type Execution = AsyncGenerator<Command, void, void>;                   // c
export type Workflow = () => Execution;                                        // c

export const print = (text: string): Command => ({ type: "print", text });     // c
export const sleep = (ms: number): Command => ({ type: "sleep", ms });         // c

const HISTORY_KEY = "georgeporal:stage3:history";                              // d

export function loadHistory(key = HISTORY_KEY): HistoryEvent[] {               // d
  return JSON.parse(localStorage.getItem(key) ?? "[]");                        // d
}                                                                              // d

export async function execute(                                                 // c
  command: Command,                                                            // c
  output: (text: string) => void,                                              // c
): Promise<void> {                                                             // c
  switch (command.type) {                                                      // c
    case "print":                                                              // c
      return output(command.text);                                             // c
    case "sleep":                                                              // c
      return new Promise<void>((resolve) => setTimeout(resolve, command.ms));  // c
  }                                                                            // c
}                                                                              // c

export async function run(                                                     // c
  workflow: Workflow,                                                          // c
  output: (text: string) => void,                                              // c
  onEvent: (event: HistoryEvent) => void,                                      // c
): Promise<void> {                                                             // c
  const history: HistoryEvent[] = [];                                          // d
  const execution = workflow();                                                // c

  let step = await execution.next();                                           // c
  while (!step.done) {                                                         // c
    await execute(step.value, output);                                         // c

    const event = { seq: history.length + 1, command: step.value };            // d
    history.push(event);                                                       // d
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));                // d
    onEvent(event);                                                            // d
    step = await execution.next();                                             // c
  }                                                                            // c
}                                                                              // c

export function clearHistory(key = HISTORY_KEY): void {                        // d
  localStorage.removeItem(key);                                                // d
}                                                                              // d
