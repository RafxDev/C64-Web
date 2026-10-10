import { IIODevice } from '../memory/types';

export interface IVic2 extends IIODevice {
  /** Avanza el estado del VIC-II un número determinado de ciclos de reloj */
  step(cycles: number): void;

  /** Obtiene el búfer de píxeles actual (384 x 272 x 32-bit RGBA) */
  getFrameBuffer(): Uint32Array;

  /** Línea de barrido actual (0 a 311 en PAL) */
  currentRaster: number;

  /** Color del borde ($D020) */
  borderColor: number;

  /** Color del fondo ($D021) */
  backgroundColor: number;
}
