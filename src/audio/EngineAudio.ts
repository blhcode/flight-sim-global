export class EngineAudio {
  private ctx: AudioContext | null = null;
  private engineOsc: OscillatorNode | null = null;
  private propOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private propGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windBuffer: AudioBuffer | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private started = false;

  async init(): Promise<void> {
    if (this.started) return;
    this.ctx = new AudioContext();
    await this.ctx.resume();

    this.engineGain = this.ctx.createGain();
    this.propGain = this.ctx.createGain();
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
    this.windSource.start();
    this.started = true;
  }

  update(throttle: number, airspeedKts: number): void {
    if (!this.ctx || !this.engineOsc || !this.propOsc) return;
    const t = throttle;
    const spd = Math.min(airspeedKts / 120, 1);

    this.engineOsc.frequency.setTargetAtTime(70 + t * 120, this.ctx.currentTime, 0.05);
    this.propOsc.frequency.setTargetAtTime(120 + t * 400, this.ctx.currentTime, 0.05);
    this.engineGain!.gain.setTargetAtTime(0.08 + t * 0.12, this.ctx.currentTime, 0.05);
    this.propGain!.gain.setTargetAtTime(0.03 + t * 0.08, this.ctx.currentTime, 0.05);
    this.windGain!.gain.setTargetAtTime(spd * 0.15, this.ctx.currentTime, 0.08);
  }

  dispose(): void {
    this.engineOsc?.stop();
    this.propOsc?.stop();
    this.windSource?.stop();
    void this.ctx?.close();
  }
}
