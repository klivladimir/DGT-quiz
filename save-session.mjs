#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const WORKDIR = process.cwd();
const SESSION_DIR = path.join(WORKDIR, 'session');
const SESSION_STATE_FILE = path.join(SESSION_DIR, 'todotest-storage.json');
const LOGIN_URL =
  process.env.LOGIN_URL ||
  'https://www.todotest.com/personal/usrreg.asp?from=test&rd=%2Ftests%2Ftest%2Easp%3Ftip%3D3%26t%3D2';

async function main() {
  await mkdir(SESSION_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Open login page: ${LOGIN_URL}`);
  console.log('Log in manually in the opened browser window.');
  console.log('The session will be saved automatically after you leave the auth page.');

  await page.goto(LOGIN_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  await page.waitForURL(
    (url) => !url.pathname.includes('/personal/usrreg.asp'),
    { timeout: 0 }
  );

  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await context.storageState({ path: SESSION_STATE_FILE });

  console.log(`Saved session to ${SESSION_STATE_FILE}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
