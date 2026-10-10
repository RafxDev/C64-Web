import { IIODevice } from '../memory/types';

export interface ISID extends IIODevice {
  step(cycles: number): void;
}
