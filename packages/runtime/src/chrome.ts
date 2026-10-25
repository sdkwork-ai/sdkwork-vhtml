/**
 * Chromium discovery and launch policy.
 */

import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

export interface BrowserLaunchOptions {
  executablePath?: string;
  headless?: boolean;
  sandbox?: boolean;
  width: number;
  height: number;
}

const WINDOWS_CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const MAC_CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

const LINUX_CHROME = [
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

export function findChromeExecutable(explicit?: string): string {
  const candidates: string[] = [];
  if (explicit) candidates.push(explicit);
  for (const name of ['VHTML_CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH', 'CHROME_PATH']) {
    const value = process.env[name];
    if (value) candidates.push(value);
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      candidates.push(path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    candidates.push(...WINDOWS_CHROME);
  } else if (process.platform === 'darwin') {
    candidates.push(...MAC_CHROME);
  } else {
    candidates.push(...LINUX_CHROME);
  }
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  throw new Error(
    'VHTML_RENDER_BROWSER_UNAVAILABLE: Chrome/Chromium was not found. Install Chrome or set VHTML_CHROME_PATH=/path/to/chrome.',
  );
}

export async function launchBrowser(options: BrowserLaunchOptions): Promise<Browser> {
  const executablePath = findChromeExecutable(options.executablePath);
  const args = [
    `--window-size=${options.width},${options.height}`,
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--disable-lcd-text',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
    '--no-first-run',
    '--no-default-browser-check',
    '--enable-unsafe-swiftshader',
    '--disable-gpu',
  ];
  if (options.sandbox === false || options.sandbox === undefined) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return puppeteer.launch({
    executablePath,
    headless: options.headless ?? true,
    args,
    defaultViewport: null,
    timeout: 60_000,
    protocolTimeout: 180_000,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
}
