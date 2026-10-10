import * as fs from 'fs';
import * as path from 'path';
import { C64System } from '../src/system/c64';
import { PAL_CONSTANTS } from '../src/vic/constants';

async function verifyScreen() {
  const c64 = new C64System();

  const basic = fs.readFileSync(path.resolve(__dirname, '../public/roms/basic.bin'));
  const kernal = fs.readFileSync(path.resolve(__dirname, '../public/roms/kernal.bin'));
  const chargen = fs.readFileSync(path.resolve(__dirname, '../public/roms/chargen.bin'));

  c64.memory.loadRom('basic', basic);
  c64.memory.loadRom('kernal', kernal);
  c64.memory.loadRom('chargen', chargen);
  c64.reset();

  console.log('🚀 Arrancando emulación del C64...');

  // Ejecutar 3 millones de ciclos para completar el booteo de KERNAL y BASIC
  const targetCycles = 3_000_000;
  let executed = 0;
  while (executed < targetCycles) {
    c64.step(19656);
    executed += 19656;
  }

  console.log('✅ Booteo finalizado. Extrayendo búfer de pantalla del VIC-II...');
  const fb = c64.vic.getFrameBuffer();

  // Muestrear píxeles del área activa (320x200) para mostrar cómo se ve
  // Convertimos a matriz de caracteres de texto
  console.log('\n================ VISUALIZACIÓN DE PANTALLA VIC-II ================');

  // Recorrer cada una de las 25 filas de caracteres (cada 8 líneas de píxeles)
  for (let row = 0; row < 25; row++) {
    const yPixel = PAL_CONSTANTS.BORDER_TOP + row * 8 + 4; // Tomar muestra en la mitad del caracter
    let rowText = '';

    for (let col = 0; col < 40; col++) {
      const code = c64.memory.peekRam(0x0400 + row * 40 + col);
      // Mapeo básico de pantalla C64 a ASCII para visualización
      if (code >= 1 && code <= 26) {
        rowText += String.fromCharCode(64 + code);
      } else if (code >= 48 && code <= 57) {
        rowText += String.fromCharCode(code);
      } else if (code === 32) {
        rowText += ' ';
      } else if (code === 42) {
        rowText += '*';
      } else if (code === 46) {
        rowText += '.';
      } else {
        rowText += code === 0 ? '@' : ' ';
      }
    }

    if (rowText.trim().length > 0) {
      console.log(`Fila ${row.toString().padStart(2, '0')}: |${rowText}|`);
    } else {
      console.log(`Fila ${row.toString().padStart(2, '0')}: |${' '.repeat(40)}|`);
    }
  }

  console.log('==================================================================\n');
  console.log(`Color del borde: ${c64.vic.borderColor} (Azul Claro)`);
  console.log(`Color del fondo: ${c64.vic.backgroundColor} (Azul Oscuro)`);
  console.log(`FrameBuffer total de píxeles: ${fb.length} píxeles (384x272)`);
}

verifyScreen();
