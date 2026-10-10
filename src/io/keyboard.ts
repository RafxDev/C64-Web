import { CIA1 } from '../cia/cia1';
import { Cpu6510 } from '../cpu/cpu6510';

export interface KeyCoord {
  row: number;
  col: number;
}

/**
 * Matriz oficial de teclado del Commodore 64 (indexada exactamente como el KERNAL en $EB81):
 * - col: línea de columna controlada por CIA 1 Port A ($DC00, bits 0-7)
 * - row: línea de fila leída por CIA 1 Port B ($DC01, bits 0-7)
 */
export const C64_KEYS = {
  // Columna 0 (Port A bit 0)
  DEL:        { row: 0, col: 0 },
  RETURN:     { row: 1, col: 0 },
  CRSR_RT:    { row: 2, col: 0 },
  F7:         { row: 3, col: 0 },
  F1:         { row: 4, col: 0 },
  F3:         { row: 5, col: 0 },
  F5:         { row: 6, col: 0 },
  CRSR_DN:    { row: 7, col: 0 },

  // Columna 1 (Port A bit 1)
  KEY_3:      { row: 0, col: 1 },
  W:          { row: 1, col: 1 },
  A:          { row: 2, col: 1 },
  KEY_4:      { row: 3, col: 1 },
  Z:          { row: 4, col: 1 },
  S:          { row: 5, col: 1 },
  E:          { row: 6, col: 1 },
  L_SHIFT:    { row: 7, col: 1 },

  // Columna 2 (Port A bit 2)
  KEY_5:      { row: 0, col: 2 },
  R:          { row: 1, col: 2 },
  D:          { row: 2, col: 2 },
  KEY_6:      { row: 3, col: 2 },
  C:          { row: 4, col: 2 },
  F:          { row: 5, col: 2 },
  T:          { row: 6, col: 2 },
  X:          { row: 7, col: 2 },

  // Columna 3 (Port A bit 3)
  KEY_7:      { row: 0, col: 3 },
  Y:          { row: 1, col: 3 },
  G:          { row: 2, col: 3 },
  KEY_8:      { row: 3, col: 3 },
  B:          { row: 4, col: 3 },
  H:          { row: 5, col: 3 },
  U:          { row: 6, col: 3 },
  V:          { row: 7, col: 3 },

  // Columna 4 (Port A bit 4)
  KEY_9:      { row: 0, col: 4 },
  I:          { row: 1, col: 4 },
  J:          { row: 2, col: 4 },
  KEY_0:      { row: 3, col: 4 },
  M:          { row: 4, col: 4 },
  K:          { row: 5, col: 4 },
  O:          { row: 6, col: 4 },
  N:          { row: 7, col: 4 },

  // Columna 5 (Port A bit 5)
  PLUS:       { row: 0, col: 5 },
  P:          { row: 1, col: 5 },
  L:          { row: 2, col: 5 },
  MINUS:      { row: 3, col: 5 },
  PERIOD:     { row: 4, col: 5 },
  COLON:      { row: 5, col: 5 },
  AT:         { row: 6, col: 5 },
  COMMA:      { row: 7, col: 5 },

  // Columna 6 (Port A bit 6)
  POUND:      { row: 0, col: 6 },
  ASTERISK:   { row: 1, col: 6 },
  SEMICOLON:  { row: 2, col: 6 },
  HOME:       { row: 3, col: 6 },
  R_SHIFT:    { row: 4, col: 6 },
  EQUAL:      { row: 5, col: 6 },
  UP_ARROW:   { row: 6, col: 6 },
  SLASH:      { row: 7, col: 6 },

  // Columna 7 (Port A bit 7)
  KEY_1:      { row: 0, col: 7 },
  LEFT_ARROW: { row: 1, col: 7 },
  CTRL:       { row: 2, col: 7 },
  KEY_2:      { row: 3, col: 7 },
  SPACE:      { row: 4, col: 7 },
  COMMODORE:  { row: 5, col: 7 },
  Q:          { row: 6, col: 7 },
  RUN_STOP:   { row: 7, col: 7 },
} as const;

/**
 * Gestor de teclado para Commodore 64.
 * Mapea eventos de teclado modernos a la matriz de 8x8 leída por CIA 1 ($DC00 / $DC01).
 */
export class KeyboardManager {
  private cia1: CIA1;
  private cpu: Cpu6510;
  private shiftLock = false;

  constructor(cia1: CIA1, cpu: Cpu6510) {
    this.cia1 = cia1;
    this.cpu = cpu;
  }

  /**
   * Presiona una tecla en la matriz física del C64.
   */
  public press(coord: KeyCoord): void {
    this.cia1.keyboardMatrix[coord.col] &= ~(1 << coord.row);
  }

  /**
   * Libera una tecla en la matriz física del C64.
   */
  public release(coord: KeyCoord): void {
    this.cia1.keyboardMatrix[coord.col] |= (1 << coord.row);
  }

  public releaseAll(): void {
    this.cia1.keyboardMatrix.fill(0xff);
  }

  /**
   * Pulsa la tecla física RESTORE (conectada a la línea NMI de la CPU).
   */
  public triggerRestore(): void {
    this.cpu.nmi();
  }

