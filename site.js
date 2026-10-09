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

// Lists introduced by a line of their own are drop-downs, stacked, one open at a time.
// The others close in the same moment one opens (the stack shares a name, and a click
// closes them before its own opens), so there is never a frame with two lists open.
function closeOthers(group) {
  for (const other of group.parentElement.querySelectorAll(':scope > details[open]')) if (other !== group) other.open = false;
}
about.addEventListener('click', (e) => {
  const summary = e.target.closest('summary');
  if (summary && !summary.parentElement.open) closeOthers(summary.parentElement);
});
about.addEventListener('toggle', (e) => e.target.open && closeOthers(e.target), true);

/**
 * The stack keeps the height it has with its longest list open, so opening one moves
 * only the titles under it: the words above and the links below stay where they are.
 */
function holdStacks() {
  for (const stack of about.querySelectorAll('.stack')) {
    const groups = [...stack.children], open = groups.map((g) => g.open);
    stack.style.minHeight = '';
    let tallest = 0;
    for (const g of groups) {
      groups.forEach((other) => (other.open = other === g));
      tallest = Math.max(tallest, stack.getBoundingClientRect().height);
    }
    groups.forEach((g, i) => (g.open = open[i]));
    stack.style.minHeight = `${Math.ceil(tallest)}px`;
  }
}

fetch('about.md')
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
  .then(async (md) => {
    about.innerHTML = render(md);
    // Measure in the real type, italics included, though no italic shows until a list opens.
    await Promise.all(['400 1em Newsreader', 'italic 400 1em Newsreader', '400 1em "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
    holdStacks();
    fitPage();
  })
  .catch((err) => {
    console.warn('Could not read about.md', err);
    about.innerHTML = '<p>The rest of this page didn’t load. Reloading may help.</p>';
  })
  .finally(() => column.classList.add('ready'));

// While the page fits the window it doesn't scroll; on a screen too small for it, it does.
function fitPage() {
  root.classList.toggle('fits', root.scrollHeight <= innerHeight);
}

const refit = () => {
  holdStacks();
  fitPage();
};
addEventListener('resize', refit);
document.fonts.addEventListener('loadingdone', refit);

/**
 * Headings, paragraphs, emphasis, links and lists, written the way people write
 * them: a list can follow the line that introduces it ("Currently, I'm:") with no
 * blank line between, and lists introduced that way, one after another, become a
 * stack of drop-downs with the first one open. A list of nothing but links becomes
 * the row of links, and what comes after a line of three dashes is set small.
 */
export function render(md) {
  const out = [];
  let aside = false;
  let stack = null; // the drop-downs being gathered: [{ label, panel }]
  const closeStack = () => {
    if (!stack) return;
    const name = `stack-${out.length}`;
    out.push(`<div class="stack">${stack.map((t, i) => `<details name="${name}"${i === 0 ? ' open' : ''}><summary>${t.label}</summary>${t.panel}</details>`).join('')}</div>`);
    stack = null;
  };
  for (const block of md.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/)) {
    const lines = block.split('\n').filter((line) => line.trim());
    if (!lines.length) continue;
    if (lines.length === 1 && /^ {0,3}([-*_])( *\1){2,} *$/.test(lines[0])) {
      closeStack();
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
      if (part.kind === 'heading') {
        closeStack();
        out.push(`<h${part.level}>${inline(part.text)}</h${part.level}>`);
      } else if (part.kind === 'prose') {
        // Two spaces or a backslash at the end of a line break it there.
        const text = inline(part.lines.map((line, j) => (j < part.lines.length - 1 && /( {2,}|\\)$/.test(line) ? line.replace(/\\$/, '').trim() + '\n' : line.trim())).join(' ')).replace(/\n /g, '<br>');
        // A line introducing a list becomes a drop-down for it.
        if (next?.kind === 'list') {
          (stack ||= []).push({ label: text, panel: list(next) });
          i++;
          continue;
        }
        closeStack();
        out.push(`<p${set}>${text}</p>`);
      } else if (!part.ordered && part.items.every((item) => /^\[[^\]]+\]\([^)\s]+\)$/.test(item))) {
        closeStack();
        out.push(`<nav class="elsewhere" aria-label="Elsewhere">${part.items.map(inline).join('\n')}</nav>`);
      } else {
        closeStack();
        out.push(list(part));
      }
    }
  }
  closeStack();
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
  const faces = [1, 2, 3, 4, 5, 0, 0, 5, 4, 3, 2];
  const button = document.querySelector('.portrait'), img = button.querySelector('img');
  let at = 0;
  const preload = () => {
    for (let n = 1; n <= 5; n++) new Image().src = `images/face-${n}.png`;
  };
  button.addEventListener('pointerenter', preload, { once: true });
  button.addEventListener('focus', preload, { once: true });
  button.addEventListener('click', () => {
    at = (at + 1) % faces.length;
    button.classList.toggle('gone', !faces[at]);
    if (faces[at]) img.src = `images/face-${faces[at]}.png`;
  });
}
