/**
 * Stable VHTML diagnostics.
 *
 * Every error surfaced by the reference implementation carries a stable code,
 * a human readable message, the object it concerns (when known) and an optional
 * source location. Tooling MUST NOT depend on message text.
 */

import path from 'node:path';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface SourceLocation {
  file?: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  offset?: number;
  length?: number;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  /** JSON-pointer-like path inside the project model, e.g. /timelines/0/tracks/1. */
  path?: string;
  /** Stable object id the diagnostic is attached to. */
  objectId?: string;
  source?: SourceLocation;
  hint?: string;
  detail?: Record<string, unknown>;
}

export const ErrorCode = {
  // Parsing
  PARSE_INVALID_DOCUMENT: 'PARSE_INVALID_DOCUMENT',
  PARSE_INVALID_TAG: 'PARSE_INVALID_TAG',
  PARSE_INVALID_ATTRIBUTE: 'PARSE_INVALID_ATTRIBUTE',
  PARSE_MISSING_ATTRIBUTE: 'PARSE_MISSING_ATTRIBUTE',
  PARSE_DUPLICATE_ID: 'PARSE_DUPLICATE_ID',
  PARSE_UNSUPPORTED_VERSION: 'PARSE_UNSUPPORTED_VERSION',
  PARSE_UNRECOGNISED_NODE: 'PARSE_UNRECOGNISED_NODE',
  PARSE_HTML_AMBIGUITY: 'PARSE_HTML_AMBIGUITY',
  // Validation
  VALIDATION_INVALID_TYPE: 'VALIDATION_INVALID_TYPE',
  VALIDATION_MISSING_REQUIRED: 'VALIDATION_MISSING_REQUIRED',
  VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
  VALIDATION_DUPLICATE_ID: 'VALIDATION_DUPLICATE_ID',
  VALIDATION_INVALID_VALUE: 'VALIDATION_INVALID_VALUE',
  VALIDATION_INCOMPATIBLE_TRACK: 'VALIDATION_INCOMPATIBLE_TRACK',
  VALIDATION_UNSUPPORTED_CAPABILITY: 'VALIDATION_UNSUPPORTED_CAPABILITY',
  VALIDATION_CLIP_OVERFLOW: 'VALIDATION_CLIP_OVERFLOW',
  VALIDATION_EMPTY_TIMELINE: 'VALIDATION_EMPTY_TIMELINE',
  // References
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  REFERENCE_AMBIGUOUS: 'REFERENCE_AMBIGUOUS',
  REFERENCE_CYCLE: 'REFERENCE_CYCLE',
  REFERENCE_INCOMPATIBLE: 'REFERENCE_INCOMPATIBLE',
  // Time
  TIME_INVALID: 'TIME_INVALID',
  TIME_OVERFLOW: 'TIME_OVERFLOW',
  TIME_UNBOUNDED: 'TIME_UNBOUNDED',
  TIME_OUT_OF_SOURCE: 'TIME_OUT_OF_SOURCE',
  TIME_OVERLAP: 'TIME_OVERLAP',
  TIME_TRANSITION_INVALID: 'TIME_TRANSITION_INVALID',
  // Assets
  ASSET_NOT_FOUND: 'ASSET_NOT_FOUND',
  ASSET_UNAVAILABLE: 'ASSET_UNAVAILABLE',
  ASSET_DECODE_FAILED: 'ASSET_DECODE_FAILED',
  ASSET_METADATA_MISMATCH: 'ASSET_METADATA_MISMATCH',
  ASSET_TOO_LARGE: 'ASSET_TOO_LARGE',
  ASSET_UNSUPPORTED_TYPE: 'ASSET_UNSUPPORTED_TYPE',
  // Rendering
  RENDER_BROWSER_UNAVAILABLE: 'RENDER_BROWSER_UNAVAILABLE',
  RENDER_PAGE_FAILED: 'RENDER_PAGE_FAILED',
  RENDER_FRAME_TIMEOUT: 'RENDER_FRAME_TIMEOUT',
  RENDER_CAPTURE_FAILED: 'RENDER_CAPTURE_FAILED',
  RENDER_UNSUPPORTED_FEATURE: 'RENDER_UNSUPPORTED_FEATURE',
  RENDER_MEDIA_SEEK_FAILED: 'RENDER_MEDIA_SEEK_FAILED',
  RENDER_DETERMINISM_RISK: 'RENDER_DETERMINISM_RISK',
  // Scripts
  SCRIPT_ERROR: 'SCRIPT_ERROR',
  SCRIPT_TIMEOUT: 'SCRIPT_TIMEOUT',
  SCRIPT_BLOCKED_API: 'SCRIPT_BLOCKED_API',
  // Editing
  EDIT_INVALID_OPERATION: 'EDIT_INVALID_OPERATION',
  EDIT_TARGET_NOT_FOUND: 'EDIT_TARGET_NOT_FOUND',
  EDIT_CONFLICT: 'EDIT_CONFLICT',
  EDIT_OUT_OF_BOUNDS: 'EDIT_OUT_OF_BOUNDS',
  // Generation
  GENERATION_TASK_NOT_FOUND: 'GENERATION_TASK_NOT_FOUND',
  GENERATION_PROVIDER_NOT_FOUND: 'GENERATION_PROVIDER_NOT_FOUND',
  GENERATION_PROVIDER_ERROR: 'GENERATION_PROVIDER_ERROR',
  GENERATION_CAPABILITY_MISSING: 'GENERATION_CAPABILITY_MISSING',
  GENERATION_DEPENDENCY_CYCLE: 'GENERATION_DEPENDENCY_CYCLE',
  GENERATION_TIMEOUT: 'GENERATION_TIMEOUT',
  GENERATION_CANCELLED: 'GENERATION_CANCELLED',
  GENERATION_INVALID_OUTPUT: 'GENERATION_INVALID_OUTPUT',
  // Export
  EXPORT_VALIDATION_FAILED: 'EXPORT_VALIDATION_FAILED',
  EXPORT_ENCODER_UNAVAILABLE: 'EXPORT_ENCODER_UNAVAILABLE',
  EXPORT_ENCODER_FAILED: 'EXPORT_ENCODER_FAILED',
  EXPORT_AUDIO_FAILED: 'EXPORT_AUDIO_FAILED',
  EXPORT_CANCELLED: 'EXPORT_CANCELLED',
  EXPORT_TIMEOUT: 'EXPORT_TIMEOUT',
  EXPORT_IO_FAILED: 'EXPORT_IO_FAILED',
  // Security
  SECURITY_PATH_ESCAPE: 'SECURITY_PATH_ESCAPE',
  SECURITY_NETWORK_BLOCKED: 'SECURITY_NETWORK_BLOCKED',
  SECURITY_SCRIPT_BLOCKED: 'SECURITY_SCRIPT_BLOCKED',
  SECURITY_CREDENTIAL_IN_DOCUMENT: 'SECURITY_CREDENTIAL_IN_DOCUMENT',
  // Extensions / runtime
  EXTENSION_UNKNOWN_REQUIRED: 'EXTENSION_UNKNOWN_REQUIRED',
  EXTENSION_INVALID: 'EXTENSION_INVALID',
  IO_NOT_FOUND: 'IO_NOT_FOUND',
  IO_FAILED: 'IO_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CAPABILITY_MISSING: 'CAPABILITY_MISSING',
} as const;

