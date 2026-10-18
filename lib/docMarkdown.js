// lib/docMarkdown.js
//
// Converting docs between the editor's HTML (the Visual and HTML tabs) and
// markdown (the Markdown tab, and the content_md copy saved with each doc).
// Used by pages/docs.js and by the docs API (pages/api/docs/[slug].js), so
// both convert the same way.
//
// Tables: markdown tables are the "pipe" kind:
//
//   | Heading | Heading |
//   | --- | --- |
//   | cell | cell |
//
// Before this file existed, both directions dropped tables: a table became
// run-together text, so opening and saving a doc quietly lost its tables.
// Now tables survive every switch between tabs and every save. Inside a
// cell, a line break is written as <br> and a | is written as \|.

// ---------------------------------------------------------------------------
// Small helpers

// Merge adjacent identical inline tags first: <strong>A</strong><strong>B</strong>
// would otherwise become "**A****B**", which no markdown reader can split
// back apart (this corrupted real docs before). Repeated until nothing
// changes, since 3+ adjacent spans can occur.
const mergeAdjacentInline = (html) => {
  let md = html;
  ['strong', 'b', 'em', 'i'].forEach(tag => {
    let prev;
    do {
      prev = md;
      md = md.replace(new RegExp(`</${tag}>\\s*<${tag}[^>]*>`, 'gi'), '');
    } while (prev !== md);
  });
  return md;
};

// Bold, italic and links, HTML -> markdown.
const inlineHtmlToMd = (html) => html
  .replace(/<(b|strong)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
  .replace(/<(i|em)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
  .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

// Bold, italic, links and code, markdown -> HTML. [\s\S] rather than '.' so
// a bold span whose ** markers landed on different lines (left over from
// older lossy conversions) still pairs up.
const inlineMdToHtml = (md) => md
  .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*([\s\S]+?)\*/g, '<em>$1</em>')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>');

// ---------------------------------------------------------------------------
// Tables, HTML -> markdown

// One cell's contents as a single line of markdown.
const cellHtmlToMd = (html) => {
  let md = mergeAdjacentInline(html)
    .replace(/\s+/g, ' ')
    // Paragraphs and list items inside a cell become line breaks.
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '<br>- $1')
    .replace(/<\/?[uo]l[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '@@BR@@');
  md = inlineHtmlToMd(md)
    .replace(/<[^>]+>/g, '')
    .replace(/\|/g, '\\|')
    .replace(/@@BR@@/g, '<br>')
    .replace(/\s+/g, ' ')
    .trim()
    // No stray line breaks at the start or end of a cell.
    .replace(/^(?:<br>\s*)+|(?:\s*<br>)+$/g, '')
    .trim();
  return md;
};

const tableHtmlToMd = (tableHtml) => {
  const rows = [];
  let headerFound = false;
  const rowMatches = tableHtml.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  rowMatches.forEach((rowHtml, index) => {
    const cells = [];
    let rowIsHeader = false;
    const cellRe = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = cellRe.exec(rowHtml)) !== null) {
      if (m[1].toLowerCase() === 'th') rowIsHeader = true;
      cells.push(cellHtmlToMd(m[2]));
    }
    if (index === 0 && rowIsHeader) headerFound = true;
    rows.push(cells);
  });
  if (rows.length === 0) return '';

  const width = Math.max(1, ...rows.map(r => r.length));
  // Markdown tables always have a heading row. If the HTML had none, an
  // empty one is added rather than promoting the first row of data.
  if (!headerFound) rows.unshift(new Array(width).fill(''));
  const line = (cells) => {
    const padded = [...cells];
    while (padded.length < width) padded.push('');
    return `| ${padded.join(' | ')} |`;
  };
  const out = [line(rows[0]), `| ${new Array(width).fill('---').join(' | ')} |`];
  rows.slice(1).forEach(r => out.push(line(r)));
  return out.join('\n');
};

// ---------------------------------------------------------------------------
// Tables, markdown -> HTML

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

export const isTableLine = (line) => /^\s*\|/.test(line || '');
export const isTableSeparator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line || '') && (line || '').includes('-');

const cellMdToHtml = (md) => inlineMdToHtml(md.replace(/\\\|/g, '|'));

