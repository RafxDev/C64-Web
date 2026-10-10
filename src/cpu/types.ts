/**
 * Tipos y registros de la CPU MOS 6510.
 */

export interface CpuRegisters {
  a: number;   // Acumulador (8-bit)
  x: number;   // Registro X (8-bit)
  y: number;   // Registro Y (8-bit)
  sp: number;  // Puntero de Pila (Stack Pointer, 8-bit, relativo a $0100-$01FF)
  pc: number;  // Contador de Programa (Program Counter, 16-bit)
  status: number; // Registro de Estado / Banderas (8-bit: N V - B D I Z C)
}

export enum CpuFlags {
  Carry     = 1 << 0, // C
  Zero      = 1 << 1, // Z
  Interrupt = 1 << 2, // I (Desactiva IRQ)
  Decimal   = 1 << 3, // D (Modo BCD)
  Break     = 1 << 4, // B (Instrucción BRK)
  Unused    = 1 << 5, // Siempre 1 en hardware real
  Overflow  = 1 << 6, // V
  Negative  = 1 << 7, // N
}

export interface ICPU {
  registers: CpuRegisters;
  step(): number;
  reset(): void;
  irq(): void;
  nmi(): void;
}
