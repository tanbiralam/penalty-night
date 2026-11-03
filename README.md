# ⚽ Penalty Night

Five kicks each under the floodlights. Penalty Night is a small isometric pixel-art penalty shootout: you take a kick, then you go in goal, and the CPU takes its kick. Then you swap again until somebody cracks.

### ▶ [Play it in your browser](https://tanbiralam.github.io/penalty-night/)

It's plain JavaScript drawn by a tiny software renderer, so there's nothing to install and no build step.

---

## How a match goes

You and the CPU alternate kicks, and you always shoot first. It's best of five, and the shootout ends the moment one side can't catch up: 3-0 after three kicks each is game over. If it's level after five, it goes to sudden death, one kick each, until someone leads after both have kicked.

The header keeps score. Each side has five dots that fill **green** for a goal, **red** for a save or a miss, and stay **grey** for a kick not taken yet. When it's over, you get the final score and a kick-by-kick history, with a button to play again.

### Taking a kick

1. **Aim.** Place the marker anywhere in the goal. The goal is split into a 3 by 2 grid, and you can aim a little outside the frame if you want to live dangerously.
2. **Charge.** Hold the button to fill the power bar, and release in the green **sweet spot**.
   - Too soft, and the keeper has time to get across.
   - Too hard, and the ball drifts, usually over the bar.
   - In the sweet spot, the ball goes exactly where you aimed.
3. **Watch it fly.** It might hit the post or the bar, and that bounce is real collision with the frame, so it can go in or out.

### In goal

Watch the CPU's run-up. The kicker leans toward a side, mostly honestly, and pauses before the strike. Pick a dive direction and commit. You can go early, but a late dive covers less ground. If you only get your fingertips to it, the game slows down so you can enjoy it.

## Controls

**Keyboard**
- Arrow keys or WASD: aim, or pick a dive
- Space: hold to charge and release to shoot, or press to dive
- Esc: pause

**Mouse:** move to aim, hold the shoot button to charge, and click in the goal to dive.

**Touch:** drag to aim, hold the shoot button to charge, and tap in the goal to dive.

## Settings

All of these live in the footer and are remembered between visits. The match itself resets when you reload.

- **Stadium:** a street pitch at night, a beach at sunset, or a snowy park.
- **Difficulty:** Easy, Medium or Hard. It changes the keeper's reaction time, dive speed and how well it reads you. It never reads you perfectly, so a hard, well-placed shot always beats it. The CPU kicker gets sharper too.
- **Sound:** music, crowd and effects; crowd and effects only; or nothing. Browsers that block autoplay start the audio on your first click or keypress.

With reduced motion turned on in your system settings, the camera zoom, slow motion, net ripple, crowd jumps and callout animation are switched off.

## Under the hood

- **One rules module, no DOM.** [`dist/rules.js`](dist/rules.js) holds the ball flight (gravity, a little curve, bounces off the posts, bar and net), the keeper's hit area as it dives, and the shot result. That function takes the aim, power, accuracy and keeper dive and returns the outcome, and the same seed always gives the same result. It also holds the AI kicker and keeper and the shootout rules. The game replays the exact simulated flight, so what you see is what was decided.
- **Fair saves.** A goal counts only when the whole ball crosses the line between the posts and under the bar.
- **Sound written in code.** The ball strike, net swish, post clang, crowd cheer and groan, the crowd murmur and a soft 68 BPM music loop are all generated with the Web Audio API. There are no audio files.
- **Pixel art from a renderer.** The pitch, crowd, kits and net are drawn by an isometric software rasteriser with a depth buffer, cast shadows and colour ramps. There are no sprite sheets.

```
serve.mjs            static server for dist/
test/rules.test.js   tests for the rules module
dist/
  index.html · style.css
  rules.js           physics, keeper, AI, shootout: no DOM
  game.js            scene, kits, input, turn flow, interface
  audio.js           sound effects and crowd
  music.js           the music loop, built sample by sample
  stadiums.js        stadium palettes
  engine.js          Pixel Plays renderer (MIT)
```

## Running it

You only need [Node.js](https://nodejs.org/).

```sh
node serve.mjs        # then open http://127.0.0.1:5300
node --test           # run the rules tests
```

The tests cover:
- the shot outcome for every aim zone and power range
- keeper saves, fingertip saves and late dives
- goal detection against the posts and the bar
- early finishes, sudden death and the final result
- whole AI-vs-AI shootouts played start to finish

## Publishing to GitHub Pages

The site is served from the `gh-pages` branch, which holds the contents of `dist/`.

1. When you change a file, bump its `?v=` number where it's loaded (in `index.html` or in an `import` line), so browsers fetch the new version.
2. Push `main`, then publish `dist/`:

```sh
git push origin main
git subtree push --prefix dist origin gh-pages
```

## Credits

- Made by **Tanbir Alam**: [@iamtanbirr](https://x.com/iamtanbirr)
- Rendering by [Pixel Plays](https://github.com/amirmushichge/pixel-plays) by AmirMushich, used under the MIT license (see [`dist/LICENSE.pixel-plays`](dist/LICENSE.pixel-plays)). `engine.js` adds one small `resetScene()` helper so stadiums can be switched in place. No Pixel Plays music is used.
- Everything else (pitch, kits, game rules, physics, sound and music) was written for this project.
