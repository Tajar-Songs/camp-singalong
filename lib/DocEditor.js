// lib/DocEditor.js
//
// The docs editor, built on TipTap (an open-source editor). It replaces the
// old one, which used the browser's built-in editing and converted between
// HTML and markdown with simple pattern matching. That conversion is what
// damaged docs: lost tables, stray bold or italic paragraphs, missing bullets.
//
// This editor works on HTML only, and only allows the formatting docs use:
// headings, bold, italic, underline, strikethrough, inline code, bullet and
// numbered lists (nested), links, quotes, dividers and tables. Anything else
// that comes in with a paste (font sizes, colors, odd wrappers) is dropped,
// so pasted text takes on the doc's own styles.
//
// Pasting from an AI collaborator:
//   - Formatted text (copied from a chat) keeps its headings, lists, bold
//     and tables.
//   - Plain text that looks like markdown (#, -, 1., |, **) is converted.
//   - "Paste as markdown" converts whatever is on the clipboard as markdown,
//     for when it came from somewhere that copies it as plain code.
//
// Props:
//   initialHtml  the doc's HTML when the editor opens. To load different
//                content, give the editor a new key so it starts fresh.
//   onChange     called with the doc's HTML after every change.
//   editable     false shows the content without allowing changes.
//   onMessage    shows a short message (for example, when the clipboard
//                can't be read).

import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { markdownToHtml, looksLikeMarkdown } from './docMarkdown';

const ADMIN_GREEN = '#3B9B73';

// Formatted HTML from a code editor or similar has no real structure (just
// styled spans); treat that like plain text.
const hasStructure = (html) => /<(p|h[1-6]|ul|ol|li|table|strong|b|em|i|blockquote|pre)[\s>]/i.test(html || '');

