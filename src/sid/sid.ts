import { ISID } from './types';

/**
 * Emulación del chip de sonido SID (MOS 6581 / 8580 - $D400 - $D7FF).
 * Maneja registros de 3 voces, filtros analógicos y volumen principal.
 */
export class SID implements ISID {
  public readonly regs = new Uint8Array(32);

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.regs.fill(0);
  }

  public read(address: number): number {
    const reg = address & 0x1f;
    return this.regs[reg];
  }

  public write(address: number, value: number): void {
    const reg = address & 0x1f;
    this.regs[reg] = value & 0xff;
  }

  public step(_cycles: number): void {
    // La síntesis de audio mediante Web Audio API / AudioWorklet se implementará en su módulo
  }
}
