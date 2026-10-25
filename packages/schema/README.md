# @sdkwork/vhtml-schema

Draft 2020-12 JSON Schemas for the VHTML Core Model, project manifest and portable package metadata.

## Install

```bash
npm install @sdkwork/vhtml-schema
```

## Exports

- `modelSchema`, `projectSchema`, `packageSchema`, `providerRequestSchema`, `providerResponseSchema`, `exportReportSchema`, `schemas`
- `loadSchema('model' | 'project' | 'package' | 'provider-request' | 'provider-response' | 'export-report')`
- `schemaPath(name)`, `schemaDirectory`
- raw JSON through `@sdkwork/vhtml-schema/vhtml-1.1/*.schema.json`

## Usage

```ts
import { Ajv2020 } from 'ajv/dist/2020.js';
import { loadSchema } from '@sdkwork/vhtml-schema';

const validate = new Ajv2020({ strict: false, allErrors: true })
  .compile(loadSchema('project'));

if (!validate({ version: '1.1', entry: 'video.vhtml' })) {
  console.error(validate.errors);
}
```

The model schema validates structure; cross-field rules (IDs, overlap, source bounds, ranges, capabilities) are enforced by `@sdkwork/vhtml-core/validate`.
