// <token_keys>
// q: running commands
// w: recording history
// e: replaying history
// r: activities
// t: signals
// y: task queue and workers
// u: server
// </token_keys>
import { execute, type Command } from "../stage3/georgeporal.js";                  // q

// Anything a worker can be asked to do.                                           // y
export type TaskCommand =                                                          // y
  | Command                                                                        // q
  | { type: "callActivity"; activity: string; args: unknown[]; maxAttempts?: number }; // r

export type Execution = AsyncGenerator<TaskCommand, void, any>;                    // q
export type Workflow = () => Execution;                                            // q

type Entry =                                                                       // w
  | { type: "workflowStarted" }                                                    // w
  | TaskCommand                                                                    // y
  | { type: "taskCompleted"; task: number; result?: unknown; error?: string }      // y
  | { type: "signalReceived"; signal: string; arg: unknown }                       // t
  | { type: "workflowCompleted" };                                                 // w

export type HistoryEvent = Entry & { seq: number; result?: unknown };              // w

export const HISTORY_KEY = "georgeporal:stage7:history";                           // w
export const QUEUE_KEY = "georgeporal:stage7:queue";                               // y
export const INBOX_KEY = "georgeporal:stage7:inbox";                               // u
const SERVER_LOCK = "georgeporal:stage7:server";                                   // u
export const POLL_MS = 100;                                                        // y

export const pause = (ms: number) =>                                               // y
  new Promise<void>((resolve) => setTimeout(resolve, ms));                         // y

export function loadHistory(): HistoryEvent[] {                                    // w
  return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");                    // w
}                                                                                  // w

// The task queue: a localStorage key that every open tab shares.                  // y
export type Task = {                                                               // y
  id: number; // seq of the history event that called for it                       // y
  work: TaskCommand | { type: "advanceWorkflow" };                                 // y
  worker?: string;                                                                 // y
  startedAt?: number;                                                              // y
  attempts?: number;                                                               // r
};                                                                                 // y

// What workers (and the page) tell the server.                                    // u
type Message =                                                                     // u
  | { type: "startWorkflow" }                                                      // u
  | { type: "signal"; signal: string; arg: unknown }                               // t
  | { type: "workflowAdvanced"; step: number; command: TaskCommand }               // u
  | { type: "workflowCompleted"; step: number }                                    // u
  | { type: "commandCompleted"; task: number; result?: unknown; error?: string };  // u

export function loadQueue(): Task[] {                                              // y
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");                      // y
}                                                                                  // y

function loadInbox(): Message[] {                                                  // u
  return JSON.parse(localStorage.getItem(INBOX_KEY) ?? "[]");                      // u
}                                                                                  // u

// Every change is a read-modify-write, and another tab could slip its own in      // y
// between. The Web Lock is held across all tabs, so one goes at a time.           // y
function update<Item, T>(key: string, change: (items: Item[]) => T): Promise<T> {  // y
  return navigator.locks.request(key, () => {                                      // y
    const items = JSON.parse(localStorage.getItem(key) ?? "[]");                   // y
    const result = change(items);                                                  // y
    localStorage.setItem(key, JSON.stringify(items));                              // y
    return result;                                                                 // y
  });                                                                              // y
}                                                                                  // y

const send = (message: Message) =>                                                 // u
  update<Message, void>(INBOX_KEY, (inbox) => { inbox.push(message); });           // u

export const startWorkflow = () => send({ type: "startWorkflow" });                // u

// ----------------------------------------------------------------------------    // u
// The server: the only thing that writes history or schedules tasks.              // u
// ----------------------------------------------------------------------------    // u

// Appends to history, and queues whatever work that event calls for. Only the     // u
// server writes history, so this needs no lock.                                   // u
async function record(entry: Entry, work?: Task["work"]): Promise<void> {          // u
  const history = loadHistory();                                                   // w
  const event = { ...entry, seq: history.length + 1 };                             // w
  localStorage.setItem(HISTORY_KEY, JSON.stringify([...history, event]));          // w
  if (work) await update<Task, void>(QUEUE_KEY, (queue) => { queue.push({ id: event.seq, work }); }); // y
}                                                                                  // u

const advance = { type: "advanceWorkflow" } as const;                              // u

