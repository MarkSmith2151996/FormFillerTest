#!/usr/bin/env node
// Version A as an MCP server (stdio) for Claude Code or any MCP client. Production shape:
//   claude mcp add form-toolkit -- node versions/a_form_toolkit/mcp-server.mjs --cdp ws://127.0.0.1:3001/v1/cdp/<steel-session> --profile /path/dealer_profile.json
// Without --cdp it launches a local Chromium. The submit guard (route interception + in-page guard) is
// installed on the browser context before any tool runs, so it sits below whoever drives the tools.
import fs from 'fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { playwright, launch } from '../../harness/pw.mjs';
import { guardContext } from '../../harness/guard.mjs';
import { formToolkit } from './tools.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
const profileBase = JSON.parse(fs.readFileSync(arg('--profile') || new URL('../../profile/synthetic.json', import.meta.url), 'utf8'));
const log = [];
let tk; let page;
async function ensure() {
  if (tk) return tk;
  const browser = arg('--cdp') ? await playwright.chromium.connectOverCDP(arg('--cdp')) : await launch();
  const context = browser.contexts()[0] || await browser.newContext();
  await guardContext(context, log);
  page = context.pages()[0] || await context.newPage();
  tk = formToolkit(page, { profileBase });
  return tk;
}
const text = (t) => ({ content: [{ type: 'text', text: String(t) }] });
const server = new McpServer({ name: 'form-toolkit', version: '1.0.0' });
server.tool('open_form', 'Navigate to a form URL and return the compact form snapshot (fields f1..fn with type, * = required, options, presets).', { url: z.string() }, async ({ url }) => text(await (await ensure()).open(url)));
server.tool('snapshot_form', 'Re-read the fillable fields (shadow DOM + same-origin iframes).', {}, async () => text(await (await ensure()).snapshot()));
server.tool('fill', 'Fill many fields in one call. values: {"f1":"{{profile.legal_name}}","f7":"Michigan","f9":true}. Selects/radios/custom dropdowns take option text; checkboxes take true/false. Returns one verified line per field.', { values: z.record(z.union([z.string(), z.boolean()])) }, async ({ values }) => text(await (await ensure()).fill(values)));
server.tool('choose', 'Pick an option by visible text on a native select, radio group or custom dropdown ([role=option]); verifies the result.', { field_id: z.string(), option: z.string() }, async ({ field_id, option }) => text(await (await ensure()).choose(field_id, option)));
server.tool('check', 'Set a checkbox on/off (verified).', { field_id: z.string(), on: z.boolean().default(true) }, async ({ field_id, on }) => text(await (await ensure()).check(field_id, on)));
server.tool('next_step', 'Click the Next/Continue control of a multi-step form. Refuses submit-like controls and form-submit buttons.', {}, async () => text(await (await ensure()).next()));
server.tool('classify_page', 'Classify the page: FORM, LOGIN_GATED, NOT_A_FORM, PDF_APPLICATION, ENTERPRISE_ONLY, BLOCKED (with evidence).', {}, async () => text(await (await ensure()).classify()));
server.tool('screenshot', 'Save a full-page JPEG for the approver.', { path: z.string() }, async ({ path }) => text(await (await ensure()).screenshot(path)));
server.tool('report', 'Finish: declare the outcome class, the fields a human must supply, and notes. Returns the filled-field map (profile keys only) and guard counts.', { outcome: z.enum(['FILLED', 'PARTIAL', 'NEEDS_HUMAN', 'NOT_A_FORM', 'LOGIN_GATED', 'PDF_APPLICATION', 'ENTERPRISE_ONLY', 'BLOCKED', 'NOT_A_FIT']), needs_human: z.array(z.string()).default([]), notes: z.string().default('') }, async ({ outcome, needs_human, notes }) => text(await (await ensure()).report(outcome, needs_human, notes)));
await server.connect(new StdioServerTransport());
