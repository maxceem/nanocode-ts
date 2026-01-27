import * as readline from 'node:readline/promises';
import { Usage } from './types';
import { Message, ApiResponse } from './types';
import { tools, executeTool } from './tools';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || 'minimax/minimax-m2.1';
const API_URL = process.env.API_URL || 'https://openrouter.ai/api/v1/chat/completions';

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';

// conversation history
let messages: Message[] = [];

async function callLLM(messages: Message[]): Promise<ApiResponse> {
  const requestBody = {
    model: MODEL,
    messages, // conversation history
    tools, // tools available to the LLM
    n: 1, // we don't need alternative completions from LLM, we only ask for 1 version of response
  };

  const start = Date.now();
  printThinking();

  const response = await fetch(
    API_URL,
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
  printLLMUsage(Date.now() - start, result.usage);

  return result;
}

/*
  Print helpers.
*/

function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
}

function printThinking(): void {
  process.stdout.write(`\n${DIM}  thinking...${RESET}`);
}

function printLLMUsage(ms: number, usage?: Usage): void {
  const secs = (ms / 1000).toFixed(0);
  const tokens = usage ? ` ↑${usage.prompt_tokens} ↓${usage.completion_tokens}` : '';
  const cost = usage?.cost ? ` $${usage.cost.toFixed(6)}` : '';
  process.stdout.write(`\r${DIM}  Thought for ${secs}s${tokens}${cost}${RESET}\n`);
}

function printToolCall(name: string, args: Record<string, unknown>): void {
  const toolName = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, '');
  const values = Object.values(args);
  const oneLine = values.length > 0 ? String(values[0]).replace(/\n/g, ' ') : '';
  const argPreview = oneLine.length > 50 ? oneLine.slice(0, 50) + '...' : oneLine;
  console.log(`\n${GREEN}● ${toolName}${RESET}(${DIM}${argPreview}${RESET})`);
}

function printToolResult(result: string): void {
  const lines = result.split('\n');
  let preview = lines[0].slice(0, 60);
  if (lines.length > 1) {
    preview += ` ... +${lines.length - 1} lines`;
  } else if (lines[0].length > 60) {
    preview += '...';
  }
  console.log(`  ${DIM}⎿  ${preview}${RESET}`);
}

function printIntro(): void {
  console.log(`${BOLD}nanocode-ts${RESET}${DIM} - minimal coding agent in TypeScript (${MODEL})${RESET}`);
  console.log(`${DIM}  /new   new conversation${RESET}`);
  console.log(`${DIM}  /exit  quit${RESET}`);
}

function printAssistantResponse(content: string): void {
  console.log(`\n${CYAN}●${RESET} ${renderMarkdown(content)}`);
}

/*
  Main agent logic.
*/

async function runAgentLoop(userMessage: string) {
  messages.push({ role: 'user', content: userMessage });

  // agentic loop keeps calling the LLM as long as LLM wants to call tools
  while (true) {
    const response = await callLLM(messages);
    const choice = response.choices[0]; // we only ask for 1 version of response
    const assistantMessage = choice.message; // LLM's response

    // add assistant message to history including tool_calls if present
    messages.push({
      role: 'assistant',
      content: assistantMessage.content,
      tool_calls: assistantMessage.tool_calls,
    });

    // print assistant response if any
    if (assistantMessage.content?.trim()) {
      printAssistantResponse(assistantMessage.content.trim());
    }

    // if LLM decided that it's done with the task, then we break the loop
    if (choice.finish_reason === 'stop') {
      break;
    }

    // if LLM is not done yet, and it wants to call tools, then we execute tools and add results to message history
    if (assistantMessage.tool_calls) {
      // execute each tool which LLM wants to call
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        printToolCall(toolCall.function.name, args);

        let result: string;
        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (error) {
          result = `error: ${error instanceof Error ? error.message : String(error)}`;
        }

        printToolResult(result);

        // add tool result to message history
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
    }

    // if at this point LLM didn't stop the conversation,
    // then all the tool calls results will be sent back to the LLM in the next loop as part of message history
  }
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  printIntro();

  // loop between user inputs and running agent
  while (true) {
    try {
      const input = (await rl.question(`\n${BOLD}❯${RESET} `)).trim();

      if (!input) continue;

      if (['/quit', '/exit'].includes(input)) {
        rl.close();
        break;
      }

      if (['/clear', '/new'].includes(input)) {
        messages = [];
        console.log(`\n${GREEN}● Conversation cleared${RESET}`);
        continue;
      }

      await runAgentLoop(input);
    } catch (error) {
      console.log(`${RED}● Error: ${error instanceof Error ? error.message : String(error)}${RESET}`);
      break;
    }
  }
}

main();
