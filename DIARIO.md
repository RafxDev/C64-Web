# DIARIO DE DESARROLLO - EMULADOR COMMODORE 64 WEB

Este diario documenta cada decisión técnica, arquitectura, cálculos matemáticos de temporización y avances en el desarrollo del emulador Commodore 64 para la web.

---

## 📅 Módulo 1: Cimientos del Sistema (Duración de desarrollo: 17 días)

### 1. Resumen Ejecutivo
Se ha establecido con éxito la base arquitectónica y de infraestructura para el emulador C64 web. El sistema compila limpiamente con TypeScript estricto, cuenta con empaquetado optimizado con Vite, renderizado pixelado en Canvas 2D a resolución nativa PAL (384×272), sincronización temporal precisa de 50.12 Hz (19,656 ciclos por cuadro) y el bus de memoria con la lógica completa del Programmable Logic Array (PLA) y los registros de puerto de la CPU 6510 ($0000/$0001).

---

### 2. Estructura Modular Implementada
El código se ha organizado de forma desacoplada reflejando fielmente la arquitectura de hardware del Commodore 64:

```
src/
├── cpu/             # Definiciones de registros, banderas e interfaz de la CPU MOS 6510
│   ├── types.ts
│   └── cpu6510.ts   # Núcleo completo del 6502/6510 con 151 instrucciones
├── memory/          # 64 KB RAM física, buffers ROM, MMU y lógica PLA
│   ├── types.ts
│   └── memory_bus.ts
├── io/              # Enrutamiento de periféricos mapeados en $D000 - $DFFF y teclado
│   ├── io_bus.ts
│   └── keyboard.ts  # Gestor de matriz de teclado 8x8 PETSCII y eventos web
├── vic/             # Chip de video VIC-II (MOS 6569 PAL)
│   ├── constants.ts # Constantes de temporización PAL (63 ciclos/línea, 312 líneas)
│   ├── palette.ts   # Paleta Pepto oficial de 16 colores (RGBA y Uint32 precalculados)
│   ├── types.ts
│   └── vic2.ts      # Registros $D000-$D02E, barrido de haz raster y búfer de 384x272
├── cia/             # Chips de interfaz compleja CIA 6526 (x2)
│   ├── types.ts
│   ├── cia1.ts      # CIA 1 ($DC00): Teclado, joysticks, timers, IRQ
│   └── cia2.ts      # CIA 2 ($DD00): Selección de banco VIC-II (VA14/VA15), IEC, NMI
├── sid/             # Chip de sonido SID (MOS 6581 / 8580 - $D400-$D7FF)
│   ├── types.ts
│   └── sid.ts
├── ui/              # Renderizado en Canvas 2D de ultra-alta velocidad
│   └── screen.ts
├── system/          # Integración de hardware y bucle de temporización
│   ├── clock.ts     # Temporizador con acumulador delta y protección de deriva
│   └── c64.ts       # Orquestador del sistema
├── style.css        # Estilos visuales de la interfaz de usuario
└── main.ts          # Inicialización y enlace con el DOM
```

---

### 3. Fórmulas Matemáticas y Temporización PAL (50 Hz)
El Commodore 64 en su especificación europea (PAL-B) se sincroniza con las siguientes constantes exactas:
- **Frecuencia del reloj maestro de la CPU:**
  $$f_{\text{cpu}} = 985,248\text{ Hz} \quad (0.985248\text{ MHz})$$
- **Líneas de barrido raster por cuadro:**
  $$L = 312\text{ líneas}$$
- **Ciclos de reloj por línea raster:**
  $$C_{\text{line}} = 63\text{ ciclos/línea}$$
- **Ciclos totales por cuadro (frame):**
  $$C_{\text{frame}} = L \times C_{\text{line}} = 312 \times 63 = 19,656\text{ ciclos}$$
- **Frecuencia vertical real:**
  $$f_v = \frac{985,248}{19,656} \approx 50.1245\text{ Hz}$$

