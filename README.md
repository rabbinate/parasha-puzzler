# Parasha Puzzler

A tool for solving *Kiddush Times*' weekly parsha picture-puzzles: pick a parsha, a word count, and how many letters are in each word, and it surfaces every matching Hebrew phrase straight from the text — the same way the magazine's blank letter-boxes work.

**Live demo (single-file, offline-capable):** published as a Claude Artifact — ask for the current link, or open [`artifact.html`](./artifact.html) directly in a browser.

## How it works

Kiddush Times prints a whimsical AI-generated image hinting at a passuk in that week's parsha. Under the image sit rows of blank boxes grouped by word — one box per letter. This tool lets you plug in that word/letter-count pattern and search the parsha's actual text for every phrase that fits, so you can match it back to the picture.

## Two versions in this repo

- **`index.html` / `app.js` / `style.css` / `parshiot.js`** — a plain static site. Fetches the selected parsha's Hebrew text live from the [Sefaria API](https://www.sefaria.org/) each time you search. Run it with any static file server, e.g.:

  ```bash
  python3 -m http.server 8080
  ```

- **`artifact.html`** — a single self-contained file with all 54 parshiot's Hebrew text baked in (~1.5MB), so it works with zero network calls. This is the version published as a Claude Artifact.

Both share the same matching logic: cantillation marks are stripped from what's displayed, repeated matches are deduped with a "also appears N more times" dropdown, and maqaf-joined word pairs can optionally be split into two words via a checkbox.

## Credits

Torah text via [Sefaria](https://www.sefaria.org/). Puzzle format inspired by *Kiddush Times* magazine.
