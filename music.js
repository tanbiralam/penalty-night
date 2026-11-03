// A soft, original 68 BPM loop built sample by sample: warm pad chords, a round bass and a few bell notes.
// Notes that ring past the end wrap to the start, so the loop is seamless.
const BPM = 68
const BEAT = 60 / BPM
const BARS = 8
const midi = n => 440 * 2 ** ((n - 69) / 12)

// D major: Dmaj9 · Bm7 · Gmaj7 · A6sus, two bars each
const CHORDS = [
	{ root: 38, notes: [62, 66, 69, 73, 76] },
	{ root: 35, notes: [59, 62, 66, 69, 74] },
	{ root: 31, notes: [59, 62, 66, 67, 71] },
	{ root: 33, notes: [61, 64, 66, 69, 74] },
]
// bell line, in eighth notes per two-bar chord: [eighth, chord tone index (+5 = octave up)]
const BELLS = [[0, 2], [3, 4], [6, 3], [9, 7], [12, 4], [14, 2]]

export function createMusicBuffer(ctx) {
	const rate = ctx.sampleRate
	const length = Math.round(BARS * 4 * BEAT * rate)
	const buffer = ctx.createBuffer(2, length, rate)
	const left = buffer.getChannelData(0), right = buffer.getChannelData(1)

	function voice(start, duration, freq, volume, shape, pan = 0) {
		const n = Math.round(duration * rate), s0 = Math.round(start * rate)
		const w = 2 * Math.PI * freq / rate
		const gl = volume * (1 - pan) / 2, gr = volume * (1 + pan) / 2
		for (let i = 0; i < n; i++) {
			const v = shape(i / rate, i * w, duration)
			const j = (s0 + i) % length
			left[j] += v * gl
			right[j] += v * gr
		}
	}
	// pad: two slightly detuned sines with a slow swell and a long release
	const pad = (t, p, d) => {
		const env = Math.min(1, t / 1.6) * Math.min(1, Math.max(0, (d - t) / 2.2))
		return env * (Math.sin(p) + 0.6 * Math.sin(p * 1.003 + 1) + 0.12 * Math.sin(p * 2))
	}
	const bass = (t, p) => Math.min(1, t / 0.04) * Math.exp(-t * 1.6) * (Math.sin(p) + 0.25 * Math.sin(p * 2))
	// bell: a struck sine with a faint inharmonic partial
	const bell = (t, p) => Math.min(1, t / 0.005) * (Math.exp(-t * 2.4) * Math.sin(p) + 0.3 * Math.exp(-t * 5) * Math.sin(p * 2.76))

	const chordLength = 8 * BEAT
	CHORDS.forEach((chord, c) => {
		const at = c * chordLength
		chord.notes.forEach((note, i) => voice(at, chordLength + 2.4, midi(note), 0.045, pad, (i / 4 - 0.5) * 0.7))
		for (const beat of [0, 3, 4, 6.5]) voice(at + beat * BEAT, 2.4, midi(chord.root), beat ? 0.11 : 0.16, bass)
		for (const [eighth, tone] of BELLS) {
			const note = chord.notes[tone % 5] + (tone >= 5 ? 12 : 0) + 12
			voice(at + eighth * BEAT / 2, 2.6, midi(note), 0.05, bell, ((eighth % 4) / 2 - 0.75) * 0.8)
		}
	})
	// soft limiter so stacked tails never clip
	for (const data of [left, right]) for (let i = 0; i < length; i++) data[i] = Math.tanh(data[i] * 1.4) / 1.4
	return buffer
}