#### Algoritmo del Motor de Reloj (`C64Clock`):
1. Mide el tiempo transcurrido en milisegundos con `performance.now()`.
2. Aplica un límite de seguridad ($\Delta t_{\text{max}} = 50\text{ ms}$) para evitar la sobrecarga ("espiral de la muerte") en caso de que la pestaña del navegador pierda el foco.
3. Acumula la deuda de ciclos:
   $$\text{Ciclos acumulados} += \frac{\Delta t}{1000} \times 985,248$$
4. Ejecuta los ciclos enteros acumulados en los subsistemas emulados y descuenta la deuda.
5. Emite métricas en tiempo real (FPS reales, ciclos por frame y porcentaje de velocidad emulada).

---

### 4. Arquitectura de Memoria y Banking de la CPU MOS 6510
El chip 6510 integra un puerto de E/S de 6 bits mapeado en las direcciones `$0000` y `$0001`:
- `$0000` (**DDR** - Data Direction Register): Determina la dirección de pines (1 = Salida, 0 = Entrada). Valor por defecto al encender: `$2F` (`%00101111`).
- `$0001` (**PR** - Port Register): Controla las líneas de conmutación de la PLA. Valor por defecto al encender: `$37` (`%00110111`).
  - Bit 0 (`LORAM`): Habilita BASIC ROM en `$A000-$BFFF`.
  - Bit 1 (`HIRAM`): Habilita KERNAL ROM en `$E000-$FFFF`.
  - Bit 2 (`CHAREN`): Habilita registros de E/S en `$D000-$DFFF` (o Character ROM si está en 0).

#### Tabla de Conmutación de la PLA Implementada:
| LORAM | HIRAM | CHAREN | $A000-$BFFF (Lectura) | $D000-$DFFF (Lectura) | $E000-$FFFF (Lectura) | $D000-$DFFF (Escritura) |
|:-----:|:-----:|:------:|:---------------------:|:---------------------:|:---------------------:|:-----------------------:|
| 0     | 0     | x      | RAM                   | RAM                   | RAM                   | RAM                     |
| 1     | 0     | 0      | RAM                   | CHAR ROM              | RAM                   | RAM                     |
| 1     | 0     | 1      | RAM                   | I/O                   | RAM                   | I/O                     |
| 0     | 1     | 0      | RAM                   | CHAR ROM              | KERNAL                | RAM                     |
| 0     | 1     | 1      | RAM                   | I/O                   | KERNAL                | I/O                     |
| 1     | 1     | 0      | BASIC ROM             | CHAR ROM              | KERNAL                | RAM                     |
| **1** | **1** | **1**  | **BASIC ROM**         | **I/O**               | **KERNAL**            | **I/O** *(Arranque)*   |

#### Regla Crítica de Hardware: Transparencia de Escritura en RAM
En el C64 real, **las escrituras a `$A000-$BFFF` y `$E000-$FFFF` SIEMPRE escriben en la memoria RAM física oculta bajo la ROM**, sin alterar las ROMs. En `$D000-$DFFF`, si el espacio de E/S está activo, escribe en los periféricos; de lo contrario, escribe en la RAM física. Esta lógica ha sido codificada de manera estricta en [`MemoryBus.write()`](src/memory/memory_bus.ts).

---

## 📅 Módulo 2: CPU MOS 6510 (Duración de desarrollo: 4 días)

### 1. Resumen Ejecutivo
Implementación completa del microprocesador **MOS 6510** (núcleo NMOS 6502). Se han implementado los 151 opcodes oficiales, todos los modos de direccionamiento de la arquitectura 6502, penalizaciones exactas de ciclos de reloj por cruce de límites de página y saltos condicionales, aritmética decimal BCD precisa para `ADC` y `SBC`, y el histórico error de hardware en la instrucción `JMP ($xxFF)`.

El microprocesador fue sometido y validado de punta a punta con la suite de pruebas oficial de **Klaus Dormann (6502 functional test)**, superando exitosamente los **30.6 millones de instrucciones** y **96.2 millones de ciclos** hasta alcanzar el bucle de éxito `$3469` en 0.73 segundos.

---