const tableMdToHtml = (lines) => {
  const header = splitTableRow(lines[0]);
  const body = lines.slice(2).map(splitTableRow);
  const width = Math.max(header.length, ...body.map(r => r.length));
  const pad = (cells) => { const p = [...cells]; while (p.length < width) p.push(''); return p; };
  const headerIsEmpty = header.every(c => c === '');
  let html = '<table>';
  if (!headerIsEmpty) html += `<thead><tr>${pad(header).map(c => `<th>${cellMdToHtml(c)}</th>`).join('')}</tr></thead>`;
  html += `<tbody>${body.map(r => `<tr>${pad(r).map(c => `<td>${cellMdToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return html + '</table>';
};

// Find each table (a | line, followed by a separator line, followed by any
// further | lines) and swap it for a placeholder, so the paragraph and line
// break handling never touches it. Returns the text and the tables found.
const extractMdTables = (md, toHtml) => {
  const lines = md.split('\n');
  const out = [];
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    if (isTableLine(lines[i]) && isTableSeparator(lines[i + 1] || '') && isTableLine(lines[i + 1] || '')) {
      const block = [lines[i], lines[i + 1]];
      let j = i + 2;
      while (j < lines.length && isTableLine(lines[j])) { block.push(lines[j]); j++; }
      out.push('', `@@TABLE${tables.length}@@`, '');
      tables.push(toHtml(block));
      i = j - 1;
    } else {
      out.push(lines[i]);
    }
  }
  // Exactly one blank line either side of each table.
  const text = out.join('\n').replace(/\n+(@@TABLE\d+@@)\n+/g, '\n\n$1\n\n');
  return { text, tables };
};

// ---------------------------------------------------------------------------
// Public converters

// Clean up messy HTML (strip inline styles, normalize tags). Empty table
// cells are kept: removing them would shift the columns of that row.
export const cleanHtml = (html) => {
  if (!html) return '';
  let out = html.replace(/\s*style="[^"]*"/gi, '');
  let prev;
  do {
    prev = out;
    out = out.replace(/<(\w+)[^>]*>\s*<\/\1>/gi, (match, tag) => (/^(td|th|tr|thead|tbody|table)$/i.test(tag) ? match : ''));
  } while (prev !== out);
  return out
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '<br>')
    .trim();
};

// HTML -> markdown.
export const htmlToMarkdown = (html) => {
  if (!html) return '';
  // Tables first, into placeholders, so nothing below flattens them.
  const tables = [];
  let md = html.replace(/<table[^>]*>[\s\S]*?<\/table>/gi, (t) => {
    tables.push(tableHtmlToMd(t));
    return `\n\n@@TABLE${tables.length - 1}@@\n\n`;
  });

  md = mergeAdjacentInline(md)
    // Headers
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
  md = md
    .replace(/<(b|strong)[^>]*>(.*?)<\/\1>/gi, '**$2**')
    .replace(/<(i|em)[^>]*>(.*?)<\/\1>/gi, '*$2*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    // Line breaks and paragraphs
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    // Lists
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?[uo]l[^>]*>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return md.replace(/@@TABLE(\d+)@@/g, (m, n) => tables[Number(n)] || '');
};

// Markdown -> HTML.
export const markdownToHtml = (md) => {
  if (!md) return '';
  const extracted = extractMdTables(md, tableMdToHtml);

  let html = inlineMdToHtml(extracted.text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>'));

  // Group consecutive list-item lines into ONE <ul> each, before the
  // paragraph/<br> conversion below, so each item doesn't end up in its own
  // single-item list. Blank lines between items are tolerated.
  html = html.replace(/^\s*[-*]\s+(.+)$/gm, '@@LI@@$1@@/LI@@');
  html = html.replace(/(?:@@LI@@[\s\S]*?@@\/LI@@\s*\n?)+/g, (block) => {
    const items = [...block.matchAll(/@@LI@@([\s\S]*?)@@\/LI@@/g)].map(m => `<li>${m[1]}</li>`);
    return `<ul>${items.join('')}</ul>`;
  });

  html = html
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><\/p>/g, '').replace(/<p><br><\/p>/g, '');
  // A <ul> shouldn't sit inside a stray <p>, or touch a dangling <br>.
  html = html.replace(/<p>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<\/p>/g, '</ul>');
  html = html.replace(/<br>\s*<ul>/g, '<ul>').replace(/<\/ul>\s*<br>/g, '</ul>');
  // No stray <p> around headers.
  html = html.replace(/<p>\s*(<h[123]>)/g, '$1').replace(/(<\/h[123]>)\s*<\/p>/g, '$1');

  // Put the tables back, without a <p> or <br> around them.
  html = html.replace(/(?:<p>|<br>)*\s*@@TABLE(\d+)@@\s*(?:<\/p>|<br>)*/g, (m, n) => extracted.tables[Number(n)] || '');
  html = html.replace(/<p><\/p>/g, '');
  return html;
};

// Does this markdown / HTML contain a table?
export const mdHasTable = (md) => {
  const lines = (md || '').split('\n');
  return lines.some((l, i) => isTableLine(l) && isTableSeparator(lines[i + 1] || '') && isTableLine(lines[i + 1] || ''));
};
export const htmlHasTable = (html) => /<table[\s>]/i.test(html || '');

// Which saved copy to load a doc from. The markdown copy is preferred, as
// before, except when it has lost tables that the HTML copy still has (the
// old converters flattened them). Then the HTML copy is used, so opening
// and saving the doc brings the tables back instead of losing them.
export const docSource = (doc) => {
  const md = doc?.content_md || '';
  const html = doc?.content || '';
  if (md && !(htmlHasTable(html) && !mdHasTable(md))) return { kind: 'md', md };
  return { kind: 'html', html };
};

// Does this pasted plain text contain a markdown table?
export const textHasMdTable = (text) => mdHasTable((text || '').replace(/\r\n?/g, '\n'));
