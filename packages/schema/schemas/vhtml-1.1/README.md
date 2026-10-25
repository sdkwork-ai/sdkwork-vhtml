# VHTML 1.1 Schemas

- `model.schema.json` — structural JSON Schema for the Core Model (draft 2020-12).
- `project.schema.json` — JSON Schema for the optional `vhtml.json` project manifest
  (entry/source, directory conventions, preview/export settings).
- `package.schema.json` — metadata schema for `vhtml.package.json` inside a
  `.vhtmlpkg` ZIP.
- The schema validates structure; cross-field rules are enforced by the
  reference validator:
  - unique IDs and reference resolution;
  - clip source bounds;
  - transition overlap;
  - animation ordering;
  - output ranges and path security;
  - capability requirements.

Validate a custom IR:

```js
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './model.schema.json' with { type: 'json' };

const validate = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
const ok = validate({ specVersion: '1.1', project });
```

The reference implementation's test suite validates parsed, SDK-built and
edited projects against this schema.

## Notes

- `source` location objects are permitted on model nodes for diagnostics.
- `metadata`/`params` allow open key/value extensions.
- Vendor-specific generation parameters belong in `params`; they do not change
  core semantics.
- A document that fails the schema is a structural error; a document that passes
  it may still fail semantic validation.