### 2. Registros y Banderas de Estado (`P`)
- `A` (8 bits): Acumulador aritmético-lógico.
- `X`, `Y` (8 bits): Registros de índice.
- `SP` (8 bits): Puntero de pila (direcciona la página 1: `$0100 + SP`), decrementa al apilar y crece al desapilar.
- `PC` (16 bits): Contador de programa.
- `P` (8 bits): Registro de banderas (`NV-BDIZC`).

---

### 3. Validación con la Suite de Pruebas de Klaus Dormann
- **Archivo de prueba:** `tests/6502_functional_test.bin` (64 KB).
- **Entorno de prueba:** Ejecutor en TypeScript [tests/run_klaus.ts](tests/run_klaus.ts).
- **Vector de entrada:** `PC = $0400`.
- **Condición de éxito:** Bucle infinito en `$3469` (`jmp $3469`).
- **Resultado:** Superado en 0.71s (30,646,177 instrucciones, 96,241,381 ciclos).

---

## 📅 Módulo 3: Arranque a Pantalla de Texto y VIC-II Básico (Duración de desarrollo: 6 días)

### 1. Resumen Ejecutivo
Se alcanzó el **primer gran hito de emulación completa**: el sistema arranca de manera 100% autónoma ejecutando las ROMs oficiales originales de Commodore, recorriendo todas las rutinas de inicialización de bajo nivel del KERNAL y BASIC V2, y dibujando en el lienzo Canvas de 384×272 la legendaria pantalla azul con el mensaje:

```text
    **** COMMODORE 64 BASIC V2 ****
 64K RAM SYSTEM  38911 BASIC BYTES FREE
READY.
```

---

### 2. Gestión e Integración de ROMs
Se descargaron e integraron las tres ROMs originales del sistema en `public/roms/`, verificando sus sumas de comprobación MD5:
- **`basic.bin`** (8,192 bytes, MD5: `57AF4AE21D4B705C2991D98ED5C1F7B8`): Mapeada en `$A000 - $BFFF`.
- **`kernal.bin`** (8,192 bytes, MD5: `39065497630802346BCE17963F13C092`): Mapeada en `$E000 - $FFFF` (KERNAL Rev 3).
- **`chargen.bin`** (4,096 bytes, MD5: `12A4202F5331D45AF846AF6C58FBA946`): Mapeada en `$D000 - $DFFF` para la CPU y visible para el VIC-II en `$1000-$1FFF` de los bancos 0 y 2.

Se dotó a `C64System` de la función asíncrona `loadDefaultRoms()` para descargar e inyectar los binarios automáticamente en el bus de memoria al cargar la aplicación web.

---

### 3. Emulación de Modo Texto Estándar en el VIC-II (MOS 6569)
Se implementó en [`src/vic/vic2.ts`](src/vic/vic2.ts) el modo de caracteres estándar (40 columnas × 25 filas):
- **Decodificación de Punteros `$D018`:**
  - Base de la matriz de pantalla (Screen RAM): `(regs[0x18] >> 4) * 0x0400` (por defecto `$0400` en banco 0).
  - Base del generador de caracteres (Character Generator): `((regs[0x18] >> 1) & 0x07) * 0x0800` (por defecto `$1000` en banco 0, mapeado a Character ROM).
