/**
 * Paleta de 16 colores del VIC-II (Paleta calibrada Pepto, referente en la comunidad C64).
 */

export interface ColorRGBA {
  r: number;
  g: number;
  b: number;
  a: number;
  hex: string;
  rgba32: number; // Formato 0xAABBGGRR para escritura directa Little-Endian en ImageData
}

function createColor(r: number, g: number, b: number, hex: string): ColorRGBA {
  // En plataformas Little-Endian (x86, ARM), ImageData.data como Uint32Array es (Alpha << 24) | (Blue << 16) | (Green << 8) | Red
  const rgba32 = ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
  return { r, g, b, a: 255, hex, rgba32 };
}

export const VIC2_PALETTE: ColorRGBA[] = [
  createColor(0x00, 0x00, 0x00, '#000000'), // 0: Negro
  createColor(0xff, 0xff, 0xff, '#ffffff'), // 1: Blanco
  createColor(0x81, 0x33, 0x38, '#813338'), // 2: Rojo
  createColor(0x75, 0xce, 0xc8, '#75cec8'), // 3: Cian
  createColor(0x8e, 0x3c, 0x97, '#8e3c97'), // 4: Púrpura
  createColor(0x56, 0xac, 0x4d, '#56ac4d'), // 5: Verde
  createColor(0x2e, 0x2c, 0x9b, '#2e2c9b'), // 6: Azul
  createColor(0xed, 0xf1, 0x71, '#edf171'), // 7: Amarillo
  createColor(0x8e, 0x50, 0x29, '#8e5029'), // 8: Naranja
  createColor(0x55, 0x38, 0x00, '#553800'), // 9: Marrón
  createColor(0xc4, 0x6c, 0x71, '#c46c71'), // 10: Rojo claro
  createColor(0x4a, 0x4a, 0x4a, '#4a4a4a'), // 11: Gris oscuro
  createColor(0x7b, 0x7b, 0x7b, '#7b7b7b'), // 12: Gris medio
  createColor(0xa9, 0xff, 0x9f, '#a9ff9f'), // 13: Verde claro
  createColor(0x70, 0x6d, 0xeb, '#706deb'), // 14: Azul claro
  createColor(0xb2, 0xb2, 0xb2, '#b2b2b2'), // 15: Gris claro
];

/**
 * Array precalculado de 16 valores Uint32 para renderizado de píxeles a máxima velocidad.
 */
export const VIC2_PALETTE_RGBA32 = new Uint32Array(VIC2_PALETTE.map((c) => c.rgba32));
