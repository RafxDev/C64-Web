import { IMemoryBus } from '../memory/types';
import { CpuFlags, CpuRegisters, ICPU } from './types';

/**
 * Emulador de CPU MOS 6510 (núcleo NMOS 6502 completo con puerto E/S en bus de memoria).
 * - 151 instrucciones oficiales del 6502.
 * - Conteo exacto de ciclos y penalizaciones por cruce de página (page boundary crossing).
 * - Comportamiento bug-fiel de la instrucción JMP ($xxFF).
 * - Aritmética decimal precisa (BCD) en modos ADC y SBC.
 */
export class Cpu6510 implements ICPU {
  public a = 0;
  public x = 0;
  public y = 0;
  public sp = 0xfd;
  public pc = 0x0000;
  public status = 0x24; // Unused (0x20) e Interrupt (0x04) activos por defecto

  public totalCycles = 0;
  private memory: IMemoryBus;

  // Interrupciones pendientes
  public nmiRequested = false;
  public irqRequested = false;

  constructor(memory: IMemoryBus) {
    this.memory = memory;
  }

  public get registers(): CpuRegisters {
    return {
      a: this.a,
      x: this.x,
      y: this.y,
      sp: this.sp,
      pc: this.pc,
      status: this.status,
    };
  }

  public set registers(regs: CpuRegisters) {
    this.a = regs.a & 0xff;
    this.x = regs.x & 0xff;
    this.y = regs.y & 0xff;
    this.sp = regs.sp & 0xff;
    this.pc = regs.pc & 0xffff;
    this.status = regs.status | CpuFlags.Unused;
  }

  /**
   * Rutina de reinicio (RESET) de hardware.
   * Toma 7 ciclos de reloj, inicializa el SP y carga el PC desde el vector $FFFC.
   */
  public reset(): void {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xfd;
    this.status = (this.status | CpuFlags.Interrupt | CpuFlags.Unused) & ~CpuFlags.Decimal;
    this.pc = this.readWord(0xfffc);
    this.totalCycles += 7;
    this.nmiRequested = false;
    this.irqRequested = false;
  }

  public irq(): void {
    this.irqRequested = true;
  }

  public nmi(): void {
    this.nmiRequested = true;
  }

  private push(val: number): void {
    this.memory.write(0x0100 + this.sp, val & 0xff);
    this.sp = (this.sp - 1) & 0xff;
  }

  private pull(): number {
    this.sp = (this.sp + 1) & 0xff;
    return this.memory.read(0x0100 + this.sp);
  }

  private pushWord(val: number): void {
    this.push((val >> 8) & 0xff);
    this.push(val & 0xff);
  }

  private pullWord(): number {
    const low = this.pull();
    const high = this.pull();
    return (high << 8) | low;
  }

  private readWord(address: number): number {
    const low = this.memory.read(address);
    const high = this.memory.read(address + 1);
    return (high << 8) | low;
  }

  private updateNZ(val: number): void {
    this.status = (this.status & ~(CpuFlags.Negative | CpuFlags.Zero))
      | (val & 0x80 ? CpuFlags.Negative : 0)
      | (val === 0 ? CpuFlags.Zero : 0);
  }

  /**
   * Ejecuta una instrucción y devuelve los ciclos consumidos.
   */
  public step(): number {
    // Manejo de interrupciones de hardware
    if (this.nmiRequested) {
      this.nmiRequested = false;
      this.handleInterrupt(0xfffa, false);
      return 7;
    }

    if (this.irqRequested && !(this.status & CpuFlags.Interrupt)) {
      this.irqRequested = false;
      this.handleInterrupt(0xfffe, false);
      return 7;
    }

    const opcode = this.memory.read(this.pc++);
    const cycles = this.executeOpcode(opcode);
    this.totalCycles += cycles;
    return cycles;
  }

  private handleInterrupt(vector: number, isBrk: boolean): void {
    this.pushWord(this.pc);
    // B flag es 1 si fue provocado por BRK o PHP, 0 si fue interrupción de hardware IRQ/NMI
    const flagsToPush = (this.status | CpuFlags.Unused) | (isBrk ? CpuFlags.Break : 0);
    this.push(flagsToPush);
    this.status |= CpuFlags.Interrupt;
    this.pc = this.readWord(vector);
    this.totalCycles += 7;
  }

