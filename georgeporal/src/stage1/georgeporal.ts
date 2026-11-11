// <token_keys>
// c: running commands
// </token_keys>
export type Context = {                                                         // c
  print(text: string): void;                                                    // c
};                                                                              // c

export type Workflow = (context: Context) => void;                              // c

export function run(workflow: Workflow, print: (text: string) => void): void {  // c
  workflow({ print });                                                          // c
}                                                                               // c
