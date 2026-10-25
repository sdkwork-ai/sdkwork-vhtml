/**
 * Deterministic Chromium frame sampler.
 *
 * A project-root HTTP server isolates the document, supports media range
 * requests, and blocks external network access. Each request for a frame
 * applies the evaluated state, seeks media/animations, waits for observable
 * readiness and only then captures a PNG.
 */

import type { Browser, Page } from 'puppeteer-core';
import { buildStageRuntime } from './build.ts';
import { buildStageHtml } from './stage.ts';
import { startProjectServer, type ProjectServer } from './server.ts';
import { findChromeExecutable, launchBrowser } from './chrome.ts';
import { frameTime, toNumber, type Rate } from '@sdkwork/vhtml-core/time';
import type { Project } from '@sdkwork/vhtml-core/model';
import { ErrorCode, VhtmlError } from '@sdkwork/vhtml-core/errors';

export interface RendererOptions {
  project: Project;
  /** Project root for relative assets and the temporary HTTP origin. */
  root: string;
  timelineId?: string;
  executablePath?: string;
  headless?: boolean;
  sandbox?: boolean;
  /** Allow external http(s) requests. Disabled by default for determinism/security. */
  allowNetwork?: boolean;
  /** Per-frame readiness timeout. */
  timeoutMs?: number;
  /** Add hidden audio elements to the stage (off by default for deterministic capture). */
  includeAudio?: boolean;
  /** Extra CSS injected after project styles (studio overlays). */
  extraCss?: string;
}

export interface CapturedFrame {
  png: Buffer;
  width: number;
  height: number;
  frameIndex: number;
  time: number;
  issues: string[];
}

