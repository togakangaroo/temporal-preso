import type { Context } from "./georgeporal.js";

// A synchronous function can't give up the thread, so waiting means spinning.
function sleep(ms: number) {
    const end = Date.now() + ms;
    while (Date.now() < end);
}

export function fizzbuzzWorkflow({ print }: Context) {
  for (let n = 1; n <= 1000; n++) {
    if (n % 15 === 0) print("fizzbuzz");
    else if (n % 3 === 0) print("fizz");
    else if (n % 5 === 0) print("buzz");
    else print(String(n));

    sleep(2000 + Math.random() * 2000);
  }
}
