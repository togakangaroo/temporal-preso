// <token_keys>
// q: running commands
// </token_keys>
export type Context = {                                                         // q
  print(text: string): void;                                                    // q
};                                                                              // q

export type Workflow = (context: Context) => void;                              // q

export function run(workflow: Workflow, print: (text: string) => void): void {  // q
  workflow({ print });                                                          // q
}                                                                               // q
