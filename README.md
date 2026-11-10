# tylerbanks.net

Tyler J. Banks's résumé site. Plain HTML, CSS and a little JavaScript, served by GitHub Pages
straight from `main`. There is no build step and no theme (`.nojekyll` turns Jekyll off).

## Where things are

| File | What it is |
|---|---|
| `index.html` | The résumé: experience, education, research, teaching, publications, skills |
| `projects/index.html` | Archive of older projects |
| `assets/site.css` | All styling; colours and fonts are variables at the top |
| `assets/neuron.js` | The Hodgkin-Huxley simulation behind the trace in the header |
| `assets/site.js` | Light/dark toggle and the current-section mark in the navigation |
| `assets/*.pdf` | The CV, papers and posters. Published links point here, so do not rename them |
| `projects/*/`, `teaching/`, `publications/`, `about/`, `pages/` | Redirects from the old site's addresses |

## Updating

- **New CV:** replace `assets/Tyler_Banks_CV_Latest.pdf` (same file name), then copy the changes
  into `index.html`. Each job, degree and paper is one `<article class="entry">` block; copy a
  neighbouring block and edit it.
- **New publication:** add an `<article class="entry pub">` block at the top of the right group
  in the Publications section.

## Preview

```
python3 -m http.server 8000
```

then open http://localhost:8000.

Fonts are Archivo and STIX Two Text, both under the SIL Open Font License (`assets/fonts/`).
