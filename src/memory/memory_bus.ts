import { IMemoryBus, RomType } from './types';
import { IOBus } from '../io/io_bus';

/**
 * Bus de memoria principal del Commodore 64 con emulación precisa de PLA y banking.
 */
export class MemoryBus implements IMemoryBus {
  // 64 KB de RAM física
  public readonly ram = new Uint8Array(65536);

  // Memorias ROM
  public readonly basicRom = new Uint8Array(8192);   // 8 KB ($A000 - $BFFF)
  public readonly kernalRom = new Uint8Array(8192);  // 8 KB ($E000 - $FFFF)
  public readonly charRom = new Uint8Array(4096);    // 4 KB ($D000 - $DFFF)

  // Registro de estado de carga de ROMs
  public hasBasicRom = false;
  public hasKernalRom = false;
  public hasCharRom = false;

  // CPU 6510 On-chip I/O Port
  public ddr = 0x2f;   // $0000: Data Direction Register (%00101111 por defecto)
  public port = 0x37;  // $0001: Port Register (%00110111 por defecto)

  // Líneas del puerto de cartucho (por defecto sin cartucho conectado)
  public exrom = 1;
  public game = 1;

  // Bus de E/S ($D000 - $DFFF)
  public readonly ioBus = new IOBus();

  // Banco de memoria seleccionado por CIA 2 para el VIC-II (0, 1, 2, 3)
  public vicBank = 0; // Bank 0: $0000 - $3FFF

  constructor() {
    this.reset();
  }

  public reset(): void {
    // Inicializar memoria RAM con patrón pseudo-aleatorio o ceros
    this.ram.fill(0);

    // Valores de encendido estándar de la CPU 6510
    this.ddr = 0x2f;
    this.port = 0x37; // LORAM=1, HIRAM=1, CHAREN=1 (Configuración de arranque BASIC)

    this.exrom = 1;
    this.game = 1;
    this.vicBank = 0;

    this.ioBus.reset();
  }

  /**
   * Carga una ROM binaria en su buffer interno correspondiente.
   */
  public loadRom(type: RomType, data: Uint8Array): void {
    switch (type) {
      case 'basic':
        this.basicRom.set(data.subarray(0, 8192));
        this.hasBasicRom = true;
        break;
      case 'kernal':
        this.kernalRom.set(data.subarray(0, 8192));
        this.hasKernalRom = true;
        break;
      case 'chargen':
        this.charRom.set(data.subarray(0, 4096));
        this.hasCharRom = true;
        break;
    }
  }

  /**
   * Lectura de 8 bits con lógica de PLA / Banking activa.
   */
  public read(address: number): number {
    address &= 0xffff;

    // $0000: Data Direction Register (CPU 6510)
    if (address === 0x0000) {
      return this.ddr;
    }

    // $0001: Port Register (CPU 6510)
    if (address === 0x0001) {
      // Los bits en DDR como 0 son entradas (pull-up por defecto a 1).
      // Los bits 6 y 7 devuelven 1 (líneas flotantes).
      const inputBits = 0x10; // Bit 4 Cassette sense (normalmente 1 sin presionar)
      return (this.port & this.ddr) | (inputBits & ~this.ddr) | 0xc0;
    }

    // Líneas de control del PLA
    const loram = this.port & 0x01;
    const hiram = (this.port >> 1) & 0x01;
    const charen = (this.port >> 2) & 0x01;

    // $A000 - $BFFF: BASIC ROM (8 KB)
    if (address >= 0xa000 && address <= 0xbfff) {
      if (loram && hiram && this.game) {
        return this.hasBasicRom ? this.basicRom[address - 0xa000] : this.ram[address];
      }
      return this.ram[address];
    }

    // $D000 - $DFFF: I/O o Character ROM o RAM (4 KB)
    if (address >= 0xd000 && address <= 0xdfff) {
      if ((loram || hiram) && charen) {
        // I/O space activo
        return this.ioBus.read(address);
      }
      if ((loram || hiram) && !charen) {
        // Character ROM activa
        return this.hasCharRom ? this.charRom[address - 0xd000] : this.ram[address];
      }
      // Ambos en 0 -> RAM
      return this.ram[address];
    }

    // $E000 - $FFFF: KERNAL ROM (8 KB)
    if (address >= 0xe000 && address <= 0xffff) {
      if (hiram) {
        return this.hasKernalRom ? this.kernalRom[address - 0xe000] : this.ram[address];
      }
      return this.ram[address];
    }

    // En cualquier otro caso ($0002 - $9FFF y $C000 - $CFFF): RAM
    return this.ram[address];
  }

  /**
   * Escritura de 8 bits.
   * Regla de oro de la arquitectura C64:
   * Escribir en un área con ROM mapeada NUNCA modifica la ROM, sino la RAM oculta detrás de ella.
   */
  public write(address: number, value: number): void {
    address &= 0xffff;
    const byteVal = value & 0xff;

    // $0000: Data Direction Register (CPU 6510)
    if (address === 0x0000) {
      this.ddr = byteVal;
      this.ram[0] = byteVal;
      return;
    }

    // $0001: Port Register (CPU 6510)
    if (address === 0x0001) {
      this.port = byteVal;
      this.ram[1] = byteVal;
      return;
    }

    // $D000 - $DFFF: Si I/O está activo, escribe a los periféricos (VIC, SID, CIA, Color RAM).
    // Si I/O no está activo (es decir, Character ROM o RAM), escribe a la RAM física.
    if (address >= 0xd000 && address <= 0xdfff) {
      const loram = this.port & 0x01;
      const hiram = (this.port >> 1) & 0x01;
      const charen = (this.port >> 2) & 0x01;

      if ((loram || hiram) && charen) {
        this.ioBus.write(address, byteVal);
        return;
      }
    }

    // Todas las demás escrituras van directo a la memoria RAM física (incluso bajo BASIC y KERNAL)
    this.ram[address] = byteVal;
  }

  /**
   * Lee una palabra de 16 bits en formato Little-Endian (LSB primero, luego MSB).
   */
  public readWord(address: number): number {
    const low = this.read(address);
    const high = this.read(address + 1);
    return (high << 8) | low;
  }

  /**
   * Escribe una palabra de 16 bits en formato Little-Endian.
   */
  public writeWord(address: number, value: number): void {
    this.write(address, value & 0xff);
    this.write(address + 1, (value >> 8) & 0xff);
  }

  /**
   * Lectura directa desde el bus de direcciones del VIC-II (14 bits: $0000 - $3FFF).
   * El VIC-II accede a través de bancos de 16 KB seleccionados por CIA 2.
   * En los bancos 0 y 2, los rangos $1000-$1FFF ven la Character ROM.
   */
  public readVic(address14: number): number {
    address14 &= 0x3fff;
    const bankBase = this.vicBank * 0x4000;
    const physicalAddress = bankBase + address14;

    // En bancos 0 y 2, el rango $1000-$1FFF mapea la Character ROM para el VIC-II
    if ((this.vicBank === 0 || this.vicBank === 2) && address14 >= 0x1000 && address14 <= 0x1fff) {
      return this.hasCharRom ? this.charRom[address14 - 0x1000] : this.ram[physicalAddress];
    }

    return this.ram[physicalAddress];
  }

  public peekRam(address: number): number {
    return this.ram[address & 0xffff];
  }

  public pokeRam(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }

  public getPortState(): { ddr: number; port: number } {
    return { ddr: this.ddr, port: this.port };
  }
}
