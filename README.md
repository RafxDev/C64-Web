<div align="center">

```
    ____                                   _                  __   _  _   
   / ___|___  _ __ ___  _ __ ___   ___   __| | ___  _ __ ___ / /_ | || |  
  | |   / _ \| '_ ` _ \| '_ ` _ \ / _ \ / _` |/ _ \| '__/ _ \ '_ \| || |_ 
  | |__| (_) | | | | | | | | | | | (_) | (_| | (_) | | |  __/ (_) |__   _|
   \____\___/|_| |_| |_|_| |_| |_|\___/ \__,_|\___/|_|  \___|\___/   |_|  
```

```
+-------------------------------------------------------------+
|    **** COMMODORE 64 WEB HARDWARE-LEVEL EMULATOR ****       |
|                                                             |
|       64K RAM SYSTEM   38911 BASIC BYTES FREE               |
|                                                             |
| READY.                                                      |
| LOAD "C64_WEB",8,1                                          |
| SEARCHING FOR C64_WEB                                       |
| LOADING                                                     |
| READY.                                                      |
| RUN                                                         |
+-------------------------------------------------------------+
```

[![TypeScript](https://img.shields.io/badge/CPU%20Core-TypeScript%205.5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%205.4-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Canvas](https://img.shields.io/badge/VIC--II-Canvas%202D%20Pixelated-E34F26?style=flat-square&logo=html5&logoColor=white)](#)
[![PAL System](https://img.shields.io/badge/Timing-PAL%2050.12%20Hz%20(19656%20Cycles)-green?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

*Emulación fiel y ciclo-aproximada del Commodore 64 para navegadores web modernos.*

</div>

---

## 💾 [10] REM : ACERCA DEL PROYECTO

**Commodore 64 Web** no es un simulador de alto nivel ni un intérprete superficial de sintaxis BASIC en JavaScript. Es una **reimplementación de ingeniería inversa a nivel de hardware** que recrea cada circuito integrado de la máquina original:

- **CPU MOS 6510** ejecutando código binario máquina real (con registros de puerto E/S integrados).
- **Lógica PLA (Programmable Logic Array)** gestionando conmutación de bancos de memoria dinámica en tiempo real.
- **VIC-II (MOS 6569 PAL)** renderizando línea a línea a resolución nativa con bordes completos.
- **CIAs duales (MOS 6526)** atendiendo la matriz de teclado PETSCII, puertos de joystick e interrupciones IRQ/NMI.
- **SID (MOS 6581/8580)** sintetizando audio analógico multicanal mediante Web Audio API y AudioWorklet.

El sistema arranca de forma autónoma cargando las **ROMs oficiales o de código abierto (OpenROMs / VICE)**, permitiendo ejecutar el KERNAL, el entorno BASIC V2 original y títulos comerciales de la época.

---

## 📟 [20] REM : ARQUITECTURA DEL CIRCUITO ORIGINAL

```
                        +---------------------------+
                        |       MOS 6510 CPU        |
                        | (Núcleo 6502 + E/S $0001) |
                        +-------------+-------------+
                                      |
                      +---------------+---------------+
                      |   PLA (Memory & Banking MMU)  |
                      +---------------+---------------+
                                      |
       +-----------------+------------+------------+-----------------+
       |                 |                         |                 |
+------+------+   +------+------+           +------+------+   +------+------+
|  VIC-II     |   |    SID      |           |    CIA 1    |   |    CIA 2    |
| (MOS 6569)  |   | (MOS 6581)  |           | (MOS 6526)  |   | (MOS 6526)  |
| Video PAL   |   | Audio Sint. |           | Teclado/Joy |   | Bancos/IEC  |
+-------------+   +-------------+           +-------------+   +-------------+
```

---

## ⚙️ [30] REM : ESPECIFICACIONES TÉCNICAS

### 1. Procesador MOS 6510
- Arquitectura CISC de 8 bits a **0.985248 MHz** (reloj estándar PAL).
- Registros internos: `A` (Acumulador), `X`, `Y`, `SP` (Stack Pointer), `PC` (Program Counter) y `P` (Status Register con banderas `NV-BDIZC`).
- Puerto de E/S en chip mapeado en `$0000` (Data Direction Register) y `$0001` (Port Data Register), controlando las líneas `LORAM`, `HIRAM` y `CHAREN`.

### 2. Mapa de Memoria y Conmutación PLA
- **64 KB de memoria RAM física.**
- **Superposición de ROMs:**
  - `BASIC V2` (8 KB): mapeada en `$A000 - $BFFF`.
  - `KERNAL` (8 KB): mapeada en `$E000 - $FFFF`.
  - `Character ROM` (4 KB): mapeada en `$D000 - $DFFF`.
  - `Color RAM` (1 KB x 4 bits): mapeada en `$D800 - $DBFF`.
- **Regla de oro del C64:** Las lecturas se decodifican mediante la tabla de la PLA, pero las escrituras a regiones con ROM superpuesta **siempre escriben en la RAM física subyacente**, permitiendo rutinas de copia y carga bajo la ROM.

### 3. Video: VIC-II (MOS 6569 - PAL)
- **Temporización PAL exacta:** 312 líneas de barrido raster por cuadro × 63 ciclos de reloj por línea = **19,656 ciclos por cuadro**.
- **Frecuencia vertical real:**
  $$\text{Frecuencia} = \frac{985,248\text{ Hz}}{19,656\text{ ciclos}} \approx 50.1245\text{ Hz}$$
- **Geometría de pantalla:** Área activa de 320×200 píxeles, resolución total con bordes de **384×272 píxeles**.
- **Paleta Pepto calibrada:** 16 colores oficiales calculados en enteros `Uint32` empaquetados (`0xAABBGGRR`) para volcado instantáneo a `ImageData`.
- **Escalado:** Entero pixel-perfect sin suavizado borroso (`image-rendering: pixelated;`).

### 4. Periféricos y E/S: CIA 6526 (x2)
- **CIA 1 (`$DC00 - $DCFF`):** Matriz de teclado 8×8 PETSCII, puertos de control de joystick (1 y 2), timers A y B, e interrupciones IRQ.
- **CIA 2 (`$DD00 - $DDFF`):** Selección de bancos de 16 KB para el VIC-II (líneas `/VA14` y `/VA15`), bus serie IEC y generación de NMI.

### 5. Sonido: SID (MOS 6581 / 8580)
- 3 voces polifónicas independientes (Triangular, Diente de sierra, Pulso con PWM y Ruido blanco).
- Generadores analógicos de envolvente ADSR por voz.
- Filtro analógico multimodo (Paso bajo, Paso banda, Paso alto, Notch).

---

## 🗂️ [40] REM : ORGANIZACIÓN MODULAR DEL HARDWARE

```
c64-web/
├── src/
│   ├── cpu/           # Emulación de la CPU 6510, registros y ciclo de ejecución
│   ├── memory/        # RAM de 64 KB, lógica de conmutación de bancos PLA y bus de direcciones
│   ├── io/            # Enrutador del espacio de periféricos $D000 - $DFFF
│   ├── vic/           # Chip de video VIC-II, paleta Pepto, barrido raster y búfer
│   ├── cia/           # Chips CIA 1 y CIA 2 (teclado, timers, joysticks, banco VIC)
│   ├── sid/           # Chip de sonido SID y síntesis de audio
│   ├── ui/            # Lienzo Canvas pixel-perfect y controles de pantalla
│   ├── system/        # Temporizador PAL (50 Hz), reloj de ciclos y orquestador C64
│   ├── style.css      # Estilos retro con marcos y paleta clásica
│   └── main.ts        # Punto de entrada de la aplicación
├── index.html         # Interfaz web principal
├── DIARIO.md          # Bitácora de desarrollo detallada paso a paso
├── LICENSE            # Licencia MIT
└── package.json       # Configuración y módulos del proyecto
```

---

## 📝 [50] REM : REGISTRO DE DESARROLLO

Cada fase técnica, pruebas de laboratorio y cálculos de hardware se encuentran documentados exhaustivamente en el archivo [DIARIO.md](DIARIO.md).

---

## 👤 [60] REM : AUTORÍA

**J. Rafael Morantes (RafxDev)**  
📧 [jrafaelmorantess@gmail.com](mailto:jrafaelmorantess@gmail.com)

---

## 📜 [70] REM : LICENCIA

Distribuido bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.

```
READY.
█
```
