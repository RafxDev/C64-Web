/**
 * Tipos e interfaces fundamentales del subsistema de memoria del Commodore 64.
 */

export interface IMemoryBus {
  /** Lee un byte (8-bit) desde el espacio de direcciones de la CPU ($0000 - $FFFF) */
  read(address: number): number;

  /** Escribe un byte (8-bit) en el espacio de direcciones de la CPU ($0000 - $FFFF) */
  write(address: number, value: number): void;

  /** Lee una palabra de 16-bit (Little-Endian) */
  readWord(address: number): number;

  /** Escribe una palabra de 16-bit (Little-Endian) */
  writeWord(address: number, value: number): void;

  /** Permite al VIC-II leer directamente desde los bancos de memoria de video */
  readVic(address: number): number;

  /** Lee directamente de la RAM física sin pasar por la lógica de banking (para debug) */
  peekRam(address: number): number;

  /** Escribe directamente en la RAM física sin pasar por la lógica de banking (para debug/cargas) */
  pokeRam(address: number, value: number): void;

  /** Carga una ROM en su buffer correspondiente */
  loadRom(type: RomType, data: Uint8Array): void;

  /** Obtiene el valor actual de los registros de puerto de la CPU $0000 y $0001 */
  getPortState(): { ddr: number; port: number };

  /** Reinicia el estado de memoria al encendido */
  reset(): void;
}

export type RomType = 'basic' | 'kernal' | 'chargen';

export interface IIODevice {
  read(address: number): number;
  write(address: number, value: number): void;
  reset(): void;
}
