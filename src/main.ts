import { C64System } from './system/c64';
import { C64Screen } from './ui/screen';

window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('c64-screen') as HTMLCanvasElement;
  if (!canvas) {
    console.error('No se encontró el elemento canvas #c64-screen');
    return;
  }

  // Inicializar subsistema visual y sistema C64
  const screen = new C64Screen(canvas);
  const c64 = new C64System();
  c64.attachScreen(screen);

  // Elementos de la interfaz
  const btnPower = document.getElementById('btn-power') as HTMLButtonElement;
  const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
  const valFps = document.getElementById('val-fps') as HTMLElement;
  const valCycles = document.getElementById('val-cycles') as HTMLElement;
  const valBankingBits = document.getElementById('val-banking-bits') as HTMLElement;

  // Actualización de métricas en tiempo real
  c64.clock.onMetricsUpdate = (metrics) => {
    if (valFps) valFps.textContent = metrics.fps.toString();
    if (valCycles) valCycles.textContent = metrics.cyclesThisFrame.toString();

    const { port } = c64.memory.getPortState();
    if (valBankingBits) {
      valBankingBits.textContent = `%${port.toString(2).padStart(8, '0')}`;
    }
  };

  btnPower?.addEventListener('click', () => {
    c64.reset();
  });

  btnPause?.addEventListener('click', () => {
    const isRunning = c64.pause();
    btnPause.textContent = isRunning ? 'Pausar' : 'Reanudar';
  });

  // Enlazar eventos de teclado físico del navegador
  window.addEventListener('keydown', (e) => {
    c64.keyboard.onKeyDown(e);
  });

  window.addEventListener('keyup', (e) => {
    c64.keyboard.onKeyUp(e);
  });

  // Cargar las ROMs oficiales del C64 e iniciar el reloj a 50 Hz
  await c64.loadDefaultRoms();
  c64.start();

  console.log('⚡ Commodore 64 Web - Sistema iniciado con éxito');
  console.log('ROMs KERNAL, BASIC y CHARGEN en memoria. Booteo completado.');
});
