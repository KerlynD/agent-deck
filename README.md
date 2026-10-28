# Agent Deck

A Paseo plugin that rices Paseo into a vim/btop-style workspace and adds the tools that go with it.

## What it adds

**Chat view**
- Replies render as real markdown: headings, lists, tables, blockquotes, inline code and links.
- Code blocks are syntax-highlighted with Shiki (the same engine VS Code uses) and have a copy button.
- ` ```mermaid ` blocks render as diagrams themed to your palette (flowchart, sequence, state, class, ER and XY charts). Desktop and web draw vector diagrams; iOS and Android draw them in box-drawing text. A `src` toggle shows the source.
- Tool calls collapse to one line each, for example `✓ bash  go test ./... exit 0 ▸`. Expanding one shows:
  - files that were read or written, highlighted, with line numbers
  - edits as highlighted diffs with old and new line numbers
  - shell output, with failures opened automatically
  - grep hits, web results and subagent steps
- Reasoning collapses to a one-line "thought" preview.
- Task lists show as a checklist with a progress bar.

**Command-line composer** (desktop and web)
- A `❯` prompt, an INSERT/NORMAL statusline that follows focus, and key hints.
- A `ctx 64%` pill on every agent's composer, with a token and cost breakdown.

**Rice** (desktop and web, each part can be switched off)
- Square corners, a monospace interface font, hairline pane borders, and Paseo's Material file icons back at full color.

**Palettes** (Settings → Appearance)
- Tokyo Night, Catppuccin Mocha, Gruvbox Dark, Kanagawa Wave, Rosé Pine, Everforest Dark and TTY Khaki.
- Code highlighting follows whichever palette you pick.

**Agents table**
- A btop-style workspace panel showing your agents as a tree, with subagents nested under the agent that spawned them.
- Columns for id, model, context %, tokens, age and state.
- Agents waiting on you sort first.

**Inbox**
- A sidebar row with a count of permission requests, errors and finished agents.
- Allow or deny tool approvals straight from the popover.

**Usage**
- A sidebar row showing your most-used plan window.
- Its popover has bars for every provider window, with reset times.

## Requirements

- Paseo 0.12.0 or later.
- **Settings → Plugins → Enable plugins** turned on for the host.
- Turn off other plugins that redraw the chat (for example beautiful-chat). Two plugins redrawing the same rows conflict.

## Install

On the machine running your Paseo daemon:

```bash
paseo plugin install /absolute/path/to/agent-deck
paseo plugin ls          # agent-deck · running
```

Installing runs `npm ci` so the daemon can bundle Shiki and the markdown parser.

## Settings

Open **Settings → Plugins → Agent Deck**, or press `⌘K` and choose "Agent Deck settings". Each part of the chat view and each rice option has its own switch.

## How the rice works, and its limits

The palettes, chat view, pills, inbox, usage and agents table use Paseo's official plugin API, so they work on every client, including mobile.

The rice options (square corners, font, borders, icon color and the composer look) are CSS the plugin adds to the desktop and web app. They target Paseo's own test hooks (`data-testid`). That's unofficial: if a Paseo update renames those hooks, that part of the look stops applying until the plugin is updated. Nothing else breaks. On iOS and Android the rice options do nothing.

## Develop

```bash
npm install
npm run typecheck
paseo plugin reload agent-deck
paseo plugin logs agent-deck
```
