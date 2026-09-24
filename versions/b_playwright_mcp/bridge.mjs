// Version B: Microsoft's Playwright MCP server (@playwright/mcp), unmodified. The only thing this file
// adds is plumbing: the harness hands the MCP server a BrowserContext it created and guarded (so the
// submit guard sits below the MCP server), and an in-memory MCP client lets the bake-off CLI call the
// server's own tools by name. No custom tools, no wrappers around tool behaviour.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createConnection } from '../../harness/pw.mjs';

export async function playwrightMcp(context, { outputDir } = {}) {
  const server = await createConnection({ outputDir }, async () => context);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: 'ff-bakeoff', version: '1.0.0' });
  await client.connect(clientSide);
  return {
    tools: async () => (await client.listTools()).tools.map((t) => t.name),
    call: async (name, args = {}) => (await client.callTool({ name, arguments: args })).content,
    close: () => client.close(),
  };
}
