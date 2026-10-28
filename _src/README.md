# How the profile animations are made

GitHub READMEs can't run JavaScript, so each animation is authored as a normal web page with GSAP
(and three.js for the banner's halftone cast), then rendered frame by frame with Playwright and
encoded to GIF with ffmpeg.

| Scene | File | Loop |
|---|---|---|
| Masthead banner | `banner.html` + `hero3d.js` | 7 s @ 20 fps |
| By the numbers | `stats.html` | 5 s @ 25 fps |
| To be continued | `tbc.html` | 4.4 s @ 20 fps |
| Project covers (static JPG) | `covers.html` | — |

Every scene exposes `window.SCENE = { duration, seek(t) }`. The renderer seeks the paused GSAP
timeline to each frame's exact time, and Playwright's fake clock steps three.js's render loop by one
frame, so the output is the same every run.

```bash
npm i                 # Playwright (uses your installed Chrome)
npm run serve &       # static server on :8777
npm run render        # or: node render.mjs banner
```

Needs ffmpeg on PATH. Edit the numbers in `stats.html` or the covers in `covers.html`, re-render, commit `../assets/`.
