import { IIODevice } from '../memory/types';

export interface ICIA extends IIODevice {
  /** Avanza los temporizadores de la CIA */
  step(cycles: number): void;

  /** Bandera de interrupción activa */
  irqPending: boolean;
}
