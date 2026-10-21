// lib/docMarkdown.js
//
// Converting docs between HTML and markdown. Used by the docs page
// (pages/docs.js), the docs editor (lib/DocEditor.js) and the docs API
// (pages/api/docs/[slug].js).
//
// The HTML copy of a doc (docs.content) is the real one. The editor works
// on HTML only, and the markdown copy (docs.content_md) is made from it
// each time a doc is saved, for the API and for comparing versions. Nothing
// is converted back and forth while someone edits, which is what used to
// damage docs (lost tables, stray bold, missing bullets).
//
//   htmlToMarkdown  HTML -> markdown. Reads the HTML as a tree, so nested
//                   lists, tables, bold and links come out right, and
//                   messy older HTML (unclosed tags, stray wrappers) is
//                   tolerated.
//   markdownToHtml  markdown -> HTML, using the marked library (GitHub-style
//                   markdown, including tables). Used when someone pastes
//                   markdown into the editor, and to show version comparisons.

import { marked } from 'marked';

// ---------------------------------------------------------------------------
// Reading HTML into a simple tree

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'wbr', 'source', 'area', 'base']);
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'blockquote', 'pre', 'hr', 'figure', 'figcaption', 'colgroup', 'caption']);

const parseHtml = (html) => {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const tokenRe = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    const token = m[0];
    if (token.startsWith('<!--')) continue;
    if (!m[1]) {
      top().children.push({ text: token });
      continue;
    }
    const tag = m[1].toLowerCase();
    if (token.startsWith('</')) {
      // Close the nearest matching open tag; ignore a stray closing tag.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    const hrefMatch = m[2].match(/href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i);
    const node = { tag, children: [], href: hrefMatch ? (hrefMatch[1] ?? hrefMatch[2]) : null };
    // A new block closes an open paragraph (browsers do the same).
    if (BLOCK_TAGS.has(tag) && tag !== 'li' && top().tag === 'p') stack.pop();
    if (tag === 'li') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === 'li') { stack.length = i; break; }
        if (stack[i].tag === 'ul' || stack[i].tag === 'ol') break;
      }
    }
    if ((tag === 'td' || tag === 'th')) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === 'td' || stack[i].tag === 'th') { stack.length = i; break; }
        if (stack[i].tag === 'tr' || stack[i].tag === 'table') break;
      }
    }
    if (tag === 'tr') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === 'tr') { stack.length = i; break; }
        if (stack[i].tag === 'table') break;
      }
    }
    top().children.push(node);
    if (!VOID_TAGS.has(tag) && !token.endsWith('/>')) stack.push(node);
  }
  return root;
};

// ---------------------------------------------------------------------------
// Inline content -> markdown

const decodeSpaces = (text) => text.replace(/&nbsp;/g, ' ').replace(/ /g, ' ');

// Put markers around text, keeping spaces outside them ("** x**" isn't bold).
const wrap = (inner, marker) => {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!m[2]) return inner;
  return `${m[1]}${marker}${m[2]}${marker}${m[3]}`;
};

const inlineMd = (nodes, ctx = {}) => nodes.map(n => {
  if (n.text !== undefined) return decodeSpaces(n.text).replace(/\s+/g, ' ');
  switch (n.tag) {
    case 'br': return ctx.inCell ? '<br>' : '\n';
    case 'strong': case 'b':
      return ctx.bold ? inlineMd(n.children, ctx) : wrap(inlineMd(n.children, { ...ctx, bold: true }), '**');
    case 'em': case 'i':
      return ctx.italic ? inlineMd(n.children, ctx) : wrap(inlineMd(n.children, { ...ctx, italic: true }), '*');
    case 's': case 'strike': case 'del':
      return wrap(inlineMd(n.children, ctx), '~~');
    case 'code': {
      const t = textOf(n);
      return t ? '`' + t + '`' : '';
    }
    case 'a': {
      const t = inlineMd(n.children, ctx);
      return n.href ? `[${t.trim() || n.href}](${n.href})` : t;
    }
    case 'img': return '';
    // A block inside inline content (a paragraph in a list item or cell):
    // keep its words, separated.
    case 'p': case 'div': case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const t = inlineMd(n.children, ctx).trim();
      return t ? (ctx.inCell ? `${t}<br>` : `${t}\n`) : '';
    }
    case 'ul': case 'ol':
      return ctx.inCell ? n.children.filter(c => c.tag === 'li').map(c => `- ${inlineMd(c.children, ctx).trim()}<br>`).join('') : '';
    default: return inlineMd(n.children, ctx);
  }
}).join('');

