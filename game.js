import {
	GOAL, BALL_R, KEEPER_X, SPOT, SWEET, AIM_MARGIN, ZONES, PLAYER_DIVE_TIME,
	zoneOf, keeperHitArea, keeperDive, playerDive, shotResult, aiKick,
	newShootout, recordKick, kickNumber, isSuddenDeath, shootoutResult, historyKind, goals, REGULATION,
} from './rules.js?v=1'
import { STADIUMS } from './stadiums.js?v=1'
import { createAudio } from './audio.js?v=1'

// World (rules.js) is metres with the goal line on x = 0. The engine draws in its own units: K per metre, shifted by X0.
const K = 1.3, X0 = 3.5
const E = (x, y, z = 0) => [(x - X0) * K, y * K, z * K]
const GOAL_EX = (0 - X0) * K

const CHARGE_TIME = 1.05 // seconds from empty to full power
const APPROACH = 0.5 // player's two steps to the ball
const RUNUP = 1.15 // CPU run-up before its pause
const DIVE_WINDOW = 0.28 // how long after the strike a dive still counts
const RESULT_TIME = 1.9

const PLAYER_KIT = { shirt: [212, 92, 50], stripe: [236, 136, 78], legs: [40, 40, 54], skin: [214, 160, 120], hair: [52, 38, 30] }
const CPU_KIT = { shirt: [62, 98, 172], stripe: [96, 134, 206], legs: [232, 232, 238], skin: [170, 118, 84], hair: [28, 24, 22] }
const PLAYER_KEEPER = { shirt: [66, 168, 96], shorts: [30, 40, 36], skin: [214, 160, 120], hair: [52, 38, 30], gloves: [246, 244, 236] }
const CPU_KEEPER = { shirt: [232, 196, 62], shorts: [40, 40, 50], skin: [170, 118, 84], hair: [28, 24, 22], gloves: [246, 244, 236] }
const BALL = [244, 244, 238], WHITE = [240, 240, 236]

const nodes = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]))
const store = {
	get(key, options, fallback) { try { const v = localStorage.getItem(`penalty-night:${key}`); return v in options ? v : fallback } catch { return fallback } },
	set(key, value) { try { localStorage.setItem(`penalty-night:${key}`, value) } catch {} },
}
let stadiumId = store.get('stadium', STADIUMS, 'street')
let stadium = STADIUMS[stadiumId]
const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
let difficulty = store.get('difficulty', DIFFICULTIES, 'medium')
const SOUND_MODES = { all: 'Sound on', effects: 'Crowd off', off: 'Sound off' }
const sound = createAudio()

const game = {
	match: newShootout(),
	phase: 'aim', phaseTime: 0, time: 0, paused: false,
	aim: { y: 1.6, z: 1.3 }, power: 0,
	keeper: { target: null, start: 0, diveTime: PLAYER_DIVE_TIME },
	shot: null, simT: 0, eventIndex: 0, kick: null, dive: { col: 0, row: 0 }, diveTime: null,
	ripple: null, held: new Set(),
}

// ── scene ────────────────────────────────────────────────────────────────

const fadesOut = (reach, ix, iy) => reach > 1.04 || (reach > 0.91 && hash(ix, iy) < (reach - 0.91) / 0.13)
const shade = (c, s) => rgb(c[0] + s, c[1] + s, c[2] + s)

function groundColor(ex, ey, ix, iy, index) {
	const x = ex / K + X0, y = ey / K
	const edge = Math.pow((Math.abs(ex - 0.6) / 14.6) ** 6 + (Math.abs(ey) / 12) ** 6, 1 / 6)
	if (fadesOut(edge + (noise(ex * 1.3, ey * 1.3) - 0.5) * 0.1, ix, iy)) return 0
	const grain = (hash(ix, iy) - 0.5) * 8 + (noise(ex * 1.2, ey * 1.2) - 0.5) * 6
	let light = 0
	if (stadium.floodlights) light = Math.max(0, 24 - Math.min(Math.hypot(x + 1.5, y - 8.5), Math.hypot(x + 1.5, y + 8.5), Math.hypot(x - 6, y)) * 2.4)
	if (x > -1.1) {
		kinds[index] = 1
		const band = Math.floor((x + 40) / 2.2) % 2
		let color = stadium.pitch[band]
		const ax = Math.abs(y), line = 0.07
		const goalLine = Math.abs(x) < line && ax < 13
		const sixYard = (Math.abs(x - 5.5) < line && ax < 9.16) || (Math.abs(ax - 9.16) < line && x > 0 && x < 5.5)
		const spot = Math.hypot(x - SPOT.x, y) < 0.16
		if (goalLine || sixYard || spot) color = stadium.line
		return shade(color, grain + light)
	}
	kinds[index] = 2
	const seam = stadium.seam && (Math.abs((x + 40) % 1.8) < 0.05 || Math.abs((y + 40) % 1.8) < 0.05)
	return shade(stadium.surround, grain + light * 0.6 - (seam ? stadium.seam : 0))
}