// A message about an older step means history moved on while that worker was      // u
// busy (a signal came in, say). A newer task is already queued, so drop it.       // u
async function handleMessageToServer(message: Message): Promise<void> {                           // u
  const history = loadHistory();                                                   // u
  switch (message.type) {                                                          // u
    case "startWorkflow":                                                          // u
      if (history.length === 0) await record({ type: "workflowStarted" }, advance); // u
      return;                                                                      // u
    case "signal":                                                                 // t
      if (history.length > 0)                                                      // t
        await record({ type: "signalReceived", signal: message.signal, arg: message.arg }, advance); // t
      return;                                                                      // t
    case "workflowAdvanced":                                                       // u
      if (message.step === history.length) await record(message.command, message.command); // u
      return;                                                                      // u
    case "workflowCompleted":                                                      // u
      if (message.step === history.length) await record({ type: "workflowCompleted" }); // u
      return;                                                                      // u
    case "commandCompleted": {                                                     // u
      const { task, result, error } = message;                                     // u
      const done = history.some((e) => e.type === "taskCompleted" && e.task === task); // u
      if (!done) await record({ type: "taskCompleted", task, result, error }, advance); // u
      return;                                                                      // u
    }                                                                              // u
  }                                                                                // u
}                                                                                  // u

// Every tab asks for the server lock, and only one gets it. It never lets go,     // u
// so when that tab closes the browser hands the lock to the next tab in line.     // u
export function startServer(onServing: () => void): void {                         // u
  navigator.locks.request(SERVER_LOCK, async () => {                               // u
    onServing();                                                                   // u
    while (true) {                                                                 // u
      const [message] = loadInbox();                                               // u
      if (!message) {                                                              // u
        await pause(POLL_MS);                                                      // u
        continue;                                                                  // u
      }                                                                            // u
      // Handled before it's removed, so a server that dies here loses nothing.    // u
      await handleMessageToServer(message);                                        // u
      await update<Message, void>(INBOX_KEY, (inbox) => { inbox.shift(); });       // u
    }                                                                              // u
  });                                                                              // u
}                                                                                  // u

// ----------------------------------------------------------------------------    // y
// Workers: run workflow code and commands, and report back to the server.         // y
// ----------------------------------------------------------------------------    // y

let history: HistoryEvent[] = [];                                                  // e
let cursor = 0;                                                                    // e
const handlers = new Map<string, (arg: any) => unknown>();                         // t

// A signal landed at this exact point in history, so its handler runs here again. // t
function replaySignals(): void {                                                   // t
  let event = history[cursor];                                                     // t
  while (event?.type === "signalReceived") {                                       // t
    cursor++;                                                                      // t
    handlers.get(event.signal)!(event.arg);                                        // t
    event = history[cursor];                                                       // t
  }                                                                                // t
}                                                                                  // t

// Returns the next recorded event if we're still replaying, otherwise undefined.  // e
// Only the fields the workflow already knows are compared: what a task            // e
// returned is what we're here to read.                                            // e
function replay(expected: Entry): HistoryEvent | undefined {                       // e
  replaySignals();                                                                 // t

  const recorded = history[cursor];                                                // e
  if (!recorded) return undefined;                                                 // e

  const actual = Object.fromEntries(                                               // e
    Object.keys(expected).map((key) => [key, (recorded as any)[key]]),             // e
  );                                                                               // e
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {                       // e
    throw new Error(                                                               // e
      `Nondeterminism at event #${recorded.seq}: history has ` +                   // e
      `${JSON.stringify(recorded)}, workflow did ${JSON.stringify(expected)}`,     // e
    );                                                                             // e
  }                                                                                // e

  cursor++;                                                                        // e
  return recorded;                                                                 // e
}                                                                                  // e

// A task that failed for good throws in the workflow, just as an activity would.  // r
function outcome({ result, error }: { result?: unknown; error?: string }): unknown { // r
  if (error) throw new Error(error);                                               // r
  return result;                                                                   // r
}

// A workflow task: replay history up to `step` from scratch, then report the      // e
// one new command the workflow wants. If it's still waiting on a task that        // e
// hasn't finished, there's nothing to report.                                     // e
async function advanceWorkflow(workflow: Workflow, step: number): Promise<Message | undefined> { // e
  history = loadHistory().slice(0, step);                                          // e
  cursor = 1; // past workflowStarted                                              // e
  handlers.clear();                                                                // t

  const execution = workflow();                                                    // q
  let next = await execution.next();                                               // q
  while (!next.done) {                                                             // q
    const command = next.value;                                                    // q
    const scheduled = replay(command);                                             // e
    if (!scheduled) return { type: "workflowAdvanced", step, command };            // u
    const completed = replay({ type: "taskCompleted", task: scheduled.seq });      // e
    if (!completed) return undefined;                                              // e
    next = await execution.next(outcome(completed));                               // q
  }                                                                                // q

  replaySignals();                                                                 // t
  if (cursor < history.length) {                                                   // e
    throw new Error(                                                               // e
      `Nondeterminism: workflow finished before event #${history[cursor].seq}`,    // e
    );                                                                             // e
  }                                                                                // e
  return { type: "workflowCompleted", step };                                      // u
}                                                                                  // e

