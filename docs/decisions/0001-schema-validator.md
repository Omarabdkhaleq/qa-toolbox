# 0001 — JSON Schema validator under a strict CSP

- Date: 2026-11-08
- Status: Accepted

## Context
devbox serves a CSP without `unsafe-eval` (intent.md §6.3). Ajv compiles schemas with `new Function`, which that CSP blocks.

## Spike
vanilla-jsoneditor 3 + @cfworker/json-schema 4 + JSONQuery/JMESPath/JSONPath, served by the production nginx container.
Checked with a throwaway headless-Chromium Playwright script against http://localhost:8080/#/tools/json-editor (no manual browser session).

| Criterion | Result |
|---|---|
| Validation errors shown in text and tree mode | PASS |
| text/tree/table modes work | PASS |
| Transform works for JSONQuery, JMESPath, JSONPath | PASS |
| No CSP violations in console | PASS |
| Container e2e passes | PASS |

Notes: the `age` error ("Instance type "string" is invalid. Expected "number".") appeared in the validation overview in both modes, with inline markers. JSONPath returns its standard result list, so the preview shows `items` wrapped in one outer array.

## Decision
- Use @cfworker/json-schema; the CSP stays free of `unsafe-eval`.
