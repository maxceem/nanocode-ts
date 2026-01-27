import * as fs from 'node:fs/promises';
import { Tool, ToolDefinition } from './types';

// Tool definitions with schemas and handlers together
const readFile: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
        },
        required: ['path'],
      },
    },
  },
  handler: async (args) => {
    const content = await fs.readFile(args.path, 'utf-8');
    const lines = content.split('\n');
    return lines.map((line, idx) => `${String(idx + 1).padStart(4)}| ${line}`).join('\n');
  },
};

const writeFile: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to write' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  handler: async (args) => {
    await fs.writeFile(args.path, args.content, 'utf-8');
    return 'ok';
  },
};

// Registry: map tool name -> definition
const toolRegistry = new Map<string, ToolDefinition>([
  ['read_file', readFile],
  ['write_file', writeFile],
]);

// Export schemas array for LLM
export const tools: Tool[] = Array.from(toolRegistry.values()).map(
  (def) => def.schema,
);

// Execute a tool by name
export async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  const definition = toolRegistry.get(name);
  if (!definition) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return definition.handler(args);
}