const bar = (a, b, r, color) => capsule(a, b, r, r, () => color, 'solid')

function drawFrame() {
	const py = GOAL.halfWidth + GOAL.postR, top = GOAL.height + GOAL.postR, r = GOAL.postR * K * 1.25
	for (const s of [-1, 1]) bar(E(0, s * py, 0), E(0, s * py, top), r, WHITE)
	bar(E(0, -py, top), E(0, py, top), r, WHITE)
	// back frame the net hangs from
	for (const s of [-1, 1]) bar(E(-GOAL.depth, s * py, 0), E(-GOAL.depth, s * py, top), r * 0.5, [170, 172, 180])
	for (let z = 0.1; z < top; z += 0.2) for (const s of [-1, 1]) castShadow(...E(0, s * py, z), r)
	for (let y = -py; y < py; y += 0.25) castShadow(...E(0, y, top), r)
}

function drawStand() {
	const [dark, bright] = stadium.board
	// advertising boards behind the goal
	for (let i = 0; i < 8; i++) {
		const y0 = -7 + i * 1.75
		box(...E(-2.9, y0, 0), ...E(-2.75, y0 + 1.75, 0.8), i % 2 ? bright : dark, i)
	}
	box(...E(-5.2, -7, 0), ...E(-3.4, 7, 0.45), stadium.stand, 3)
	box(...E(-6.6, -7, 0), ...E(-5.2, 7, 0.95), stadium.stand, 5)
	let n = 0
	for (const [x, z] of [[-4.3, 0.45], [-5.9, 0.95]]) {
		for (let y = -6.4; y <= 6.4; y += 1.15) {
			const [shirt, stripe] = stadium.crowd[(n * 7 + 3) % stadium.crowd.length]
			const jitter = (hash(n, 4) - 0.5) * 0.5
			const [ex, ey, ez] = E(x + jitter * 0.4, y + jitter, z)
			figure(ex, ey, (hash(n, 9) - 0.5) * 0.6, {
				scale: 0.86, stance: 0.1, armR: hash(n, 2) > 0.7 ? 2.6 : 0.3, armL: 0.2, z: ez,
			}, { shirt, stripe, legs: [50, 50, 64], skin: hash(n, 5) > 0.5 ? [214, 164, 124] : [150, 104, 74], hair: [40, 32, 28] }, dynamicAdd)
			n++
		}
	}
}

function drawProps() {
	if (stadium.floodlights) {
		for (const y of [-8.5, 8.5]) {
			bar(E(-1.5, y, 0), E(-1.5, y, 4.4), 0.16, [92, 96, 110])
			box(...E(-1.8, y - 0.7, 4.4), ...E(-1.3, y + 0.7, 4.9), [255, 244, 200], 1)
		}
	}
	if (stadium.palms) for (const [x, y, s] of [[-3.5, 9.6, 0.8], [-4.5, -9.4, 0.7], [7.5, 9.6, 0.65]]) growTree(...E(x, y).slice(0, 2), s, 260, x * 10)
	if (stadium.trees) {
		for (const [x, y, s] of [[-4, 9.4, 0.75], [-4.4, -9.4, 0.7], [6.5, 9.8, 0.6]]) growTree(...E(x, y).slice(0, 2), s, 300, y * 10)
		for (const [x, y] of [[1.5, -9], [9, 9], [-1.6, 6]]) sphere(...E(x, y, 0), 0.6, [244, 248, 252], 'rough')
	}
}

function applyPalette() {
	stadium.grass.forEach((color, i) => {
		GRASS[i].splice(0, 3, ...color)
		tuftLit[i] = rgb(...color)
		tuftDark[i] = rgb(color[0] * 0.54, color[1] * 0.52, color[2] * 0.72)
	})
	const pairs = [[LEAF_DEEP, stadium.leaf[0]], [LEAF_MID, stadium.leaf[1]], [LEAF_SILVER, stadium.leaf[2]], [BARK, stadium.bark], [COOL, stadium.cool], [WARM, stadium.warm]]
	for (const [target, color] of pairs) target.splice(0, 3, ...color)
}

