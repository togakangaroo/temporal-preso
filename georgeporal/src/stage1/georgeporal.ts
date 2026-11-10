export type Context = {
  print(text: object): void;
};

export type Workflow = (context: Context) => void;

export function run(workflow: Workflow, print: (text: object) => void): void {
  workflow({ print });
}
