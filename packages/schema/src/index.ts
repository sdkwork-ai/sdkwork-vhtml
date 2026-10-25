/**
 * VHTML JSON Schemas (draft 2020-12).
 *
 * The schema files ship next to `dist/` inside the package. Consumers can use
 * the loaded objects, resolve file paths for Ajv/IDE tooling, or import the
 * JSON files directly through the package exports.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type SchemaName = 'model' | 'project' | 'package' | 'provider-request' | 'provider-response' | 'export-report';

export const schemaDirectory = fileURLToPath(new URL('../schemas/vhtml-1.1', import.meta.url));

const FILES: Record<SchemaName, string> = {
  model: 'model.schema.json',
  project: 'project.schema.json',
  package: 'package.schema.json',
  'provider-request': 'provider-request.schema.json',
  'provider-response': 'provider-response.schema.json',
  'export-report': 'export-report.schema.json',
};

export function schemaPath(name: SchemaName): string {
  const file = FILES[name];
  if (!file) throw new Error(`unknown VHTML schema: ${String(name)}`);
  return path.join(schemaDirectory, file);
}

export function loadSchema(name: SchemaName): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(schemaPath(name), 'utf8')) as Record<string, unknown>;
}

export const modelSchema = loadSchema('model');
export const projectSchema = loadSchema('project');
export const packageSchema = loadSchema('package');
export const providerRequestSchema = loadSchema('provider-request');
export const providerResponseSchema = loadSchema('provider-response');
export const exportReportSchema = loadSchema('export-report');

export const schemas = {
  model: modelSchema,
  project: projectSchema,
  package: packageSchema,
  providerRequest: providerRequestSchema,
  providerResponse: providerResponseSchema,
  exportReport: exportReportSchema,
} as const;