  /**
   * Manejador de evento KeyDown de navegador.
   */
  public onKeyDown(e: KeyboardEvent): boolean {
    // Si la tecla es RESTORE (F12 o PageUp)
    if (e.code === 'F12' || e.code === 'PageUp') {
      this.triggerRestore();
      e.preventDefault();
      return true;
    }

    // Tecla SHIFT LOCK (Bloq Mayús)
    if (e.code === 'CapsLock') {
      this.shiftLock = !this.shiftLock;
      if (this.shiftLock) {
        this.press(C64_KEYS.L_SHIFT);
      } else {
        this.release(C64_KEYS.L_SHIFT);
      }
      e.preventDefault();
      return true;
    }

    const coords = this.mapEventToC64(e);
    if (coords) {
      for (const c of coords) {
        this.press(c);
      }
      e.preventDefault();
      return true;
    }

    return false;
  }

  /**
   * Manejador de evento KeyUp de navegador.
   */
  public onKeyUp(e: KeyboardEvent): boolean {
    if (e.code === 'CapsLock') {
      return true;
    }

    const coords = this.mapEventToC64(e);
    if (coords) {
      for (const c of coords) {
        // No soltar Shift si Shift Lock está activo
        if (this.shiftLock && (c === C64_KEYS.L_SHIFT || c === C64_KEYS.R_SHIFT)) {
          continue;
        }
        this.release(c);
      }
      e.preventDefault();
      return true;
    }

    return false;
  }

  /**
   * Mapea un evento moderno a una o más coordenadas en la matriz (tecla + shift si aplica).
   */
  public mapEventToC64(e: KeyboardEvent): KeyCoord[] | null {
    // Teclas de control y navegación
    switch (e.code) {
      case 'Backspace':
        return [C64_KEYS.DEL];
      case 'Enter':
        return [C64_KEYS.RETURN];
      case 'Space':
        return [C64_KEYS.SPACE];
      case 'Escape':
        return [C64_KEYS.RUN_STOP];
      case 'Tab':
      case 'ControlLeft':
        return [C64_KEYS.COMMODORE]; // Tecla C=
      case 'ControlRight':
        return [C64_KEYS.CTRL];
      case 'ShiftLeft':
        return [C64_KEYS.L_SHIFT];
      case 'ShiftRight':
        return [C64_KEYS.R_SHIFT];
      case 'ArrowUp':
        return [C64_KEYS.L_SHIFT, C64_KEYS.CRSR_DN];
      case 'ArrowDown':
        return [C64_KEYS.CRSR_DN];
      case 'ArrowLeft':
        return [C64_KEYS.L_SHIFT, C64_KEYS.CRSR_RT];
      case 'ArrowRight':
        return [C64_KEYS.CRSR_RT];
      case 'Home':
        return [C64_KEYS.HOME];
      case 'F1':
        return e.shiftKey ? [C64_KEYS.L_SHIFT, C64_KEYS.F1] : [C64_KEYS.F1]; // F2 es Shift+F1
      case 'F3':
        return e.shiftKey ? [C64_KEYS.L_SHIFT, C64_KEYS.F3] : [C64_KEYS.F3]; // F4 es Shift+F3
      case 'F5':
        return e.shiftKey ? [C64_KEYS.L_SHIFT, C64_KEYS.F5] : [C64_KEYS.F5]; // F6 es Shift+F5
      case 'F7':
        return e.shiftKey ? [C64_KEYS.L_SHIFT, C64_KEYS.F7] : [C64_KEYS.F7]; // F8 es Shift+F7
    }

    // Mapeo por caracter tipado (soporta mayúsculas y caracteres de puntuación estándar)
    return this.mapCharToC64(e.key);
  }

  /**
   * Mapea un caracter individual (ASCII imprimible) al teclado C64.
   */
  public mapCharToC64(char: string): KeyCoord[] | null {
    if (char.length !== 1) return null;

    const upper = char.toUpperCase();

    // Letras A-Z
    if (upper >= 'A' && upper <= 'Z') {
      const keyCoord = (C64_KEYS as Record<string, KeyCoord>)[upper];
      if (keyCoord) return [keyCoord];
    }

    // Números 0-9
    if (char >= '0' && char <= '9') {
      const keyCoord = (C64_KEYS as Record<string, KeyCoord>)[`KEY_${char}`];
      if (keyCoord) return [keyCoord];
    }

    // Caracteres especiales y símbolos con Shift de C64
    switch (char) {
      case '"':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_2]; // En C64, Shift + 2 es " (Col 7, Row 3)
      case '!':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_1];
      case '#':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_3];
      case '$':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_4];
      case '%':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_5];
      case '&':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_6];
      case '\'':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_7];
      case '(':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_8];
      case ')':
        return [C64_KEYS.L_SHIFT, C64_KEYS.KEY_9];
      case '+':
        return [C64_KEYS.PLUS];
      case '-':
        return [C64_KEYS.MINUS];
      case '*':
        return [C64_KEYS.ASTERISK];
      case '/':
        return [C64_KEYS.SLASH];
      case '=':
        return [C64_KEYS.EQUAL];
      case ':':
        return [C64_KEYS.COLON];
      case ';':
        return [C64_KEYS.SEMICOLON];
      case ',':
        return [C64_KEYS.COMMA];
      case '.':
        return [C64_KEYS.PERIOD];
      case '?':
        return [C64_KEYS.L_SHIFT, C64_KEYS.SLASH];
      case '<':
        return [C64_KEYS.L_SHIFT, C64_KEYS.COMMA];
      case '>':
        return [C64_KEYS.L_SHIFT, C64_KEYS.PERIOD];
      case '@':
        return [C64_KEYS.AT];
      case ' ':
        return [C64_KEYS.SPACE];
      case '\n':
      case '\r':
        return [C64_KEYS.RETURN];
    }

    return null;
  }
}
