import { PAL_CONSTANTS } from '../vic/constants';

/**
 * Gestor del lienzo Canvas para renderizado pixel-perfect a resolución nativa PAL (384x272).
 */
export class C64Screen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private buf32: Uint32Array;

  constructor(canvasElement: HTMLCanvasElement) {
    this.canvas = canvasElement;
    this.canvas.width = PAL_CONSTANTS.SCREEN_WIDTH;
    this.canvas.height = PAL_CONSTANTS.SCREEN_HEIGHT;

    const context = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true
    });

    if (!context) {
      throw new Error('No se pudo obtener el contexto 2D del Canvas');
    }

    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;

    // Crear ImageData y vista de enteros de 32 bits para máxima velocidad de volcado
    this.imageData = this.ctx.createImageData(PAL_CONSTANTS.SCREEN_WIDTH, PAL_CONSTANTS.SCREEN_HEIGHT);
    this.buf32 = new Uint32Array(this.imageData.data.buffer);
  }

  /**
   * Vuelca directamente el búfer de píxeles RGBA32 del VIC-II al canvas.
   */
  public renderFrame(frameBuffer: Uint32Array): void {
    this.buf32.set(frameBuffer);
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
