import type { PluginTheme } from "@getpaseo/plugin";
import type { ReactNode } from "react";

/** Fence languages drawn as learning cards. Filled in by feat/learning-blocks. */
export const LEARNING_LANGS = new Set<string>();

export interface LearningBlockProps {
  theme: PluginTheme;
  /** Lowercased fence language, one of LEARNING_LANGS. */
  lang: string;
  code: string;
  /** Still streaming: the block may be unfinished. */
  streaming: boolean;
  /** Agent whose reply holds the block, for pinning. */
  agentId?: string;
  /** Plain source view, for unparsable blocks and the `src` toggle. */
  fallback: ReactNode;
}

export function LearningBlock({ fallback }: LearningBlockProps) {
  return <>{fallback}</>;
}
