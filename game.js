import {
	GOAL, BALL_R, KEEPER_X, SPOT, SWEET, AIM_MARGIN, ZONES, PLAYER_DIVE_TIME,
	zoneOf, keeperHitArea, keeperDive, playerDive, shotResult, aiKick,
	newShootout, recordKick, kickNumber, isSuddenDeath, shootoutResult, historyKind, goals, REGULATION,
} from './rules.js?v=2'
import { STADIUMS } from './stadiums.js?v=2'
import { createAudio } from './audio.js?v=2'

// World (rules.js) is metres with the goal line on x = 0. The engine draws in its own units: K per metre, shifted by X0.
const K = 1.08, X0 = 4
const E = (x, y, z = 0) => [(x - X0) * K, y * K, z * K]
const GOAL_EX = (0 - X0) * K

const CHARGE_TIME = 1.05 // seconds from empty to full power
const APPROACH = 0.5 // player's two steps to the ball
const RUNUP = 1.15 // CPU run-up before its pause
const DIVE_WINDOW = 0.28 // how long after the strike a dive still counts
const RESULT_TIME = 1.9

// Football kits: a solid jersey with trim on the collar and sleeves, shorts, socks and boots.
const HOME = { shirt: [208, 74, 46], trim: [250, 244, 230], shorts: [246, 242, 232], socks: [208, 74, 46], boots: [30, 28, 32], skin: [214, 160, 120], hair: [52, 38, 30], number: 9 }
const AWAY = { shirt: [44, 84, 164], trim: [246, 198, 66], shorts: [30, 40, 78], socks: [242, 242, 246], boots: [24, 24, 28], skin: [170, 118, 84], hair: [28, 24, 22], number: 7 }
const HOME_KEEPER = { shirt: [96, 190, 84], trim: [26, 58, 32], shorts: [30, 36, 34], socks: [96, 190, 84], boots: [30, 28, 32], skin: [214, 160, 120], hair: [52, 38, 30], gloves: [246, 244, 236] }
const AWAY_KEEPER = { shirt: [244, 192, 54], trim: [40, 40, 52], shorts: [40, 40, 52], socks: [244, 192, 54], boots: [24, 24, 28], skin: [170, 118, 84], hair: [28, 24, 22], gloves: [246, 244, 236] }
const BALL = [244, 244, 238], WHITE = [240, 240, 236]
const BALL_SIZE = BALL_R * K * 1.7 // drawn larger than life so it reads at this resolution

const nodes = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]))
const store = {
	get(key, options, fallback) { try { const v = localStorage.getItem(`penalty-night:${key}`); return v in options ? v : fallback } catch { return fallback } },
	set(key, value) { try { localStorage.setItem(`penalty-night:${key}`, value) } catch {} },
}
let stadiumId = store.get('stadium', STADIUMS, 'street')
let stadium = STADIUMS[stadiumId]
const DIFFICULTIES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
let difficulty = store.get('difficulty', DIFFICULTIES, 'medium')
const SOUND_MODES = { all: 'Sound on', effects: 'Music off', off: 'Sound off' }
const sound = createAudio()

const game = {
	match: newShootout(),
	phase: 'aim', phaseTime: 0, time: 0, paused: false,
	aim: { y: 1.6, z: 1.3 }, power: 0,
	keeper: { target: null, start: 0, diveTime: PLAYER_DIVE_TIME },
	shot: null, simT: 0, eventIndex: 0, kick: null, dive: { col: 0, row: 0 }, diveTime: null,
	ripple: null, held: new Set(), cheerAt: -10,
}

// ── scene ────────────────────────────────────────────────────────────────

const fadesOut = (reach, ix, iy) => reach > 1.04 || (reach > 0.91 && hash(ix, iy) < (reach - 0.91) / 0.13)
const shade = (c, s) => rgb(c[0] + s, c[1] + s, c[2] + s)

// The diorama: a marked pitch, a paved apron and concourse around it, then a grass verge that frays into the page.
const PITCH = { back: -0.9, front: 15, half: 8.2 }
const APRON = 0.8
const LINE = 0.07
const BOX_EDGE = 13.4, SIX = { depth: 4.5, half: 5.8 }

