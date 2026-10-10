import * as fs from 'fs';
import * as path from 'path';
import { C64System } from '../src/system/c64';

async function testKeyboardAndBasic() {
  const c64 = new C64System();

  const basic = fs.readFileSync(path.resolve(__dirname, '../public/roms/basic.bin'));
  const kernal = fs.readFileSync(path.resolve(__dirname, '../public/roms/kernal.bin'));
  const chargen = fs.readFileSync(path.resolve(__dirname, '../public/roms/chargen.bin'));

  c64.memory.loadRom('basic', basic);
  c64.memory.loadRom('kernal', kernal);
  c64.memory.loadRom('chargen', chargen);
  c64.reset();

  console.log('🚀 1. Booteando C64 hasta llegar a READY...');
  // Ejecutar 2.5 millones de ciclos hasta que el KERNAL termine la inicialización
  runCycles(c64, 2_500_000);

  console.log('⌨️  2. Escribiendo programa: 10 PRINT "HOLA"...');
  typeString(c64, '10 PRINT "HOLA"\n');

  console.log('▶️  3. Escribiendo comando: RUN...');
  typeString(c64, 'RUN\n');

  console.log('⏳ 4. Ejecutando programa BASIC...');
  runCycles(c64, 500_000);

  console.log('\n================ PANTALLA C64 TRAS EJECUTAR BASIC ================');
  for (let row = 0; row < 15; row++) {
    let rowText = '';
    for (let col = 0; col < 40; col++) {
      const code = c64.memory.peekRam(0x0400 + row * 40 + col);
      if (code >= 1 && code <= 26) {
        rowText += String.fromCharCode(64 + code);
      } else if (code >= 48 && code <= 57) {
        rowText += String.fromCharCode(code);
      } else if (code === 32) {
        rowText += ' ';
      } else if (code === 34) {
        rowText += '"';
      } else if (code === 42) {
        rowText += '*';
      } else if (code === 46) {
        rowText += '.';
      } else {
        rowText += code === 0 ? '@' : String.fromCharCode(code);
      }
    }
    if (rowText.trim().length > 0) {
      console.log(`Fila ${row.toString().padStart(2, '0')}: [${rowText}]`);
    }
  }
  console.log('==================================================================\n');

  // Verificar que HOLA aparece en pantalla
  let screenString = '';
  for (let i = 0x0400; i < 0x07e8; i++) {
    const code = c64.memory.peekRam(i);
    screenString += String.fromCharCode(code >= 1 && code <= 26 ? 64 + code : code);
  }

  if (screenString.includes('HOLA') && screenString.includes('READY.')) {
    console.log('🎉 ¡SEGUNDO HITO SUPERADO CON ÉXITO!');
    console.log('   El programa BASIC V2 fue tecleado, interpretado y ejecutado.');
    console.log('   "HOLA" y "READY." se encuentran correctamente en pantalla.');
    process.exit(0);
  } else {
    console.error('❌ Error: No se encontró la salida esperada en pantalla.');
    process.exit(1);
  }
}

function runCycles(c64: C64System, count: number): void {
  let executed = 0;
  while (executed < count) {
    const slice = Math.min(19656, count - executed);
    c64.step(slice);
    executed += slice;
  }
}

function typeString(c64: C64System, text: string): void {
  for (const char of text) {
    const coords = c64.keyboard.mapCharToC64(char);
    if (coords) {
      // Presionar tecla(s)
      for (const coord of coords) {
        c64.keyboard.press(coord);
      }
      // Mantener presionada durante ~4 cuadros (80,000 ciclos) para asegurar lectura por SCNKEY
      runCycles(c64, 80_000);

      // Soltar tecla(s)
      for (const coord of coords) {
        c64.keyboard.release(coord);
      }
      // Dejar espacio sin presionar durante ~3 cuadros (60,000 ciclos) para anti-rebote
      runCycles(c64, 60_000);
    }
  }
}

testKeyboardAndBasic();
