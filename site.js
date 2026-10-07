// The home page's own script. Its words come from about.md, rendered here from the
// little Markdown they use, and its portrait comes apart a stroke at a time when
// pressed, vanishes, and draws itself back.

const root = document.documentElement;
const site = document.querySelector('.site');
const column = document.querySelector('.column');
const about = document.getElementById('about');

// The words sit over the world and take its clicks, so they can be selected. A plain
// click on them (not a link, a drop-down, or the end of a selection) still draws there.
about.addEventListener('click', (e) => {
  if (e.button !== 0 || e.target.closest('a, summary') || !getSelection().isCollapsed) return;
  globalThis.automata?.drawAt(e.clientX, e.clientY);
});

fetch('about.md')
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
  .then(async (md) => {
    about.innerHTML = render(md);
    // Measure in the real type, then open as many lists as fit.
    await document.fonts.ready;
    openWhatFits();
    fitPage();
  })
  .catch((err) => {
    console.warn('Could not read about.md', err);
    about.innerHTML = '<p>The rest of this page didn’t load. Reloading may help.</p>';
  })
  .finally(() => column.classList.add('ready'));

// The page fits the window exactly and doesn't scroll. Its lists are drop-downs, open
// as far as there is room; opening one closes others if it has to, and if even that
// isn't enough, the words get a little smaller. Only a very short window scrolls.
const MIN_ZOOM = 0.85;
const overflows = () => root.scrollHeight > innerHeight;

/** Opens the lists from the top for as long as the page still fits the window. */
function openWhatFits() {
  for (const group of about.querySelectorAll('details')) {
    group.open = true;
    if (overflows()) {
      group.open = false;
      break;
    }
  }
}

/** Shrinks the words just enough to fit, if they don't, and locks the page when they do. */
function fitPage() {
  column.style.zoom = '';
  const pad = getComputedStyle(site);
  const room = innerHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  const height = column.getBoundingClientRect().height;
  const zoom = height <= room ? 1 : Math.max(MIN_ZOOM, room / height);
  if (zoom < 1) column.style.zoom = zoom;
  root.classList.toggle('fits', height * zoom <= room + 1);
}

about.addEventListener(
  'toggle',
  (e) => {
    if (e.target.open) {
      // Opening a list closes others, the furthest down first, until the page fits again.
      column.style.zoom = '';
      for (const group of [...about.querySelectorAll('details[open]')].reverse()) {
        if (!overflows()) break;
        if (group !== e.target) group.open = false;
      }
    }
    fitPage();
  },
  true,
);
addEventListener('resize', fitPage);

/**
 * Headings, paragraphs, emphasis, links and lists, written the way people write
 * them: a list can follow the line that introduces it ("Currently, I'm:") with no
 * blank line between, and the two become a drop-down. A list of nothing but links
 * becomes the row of links, and what comes after a line of three dashes is set small.
 */
export function render(md) {
  const out = [];
  let aside = false;
  for (const block of md.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = block.split('\n').filter((line) => line.trim());
    if (!lines.length) continue;
    if (lines.length === 1 && /^ {0,3}([-*_])( *\1){2,} *$/.test(lines[0])) {
      aside = true;
      continue;
    }
    // Headings, runs of prose, and lists, in order.
    const parts = [];
    for (const line of lines) {
      const last = parts[parts.length - 1];
      const heading = line.match(/^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
      const item = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
      if (heading) parts.push({ kind: 'heading', level: heading[1].length, text: heading[2] });
      else if (item) {
        const ordered = /\d/.test(item[1]);
        if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[2].trim());
        else parts.push({ kind: 'list', ordered, items: [item[2].trim()] });
      } else if (last?.kind === 'list') last.items[last.items.length - 1] += ` ${line.trim()}`; // an item running onto the next line
      else if (last?.kind === 'prose') last.lines.push(line);
      else parts.push({ kind: 'prose', lines: [line] });
    }
    const set = aside ? ' class="aside"' : '';
    const list = (part) => {
      const tag = part.ordered ? 'ol' : 'ul';
      return `<${tag}${set}>${part.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`;
    };
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i], next = parts[i + 1];
      if (part.kind === 'heading') out.push(`<h${part.level}>${inline(part.text)}</h${part.level}>`);
      else if (part.kind === 'prose') {
        // Two spaces or a backslash at the end of a line break it there.
        const text = inline(part.lines.map((line, j) => (j < part.lines.length - 1 && /( {2,}|\\)$/.test(line) ? line.replace(/\\$/, '').trim() + '\n' : line.trim())).join(' ')).replace(/\n /g, '<br>');
        // A line introducing a list opens it.
        if (next?.kind === 'list') {
          out.push(`<details><summary>${text}</summary>${list(next)}</details>`);
          i++;
        } else out.push(`<p${set}>${text}</p>`);
      } else if (!part.ordered && part.items.every((item) => /^\[[^\]]+\]\([^)\s]+\)$/.test(item))) {
        out.push(`<nav class="elsewhere" aria-label="Elsewhere">${part.items.map(inline).join('\n')}</nav>`);
      } else out.push(list(part));
    }
  }
  return out.join('\n');
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Links keep their addresses as written; the words around and inside them get the typography. */
function inline(text) {
  let html = '', at = 0;
  for (const m of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    html += prose(text.slice(at, m.index)) + `<a href="${escape(m[2]).replace(/"/g, '&quot;')}">${prose(m[1])}</a>`;
    at = m.index + m[0].length;
  }
  return html + prose(text.slice(at));
}

/** Bold and italics, curly quotes and apostrophes, dashes and ellipses. */
function prose(s) {
  return escape(s)
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w*])([*_])(\S(?:.*?\S)?)\2(?![\w*])/g, '$1<em>$3</em>')
    .replace(/(\w)'/g, '$1’')
    .replace(/'/g, '‘')
    .replace(/(^|[\s([{—–])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\.\.\./g, '…');
}

// The portrait.
{
  const faces = [3, 4, 5, 6, 7, 0, 0, 7, 6, 5, 4, 3, 2, 1, 1, 2];
  const button = document.querySelector('.portrait'), img = button.querySelector('img');
  let at = 0;
  const preload = () => {
    for (let n = 1; n <= 7; n++) new Image().src = `images/face-${n}.png`;
  };
  button.addEventListener('pointerenter', preload, { once: true });
  button.addEventListener('focus', preload, { once: true });
  button.addEventListener('click', () => {
    at = (at + 1) % faces.length;
    button.classList.toggle('gone', !faces[at]);
    if (faces[at]) img.src = `images/face-${faces[at]}.png`;
  });
}
