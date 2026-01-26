import * as readline from 'node:readline/promises';
import { debugLog, debugCost, debugTime, Usage } from './debug';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || 'anthropic/claude-opus-4.5';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Choice {
  message: {
    content: string;
  };
}

interface ApiResponse {
  choices: Choice[];
  usage?: Usage;
}

// Conversation history
const messages: Message[] = [];

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

async function chat(userMessage: string) {
  messages.push({ role: 'user', content: userMessage });

  const response = await callLLM(messages);
  const assistantMessage = response.choices[0].message.content;

  messages.push({ role: 'assistant', content: assistantMessage });
  console.log(`Agent: ${assistantMessage}`);
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`Nanocode Agent Ready! Using model: ${MODEL}`);
  console.log("(type 'quit' to exit)\n");

  while (true) {
    const input = await rl.question('You: ');

    if (input === 'quit') {
      rl.close();
      console.log('Bye!');
      break;
    }

    await chat(input);
  }
}

main();
