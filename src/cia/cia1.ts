import { ICIA } from './types';

/**
 * Emulación del chip CIA 1 (MOS 6526 - $DC00 - $DCFF).
 * Maneja registros de E/S, matriz de teclado, Timers A y B y generación de IRQ.
 */
export class CIA1 implements ICIA {
  public readonly regs = new Uint8Array(16);
  public irqPending = false;

  // Timers y Latches de 16 bits
  public timerA = 0xffff;
  public latchA = 0xffff;
  public timerB = 0xffff;
  public latchB = 0xffff;

  // Máscaras y banderas de interrupción
  public icr = 0; // Banderas de eventos activos ($DC0D lectura)
  public imr = 0; // Máscara de interrupción habilitada ($DC0D escritura)

  // Matriz de teclado 8x8 (8 bytes: 1 por fila/columna; 0xff = ninguna tecla presionada)
  public keyboardMatrix = new Uint8Array(8).fill(0xff);

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.regs.fill(0);
    this.regs[0x00] = 0xff; // Port A
    this.regs[0x01] = 0xff; // Port B

    this.timerA = 0xffff;
    this.latchA = 0xffff;
    this.timerB = 0xffff;
    this.latchB = 0xffff;

    this.icr = 0;
    this.imr = 0;
    this.irqPending = false;
    this.keyboardMatrix.fill(0xff);
  }

  public read(address: number): number {
    const reg = address & 0x0f;

    switch (reg) {
      case 0x00: // Port A (Columnas de teclado / Joystick 2)
        {
          let val = this.regs[0x00];
          const rowSel = this.regs[0x01];
          for (let row = 0; row < 8; row++) {
            if (!(rowSel & (1 << row))) {
              for (let col = 0; col < 8; col++) {
                if (!(this.keyboardMatrix[col] & (1 << row))) {
                  val &= ~(1 << col);
                }
              }
            }
          }
          return val;
        }

      case 0x01: // Port B (Filas de teclado / Joystick 1)
        {
          // Escaneo de matriz de teclado: si Port A pone bits a 0 (seleccionando columnas),
          // se combinan las filas presionadas correspondientes
          let val = 0xff;
          const colSel = this.regs[0x00];
          for (let col = 0; col < 8; col++) {
            if (!(colSel & (1 << col))) {
              val &= this.keyboardMatrix[col];
            }
          }
          return val;
        }

      case 0x04: // Timer A Low
        return this.timerA & 0xff;
      case 0x05: // Timer A High
        return (this.timerA >> 8) & 0xff;

      case 0x06: // Timer B Low
        return this.timerB & 0xff;
      case 0x07: // Timer B High
        return (this.timerB >> 8) & 0xff;

      case 0x0d: // ICR (Interrupt Control Register)
        {
          // La lectura de $DC0D devuelve el estado y borra las banderas de interrupción
          const result = this.icr;
          this.icr = 0;
          this.irqPending = false;
          return result;
        }

      default:
        return this.regs[reg];
    }
  }

  public write(address: number, value: number): void {
    const reg = address & 0x0f;
    const byteVal = value & 0xff;
    this.regs[reg] = byteVal;

    switch (reg) {
      case 0x04: // Latch A Low
        this.latchA = (this.latchA & 0xff00) | byteVal;
        break;
      case 0x05: // Latch A High
        this.latchA = (this.latchA & 0x00ff) | (byteVal << 8);
        if (!(this.regs[0x0e] & 0x01)) {
          // Si el Timer A está detenido, cargar el latch directamente al contador
          this.timerA = this.latchA;
        }
        break;

      case 0x06: // Latch B Low
        this.latchB = (this.latchB & 0xff00) | byteVal;
        break;
      case 0x07: // Latch B High
        this.latchB = (this.latchB & 0x00ff) | (byteVal << 8);
        if (!(this.regs[0x0f] & 0x01)) {
          this.timerB = this.latchB;
        }
        break;

      case 0x0d: // ICR Mask Register
        if (byteVal & 0x80) {
          // Bit 7 en 1: Activar las máscaras seleccionadas por los bits 0-4
          this.imr |= (byteVal & 0x1f);
        } else {
          // Bit 7 en 0: Desactivar las máscaras seleccionadas
          this.imr &= ~(byteVal & 0x1f);
        }
        break;

      case 0x0e: // Control Register A
        if (byteVal & 0x10) {
          // Bit 4: Forzar carga del latch en Timer A
          this.timerA = this.latchA;
        }
        break;

      case 0x0f: // Control Register B
        if (byteVal & 0x10) {
          // Bit 4: Forzar carga del latch en Timer B
          this.timerB = this.latchB;
        }
        break;
    }
  }

  /**
   * Avanza los temporizadores de la CIA según los ciclos transcurridos.
   */
  public step(cycles: number): void {
    // Timer A
    if (this.regs[0x0e] & 0x01) { // Bit 0 CRA: Timer A activo
      this.timerA -= cycles;
      if (this.timerA <= 0) {
        // Desbordamiento de Timer A (Underflow)
        this.timerA = this.latchA + this.timerA;
        if (this.timerA <= 0) this.timerA = this.latchA;

        this.icr |= 0x01; // Bit 0: Underflow Timer A

        // Si la interrupción de Timer A está habilitada en IMR, generar IRQ
        if (this.imr & 0x01) {
          this.icr |= 0x80; // Bit 7: IRQ generada
          this.irqPending = true;
        }

        // Si está en modo de disparo único (one-shot, bit 3), detener timer
        if (this.regs[0x0e] & 0x08) {
          this.regs[0x0e] &= ~0x01;
        }
      }
    }

    // Timer B
    if (this.regs[0x0f] & 0x01) { // Bit 0 CRB: Timer B activo
      this.timerB -= cycles;
      if (this.timerB <= 0) {
        this.timerB = this.latchB + this.timerB;
        if (this.timerB <= 0) this.timerB = this.latchB;

        this.icr |= 0x02; // Bit 1: Underflow Timer B

        if (this.imr & 0x02) {
          this.icr |= 0x80;
          this.irqPending = true;
        }

        if (this.regs[0x0f] & 0x08) {
          this.regs[0x0f] &= ~0x01;
        }
      }
    }
  }
}
