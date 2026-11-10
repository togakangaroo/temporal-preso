// The workflow blocks its thread for its whole lifetime, so it gets its own.
// On the main thread the browser could never paint a single line of output.
import { run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

run(fizzbuzzWorkflow, (text) => postMessage(text));
postMessage(null);
