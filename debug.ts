const DEBUG = process.env.DEBUG === 'true';

// ANSI color codes for debug output
const GREY = '\x1b[90m';
const RESET = '\x1b[0m';

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}

export function debugLog(label: string, data: unknown): void {
  if (!DEBUG) return;
  console.log(`${GREY}[DEBUG] ${label}:${RESET}`);
  console.log(`${GREY}${JSON.stringify(data, null, 2)}${RESET}`);
}

export function debugCost(usage: Usage | undefined): void {
  if (!DEBUG || !usage) return;
  const cost = usage.cost !== undefined ? ` $${usage.cost.toFixed(6)}` : '';
  console.log(`${GREY}[COST] ↑${usage.prompt_tokens} ↓${usage.completion_tokens} Σ${usage.total_tokens}${cost}${RESET}`);
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  if (ms < 3600000) return `${mins}m ${secs}s`;
  const hours = Math.floor(ms / 3600000);
  const remainMins = Math.floor((ms % 3600000) / 60000);
  const remainSecs = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${remainMins}m ${remainSecs}s`;
}

export function debugTime(label: string, ms: number): void {
  if (!DEBUG) return;
  console.log(`${GREY}[TIME] ${label}: ${formatTime(ms)}${RESET}`);
}
