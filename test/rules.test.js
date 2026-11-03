import test from 'node:test'
import assert from 'node:assert/strict'
import * as R from '../dist/rules.js'

const { GOAL, BALL_R, ZONES } = R
const POST_Y = GOAL.halfWidth + GOAL.postR
const BAR_Z = GOAL.height + GOAL.postR
const straight = (y, z, speed = 22, keeper) => R.simulateShot({ target: { y, z }, speed, curve: 0, keeper })
const rolling = vx => R.simulateShot({ ball: { x: 1, y: 0, z: BALL_R, vx: -vx, vy: 0, vz: 0 } })
const fullDive = (target, start = -1) => ({ target, start, diveTime: R.PLAYER_DIVE_TIME })
const rate = (n, fn) => { let k = 0; for (let s = 1; s <= n; s++) if (fn(s)) k++; return k / n }

// ── shot outcome by aim zone and power ──

test('a sweet-spot shot into every zone of an empty goal scores', () => {
	for (const zone of ZONES) {
		const aim = { y: zone.y * 1.1, z: zone.z }
		assert.equal(R.shotResult({ aim, power: 0.78, seed: 5 }).outcome, 'goal', `zone ${zone.col},${zone.row}`)
	}
})

test('zoneOf maps aim points onto the 3 by 2 grid', () => {
	ZONES.forEach((zone, i) => assert.equal(R.zoneOf(zone), i))
	assert.equal(R.zoneOf({ y: -4.2, z: 2.9 }), 3, 'a miss over the left corner still reads as top left')
})

test('near the sweet spot the ball goes where you aimed', () => {
	const aim = { y: 1.5, z: 1.2 }
	assert.ok(rate(200, seed => {
		const { target } = R.shotResult({ aim, power: 0.78, seed })
		return Math.hypot(target.y - aim.y, target.z - aim.z) < 0.3
	}) > 0.95)
})

test('too much power drifts the ball, mostly over the bar', () => {
	const results = Array.from({ length: 200 }, (_, i) => R.shotResult({ aim: { y: 1.5, z: 1.8 }, power: 1, seed: i + 1 }).outcome)
	assert.ok(results.filter(o => o === 'goal').length < 40)
	assert.ok(results.filter(o => o === 'over').length > 100)
})

test('too little power gives the keeper time to reach it', () => {
	const aim = { y: ZONES[2].y, z: ZONES[2].z }
	const keeper = { target: aim, start: 0.32, diveTime: 0.62 } // slow, easy keeper
	assert.ok(rate(100, seed => R.shotResult({ aim, power: 0.2, accuracy: 1, seed, keeper }).outcome === 'saved') > 0.9)
	assert.equal(rate(100, seed => R.shotResult({ aim, power: 0.78, seed, keeper }).outcome === 'goal'), 1)
})

test('a hard, well placed shot is unsaveable even for a hard keeper that reads it', () => {
	const aim = { y: 3.3, z: 2.1 }
	const { reaction, diveTime } = R.DIFFICULTY.hard
	assert.equal(rate(100, seed => R.shotResult({ aim, power: 0.8, seed, keeper: { target: aim, start: reaction, diveTime } }).outcome === 'goal'), 1)
})

test('the same seed gives the same result', () => {
	const args = { aim: { y: -2, z: 1.9 }, power: 0.93, keeper: fullDive({ y: -2.4, z: 1.8 }, 0.2), seed: 1234 }
	const a = R.shotResult(args), b = R.shotResult(args)
	assert.equal(a.outcome, b.outcome)
	assert.deepEqual(a.frames, b.frames)
	assert.notDeepEqual(R.shotResult({ ...args, seed: 99 }).target, a.target)
})

// ── keeper ──

test('a shot straight at a standing keeper is saved', () => {
	assert.equal(straight(0, 1, 22, { target: null, start: 0, diveTime: 0.5 }).outcome, 'saved')
})

test('a full dive into the right corner zone saves the shot', () => {
	for (const zone of ZONES.filter(z => z.col)) {
		const r = straight(zone.y, zone.z, 20, fullDive(zone))
		assert.equal(r.outcome, 'saved', `zone ${zone.col},${zone.row}`)
	}
})

test('diving the wrong way lets it in', () => {
	assert.equal(straight(2.4, 0.6, 20, fullDive({ y: -2.44, z: 0.61 })).outcome, 'goal')
})

test('a ball that only meets the gloves is a fingertip save', () => {
	const area = R.keeperHitArea(fullDive({ y: 2.44, z: 1.83 }), 0)
	const hand = area.spheres.find(s => s.part === 'hand' && s.z > 1.9)
	const r = straight(hand.y + 0.22, hand.z + 0.12, 20, fullDive({ y: 2.44, z: 1.83 }))
	assert.equal(r.outcome, 'saved')
	assert.equal(r.fingertip, true)
})