const textOf = (n) => (n.text !== undefined ? decodeSpaces(n.text) : n.children.map(textOf).join(''));

const tidyInline = (s) => s
  .split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n')
  .replace(/\n{2,}/g, '\n')
  .trim();

// ---------------------------------------------------------------------------
// Blocks -> markdown

const isBlock = (n) => n.text === undefined && BLOCK_TAGS.has(n.tag);

const listMd = (node, depth) => {
  const ordered = node.tag === 'ol';
  let index = 0;
  const lines = [];
  node.children.forEach(child => {
    if (child.text !== undefined) {
      if (child.text.trim()) lines.push(`${'  '.repeat(depth)}- ${child.text.trim()}`);
      return;
    }
    if (child.tag === 'ul' || child.tag === 'ol') { lines.push(listMd(child, depth + 1)); return; }
    if (child.tag !== 'li') {
      const t = tidyInline(inlineMd([child]));
      if (t) lines.push(`${'  '.repeat(depth)}- ${t}`);
      return;
    }
    index += 1;
    const nested = child.children.filter(c => c.tag === 'ul' || c.tag === 'ol');
    const own = child.children.filter(c => !(c.tag === 'ul' || c.tag === 'ol'));
    const text = tidyInline(inlineMd(own)).replace(/\n/g, ' ');
    const marker = ordered ? `${index}.` : '-';
    if (text || nested.length === 0) lines.push(`${'  '.repeat(depth)}${marker} ${text}`.trimEnd());
    nested.forEach(l => lines.push(listMd(l, depth + 1)));
  });
  return lines.filter(Boolean).join('\n');
};

const cellMd = (cell) => tidyInline(inlineMd(cell.children, { inCell: true }))
  .replace(/\n/g, '<br>')
  .replace(/\|/g, '\\|')
  .replace(/^(?:<br>\s*)+|(?:\s*<br>)+$/g, '')
  .trim();