function pitchLines(x, y) {
	const ax = Math.abs(y), side = PITCH.half - 0.3
	if (x < -LINE || x > PITCH.front - 0.3 + LINE || ax > side + LINE) return false
	if (Math.abs(x) < LINE || Math.abs(ax - side) < LINE) return true // goal line, touchlines
	if (Math.abs(x - BOX_EDGE) < LINE || Math.abs(x - (PITCH.front - 0.3)) < LINE) return true // box edge, far line
	if ((Math.abs(x - SIX.depth) < LINE && ax < SIX.half) || (Math.abs(ax - SIX.half) < LINE && x < SIX.depth)) return true
	if (x > BOX_EDGE && Math.abs(Math.hypot(x - SPOT.x, y) - 3.4) < LINE) return true // the D
	return Math.hypot(x - SPOT.x, y) < 0.17 // penalty spot
}

function groundColor(ex, ey, ix, iy, index) {
	const x = ex / K + X0, y = ey / K, ax = Math.abs(y)
	const edge = Math.pow((Math.abs(x - 4.3) / 13.6) ** 6 + (ax / 11.2) ** 6, 1 / 6)
	if (fadesOut(edge + (noise(ex * 1.3, ey * 1.3) - 0.5) * 0.12, ix, iy)) return 0
	const grain = (hash(ix, iy) - 0.5) * 8 + (noise(ex * 1.2, ey * 1.2) - 0.5) * 6
	const light = stadium.floodlights ? Math.max(0, 26 - Math.min(Math.hypot(x + 1.6, y - 9.2), Math.hypot(x + 1.6, y + 9.2), Math.hypot(x - 5, y) * 1.4) * 2.2) : 0
	if (x >= PITCH.back && x <= PITCH.front && ax <= PITCH.half) {
		kinds[index] = 1
		// mown stripes, a fainter cross-cut, and worn turf in the goalmouth and on the spot
		const band = Math.floor((x + 40) / 2) % 2, cross = Math.floor((y + 40) / 2.4) % 2
		let color = stadium.pitch[band]
		const wear = Math.max(0, 1 - Math.hypot((x - 0.9) / 1.7, y / 3.3)) + Math.max(0, 1 - Math.hypot(x - SPOT.x, y) / 1.2)
		if (wear * (0.6 + noise(x * 3, y * 3)) > 0.62) color = stadium.worn
		if (pitchLines(x, y)) color = stadium.line
		return shade(color, grain + light + (cross ? 3 : -2))
	}
	if (x < PITCH.back || (x <= PITCH.front + APRON && ax <= PITCH.half + APRON)) {
		kinds[index] = 2
		const seam = stadium.seam && (Math.abs((x + 40) % 1.6) < 0.05 || Math.abs((y + 40) % 1.6) < 0.05)
		const kerb = x >= PITCH.back && Math.abs(ax - PITCH.half - 0.06) < 0.07 || Math.abs(x - PITCH.back + 0.06) < 0.07 && ax < PITCH.half
		return shade(stadium.surround, grain + light * 0.6 - (seam ? stadium.seam : 0) + (kerb ? 14 : 0))
	}
	kinds[index] = KIND_GRASS
	const tone = clamp(Math.floor(noise(x * 0.8, y * 0.8) * 3.7 + hash(ix, iy) * 1.1), 0, 4)
	return rgb(...GRASS[tone])
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

// Spectators are captured rather than baked, so they can jump when the home side scores.
const crowd = []
function drawStand() {
	const [dark, bright] = stadium.board
	for (let i = 0; i < 8; i++) {
		const y0 = -7 + i * 1.75
		box(...E(-2.9, y0, 0), ...E(-2.75, y0 + 1.75, 0.8), i % 2 ? bright : dark, i)
	}
	box(...E(-5.2, -7.4, 0), ...E(-3.4, 7.4, 0.45), stadium.stand, 3)
	box(...E(-6.6, -7.4, 0), ...E(-5.2, 7.4, 0.95), stadium.stand, 5)
	box(...E(-7.3, -7.4, 0), ...E(-6.6, 7.4, 2.4), stadium.wall, 7)
	box(...E(-6.62, -5.2, 1.35), ...E(-6.54, 5.2, 2.0), bright, 9)
	for (let k = -4.6; k <= 4.6; k += 0.9) box(...E(-6.55, k, 1.55), ...E(-6.5, k + 0.45, 1.8), dark, k)
	let n = 0
	for (const [x, z] of [[-4.3, 0.45], [-5.9, 0.95]]) {
		for (let y = -6.6; y <= 6.6; y += 1.05) {
			const [shirt, trim] = stadium.crowd[(n * 7 + 3) % stadium.crowd.length]
			const jitter = (hash(n, 4) - 0.5) * 0.5
			const [ex, ey, ez] = E(x + jitter * 0.4, y + jitter, z)
			capture = []
			footballer(ex, ey, (hash(n, 9) - 0.5) * 0.6, {
				scale: 0.84, stance: 0.1, armR: hash(n, 2) > 0.65 ? 2.7 : 0.3, armL: hash(n, 6) > 0.8 ? 2.6 : 0.2, z: ez,
			}, { shirt, trim, shorts: [52, 58, 82], socks: [44, 44, 52], boots: [40, 36, 36], skin: hash(n, 5) > 0.5 ? [214, 164, 124] : [150, 104, 74], hair: hash(n, 8) > 0.3 ? [40, 32, 28] : [180, 140, 80] })
			crowd.push({ pixels: capture, phase: hash(n, 3) * 6 })
			capture = null
			n++
		}
	}
}

function drawCrowd() {
	const age = game.time - game.cheerAt
	const cheering = !STILL && age < 2.2
	for (const person of crowd) {
		const dy = cheering ? -Math.round(Math.abs(Math.sin(age * 9 + person.phase)) * 2.4 * (1 - age / 2.2)) : 0
		const px = person.pixels
		for (let n = 0; n < px.length; n += 4) {
			const iy = px[n + 1] + dy
			if (iy < 0) continue
			const i = iy * W + px[n]
			if (px[n + 2] <= zb[i]) continue
			zb[i] = px[n + 2]
			pix[i] = px[n + 3]
		}
	}
}

function prop(x, y, z, r, color) {
	const [ex, ey, ez] = E(x, y, z)
	sphere(ex, ey, ez, r, color, 'solid')
	castShadow(ex, ey, ez, r)
}

function drawProps() {
	if (stadium.floodlights) {
		for (const y of [-9.2, 9.2]) {
			bar(E(-1.6, y, 0), E(-1.6, y, 4.6), 0.16, [92, 96, 110])
			box(...E(-1.9, y - 0.7, 4.6), ...E(-1.4, y + 0.7, 5.1), [255, 244, 200], 1)
			for (let z = 0.3; z < 4.6; z += 0.3) castShadow(...E(-1.6, y, z), 0.16)
		}
	}
	// spare balls by the post and training cones along the apron
	for (const [x, y] of [[-0.55, 4.5], [-0.85, 4.85], [-0.45, 5.15]]) prop(x, y, BALL_SIZE / K, BALL_SIZE, BALL)
	for (const x of [2, 5, 8, 11]) {
		const [ex, ey] = E(x, PITCH.half + 0.42)
		capsule([ex, ey, 0.02], [ex, ey, 0.42], 0.17, 0.04, () => stadium.cone, 'solid')
		castShadow(ex, ey, 0.2, 0.12)
	}
	if (stadium.palms) for (const [x, y, s] of [[-3.5, 9.9, 0.8], [-4.6, -9.7, 0.7], [8, 10.4, 0.62]]) growTree(...E(x, y).slice(0, 2), s, 260, x * 10)
	if (stadium.trees) {
		for (const [x, y, s] of [[-4, 9.9, 0.75], [-4.6, -9.8, 0.7], [7, 10.5, 0.6]]) growTree(...E(x, y).slice(0, 2), s, 300, y * 10)
		for (const [x, y, r] of [[1.5, -9.6, 0.6], [10, 9.7, 0.7], [-1.9, 7.6, 0.5]]) prop(x, y, 0, r, [244, 248, 252])
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
	crowd.length = 0
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

const lerp3 = (a, b, t) => a.map((v, i) => lerp(v, b[i], t))
const DIGITS = { 7: ['###', '..#', '.#.', '.#.', '.#.'], 9: ['###', '#.#', '###', '..#', '###'] }

// A footballer on the engine's figure skeleton, dressed in a kit: jersey with trim, shorts, socks and boots.
// pose.kick (0–1) lifts the striking foot through the ball.
function footballer(px, py, yaw, pose, kit) {
	const fx = Math.cos(yaw), fy = Math.sin(yaw), sx = -fy, sy = fx, base = pose.z || 0, k = pose.scale || 1
	const P = (a, b, c) => [px + (fx * a + sx * b) * k, py + (fy * a + sy * b) * k, c * k + base]
	const bone = (a, b, r0, r1, color) => dynamicAdd(a, b, r0 * k, r1 * k, typeof color === 'function' ? color : () => color)
	const crouch = pose.crouch || 0, lean = pose.lean || 0, kick = pose.kick || 0
	const hipZ = 1.28 - crouch * 0.4, hipA = -crouch * 0.15
	const shA = hipA + Math.sin(lean) * 0.95, shZ = hipZ + Math.cos(lean) * 0.95
	const neck = P(shA, 0, shZ + 0.08), head = P(shA + Math.sin(lean) * 0.32, 0, shZ + 0.36)
	const stance = pose.stance == null ? 0.2 : pose.stance
	const legs = [
		[P(hipA, 0.15, hipZ), P(-stance * 0.4 + crouch * 0.12, 0.22, 0.68 - crouch * 0.1), P(-stance * 1.2, 0.2, 0.12)],
		[P(hipA, -0.15, hipZ), P(stance * 1.2 + crouch * 0.34 + kick * 0.45, -0.22, 0.72 - crouch * 0.08 + kick * 0.3), P(stance * 2 + kick * 0.9, -0.2, 0.12 + kick * 0.75)],
	]
	for (const [hip, knee, foot] of legs) {
		const hem = lerp3(hip, knee, 0.6)
		bone(hip, hem, 0.19, 0.17, kit.shorts)
		bone(hem, knee, 0.13, 0.12, kit.skin)
		bone(knee, foot, 0.12, 0.1, kit.socks)
		bone(foot, [foot[0] + fx * 0.17 * k, foot[1] + fy * 0.17 * k, foot[2] - 0.03 * k], 0.1, 0.09, kit.boots)
	}
	const collar = neck[2] - 0.12 * k
	bone(P(hipA, 0, hipZ), neck, 0.3, 0.32, z => (z > collar ? kit.trim : kit.shirt))
	bone(neck, head, 0.11, 0.12, kit.skin)
	bone(head, head, 0.24, 0.24, kit.skin)
	bone([head[0] - fx * 0.06 * k, head[1] - fy * 0.06 * k, head[2] + 0.08 * k], [head[0] - fx * 0.06 * k, head[1] - fy * 0.06 * k, head[2] + 0.08 * k], 0.205, 0.205, kit.hair)
	for (const [side, angle] of [[1, pose.armR ?? 0], [-1, pose.armL ?? 0.08]]) {
		const sh = P(shA, side * 0.37, shZ - 0.03)
		const elbow = P(shA + Math.sin(angle) * 0.46, side * 0.41, shZ - 0.03 - Math.cos(angle) * 0.46)
		const hand = P(shA + Math.sin(angle + 0.18) * 0.93, side * 0.42, shZ - 0.03 - Math.cos(angle + 0.18) * 0.93)
		const cuff = lerp3(sh, elbow, 0.7)
		bone(sh, cuff, 0.13, 0.12, kit.shirt)
		bone(cuff, lerp3(sh, elbow, 0.85), 0.12, 0.11, kit.trim)
		bone(lerp3(sh, elbow, 0.85), hand, 0.09, 0.08, kit.skin)
	}
	// shirt number, when we see the player's back
	if (kit.number && fx + fy < -0.3) {
		const back = project(...P(lerp(hipA, shA, 0.55) - 0.3, 0, hipZ + 0.52))
		const rows = DIGITS[kit.number], color = rgb(...kit.trim)
		rows.forEach((row, r) => [...row].forEach((cell, c) => {
			if (cell !== '#') return
			const ix = Math.round(back.sx) - 1 + c, iy = Math.round(back.sy) - 2 + r
			const i = iy * W + ix
			if (ix >= 0 && iy >= 0 && ix < W && iy < H && Math.abs(zb[i] - back.d) < 3) pix[i] = color
		}))
	}
}

function drawKeeper(keeper, t, kit) {
	const { spheres, axis } = keeperHitArea(keeper, t)
	const [legs, body, head, handA, handB] = spheres
	const at = (s, along, side = 0) => E(KEEPER_X, s.y + axis.y * along + axis.z * side, Math.max(0.06, s.z + axis.z * along - axis.y * side))
	const hips = at(body, -0.28), shoulders = at(body, 0.26)
	for (const side of [-1, 1]) {
		const hip = at(body, -0.3, side * 0.1), knee = at(legs, 0.05, side * 0.14), foot = at(legs, -0.4, side * 0.2)
		const hem = lerp3(hip, knee, 0.6)
		dynamicAdd(hip, hem, 0.13 * K, 0.12 * K, () => kit.shorts)
		dynamicAdd(hem, knee, 0.09 * K, 0.085 * K, () => kit.skin)
		dynamicAdd(knee, foot, 0.085 * K, 0.07 * K, () => kit.socks)
		sphere(...foot, 0.075 * K, kit.boots, 'solid')
	}
	dynamicAdd(hips, shoulders, 0.2 * K, 0.22 * K, () => kit.shirt)
	sphere(...at(body, 0.36), 0.12 * K, kit.trim, 'solid') // collar
	for (const [side, hand] of [[1, handA], [-1, handB]]) {
		const glove = E(KEEPER_X, hand.y, hand.z)
		dynamicAdd(at(body, 0.24, side * 0.22), lerp3(at(body, 0.24, side * 0.22), glove, 0.85), 0.075 * K, 0.065 * K, () => kit.shirt)
		sphere(...glove, 0.1 * K, kit.gloves, 'solid')
	}
	sphere(...E(KEEPER_X, head.y, head.z), 0.15 * K, kit.skin, 'solid')
	sphere(...at(head, 0.05, 0), 0.13 * K, kit.hair, 'solid')
}

// The kicker for this turn: where it stands, which way it faces and how it moves.
function drawKicker() {
	const kit = game.shooter === 'player' ? HOME : AWAY
	const behind = [SPOT.x + 0.55, -0.45]
	let pos = behind, yaw = Math.PI - 0.25, pose = { scale: 0.95, stance: 0.18, armL: 0.25, armR: 0.25 }
	const t = game.phaseTime
	if (game.phase === 'aim' || game.phase === 'charge') {
		pos = [SPOT.x + 1.9, -1.3]
		pose.crouch = game.phase === 'charge' ? game.power * 0.3 : 0
		pose.z = STILL ? 0 : Math.max(0, Math.sin(game.time * 2.2)) * 0.03 // a little bounce on the toes
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
		pose = { scale: 0.95, stance: lerp(0.45, 0.3, follow), lean: 0.2, armL: 1.3, armR: 0.7, kick: Math.sin(Math.min(1, game.simT / 0.35) * Math.PI) }
		pos = [behind[0] - follow * 0.5, behind[1] + follow * 0.2]
	}
	const [ex, ey] = E(pos[0], pos[1])
	footballer(ex, ey, yaw, pose, kit)
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
	const r = BALL_SIZE
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
	drawCrowd()
	drawKicker()
	drawKeeper(game.keeper, keeperClock(), isDefending() ? HOME_KEEPER : AWAY_KEEPER)
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
	const homeHappy = mine === (outcome === 'goal')
	sound.play(homeHappy ? 'cheer' : 'groan')
	if (homeHappy) game.cheerAt = game.time
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
