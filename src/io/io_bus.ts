import { IIODevice } from '../memory/types';

/**
 * Gestor del espacio de E/S ($D000 - $DFFF) del Commodore 64.
 * Enruta lecturas y escrituras hacia VIC-II, SID, Color RAM, CIA 1 y CIA 2.
 */
export class IOBus implements IIODevice {
  // Dispositivos conectados al bus de E/S
  public vic: IIODevice | null = null;
  public sid: IIODevice | null = null;
  public cia1: IIODevice | null = null;
  public cia2: IIODevice | null = null;

  // Memoria de color física (1024 nibbles de 4 bits: $D800 - $DBFF)
  public readonly colorRam = new Uint8Array(1024);

  constructor() {
    this.reset();
  }

  public reset(): void {
    // Inicializar la RAM de color con valores aleatorios/por defecto (nibbles 0-15)
    for (let i = 0; i < this.colorRam.length; i++) {
      this.colorRam[i] = 14; // Azul claro por defecto
    }
    this.vic?.reset();
    this.sid?.reset();
    this.cia1?.reset();
    this.cia2?.reset();
  }

  /**
   * Lee un byte del espacio de E/S ($D000 - $DFFF).
   */
  public read(address: number): number {
    const page = (address >> 8) & 0xff;

    // $D000 - $D3FF: VIC-II
    if (page >= 0xd0 && page <= 0xd3) {
      return this.vic ? this.vic.read(address & 0x3f) : 0xff;
    }

    // $D400 - $D7FF: SID
    if (page >= 0xd4 && page <= 0xd7) {
      return this.sid ? this.sid.read(address & 0x1f) : 0xff;
    }

    // $D800 - $DBFF: Color RAM (1024 x 4-bit)
    if (page >= 0xd8 && page <= 0xdb) {
      // En C64 real, los 4 bits altos están flotantes (suelen leerse como 1s)
      return (this.colorRam[address & 0x03ff] & 0x0f) | 0xf0;
    }

    // $DC00 - $DCFF: CIA 1
    if (page === 0xdc) {
      return this.cia1 ? this.cia1.read(address & 0x0f) : 0xff;
    }

    // $DD00 - $DDFF: CIA 2
    if (page === 0xdd) {
      return this.cia2 ? this.cia2.read(address & 0x0f) : 0xff;
    }

    // $DE00 - $DFFF: Expansion I/O
    return 0xff;
  }

  /**
   * Escribe un byte en el espacio de E/S ($D000 - $DFFF).
   */
  public write(address: number, value: number): void {
    const byteVal = value & 0xff;
    const page = (address >> 8) & 0xff;

    // $D000 - $D3FF: VIC-II
    if (page >= 0xd0 && page <= 0xd3) {
      this.vic?.write(address & 0x3f, byteVal);
      return;
    }

    // $D400 - $D7FF: SID
    if (page >= 0xd4 && page <= 0xd7) {
      this.sid?.write(address & 0x1f, byteVal);
      return;
    }

    // $D800 - $DBFF: Color RAM
    if (page >= 0xd8 && page <= 0xdb) {
      this.colorRam[address & 0x03ff] = byteVal & 0x0f;
      return;
    }

    // $DC00 - $DCFF: CIA 1
    if (page === 0xdc) {
      this.cia1?.write(address & 0x0f, byteVal);
      return;
    }

    // $DD00 - $DDFF: CIA 2
    if (page === 0xdd) {
      this.cia2?.write(address & 0x0f, byteVal);
      return;
    }
  }
}
