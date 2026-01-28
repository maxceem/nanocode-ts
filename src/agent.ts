import * as readline from 'node:readline/promises';
import { Message, ApiResponse, Usage } from './types';
import { tools, executeTool, dangerousTools } from './tools';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.MODEL || 'minimax/minimax-m2.1';
const API_URL = process.env.API_URL || 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT = `
You are cocky coding agent.
You are helpful and do what user is asking yet constantly roasting user for no reason.
`;

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY environment variable');
  process.exit(1);
}

// prevent infinite tool-call loops for safety
const MAX_AGENT_LOOPS = 10;

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

// global state
let messages: Message[] = [];
let rl: readline.Interface;

function initMessages(): Message[] {
  if (SYSTEM_PROMPT) {
    return [{ role: 'system', content: SYSTEM_PROMPT }];
  }
  return [];
}

async function callLLM(messages: Message[]): Promise<ApiResponse> {
  const requestBody = {
    model: MODEL,
    messages, // conversation history
    tools, // tools available to the LLM
    n: 1, // we don't need alternative completions from LLM, we only ask for 1 version of response
  };

  const startTime = Date.now();
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
  printLLMUsage(Date.now() - startTime, result.usage);

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

  console.log(`\n  ${CYAN}${toolName}${RESET}(${DIM}${argPreview}${RESET})`);
}

async function userConfirmsTool(): Promise<boolean> {
  const answer = await rl.question(`\n  ${MAGENTA}Confirm execution?${RESET} [y/${BOLD}N${RESET}] `);

  return answer.toLowerCase() === 'y';
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

function printLine(): void {
  const width = Math.min(process.stdout.columns || 80, 80);
  console.log(`${DIM}${'─'.repeat(width)}${RESET}`);
}

function printIntro(): void {
  console.log(`${BOLD}nanocode-ts${RESET}${DIM} - minimal coding agent in TypeScript (${MODEL})${RESET}`);
  console.log(`${DIM}  /new   new conversation${RESET}`);
  console.log(`${DIM}  /exit  quit${RESET}`);
}

function printAssistantResponse(content: string): void {
  console.log(`\n${GREEN}●${RESET} ${renderMarkdown(content)}`);
}

/*
  Main agent logic.
*/

async function runAgentLoop(userMessage: string) {
  messages.push({ role: 'user', content: userMessage });

  // keep calling LLM as long as it wants to call tools
  let steps = 0;
  while (true) {
    steps += 1;
    if (steps > MAX_AGENT_LOOPS) {
      console.log(`${MAGENTA}● Stopped after ${MAX_AGENT_LOOPS} loops (safety limit)${RESET}`);
      break;
    }

    const { choices: [{ message, finish_reason }] } = await callLLM(messages);

    // add assistant response to history including tool_calls
    messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });

    // print assistant response if any
    if (message.content?.trim()) {
      printAssistantResponse(message.content.trim());
    }

    // if LLM is done or doesn't want to call tools, break the loop
    if (finish_reason === 'stop' || !message.tool_calls) {
      break;
    }

    // call tools that LLM wants to call and add results to history
    for (const { id, function: { name, arguments: argsJSONString } } of message.tool_calls) {
      let args: Record<string, unknown> | undefined;
      let argsParseError: unknown;
      let result = '';

      try {
        args = JSON.parse(argsJSONString);
      } catch (err) {
        argsParseError = err;
      }

      printToolCall(name, argsParseError ? { malformedJSON: argsJSONString } : args!);

      if (argsParseError) {
        const errorMessage = argsParseError instanceof Error ? argsParseError.message : String(argsParseError);
        result = `error: invalid tool arguments JSON (${errorMessage})`;
      } else if (dangerousTools.has(name) && !(await userConfirmsTool())) {
        result = 'denied by user';
      } else {
        result = await executeTool(name, args!);
      }

      printToolResult(result);

      messages.push({ role: 'tool', tool_call_id: id, content: result });
    }
  }
}

async function main() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // handle Ctrl+C
  rl.on('SIGINT', () => {
    rl.close();
    console.log('\nNo hello, no goodbye!');
    process.exit(0);
  });

  // handle Ctrl+D and /quite or /exit
  rl.on('close', () => {
    console.log('Goodbye!');
    process.exit(0);
  });


  printIntro();

  // initialize messages with system prompt if configured
  messages = initMessages();

  // loop between user inputs and running agent
  while (true) {
    try {
      console.log('');
      printLine();
      const input = (await rl.question(`${BOLD}❯${RESET} `)).trim();
      printLine();

      if (!input) continue;

      if (['/quit', '/exit'].includes(input)) {
        rl.close();
        break;
      }

      if (['/clear', '/new'].includes(input)) {
        messages = initMessages();
        console.log(`\n${MAGENTA}● Conversation cleared${RESET}`);
        continue;
      }

      await runAgentLoop(input);
    } catch (error) {
      console.log(`\n${RED}● Error: ${error instanceof Error ? error.message : String(error)}${RESET}`);
    }
  }
}

main();