- **Renderizado por Línea de Barrido (Scanline):**
  - **Bordes:** Líneas verticales 0..35 y 236..271, más bordes laterales izquierdo (32 px) y derecho (32 px) renderizados con el color de borde `$D020` (Azul Claro #14).
  - **Área activa (320 × 200 píxeles):** Para cada scanline dentro del área visible:
    1. Se calcula la fila de caracteres: `charRow = Math.floor(y / 8)`.
    2. Se calcula la línea dentro del glifo de 8×8 píxeles: `charY = y % 8`.
    3. Para cada una de las 40 columnas:
       - Se lee el código de pantalla PETSCII desde `Screen RAM [charRow * 40 + col]`.
       - Se lee el color de primer plano desde la `Color RAM` física en `$D800` (`ioBus.colorRam[charRow * 40 + col] & 0x0F`).
       - Se obtiene el byte del glifo desde la Character ROM: `glyphByte = readVic(charBase + code * 8 + charY)`.
       - Cada bit en 1 se dibuja con el color de primer plano; cada bit en 0 se dibuja con el color de fondo `$D021` (Azul Oscuro #6).
  - **Control de Registros:**
    - `$D011` Bit 5 (`DEN` - Display Enable): Si está desactivado, el área activa se oculta con el color del borde.
    - `$D011` Bit 6 (`RSEL` - Row Select): Modo de 24 o 25 filas (oculta 4 líneas superiores e inferiores si RSEL=0).
    - `$D016` Bit 3 (`CSEL` - Column Select): Modo de 38 o 40 columnas.

---

### 4. Temporizadores CIA 1 e Interrupciones IRQ
Para permitir que las rutinas KERNAL completen el ciclo de inicialización y escaneo de teclado/cursor:
- Se implementaron los contadores y latches de 16 bits para Timer A y Timer B en [`src/cia/cia1.ts`](src/cia/cia1.ts).
- Se implementó el registro de control de interrupción (`ICR` / `IMR` en `$DC0D`), donde la lectura de `$DC0D` devuelve los eventos ocurridos y **borra automáticamente** la línea de interrupción `irqPending`.
- Se corrigió el despacho de interrupción en la CPU 6510 para limpiar la señal de solicitud y evitar reentradas infinitas al retornar con `RTI`.

---

### 5. Verificación de Arranque y Visualización en Terminal
Se creó el script de prueba automatizado [tests/verify_screen_render.ts](tests/verify_screen_render.ts) ejecutable con `npm run test:boot`:

```text
> c64-web@0.1.0 test:boot
> tsx tests/verify_screen_render.ts

🚀 Arrancando emulación del C64...
✅ Booteo finalizado. Extrayendo búfer de pantalla del VIC-II...

================ VISUALIZACIÓN DE PANTALLA VIC-II ================
Fila 00: |                                        |
Fila 01: |    **** COMMODORE 64 BASIC V2 ****     |
Fila 02: |                                        |
Fila 03: | 64K RAM SYSTEM  38911 BASIC BYTES FREE |
Fila 04: |                                        |
Fila 05: |READY.                                  |
Fila 06: |                                        |
...
==================================================================

Color del borde: 14 (Azul Claro)
Color del fondo: 6 (Azul Oscuro)
FrameBuffer total de píxeles: 104448 píxeles (384x272)
```

---

## 📅 Módulo 4: Teclado y E/S (CIA 1) y BASIC V2 Interactivo (Duración de desarrollo: 19 días)

### 1. Resumen Ejecutivo
Se alcanzó el **segundo gran hito fundamental del proyecto**: la interactividad completa entre el usuario y el intérprete de BASIC V2 de la máquina original. Ahora es posible escribir programas en BASIC, pulsar `RUN` y obtener la ejecución inmediata por parte del KERNAL.

---

### 2. Matriz de Teclado 8×8 Oficial (CIA 1 $DC00 / $DC01)
El teclado físico del Commodore 64 se organiza en una matriz de 64 posiciones conectada a los puertos de la CIA 1:
- **Port A (`$DC00`):** Conduce las 8 líneas de columna (bits 0 a 7 en bajo activo).
- **Port B (`$DC01`):** Lee las 8 líneas de fila (bits 0 a 7 en bajo activo; 0 = tecla pulsada).

La indexación se verificó byte por byte contra la tabla oficial de decodificación del KERNAL en `$EB81` (`index = col * 8 + row`):
- **Columna 0:** DEL, RETURN, CRSR_RT, F7, F1, F3, F5, CRSR_DN
- **Columna 1:** 3, W, A, 4, Z, S, E, Left Shift
- **Columna 2:** 5, R, D, 6, C, F, T, X
- **Columna 3:** 7, Y, G, 8, B, H, U, V
- **Columna 4:** 9, I, J, 0, M, K, O, N
- **Columna 5:** +, P, L, -, ., :, @, ,
- **Columna 6:** £, *, ;, HOME, Right Shift, =, ↑, /
- **Columna 7:** 1, ←, CTRL, 2, SPACE, COMMODORE (C=), Q, RUN/STOP

En [`src/cia/cia1.ts`](src/cia/cia1.ts) se implementó soporte de escaneo bidireccional, garantizando que el escaneo funcione tanto si el software escribe en Port A y lee Port B, como si escribe en Port B y lee Port A.

---

### 3. Gestor de Teclado para Navegadores Modernos (`KeyboardManager`)
En [`src/io/keyboard.ts`](src/io/keyboard.ts) se implementó el traductor de eventos de teclado de PC/Web al circuito del C64:
- **Mapeo Posicional de Controles:**
  - `Enter` $\rightarrow$ `RETURN`
  - `Backspace` $\rightarrow$ `DEL`
  - `Space` $\rightarrow$ `SPACE`
  - `Escape` $\rightarrow$ `RUN/STOP`
  - `ControlLeft` / `Tab` $\rightarrow$ Tecla `COMMODORE (C=)`
  - `ControlRight` $\rightarrow$ `CTRL`
  - `ShiftLeft` / `ShiftRight` $\rightarrow$ `Left Shift` / `Right Shift`
  - `CapsLock` $\rightarrow$ `SHIFT LOCK` (mantiene activo el Shift lógico)
  - `PageUp` / `F12` $\rightarrow$ `RESTORE` (provoca una interrupción `NMI` directa en la CPU)
  - Teclas de cursor (`Flechas`) $\rightarrow$ Mapeadas a `CRSR_DN` y `CRSR_RT` con Shift invertido cuando corresponde.
- **Mapeo Simbólico Inteligente:**
  - Caracteres como comillas `"`, signos de puntuación `:`, `;`, `=`, operaciones matemáticas `+`, `-`, `*`, `/` activan automáticamente las combinaciones correctas de Shift de C64 (por ejemplo, comillas `"` activa `Shift + 2` en la matriz de Commodore).

---

### 4. Bucle KERNAL e Interrupción de 50 Hz
El KERNAL utiliza el Timer A de la CIA 1 para generar interrupciones a ~50 Hz. En cada ciclo de interrupción:
1. Se atiende el parpadeo del cursor.
2. Se ejecuta la subrutina `SCNKEY` (`$FF9F` / `$E5B4`), que sondea `$DC00` y `$DC01` y almacena los caracteres PETSCII en el búfer de teclado (`$0277`).
3. El bucle de entrada de BASIC (`$E5CD`) extrae los caracteres con `GETIN` (`$FFE4`) y los muestra en pantalla con `CHROUT` (`$FFD2`).

---

### 5. Verificación de Ejecución de Programa BASIC (Segundo Hito)
Se implementó la prueba automatizada [tests/test_keyboard_basic.ts](tests/test_keyboard_basic.ts) ejecutable con `npm run test:keyboard`:

```text
> c64-web@0.1.0 test:keyboard
> tsx tests/test_keyboard_basic.ts

🚀 1. Booteando C64 hasta llegar a READY...
⌨️  2. Escribiendo programa: 10 PRINT "HOLA"...
▶️  3. Escribiendo comando: RUN...
⏳ 4. Ejecutando programa BASIC...

================ PANTALLA C64 TRAS EJECUTAR BASIC ================
Fila 01: [    **** COMMODORE 64 BASIC V2 ****     ]
Fila 03: [ 64K RAM SYSTEM  38911 BASIC BYTES FREE ]
Fila 05: [READY.                                  ]
Fila 06: [10 PRINT "HOLA"                         ]
Fila 07: [RUN                                     ]
Fila 08: [HOLA                                    ]
Fila 10: [READY.                                  ]
==================================================================

🎉 ¡SEGUNDO HITO SUPERADO CON ÉXITO!
   El programa BASIC V2 fue tecleado, interpretado y ejecutado.
   "HOLA" y "READY." se encuentran correctamente en pantalla.
```

El entorno web (`npm run dev`) ahora permite hacer clic en el canvas y escribir en tiempo real cualquier programa en BASIC V2 con respuesta inmediata del cursor y el sistema.