export default function DocEditor({ initialHtml, onChange, editable = true, onMessage }) {
  const editorRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: null } }),
      Placeholder.configure({ placeholder: 'Start writing, or paste from anywhere…' }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell
    ],
    content: initialHtml || '',
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'doc-content doc-editor-area', spellcheck: 'true' },
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        if (!data) return false;
        const html = data.getData('text/html');
        const text = data.getData('text/plain');
        if (hasStructure(html)) return false;          // formatted paste: let the editor handle it
        if (!looksLikeMarkdown(text)) return false;    // ordinary text
        event.preventDefault();
        editorRef.current?.chain().focus().insertContent(markdownToHtml(text)).run();
        return true;
      }
    },
    onUpdate: ({ editor: e }) => { if (onChange) onChange(e.getHTML()); }
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);
  useEffect(() => { if (editor) editor.setEditable(editable); }, [editor, editable]);

  if (!editor) return <div className="doc-editor-shell"><div className="doc-editor-loading">Loading the editor…</div></div>;

  const run = (fn) => () => fn(editor.chain().focus()).run();
  const inTable = editor.isActive('table');

  const setLink = () => {
    const current = editor.getAttributes('link').href || '';
    const url = window.prompt('Link address (leave empty to remove the link):', current);
    if (url === null) return;
    if (url.trim() === '') { editor.chain().focus().extendMarkRange('link').unsetLink().run(); return; }
    const href = /^(https?:|mailto:|\/|#)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor.chain().focus().insertContent(`<a href="${href.replace(/"/g, '&quot;')}">${href}</a>`).run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
  };

  const pasteMarkdown = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { onMessage?.('The clipboard is empty.'); return; }
      editor.chain().focus().insertContent(markdownToHtml(text)).run();
    } catch (error) {
      onMessage?.('The browser didn\'t allow reading the clipboard. Try pasting normally (Cmd+V) instead.');
    }
  };

  const blockValue = editor.isActive('heading', { level: 1 }) ? 'h1'
    : editor.isActive('heading', { level: 2 }) ? 'h2'
      : editor.isActive('heading', { level: 3 }) ? 'h3'
        : editor.isActive('heading', { level: 4 }) ? 'h4' : 'p';

  const setBlock = (value) => {
    const chain = editor.chain().focus();
    if (value === 'p') chain.setParagraph().run();
    else chain.setHeading({ level: Number(value[1]) }).run();
  };

  const Btn = ({ icon, label, title, onClick, active = false, disabled = false }) => (
    <button type="button" title={title} aria-label={title} aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled || !editable}
      className={`doc-tool${active ? ' is-active' : ''}`}>
      {icon && <i className={`ti ${icon}`} aria-hidden="true"></i>}{label && <span>{label}</span>}
    </button>
  );
  const Sep = () => <span className="doc-tool-sep" aria-hidden="true"></span>;

  return (
    <div className="doc-editor-shell">
      <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
        <select className="doc-block-select" value={blockValue} onChange={(e) => setBlock(e.target.value)} disabled={!editable} aria-label="Text style">
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>
        <Sep />
        <Btn icon="ti-bold" title="Bold (Cmd+B)" active={editor.isActive('bold')} onClick={run(c => c.toggleBold())} />
        <Btn icon="ti-italic" title="Italic (Cmd+I)" active={editor.isActive('italic')} onClick={run(c => c.toggleItalic())} />
        <Btn icon="ti-underline" title="Underline (Cmd+U)" active={editor.isActive('underline')} onClick={run(c => c.toggleUnderline())} />
        <Btn icon="ti-strikethrough" title="Strikethrough" active={editor.isActive('strike')} onClick={run(c => c.toggleStrike())} />
        <Btn icon="ti-code" title="Code" active={editor.isActive('code')} onClick={run(c => c.toggleCode())} />
        <Sep />
        <Btn icon="ti-list" title="Bulleted list" active={editor.isActive('bulletList')} onClick={run(c => c.toggleBulletList())} />
        <Btn icon="ti-list-numbers" title="Numbered list" active={editor.isActive('orderedList')} onClick={run(c => c.toggleOrderedList())} />
        <Btn icon="ti-indent-increase" title="Indent list item (Tab)" disabled={!editor.can().sinkListItem('listItem')} onClick={run(c => c.sinkListItem('listItem'))} />
        <Btn icon="ti-indent-decrease" title="Outdent list item (Shift+Tab)" disabled={!editor.can().liftListItem('listItem')} onClick={run(c => c.liftListItem('listItem'))} />
        <Sep />
        <Btn icon="ti-link" title="Add or change a link" active={editor.isActive('link')} onClick={setLink} />
        <Btn icon="ti-quote" title="Quote" active={editor.isActive('blockquote')} onClick={run(c => c.toggleBlockquote())} />
        <Btn icon="ti-minus" title="Divider line" onClick={run(c => c.setHorizontalRule())} />
        <Sep />
        <Btn icon="ti-table-plus" label="Table" title="Insert a table" disabled={inTable} onClick={run(c => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }))} />
        {inTable && (
          <>
            <Btn icon="ti-row-insert-bottom" title="Add a row below" onClick={run(c => c.addRowAfter())} />
            <Btn icon="ti-column-insert-right" title="Add a column to the right" onClick={run(c => c.addColumnAfter())} />
            <Btn icon="ti-row-remove" title="Delete this row" onClick={run(c => c.deleteRow())} />
            <Btn icon="ti-column-remove" title="Delete this column" onClick={run(c => c.deleteColumn())} />
            <Btn icon="ti-table-row" label="Heading row" title="Turn the heading row on or off" onClick={run(c => c.toggleHeaderRow())} />
            <Btn icon="ti-table-minus" title="Delete this table" onClick={() => { if (window.confirm('Delete this whole table?')) editor.chain().focus().deleteTable().run(); }} />
          </>
        )}
        <Sep />
        <Btn icon="ti-clear-formatting" label="Clear" title="Clear formatting: makes the selected text plain (select all with Cmd+A to clear the whole doc)" onClick={run(c => c.unsetAllMarks().clearNodes())} />
        <Btn icon="ti-markdown" label="Paste as markdown" title="Paste what's on the clipboard, reading it as markdown" onClick={pasteMarkdown} />
        <Sep />
        <Btn icon="ti-arrow-back-up" title="Undo (Cmd+Z)" disabled={!editor.can().undo()} onClick={run(c => c.undo())} />
        <Btn icon="ti-arrow-forward-up" title="Redo (Cmd+Shift+Z)" disabled={!editor.can().redo()} onClick={run(c => c.redo())} />
      </div>
      <EditorContent editor={editor} />
      <style jsx global>{`
        .doc-editor-shell { border: 1px solid #334155; border-radius: 0.5rem; background: #0f172a; max-height: 70vh; overflow-y: auto; }
        .doc-editor-loading { padding: 1rem; color: #838C95; }
        .doc-toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap; align-items: center; gap: 0.2rem; padding: 0.5rem; background: #1e293b; border-bottom: 1px solid #334155; border-top-left-radius: 0.5rem; border-top-right-radius: 0.5rem; }
        .doc-tool { display: inline-flex; align-items: center; gap: 0.25rem; padding: 0.35rem 0.5rem; background: #334155; border: 1px solid transparent; border-radius: 0.25rem; color: #fff; cursor: pointer; font-size: 0.85rem; line-height: 1; }
        .doc-tool:hover:not(:disabled) { background: #475569; }
        .doc-tool.is-active { background: ${ADMIN_GREEN}33; border-color: ${ADMIN_GREEN}; color: #fff; }
        .doc-tool:disabled { opacity: 0.4; cursor: default; }
        .doc-tool i { font-size: 1rem; }
        .doc-tool-sep { width: 1px; align-self: stretch; background: #838C95; margin: 0 0.2rem; opacity: 0.6; }
        .doc-block-select { padding: 0.35rem 0.5rem; background: #334155; color: #fff; border: 1px solid #475569; border-radius: 0.25rem; font-size: 0.85rem; }
        .doc-editor-area { min-height: 400px; padding: 1rem 1.25rem; outline: none; line-height: 1.7; }
        .doc-editor-area p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #838C95; float: left; height: 0; pointer-events: none; }
        .doc-editor-area .selectedCell { background: ${ADMIN_GREEN}26; }
        .doc-editor-area table p, .doc-content td p, .doc-content th p { margin: 0; }
        .doc-editor-area a { cursor: text; }
      `}</style>
    </div>
  );
}
