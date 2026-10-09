# hamilchin.github.io

Source for [hamilchin.github.io](https://hamilchin.github.io).

## The home page

The home page is a column of text over a field of cellular automata that draw themselves when you click. Its words live in [`about.md`](about.md): edit that file and the page picks it up, with no build step. The note at the top of the file lists the little Markdown it understands. The portrait drawings are in [`images/`](images/).

The arrow in the top-left corner opens the automata playground over the whole page; pressing it again (or Escape) brings the page back.

## Automata

[`/automata/`](automata/) is a playground for cellular automata: Life-like rules, elementary (one-dimensional) rules, Langton's ants and turmites, Turing machines that share one tape (each click starts another, with a random table), a test mode of random one-dimensional automata, and an interesting mode drawing from a catalog of chosen ones. In test and interesting modes, a click starts an automaton and a drag draws a line of random cells for one to grow from. Rules are edited visually, every rule shows its one-change neighbors, and runs can be shared as links.

## Previewing

Everything is plain HTML, CSS and JavaScript modules with no build step, so GitHub Pages serves it as it is. To preview it locally, serve the repository root, because browsers won't load modules from `file://`:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000/> for the home page, or <http://localhost:8000/automata/> for the playground on its own.

The fonts (IBM Plex Sans, IBM Plex Mono and Newsreader) are self-hosted under the SIL Open Font License; the licenses are in [`fonts/`](fonts/).
