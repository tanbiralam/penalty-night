// Penalty Night rules: ball flight, goal frame, keeper, AI choices and the shootout.
// Pure module with no DOM, so `node --test` can check it. Units are metres and seconds.
// World: goal line on x = 0, the kicker shoots from the spot toward -x, y runs along the line, z is up.

export const BALL_R = 0.11
export const GRAVITY = 9.81
export const GOAL = { halfWidth: 3.66, height: 2.44, postR: 0.06, depth: 2 }
export const SPOT = { x: 11, y: 0 }
export const KEEPER_X = 0.35
/** The aim marker may leave the frame by this much, so misses are possible on purpose. */
export const AIM_MARGIN = { side: 0.9, top: 0.7 }
/** Power bar sweet spot (0–1). Inside it the ball goes where you aimed. */
export const SWEET = { lo: 0.72, hi: 0.84 }
export const PLAYER_DIVE_TIME = 0.5
export const REGULATION = 5

const LINE = -GOAL.postR - BALL_R // the whole ball is over the line once its centre passes this
const BODY_REACH = 1.9
const STEP = 1 / 480

/** 3 columns (−1 left, 0 centre, 1 right in +y order) by 2 rows (0 low, 1 high). Index = row * 3 + col + 1. */
export const ZONES = [0, 1].flatMap(row => [-1, 0, 1].map(col => ({ col, row, y: col * 2.44, z: row ? 1.83 : 0.61 })))

