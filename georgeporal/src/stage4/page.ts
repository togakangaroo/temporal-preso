import { describeEvent, mountPage } from "../shared/page.js";
import { clearHistory, loadHistory } from "../stage3/georgeporal.js";
import { HISTORY_KEY, run } from "./georgeporal.js";
import { fizzbuzzWorkflow } from "./workflow.js";

const page = mountPage({
  stage: 4,
  showHistory: true,
  blurb:
    "When running awokrflow, first walk recorded history alongside the generator. This both rebuilds the internal state and verifies that things are happening exactly as before.",
  tryThis:
    "crash, then Resume. Replay of the event history allows the workflow to pick up where it was last.",
  explainer: [
    {
      heading: "What's going on",
      body: [
        "The workflow always starts running from its first line, and for each command it yields, we check it against the recorded event history at that position. If they match, the command has already happened, so it is skipped: no print, no sleep. Once the history runs out, the workflow is caught up and starts carrying out commands for real again.",
        "Note that we still use our workflow functions state implementing fizzbuzz same as before; the code running in replay mode rebuilds the workflow's state.",
        "This also brings in our first really  major compromize - workflow code needs to be entirely deterministic. If replaying the event history can produce a different sequence of commands then we cannot recreate state and it's an error. This is why we sleep for a fixed number of seconds here rather than the previous stage's call to `Math.random()`. If we were to do that here then replay would yield a different duration than the one recorded and we would error. We will fix this in the next stager.",
      ],
    },
    {
      heading: "How it maps to Temporal",
      body: [
        "This is exactly how a Temporal worker recovers a workflow, or picks one up on a different machine. It replays the workflow code against the Event History, matching commands to events, until it reaches the end. A mismatch raises a nondeterminism error. This is the source of Temporal's best-known rule and the source of much developer cursing. workflow code must be deterministic.",
        "In fact, real Temporal's TypeScript SDK runs workflows in a sandbox that makes `Math.random()` and `Date.now()` deterministic for you. Changing a running workflow's code safely takes versioning, with `patched()` or worker versioning.",
      ],
    },
    {
      heading: "Squint hard and you'll see it",
      body: [
        "This is really where Temporal durability comes into the picture. So long as history gets stored (it is stored on the temporal server) we can always recreate our code. Of course that means our code would have to stay pure which would put as pretty far from our ideal code. Lets see how we can actually interact with the system next.",
      ],
    },
  ],
  sources: [
    { label: "src/stage4/workflow.ts", path: "./src/stage4/workflow.ts" },
    { label: "src/stage4/georgeporal.ts", path: "./src/stage4/georgeporal.ts" },
  ],
});

page.addControl("Clear history", () => {
  clearHistory(HISTORY_KEY);
  location.reload();
});

const stored = loadHistory(HISTORY_KEY);
for (const event of stored) page.addEvent(describeEvent(event), "stored");
if (stored.length > 0) {
  page.setStartLabel("Resume");
  page.setStatus(`${stored.length} events in history`);
}

page.onStart(() =>
  run(fizzbuzzWorkflow, page.print, (event, replayed) => {
    const className = replayed ? "replayed" : "";
    page.addEvent(describeEvent(event), className);
    if (replayed && event.command.type === "print") {
      page.print(event.command.text, className);
    }
  }),
);
