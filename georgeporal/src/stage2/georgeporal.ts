export type Command =
  | { type: "print"; text: string }
  | { type: "sleep"; ms: number };

export type Workflow = () => AsyncIterable<Command>;

export const print = (text: string): Command => ({ type: "print", text });
export const sleep = (ms: number): Command => ({ type: "sleep", ms });

export async function run(
  workflow: Workflow,
  output: (text: string) => void,
): Promise<void> {
  for await (const command of workflow()) {
    switch (command.type) {
      case "print":
        output(command.text);
        break;
      case "sleep":
        await new Promise((resolve) => setTimeout(resolve, command.ms));
        break;
    }
  }
}
