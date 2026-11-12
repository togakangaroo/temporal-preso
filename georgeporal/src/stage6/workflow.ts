import { callActivity, onSignal, print, sleep, type Execution } from "./georgeporal.js";

async function generateRandomNumberActivity(min: number, max: number) {
  return Math.round(min + Math.random() * (max - min));
}

export async function* fizzbuzzWorkflow(): Execution {
  let n = 1;

  onSignal("jump to number", (newNum: number) => {
    n = newNum;
  });

  while (true) {
    if (n % 15 === 0) yield print("fizzbuzz");
    else if (n % 3 === 0) yield print("fizz");
    else if (n % 5 === 0) yield print("buzz");
    else yield print(String(n));
    n++;

    const ms: number = yield callActivity(generateRandomNumberActivity, [1000, 2000]);
    yield sleep(ms);
  }
}
