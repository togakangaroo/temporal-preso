// <token_keys>
// c: running commands
// </token_keys>
export type Command =                                                       // c
  | { type: "print"; text: string }                                         // c
  | { type: "sleep"; ms: number };                                          // c

export type Workflow = () => AsyncIterable<Command>;                        // c

export const print = (text: string): Command => ({ type: "print", text });  // c
export const sleep = (ms: number): Command => ({ type: "sleep", ms });      // c

export async function run(                                                  // c
  workflow: Workflow,                                                       // c
  output: (text: string) => void,                                           // c
): Promise<void> {                                                          // c
  for await (const command of workflow()) {                                 // c
    switch (command.type) {                                                 // c
      case "print":                                                         // c
        output(command.text);                                               // c
        break;                                                              // c
      case "sleep":                                                         // c
        await new Promise((resolve) => setTimeout(resolve, command.ms));    // c
        break;                                                              // c
    }                                                                       // c
  }                                                                         // c
}                                                                           // c
