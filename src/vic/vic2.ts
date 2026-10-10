import { IVic2 } from './types';
import { PAL_CONSTANTS } from './constants';
import { VIC2_PALETTE_RGBA32 } from './palette';
import { IMemoryBus } from '../memory/types';

/**
 * Emulación del chip de video VIC-II (MOS 6569 - PAL).
 * Renderiza modo texto estándar 40x25, bordes, color de fondo ($D021),
 * color de borde ($D020) y Color RAM ($D800).
 */
export class Vic2 implements IVic2 {
  public readonly regs = new Uint8Array(64);

  // Búfer RGBA32 de 384 x 272 píxeles
  private readonly frameBuffer = new Uint32Array(PAL_CONSTANTS.SCREEN_WIDTH * PAL_CONSTANTS.SCREEN_HEIGHT);

  // Referencias a memoria y RAM de color
  public memory: IMemoryBus | null = null;
  public colorRam: Uint8Array | null = null;

  // Barrido de haz raster
  public currentRaster = 0;
  private cycleInLine = 0;

  // Interrupciones
  public irqLine = false;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.regs.fill(0);

    // Valores por defecto al encendido
    this.regs[0x11] = 0x1b; // $D011: Screen On (DEN=1), 25 rows (RSEL=1)
    this.regs[0x16] = 0x08; // $D016: 40 columns (CSEL=1)
    this.regs[0x18] = 0x14; // $D018: Screen en $0400, Caracteres en $1000
    this.regs[0x20] = 0x0e; // $D020: Borde azul claro (14)
    this.regs[0x21] = 0x06; // $D021: Fondo azul oscuro (6)

    this.currentRaster = 0;
    this.cycleInLine = 0;
    this.irqLine = false;

    this.renderInitialFrame();
  }

  public get borderColor(): number {
    return this.regs[0x20] & 0x0f;
  }

  public set borderColor(color: number) {
    this.regs[0x20] = color & 0x0f;
  }

  public get backgroundColor(): number {
    return this.regs[0x21] & 0x0f;
  }

  public set backgroundColor(color: number) {
    this.regs[0x21] = color & 0x0f;
  }

  public read(address: number): number {
    const reg = address & 0x3f;

    // $D011: Bit 7 es el bit 8 del contador de raster
    if (reg === 0x11) {
      const bit8 = (this.currentRaster >> 8) & 0x01;
      return (this.regs[0x11] & 0x7f) | (bit8 << 7);
    }

    // $D012: Raster Counter (bits 0-7)
    if (reg === 0x12) {
      return this.currentRaster & 0xff;
    }

    return this.regs[reg];
  }

  public write(address: number, value: number): void {
    const reg = address & 0x3f;
    this.regs[reg] = value & 0xff;
  }

  /**
   * Sincroniza el barrido de haz raster según los ciclos transcurridos.
   */
  public step(cycles: number): void {
    this.cycleInLine += cycles;

    while (this.cycleInLine >= PAL_CONSTANTS.CYCLES_PER_LINE) {
      this.cycleInLine -= PAL_CONSTANTS.CYCLES_PER_LINE;

      // Renderizar línea actual
      this.renderScanline(this.currentRaster);

      // Avanzar raster
      this.currentRaster++;
      if (this.currentRaster >= PAL_CONSTANTS.RASTER_LINES) {
        this.currentRaster = 0;
      }
    }
  }

  /**
   * Dibuja una línea de barrido raster en el framebuffer.
   */
  private renderScanline(line: number): void {
    if (line >= PAL_CONSTANTS.SCREEN_HEIGHT) return;

    const width = PAL_CONSTANTS.SCREEN_WIDTH;
    const offset = line * width;

    const borderColor32 = VIC2_PALETTE_RGBA32[this.borderColor];
    const bgColor32 = VIC2_PALETTE_RGBA32[this.backgroundColor];

    // Verificar si la línea está dentro del área vertical activa (36 a 235)
    const isVerticalActive = line >= PAL_CONSTANTS.BORDER_TOP && line < (PAL_CONSTANTS.BORDER_TOP + PAL_CONSTANTS.ACTIVE_HEIGHT);
    const displayEnabled = (this.regs[0x11] & 0x20) !== 0; // Bit 5 DEN

    if (!isVerticalActive || !displayEnabled) {
      // Línea de borde puro
      this.frameBuffer.fill(borderColor32, offset, offset + width);
      return;
    }

    // Borde izquierdo (0 a 31)
    this.frameBuffer.fill(borderColor32, offset, offset + PAL_CONSTANTS.BORDER_LEFT);

    // Borde derecho (352 a 383)
    const activeRight = offset + PAL_CONSTANTS.BORDER_LEFT + PAL_CONSTANTS.ACTIVE_WIDTH;
    this.frameBuffer.fill(borderColor32, activeRight, offset + width);

    // Si no tenemos bus de memoria, pintar fondo azul uniforme
    if (!this.memory || !this.colorRam) {
      this.frameBuffer.fill(bgColor32, offset + PAL_CONSTANTS.BORDER_LEFT, activeRight);
      return;
    }

    // Comprobar modo de 24 o 25 filas (Bit 6 de $D011: RSEL)
    const rsel25 = (this.regs[0x11] & 0x40) !== 0;
    const yActive = line - PAL_CONSTANTS.BORDER_TOP; // 0 a 199

    if (!rsel25 && (yActive < 4 || yActive >= 196)) {
      // En modo de 24 filas, las 4 líneas superior e inferior son borde
      this.frameBuffer.fill(borderColor32, offset + PAL_CONSTANTS.BORDER_LEFT, activeRight);
      return;
    }

    // Direcciones base configuradas en $D018
    const screenBase = (this.regs[0x18] >> 4) * 0x0400; // Puntero a Screen RAM dentro del banco VIC
    const charBase = ((this.regs[0x18] >> 1) & 0x07) * 0x0800; // Puntero a Generador de Caracteres

    const charRow = Math.floor(yActive / 8); // Fila de caracteres (0 a 24)
    const charY = yActive % 8;              // Línea de barrido dentro del glifo 8x8 (0 a 7)
    const rowOffset = charRow * 40;

    let destPtr = offset + PAL_CONSTANTS.BORDER_LEFT;

    // Renderizar los 40 caracteres de la fila
    for (let col = 0; col < 40; col++) {
      const charIndex = rowOffset + col;

      // Código de caracter PETSCII de la matriz de pantalla ($0400 por defecto)
      const charCode = this.memory.readVic(screenBase + charIndex);

      // Color de primer plano de la memoria de color ($D800)
      const colorNibble = this.colorRam[charIndex] & 0x0f;
      const charColor32 = VIC2_PALETTE_RGBA32[colorNibble];

      // Byte del glifo de 8 píxeles desde la Character ROM
      const glyphByte = this.memory.readVic(charBase + (charCode * 8) + charY);

      // Dibujar los 8 píxeles del caracter (bit 7 es el píxel izquierdo, bit 0 el derecho)
      for (let px = 7; px >= 0; px--) {
        const isForeground = (glyphByte >> px) & 1;
        this.frameBuffer[destPtr++] = isForeground ? charColor32 : bgColor32;
      }
    }
  }

  private renderInitialFrame(): void {
    for (let line = 0; line < PAL_CONSTANTS.SCREEN_HEIGHT; line++) {
      this.renderScanline(line);
    }
  }

  public getFrameBuffer(): Uint32Array {
    return this.frameBuffer;
  }
}
