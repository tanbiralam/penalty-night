# Penalty Night

A relaxed isometric pixel-art penalty shootout that runs in your browser. Pick your corner, find the sweet spot on the power bar, then go in goal and read the kicker's run-up.

**[Play it here](https://tanbiralam.github.io/penalty-night/)**

Built on [Pixel Plays](https://github.com/amirmushichge/pixel-plays)' isometric software renderer. There are no dependencies and no build step.

## Features

- **A real shootout:** best of five kicks each, alternating. It ends early as soon as one side can't catch up, and goes to sudden death if it's level after five.
- **Shot physics:** the ball flies with gravity and a little curve. It can hit the post or the crossbar and bounce in or out off the frame. A goal counts only when the whole ball crosses the line between the posts and under the bar.
- **A fair keeper:** the CPU keeper decides at the moment of the shot, after a reaction delay. It reads your aim better on harder levels but never perfectly, so a hard, well-placed shot is unsaveable.
- **Your turn in goal:** the CPU kicker leans toward a side during the run-up (usually honestly) and pauses before the strike. You can dive early. A late dive covers less ground, and a fingertip save gets a slow-motion moment.
- **3 stadiums:** a floodlit street pitch at night, a beach at sunset and a snowy park. Switch between them from the Stadium menu in the footer.
- **Difficulty:** Easy, Medium or Hard. It changes the keeper's reaction, dive speed and reading, and how precise the CPU kicker is.
- **Feedback:** GOAL / SAVED / WIDE / POST callouts, a net that ripples where the ball hits it, a gentle camera zoom on the kick and slow motion on saves and frame hits.
- **Kick tracker:** five dots per side in the header. They fill green for a goal, red for a save or miss, and grey for a kick not taken yet. At the end, a result screen shows every kick.
- **Sound made in code:** the strike, the net, the post clang, the crowd's cheer and groan, and a quiet crowd murmur are all generated with the Web Audio API. There are no audio files.
- **Remembers your settings:** your stadium, sound and difficulty choices are kept between visits. The match itself resets on reload.
- **Accessible motion:** with reduced motion turned on, the zoom, slow motion, net ripple and callout animation are switched off.

## Controls

| Action | Keyboard | Mouse | Touch |
| --- | --- | --- | --- |
| Aim your shot | Arrow keys or WASD | Move the mouse | Drag on the pitch |
| Shoot | Hold Space to charge, release to shoot | Hold the shoot button | Hold the shoot button |
| Pick a dive | Arrow keys or WASD, then Space | Click where you want to dive | Tap where you want to dive |
| Pause | Escape | | Tap the pause box to resume |

The green band on the power bar is the sweet spot. If you shoot with too little power, the keeper gets there. If you shoot with too much, the ball drifts, usually over the bar.

## Sound

Sound is on by default. Browsers that block autoplay start the audio on your first click or keypress. Use the Sound menu in the footer to turn off just the crowd ambience or all sound.

## Run locally

```sh
node serve.mjs
```

Then open http://127.0.0.1:5300.

The game logic, which covers shot outcomes, keeper saves, goal detection against the posts and bar, and the shootout rules, lives in `dist/rules.js`. It has no DOM code, and its tests run with:

```sh
node --test
```

## Deploy to GitHub Pages

GitHub Pages publishes the `gh-pages` branch. When you edit `dist/style.css`, `dist/engine.js` or `dist/game.js` (or a module it imports), bump that file's `?v=` version in `dist/index.html` (and in the `import` lines of `game.js`) so browsers fetch the new code. After committing your changes on `main`, deploy the contents of `dist` with:

```sh
git push origin main
git subtree push --prefix dist origin gh-pages
```

Then, in the repository settings under **Pages**, set the source to the `gh-pages` branch, root folder.

## Project layout

```
serve.mjs           tiny static server for dist/
test/rules.test.js  node --test suite for the rules
dist/
  index.html        page, menus and dialogs
  style.css
  engine.js         Pixel Plays renderer (MIT)
  rules.js          ball physics, keeper, AI and shootout rules: no DOM
  stadiums.js       stadium palettes
  audio.js          Web Audio sound
  game.js           scene, input, turn flow and interface
```

## Credits

- `dist/engine.js` comes from [Pixel Plays](https://github.com/amirmushichge/pixel-plays) by AmirMushich, under the MIT license in `dist/LICENSE.pixel-plays`. It has one small addition, `resetScene()`, so the scene can be rebuilt when you switch stadiums. No Pixel Plays music is used.
- All pitch, interface, game, physics and audio code was written for this project.
- Made by [Tanbir Alam](https://github.com/tanbiralam).