function bakeScene() {
	resetScene()
	applyPalette()
	zb.fill(-1e9)
	pix.fill(0)
	for (let iy = 0; iy < H; iy++) for (let ix = 0; ix < W; ix++) {
		const p = unproject(ix + 0.5, iy + 0.5)
		const index = iy * W + ix
		const color = groundColor(p.x, p.y, ix, iy, index)
		if (!color) continue
		pix[index] = color
		ground[index] = 1
		zb[index] = (p.x + p.y) / R2 * COS
	}
	groundZ.set(zb)
	pendingShadows.length = 0
	drawStand()
	drawFrame()
	drawProps()
	flushShadows()
	bakeOcclusion()
	staticShadow.set(shadowMask)
	applyShadows(groundZ)
	bakedPix.set(pix)
	bakedZ.set(zb)
}

// ── drawing per frame ────────────────────────────────────────────────────

function drawKeeper(keeper, t, kit) {
	const { spheres, axis } = keeperHitArea(keeper, t)
	const [legs, body, head, handA, handB] = spheres
	const at = (s, along, side = 0) => E(KEEPER_X, s.y + axis.y * along + axis.z * side, Math.max(0.06, s.z + axis.z * along - axis.y * side))
	const hips = at(body, -0.28), shoulders = at(body, 0.26)
	for (const side of [-1, 1]) {
		const knee = at(legs, 0.05, side * 0.14), foot = at(legs, -0.4, side * 0.2)
		dynamicAdd(at(body, -0.3, side * 0.1), knee, 0.12 * K, 0.1 * K, () => kit.shorts)
		dynamicAdd(knee, foot, 0.09 * K, 0.07 * K, () => kit.shirt)
	}
	dynamicAdd(hips, shoulders, 0.2 * K, 0.22 * K, () => kit.shirt)
	for (const [side, hand] of [[1, handA], [-1, handB]]) {
		const glove = E(KEEPER_X, hand.y, hand.z)
		dynamicAdd(at(body, 0.24, side * 0.22), glove, 0.075 * K, 0.065 * K, () => kit.shirt)
		sphere(...glove, 0.1 * K, kit.gloves, 'solid')
	}
	sphere(...E(KEEPER_X, head.y, head.z), 0.15 * K, kit.skin, 'solid')
	sphere(...at(head, 0.05, 0), 0.13 * K, kit.hair, 'solid')
}

const lerp3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t))

// The kicker for this turn: where it stands, which way it faces and how it moves.
function drawKicker() {
	const kit = game.shooter === 'player' ? PLAYER_KIT : CPU_KIT
	const behind = [SPOT.x + 0.55, -0.45]
	let pos = behind, yaw = Math.PI - 0.25, pose = { scale: 0.95, stance: 0.18, armL: 0.25, armR: 0.25 }
	const t = game.phaseTime
	if (game.phase === 'aim' || game.phase === 'charge') {
		pos = [SPOT.x + 1.9, -1.3]
		pose.crouch = game.phase === 'charge' ? game.power * 0.3 : 0
	} else if (game.phase === 'approach' || game.phase === 'runup') {
		const run = game.phase === 'approach' ? APPROACH : RUNUP
		const k = clamp(t / run, 0, 1), tell = game.phase === 'runup' ? game.kick.tell : 0
		const start = game.phase === 'approach' ? [SPOT.x + 1.9, -1.3] : [SPOT.x + 3.2, -2.3]
		pos = [lerp(start[0], behind[0], k), lerp(start[1], behind[1], k) + Math.sin(k * Math.PI) * tell * 0.3]
		const cycle = k < 1 ? Math.sin(t * 15) : 0
		yaw = Math.PI - 0.35 - tell * 0.45 * k
		pose = { scale: 0.95, stance: 0.15 + cycle * 0.3, lean: 0.15 + tell * 0.05, armL: 0.4 + cycle * 0.5, armR: 0.4 - cycle * 0.5, z: Math.abs(cycle) * 0.05 }
		if (k >= 1) pose = { scale: 0.95, stance: 0.25, lean: -0.05, armL: 0.6, armR: 0.6 } // the pause before the strike
	} else {
		// strike and follow-through
		const follow = clamp(game.simT / 0.3, 0, 1)
		pose = { scale: 0.95, stance: lerp(0.5, 0.3, follow), lean: 0.25, armL: 1.2, armR: 0.8 }
		pos = [behind[0] - follow * 0.5, behind[1] + follow * 0.2]
	}
	const [ex, ey] = E(pos[0], pos[1])
	figure(ex, ey, yaw, pose, kit, dynamicAdd)
}

function ballPosition() {
	if (!game.shot || game.phase === 'aim' || game.phase === 'charge' || game.phase === 'approach' || game.phase === 'runup') return { x: SPOT.x, y: SPOT.y, z: BALL_R }
	const frames = game.shot.frames
	const i = Math.min(frames.length - 2, Math.floor(game.simT * 60))
	const a = frames[Math.max(0, i)], b = frames[Math.max(0, i) + 1]
	const k = clamp((game.simT - a.t) / (b.t - a.t || 1), 0, 1)
	return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }
}