export const sendSignal = (signal: string, arg: unknown) =>                        // t
  send({ type: "signal", signal, arg });                                           // t

export function onSignal<Arg>(signal: string, handler: (arg: Arg) => unknown) {    // t
  handlers.set(signal, handler);                                                   // t
}                                                                                  // t

// Only the activity's name goes on the queue. Whichever worker picks it up        // r
// has to have registered an activity by that name.                                // r
export const callActivity = (                                                      // r
  activity: (...args: any[]) => Promise<unknown>,                                  // r
  args: unknown[],                                                                 // r
  { maxAttempts }: { maxAttempts?: number } = {},                                  // r
): TaskCommand => ({ type: "callActivity", activity: activity.name, args, maxAttempts }); // r

type Activities = Record<string, (...args: any[]) => Promise<unknown>>;            // r

// A task still unfinished this long after a worker took it is assumed lost        // y
// along with that worker (a crashed tab, say), so any worker may take it again.   // y
const START_TO_CLOSE_TIMEOUT_MS = 5000;                                            // y

// Under the lock, so two workers polling at once can't both take the same task.   // y
function take(worker: string): Promise<Task | undefined> {                         // y
  return update<Task, Task | undefined>(QUEUE_KEY, (queue) => {                    // y
    const task = queue.find(                                                       // y
      (t) => !t.worker || Date.now() - t.startedAt! > START_TO_CLOSE_TIMEOUT_MS,   // y
    );                                                                             // y
    if (task) Object.assign(task, { worker, startedAt: Date.now(), attempts: (task.attempts ?? 0) + 1 }); // r
    return task;                                                                   // y
  });                                                                              // y
}                                                                                  // y

// Tell the server first: if we die before the task is off the queue, it just      // y
// runs again, and the server ignores the repeat.                                  // y
async function finish(id: number, message?: Message): Promise<void> {              // y
  if (message) await send(message);                                                // y
  await update<Task, void>(QUEUE_KEY, (queue) => {                                 // y
    const index = queue.findIndex((t) => t.id === id);                             // y
    if (index !== -1) queue.splice(index, 1);                                      // y
  });                                                                              // y
}                                                                                  // y

// A failed attempt goes back on the queue for any worker to take, unless it was the last one allowed. // r
async function fail(task: Task, error: string, maxAttempts: number): Promise<void> { // r
  if (task.attempts! >= maxAttempts) {                                             // r
    return finish(task.id, { type: "commandCompleted", task: task.id, error });    // r
  }                                                                                // r
  await update<Task, void>(QUEUE_KEY, (queue) => {                                 // r
    const current = queue.find((t) => t.id === task.id);                           // r
    if (current) Object.assign(current, { worker: undefined, startedAt: undefined }); // r
  });                                                                              // r
}                                                                                  // r

async function perform(task: Task, workflow: Workflow, activities: Activities, output: (text: string) => void) { // y
  const { id, work } = task;                                                       // y
  if (work.type === "advanceWorkflow") {                                           // e
    return finish(id, await advanceWorkflow(workflow, id));                        // e
  }                                                                                // e
  if (work.type !== "callActivity") {                                              // q
    const result = await execute(work, output);                                    // q
    return finish(id, { type: "commandCompleted", task: id, result });             // q
  }                                                                                // q
  let result: unknown;                                                             // r
  try {                                                                            // r
    result = await activities[work.activity](...work.args);                        // r
  } catch (error) {                                                                // r
    return fail(task, String(error), work.maxAttempts ?? Infinity);                // r
  }                                                                                // r
  await finish(id, { type: "commandCompleted", task: id, result });                // r
}                                                                                  // y

export async function startWorker(                                                 // y
  name: string,                                                                    // y
  workflow: Workflow,                                                              // y
  activities: Activities,                                                          // y
  output: (text: string) => void,                                                  // y
): Promise<never> {                                                                // y
  while (true) {                                                                   // y
    const task = await take(name);                                                 // y
    if (!task) {                                                                   // y
      await pause(POLL_MS);                                                        // y
      continue;                                                                    // y
    }                                                                              // y
    // A task that blows up (nondeterminism, say) stays on the queue, and is       // y
    // retried once it times out.                                                  // y
    await perform(task, workflow, activities, output).catch((error) => output(String(error))); // y
  }                                                                                // y
}                                                                                  // y
