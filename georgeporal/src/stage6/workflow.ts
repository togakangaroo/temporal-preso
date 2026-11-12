import { callActivity, onSignal, print, sleep, type Execution } from "./georgeporal.js";

async function generateRandomNumberActivity(min: number, max: number) {
  const num = Math.round( Math.random() * max );
  if (num < min)
    throw Error("That math don't work")
  return num
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

    const ms: number = yield callActivity(generateRandomNumberActivity, [500, 2000]);
    yield sleep(ms);
  }
}