function drawBall() {
	const b = ballPosition()
	const [x, y, z] = E(b.x, b.y, b.z)
	const r = BALL_R * K * 1.7 // drawn larger than life so it reads at this resolution
	sphere(x, y, Math.max(r, z), r, BALL, 'solid')
	castShadow(x, y, z, r, 1, 0)
}

// The net is drawn every frame so it can ripple where the ball hits it.
function drawNet() {
	const { halfWidth: hw, height: h, depth } = GOAL
	const color = rgb(...(stadium.page === 'night' ? [188, 192, 210] : [236, 236, 228]))
	const ripple = game.ripple && !STILL ? game.ripple : null
	const push = (y, z, x) => {
		if (!ripple) return 0
		const age = game.time - ripple.time
		if (age > 1.4) return 0
		const d = Math.hypot(y - ripple.y, z - ripple.z, (x - ripple.x) * 0.7)
		return ripple.amp * Math.exp(-age * 3.5) * Math.sin(age * 20 - d * 5) * Math.exp(-d * 1.1)
	}
	const dot = (x, y, z) => plot(...E(x, y, z), color)
	const line = (fn, length) => { for (let s = 0; s <= length; s += 0.06) fn(s) }
	const gap = 0.36
	for (let y = -hw; y <= hw + 0.01; y += gap) line(z => dot(-depth - push(y, z, -depth), y, z), h)
	for (let z = 0; z <= h; z += gap) line(s => { const y = -hw + s; dot(-depth - push(y, z, -depth), y, z) }, hw * 2)
	for (let y = -hw; y <= hw + 0.01; y += gap) line(s => dot(-s, y, h + push(y, h, -s) * 0.6), depth)
	for (let x = 0; x >= -depth; x -= gap) line(s => { const y = -hw + s; dot(x, y, h + push(y, h, x) * 0.6) }, hw * 2)
	for (const side of [-1, 1]) {
		for (let x = 0; x >= -depth; x -= gap) line(z => dot(x, side * (hw + push(side * hw, z, x) * 0.6), z), h)
		for (let z = 0; z <= h; z += gap) line(s => dot(-s, side * (hw + push(side * hw, z, -s) * 0.6), z), depth)
	}
}

// Screen point → point on the goal-line plane, in metres.
function goalPoint(sx, sy) {
	const u = (sx - OX) / S
	const ey = GOAL_EX - u * R2
	const v = (GOAL_EX + ey) / R2
	const ez = (v * SIN - (sy - OY) / S) / COS
	return { y: ey / K, z: ez / K }
}
const screenOf = (y, z, x = 0) => { const p = project(...E(x, y, z)); return [p.sx, p.sy] }

function drawMarker(y, z, color, radius = 0.32) {
	const ring = []
	for (let a = 0; a < Math.PI * 2; a += 0.22) ring.push(screenOf(y + Math.cos(a) * radius, z + Math.sin(a) * radius))
	ring.push(screenOf(y, z))
	haloDots(ring)
	drawDots(ring, color)
}

function drawGuides() {
	if (game.phase === 'aim' || game.phase === 'charge') {
		// the 3 × 2 grid, faint, so you can see which zone you are in
		const faint = rgb(...(stadium.page === 'night' ? [120, 124, 150] : [200, 196, 186]))
		const dots = []
		for (const y of [-1.22, 1.22]) for (let z = 0.1; z < GOAL.height; z += 0.18) dots.push(screenOf(y, z))
		for (let y = -GOAL.halfWidth; y < GOAL.halfWidth; y += 0.18) dots.push(screenOf(y, 1.22))
		drawDots(dots, faint)
		drawMarker(game.aim.y, game.aim.z, SIGNAL)
	}
	if (isDefending() && game.diveTime === null && game.phase === 'runup') {
		const z = ZONES[zoneIndex(game.dive)]
		if (game.dive.col || game.dive.row) drawMarker(z.y, z.z, rgb(110, 210, 140), 0.45)
		else drawMarker(0, 1, rgb(110, 210, 140), 0.2)
	}
}

function draw() {
	pix.set(bakedPix)
	zb.set(bakedZ)
	pendingShadows.length = 0
	const windTime = STILL ? 0 : Math.floor(game.time * WIND_FPS) / WIND_FPS
	drawKicker()
	drawKeeper(game.keeper, keeperClock(), isDefending() ? PLAYER_KEEPER : CPU_KEEPER)
	drawBall()
	drawLeaves(windTime)
	drawTufts(windTime)
	flushShadows()
	applyShadows(bakedZ)
	shadeEdges()
	drawNet()
	drawGuides()
	ctx.putImageData(image, 0, 0)
}

// ── turn flow ────────────────────────────────────────────────────────────

