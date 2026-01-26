const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || 'anthropic/claude-opus-4.5';
const DEBUG = process.env.DEBUG === 'true';

// ANSI color codes for debug output
const GREY = '\x1b[90m';
const RESET = '\x1b[0m';

function debugLog(label: string, data: unknown): void {
  if (!DEBUG) return;
  console.log(`${GREY}[DEBUG] ${label}:${RESET}`);
  console.log(`${GREY}${JSON.stringify(data, null, 2)}${RESET}`);
}

function debugCost(usage: Usage | undefined): void {
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

function debugTime(label: string, ms: number): void {
  if (!DEBUG) return;
  console.log(`${GREY}[TIME] ${label}: ${formatTime(ms)}${RESET}`);
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Choice {
  message: {
    content: string;
  };
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost?: number;
}

interface ApiResponse {
  choices: Choice[];
  usage?: Usage;
}

async function callLLM(messages: Message[]): Promise<ApiResponse> {
  const requestBody = {
    model: MODEL,
    messages,
  };

  debugLog('LLM Request', requestBody);

  const start = Date.now();
  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  debugLog('LLM Response', result);
  debugTime('LLM', Date.now() - start);
  debugCost(result.usage);

  return result;
}

async function main() {
  const response = await callLLM([
    {
      role: 'system',
      content:
        'You are very cocky coding agent, which while doing what users asks, always roast user for their questions.',
    },
    { role: 'user', content: 'Hello!' },
  ]);
  console.log(response.choices[0].message.content);
}

main();
