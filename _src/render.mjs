// Renders the GSAP scenes to GIFs and the covers to JPGs.
// Usage (from this folder, with a static server on :8777 serving it):
//   node render.mjs            -> everything
//   node render.mjs banner     -> one scene
// Needs Playwright (Chrome channel) and ffmpeg on PATH.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8777/';
const OUT = path.resolve(import.meta.dirname, '../assets');
const TMP = path.resolve(import.meta.dirname, '.frames');
const SCENES = { banner: { w: 1200, h: 420, colors: 128, fps: 20 }, stats: { w: 1200, h: 300, colors: 96, fps: 25 }, tbc: { w: 1200, h: 220, colors: 48, fps: 20 } };
const only = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });

async function renderScene(name, { w, h, colors, fps: FPS }) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', e => console.log(`[${name}] pageerror`, e.message));
  await page.clock.install({ time: 0 });
  await page.goto(BASE + name + '.html', { waitUntil: 'load' });
  for (let i = 0; i < 200; i++) {
    await page.clock.runFor(50);
    if (await page.evaluate(() => !!window.SCENE)) break;
    await sleep(100);
  }
  await page.clock.runFor(600); // compile shaders, settle layout
  const dur = await page.evaluate(() => window.SCENE.duration);
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(dur * FPS);
  // GSAP is seeked to the exact frame time; the fake clock steps three.js's own loop by one frame
  for (let f = 0; f < n; f++) {
    await page.evaluate(t => { window.SCENE.seek(t); }, f / FPS);
    await page.clock.runFor(1000 / FPS);
    await page.screenshot({ path: path.join(dir, `f${String(f).padStart(4, '0')}.png`), clip: { x: 0, y: 0, width: w, height: h } });
  }
  await page.close();
  const gif = path.join(OUT, `${name}.gif`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.png'),
    '-vf', `split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=full:reserve_transparent=0[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
    '-loop', '0', gif]);
  console.log(`${name}.gif  ${n} frames  ${(fs.statSync(gif).size / 1e6).toFixed(2)} MB`);
}

async function renderCovers() {
  const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 1.5 });
  await page.goto(BASE + 'covers.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  for (const el of await page.$$('.cover')) {
    const id = (await el.getAttribute('id')).slice(2);
    const file = path.join(OUT, `cover-${id}.jpg`);
    await el.screenshot({ path: file, type: 'jpeg', quality: 84 });
    console.log(`cover-${id}.jpg  ${(fs.statSync(file).size / 1e3).toFixed(0)} KB`);
  }
  await page.close();
}

for (const [name, cfg] of Object.entries(SCENES)) if (!only.length || only.includes(name)) await renderScene(name, cfg);
if (!only.length || only.includes('covers')) await renderCovers();
await browser.close();
fs.rmSync(TMP, { recursive: true, force: true });
