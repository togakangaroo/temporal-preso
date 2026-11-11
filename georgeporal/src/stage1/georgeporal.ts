export type Context = {
  print(text: string): void;
};

export type Workflow = (context: Context) => void;

export function run(workflow: Workflow, print: (text: string) => void): void {
  workflow({ print });
}