const isDefending = () => (game.shooter ?? game.match.turn) === 'cpu'
const zoneIndex = ({ col, row }) => row * 3 + col + 1
// keeper time is measured from the strike, so a dive before it uses negative time
function keeperClock() {
	if (game.phase === 'flight' || game.phase === 'result') return game.simT
	if (game.phase === 'runup') return game.phaseTime - game.strikeAt
	return 0
}

function setPhase(phase) {
	game.phase = phase
	game.phaseTime = 0
	document.body.classList.toggle('charging', phase === 'charge')
	document.body.classList.toggle('defending', isDefending())
}

function startTurn() {
	game.shooter = game.match.turn
	game.shot = null
	game.simT = 0
	game.power = 0
	game.diveTime = null
	game.dive = { col: 0, row: 0 }
	game.keeper = { target: null, start: 0, diveTime: PLAYER_DIVE_TIME }
	nodes.callout.hidden = true
	setZoom(false)
	if (game.shooter === 'player') {
		setPhase('aim')
		setFeedback('Pick a spot in the goal. Hold Space to charge.')
		nodes['shoot-label'].textContent = 'Hold to charge · release to shoot'
		nodes['power-title'].textContent = 'SHOT POWER'
	} else {
		game.kick = aiKick(difficulty, Math.random)
		game.strikeAt = RUNUP + game.kick.pause
		setPhase('runup')
		setFeedback('Watch the lean. Pick a side and press Space to dive.')
		nodes['shoot-label'].textContent = 'Dive · or tap the goal'
		nodes['power-title'].textContent = 'THEIR KICK'
	}
	updateMeter()
	updateScoreboard()
}

function beginCharge() {
	if (game.paused || game.phase !== 'aim') return
	setPhase('charge')
	game.power = 0
}

function releaseShot() {
	if (game.phase !== 'charge') return
	const power = game.power
	const aim = { ...game.aim }
	const seed = Math.floor(Math.random() * 2 ** 31)
	const keeper = keeperDive(aim, difficulty, Math.random, power)
	game.pendingShot = { aim, power, keeper, seed }
	const accuracy = power >= SWEET.lo && power <= SWEET.hi
	setFeedback(accuracy ? 'Sweet strike.' : power > SWEET.hi ? 'Leaning back on it…' : 'Not much on it…')
	setPhase('approach')
}

function strike(shot, keeper) {
	game.shot = shot
	game.keeper = keeper
	game.simT = 0
	game.eventIndex = 0
	setPhase('flight')
	sound.play('kick')
	setZoom(true)
}

function confirmDive(zone) {
	if (!isDefending() || game.diveTime !== null) return
	if (game.phase !== 'runup' && !(game.phase === 'flight' && game.simT < DIVE_WINDOW)) return
	const t = game.phase === 'runup' ? game.phaseTime - game.strikeAt : game.simT
	game.diveTime = t
	game.keeper = playerDive(zone, t)
	setFeedback(t < -0.35 ? 'Early dive…' : t > 0.1 ? 'Late dive!' : 'Dive!')
	// a dive after the strike changes the result: replay the same shot (same seed) with the new keeper
	if (game.phase === 'flight') game.shot = shotResult({ ...game.kick, keeper: game.keeper })
}
const diveFromSelection = () => confirmDive(game.dive.col || game.dive.row ? zoneIndex(game.dive) : null)

const CALLOUTS = { goal: 'GOAL!', saved: 'SAVED!', wide: 'WIDE!', over: 'OVER!', post: 'POST!', bar: 'CROSSBAR!' }
function finishKick() {
	const shot = game.shot, outcome = shot.outcome, mine = game.shooter === 'player'
	const framed = shot.events.some(e => e.type === 'post' || e.type === 'bar')
	let text = CALLOUTS[outcome]
	let sub = mine ? (outcome === 'goal' ? 'You score' : 'Your kick') : (outcome === 'goal' ? 'CPU scores' : 'Kept out')
	if (outcome === 'goal' && framed) sub = 'In off the frame'
	if (outcome === 'saved' && shot.fingertip) { text = 'FINGERTIP SAVE!'; sub = mine ? 'Just turned away' : 'What a reach' }
	showCallout(text, sub, mine === (outcome === 'goal'))
	sound.play(mine === (outcome === 'goal') ? 'cheer' : 'groan')
	game.match = recordKick(game.match, outcome)
	setFeedback(game.match.over ? 'That settles it.' : isSuddenDeath(game.match) && game.match.turn === 'player' ? 'Sudden death. Next round.' : '')
	updateScoreboard(true)
	setPhase('result')
}

