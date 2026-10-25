/**
 * Subtitle parsing for code-first caption authoring.
 *
 * Parses SRT and WebVTT cue blocks into exact-rational cue specs so programs
 * and the SDK can turn timed transcripts (data blocks, agent output, caption
 * files) into caption clips aligned with the audio timeline. This module is
 * browser-safe: string processing only, no I/O.
 */

import { DEFAULT_CLIP, type CaptionClip, type Clip } from './model.ts';
import { fromDecimal, rat, type Rational } from './time.ts';

export interface SubtitleCue {
  /** Cue identifier when the source provides one (SRT index or WebVTT id). */
  id?: string;
  start: Rational;
  end: Rational;
  text: string;
}

function parseTimestamp(text: string): Rational | undefined {
  const trimmed = text.trim();
  // WebVTT: HH:MM:SS.mmm or MM:SS.mmm; SRT: HH:MM:SS,mmm.
  const long = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(trimmed);
  if (long) {
    const seconds = Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]);
    return addMillis(seconds, Number(long[4]!.padEnd(3, '0')));
  }
  const short = /^(\d{1,2}):(\d{2})[,.](\d{1,3})$/.exec(trimmed);
  if (short) {
    return addMillis(Number(short[1]) * 60 + Number(short[2]), Number(short[3]!.padEnd(3, '0')));
  }
  return undefined;
}

function addMillis(seconds: number, millis: number): Rational {
  return rat(seconds * 1_000_000 + millis * 1_000, 1_000_000);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse SRT or WebVTT text into cue specs. Timing lines accept both `,`
 * (SRT) and `.` (WebVTT) millisecond separators; cue settings after the
 * timestamps and `NOTE`/`STYLE`/`REGION` blocks are ignored. Timestamps on
 * one line MUST be separated by `-->`. Overlapping cues are preserved as
 * authored; validation happens on the resulting clips.
 */
export function parseSubtitleBlocks(source: string): SubtitleCue[] {
  const normalized = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
  const blocks = normalized.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0]!)) continue;
    if (lines.length === 1 && !lines[0]!.includes('-->')) continue;

    let timingIndex = lines.findIndex((line) => line.includes('-->'));
    if (timingIndex === -1) continue;
    let id: string | undefined;
    if (timingIndex > 0) {
      const candidate = lines.slice(0, timingIndex).join(' ');
      if (!/-->/.test(candidate) && candidate.length <= 80) id = candidate;
    }
    const timing = lines[timingIndex]!;
    const [rawStart, rest] = timing.split('-->');
    if (!rawStart || !rest) continue;
    // WebVTT cue settings follow the end timestamp; drop them.
    const rawEnd = rest.trim().split(/\s+/)[0] ?? '';
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd);
    if (start === undefined || end === undefined) continue;
    const text = decodeEntities(lines.slice(timingIndex + 1).join('\n'));
    if (!text) continue;
    cues.push({ id, start, end, text });
  }
  return cues;
}

/** Millisecond-precision textual form, used for round-trip tests. */
export function cueToSeconds(cue: SubtitleCue): { start: number; end: number } {
  return {
    start: cue.start.num / cue.start.den,
    end: cue.end.num / cue.end.den,
  };
}

export { fromDecimal };


export interface CueClipOptions {
  /** Caption clip id prefix (default "cue"). */
  idPrefix?: string;
  defaultDurationSeconds?: number;
  style?: Record<string, string>;
}

interface CueRow {
  start: number;
  end?: number;
  duration?: number;
  text?: string;
  speaker?: string;
}

/**
 * Convert transcribe/cue data into caption Clip objects for `clip.add`.
 * Accepts a JSON array of {start, end|duration, text, speaker?} rows in
 * seconds, or an SRT/WebVTT string. Rows are sorted by start; invalid rows
 * are skipped so partial ASR output still lands.
 */
export function cuesToClips(data: unknown, options: CueClipOptions = {}): Clip[] {
  const prefix = options.idPrefix ?? 'cue';
  const fallbackDuration = options.defaultDurationSeconds ?? 2;
  const rows: CueRow[] = [];
  if (typeof data === 'string') {
    for (const cue of parseSubtitleBlocks(data)) {
      rows.push({
        start: toNumberSafe(cue.start),
        end: toNumberSafe(cue.end),
        text: cue.text,
      });
    }
  } else if (Array.isArray(data)) {
    for (const row of data) {
      if (row && typeof row === 'object') rows.push(row as CueRow);
    }
  }
  const clips: Clip[] = [];
  for (const [index, row] of rows.entries()) {
    const start = Number(row.start);
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!Number.isFinite(start) || !text) continue;
    const end = Number.isFinite(Number(row.end)) ? Number(row.end) : start + Number(row.duration ?? fallbackDuration);
    const duration = Math.max(0.001, end - start);
    clips.push({
      ...DEFAULT_CLIP,
      id: `${prefix}-${index + 1}`,
      kind: 'caption',
      start: rat(Math.round(start * 1_000_000), 1_000_000),
      duration: rat(Math.round(duration * 1_000_000), 1_000_000),
      sourceIn: rat(0),
      text,
      speaker: typeof row.speaker === 'string' && row.speaker ? row.speaker : undefined,
      style: options.style,
      opacity: 1,
    } as CaptionClip);
  }
  return clips.sort((a, b) => toNumberSafe((a as CaptionClip).start) - toNumberSafe((b as CaptionClip).start));
}

function toNumberSafe(value: Rational | number): number {
  return typeof value === 'number' ? value : value.num / value.den;
}
