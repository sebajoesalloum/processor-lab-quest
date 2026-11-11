/* Preserve the original Processor Lab engines and complete teaching UI.
   Only stylesheet selectors and the startup experience are adapted. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const reference = path.resolve(__dirname, '..');
const work = path.join(reference, '.quest-build');
fs.mkdirSync(work, { recursive: true });
const rootSelector = '#pq-legacy';
const read = file => fs.readFileSync(path.join(reference, file), 'utf8');
const build = read('build.js');
const template = read('processor-lab.template.html');
const originalBuilt = read('processor-lab.html');

const filesMatch = build.match(/const\s+files\s*=\s*(\[[\s\S]*?\]);/);
if (!filesMatch) throw new Error('The original build module list was not found');
const files = [...filesMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
if (files.length !== 15 || files.at(-1) !== 'src/main.js') {
  throw new Error('Unexpected module list; inspect the original build file before adapting it');
}

function stripModule(source) {
  return source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)/gm, '');
}

// Split selector lists without splitting commas in :is(), :not(), attributes,
// quoted attribute values, or other functional selectors.
function splitSelectors(text) {
  const parts = [];
  let start = 0, round = 0, square = 0, quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') round++;
    else if (c === ')') round--;
    else if (c === '[') square++;
    else if (c === ']') square--;
    else if (c === ',' && round === 0 && square === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function scopeSelector(raw) {
  const selector = raw.trim();
  if (!selector) return selector;
  if (selector === ':root' || selector === 'html' || selector === 'body') return rootSelector;
  // Preserve original experience selection, which uses document.body.dataset.lv,
  // and report-print mode, which uses document.body.classList.
  if (/^body(?:\[|\.)/.test(selector)) {
    const head = selector.match(/^(body[^\s>+~]*)\s*(.*)$/);
    if (!head) throw new Error('Could not scope body selector: ' + selector);
    return head[1] + ' ' + rootSelector + (head[2] ? ' ' + head[2] : '');
  }
  // Theme attributes remain attributes of the actual document root, while all
  // declarations apply only to the embedded legacy surface or its descendants.
  if (/^:root(?:\[|:)/.test(selector)) {
    const head = selector.match(/^(:root[^\s>+~]*)\s*(.*)$/);
    if (!head) throw new Error('Could not scope root selector: ' + selector);
    return head[1] + ' ' + rootSelector + (head[2] ? ' ' + head[2] : '');
  }
  if (/^body(?=::|:|\s)/.test(selector)) return selector.replace(/^body/, rootSelector);
  if (/^html(?=::|:|\s)/.test(selector)) return selector.replace(/^html/, rootSelector);
  return rootSelector + ' ' + selector;
}

// Balanced-brace scanner: comments, strings and parentheses are respected, and
// nested media/support rules are recursively scoped. Keyframe bodies and @page
// declarations are retained as authored rather than treated as selector lists.
function scopeCss(css) {
  let output = '', cursor = 0;
  while (cursor < css.length) {
    let headStart = cursor;
    while (cursor < css.length && /\s/.test(css[cursor])) cursor++;
    output += css.slice(headStart, cursor);
    if (cursor >= css.length) break;
    if (css.startsWith('/*', cursor)) {
      const end = css.indexOf('*/', cursor + 2);
      if (end < 0) throw new Error('Unclosed CSS comment');
      output += css.slice(cursor, end + 2);
      cursor = end + 2;
      continue;
    }
    headStart = cursor;
    let quote = null, round = 0, square = 0, delimiter = -1;
    for (; cursor < css.length; cursor++) {
      const c = css[cursor];
      if (quote) {
        if (c === '\\') cursor++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '(') round++;
      else if (c === ')') round--;
      else if (c === '[') square++;
      else if (c === ']') square--;
      else if ((c === '{' || c === ';') && round === 0 && square === 0) { delimiter = cursor; break; }
    }
    if (delimiter < 0) { output += css.slice(headStart); break; }
    if (css[delimiter] === ';') {
      output += css.slice(headStart, delimiter + 1);
      cursor = delimiter + 1;
      continue;
    }
    const header = css.slice(headStart, delimiter).trim();
    let depth = 1, end = delimiter + 1;
    quote = null;
    for (; end < css.length && depth; end++) {
      const c = css[end];
      if (quote) {
        if (c === '\\') end++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (css.startsWith('/*', end)) {
        const commentEnd = css.indexOf('*/', end + 2);
        if (commentEnd < 0) throw new Error('Unclosed CSS comment in rule');
        end = commentEnd + 1;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    if (depth) throw new Error('Unbalanced CSS rule: ' + header);
    const body = css.slice(delimiter + 1, end - 1);
    if (/^@(?:media|supports|container|layer|document)\b/i.test(header)) {
      output += header + '{' + scopeCss(body) + '}';
    } else if (header.startsWith('@')) {
      output += header + '{' + body + '}';
    } else {
      output += splitSelectors(header).map(scopeSelector).join(',') + '{' + body + '}';
    }
    cursor = end;
  }
  return output;
}

const cssMatch = template.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
const bodyMatch = template.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
const videoMatch = originalBuilt.match(/<script\b[^>]*id=["']intro-video-b64["'][^>]*>([\s\S]*?)<\/script>/i);
if (!cssMatch || !bodyMatch || !videoMatch) throw new Error('Original template or embedded intro is incomplete');
const introBase64 = videoMatch[1].trim();
if (!/^[A-Za-z0-9+/=\s]+$/.test(introBase64) || introBase64.length < 10000) {
  throw new Error('Original embedded video base64 was not found');
}
const shell = bodyMatch[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
const startup = "/* Presentation startup only: complete content, optional introduction. */\nsetLv('all');\ngo('over');\n$('#intro').style.display = 'none';\n";
const parts = files.map(file => {
  const source = file === 'src/main.js' ? startup : read(file);
  return '\n/* ===== ' + file + ' ===== */\n' + stripModule(source);
});
const bundled = parts.join('\n').replace(/<\/script/gi, '<\\/script');
const scopedCss = scopeCss(cssMatch[1]);
const legacy = '<style id="pq-legacy-styles">\n' + scopedCss + '\n</style>\n'
  + '<div id="pq-legacy" data-lv="all" hidden>\n' + shell
  + '\n<script id="intro-video-b64" type="text/plain"></script>\n</div>\n'
  + '<script id="pq-legacy-bundle">\n' + bundled + '\n</script>\n';

fs.writeFileSync(path.join(work, 'legacy-content.html'), legacy);
fs.writeFileSync(path.join(work, 'original-intro-base64.txt'), introBase64);
fs.writeFileSync(path.join(work, 'legacy-preservation-manifest.json'), JSON.stringify({
  source: 'Processor Lab 4.0 supplied archive',
  modules: files.map(file => ({ file, originalSha256: crypto.createHash('sha256').update(read(file)).digest('hex'), unchanged: file !== 'src/main.js' })),
  changes: ['Stylesheet selectors scoped to #pq-legacy', 'Startup shows all teaching detail and makes intro optional'],
  originalVideoBytes: Buffer.from(introBase64, 'base64').length,
  preservedSections: ['Overview','Processor Construction','OISC Lesson','Processor Models','Instruction Explorer','Execution Simulator','Cache Lab','Benchmarks','Program Sandbox','Compare & Reports','Professor Demo'],
}, null, 2));
console.log(JSON.stringify({legacyCharacters:legacy.length,modules:files.length,videoBytes:Buffer.from(introBase64,'base64').length,outputs:['.quest-build/legacy-content.html','.quest-build/original-intro-base64.txt','.quest-build/legacy-preservation-manifest.json']}));
