import type { EngineType } from '../aircraft/types.ts';

export class EngineAudio {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private propOsc: OscillatorNode | null = null;
  private jetNoise: AudioBufferSourceNode | null = null;
  private jetFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private propGain: GainNode | null = null;
  private jetGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windBuffer: AudioBuffer | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private started = false;
  private engineType: EngineType = 'prop';

  async init(): Promise<void> {
    if (this.started) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.engineGain = this.ctx.createGain();
    this.propGain = this.ctx.createGain();
    this.jetGain = this.ctx.createGain();
    this.windGain = this.ctx.createGain();
    const master = this.ctx.createGain();
    master.gain.value = 0.35;
    master.connect(this.ctx.destination);

    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 90;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(master);

    this.propOsc = this.ctx.createOscillator();
    this.propOsc.type = 'triangle';
    this.propOsc.frequency.value = 180;
    this.propOsc.connect(this.propGain);
    this.propGain.connect(master);

    const jetBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
    const jetData = jetBuffer.getChannelData(0);
    for (let i = 0; i < jetData.length; i++) {
      jetData[i] = (Math.random() * 2 - 1) * 0.5;
    }
    this.jetNoise = this.ctx.createBufferSource();
    this.jetNoise.buffer = jetBuffer;
    this.jetNoise.loop = true;
    this.jetFilter = this.ctx.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.frequency.value = 420;
    this.jetFilter.Q.value = 0.65;
    this.jetNoise.connect(this.jetFilter);
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(master);

    const bufferSize = this.ctx.sampleRate * 2;
    this.windBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.windBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.2;
    }
    this.windSource = this.ctx.createBufferSource();
    this.windSource.buffer = this.windBuffer;
    this.windSource.loop = true;
    this.windSource.connect(this.windGain);
    this.windGain.connect(master);

    this.engineOsc.start();
    this.propOsc.start();
    this.jetNoise.start();
    this.windSource.start();
    this.started = true;
    this.applyEngineType();
  }

  setEngineType(type: EngineType): void {
    this.engineType = type;
    if (this.started) this.applyEngineType();
  }

  private applyEngineType(): void {
    if (!this.propGain || !this.jetGain || !this.engineGain || !this.engineOsc || !this.jetFilter) return;
    const now = this.ctx?.currentTime ?? 0;

    switch (this.engineType) {
      case 'jet':
        this.engineOsc.type = 'sine';
        this.engineOsc.frequency.setValueAtTime(42, now);
        this.jetFilter.type = 'bandpass';
        this.jetFilter.frequency.setValueAtTime(520, now);
        this.jetFilter.Q.setValueAtTime(0.55, now);
        this.propGain.gain.setTargetAtTime(0, now, 0.015);
        this.engineGain.gain.setTargetAtTime(0.025, now, 0.02);
        this.jetGain.gain.setTargetAtTime(0.28, now, 0.02);
        break;
      case 'turboprop':
        this.engineOsc.type = 'sawtooth';
        this.jetFilter.type = 'lowpass';
        this.jetFilter.frequency.setValueAtTime(1100, now);
        this.jetFilter.Q.setValueAtTime(0.7, now);
        this.propGain.gain.setTargetAtTime(0.05, now, 0.02);
        this.jetGain.gain.setTargetAtTime(0.04, now, 0.02);
        this.engineGain.gain.setTargetAtTime(0.1, now, 0.02);
        break;
      default:
        this.engineOsc.type = 'sawtooth';
        this.jetFilter.type = 'lowpass';
        this.jetFilter.frequency.setValueAtTime(900, now);
        this.jetFilter.Q.setValueAtTime(0.7, now);
        this.propGain.gain.setTargetAtTime(0.05, now, 0.02);
        this.jetGain.gain.setTargetAtTime(0, now, 0.02);
        this.engineGain.gain.setTargetAtTime(0.1, now, 0.02);
        break;
    }
  }

  update(throttle: number, airspeedKts: number): void {
    if (!this.ctx || !this.engineOsc || !this.propOsc || !this.jetNoise || !this.jetFilter) return;
    const t = throttle;
    const spd = Math.min(airspeedKts / 120, 1);
    const now = this.ctx.currentTime;

    if (this.engineType === 'jet') {
      const core = 0.02 + t * 0.04;
      const roar = 0.18 + t * 0.42 + spd * 0.12;
      this.engineOsc.frequency.setTargetAtTime(38 + t * 55 + spd * 25, now, 0.06);
      this.jetNoise.playbackRate.setTargetAtTime(0.85 + t * 1.8 + spd * 0.5, now, 0.06);
      this.jetFilter.frequency.setTargetAtTime(380 + t * 900 + spd * 500, now, 0.08);
      this.jetFilter.Q.setTargetAtTime(0.45 + t * 0.35, now, 0.08);
      this.engineGain!.gain.setTargetAtTime(core, now, 0.05);
      this.jetGain!.gain.setTargetAtTime(roar, now, 0.05);
      this.propGain!.gain.setTargetAtTime(0, now, 0.01);
    } else if (this.engineType === 'turboprop') {
      this.engineOsc.frequency.setTargetAtTime(60 + t * 100, now, 0.05);
      this.propOsc.frequency.setTargetAtTime(90 + t * 320, now, 0.05);
      this.jetNoise.playbackRate.setTargetAtTime(0.5 + t * 0.8, now, 0.05);
      this.engineGain!.gain.setTargetAtTime(0.06 + t * 0.12, now, 0.05);
      this.propGain!.gain.setTargetAtTime(0.02 + t * 0.07, now, 0.05);
      this.jetGain!.gain.setTargetAtTime(0.02 + t * 0.05, now, 0.05);
    } else {
      this.engineOsc.frequency.setTargetAtTime(70 + t * 120, now, 0.05);
      this.propOsc.frequency.setTargetAtTime(120 + t * 400, now, 0.05);
      this.engineGain!.gain.setTargetAtTime(0.08 + t * 0.12, now, 0.05);
      this.propGain!.gain.setTargetAtTime(0.03 + t * 0.08, now, 0.05);
      this.jetGain!.gain.setTargetAtTime(0, now, 0.05);
    }

    this.windGain!.gain.setTargetAtTime(spd * 0.15, now, 0.08);
  }

  dispose(): void {
    this.engineOsc?.stop();
    this.propOsc?.stop();
    this.jetNoise?.stop();
    this.windSource?.stop();
    void this.ctx?.close();
  }
}
