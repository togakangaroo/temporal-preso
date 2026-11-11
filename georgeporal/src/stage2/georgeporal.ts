// <token_keys>
// q: running commands
// </token_keys>
export type Command =                                                       // q
  | { type: "print"; text: string }                                         // q
  | { type: "sleep"; ms: number };                                          // q

export type Workflow = () => AsyncIterable<Command>;                        // q

export const print = (text: string): Command => ({ type: "print", text });  // q
export const sleep = (ms: number): Command => ({ type: "sleep", ms });      // q

export async function run(                                                  // q
  workflow: Workflow,                                                       // q
  output: (text: string) => void,                                           // q
): Promise<void> {                                                          // q
  for await (const command of workflow()) {                                 // q
    switch (command.type) {                                                 // q
      case "print":                                                         // q
        output(command.text);                                               // q
        break;                                                              // q
      case "sleep":                                                         // q
        await new Promise((resolve) => setTimeout(resolve, command.ms));    // q
        break;                                                              // q
    }                                                                       // q
  }                                                                         // q
}                                                                           // q
