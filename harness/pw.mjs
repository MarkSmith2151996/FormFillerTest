// One Playwright instance for the whole harness: the playwright-core that @playwright/mcp itself
// uses, so Version B's MCP server can drive a BrowserContext the harness created (and guarded).
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const mcpRequire = createRequire(require.resolve('@playwright/mcp'));
export const playwright = mcpRequire('playwright-core');
export const { createConnection } = mcpRequire('@playwright/mcp');

// Use Playwright's own browser if installed, else any Chromium build under PLAYWRIGHT_BROWSERS_PATH
// (cloud VM ships chromium-1194 and forbids `playwright install`), else CHROMIUM_PATH.
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { const p = playwright.chromium.executablePath(); if (fs.existsSync(p)) return undefined; } catch {}
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) { const p = `${base}/${d}/chrome-linux/chrome`; if (fs.existsSync(p)) return p; }
  return undefined;
}

export const launch = (opts = {}) => playwright.chromium.launch({ headless: true, executablePath: chromiumPath(), ...opts });
