import { execute } from "../stage3/georgeporal.js";
import { pause, POLL_MS, updateQueue, type Task } from "./georgeporal.js";

type Activities = Record<string, (...args: any[]) => Promise<unknown>>;

// A task still unfinished this long after a worker took it is assumed lost
// along with that worker (a crashed tab, say), so any worker may take it again.
const START_TO_CLOSE_TIMEOUT_MS = 5000;

// Under the lock, so two workers polling at once can't both take the same task.
function take(worker: string): Promise<Task | undefined> {
  return updateQueue((queue) => {
    const task = queue.find(
      (t) =>
        !t.worker ||
        (!t.done && Date.now() - t.startedAt! > START_TO_CLOSE_TIMEOUT_MS),
    );
    if (task) Object.assign(task, { worker, startedAt: Date.now() });
    return task;
  });
}

function finish(id: number, result: unknown): Promise<void> {
  return updateQueue((queue) => {
    const task = queue.find((t) => t.id === id);
    if (task) Object.assign(task, { done: true, result });
  });
}

export async function startWorker(
  name: string,
  activities: Activities,
  output: (text: string) => void,
): Promise<never> {
  while (true) {
    const task = await take(name);
    if (!task) {
      await pause(POLL_MS);
      continue;
    }

    const { command } = task;
    const result =
      command.type === "activity"
        ? await activities[command.activity](...command.args)
        : await execute(command, output);
    await finish(task.id, result);
  }
}
