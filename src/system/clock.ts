import { PAL_CONSTANTS } from '../vic/constants';

export interface ClockMetrics {
  fps: number;
  cyclesThisFrame: number;
  emulationSpeedPct: number;
}

/**
 * Motor de sincronización y temporización PAL (50.12 Hz / 19,656 ciclos por fotograma).
 * Utiliza un acumulador de tiempo de alta precisión con performance.now() para
 * mantener la velocidad de reloj real exacta de 0.985248 MHz independientemente
 * de la tasa de refresco del monitor (60Hz, 120Hz, etc.).
 */
export class C64Clock {
  private isRunning = false;
  private lastTime = 0;
  private cycleDebt = 0;
  private animFrameId: number | null = null;

  // Métricas
  private frameCount = 0;
  private lastMetricTime = 0;
  private currentFps = 0;
  private currentSpeedPct = 100;
  private totalCyclesInSecond = 0;

  // Callback ejecutado por cada rebanada de ciclo o cuadro completo
  public onStep: (cycles: number) => void;
  public onFrameReady?: () => void;
  public onMetricsUpdate?: (metrics: ClockMetrics) => void;

  constructor(onStep: (cycles: number) => void) {
    this.onStep = onStep;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.lastMetricTime = this.lastTime;
    this.cycleDebt = 0;
    this.frameCount = 0;
    this.totalCyclesInSecond = 0;

    const loop = (currentTime: number) => {
      if (!this.isRunning) return;

      this.tick(currentTime);
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public toggle(): boolean {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  /**
   * Ejecuta el avance de ciclos basado en el tiempo transcurrido.
   */
  private tick(now: number): void {
    let deltaMs = now - this.lastTime;
    this.lastTime = now;

    // Protección contra el "espiral de la muerte" (pestaña en segundo plano, freeze o pausas largas)
    if (deltaMs > 50) {
      deltaMs = 50; // Cap a un máximo de ~2 cuadros acumulados
    }

    // Calcular cuántos ciclos de CPU de C64 corresponden a este intervalo de tiempo
    // Frecuencia PAL = 985,248 ciclos por segundo = 985.248 ciclos por milisegundo
    const cyclesToAdd = (deltaMs / 1000) * PAL_CONSTANTS.CPU_CLOCK_HZ;
    this.cycleDebt += cyclesToAdd;

    let cyclesExecutedThisTick = 0;

    // Ejecutar en paquetes de ciclos hasta saldar la deuda
    const cyclesToExecute = Math.floor(this.cycleDebt);
    if (cyclesToExecute > 0) {
      this.onStep(cyclesToExecute);
      this.cycleDebt -= cyclesToExecute;
      cyclesExecutedThisTick = cyclesToExecute;
      this.totalCyclesInSecond += cyclesExecutedThisTick;
    }

    // Notificar cuadro listo para renderizar
    this.onFrameReady?.();
    this.frameCount++;

    // Cálculo de métricas cada segundo
    if (now - this.lastMetricTime >= 1000) {
      const elapsedSec = (now - this.lastMetricTime) / 1000;
      this.currentFps = Math.round(this.frameCount / elapsedSec);
      this.currentSpeedPct = Math.round((this.totalCyclesInSecond / (PAL_CONSTANTS.CPU_CLOCK_HZ * elapsedSec)) * 100);

      this.onMetricsUpdate?.({
        fps: this.currentFps,
        cyclesThisFrame: cyclesExecutedThisTick,
        emulationSpeedPct: this.currentSpeedPct
      });

      this.frameCount = 0;
      this.totalCyclesInSecond = 0;
      this.lastMetricTime = now;
    }
  }
}