function update(dt) {
	game.time += dt
	if (game.paused) return
	game.phaseTime += dt
	moveAim(dt)
	if (game.phase === 'charge') {
		game.power = Math.min(1, game.power + dt / CHARGE_TIME)
		updateMeter()
	}
	if (game.phase === 'approach' && game.phaseTime >= APPROACH) {
		const { aim, power, keeper, seed } = game.pendingShot
		strike(shotResult({ aim, power, keeper, seed }), keeper)
	}
	if (game.phase === 'runup' && game.phaseTime >= game.strikeAt) {
		strike(shotResult({ ...game.kick, keeper: game.keeper }), game.keeper)
	}
	if (game.phase === 'flight') {
		game.simT += dt * timeScale()
		const events = game.shot.events
		while (game.eventIndex < events.length && events[game.eventIndex].t <= game.simT) onEvent(events[game.eventIndex++])
		if (game.simT > game.shot.decidedAt + 0.85) finishKick()
	}
	if (game.phase === 'result' && game.phaseTime > RESULT_TIME) {
		if (game.match.over) showResult()
		else startTurn()
	}
}

// slow motion around saves and frame hits
function timeScale() {
	if (STILL) return 1
	const key = game.shot.events.find(e => e.type === 'keeper' || e.type === 'post' || e.type === 'bar')
	if (!key) return 1
	const d = game.simT - key.t
	return d > -0.12 && d < 0.3 ? 0.28 : 1
}

let netSounded = false
function onEvent(e) {
	if (e.type === 'ground') sound.play('bounce', e)
	if (e.type === 'post' || e.type === 'bar') sound.play('clang')
	if (e.type === 'keeper') sound.play('glove')
	if (e.type === 'net') {
		const b = ballPosition()
		if (!game.ripple || game.time - game.ripple.time > 0.5) game.ripple = { x: b.x, y: b.y, z: b.z, time: game.time, amp: Math.min(0.4, e.speed * 0.035) }
		if (!netSounded) sound.play('swish')
		netSounded = true
	}
	if (e.type === 'goal') netSounded = false
}

// ── input ────────────────────────────────────────────────────────────────

const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' }
const AIM_SPEED = 3.2

function clampAim() {
	game.aim.y = clamp(game.aim.y, -GOAL.halfWidth - AIM_MARGIN.side, GOAL.halfWidth + AIM_MARGIN.side)
	game.aim.z = clamp(game.aim.z, 0.1, GOAL.height + AIM_MARGIN.top)
}
function moveAim(dt) {
	if (game.phase !== 'aim' && game.phase !== 'charge') return
	const h = game.held
	// +y is screen-left on this camera
	game.aim.y += ((h.has('left') ? 1 : 0) - (h.has('right') ? 1 : 0)) * AIM_SPEED * dt
	game.aim.z += ((h.has('up') ? 1 : 0) - (h.has('down') ? 1 : 0)) * AIM_SPEED * 0.7 * dt
	clampAim()
}
function stepDive(dir) {
	if (!isDefending() || game.diveTime !== null) return
	if (dir === 'left') game.dive.col = Math.min(1, game.dive.col + 1)
	if (dir === 'right') game.dive.col = Math.max(-1, game.dive.col - 1)
	if (dir === 'up') game.dive.row = 1
	if (dir === 'down') game.dive.row = 0
	sound.play('tick')
}

function pressAction() {
	if (game.paused) return
	if (isDefending()) diveFromSelection()
	else beginCharge()
}

addEventListener('keydown', event => {
	if (nodes.help.open || nodes.result.open || event.ctrlKey || event.metaKey || event.altKey) return
	const interactive = event.target.closest?.('button, a, input, select, textarea')
	if (interactive && event.target !== nodes.shoot) return
	if (event.code === 'Escape') return togglePause()
	const dir = KEYS[event.code]
	if (dir) {
		event.preventDefault()
		if (!event.repeat) stepDive(dir)
		game.held.add(dir)
	}
	if (event.code === 'Space') {
		event.preventDefault()
		if (!event.repeat) pressAction()
	}
})
addEventListener('keyup', event => {
	const dir = KEYS[event.code]
	if (dir) game.held.delete(dir)
	if (event.code === 'Space') releaseShot()
})
addEventListener('blur', () => { game.held.clear(); releaseShot() })

