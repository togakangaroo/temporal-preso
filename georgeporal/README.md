# georgeporal

A tiny Temporal clone built up in stages, as a demo for a presentation on how
the Temporal runtime works and where its footguns are. Plain TypeScript in the
browser. georgeporal itself has no dependencies; the demo pages use highlight.js,
served from `node_modules` so they work offline.

```
npm install
npm start       # tsc --watch + static server, then open http://localhost:3000
```

Every stage runs the same workflow: FizzBuzz (to 1000 in stage 1, forever after), printing each value, then
waiting a random 1-2 seconds (a fixed 1.5 seconds in stage 4, so replay matches).

| Page           | Code          | What it adds                                                         |
| -------------- | ------------- | -------------------------------------------------------------------- |
| `stage-1.html` | `src/stage1/` | The workflow is a sync function; georgeporal just calls it           |
| `stage-2.html` | `src/stage2/` | The workflow is an async generator; georgeporal loops over it        |
| `stage-3.html` | `src/stage3/` | Unwound by hand, building an event history in localStorage           |
| `stage-4.html` | `src/stage4/` | Resumable: replays the event history before doing anything for real  |
| `stage-5.html` | `src/stage5/` | Activities: async functions whose results are recorded and replayed  |
| `stage-6.html` | `src/stage6/` | Signals: outside input, recorded in history, handlers re-run on replay |
| `stage-7.html` | `src/stage7/` | Task queue: commands are queued in localStorage for workers in any tab |

Each page shows its own `workflow.ts` and `georgeporal.ts`, fetched live from
`src/`, so what's on screen is the code that's running.

## Credits

Slide 2 clipart by [Creative Tail](https://commons.wikimedia.org/wiki/Category:Creative_Tail), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Source files:

- [Ghost](https://commons.wikimedia.org/wiki/File:Creative-Tail-Halloween-ghost.svg)
- [Bat](https://commons.wikimedia.org/wiki/File:Creative-Tail-Halloween-bat.svg)
- [Pumpkin](https://commons.wikimedia.org/wiki/File:Creative-Tail-Halloween-pumpkin.svg)
- [Spider](https://commons.wikimedia.org/wiki/File:Creative-Tail-Halloween-spider.svg)
- [Full moon](https://commons.wikimedia.org/wiki/File:Creative-Tail-Halloween-full-moon.svg)

Slide 4 background, `slides/flowchart.png` (cropped), from
[Nulab: How to create a workflow diagram](https://nulab.com/learn/project-management/how-to-create-workflow-diagram-and-why-you-should/),
originally from [Wikipedia: Information Management - Help Desk](http://en.wikipedia.org/wiki/File:(1)_2008-04-07_Information_Management-_Help_Desk.jpg).
