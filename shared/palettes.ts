/** Palettes shipped as Paseo themes, each paired with the Shiki theme that matches it. */
export interface Palette {
  id: string;
  name: string;
  shiki: string;
  colors: {
    background: string;
    foreground: string;
    raised: string;
    control: string;
    border: string;
    accent: string;
    mutedForeground: string;
    ring: string;
  };
}

export const PALETTES: readonly Palette[] = [
  {
    id: "deck-tokyo-night",
    name: "Tokyo Night",
    shiki: "tokyo-night",
    colors: {
      background: "#1a1b26",
      foreground: "#c0caf5",
      raised: "#24283b",
      control: "#292e42",
      border: "#3b4261",
      accent: "#7aa2f7",
      mutedForeground: "#828bb8",
      ring: "#565f89",
    },
  },
  {
    id: "deck-catppuccin-mocha",
    name: "Catppuccin Mocha",
    shiki: "catppuccin-mocha",
    colors: {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      raised: "#313244",
      control: "#45475a",
      border: "#45475a",
      accent: "#cba6f7",
      mutedForeground: "#a6adc8",
      ring: "#6c7086",
    },
  },
  {
    id: "deck-gruvbox",
    name: "Gruvbox Dark",
    shiki: "gruvbox-dark-medium",
    colors: {
      background: "#282828",
      foreground: "#ebdbb2",
      raised: "#3c3836",
      control: "#504945",
      border: "#504945",
      accent: "#fabd2f",
      mutedForeground: "#a89984",
      ring: "#665c54",
    },
  },
  {
    id: "deck-kanagawa",
    name: "Kanagawa Wave",
    shiki: "kanagawa-wave",
    colors: {
      background: "#1f1f28",
      foreground: "#dcd7ba",
      raised: "#2a2a37",
      control: "#363646",
      border: "#363646",
      accent: "#7e9cd8",
      mutedForeground: "#9a998e",
      ring: "#54546d",
    },
  },
  {
    id: "deck-rose-pine",
    name: "Rosé Pine",
    shiki: "rose-pine",
    colors: {
      background: "#191724",
      foreground: "#e0def4",
      raised: "#1f1d2e",
      control: "#26233a",
      border: "#403d52",
      accent: "#ebbcba",
      mutedForeground: "#908caa",
      ring: "#524f67",
    },
  },
  {
    id: "deck-everforest",
    name: "Everforest Dark",
    shiki: "everforest-dark",
    colors: {
      background: "#2d353b",
      foreground: "#d3c6aa",
      raised: "#343f44",
      control: "#3d484d",
      border: "#475258",
      accent: "#a7c080",
      mutedForeground: "#9da9a0",
      ring: "#7a8478",
    },
  },
  {
    id: "deck-tty-khaki",
    name: "TTY Khaki",
    shiki: "gruvbox-dark-medium",
    colors: {
      background: "#161614",
      foreground: "#d8d4c0",
      raised: "#1e1e1b",
      control: "#26261f",
      border: "#5e5c4b",
      accent: "#c8c24a",
      mutedForeground: "#8f8b78",
      ring: "#5e5c4b",
    },
  },
];

export const SHIKI_THEMES = [
  "tokyo-night",
  "catppuccin-mocha",
  "gruvbox-dark-medium",
  "kanagawa-wave",
  "rose-pine",
  "everforest-dark",
  "github-dark-default",
  "github-light-default",
] as const;

export type ShikiThemeName = (typeof SHIKI_THEMES)[number];
