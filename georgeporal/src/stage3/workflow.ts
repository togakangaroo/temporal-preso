import { print, sleep, type Execution } from "./georgeporal.js";

export async function* fizzbuzzWorkflow(): Execution {
  for (let n = 1; n <= 1000; n++) {
    if (n % 15 === 0) yield print("fizzbuzz");
    else if (n % 3 === 0) yield print("fizz");
    else if (n % 5 === 0) yield print("buzz");
    else yield print(String(n));

    yield sleep(2000 + Math.random() * 2000);
  }
}
