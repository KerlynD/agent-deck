import type { HighlightResult } from "../shared/highlight";
import type { ShikiThemeName } from "../shared/palettes";

type ShikiCore = typeof import("@shikijs/core");
type Highlighter = Awaited<ReturnType<ShikiCore["createHighlighterCore"]>>;

interface Engine {
  highlighter: Highlighter;
  loaded: Set<string>;
}

let enginePromise: Promise<Engine> | null = null;

/**
 * Loads grammars and themes on first use. Imports stay dynamic so a daemon that
 * never shows code never pays for the grammar data. The JavaScript regex engine
 * avoids a WASM asset the plugin bundle could not load.
 */
async function buildEngine(): Promise<Engine> {
  const [core, regex] = await Promise.all([
    import("@shikijs/core"),
    import("@shikijs/engine-javascript"),
  ]);
  const themes = await Promise.all([
    import("@shikijs/themes/tokyo-night"),
    import("@shikijs/themes/catppuccin-mocha"),
    import("@shikijs/themes/gruvbox-dark-medium"),
    import("@shikijs/themes/kanagawa-wave"),
    import("@shikijs/themes/rose-pine"),
    import("@shikijs/themes/everforest-dark"),
    import("@shikijs/themes/github-dark-default"),
    import("@shikijs/themes/github-light-default"),
  ]);
  const langs = await Promise.all([
    import("@shikijs/langs/typescript"),
    import("@shikijs/langs/tsx"),
    import("@shikijs/langs/javascript"),
    import("@shikijs/langs/jsx"),
    import("@shikijs/langs/json"),
    import("@shikijs/langs/jsonc"),
    import("@shikijs/langs/shellscript"),
    import("@shikijs/langs/python"),
    import("@shikijs/langs/go"),
    import("@shikijs/langs/rust"),
    import("@shikijs/langs/java"),
    import("@shikijs/langs/kotlin"),
    import("@shikijs/langs/swift"),
    import("@shikijs/langs/c"),
    import("@shikijs/langs/cpp"),
    import("@shikijs/langs/csharp"),
    import("@shikijs/langs/ruby"),
    import("@shikijs/langs/php"),
    import("@shikijs/langs/sql"),
    import("@shikijs/langs/html"),
    import("@shikijs/langs/css"),
    import("@shikijs/langs/scss"),
    import("@shikijs/langs/yaml"),
    import("@shikijs/langs/toml"),
    import("@shikijs/langs/markdown"),
    import("@shikijs/langs/diff"),
    import("@shikijs/langs/dockerfile"),
    import("@shikijs/langs/make"),
    import("@shikijs/langs/lua"),
    import("@shikijs/langs/nix"),
    import("@shikijs/langs/graphql"),
    import("@shikijs/langs/proto"),
    import("@shikijs/langs/zig"),
    import("@shikijs/langs/elixir"),
    import("@shikijs/langs/haskell"),
    import("@shikijs/langs/vue"),
    import("@shikijs/langs/svelte"),
    import("@shikijs/langs/ini"),
    import("@shikijs/langs/xml"),
    import("@shikijs/langs/powershell"),
  ]);
  const highlighter = await core.createHighlighterCore({
    themes,
    langs,
    engine: regex.createJavaScriptRegexEngine({ forgiving: true }),
  });
  return { highlighter, loaded: new Set(highlighter.getLoadedLanguages()) };
}

function getEngine(): Promise<Engine> {
  enginePromise ??= buildEngine().catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

const ALIASES: Record<string, string | null> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  shell: "shellscript",
  console: "shellscript",
  py: "python",
  rs: "rust",
  golang: "go",
  rb: "ruby",
  kt: "kotlin",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  cc: "cpp",
  h: "c",
  hpp: "cpp",
  yml: "yaml",
  md: "markdown",
  docker: "dockerfile",
  makefile: "make",
  patch: "diff",
  ps1: "powershell",
  htm: "html",
  text: null,
  txt: null,
  plaintext: null,
  plain: null,
  "": null,
};

const EXTENSIONS: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "jsonc",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  md: "markdown",
  mdx: "markdown",
  diff: "diff",
  patch: "diff",
  lua: "lua",
  nix: "nix",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  zig: "zig",
  ex: "elixir",
  exs: "elixir",
  hs: "haskell",
  vue: "vue",
  svelte: "svelte",
  ini: "ini",
  xml: "xml",
  ps1: "powershell",
};

function fromFilename(name: string): string | null {
  const base = (name.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase();
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if (base === "makefile" || base === "gnumakefile") return "make";
  if (base === "go.mod" || base === "go.sum") return null;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? (EXTENSIONS[base.slice(dot + 1)] ?? null) : null;
}

function resolveLang(loaded: Set<string>, hint?: string, filename?: string): string | null {
  if (hint !== undefined) {
    const key = hint.trim().toLowerCase();
    if (key in ALIASES) {
      const mapped = ALIASES[key];
      if (mapped === null) return null;
      if (mapped && loaded.has(mapped)) return mapped;
    } else if (loaded.has(key)) {
      return key;
    }
  }
  if (filename) {
    const guess = fromFilename(filename);
    if (guess && loaded.has(guess)) return guess;
  }
  return null;
}

const MAX_LINES = 4000;

export async function highlight(input: {
  code: string;
  lang?: string;
  filename?: string;
  theme: ShikiThemeName;
}): Promise<HighlightResult> {
  const { highlighter, loaded } = await getEngine();
  const theme = highlighter.getTheme(input.theme);
  const fg = theme.fg;
  const bg = theme.bg;
  const code = input.code.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const lang = resolveLang(loaded, input.lang, input.filename);
  const sourceLines = code.split("\n");

  if (!lang || sourceLines.length > MAX_LINES) {
    return { lines: sourceLines.map((t) => [{ t, c: null }]), lang: null, fg, bg };
  }
  const result = highlighter.codeToTokens(code, { lang, theme: input.theme });
  const lines = result.tokens.map((line) =>
    line.map((tok) => {
      const color = tok.color && tok.color.toLowerCase() !== fg.toLowerCase() ? tok.color : null;
      return tok.fontStyle ? { t: tok.content, c: color, s: tok.fontStyle } : { t: tok.content, c: color };
    }),
  );
  return { lines, lang, fg, bg };
}