  /**
   * Decodificador y ejecutor de los 151 opcodes oficiales.
   */
  private executeOpcode(opcode: number): number {
    let cycles = 2;
    let addr = 0;
    let pageCrossed = false;

    switch (opcode) {
      // ==========================================
      // ADC - Add with Carry
      // ==========================================
      case 0x69: // Immediate
        this.adc(this.memory.read(this.pc++));
        return 2;
      case 0x65: // Zero Page
        this.adc(this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0x75: // Zero Page, X
        this.adc(this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff));
        return 4;
      case 0x6d: // Absolute
        this.adc(this.memory.read(this.fetchWord()));
        return 4;
      case 0x7d: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.adc(this.memory.read((addr + this.x) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0x79: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.adc(this.memory.read((addr + this.y) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0x61: // (Indirect, X)
        this.adc(this.memory.read(this.addrIndX()));
        return 6;
      case 0x71: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.adc(this.memory.read(res.addr));
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // AND - Logical AND
      // ==========================================
      case 0x29: // Immediate
        this.a &= this.memory.read(this.pc++);
        this.updateNZ(this.a);
        return 2;
      case 0x25: // Zero Page
        this.a &= this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.a);
        return 3;
      case 0x35: // Zero Page, X
        this.a &= this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff);
        this.updateNZ(this.a);
        return 4;
      case 0x2d: // Absolute
        this.a &= this.memory.read(this.fetchWord());
        this.updateNZ(this.a);
        return 4;
      case 0x3d: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.a &= this.memory.read((addr + this.x) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x39: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.a &= this.memory.read((addr + this.y) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x21: // (Indirect, X)
        this.a &= this.memory.read(this.addrIndX());
        this.updateNZ(this.a);
        return 6;
      case 0x31: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.a &= this.memory.read(res.addr);
          this.updateNZ(this.a);
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // ASL - Arithmetic Shift Left
      // ==========================================
      case 0x0a: // Accumulator
        this.a = this.aslVal(this.a);
        return 2;
      case 0x06: // Zero Page
        addr = this.memory.read(this.pc++);
        this.memory.write(addr, this.aslVal(this.memory.read(addr)));
        return 5;
      case 0x16: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        this.memory.write(addr, this.aslVal(this.memory.read(addr)));
        return 6;
      case 0x0e: // Absolute
        addr = this.fetchWord();
        this.memory.write(addr, this.aslVal(this.memory.read(addr)));
        return 6;
      case 0x1e: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        this.memory.write(addr, this.aslVal(this.memory.read(addr)));
        return 7;

      // ==========================================
      // Branches (BCC, BCS, BEQ, BMI, BNE, BPL, BVC, BVS)
      // ==========================================
      case 0x90: // BCC
        return this.branch(!(this.status & CpuFlags.Carry));
      case 0xb0: // BCS
        return this.branch(!!(this.status & CpuFlags.Carry));
      case 0xf0: // BEQ
        return this.branch(!!(this.status & CpuFlags.Zero));
      case 0x30: // BMI
        return this.branch(!!(this.status & CpuFlags.Negative));
      case 0xd0: // BNE
        return this.branch(!(this.status & CpuFlags.Zero));
      case 0x10: // BPL
        return this.branch(!(this.status & CpuFlags.Negative));
      case 0x50: // BVC
        return this.branch(!(this.status & CpuFlags.Overflow));
      case 0x70: // BVS
        return this.branch(!!(this.status & CpuFlags.Overflow));

      // ==========================================
      // BIT - Bit Test
      // ==========================================
      case 0x24: // Zero Page
        this.bit(this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0x2c: // Absolute
        this.bit(this.memory.read(this.fetchWord()));
        return 4;

      // ==========================================
      // BRK - Force Interrupt
      // ==========================================
      case 0x00:
        this.pc++; // BRK salta 1 byte de firma
        this.handleInterrupt(0xfffe, true);
        return 7;

      // ==========================================
      // Clear / Set Flags (CLC, CLD, CLI, CLV, SEC, SED, SEI)
      // ==========================================
      case 0x18: // CLC
        this.status &= ~CpuFlags.Carry;
        return 2;
      case 0xd8: // CLD
        this.status &= ~CpuFlags.Decimal;
        return 2;
      case 0x58: // CLI
        this.status &= ~CpuFlags.Interrupt;
        return 2;
      case 0xb8: // CLV
        this.status &= ~CpuFlags.Overflow;
        return 2;
      case 0x38: // SEC
        this.status |= CpuFlags.Carry;
        return 2;
      case 0xf8: // SED
        this.status |= CpuFlags.Decimal;
        return 2;
      case 0x78: // SEI
        this.status |= CpuFlags.Interrupt;
        return 2;

      // ==========================================
      // CMP - Compare Accumulator
      // ==========================================
      case 0xc9: // Immediate
        this.cmp(this.a, this.memory.read(this.pc++));
        return 2;
      case 0xc5: // Zero Page
        this.cmp(this.a, this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0xd5: // Zero Page, X
        this.cmp(this.a, this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff));
        return 4;
      case 0xcd: // Absolute
        this.cmp(this.a, this.memory.read(this.fetchWord()));
        return 4;
      case 0xdd: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.cmp(this.a, this.memory.read((addr + this.x) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0xd9: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.cmp(this.a, this.memory.read((addr + this.y) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0xc1: // (Indirect, X)
        this.cmp(this.a, this.memory.read(this.addrIndX()));
        return 6;
      case 0xd1: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.cmp(this.a, this.memory.read(res.addr));
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // CPX - Compare X Register
      // ==========================================
      case 0xe0: // Immediate
        this.cmp(this.x, this.memory.read(this.pc++));
        return 2;
      case 0xe4: // Zero Page
        this.cmp(this.x, this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0xec: // Absolute
        this.cmp(this.x, this.memory.read(this.fetchWord()));
        return 4;

      // ==========================================
      // CPY - Compare Y Register
      // ==========================================
      case 0xc0: // Immediate
        this.cmp(this.y, this.memory.read(this.pc++));
        return 2;
      case 0xc4: // Zero Page
        this.cmp(this.y, this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0xcc: // Absolute
        this.cmp(this.y, this.memory.read(this.fetchWord()));
        return 4;

      // ==========================================
      // DEC - Decrement Memory
      // ==========================================
      case 0xc6: // Zero Page
        addr = this.memory.read(this.pc++);
        cycles = 5;
        this.decMem(addr);
        return cycles;
      case 0xd6: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        cycles = 6;
        this.decMem(addr);
        return cycles;
      case 0xce: // Absolute
        addr = this.fetchWord();
        cycles = 6;
        this.decMem(addr);
        return cycles;
      case 0xde: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        cycles = 7;
        this.decMem(addr);
        return cycles;

      // ==========================================
      // DEX / DEY - Decrement Registers
      // ==========================================
      case 0xca: // DEX
        this.x = (this.x - 1) & 0xff;
        this.updateNZ(this.x);
        return 2;
      case 0x88: // DEY
        this.y = (this.y - 1) & 0xff;
        this.updateNZ(this.y);
        return 2;

      // ==========================================
      // EOR - Exclusive OR
      // ==========================================
      case 0x49: // Immediate
        this.a ^= this.memory.read(this.pc++);
        this.updateNZ(this.a);
        return 2;
      case 0x45: // Zero Page
        this.a ^= this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.a);
        return 3;
      case 0x55: // Zero Page, X
        this.a ^= this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff);
        this.updateNZ(this.a);
        return 4;
      case 0x4d: // Absolute
        this.a ^= this.memory.read(this.fetchWord());
        this.updateNZ(this.a);
        return 4;
      case 0x5d: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.a ^= this.memory.read((addr + this.x) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x59: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.a ^= this.memory.read((addr + this.y) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x41: // (Indirect, X)
        this.a ^= this.memory.read(this.addrIndX());
        this.updateNZ(this.a);
        return 6;
      case 0x51: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.a ^= this.memory.read(res.addr);
          this.updateNZ(this.a);
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // INC - Increment Memory
      // ==========================================
      case 0xe6: // Zero Page
        addr = this.memory.read(this.pc++);
        cycles = 5;
        this.incMem(addr);
        return cycles;
      case 0xf6: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        cycles = 6;
        this.incMem(addr);
        return cycles;
      case 0xee: // Absolute
        addr = this.fetchWord();
        cycles = 6;
        this.incMem(addr);
        return cycles;
      case 0xfe: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        cycles = 7;
        this.incMem(addr);
        return cycles;

      // ==========================================
      // INX / INY - Increment Registers
      // ==========================================
      case 0xe8: // INX
        this.x = (this.x + 1) & 0xff;
        this.updateNZ(this.x);
        return 2;
      case 0xc8: // INY
        this.y = (this.y + 1) & 0xff;
        this.updateNZ(this.y);
        return 2;

      // ==========================================
      // JMP - Jump
      // ==========================================
      case 0x4c: // Absolute
        this.pc = this.fetchWord();
        return 3;
      case 0x6c: // Indirect (con bug original de 6502 en frontera de página $xxFF)
        {
          const ptr = this.fetchWord();
          const low = this.memory.read(ptr);
          // Si ptr es $xxFF, el byte alto se lee de $xx00 en vez de $xxFF + 1
          const highPtr = (ptr & 0xff) === 0xff ? (ptr & 0xff00) : (ptr + 1);
          const high = this.memory.read(highPtr);
          this.pc = (high << 8) | low;
          return 5;
        }

      // ==========================================
      // JSR / RTS - Jump to Subroutine / Return
      // ==========================================
      case 0x20: // JSR Absolute
        {
          const target = this.fetchWord();
          // JSR apila la dirección del último byte de la instrucción (PC - 1)
          this.pushWord((this.pc - 1) & 0xffff);
          this.pc = target;
          return 6;
        }
      case 0x60: // RTS Implied
        this.pc = (this.pullWord() + 1) & 0xffff;
        return 6;

      // ==========================================
      // LDA - Load Accumulator
      // ==========================================
      case 0xa9: // Immediate
        this.a = this.memory.read(this.pc++);
        this.updateNZ(this.a);
        return 2;
      case 0xa5: // Zero Page
        this.a = this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.a);
        return 3;
      case 0xb5: // Zero Page, X
        this.a = this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff);
        this.updateNZ(this.a);
        return 4;
      case 0xad: // Absolute
        this.a = this.memory.read(this.fetchWord());
        this.updateNZ(this.a);
        return 4;
      case 0xbd: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.a = this.memory.read((addr + this.x) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0xb9: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.a = this.memory.read((addr + this.y) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0xa1: // (Indirect, X)
        this.a = this.memory.read(this.addrIndX());
        this.updateNZ(this.a);
        return 6;
      case 0xb1: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.a = this.memory.read(res.addr);
          this.updateNZ(this.a);
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // LDX - Load X Register
      // ==========================================
      case 0xa2: // Immediate
        this.x = this.memory.read(this.pc++);
        this.updateNZ(this.x);
        return 2;
      case 0xa6: // Zero Page
        this.x = this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.x);
        return 3;
      case 0xb6: // Zero Page, Y
        this.x = this.memory.read((this.memory.read(this.pc++) + this.y) & 0xff);
        this.updateNZ(this.x);
        return 4;
      case 0xae: // Absolute
        this.x = this.memory.read(this.fetchWord());
        this.updateNZ(this.x);
        return 4;
      case 0xbe: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.x = this.memory.read((addr + this.y) & 0xffff);
        this.updateNZ(this.x);
        return 4 + (pageCrossed ? 1 : 0);

      // ==========================================
      // LDY - Load Y Register
      // ==========================================
      case 0xa0: // Immediate
        this.y = this.memory.read(this.pc++);
        this.updateNZ(this.y);
        return 2;
      case 0xa4: // Zero Page
        this.y = this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.y);
        return 3;
      case 0xb4: // Zero Page, X
        this.y = this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff);
        this.updateNZ(this.y);
        return 4;
      case 0xac: // Absolute
        this.y = this.memory.read(this.fetchWord());
        this.updateNZ(this.y);
        return 4;
      case 0xbc: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.y = this.memory.read((addr + this.x) & 0xffff);
        this.updateNZ(this.y);
        return 4 + (pageCrossed ? 1 : 0);

      // ==========================================
      // LSR - Logical Shift Right
      // ==========================================
      case 0x4a: // Accumulator
        this.a = this.lsrVal(this.a);
        return 2;
      case 0x46: // Zero Page
        addr = this.memory.read(this.pc++);
        this.memory.write(addr, this.lsrVal(this.memory.read(addr)));
        return 5;
      case 0x56: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        this.memory.write(addr, this.lsrVal(this.memory.read(addr)));
        return 6;
      case 0x4e: // Absolute
        addr = this.fetchWord();
        this.memory.write(addr, this.lsrVal(this.memory.read(addr)));
        return 6;
      case 0x5e: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        this.memory.write(addr, this.lsrVal(this.memory.read(addr)));
        return 7;

      // ==========================================
      // NOP - No Operation
      // ==========================================
      case 0xea:
        return 2;

      // ==========================================
      // ORA - Logical Inclusive OR
      // ==========================================
      case 0x09: // Immediate
        this.a |= this.memory.read(this.pc++);
        this.updateNZ(this.a);
        return 2;
      case 0x05: // Zero Page
        this.a |= this.memory.read(this.memory.read(this.pc++));
        this.updateNZ(this.a);
        return 3;
      case 0x15: // Zero Page, X
        this.a |= this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff);
        this.updateNZ(this.a);
        return 4;
      case 0x0d: // Absolute
        this.a |= this.memory.read(this.fetchWord());
        this.updateNZ(this.a);
        return 4;
      case 0x1d: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.a |= this.memory.read((addr + this.x) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x19: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.a |= this.memory.read((addr + this.y) & 0xffff);
        this.updateNZ(this.a);
        return 4 + (pageCrossed ? 1 : 0);
      case 0x01: // (Indirect, X)
        this.a |= this.memory.read(this.addrIndX());
        this.updateNZ(this.a);
        return 6;
      case 0x11: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.a |= this.memory.read(res.addr);
          this.updateNZ(this.a);
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // Stack Operations (PHA, PHP, PLA, PLP)
      // ==========================================
      case 0x48: // PHA
        this.push(this.a);
        return 3;
      case 0x08: // PHP (Empuja con bits 4 y 5 en 1)
        this.push(this.status | CpuFlags.Break | CpuFlags.Unused);
        return 3;
      case 0x68: // PLA
        this.a = this.pull();
        this.updateNZ(this.a);
        return 4;
      case 0x28: // PLP (Bit 5 siempre en 1, Bit 4 no se almacena en registro)
        this.status = (this.pull() & ~CpuFlags.Break) | CpuFlags.Unused;
        return 4;

      // ==========================================
      // ROL - Rotate Left
      // ==========================================
      case 0x2a: // Accumulator
        this.a = this.rolVal(this.a);
        return 2;
      case 0x26: // Zero Page
        addr = this.memory.read(this.pc++);
        this.memory.write(addr, this.rolVal(this.memory.read(addr)));
        return 5;
      case 0x36: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        this.memory.write(addr, this.rolVal(this.memory.read(addr)));
        return 6;
      case 0x2e: // Absolute
        addr = this.fetchWord();
        this.memory.write(addr, this.rolVal(this.memory.read(addr)));
        return 6;
      case 0x3e: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        this.memory.write(addr, this.rolVal(this.memory.read(addr)));
        return 7;

      // ==========================================
      // ROR - Rotate Right
      // ==========================================
      case 0x6a: // Accumulator
        this.a = this.rorVal(this.a);
        return 2;
      case 0x66: // Zero Page
        addr = this.memory.read(this.pc++);
        this.memory.write(addr, this.rorVal(this.memory.read(addr)));
        return 5;
      case 0x76: // Zero Page, X
        addr = (this.memory.read(this.pc++) + this.x) & 0xff;
        this.memory.write(addr, this.rorVal(this.memory.read(addr)));
        return 6;
      case 0x6e: // Absolute
        addr = this.fetchWord();
        this.memory.write(addr, this.rorVal(this.memory.read(addr)));
        return 6;
      case 0x7e: // Absolute, X
        addr = (this.fetchWord() + this.x) & 0xffff;
        this.memory.write(addr, this.rorVal(this.memory.read(addr)));
        return 7;

      // ==========================================
      // RTI - Return from Interrupt
      // ==========================================
      case 0x40:
        this.status = (this.pull() & ~CpuFlags.Break) | CpuFlags.Unused;
        this.pc = this.pullWord();
        return 6;

      // ==========================================
      // SBC - Subtract with Carry
      // ==========================================
      case 0xe9: // Immediate
        this.sbc(this.memory.read(this.pc++));
        return 2;
      case 0xe5: // Zero Page
        this.sbc(this.memory.read(this.memory.read(this.pc++)));
        return 3;
      case 0xf5: // Zero Page, X
        this.sbc(this.memory.read((this.memory.read(this.pc++) + this.x) & 0xff));
        return 4;
      case 0xed: // Absolute
        this.sbc(this.memory.read(this.fetchWord()));
        return 4;
      case 0xfd: // Absolute, X
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.x) > 0xff;
        this.sbc(this.memory.read((addr + this.x) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0xf9: // Absolute, Y
        addr = this.fetchWord();
        pageCrossed = ((addr & 0xff) + this.y) > 0xff;
        this.sbc(this.memory.read((addr + this.y) & 0xffff));
        return 4 + (pageCrossed ? 1 : 0);
      case 0xe1: // (Indirect, X)
        this.sbc(this.memory.read(this.addrIndX()));
        return 6;
      case 0xf1: // (Indirect), Y
        {
          const res = this.addrIndY();
          this.sbc(this.memory.read(res.addr));
          return 5 + (res.pageCrossed ? 1 : 0);
        }

      // ==========================================
      // STA - Store Accumulator
      // ==========================================
      case 0x85: // Zero Page
        this.memory.write(this.memory.read(this.pc++), this.a);
        return 3;
      case 0x95: // Zero Page, X
        this.memory.write((this.memory.read(this.pc++) + this.x) & 0xff, this.a);
        return 4;
      case 0x8d: // Absolute
        this.memory.write(this.fetchWord(), this.a);
        return 4;
      case 0x9d: // Absolute, X
        this.memory.write((this.fetchWord() + this.x) & 0xffff, this.a);
        return 5;
      case 0x99: // Absolute, Y
        this.memory.write((this.fetchWord() + this.y) & 0xffff, this.a);
        return 5;
      case 0x81: // (Indirect, X)
        this.memory.write(this.addrIndX(), this.a);
        return 6;
      case 0x91: // (Indirect), Y
        this.memory.write(this.addrIndY().addr, this.a);
        return 6;

      // ==========================================
      // STX - Store X Register
      // ==========================================
      case 0x86: // Zero Page
        this.memory.write(this.memory.read(this.pc++), this.x);
        return 3;
      case 0x96: // Zero Page, Y
        this.memory.write((this.memory.read(this.pc++) + this.y) & 0xff, this.x);
        return 4;
      case 0x8e: // Absolute
        this.memory.write(this.fetchWord(), this.x);
        return 4;

      // ==========================================
      // STY - Store Y Register
      // ==========================================
      case 0x84: // Zero Page
        this.memory.write(this.memory.read(this.pc++), this.y);
        return 3;
      case 0x94: // Zero Page, X
        this.memory.write((this.memory.read(this.pc++) + this.x) & 0xff, this.y);
        return 4;
      case 0x8c: // Absolute
        this.memory.write(this.fetchWord(), this.y);
        return 4;

      // ==========================================
      // Transfers (TAX, TAY, TSX, TXA, TXS, TYA)
      // ==========================================
      case 0xaa: // TAX
        this.x = this.a;
        this.updateNZ(this.x);
        return 2;
      case 0xa8: // TAY
        this.y = this.a;
        this.updateNZ(this.y);
        return 2;
      case 0xba: // TSX
        this.x = this.sp;
        this.updateNZ(this.x);
        return 2;
      case 0x8a: // TXA
        this.a = this.x;
        this.updateNZ(this.a);
        return 2;
      case 0x9a: // TXS
        this.sp = this.x;
        return 2;
      case 0x98: // TYA
        this.a = this.y;
        this.updateNZ(this.a);
        return 2;

      default:
        // Opcodes no oficiales se ignorarán de momento (NOP de 2 ciclos)
        return 2;
    }
  }

  // ==========================================
  // Métodos Auxiliares de Modos y Operaciones
  // ==========================================

  private fetchWord(): number {
    const low = this.memory.read(this.pc++);
    const high = this.memory.read(this.pc++);
    return (high << 8) | low;
  }

  private addrIndX(): number {
    const ptr = (this.memory.read(this.pc++) + this.x) & 0xff;
    const low = this.memory.read(ptr);
    const high = this.memory.read((ptr + 1) & 0xff);
    return (high << 8) | low;
  }

  private addrIndY(): { addr: number; pageCrossed: boolean } {
    const ptr = this.memory.read(this.pc++);
    const low = this.memory.read(ptr);
    const high = this.memory.read((ptr + 1) & 0xff);
    const base = (high << 8) | low;
    const addr = (base + this.y) & 0xffff;
    const pageCrossed = ((base & 0xff) + this.y) > 0xff;
    return { addr, pageCrossed };
  }

  private branch(condition: boolean): number {
    const offset = this.memory.read(this.pc++);
    if (!condition) {
      return 2;
    }
    const signedOffset = offset > 127 ? offset - 256 : offset;
    const oldPc = this.pc;
    this.pc = (this.pc + signedOffset) & 0xffff;

    // +1 ciclo por salto tomado, +1 extra si cruza frontera de página
    const pageCrossed = (oldPc & 0xff00) !== (this.pc & 0xff00);
    return 3 + (pageCrossed ? 1 : 0);
  }

  private bit(val: number): void {
    this.status = (this.status & ~(CpuFlags.Negative | CpuFlags.Overflow | CpuFlags.Zero))
      | (val & (CpuFlags.Negative | CpuFlags.Overflow))
      | ((this.a & val) === 0 ? CpuFlags.Zero : 0);
  }

  private cmp(reg: number, val: number): void {
    const diff = reg - val;
    this.status = (this.status & ~(CpuFlags.Carry | CpuFlags.Zero | CpuFlags.Negative))
      | (reg >= val ? CpuFlags.Carry : 0)
      | (reg === val ? CpuFlags.Zero : 0)
      | (diff & 0x80 ? CpuFlags.Negative : 0);
  }

  private decMem(addr: number): void {
    const val = (this.memory.read(addr) - 1) & 0xff;
    this.memory.write(addr, val);
    this.updateNZ(val);
  }

  private incMem(addr: number): void {
    const val = (this.memory.read(addr) + 1) & 0xff;
    this.memory.write(addr, val);
    this.updateNZ(val);
  }

  private aslVal(val: number): number {
    const carry = (val & 0x80) ? CpuFlags.Carry : 0;
    const res = (val << 1) & 0xff;
    this.status = (this.status & ~CpuFlags.Carry) | carry;
    this.updateNZ(res);
    return res;
  }

  private lsrVal(val: number): number {
    const carry = (val & 0x01) ? CpuFlags.Carry : 0;
    const res = (val >> 1) & 0xff;
    this.status = (this.status & ~CpuFlags.Carry) | carry;
    this.updateNZ(res);
    return res;
  }

  private rolVal(val: number): number {
    const oldCarry = (this.status & CpuFlags.Carry) ? 1 : 0;
    const newCarry = (val & 0x80) ? CpuFlags.Carry : 0;
    const res = ((val << 1) | oldCarry) & 0xff;
    this.status = (this.status & ~CpuFlags.Carry) | newCarry;
    this.updateNZ(res);
    return res;
  }

  private rorVal(val: number): number {
    const oldCarry = (this.status & CpuFlags.Carry) ? 0x80 : 0;
    const newCarry = (val & 0x01) ? CpuFlags.Carry : 0;
    const res = (val >> 1) | oldCarry;
    this.status = (this.status & ~CpuFlags.Carry) | newCarry;
    this.updateNZ(res);
    return res;
  }

  private adc(val: number): void {
    const c = (this.status & CpuFlags.Carry) ? 1 : 0;

    if (this.status & CpuFlags.Decimal) {
      // Modo BCD NMOS 6502
      let al = (this.a & 0x0f) + (val & 0x0f) + c;
      let ah = (this.a >> 4) + (val >> 4);
      const binSum = this.a + val + c;
      const v = (~(this.a ^ val) & (this.a ^ binSum) & 0x80) !== 0;

      if (al > 9) {
        al = (al + 6) & 0x0f;
        ah++;
      }

      let carry = 0;
      if (ah > 9) {
        ah = (ah + 6) & 0x0f;
        carry = CpuFlags.Carry;
      }

      // En NMOS 6502, N y Z se establecen desde la suma binaria
      this.status = (this.status & ~(CpuFlags.Negative | CpuFlags.Overflow | CpuFlags.Zero | CpuFlags.Carry))
        | (binSum & 0x80 ? CpuFlags.Negative : 0)
        | ((binSum & 0xff) === 0 ? CpuFlags.Zero : 0)
        | (v ? CpuFlags.Overflow : 0)
        | carry;

      this.a = ((ah << 4) | (al & 0x0f)) & 0xff;
    } else {
      // Modo Binario
      const sum = this.a + val + c;
      const v = (~(this.a ^ val) & (this.a ^ sum) & 0x80) !== 0;
      this.status = (this.status & ~(CpuFlags.Carry | CpuFlags.Overflow))
        | (sum > 0xff ? CpuFlags.Carry : 0)
        | (v ? CpuFlags.Overflow : 0);
      this.a = sum & 0xff;
      this.updateNZ(this.a);
    }
  }

  private sbc(val: number): void {
    const c = (this.status & CpuFlags.Carry) ? 1 : 0;

    if (this.status & CpuFlags.Decimal) {
      // Modo BCD NMOS 6502
      const binDiff = this.a - val - (1 - c);
      const v = ((this.a ^ val) & (this.a ^ binDiff) & 0x80) !== 0;

      let al = (this.a & 0x0f) - (val & 0x0f) - (1 - c);
      let ah = (this.a >> 4) - (val >> 4);

      if (al < 0) {
        al = (al - 6) & 0x0f;
        ah--;
      }

      if (ah < 0) {
        ah = (ah - 6) & 0x0f;
      }

      const carry = binDiff >= 0 ? CpuFlags.Carry : 0;

      // En NMOS 6502, N y Z se establecen desde la resta binaria
      this.status = (this.status & ~(CpuFlags.Negative | CpuFlags.Overflow | CpuFlags.Zero | CpuFlags.Carry))
        | (binDiff & 0x80 ? CpuFlags.Negative : 0)
        | ((binDiff & 0xff) === 0 ? CpuFlags.Zero : 0)
        | (v ? CpuFlags.Overflow : 0)
        | carry;

      this.a = ((ah << 4) | (al & 0x0f)) & 0xff;
    } else {
      // Modo Binario (SBC es A - val - (1 - C))
      const diff = this.a - val - (1 - c);
      const v = ((this.a ^ val) & (this.a ^ diff) & 0x80) !== 0;
      this.status = (this.status & ~(CpuFlags.Carry | CpuFlags.Overflow))
        | (diff >= 0 ? CpuFlags.Carry : 0)
        | (v ? CpuFlags.Overflow : 0);
      this.a = diff & 0xff;
      this.updateNZ(this.a);
    }
  }
}
