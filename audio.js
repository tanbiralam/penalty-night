// Every sound is made here with the Web Audio API: no audio files.
// Modes: 'all' (crowd ambience + effects), 'effects' (no ambience), 'off'.
const AMBIENT_VOLUME = 0.22

export function createAudio() {
	let ctx, master, ambientGain, fx, echo, noise
	let mode = 'all', crowdLevel = 1, echoLevel = 0

	function ensure() {
		if (mode === 'off') return
		const AudioContext = window.AudioContext || window.webkitAudioContext
		if (!AudioContext) return
		if (!ctx) {
			ctx = new AudioContext()
			master = ctx.createGain()
			master.connect(ctx.destination)
			fx = ctx.createGain()
			fx.connect(master)
			// a short echo that each stadium tunes: the street pitch rings between buildings
			const delay = ctx.createDelay(1)
			delay.delayTime.value = 0.14
			const feedback = ctx.createGain()
			feedback.gain.value = 0.3
			echo = ctx.createGain()
			echo.gain.value = echoLevel
			fx.connect(delay).connect(feedback).connect(delay)
			delay.connect(echo).connect(master)
			noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
			const data = noise.getChannelData(0)
			for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
			startAmbient()
		}
		if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume()
	}

	// a murmuring crowd: looped noise through a voice-band filter, its level drifting slowly
	function startAmbient() {
		ambientGain = ctx.createGain()
		ambientGain.gain.value = mode === 'all' ? AMBIENT_VOLUME * crowdLevel : 0
		const source = ctx.createBufferSource()
		source.buffer = noise
		source.loop = true
		const band = ctx.createBiquadFilter()
		band.type = 'bandpass'
		band.frequency.value = 520
		band.Q.value = 0.6
		const low = ctx.createBiquadFilter()
		low.type = 'lowpass'
		low.frequency.value = 1100
		const swell = ctx.createGain()
		swell.gain.value = 0.25
		const lfo = ctx.createOscillator()
		lfo.frequency.value = 0.13
		const depth = ctx.createGain()
		depth.gain.value = 0.08
		lfo.connect(depth).connect(swell.gain)
		source.connect(band).connect(low).connect(swell).connect(ambientGain).connect(master)
		source.start()
		lfo.start()
	}

	const now = () => ctx.currentTime
	const live = () => ctx && mode !== 'off' && ctx.state === 'running'

	function tone(freq, to, duration, volume, type = 'sine', at = now()) {
		const osc = ctx.createOscillator(), gain = ctx.createGain()
		osc.type = type
		osc.frequency.setValueAtTime(freq, at)
		osc.frequency.exponentialRampToValueAtTime(to, at + duration)
		gain.gain.setValueAtTime(volume, at)
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
		osc.connect(gain).connect(fx)
		osc.start(at)
		osc.stop(at + duration + 0.02)
	}

	function burst({ duration, volume, type = 'bandpass', from, to = from, q = 0.8, attack = 0.01, offset = 0 }) {
		const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain()
		const at = now()
		source.buffer = noise
		filter.type = type
		filter.frequency.setValueAtTime(from, at)
		filter.frequency.exponentialRampToValueAtTime(to, at + duration)
		filter.Q.value = q
		gain.gain.setValueAtTime(0.0001, at)
		gain.gain.exponentialRampToValueAtTime(volume, at + attack)
		gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
		source.connect(filter).connect(gain).connect(fx)
		source.start(at, offset)
		source.stop(at + duration + 0.05)
	}

	const sounds = {
		kick() {
			tone(130, 48, 0.16, 0.5)
			burst({ duration: 0.05, volume: 0.25, from: 1800, q: 1.2, attack: 0.002 })
		},
		bounce: ({ speed = 4 } = {}) => tone(110, 50, 0.1, Math.min(0.25, speed * 0.03)),
		glove() {
			tone(180, 70, 0.1, 0.35, 'triangle')
			burst({ duration: 0.08, volume: 0.2, from: 900, attack: 0.003 })
		},
		swish() {
			burst({ duration: 0.45, volume: 0.32, from: 3200, to: 900, q: 0.7, attack: 0.03 })
		},
		clang() {
			// metal frame: inharmonic partials with a long ring
			for (const [f, v, d] of [[520, 0.16, 0.9], [1330, 0.1, 0.7], [2210, 0.07, 0.5], [3460, 0.04, 0.3]]) tone(f, f * 0.98, d, v, 'triangle')
			tone(140, 60, 0.12, 0.3)
		},
		cheer() {
			burst({ duration: 2.6, volume: 0.5 * crowdLevel, from: 700, to: 500, q: 0.5, attack: 0.25, offset: Math.random() * 2 })
			burst({ duration: 2, volume: 0.22 * crowdLevel, from: 1800, to: 1300, q: 1.5, attack: 0.18, offset: Math.random() * 2 })
		},
		groan() {
			burst({ duration: 1.5, volume: 0.36 * crowdLevel, from: 520, to: 260, q: 0.9, attack: 0.15, offset: Math.random() * 2 })
			tone(210, 120, 1.2, 0.05 * crowdLevel, 'sawtooth')
		},
		tick: () => tone(880, 700, 0.04, 0.05, 'square'),
	}

	return {
		unlock: ensure,
		play(kind, options) { if (live()) sounds[kind](options) },
		setMode(next) {
			mode = next
			ensure()
			if (!ctx) return
			master.gain.setTargetAtTime(mode === 'off' ? 0 : 1, now(), 0.03)
			ambientGain.gain.setTargetAtTime(mode === 'all' ? AMBIENT_VOLUME * crowdLevel : 0, now(), 0.05)
		},
		setStadium({ echo: level, crowd }) {
			crowdLevel = crowd
			echoLevel = level
			if (!ctx) return
			echo.gain.setTargetAtTime(echoLevel, now(), 0.05)
			ambientGain.gain.setTargetAtTime(mode === 'all' ? AMBIENT_VOLUME * crowdLevel : 0, now(), 0.3)
		},
		get mode() { return mode },
	}
}
