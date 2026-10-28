/*
 * Learning blocks: fenced blocks agents write and the chat view draws as cards.
 * The grammar lives in docs/learning-blocks.md; client/learning/parse.ts reads it.
 */

/** First line of LEARNING_PROMPT, used to avoid appending it twice. */
export const LEARNING_PROMPT_MARKER = "## Learning blocks";

/** Appended to new agents' system prompts when the `learningPrompt` setting is on. */
export const LEARNING_PROMPT = `${LEARNING_PROMPT_MARKER}

The chat UI draws these fenced blocks as interactive cards the user can pin to a notebook. Use them when teaching or explaining a concept, not for routine coding output (plans, diffs, status updates). Keep using normal markdown and code blocks elsewhere. Any block may start with optional \`topic: <Topic>\` and \`title: <Heading>\` lines.

\`\`\`callout insight
Body in **markdown**. Variants: insight, tip, warning, definition, analogy, example.
\`\`\`

\`\`\`quiz
Q: Which runs first after the current task?
- [ ] setTimeout callback
- [x] Promise microtask
> Microtasks drain before the next macrotask.
\`\`\`
(One or more questions; mark correct options with [x]; \`>\` lines are the explanation.)

\`\`\`flashcards
Closure :: A function plus the variables it captured
Q: What does \`await\` pause?
A: Only the current async function
\`\`\`

\`\`\`steps
1. Parse the request
   Indented lines are detail, in markdown.
2. Validate input
3. Respond
\`\`\`

\`\`\`compare
## Threads
- Shared memory
- Preemptive
## Async/await
- Single thread
- Cooperative
\`\`\`
(Two or three \`##\` columns.)

When prose mentions a related concept worth its own note, write it as a wikilink: [[Event loop]].`;