const tableMd = (table) => {
  const rows = [];
  let headerFound = false;
  const walk = (n, inHead) => {
    n.children.forEach(c => {
      if (c.text !== undefined) return;
      if (c.tag === 'tr') {
        const cells = c.children.filter(x => x.tag === 'td' || x.tag === 'th');
        if (rows.length === 0 && (inHead || cells.some(x => x.tag === 'th'))) headerFound = true;
        rows.push(cells.map(cellMd));
      } else if (c.tag !== 'table') {
        walk(c, inHead || c.tag === 'thead');
      }
    });
  };
  walk(table, false);
  if (rows.length === 0) return '';
  const width = Math.max(1, ...rows.map(r => r.length));
  if (!headerFound) rows.unshift(new Array(width).fill(''));
  const line = (cells) => {
    const padded = [...cells];
    while (padded.length < width) padded.push('');
    return `| ${padded.join(' | ')} |`;
  };
  return [line(rows[0]), `| ${new Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
};

const blocksMd = (nodes) => {
  const out = [];
  let inlineRun = [];
  const flush = () => {
    const t = tidyInline(inlineMd(inlineRun));
    if (t) out.push(t);
    inlineRun = [];
  };
  nodes.forEach(n => {
    if (!isBlock(n)) { inlineRun.push(n); return; }
    flush();
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const t = tidyInline(inlineMd(n.children)).replace(/\n/g, ' ');
        if (t) out.push(`${'#'.repeat(Number(n.tag[1]))} ${t}`);
        break;
      }
      case 'p': {
        const t = tidyInline(inlineMd(n.children));
        if (t) out.push(t);
        break;
      }
      case 'ul': case 'ol': {
        const t = listMd(n, 0);
        if (t) out.push(t);
        break;
      }
      case 'table': {
        const t = tableMd(n);
        if (t) out.push(t);
        break;
      }
      case 'blockquote': {
        const t = blocksMd(n.children);
        if (t) out.push(t.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n'));
        break;
      }
      case 'pre': {
        out.push('```\n' + textOf(n).replace(/\n$/, '') + '\n```');
        break;
      }
      case 'hr': out.push('---'); break;
      default: {
        const t = blocksMd(n.children);
        if (t) out.push(t);
      }
    }
  });
  flush();
  return out.join('\n\n');
};

// ---------------------------------------------------------------------------
// Public converters

// HTML -> markdown.
export const htmlToMarkdown = (html) => {
  if (!html) return '';
  return blocksMd(parseHtml(html).children).replace(/\n{3,}/g, '\n\n').trim();
};

// Markdown -> HTML (GitHub-style, including tables; a single line break
// becomes a line break).
export const markdownToHtml = (md) => {
  if (!md) return '';
  return marked.parse(md.replace(/\r\n?/g, '\n'), { gfm: true, breaks: true, async: false });
};

// Clean up messy HTML (strip inline styles, normalize tags). Empty table
// cells are kept: removing them would shift that row's columns.
export const cleanHtml = (html) => {
  if (!html) return '';
  let out = html.replace(/\s*style="[^"]*"/gi, '');
  let prev;
  do {
    prev = out;
    out = out.replace(/<(\w+)[^>]*>\s*<\/\1>/gi, (match, tag) => (/^(td|th|tr|thead|tbody|table)$/i.test(tag) ? match : ''));
  } while (prev !== out);
  return out.replace(/\s+/g, ' ').replace(/<br\s*\/?>/gi, '<br>').trim();
};

// ---------------------------------------------------------------------------
// Tables in markdown (used to compare versions table row by table row)

export const isTableLine = (line) => /^\s*\|/.test(line || '');
export const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line || '') && (line || '').includes('-');

// Split a table line into cells, honouring \| as a literal pipe.
export const splitTableRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let current = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { current += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(current.trim()); current = ''; continue; }
    current += s[i];
  }
  cells.push(current.trim());
  return cells;
};

export const mdHasTable = (md) => {
  const lines = (md || '').split('\n');
  return lines.some((l, i) => isTableLine(l) && isTableSeparator(lines[i + 1] || '') && isTableLine(lines[i + 1] || ''));
};
export const htmlHasTable = (html) => /<table[\s>]/i.test(html || '');
export const countTables = (html) => ((html || '').match(/<table[\s>]/gi) || []).length;

// Which saved copy to load a doc from: the HTML copy whenever there is one
// (it's the real one), otherwise the markdown copy.
export const docSource = (doc) => {
  const html = doc?.content || '';
  if (html.trim()) return { kind: 'html', html };
  return { kind: 'md', md: doc?.content_md || '' };
};

// Does pasted plain text look like markdown (headings, lists, tables, bold)?
export const looksLikeMarkdown = (text) => {
  const t = (text || '').replace(/\r\n?/g, '\n');
  if (mdHasTable(t)) return true;
  const signals = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^>\s+\S/m,
    /\*\*[^*\n]+\*\*/,
    /\[[^\]\n]+\]\([^)\s]+\)/,
    /^```/m
  ];
  return signals.filter(re => re.test(t)).length >= 1 && t.includes('\n');
};
