import { print, sleep, type Execution } from "../stage3/georgeporal.js";
import { callActivity, onSignal } from "./georgeporal.js";

export async function generateRandomNumberActivity(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

export async function* fizzbuzzWorkflow(): Execution {
  let n = 1;

  onSignal("jump to number", (newNum: number) => {
    n = newNum;
  });

  while (n <= 1000) {
    if (n % 15 === 0) yield print("fizzbuzz");
    else if (n % 3 === 0) yield print("fizz");
    else if (n % 5 === 0) yield print("buzz");
    else yield print(String(n));
    n++;

    const ms = await callActivity(generateRandomNumberActivity, [1000, 2000]);
    yield sleep(ms);
  }
}
