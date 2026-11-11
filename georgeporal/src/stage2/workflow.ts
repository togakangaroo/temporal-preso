import { print, sleep, type Command } from "./georgeporal.js";

export async function* fizzbuzzWorkflow(): AsyncGenerator<Command> {
  let n = 1;
  while (true) {
    if (n % 15 === 0) yield print("fizzbuzz");
    else if (n % 3 === 0) yield print("fizz");
    else if (n % 5 === 0) yield print("buzz");
    else yield print(String(n));
    n++;

    yield sleep(1000 + Math.random() * 1000);
  }
}
