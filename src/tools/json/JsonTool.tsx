import { useEffect, useRef, useState } from 'react';
import { describeParseError } from '../../core/formats/errors';
import { copyToClipboard } from '../../core/io/clipboard';
import type { JsonEditorMode, JsonEditorViewHandle } from '../../core/json-view/JsonEditorView';
import { EditorPane, type Notice, type Side } from './EditorPane';
import './json.css';
import { applyEdit, type EditAction, type IndentChoice } from './logic';
import { MiddleMenu } from './MiddleMenu';

interface SideState {
  text: string;
  indent: IndentChoice;
  schemaOpen: boolean;
  schemaText: string;
  mode: JsonEditorMode;
  notice: Notice;
}

const initialSide = (): SideState => ({
  text: '',
  indent: 2,
  schemaOpen: false,
  schemaText: '',
  mode: 'text',
  notice: null,
});

const ACTION_VERB: Record<EditAction['kind'], string> = {
  format: 'format',
  minify: 'minify',
  sortKeys: 'sort keys',
  repair: 'repair',
};

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export default function JsonTool() {
  const [sides, setSides] = useState<Record<Side, SideState>>({
    left: initialSide(),
    right: initialSide(),
  });
  const refs = {
    left: useRef<JsonEditorViewHandle>(null),
    right: useRef<JsonEditorViewHandle>(null),
  };

  const patch = (side: Side, change: Partial<SideState>) =>
    setSides((s) => ({ ...s, [side]: { ...s[side], ...change } }));
  // The editor debounces onChange, so actions read its live content instead of the state.
  const liveText = (side: Side) => refs[side].current?.getText() ?? sides[side].text;

  const run = (side: Side, kind: EditAction['kind']) => {
    const action: EditAction =
      kind === 'format' || kind === 'sortKeys' ? { kind, indent: sides[side].indent } : { kind };
    const result = applyEdit(liveText(side), action);
    if (result.ok) patch(side, { text: result.text, notice: null });
    else
      patch(side, {
        notice: {
          kind: 'error',
          text: `Can't ${ACTION_VERB[kind]}: ${describeParseError(result.error)}`,
        },
      });
  };

  // Per-side actions; later tasks (compare, command palette) call these.
  const actions = {
    format: (side: Side) => run(side, 'format'),
    minify: (side: Side) => run(side, 'minify'),
    sortKeys: (side: Side) => run(side, 'sortKeys'),
    repair: (side: Side) => run(side, 'repair'),
    swap: () => {
      const left = liveText('left');
      const right = liveText('right');
      setSides((s) => ({
        left: { ...s.left, text: right },
        right: { ...s.right, text: left },
      }));
    },
    copy: (from: Side, to: Side) => patch(to, { text: liveText(from) }),
  };

  const copyToClipboardOf = async (side: Side) => {
    try {
      await copyToClipboard(liveText(side));
      patch(side, { notice: { kind: 'info', text: 'Copied to clipboard' } });
    } catch (err) {
      patch(side, { notice: { kind: 'error', text: messageOf(err) } });
    }
  };

  const leftNotice = sides.left.notice;
  const rightNotice = sides.right.notice;
  useEffect(() => {
    if (leftNotice?.kind !== 'info') return;
    const timer = setTimeout(() => patch('left', { notice: null }), 2000);
    return () => clearTimeout(timer);
  }, [leftNotice]);
  useEffect(() => {
    if (rightNotice?.kind !== 'info') return;
    const timer = setTimeout(() => patch('right', { notice: null }), 2000);
    return () => clearTimeout(timer);
  }, [rightNotice]);

  const pane = (side: Side) => (
    <EditorPane
      key={side}
      side={side}
      ref={refs[side]}
      text={sides[side].text}
      onTextChange={(text) => patch(side, { text })}
      indent={sides[side].indent}
      onIndentChange={(indent) => patch(side, { indent })}
      mode={sides[side].mode}
      onModeChange={(mode) => patch(side, { mode })}
      schemaOpen={sides[side].schemaOpen}
      onSchemaOpenChange={(schemaOpen) => patch(side, { schemaOpen })}
      schemaText={sides[side].schemaText}
      onSchemaTextChange={(schemaText) => patch(side, { schemaText })}
      notice={sides[side].notice}
      onNotice={(notice) => patch(side, { notice })}
      onRun={(kind) => run(side, kind)}
      onCopy={() => void copyToClipboardOf(side)}
      getText={() => liveText(side)}
    />
  );

  return (
    <div className="json-tool">
      {pane('left')}
      <MiddleMenu onSwap={actions.swap} onCopy={actions.copy} />
      {pane('right')}
    </div>
  );
}