interface SeekResult {
  issues: string[];
  time: number;
  frame: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new VhtmlError(ErrorCode.RENDER_FRAME_TIMEOUT, `${message} (${ms}ms)`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class VhtmlRenderer {
  readonly options: RendererOptions;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private server: ProjectServer | null = null;
  private stageHtml = '';
  private openPromise: Promise<void> | null = null;
  private environmentIssues: string[] = [];
  private blockedRequests = new Set<string>();
  private browserVersion = '';
  private closed = false;

  constructor(options: RendererOptions) {
    this.options = options;
  }

  get isOpen(): boolean {
    return Boolean(this.page) && !this.closed;
  }

  get version(): string {
    return this.browserVersion;
  }

  async open(): Promise<void> {
    if (this.page) return;
    if (this.openPromise) return this.openPromise;
    this.openPromise = this.openInternal();
    try {
      await this.openPromise;
    } finally {
      this.openPromise = null;
    }
  }

  private async openInternal(): Promise<void> {
    const project = this.options.project;
    const runtimeSource = await buildStageRuntime();
    this.stageHtml = buildStageHtml({
      project,
      timelineId: this.options.timelineId,
      mode: 'deterministic',
      runtimeSource,
      includeAudio: this.options.includeAudio ?? false,
      extraCss: this.options.extraCss,
    });
    this.server = await startProjectServer({
      root: this.options.root,
      stage: () => this.stageHtml,
    });
    try {
      this.browser = await launchBrowser({
        executablePath: this.options.executablePath,
        headless: this.options.headless ?? true,
        sandbox: this.options.sandbox,
        width: project.composition.width,
        height: project.composition.height,
      });
      this.browserVersion = await this.browser.version();
      const page = await this.browser.newPage();
      this.page = page;
      page.setDefaultTimeout(this.options.timeoutMs ?? 30_000);
      await page.setViewport({
        width: project.composition.width,
        height: project.composition.height,
        deviceScaleFactor: 1,
      });
      await page.setCacheEnabled(false);
      try {
        await page.emulateTimezone('UTC');
      } catch {
        /* optional */
      }
      page.on('pageerror', (error) => {
        this.environmentIssues.push(`page error: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          if (text && !/favicon\.ico/i.test(text)) this.environmentIssues.push(`console: ${text}`);
        }
      });
      page.on('requestfailed', (request) => {
        const url = request.url();
        const failure = request.failure()?.errorText ?? '';
        if (url.startsWith(this.server!.origin) && !failure.includes('ERR_ABORTED')) {
          this.environmentIssues.push(`request failed: ${url} ${failure}`.trim());
        }
      });
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const url = request.url();
        const allowedBefore =
          url.startsWith(this.server!.origin) ||
          url.startsWith('data:') ||
          url.startsWith('blob:') ||
          url.startsWith('about:');
        const allowedNetwork = this.options.allowNetwork && /^https?:\/\//i.test(url);
        if (allowedBefore || allowedNetwork) {
          request.continue().catch(() => undefined);
        } else {
          this.blockedRequests.add(url);
          request.abort('blockedbyclient').catch(() => undefined);
        }
      });

      this.environmentIssues.length = 0;
      const timeout = this.options.timeoutMs ?? 30_000;
      await page.goto(this.server.url, { waitUntil: 'load', timeout });
      await withTimeout(
        page.evaluate(async () => {
          const api = (window as unknown as { __vhtml?: { ready?: Promise<void> } }).__vhtml;
          if (!api) throw new Error('VHTML stage runtime did not initialise');
          await api.ready;
          return true;
        }),
        Math.max(timeout, 60_000),
        'stage initialisation',
      );
      // The first frame is established during initialisation; capture its diagnostics.
      const initial = await page.evaluate(() => {
        const api = (window as unknown as {
          __vhtml: { state: () => { issues?: string[] } };
        }).__vhtml;
        return api.state().issues ?? [];
      });
      for (const issue of initial) this.environmentIssues.push(issue);
      if (this.blockedRequests.size) {
        const sample = Array.from(this.blockedRequests).slice(0, 5);
        this.environmentIssues.push(
          `blocked ${this.blockedRequests.size} external request(s): ${sample.join(', ')}${this.blockedRequests.size > sample.length ? '…' : ''}`,
        );
      }
      await page.evaluate(() => document.fonts.ready.then(() => true));
    } catch (error) {
      await this.close().catch(() => undefined);
      throw error instanceof VhtmlError
        ? error
        : new VhtmlError(
            ErrorCode.RENDER_PAGE_FAILED,
            `failed to open VHTML stage: ${(error as Error).message}`,
          );
    }
  }

  /** Sample a frame at an output frame rate (which may differ from composition). */
  async sampleFrame(frameIndex: number, rate?: Rate): Promise<CapturedFrame> {
    const fps = rate ?? this.options.project.composition.frameRate;
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      throw new VhtmlError(ErrorCode.RENDER_FRAME_TIMEOUT, `invalid frame index ${frameIndex}`);
    }
    const time = frameTime(frameIndex, fps);
    return this.capture(time, frameIndex, fps);
  }

  async sampleTime(seconds: number): Promise<CapturedFrame> {
    return this.capture(seconds, undefined, this.options.project.composition.frameRate);
  }

  private async capture(
    time: { num: number; den: number } | number,
    frameIndex: number | undefined,
    rate: Rate,
  ): Promise<CapturedFrame> {
    await this.open();
    const page = this.page;
    if (!page) throw new VhtmlError(ErrorCode.RENDER_PAGE_FAILED, 'renderer is not open');
    const secondsValue = typeof time === 'number' ? time : time.num / time.den;
    const timeout = this.options.timeoutMs ?? 30_000;
    let result: SeekResult;
    try {
      result = await withTimeout(
        page.evaluate(
          async (args: { time: number; frame: number | null; rate: { num: number; den: number } }) => {
            const api = (window as unknown as {
              __vhtml: {
                seek: (
                  time: number,
                  frame: number | undefined,
                  rate: { num: number; den: number },
                ) => Promise<SeekResult>;
              };
            }).__vhtml;
            if (!api) throw new Error('VHTML runtime missing');
            return api.seek(args.time, args.frame ?? undefined, args.rate);
          },
          { time: secondsValue, frame: frameIndex ?? null, rate: { num: rate.num, den: rate.den } },
        ),
        timeout,
        `frame ${frameIndex ?? secondsValue} readiness`,
      );
    } catch (error) {
      if (error instanceof VhtmlError) throw error;
      throw new VhtmlError(
        ErrorCode.RENDER_FRAME_TIMEOUT,
        `frame ${frameIndex ?? secondsValue} failed: ${(error as Error).message}`,
      );
    }
    let png: Buffer;
    try {
      const screenshot = await page.screenshot({
        type: 'png',
        captureBeyondViewport: false,
        clip: {
          x: 0,
          y: 0,
          width: this.options.project.composition.width,
          height: this.options.project.composition.height,
        },
      });
      png = Buffer.isBuffer(screenshot) ? screenshot : Buffer.from(screenshot);
    } catch (error) {
      throw new VhtmlError(ErrorCode.RENDER_CAPTURE_FAILED, `frame ${frameIndex ?? secondsValue} screenshot failed: ${(error as Error).message}`);
    }
    const issues = [
      ...(result?.issues ?? []),
      ...this.environmentIssues,
    ];
    this.environmentIssues.length = 0;
    return {
      png,
      width: this.options.project.composition.width,
      height: this.options.project.composition.height,
      frameIndex: result?.frame ?? frameIndex ?? 0,
      time: secondsValue,
      issues,
    };
  }

  getPage(): Page | null {
    return this.page;
  }

  getOrigin(): string | null {
    return this.server?.origin ?? null;
  }

  getStageUrl(): string | null {
    return this.server?.url ?? null;
  }

  getChromeExecutable(): string {
    return findChromeExecutable(this.options.executablePath);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const browser = this.browser;
    const page = this.page;
    const server = this.server;
    this.page = null;
    this.browser = null;
    this.server = null;
    if (page) {
      try {
        await withTimeout(page.close(), 5000, 'page close');
      } catch {
        /* ignore */
      }
    }
    if (browser) {
      try {
        await withTimeout(browser.close(), 10_000, 'browser close');
      } catch {
        try {
          browser.process()?.kill();
        } catch {
          /* ignore */
        }
      }
    }
    if (server) {
      try {
        await server.close();
      } catch {
        /* ignore */
      }
    }
  }
}

export async function createRenderer(options: RendererOptions): Promise<VhtmlRenderer> {
  const renderer = new VhtmlRenderer(options);
  await renderer.open();
  return renderer;
}
