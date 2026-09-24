#!/usr/bin/env node
// Version B runner: Microsoft's @playwright/mcp server over stdio, unmodified, on a browser context the
// harness has already guarded (route interception + in-page submit guard below the MCP server).
//   claude mcp add playwright-guarded -- node versions/b_playwright_mcp/runner.mjs [--cdp ws://127.0.0.1:3001/v1/cdp/<steel-session>]
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { playwright, launch, createConnection } from '../../harness/pw.mjs';
import { guardContext } from '../../harness/guard.mjs';

const i = process.argv.indexOf('--cdp');
const cdp = i > 0 ? process.argv[i + 1] : undefined;
const log = [];
let context;
const getContext = async () => {
  if (context) return context;
  const browser = cdp ? await playwright.chromium.connectOverCDP(cdp) : await launch();
  context = browser.contexts()[0] || await browser.newContext();
  await guardContext(context, log);
  return context;
};
const server = await createConnection({ outputDir: process.env.PWMCP_OUT || '.tmp/pwmcp' }, getContext);
await server.connect(new StdioServerTransport());
process.on('exit', () => { if (log.length) process.stderr.write(`guard blocked ${log.length} write(s)\n`); });