test('a late dive covers less distance', () => {
	const keeper = fullDive({ y: 2.44, z: 0.61 }, 0.3)
	const early = R.keeperHitArea(keeper, 0.8).center, late = R.keeperHitArea(keeper, 0.5).center
	assert.ok(late.y < early.y)
	assert.equal(R.keeperHitArea(keeper, 0.2).center.y, 0, 'no movement before the dive starts')
	assert.equal(straight(2.6, 0.6, 22, keeper).outcome, 'goal')
})

test('the AI keeper never reads the aim perfectly, and reads better on harder levels', () => {
	const aim = { y: 2.8, z: 0.5 }
	const read = level => rate(2000, seed => R.keeperDive(aim, level, R.rng(seed), 0.78).zone === R.zoneOf(aim))
	assert.ok(read('easy') < read('medium') && read('medium') < read('hard'))
	assert.ok(read('hard') < 0.8)
	assert.ok(R.keeperDive(aim, 'hard', R.rng(1)).start > 0, 'it always needs time to react')
})

// ── goal detection against the frame ──

test('a ball resting on the line is not a goal; over the line it is', () => {
	assert.notEqual(rolling(1.344).outcome, 'goal')
	assert.equal(rolling(2).outcome, 'goal')
})

test('the post: just outside bounces out, just inside goes in', () => {
	const out = straight(POST_Y + 0.15, 1)
	assert.equal(out.outcome, 'post')
	const inside = straight(POST_Y - 0.15, 1)
	assert.equal(inside.outcome, 'goal')
	assert.ok(inside.events.some(e => e.type === 'post'))
})

test('the crossbar: just over is a bar hit, just under goes down and in', () => {
	assert.equal(straight(1, BAR_Z + 0.12).outcome, 'bar')
	const under = straight(1, BAR_Z - 0.15)
	assert.equal(under.outcome, 'goal')
	assert.ok(under.events.some(e => e.type === 'bar'))
})

test('clear misses are wide or over', () => {
	assert.equal(straight(POST_Y + 0.5, 1).outcome, 'wide')
	assert.equal(straight(-POST_Y - 0.5, 0.3).outcome, 'wide')
	assert.equal(straight(0, BAR_Z + 0.5).outcome, 'over')
})

// ── shootout ──

const play = outcomes => outcomes.reduce((s, o) => R.recordKick(s, o), R.newShootout())
const G = 'goal', X = 'saved'

test('kicks alternate, player first', () => {
	const s = play([G])
	assert.equal(s.turn, 'cpu')
	assert.equal(R.kickNumber(s), 1)
	assert.equal(R.kickNumber(R.recordKick(s, X)), 2)
})

test('3-0 after three kicks each ends it early', () => {
	const s = play([G, X, G, X, G])
	assert.equal(s.over, false, 'the CPU can still reach 3 with three kicks left')
	const done = R.recordKick(s, X)
	assert.equal(done.over, true)
	assert.equal(done.winner, 'player')
	assert.throws(() => R.recordKick(done, G))
})

test('the CPU wins early too', () => {
	const s = play([X, G, X, G, X, G])
	assert.equal(s.over, true)
	assert.equal(s.winner, 'cpu')
	assert.equal(s.player.length, 3)
})

test('a tie after five each goes to sudden death', () => {
	let s = play([G, G, X, X, G, G, G, G, X, X])
	assert.equal(s.over, false)
	assert.equal(R.isSuddenDeath(s), true)
	s = R.recordKick(s, G)
	assert.equal(s.over, false, 'the CPU still gets its kick')
	s = R.recordKick(s, G)
	assert.equal(s.over, false, 'both scored, next round')
	s = R.recordKick(s, X)
	s = R.recordKick(s, G)
	assert.equal(s.over, true)
	assert.equal(s.winner, 'cpu')
})

test('sudden death: player scores, CPU misses, player wins', () => {
	const s = play([G, G, G, G, G, G, G, G, G, G, G, 'over'])
	assert.equal(s.winner, 'player')
	assert.deepEqual(R.shootoutResult(s), {
		winner: 'player', player: 6, cpu: 5, suddenDeath: true,
		history: { player: Array(6).fill('goal'), cpu: [...Array(5).fill('goal'), 'missed'] },
	})
})

test('final result counts goals and buckets each kick', () => {
	const s = play([G, 'post', 'wide', X, 'bar', G, G, 'over', G])
	assert.equal(s.over, true)
	assert.deepEqual(R.shootoutResult(s), {
		winner: 'player', player: 3, cpu: 1, suddenDeath: false,
		history: { player: ['goal', 'missed', 'post', 'goal', 'goal'], cpu: ['post', 'saved', 'goal', 'missed'] },
	})
})

test('a full AI shootout plays through to a consistent result', () => {
	for (let seed = 1; seed <= 30; seed++) {
		const random = R.rng(seed)
		let s = R.newShootout()
		while (!s.over) {
			const kick = R.aiKick('medium', random)
			const keeper = R.keeperDive(kick.aim, 'medium', random, kick.power)
			s = R.recordKick(s, R.shotResult({ ...kick, keeper }).outcome)
			assert.ok(s.player.length < 40)
		}
		const r = R.shootoutResult(s)
		assert.ok(r.winner === 'player' ? r.player > r.cpu : r.cpu > r.player)
	}
})
