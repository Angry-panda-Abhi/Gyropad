/**
 * Gyropad Pro - Procedural Motorsport Audio Synthesizer
 * Built entirely with Web Audio API. Zero external audio file dependencies.
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.engineGain = null;
    this.oscLow = null;
    this.oscMid = null;
    this.oscHigh = null;
    this.filter = null;
    this.tireGain = null;
    this.isMuted = false;
    this.initialized = false;

    // Auto-unlock on first user interaction
    const unlockAudio = () => {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Low-pass filter simulating engine bay acoustic chamber
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(320, this.ctx.currentTime);

      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

      // Sub-harmonic rumble (fundamental firing order)
      this.oscLow = this.ctx.createOscillator();
      this.oscLow.type = 'sawtooth';
      this.oscLow.frequency.setValueAtTime(45, this.ctx.currentTime);

      // Mid-harmonic combustion resonance
      this.oscMid = this.ctx.createOscillator();
      this.oscMid.type = 'triangle';
      this.oscMid.frequency.setValueAtTime(90, this.ctx.currentTime);

      // High-order intake / exhaust tone
      this.oscHigh = this.ctx.createOscillator();
      this.oscHigh.type = 'sine';
      this.oscHigh.frequency.setValueAtTime(135, this.ctx.currentTime);

      this.oscLow.connect(this.filter);
      this.oscMid.connect(this.filter);
      this.oscHigh.connect(this.filter);
      this.filter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.oscLow.start();
      this.oscMid.start();
      this.oscHigh.start();

      this.setupTireNoise();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio init skipped:', e);
    }
  }

  setupTireNoise() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.setValueAtTime(950, this.ctx.currentTime);
    this.tireFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    whiteNoise.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

    whiteNoise.start();
  }

  updateEngine(rpmRatio, throttle, speedKmh) {
    if (!this.initialized || !this.ctx || this.isMuted) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Base firing pitch scales from 45Hz at idle to 340Hz at redline
    const baseFreq = 44.0 + Math.pow(rpmRatio, 1.35) * 290.0;
    const now = this.ctx.currentTime;

    this.oscLow.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.oscMid.frequency.setTargetAtTime(baseFreq * 1.5, now, 0.04);
    this.oscHigh.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.04);

    // Filter opens up sharply on throttle application
    const cutoff = 260 + throttle * 1800 + rpmRatio * 1400;
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.04);

    // Dynamic volume
    const vol = 0.15 + throttle * 0.5 + (speedKmh > 5 ? 0.08 : 0.0);
    this.engineGain.gain.setTargetAtTime(vol, now, 0.04);
  }

  updateTireScreech(slipAmount) {
    if (!this.initialized || !this.tireGain || this.isMuted) return;
    const now = this.ctx.currentTime;
    const vol = Math.min(1.0, Math.max(0.0, (slipAmount - 0.22) * 2.0));
    this.tireGain.gain.setTargetAtTime(vol * 0.45, now, 0.04);
  }

  playShiftSound() {
    if (!this.initialized || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.07);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch(e) {}
  }

  playHorn() {
    if (!this.initialized || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      o1.type = 'sawtooth';
      o2.type = 'sawtooth';
      o1.frequency.setValueAtTime(420, now);
      o2.frequency.setValueAtTime(510, now);

      g.gain.setValueAtTime(0.35, now);
      g.gain.setTargetAtTime(0.01, now + 0.35, 0.08);

      o1.connect(g);
      o2.connect(g);
      g.connect(this.masterGain);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.45);
      o2.stop(now + 0.45);
    } catch(e) {}
  }

  playLapDing() {
    if (!this.initialized || this.isMuted) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.setValueAtTime(1380, now + 0.09);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.5);
    } catch(e) {}
  }
}

window.soundEngine = new SoundEngine();