function pointerToGoal(event) {
	const rect = canvas.getBoundingClientRect()
	return goalPoint((event.clientX - rect.left) / rect.width * W, (event.clientY - rect.top) / rect.height * H)
}
function aimAt(event) {
	if (game.phase !== 'aim' && game.phase !== 'charge') return
	Object.assign(game.aim, pointerToGoal(event))
	clampAim()
}
canvas.addEventListener('pointermove', event => {
	if (event.pointerType === 'mouse' || event.buttons) aimAt(event)
})
canvas.addEventListener('pointerdown', event => {
	canvas.focus({ preventScroll: true })
	if (game.paused) return
	if (isDefending()) {
		const p = pointerToGoal(event)
		const central = Math.abs(p.y) < 1.22 && p.z < 1.22
		return confirmDive(central ? null : zoneOf(p))
	}
	canvas.setPointerCapture(event.pointerId)
	aimAt(event)
})
nodes.shoot.addEventListener('pointerdown', event => {
	event.preventDefault()
	nodes.shoot.setPointerCapture(event.pointerId)
	pressAction()
})
for (const type of ['pointerup', 'pointercancel']) nodes.shoot.addEventListener(type, releaseShot)
nodes.shoot.addEventListener('keydown', event => { if (event.code === 'Enter') { event.preventDefault(); pressAction() } })
nodes.shoot.addEventListener('keyup', event => { if (event.code === 'Enter') releaseShot() })

function togglePause() {
	if (game.phase === 'charge') { setPhase('aim'); game.power = 0; updateMeter() }
	game.paused = !game.paused
	nodes.paused.hidden = !game.paused
	game.held.clear()
}

// ── interface ────────────────────────────────────────────────────────────

function setFeedback(text) { nodes.feedback.textContent = text }

function updateMeter() {
	const percent = Math.round(game.power * 100)
	nodes['power-fill'].style.width = `${percent}%`
	nodes['power-value'].textContent = isDefending() ? '—' : `${percent}%`
	nodes['power-meter'].setAttribute('aria-valuenow', String(percent))
}
nodes['sweet-spot'].style.left = `${SWEET.lo * 100}%`
nodes['sweet-spot'].style.width = `${(SWEET.hi - SWEET.lo) * 100}%`

function renderTracker(node, kicks, current) {
	// regulation shows kicks 1–5; sudden death shows the latest five
	const offset = Math.max(0, Math.max(game.match.player.length, game.match.cpu.length) - REGULATION + (game.match.player.length > game.match.cpu.length ? 0 : 1) - 1)
	const start = Math.max(0, Math.min(offset, kicks.length))
	node.replaceChildren(...Array.from({ length: REGULATION }, (_, i) => {
		const dot = document.createElement('i')
		const kick = kicks[start + i]
		if (kick) dot.className = kick === 'goal' ? 'goal' : 'miss'
		else if (current && start + i === kicks.length) dot.className = 'now'
		return dot
	}))
}

function updateScoreboard(pop) {
	const m = game.match
	const before = [nodes['score-player'].textContent, nodes['score-cpu'].textContent]
	nodes['score-player'].textContent = goals(m.player)
	nodes['score-cpu'].textContent = goals(m.cpu)
	if (pop) for (const [node, old] of [[nodes['score-player'], before[0]], [nodes['score-cpu'], before[1]]]) {
		if (node.textContent === old) continue
		node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop')
	}
	renderTracker(nodes['tracker-player'], m.player, !m.over && m.turn === 'player')
	renderTracker(nodes['tracker-cpu'], m.cpu, !m.over && m.turn === 'cpu')
	if (m.over) { nodes['kick-info'].textContent = m.winner === 'player' ? 'Full time · You win' : 'Full time · CPU wins'; return }
	const n = kickNumber(m)
	nodes['kick-info'].textContent = `${isSuddenDeath(m) ? 'Sudden death · ' : ''}Kick ${n} · ${m.turn === 'player' ? 'You shoot' : 'You save'}`
}

function showCallout(text, sub, good) {
	nodes['callout-text'].textContent = text
	nodes['callout-sub'].textContent = sub
	nodes.callout.classList.toggle('miss', !good)
	nodes.callout.hidden = false
	nodes.callout.classList.remove('show'); void nodes.callout.offsetWidth; nodes.callout.classList.add('show')
}

function setZoom(on) {
	if (STILL) return
	canvas.classList.toggle('zoomed', on)
}

const HISTORY_LABELS = { goal: 'Goal', saved: 'Saved', missed: 'Missed', post: 'Post' }
function showResult() {
	const r = shootoutResult(game.match)
	nodes['result-kicker'].textContent = r.suddenDeath ? 'AFTER SUDDEN DEATH' : 'FULL TIME'
	nodes['result-title'].textContent = r.winner === 'player' ? 'You win the shootout!' : 'The CPU takes it.'
	nodes['result-player'].textContent = r.player
	nodes['result-cpu'].textContent = r.cpu
	const kicks = Math.max(r.history.player.length, r.history.cpu.length)
	const cell = (tag, text, cls) => { const c = document.createElement(tag); c.textContent = text; if (cls) c.className = cls; return c }
	nodes['history-head'].replaceChildren(cell('th', 'KICK'), ...Array.from({ length: kicks }, (_, i) => cell('th', String(i + 1))))
	for (const side of ['player', 'cpu']) {
		nodes[`history-${side}`].replaceChildren(cell('td', side === 'player' ? 'YOU' : 'CPU'),
			...Array.from({ length: kicks }, (_, i) => { const k = r.history[side][i]; return k ? cell('td', HISTORY_LABELS[k], k) : cell('td', '·') }))
	}
	setPhase('over')
	nodes.result.showModal()
}
nodes['play-again'].addEventListener('click', () => {
	nodes.result.close()
	game.match = newShootout()
	startTurn()
	canvas.focus({ preventScroll: true })
})
nodes.result.addEventListener('cancel', event => event.preventDefault())

