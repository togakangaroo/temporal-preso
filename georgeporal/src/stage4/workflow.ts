import { print, sleep, type Execution } from "../stage3/georgeporal.js";

export async function* fizzbuzzWorkflow(): Execution {
  let n = 1;
  while (true) {
    if (n % 15 === 0) yield print("fizzbuzz");
    else if (n % 3 === 0) yield print("fizz");
    else if (n % 5 === 0) yield print("buzz");
    else yield print(String(n));
    n++;

    yield sleep(1500);
  }
}
