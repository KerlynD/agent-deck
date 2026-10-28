# Learning blocks

Agent Deck draws five kinds of fenced block as interactive cards in the chat. Each card has a `src` toggle that shows the raw block and a `📌 pin` button that saves the block to your notebook. A block the plugin cannot read is shown as plain source, so a typo never hides content.

New agents learn these formats automatically while **Learning prompt** is on in Agent Deck settings. You can also paste this file, or the examples below, into a `CLAUDE.md` or `AGENTS.md`.

Use them when teaching or explaining a concept, not for routine coding output.

## Shared lines

Any block may start with these optional lines, in any order:

```text
topic: Event loop        the notebook topic the pin goes to
title: Microtasks first  the card heading and the pinned section's heading
```

Without `topic:` the notebook picks a topic itself. Without `title:` the heading comes from the block's first line or question.

## callout

````markdown
```callout tip
topic: Event loop
Prefer `queueMicrotask` over `setTimeout(fn, 0)` for **tiny** follow-up work.
```
````

The word after `callout` is the variant: `insight`, `tip`, `warning`, `definition`, `analogy` or `example`. A missing or unknown variant becomes `insight`. The body is ordinary markdown.

## quiz

````markdown
```quiz
Q: Which runs first after the current task finishes?
- [ ] A setTimeout callback
- [x] A resolved promise's then callback
> Microtasks drain completely before the next macrotask starts.

Q: Is JavaScript single-threaded?
- [x] Yes, per realm
- [ ] No
```
````

- `Q:` starts a question (`Q1:`, `Question:` also work). Lines after it and before the first option continue the question.
- `- [ ]` is a wrong option, `- [x]` a right one. The leading `-` is optional.
- `>` lines are the explanation, shown after answering.
- A question needs at least two options and at least one marked `[x]`.

Tap an option to answer. The card shows right and wrong, reveals the explanation, and keeps a score with a retry button.

## flashcards

````markdown
```flashcards
Closure :: A function together with the variables it captured
Hoisting :: Declarations are processed before the code runs
Q: What does `await` pause?
A: Only the async function it is in, not the thread
```
````

One card per `front :: back` line, or a `Q:` (or `Front:`) line followed by an `A:` (or `Back:`) line. Lines after `A:` continue the back. Tap the card to flip it; prev, next, a counter and "show all" sit underneath.

## steps

````markdown
```steps
1. Parse the request
   Read the body and headers. Indented lines are detail, in **markdown**.
2. Validate the input
3. Send the response
```
````

`1.` or `1)` at the start of a line starts a step. Everything up to the next step is its detail. Indent numbered lists inside a detail so they are not read as steps. The card reveals one step at a time with Next and Show all.

## compare

````markdown
```compare
## Threads
- Shared memory
- Preemptive scheduling
## Async/await
- One thread
- Cooperative scheduling
```
````

Each `##` heading starts a column; write two or three. Column bodies are markdown, usually bullets. Columns sit side by side when there is room and stack on narrow screens.

## Wikilinks

When prose mentions a related concept that deserves its own note, write it as `[[Concept]]` (or `[[Concept|label]]`). The notebook and concept map link topics through these.