function openHelp() {
	if (!game.paused) togglePause()
	nodes.help.showModal()
}
function closeHelp() {
	nodes.help.close()
	if (game.paused) togglePause()
	canvas.focus({ preventScroll: true })
}
nodes['help-open'].addEventListener('click', openHelp)
nodes['help-close'].addEventListener('click', closeHelp)
nodes['help-play'].addEventListener('click', closeHelp)
nodes.help.addEventListener('close', () => { if (game.paused) togglePause() })

// A footer menu is a button that opens a list of radio options above it.
function setupMenu(button, options, onPick) {
	function setOpen(open) {
		options.hidden = !open
		button.setAttribute('aria-expanded', String(open))
	}
	button.addEventListener('click', () => {
		setOpen(options.hidden)
		if (!options.hidden) options.querySelector(':checked')?.focus()
	})
	options.addEventListener('change', event => onPick(event.target.value))
	options.addEventListener('keydown', event => {
		if (event.key !== 'Escape' && event.key !== 'Enter') return
		event.stopPropagation()
		setOpen(false)
		button.focus()
	})
	addEventListener('pointerdown', event => { if (!button.parentElement.contains(event.target)) setOpen(false) })
}
const checkOption = (options, value) => { for (const radio of options.querySelectorAll('input')) radio.checked = radio.value === value }

function showStadium() {
	nodes['stadium-label'].textContent = stadium.name
	document.body.dataset.page = stadium.page
	document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--paper').trim() || '#ffffff'
	checkOption(nodes['stadium-options'], stadiumId)
	sound.setStadium(stadium.sound)
}
setupMenu(nodes.stadium, nodes['stadium-options'], id => {
	stadiumId = id
	stadium = STADIUMS[id]
	store.set('stadium', id)
	showStadium()
	bakeScene()
})

let soundMode = store.get('sound', SOUND_MODES, 'all')
function showSound() {
	nodes['sound-label'].textContent = SOUND_MODES[soundMode]
	checkOption(nodes['sound-options'], soundMode)
}
setupMenu(nodes.sound, nodes['sound-options'], mode => {
	soundMode = mode
	store.set('sound', mode)
	showSound()
	sound.setMode(mode)
})

function showDifficulty() {
	nodes['difficulty-label'].textContent = DIFFICULTIES[difficulty]
	checkOption(nodes['difficulty-options'], difficulty)
}
setupMenu(nodes.difficulty, nodes['difficulty-options'], level => {
	difficulty = level
	store.set('difficulty', level)
	showDifficulty()
})

// Browsers that block autoplay start audio on the first click or keypress.
function unlockAudio(event) {
	if (event.target.closest?.('#sound, #sound-options')) return
	sound.setMode(soundMode)
}
addEventListener('pointerdown', unlockAudio, { passive: true })
addEventListener('keydown', unlockAudio)

function layout() {
	const rect = nodes.stage.getBoundingClientRect()
	const dpr = window.devicePixelRatio || 1
	const available = Math.min(rect.width / W, rect.height / H)
	const scale = available < 1 ? available : Math.max(1, Math.floor(available * dpr)) / dpr
	canvas.style.width = `${W * scale}px`
	canvas.style.height = `${H * scale}px`
	const [gx, gy] = screenOf(0, GOAL.height + 0.9, -0.6)
	canvas.style.transformOrigin = `${(gx / W) * 100}% ${(gy / H) * 100 + 10}%`
	// the callout sits above the goal; measure without the zoom so it does not jump
	const left = rect.left + (rect.width - W * scale) / 2, top = rect.top + (rect.height - H * scale) / 2
	nodes.callout.style.left = `${left + gx * scale}px`
	nodes.callout.style.top = `${top + gy * scale}px`
}
addEventListener('resize', layout)
nodes.paused.addEventListener('click', togglePause)

showStadium()
showSound()
showDifficulty()
sound.setMode(soundMode)
layout()
bakeScene()
startTurn()

// exposed for automated play-through checks
window.penaltyNight = { game, confirmDive, beginCharge, releaseShot }

let last = performance.now()
function frame(now) {
	update(Math.min(0.04, (now - last) / 1000))
	last = now
	draw()
	requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
