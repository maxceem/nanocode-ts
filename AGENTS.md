# nanocode-ts

Minimalistic implementation of agentic coding agent similar to Claude Code in TypeScript for learning purposes.

- The code has to be as easy to understand and follow as possible.
- It should still follow TypeScript and Node.js best practices.
- The minimal number lines or the speed of work is not priority - priority is that how easy is it to read and understand code.
- We should not use third party libraries, but we must use any standard Node.js libraries when they make code simpler and easier to understand.

## Developing

Alway use `npm` to keep things simple.

```bash
npm start        # compiles and runs
```

Always checking typing by `tsc --onEmit`.

## Environment

Copy `.env.example` to `.env` and set:
- `OPENROUTER_API_KEY` - API key (required)
- `API_URL` - Chat completions endpoint (default: OpenRouter)
- `MODEL` - Model identifier (default: minimax/minimax-m2.1)

## Architecture

Three files in `src/`, no dependencies beyond Node.js built-ins:

- `src/agent.ts` - Main entry point with agentic loop and CLI
- `src/tools.ts` - Tool definitions and handlers
- `src/types.ts` - TypeScript interfaces for API and messages

### Agentic Loop Pattern

The core pattern in `runAgentLoop()` (agent.ts:115):

1. Add user message to conversation history
2. Call LLM with full history + tools
3. Add assistant response to history
4. If LLM returned tool_calls, execute each tool, add results to history, goto 2
5. If finish_reason is "stop" or no tool_calls, exit loop

Key: conversation history (`messages` array) persists tool calls and results, giving LLM context for multi-step tasks.

## Tools

| Tool | Description |
|------|-------------|
| `read` | Read file with line numbers, optional offset/limit |
| `write` | Write content to file |
| `edit` | String replacement (must be unique or use `all=true`) |
| `bash` | Shell command with 30s timeout |
| `glob` | Find files by pattern (excludes node_modules) |
| `grep` | Regex search in file contents |

## Commands

- `/new`, `/clear` - Reset conversation
- `/exit`, `/quit` - Exit
