// The instrument around the world: its canvases, the toolbar, the configs card,
// the counters and the dialogs. Pages that show the world (the app itself, and the
// home page it lies under) start from this one copy of it.

/** Puts the instrument at the start of the page. `home` links back to the home page, for the app on its own. */
export function mountShell({ home = true } = {}) {
  document.body.insertAdjacentHTML('afterbegin', SHELL(home ? HOME : ''));
}

const HOME = `
          <a class="link-row" href="../">Home</a>`;

const SHELL = (home) => `
<canvas id="gl" aria-hidden="true"></canvas>
<canvas id="overlay" role="img" aria-label="The world. Drag to draw on it."></canvas>
<div class="progress" id="progress" hidden><span></span></div>

<div class="toolbar card" role="toolbar" aria-label="Simulation">
  <button type="button" id="fold" class="btn btn-fold" aria-expanded="true" aria-controls="toolbar-body" aria-label="Hide the toolbar" title="Hide the toolbar"></button>
  <div class="toolbar-body" id="toolbar-body">
    <div class="types" role="radiogroup" aria-label="Kind of automaton">
      <button type="button" role="radio" data-mode="life" aria-checked="false" title="Life-like (1)">Life</button>
      <button type="button" role="radio" data-mode="eca" aria-checked="false" title="Elementary, one-dimensional (2)">1D</button>
      <button type="button" role="radio" data-mode="ant" aria-checked="true" title="Langton’s ant and turmites (3)">Ant</button>
      <button type="button" role="radio" data-mode="test" aria-checked="false" title="Click anywhere to start a random 1D automaton (4)">Test</button>
      <button type="button" role="radio" data-mode="turing" aria-checked="false" title="Turing machines on a 1D tape (5)">Turing</button>
      <button type="button" role="radio" data-mode="interesting" aria-checked="false" title="Click anywhere to start a 1D automaton chosen for being worth watching (6)">Interesting</button>
    </div>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" id="back" class="btn" data-icon="back" aria-label="Step back" title="Step back (←)"></button>
    <button type="button" id="play" class="btn" aria-pressed="false" aria-label="Play"></button>
    <button type="button" id="step" class="btn" data-icon="step" aria-label="Step forward" title="Step forward (→)"></button>
    <label class="speed" title="Speed ([ and ])">
      <span class="sr">Speed</span>
      <input id="speed" type="range" min="0" step="1" value="5">
      <output id="speed-out" for="speed" aria-hidden="true"></output>
    </label>
    <button type="button" id="undo" class="btn" data-icon="undo" aria-label="Undo" title="Undo (⌘Z)"></button>
    <span class="sep" aria-hidden="true"></span>
    <button type="button" id="reset" class="tool-text" title="Clear the world (R)">Reset</button>
    <button type="button" id="configs-toggle" class="tool-text" aria-expanded="false" aria-controls="configs" title="Configs (C)">Configs</button>
  </div>
</div>

<aside class="configs card" id="configs" aria-label="Configs">
  <div class="configs-body">
    <section class="test-panel test-only">
      <h2 class="group-title">Latest</h2>
      <div id="test-log" class="test-log"></div>
      <h2 class="group-title">Fade</h2>
      <div id="test-fade" class="rows"></div>
      <h2 class="group-title">Colors</h2>
      <div id="test-colors" class="rows"></div>
      <div id="test-palettes" class="palettes"></div>
    </section>

    <section class="rule">
      <div class="rule-row">
        <button type="button" id="rule-prev" class="btn eca-only" data-icon="left" aria-label="Previous rule"></button>
        <label class="rule-field">
          <input id="rule-text" spellcheck="false" autocomplete="off" autocapitalize="characters">
          <span class="rule-name" id="rule-name"></span>
        </label>
        <button type="button" id="rule-next" class="btn eca-only" data-icon="right" aria-label="Next rule"></button>
        <button type="button" id="dice" class="btn" data-icon="dice" aria-label="Random rule" title="Random rule (D)"></button>
        <button type="button" id="save" class="btn" data-icon="save" aria-label="Save to your library" title="Save to your library"></button>
      </div>
      <div id="rule-editor"></div>
    </section>

    <section class="more">
      <button type="button" class="disclosure" id="settings-toggle" aria-expanded="false" aria-controls="settings">Settings<span data-icon="down"></span></button>
      <div class="settings" id="settings" hidden>
        <section class="group colors-group">
          <h2 class="group-title">Colors <span class="group-meta" id="palette-custom" hidden>Custom</span></h2>
          <div id="swatches" class="swatches"></div>
          <div id="palettes" class="palettes"></div>
        </section>
        <section class="group">
          <h2 class="group-title">Display</h2>
          <div id="display" class="rows"></div>
        </section>
        <section class="group">
          <h2 class="group-title">World</h2>
          <div id="world" class="rows"></div>
        </section>
        <section class="group">
          <h2 class="group-title">Start</h2>
          <div id="start" class="rows"></div>
        </section>
        <section class="group links">
          <button type="button" id="share" class="link-row">Copy link</button>
          <button type="button" id="help" class="link-row">Shortcuts<kbd>?</kbd></button>${home}
        </section>
      </div>
    </section>

    <section class="browse" id="browse" hidden>
      <div class="browse-head">
        <div class="lists" role="tablist" aria-label="Rules to try">
          <button type="button" role="tab" data-list="nearby" aria-selected="true" aria-controls="thumbs" title="Rules one change away">Nearby</button>
          <button type="button" role="tab" data-list="yours" aria-selected="false" aria-controls="thumbs" title="What you have saved">Yours</button>
          <button type="button" role="tab" data-list="famous" aria-selected="false" aria-controls="thumbs" title="Famous rules">Famous</button>
        </div>
        <button type="button" id="shuffle" class="btn" data-icon="shuffle" aria-label="Other nearby rules" title="Other nearby rules"></button>
      </div>
      <div id="thumbs" class="thumbs" role="tabpanel"></div>
      <p class="empty" id="thumbs-empty" hidden>Nothing saved yet</p>
    </section>
  </div>
  <button type="button" class="tall-toggle" id="tall-toggle" aria-expanded="false" aria-controls="browse" aria-label="Nearby rules and the library" title="Nearby rules and the library"><span data-icon="down"></span></button>
</aside>

<div class="counters card" id="counters">
  <label class="count"><span id="gen-label">Step</span><input id="gen" inputmode="numeric" autocomplete="off" spellcheck="false" title="Type a number and press Enter to jump ahead"></label>
  <span class="count"><span id="pop-label">Alive</span><span id="pop">0</span></span>
  <span class="count" id="rate" hidden></span>
</div>

<div class="toasts" id="toasts" aria-live="polite"></div>

<dialog id="help-dialog" class="dialog" aria-labelledby="help-title">
  <header class="dialog-head">
    <h2 id="help-title">Shortcuts</h2>
    <form method="dialog"><button class="btn" data-icon="close" aria-label="Close"></button></form>
  </header>
  <dl class="shortcuts">
    <dt><kbd>Space</kbd></dt><dd>Play or pause</dd>
    <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Step back, forward (<kbd>⇧</kbd> for 100)</dd>
    <dt><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></dt><dd>Undo, redo</dd>
    <dt><kbd>R</kbd></dt><dd>Reset to a clean world</dd>
    <dt><kbd>N</kbd></dt><dd>New random start</dd>
    <dt><kbd>D</kbd></dt><dd>Random rule</dd>
    <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Slower, faster</dd>
    <dt><kbd>+</kbd> <kbd>−</kbd> <kbd>F</kbd></dt><dd>Zoom in, out, fit</dd>
    <dt><kbd>1</kbd> … <kbd>6</kbd></dt><dd>Life, 1D, Ant, Test, Turing, Interesting</dd>
    <dt><kbd>C</kbd></dt><dd>Configs</dd>
    <dt><kbd>G</kbd></dt><dd>Grid lines</dd>
    <dt>Drag</dt><dd>Draw. Starting on a filled cell erases.</dd>
    <dt><kbd>⇧</kbd> drag</dt><dd>Straight line</dd>
    <dt>Right drag</dt><dd>Move around (or <kbd>Space</kbd> drag)</dd>
    <dt>Scroll</dt><dd>Zoom</dd>
    <dt>Click</dt><dd>Ants: place one, or turn it. Turing: put the head there</dd>
    <dt>Right click</dt><dd>Ants: remove one</dd>
    <dt>Click, drag</dt><dd>Test, Interesting: start automata</dd>
  </dl>
</dialog>

<dialog id="link-dialog" class="dialog" aria-labelledby="link-title">
  <header class="dialog-head">
    <h2 id="link-title">Link</h2>
    <form method="dialog"><button class="btn" data-icon="close" aria-label="Close"></button></form>
  </header>
  <div class="link-copy"><input id="link-field" readonly aria-label="Link"><button type="button" id="link-copy" class="text-btn">Copy</button></div>
</dialog>
`;
