import { readFile, writeFile, glob } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Tool } from './types';

const execAsync = promisify(exec);

// tools schema for LLM
export const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read file with line numbers',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          offset: { type: 'integer', description: 'Start line (0-indexed)' },
          limit: { type: 'integer', description: 'Number of lines' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Write content to file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Replace old with new in file (old must be unique unless all=true)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
          old: { type: 'string', description: 'String to replace' },
          new: { type: 'string', description: 'Replacement string' },
          all: { type: 'boolean', description: 'Replace all occurrences' },
        },
        required: ['path', 'old', 'new'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Run shell command (30s timeout)',
      parameters: {
        type: 'object',
        properties: {
          cmd: { type: 'string', description: 'Command to execute' },
        },
        required: ['cmd'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description: 'Find files matching glob pattern (e.g., **/*.ts, src/**/*.js)',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern to match files' },
          path: { type: 'string', description: 'Directory to search in (default: .)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description: 'Search file contents with regex pattern',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in (default: .)' },
          include: { type: 'string', description: 'Glob pattern to filter files (e.g., *.ts)' },
        },
        required: ['pattern'],
      },
    },
  },
];

// collect glob matches into array
async function globToArray(pattern: string, cwd: string): Promise<string[]> {
  const matches: string[] = [];

  for await (const file of glob(pattern, { cwd, exclude: (p) => p.includes('node_modules') })) {
    matches.push(file);
  }

  return matches;
}

// tool handlers
const toolHandlers: Record<string, (args: never) => Promise<string>> = {
  async read({ path, offset = 0, limit }: { path: string; offset?: number; limit?: number }) {
    const content = await readFile(path, 'utf-8');
    const lines = content.split('\n');
    const end = limit ? offset + limit : lines.length;

    return lines
      .slice(offset, end)
      .map((line, i) => `${String(offset + i + 1).padStart(4)}| ${line}`)
      .join('\n');
  },

  async write({ path, content }: { path: string; content: string }) {
    await writeFile(path, content, 'utf-8');

    return 'ok';
  },

  async edit({ path, old: oldStr, new: newStr, all }: { path: string; old: string; new: string; all?: boolean }) {
    const text = await readFile(path, 'utf-8');

    if (!text.includes(oldStr)) {
      return 'error: old string not found';
    }

    const count = text.split(oldStr).length - 1;
    if (!all && count > 1) {
      return `error: old string appears ${count} times, must be unique (or use all=true)`;
    }

    const updated = all ? text.replaceAll(oldStr, newStr) : text.replace(oldStr, newStr);
    await writeFile(path, updated, 'utf-8');

    return 'ok';
  },

  async bash({ cmd }: { cmd: string }) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });

      return (stdout + stderr).trim() || '(empty)';
    } catch (err) {
      const e = err as { killed?: boolean; stdout?: string; stderr?: string; message?: string };

      if (e.killed) {
        return '(timed out after 30s)';
      }

      return e.stdout || e.stderr || e.message || 'error';
    }
  },

  async glob({ pattern, path: dir = '.' }: { pattern: string; path?: string }) {
    const matches = await globToArray(pattern, dir);

    return matches.length ? matches.join('\n') : '(no matches)';
  },

  async grep({ pattern, path: dir = '.', include = '**/*' }: { pattern: string; path?: string; include?: string }) {
    const files = await globToArray(include, dir);
    const regex = new RegExp(pattern);
    const results: string[] = [];

    for (const file of files) {
      try {
        const content = await readFile(`${dir}/${file}`, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push(`${file}:${i + 1}: ${lines[i]}`);
          }
        }
      } catch {
        // skip unreadable files (directories, binaries, etc.)
      }
    }
    return results.length ? results.join('\n') : '(no matches)';
  },
};

export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const handler = toolHandlers[name];

  if (!handler) {
    return `error: unknown tool "${name}"`;
  }

  try {
    return await handler(args as never);
  } catch (err) {
    return `error: ${err}`;
  }
}
