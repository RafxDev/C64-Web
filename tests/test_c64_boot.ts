import * as fs from 'fs';
import * as path from 'path';
import { MemoryBus } from '../src/memory/memory_bus';
import { Cpu6510 } from '../src/cpu/cpu6510';
import { CIA1 } from '../src/cia/cia1';
import { CIA2 } from '../src/cia/cia2';
import { Vic2 } from '../src/vic/vic2';

async function testBoot() {
  const memory = new MemoryBus();
  const basic = fs.readFileSync(path.resolve(__dirname, '../public/roms/basic.bin'));
  const kernal = fs.readFileSync(path.resolve(__dirname, '../public/roms/kernal.bin'));
  const chargen = fs.readFileSync(path.resolve(__dirname, '../public/roms/chargen.bin'));

  memory.loadRom('basic', basic);
  memory.loadRom('kernal', kernal);
  memory.loadRom('chargen', chargen);

  const cia1 = new CIA1();
  const cia2 = new CIA2();
  const vic = new Vic2();

  memory.ioBus.cia1 = cia1;
  memory.ioBus.cia2 = cia2;
  memory.ioBus.vic = vic;

  cia2.onVicBankChange = (bank) => {
    memory.vicBank = bank;
  };

  const cpu = new Cpu6510(memory);
  cpu.reset();

  console.log(`Punto de inicio RESET: PC=$${cpu.pc.toString(16).toUpperCase()}`);

  // Ejecutar 3,000,000 de ciclos (equivalente a ~3 segundos de C64 real)
  const targetCycles = 3_000_000;
  let cycles = 0;

  while (cycles < targetCycles) {
    const stepCycles = cpu.step();
    vic.step(stepCycles);
    cia1.step(stepCycles);
    cia2.step(stepCycles);
    cycles += stepCycles;
  }

  console.log(`Ejecutados ${cycles.toLocaleString()} ciclos. Estado CPU: PC=$${cpu.pc.toString(16).toUpperCase()}`);

  // Volcar el contenido de la memoria de pantalla ($0400 - $07E7, 40x25 = 1000 caracteres)
  console.log('\n--- CONTENIDO DE LA MEMORIA DE PANTALLA ($0400) ---');
  let output = '';
  for (let r = 0; r < 25; r++) {
    let line = '';
    for (let c = 0; c < 40; c++) {
      const code = memory.peekRam(0x0400 + r * 40 + c);
      // Convertir códigos PETSCII a ASCII imprimible aproximado
      if (code >= 1 && code <= 26) {
        line += String.fromCharCode(64 + code);
      } else if (code >= 48 && code <= 57) {
        line += String.fromCharCode(code);
      } else if (code === 32) {
        line += ' ';
      } else if (code === 42) {
        line += '*';
      } else {
        line += code === 0 ? '@' : String.fromCharCode(code);
      }
    }
    if (line.trim().length > 0) {
      output += `Línea ${r.toString().padStart(2, ' ')}: [${line}]\n`;
    }
  }
  console.log(output || '(Pantalla vacía)');
}

testBoot();