export const DIFFICULTY = {
	easy: { reaction: 0.32, diveTime: 0.62, read: 0.35, precision: 0.3, stay: 0.1, kicker: { spread: 0.17, corner: 0.55, honesty: 0.9 } },
	medium: { reaction: 0.24, diveTime: 0.54, read: 0.5, precision: 0.5, stay: 0.08, kicker: { spread: 0.11, corner: 0.75, honesty: 0.75 } },
	hard: { reaction: 0.17, diveTime: 0.48, read: 0.62, precision: 0.7, stay: 0.06, kicker: { spread: 0.07, corner: 0.95, honesty: 0.6 } },
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t

/** Seeded PRNG (mulberry32), returns floats in [0, 1). */
export function rng(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
const gauss = random => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random())

export function zoneOf({ y, z }) {
	const col = y < -1.22 ? -1 : y > 1.22 ? 1 : 0
	return (z > 1.22 ? 3 : 0) + col + 1
}

/** 1 inside the sweet spot, falling to 0 at 0.3 away from it. */
export function powerAccuracy(power) {
	const off = power < SWEET.lo ? SWEET.lo - power : power > SWEET.hi ? power - SWEET.hi : 0
	return clamp(1 - off / 0.3, 0, 1)
}
export const shotSpeed = power => 11 + 15 * clamp(power, 0, 1)

/** Ball on the spot with the velocity that reaches `target` on the goal line, bending by `curve` m/s² sideways. */
export function launch(target, speed, curve = 0) {
	const T = SPOT.x / speed
	return {
		x: SPOT.x, y: SPOT.y, z: BALL_R,
		vx: -speed,
		vy: (target.y - SPOT.y - 0.5 * curve * T * T) / T,
		vz: (target.z - BALL_R + 0.5 * GRAVITY * T * T) / T,
		curve,
	}
}

/**
 * Keeper hit area at time t (seconds after the strike) as spheres in the (y, z) plane at KEEPER_X.
 * keeper = { target: {y, z} | null, start, diveTime }; target null means stay standing in the middle.
 */
export function keeperHitArea(keeper, t) {
	let p = 0, uy = 0, uz = 1, travel = 0
	if (keeper?.target) {
		const k = clamp((t - keeper.start) / keeper.diveTime, 0, 1)
		p = 1 - (1 - k) * (1 - k)
		const dy = keeper.target.y, dz = keeper.target.z - 1
		const d = Math.hypot(dy, dz)
		if (d > 0.01) { uy = dy / d; uz = dz / d }
		travel = Math.min(d, BODY_REACH) * p
	}
	const cy = uy * travel, cz = 1 + uz * travel
	// the body tips from upright toward the dive direction
	let ay = lerp(0, uy, p), az = lerp(1, uz, p)
	const n = Math.hypot(ay, az) || 1
	ay /= n; az /= n
	const reach = 0.25 + 0.95 * p, spread = lerp(0.55, 0.12, p)
	const at = (along, side, r, part) => ({ y: cy + ay * along + az * side, z: Math.max(r, cz + az * along - ay * side), r, part })
	return {
		p, axis: { y: ay, z: az }, center: { y: cy, z: cz },
		spheres: [
			at(-0.55, 0, 0.27, 'legs'), at(0, 0, 0.32, 'body'), at(0.55, 0, 0.14, 'head'),
			at(reach, spread, 0.2, 'hand'), at(reach, -spread, 0.2, 'hand'),
		],
	}
}

// Bounces the ball off a sphere; true only for a real impact (ball moving into it).
function bounceOff(ball, cx, cy, cz, r, restitution) {
	const dx = ball.x - cx, dy = ball.y - cy, dz = ball.z - cz
	const d = Math.hypot(dx, dy, dz), min = r + BALL_R
	if (d >= min || d === 0) return false
	const nx = dx / d, ny = dy / d, nz = dz / d
	ball.x = cx + nx * min; ball.y = cy + ny * min; ball.z = cz + nz * min
	const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz
	if (vn >= 0) return false
	ball.vx -= (1 + restitution) * vn * nx
	ball.vy -= (1 + restitution) * vn * ny
	ball.vz -= (1 + restitution) * vn * nz
	return true
}

const POST_Y = GOAL.halfWidth + GOAL.postR, BAR_Z = GOAL.height + GOAL.postR
function hitFrame(ball) {
	for (const side of [-1, 1]) {
		if (bounceOff(ball, 0, side * POST_Y, clamp(ball.z, 0, BAR_Z), GOAL.postR, 0.6)) return 'post'
	}
	if (Math.abs(ball.y) < POST_Y && bounceOff(ball, 0, ball.y, BAR_Z, GOAL.postR, 0.6)) return 'bar'
	return null
}

// Keeps the ball inside the net once it is in, and outside it when it passes by.
function hitNet(ball, prev) {
	const { halfWidth: hw, height: h, depth } = GOAL
	if (ball.x > 0 || ball.x < -depth - BALL_R) return false
	if (ball.inGoal) {
		let hit = false
		if (ball.x < -depth + BALL_R) { ball.x = -depth + BALL_R; ball.vx *= -0.1; ball.vy *= 0.5; ball.vz *= 0.5; hit = true }
		if (Math.abs(ball.y) > hw - BALL_R) { ball.y = Math.sign(ball.y) * (hw - BALL_R); ball.vy *= -0.15; ball.vx *= 0.6; hit = true }
		if (ball.z > h - BALL_R) { ball.z = h - BALL_R; ball.vz *= -0.1; ball.vx *= 0.6; hit = true }
		return hit
	}
	const inside = Math.abs(ball.y) < hw + BALL_R && ball.z < h + BALL_R
	if (!inside) return false
	if (Math.abs(prev.y) >= hw + BALL_R) { ball.y = Math.sign(prev.y) * (hw + BALL_R); ball.vy *= -0.2; ball.vx *= 0.6 }
	else if (prev.z >= h + BALL_R) { ball.z = h + BALL_R; ball.vz *= -0.2; ball.vx *= 0.6 }
	else return false
	return true
}

/** Advances the ball by dt. Pushes { t, type } events: goal, out, post, bar, keeper, fingertip, net, ground. */
export function stepBall(ball, dt, keeper, t, events) {
	const prev = { x: ball.x, y: ball.y, z: ball.z }
	const airborne = ball.z > BALL_R + 0.001
	if (!ball.touched && ball.x > 0) ball.vy += ball.curve * dt
	if (airborne || ball.vz > 0) ball.vz -= GRAVITY * dt
	else { const f = Math.exp(-1.2 * dt); ball.vx *= f; ball.vy *= f }
	ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt

	if (ball.z < BALL_R) {
		ball.z = BALL_R
		if (ball.vz < -0.6) { events.push({ t, type: 'ground', speed: -ball.vz }); ball.vz *= -0.45; ball.vx *= 0.85; ball.vy *= 0.85 } else ball.vz = 0
	}

	const frame = hitFrame(ball)
	if (frame) { ball.touched = true; ball.frame = frame; events.push({ t, type: frame }) }

	if (keeper && ball.x > KEEPER_X - 0.6 && ball.x < KEEPER_X + 0.6) {
		for (const s of keeperHitArea(keeper, t).spheres) {
			if (bounceOff(ball, KEEPER_X, s.y, s.z, s.r, s.part === 'hand' ? 0.25 : 0.35)) {
				// gloves and body take most of the pace: a block comes back out, a hand pushes it away from goal
				const speed = Math.hypot(ball.vx, ball.vy, ball.vz)
				if (s.part === 'hand') {
					const dy = ball.y - s.y, dz = ball.z - s.z, d = Math.hypot(dy, dz) || 1
					ball.vx = Math.max(ball.vx, -0.2 * speed)
					ball.vy += (dy / d) * 0.25 * speed
					ball.vz += (dz / d) * 0.25 * speed
				} else ball.vx = Math.abs(ball.vx) * 0.3 + 1
				const first = !ball.keeper
				ball.touched = ball.keeper = true
				if (first) ball.keeperPart = s.part
				events.push({ t, type: 'keeper', part: s.part })
				break
			}
		}
	}

	if (!ball.inGoal && !ball.crossed && prev.x >= LINE && ball.x < LINE) {
		const k = (prev.x - LINE) / (prev.x - ball.x)
		const y = lerp(prev.y, ball.y, k), z = lerp(prev.z, ball.z, k)
		ball.crossed = true
		if (Math.abs(y) < GOAL.halfWidth && z < GOAL.height) { ball.inGoal = true; events.push({ t, type: 'goal' }) }
		else { ball.missed = z >= GOAL.height ? 'over' : 'wide'; events.push({ t, type: 'out' }) }
	}
	if (hitNet(ball, prev)) events.push({ t, type: 'net', speed: Math.hypot(ball.vx, ball.vy, ball.vz) })
}

function outcomeOf(ball) {
	if (ball.inGoal) return 'goal'
	if (ball.keeper) return 'saved'
	if (ball.frame) return ball.frame
	return ball.missed || 'saved'
}

/**
 * Runs the whole shot. Pass `target` + `speed` (+ `curve`) or a ready `ball`.
 * keeper undefined = empty goal. Returns outcome, 60 fps frames and timed events.
 */
export function simulateShot({ target, speed, curve = 0, keeper, ball = launch(target, speed, curve), duration = 2.6 }) {
	ball = { touched: false, keeper: false, inGoal: false, crossed: false, missed: null, frame: null, curve: 0, ...ball }
	const events = [], frames = []
	let decided = Infinity
	for (let t = 0, i = 0; t < duration; t += STEP, i++) {
		if (i % 8 === 0) frames.push({ t, x: ball.x, y: ball.y, z: ball.z })
		stepBall(ball, STEP, keeper, t, events)
		if (decided === Infinity && (ball.crossed || ball.x > SPOT.x + 2 || (ball.keeper && ball.vx > 0))) decided = t
		if (t > decided + 1.4) break
	}
	const save = events.find(e => e.type === 'keeper')
	const outcome = outcomeOf(ball)
	return {
		outcome, frames, events,
		fingertip: outcome === 'saved' && ball.keeperPart === 'hand',
		decidedAt: Math.min(decided, duration),
		strikeTime: save?.t,
	}
}

/**
 * The shot result: aim {y, z} on the goal line, power 0–1, accuracy 0–1 (defaults from power),
 * keeper dive (see keeperHitArea). Same seed, same result.
 */
export function shotResult({ aim, power, accuracy = powerAccuracy(power), keeper, seed = 1 }) {
	const random = rng(seed)
	const over = power > SWEET.hi
	const spread = 0.08 + (1 - accuracy) * (over ? 2.6 : 0.3)
	const gy = gauss(random), gz = gauss(random)
	const target = {
		y: aim.y + gy * spread,
		// an overhit ball rises: that is what sends it over the bar
		z: Math.max(0, aim.z + (over ? Math.abs(gz) + 0.4 : gz) * spread),
	}
	const curve = (random() * 2 - 1) * 2.5
	return { ...simulateShot({ target, speed: shotSpeed(power), curve, keeper }), target, accuracy, aim, power }
}

/** AI keeper: decides at the moment of the shot, reading slow shots better. Never reads the aim perfectly. */
export function keeperDive(aim, level, random, power = SWEET.hi) {
	const d = DIFFICULTY[level]
	const base = { start: d.reaction, diveTime: d.diveTime }
	if (random() < d.stay) return { ...base, target: null, zone: null }
	const real = zoneOf(aim)
	let zone = real
	if (random() >= Math.min(0.85, d.read + Math.max(0, SWEET.hi - power) * 0.6)) {
		zone = Math.floor(random() * 5)
		if (zone >= real) zone++
	}
	const z = ZONES[zone]
	const target = zone === real
		? { y: lerp(z.y, aim.y, d.precision) + gauss(random) * 0.35, z: clamp(lerp(z.z, aim.z, d.precision) + gauss(random) * 0.25, 0.3, 2.3) }
		: { y: z.y, z: z.z }
	return { ...base, target, zone }
}

/** The keeper the player controls: dives to zone index (or null to stay) at `start` seconds after the strike. */
export const playerDive = (zone, start) => ({ target: zone == null ? null : { y: ZONES[zone].y, z: ZONES[zone].z }, zone, start, diveTime: PLAYER_DIVE_TIME })

/** AI kicker: where it aims, how hard, and the lean it shows in the run-up (−1, 0, 1). */
export function aiKick(level, random) {
	const d = DIFFICULTY[level].kicker
	const corner = random() < d.corner
	const side = random() < 0.5 ? -1 : 1
	const high = random() < 0.4
	const y = corner ? side * (2.3 + random() * 1.1) : (random() * 2 - 1) * 1.2
	const z = high ? 1.4 + random() * 0.85 : 0.2 + random() * 0.7
	const power = clamp((SWEET.lo + SWEET.hi) / 2 + gauss(random) * d.spread, 0.3, 1)
	const honest = Math.sign(Math.round(y * 10))
	const tell = random() < d.honesty ? honest : honest ? -honest : side
	return { aim: { y, z }, power, tell, pause: 0.2 + random() * 0.35, seed: Math.floor(random() * 2 ** 31) }
}

// ── Shootout state machine ──────────────────────────────────────────────

export const goals = kicks => kicks.filter(k => k === 'goal').length
export const newShootout = () => ({ player: [], cpu: [], turn: 'player', over: false, winner: null })
export const kickNumber = s => s[s.turn].length + 1
export const isSuddenDeath = s => kickNumber(s) > REGULATION

/** Records the kick taker's outcome and ends the shootout as soon as one side cannot catch up. */
export function recordKick(s, outcome) {
	if (s.over) throw new Error('The shootout is over')
	const next = { ...s, [s.turn]: [...s[s.turn], outcome], turn: s.turn === 'player' ? 'cpu' : 'player' }
	// kicks still owed this round: 5 in regulation, then one per sudden-death round
	const round = Math.max(REGULATION, next.player.length, next.cpu.length)
	const gp = goals(next.player), gc = goals(next.cpu)
	if (gp > gc + round - next.cpu.length || gc > gp + round - next.player.length) {
		next.over = true
		next.winner = gp > gc ? 'player' : 'cpu'
	}
	return next
}

export function shootoutResult(s) {
	return {
		winner: s.winner,
		player: goals(s.player),
		cpu: goals(s.cpu),
		suddenDeath: s.player.length > REGULATION,
		history: { player: s.player.map(historyKind), cpu: s.cpu.map(historyKind) },
	}
}

/** History bucket for the tracker and result screen: goal, saved, missed or post. */
export const historyKind = o => (o === 'wide' || o === 'over' ? 'missed' : o === 'bar' ? 'post' : o)
