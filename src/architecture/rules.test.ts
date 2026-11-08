import { describe, expect, it } from 'vitest';
import { findViolations } from './rules';

const file = (path: string, source: string) => ({ path, source });

describe('findViolations', () => {
  it('allows core importing core and tools importing core', () => {
    expect(
      findViolations([
        file('src/core/a.ts', "import { b } from './b';"),
        file('src/tools/x/logic.ts', "import { a } from '../../core/a';"),
      ]),
    ).toEqual([]);
  });

  it('flags core importing tools or app', () => {
    const v = findViolations([
      file(
        'src/core/a.ts',
        "import { t } from '../tools/x/logic';\nimport { App } from '../app/App';",
      ),
    ]);
    expect(v.map((x) => x.rule)).toEqual(['core-isolation', 'core-isolation']);
  });

  it('flags a tool importing another tool, including dynamic imports', () => {
    const v = findViolations([
      file('src/tools/x/View.tsx', "const m = import('../y/logic');"),
      file('src/tools/x/other.ts', "import { a } from './logic';"),
    ]);
    expect(v).toEqual([
      { file: 'src/tools/x/View.tsx', specifier: '../y/logic', rule: 'tool-isolation' },
    ]);
  });

  it('allows the registry to import tools', () => {
    expect(findViolations([file('src/tools/registry.ts', "import { x } from './x';")])).toEqual([]);
  });

  it('only lets core/json-view import vanilla-jsoneditor', () => {
    const v = findViolations([
      file(
        'src/core/json-view/JsonEditorView.tsx',
        "import { createJSONEditor } from 'vanilla-jsoneditor';",
      ),
      file('src/tools/x/View.tsx', "import 'vanilla-jsoneditor/themes/jse-theme-dark.css';"),
    ]);
    expect(v).toEqual([
      {
        file: 'src/tools/x/View.tsx',
        specifier: 'vanilla-jsoneditor/themes/jse-theme-dark.css',
        rule: 'editor-library',
      },
    ]);
  });

  it('keeps logic.ts free of React and DOM editor code', () => {
    const v = findViolations([
      file(
        'src/tools/x/logic.ts',
        "import { useState } from 'react';\nexport type { EditorView } from '@codemirror/view';",
      ),
    ]);
    expect(v.map((x) => x.rule)).toEqual(['pure-logic', 'pure-logic']);
  });
});
