import * as fs from 'fs';
import * as path from 'path';
import { Cpu6510 } from '../src/cpu/cpu6510';
import { IMemoryBus, RomType } from '../src/memory/types';

/**
 * Bus de memoria plano de 64 KB de RAM pura para la suite de pruebas funcionales de Klaus Dormann.
 */
class TestMemoryBus implements IMemoryBus {
  public ram = new Uint8Array(65536);

  read(address: number): number {
    return this.ram[address & 0xffff];
  }

  write(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }

  readWord(address: number): number {
    const low = this.read(address);
    const high = this.read(address + 1);
    return (high << 8) | low;
  }

  writeWord(address: number, value: number): void {
    this.write(address, value & 0xff);
    this.write(address + 1, (value >> 8) & 0xff);
  }

  readVic(_address: number): number {
    return 0;
  }

  peekRam(address: number): number {
    return this.ram[address & 0xffff];
  }

  pokeRam(address: number, value: number): void {
    this.ram[address & 0xffff] = value & 0xff;
  }

  loadRom(_type: RomType, _data: Uint8Array): void {}

  getPortState() {
    return { ddr: 0x2f, port: 0x37 };
  }

  reset(): void {
    this.ram.fill(0);
  }
}

async function runTest() {
  const testFile = path.resolve(__dirname, '6502_functional_test.bin');
  if (!fs.existsSync(testFile)) {
    console.error('No se encontró tests/6502_functional_test.bin');
    process.exit(1);
  }

  const binary = fs.readFileSync(testFile);
  const mem = new TestMemoryBus();
  mem.ram.set(binary);

  const cpu = new Cpu6510(mem);
  cpu.pc = 0x0400; // Punto de entrada oficial del test de Klaus Dormann
  cpu.status = 0x24; // Unused (0x20) e Interrupt (0x04)

  const SUCCESS_PC = 0x3469;
  let prevPc = 0;
  let instructionsCount = 0;
  const maxInstructions = 100_000_000;

  console.log('🏁 Iniciando suite de pruebas funcionales de Klaus Dormann (6502)...');
  console.log(`   Punto de partida: PC=$0400 | Objetivo de éxito: PC=$${SUCCESS_PC.toString(16).toUpperCase()}`);

  const startTime = Date.now();

  while (instructionsCount < maxInstructions) {
    prevPc = cpu.pc;
    cpu.step();
    instructionsCount++;

    // Detección de bucle infinito (JMP *)
    if (cpu.pc === prevPc) {
      if (cpu.pc === SUCCESS_PC) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n🎉 ¡ÉXITO TOTAL! Test de Klaus Dormann SUPERADO.`);
        console.log(`   Atrapado en el bucle de éxito: $${cpu.pc.toString(16).toUpperCase()}`);
        console.log(`   Instrucciones ejecutadas: ${instructionsCount.toLocaleString()}`);
        console.log(`   Ciclos de reloj de CPU: ${cpu.totalCycles.toLocaleString()}`);
        console.log(`   Tiempo transcurrido: ${elapsed}s`);
        process.exit(0);
      } else {
        console.error(`\n❌ FALLO en el test. Atrapado en bucle de error: $${cpu.pc.toString(16).toUpperCase()}`);
        console.error(`   Registros: A=$${cpu.a.toString(16).padStart(2, '0')} X=$${cpu.x.toString(16).padStart(2, '0')} Y=$${cpu.y.toString(16).padStart(2, '0')} SP=$${cpu.sp.toString(16).padStart(2, '0')} P=$${cpu.status.toString(16).padStart(2, '0')}`);
        process.exit(1);
      }
    }
  }

  console.error('\n❌ Se alcanzó el límite de instrucciones sin finalizar.');
  process.exit(1);
}

runTest();
