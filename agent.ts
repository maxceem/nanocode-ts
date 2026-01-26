const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || "anthropic/claude-opus-4.5";
const DEBUG = process.env.DEBUG === "true";

// ANSI color codes for debug output
const GREY = "\x1b[90m";
const RESET = "\x1b[0m";

function debugLog(label: string, data: unknown): void {
  if (!DEBUG) return;
  console.log(`${GREY}[DEBUG] ${label}:${RESET}`);
  console.log(`${GREY}${JSON.stringify(data, null, 2)}${RESET}`);
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface Choice {
  message: {
    content: string;
  };
}

interface ApiResponse {
  choices: Choice[];
}

async function callLLM(messages: Message[]): Promise<ApiResponse> {
  const requestBody = {
    model: MODEL,
    messages,
  };

  debugLog("LLM Request", requestBody);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  debugLog("LLM Response", result);

  return result;
}

async function main() {
  const response = await callLLM([{ role: "user", content: "Hello!" }]);
  console.log(response.choices[0].message.content);
}

main();
