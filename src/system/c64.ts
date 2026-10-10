import { MemoryBus } from '../memory/memory_bus';
import { Cpu6510 } from '../cpu/cpu6510';
import { Vic2 } from '../vic/vic2';
import { SID } from '../sid/sid';
import { CIA1 } from '../cia/cia1';
import { CIA2 } from '../cia/cia2';
import { KeyboardManager } from '../io/keyboard';
import { C64Clock } from './clock';
import { C64Screen } from '../ui/screen';

/**
 * Orquestador principal de hardware del Commodore 64.
 * Conecta el bus de memoria, CPU 6510, VIC-II, SID, CIAs y el subsistema de reloj.
 */
export class C64System {
  public readonly memory: MemoryBus;
  public readonly cpu: Cpu6510;
  public readonly vic: Vic2;
  public readonly sid: SID;
  public readonly cia1: CIA1;
  public readonly cia2: CIA2;
  public readonly keyboard: KeyboardManager;
  public readonly clock: C64Clock;
  public screen: C64Screen | null = null;

  constructor() {
    this.memory = new MemoryBus();
    this.cpu = new Cpu6510(this.memory);
    this.vic = new Vic2();
    this.sid = new SID();
    this.cia1 = new CIA1();
    this.cia2 = new CIA2();
    this.keyboard = new KeyboardManager(this.cia1, this.cpu);

    // Conectar periféricos al bus de E/S
    this.memory.ioBus.vic = this.vic;
    this.memory.ioBus.sid = this.sid;
    this.memory.ioBus.cia1 = this.cia1;
    this.memory.ioBus.cia2 = this.cia2;

    // Conectar memoria y RAM de color al VIC-II
    this.vic.memory = this.memory;
    this.vic.colorRam = this.memory.ioBus.colorRam;

    // Conectar las líneas de control de banco de video de CIA 2 a la memoria
    this.cia2.onVicBankChange = (bank: number) => {
      this.memory.vicBank = bank;
    };

    // Inicializar el reloj de emulación
    this.clock = new C64Clock((cycles: number) => {
      this.step(cycles);
    });

    this.clock.onFrameReady = () => {
      this.render();
    };

    this.reset();
  }

  public attachScreen(screen: C64Screen): void {
    this.screen = screen;
    this.render();
  }

  public reset(): void {
    this.memory.reset();
    this.cpu.reset();
    this.vic.reset();
    this.sid.reset();
    this.cia1.reset();
    this.cia2.reset();
  }

  /**
   * Ejecuta un lote de ciclos en todos los componentes del sistema.
   */
  public step(cycles: number): void {
    if (this.memory.hasKernalRom) {
      let executed = 0;
      while (executed < cycles) {
        if (this.cia1.irqPending) {
          this.cpu.irq();
        }
        if (this.cia2.irqPending) {
          this.cpu.nmi();
        }

        const cpuCycles = this.cpu.step();
        this.vic.step(cpuCycles);
        this.cia1.step(cpuCycles);
        this.cia2.step(cpuCycles);
        this.sid.step(cpuCycles);
        executed += cpuCycles;
      }
    } else {
      // Periféricos avanzan directamente hasta que se cargue la ROM KERNAL
      this.vic.step(cycles);
      this.cia1.step(cycles);
      this.cia2.step(cycles);
      this.sid.step(cycles);
    }
  }

  /**
   * Dibuja el cuadro generado en el Canvas.
   */
  public render(): void {
    if (this.screen) {
      this.screen.renderFrame(this.vic.getFrameBuffer());
    }
  }

  public start(): void {
    this.clock.start();
  }

  public pause(): boolean {
    return this.clock.toggle();
  }

  /**
   * Carga las ROMs de Commodore (BASIC, KERNAL, CHARGEN) desde la carpeta pública y reinicia.
   */
  public async loadDefaultRoms(): Promise<boolean> {
    try {
      const [basicRes, kernalRes, chargenRes] = await Promise.all([
        fetch('/roms/basic.bin'),
        fetch('/roms/kernal.bin'),
        fetch('/roms/chargen.bin'),
      ]);

      if (!basicRes.ok || !kernalRes.ok || !chargenRes.ok) {
        throw new Error('No se pudieron descargar las ROMs del servidor');
      }

      const [basicBuf, kernalBuf, chargenBuf] = await Promise.all([
        basicRes.arrayBuffer(),
        kernalRes.arrayBuffer(),
        chargenRes.arrayBuffer(),
      ]);

      this.memory.loadRom('basic', new Uint8Array(basicBuf));
      this.memory.loadRom('kernal', new Uint8Array(kernalBuf));
      this.memory.loadRom('chargen', new Uint8Array(chargenBuf));

      this.reset();
      console.log('✅ ROMs de Commodore 64 cargadas con éxito. Sistema booteado.');
      return true;
    } catch (e) {
      console.error('Error al cargar las ROMs:', e);
      return false;
    }
  }
}
