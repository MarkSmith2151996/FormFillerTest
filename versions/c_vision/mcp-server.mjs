#!/usr/bin/env node
// Version C as an MCP server (stdio): screenshot-first with coordinate actions. Production shape:
//   claude mcp add vision-filler -- node versions/c_vision/mcp-server.mjs --cdp ws://127.0.0.1:3001/v1/cdp/<steel-session> --profile /path/dealer_profile.json
// Screenshots are 960x600 JPEGs of a 1280x800 viewport with a labelled 100 px grid (CSS pixels).
import fs from 'fs';
import os from 'os';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { playwright, launch } from '../../harness/pw.mjs';
import { guardContext } from '../../harness/guard.mjs';
import { visionToolkit, VISION_CONTEXT } from './tools.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const profileBase = JSON.parse(fs.readFileSync(arg('--profile') || new URL('../../profile/synthetic.json', import.meta.url), 'utf8'));
const shotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vision-'));
const log = [];
let tk;
async function ensure() {
  if (tk) return tk;
  const browser = arg('--cdp') ? await playwright.chromium.connectOverCDP(arg('--cdp')) : await launch();
  const context = arg('--cdp') ? browser.contexts()[0] : await browser.newContext(VISION_CONTEXT);
  await guardContext(context, log);
  const page = context.pages()[0] || await context.newPage();
  if (arg('--cdp')) await page.setViewportSize(VISION_CONTEXT.viewport);
  tk = visionToolkit(page, { profileBase, shotDir });
  return tk;
}
const image = (s, extra = '') => ({ content: [{ type: 'text', text: `${extra}${s.w}x${s.h} screenshot, grid labels are CSS px` }, { type: 'image', data: fs.readFileSync(s.file).toString('base64'), mimeType: 'image/jpeg' }] });
const server = new McpServer({ name: 'vision-filler', version: '1.0.0' });
server.tool('open', 'Navigate and return a viewport screenshot.', { url: z.string() }, async ({ url }) => image(await (await ensure()).open(url)));
server.tool('screenshot', 'Viewport screenshot (960x600 JPEG, labelled 100 px grid).', {}, async () => image(await (await ensure()).shot()));
server.tool('act', 'Run actions, then return a fresh screenshot. actions: [["click",x,y],["type","text or {{profile.key}}"],["clear"],["key","Tab"],["select",x,y,"Option text"],["scroll",600]]. Coordinates are CSS px read off the grid.', { actions: z.array(z.array(z.union([z.string(), z.number()]))) }, async ({ actions }) => { const s = await (await ensure()).act(actions); return image(s, `${s.acks}\n`); });
await server.connect(new StdioServerTransport());