export type ErrorCodeName = keyof typeof ErrorCode;

export function diagnostic(
  code: string,
  message: string,
  extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> & {
    severity?: DiagnosticSeverity;
  } = {},
): Diagnostic {
  return {
    code,
    message,
    severity: extra.severity ?? 'error',
    ...extra,
  };
}

export function errorDiagnostic(
  code: string,
  message: string,
  extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {},
): Diagnostic {
  return diagnostic(code, message, { ...extra, severity: 'error' });
}

export function warningDiagnostic(
  code: string,
  message: string,
  extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {},
): Diagnostic {
  return diagnostic(code, message, { ...extra, severity: 'warning' });
}

export class VhtmlError extends Error {
  readonly code: string;
  readonly diagnostics: Diagnostic[];

  constructor(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}) {
    super(message);
    this.name = 'VhtmlError';
    this.code = code;
    this.diagnostics = [errorDiagnostic(code, message, extra)];
  }

  static fromDiagnostic(d: Diagnostic): VhtmlError {
    const error = new VhtmlError(d.code, d.message, {
      path: d.path,
      objectId: d.objectId,
      source: d.source,
      hint: d.hint,
      detail: d.detail,
    });
    error.diagnostics[0] = d;
    return error;
  }
}

/** Collects diagnostics while keeping execution going. */
export class DiagnosticBag {
  readonly items: Diagnostic[] = [];

  add(d: Diagnostic): this {
    this.items.push(d);
    return this;
  }

  error(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): this {
    return this.add(errorDiagnostic(code, message, extra));
  }

  warning(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): this {
    return this.add(warningDiagnostic(code, message, extra));
  }

  info(code: string, message: string, extra: Omit<Diagnostic, 'code' | 'message' | 'severity'> = {}): this {
    return this.add(diagnostic(code, message, { ...extra, severity: 'info' }));
  }

  get hasErrors(): boolean {
    return this.items.some((item) => item.severity === 'error');
  }

  get errors(): Diagnostic[] {
    return this.items.filter((item) => item.severity === 'error');
  }

  get warnings(): Diagnostic[] {
    return this.items.filter((item) => item.severity === 'warning');
  }

  throwIfErrors(): void {
    const first = this.errors[0];
    if (first) throw VhtmlError.fromDiagnostic(first);
  }

  toJSON(): Diagnostic[] {
    return this.items;
  }
}

export function formatDiagnostic(d: Diagnostic, cwd?: string): string {
  const severity = d.severity.toUpperCase().padEnd(7);
  const location = d.source
    ? `${formatSourcePath(d.source.file, cwd)}:${d.source.line}:${d.source.column}: `
    : '';
  const object = d.objectId ? ` [${d.objectId}]` : '';
  const hint = d.hint ? `\n         hint: ${d.hint}` : '';
  return `${location}${severity} ${d.code}: ${d.message}${object}${hint}`;
}

export function formatSourcePath(file: string | undefined, cwd?: string): string {
  if (!file) return '<input>';
  if (!cwd) return file;
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith('..') ? relative : file;
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function wrapError(code: string, context: string, error: unknown): VhtmlError {
  if (error instanceof VhtmlError) return error;
  return new VhtmlError(code, `${context}: ${toErrorMessage(error)}`);
}
