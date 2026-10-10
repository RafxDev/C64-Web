/**
 * Constantes de sincronización y dimensiones de pantalla del chip VIC-II (MOS 6569 - PAL).
 */

export const PAL_CONSTANTS = {
  // Temporización de ciclo y reloj PAL
  CPU_CLOCK_HZ: 985248,      // 0.985248 MHz
  CYCLES_PER_LINE: 63,        // 63 ciclos por línea de barrido
  RASTER_LINES: 312,          // 312 líneas de barrido por cuadro
  CYCLES_PER_FRAME: 19656,    // 63 * 312 = 19,656 ciclos por cuadro
  FRAME_RATE_HZ: 985248 / 19656, // ~50.1245 Hz

  // Geometría del área visual (incluyendo bordes estándar)
  SCREEN_WIDTH: 384,
  SCREEN_HEIGHT: 272,

  // Geometría del área de texto y gráficos activa
  ACTIVE_WIDTH: 320,
  ACTIVE_HEIGHT: 200,

  // Márgenes del borde (en píxeles)
  BORDER_LEFT: 32,
  BORDER_RIGHT: 32,
  BORDER_TOP: 36,
  BORDER_BOTTOM: 36,
} as const;
