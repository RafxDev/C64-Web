import { ICIA } from './types';

/**
 * Emulación del chip CIA 2 (MOS 6526 - $DD00 - $DDFF).
 * Maneja selección de banco de video del VIC-II, puerto serie IEC e interrupciones NMI.
 */
export class CIA2 implements ICIA {
  public readonly regs = new Uint8Array(16);
  public irqPending = false; // Conectado a la línea NMI de la CPU
  public onVicBankChange?: (bank: number) => void;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.regs.fill(0);
    this.regs[0x00] = 0x03; // Port A: bits 0 y 1 en alto (Banco 0 del VIC-II)
    this.regs[0x01] = 0xff; // Port B
    this.irqPending = false;
    this.onVicBankChange?.(0);
  }

  public read(address: number): number {
    const reg = address & 0x0f;
    return this.regs[reg];
  }

  public write(address: number, value: number): void {
    const reg = address & 0x0f;
    const byteVal = value & 0xff;
    this.regs[reg] = byteVal;

    // Puerto A ($DD00): Bits 0 y 1 seleccionan el banco del VIC-II
    if (reg === 0x00) {
      // Líneas invertidas: %11 -> Banco 0, %10 -> Banco 1, %01 -> Banco 2, %00 -> Banco 3
      const vicBank = (~byteVal) & 0x03;
      this.onVicBankChange?.(vicBank);
    }
  }

  public step(_cycles: number): void {
    // La emulación completa de Timers e IEC se implementará en su módulo correspondiente
  }
}
