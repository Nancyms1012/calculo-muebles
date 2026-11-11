# CONTEXTO — Por qué existe esta app y qué se decidió

Este documento explica el **por qué** (usuaria, problema, decisiones, reglas del dominio). Para el **cómo** técnico mirá [`HANDOFF.md`](HANDOFF.md); para el uso, [`README.md`](README.md).

---

## 1. Quién la usa y para qué

- **Usuaria:** Nancy (GitHub: `Nancyms1012`), Costa Rica. Arma muebles de **melamina/madera** para su casa (por ejemplo un **clóset / perchero** para el cuarto de su hija, una cómoda, estantes).
- **Problema original (palabras de ella):** “necesito una app donde pueda hacer el diseño, colocar las medidas del mueble y colocar las medidas totales de tabla que venden para que la app me indique **cuántas tablas y de qué medidas debo cortar** (según diseño) y **cuántas tablas totales debo comprar**”.
- **Segundo problema (agregado después):** poder armar la **distribución de una habitación** (medidas del cuarto, muebles, puertas, divisiones) “con lógica similar” a la del diseñador de muebles.

### Preferencias y restricciones de la usuaria

- **Idioma:** toda la interfaz en **español con voseo** (“Tocá”, “Escribí”, “Agregá”).
- **Unidades:** **centímetros**. Moneda en colones (₡) para el precio opcional de las tablas.
- **No puede instalar software** en su computadora de trabajo: todo se publica con `git push` o por el panel web (Cloudflare Pages). Por eso la app es **estática**, sin build, sin dependencias.
- Usa **Cloudflare Pages** para sus apps (otras apps suyas: lista de compras, cierre de caja, control de etapas, etc.). Para esta, la configuración recomendada es preset **None**, sin build command, output `/`.
- Cuando algo cambia, tiene que **recargar con Ctrl+Shift+R** (el navegador le guarda la versión vieja).
- Le gusta ver los resultados **dibujados** y con colores distintos por tipo de pieza (los colores concretos los eligió ella, ver §4).
- Trabaja desde el **celular y la computadora**: el diseño tiene que funcionar con el dedo (arrastrar) y con mouse.

---

## 2. Decisiones de diseño importantes (y por qué)

| Decisión | Motivo |
|---|---|
| **App 100 % estática** (HTML/CSS/JS en 3 archivos) | No puede instalar nada; despliegue con `git push`; cero mantenimiento de servidores. |
| **Datos en `localStorage` + exportar/importar `.json`** | Sin backend. El `.json` sirve de respaldo y para pasar entre dispositivos. (Sincronizar en la nube con Cloudflare Workers KV es una idea futura, no se hizo.) |
| **El cálculo SIEMPRE puede girar piezas** | Las láminas son de **melamina**: no tienen veta, así que girar no afecta. (La casilla vieja “Permitir girar” quedó fija y bloqueada.) |
| **Las piezas se calculan solas desde el diseño** | Ella dijo: “tú debes calcular las piezas a cortar según el diseño”. Ya no se copian a mano a una lista; la lista de “piezas adicionales” es solo para lo que no está dibujado. |
| **Acomodo automático, sin editor manual** | Cuando preguntó cómo aprovechar un sobrante, eligió “preferiblemente reacomodo automático”. Por eso el optimizador prueba muchas estrategias y rellena huecos de **todas** las tablas abiertas. |
| **Varios muebles = pestañas** con casilla ✔ “incluir en el cálculo” | Para aprovechar sobrantes entre muebles y para comparar **opción 1 vs opción 2** de un mismo mueble (duplicar y cambiar la distribución interna). |
| **Techo y piso van ENTRE los costados** | Si se hacen del ancho total se superponen en las esquinas y no calzan al armar. |
| **“Revisar medidas” como si fuera con cinta métrica** | Ella armaba las medidas a mano y quería validar que calcen. Compara cada pieza con sus vecinas (ver `HANDOFF.md`). |
| **Una pestaña aparte para la habitación** | Pidió “una sección o tab totalmente aparte”. |
| **Habitación: paredes pared por pared (ángulos de 90°)** | Pidió “tamaño de cada pared” para cuartos que no son rectángulo perfecto. Se modela como contorno ortogonal recorrido en sentido horario. |
| **Puertas siempre sobre una pared** | Una puerta “real” pertenece a una pared (hueco + giro). Se arrastra deslizándose por las paredes. |
| **Elegir qué muebles de madera traer a la habitación** | No todos son del cuarto de su hija y hay copias (misma medida externa, distinta distribución interna). |

---

## 3. Reglas del dominio (para no equivocarse al tocar el código)

### Cortes
- Una pieza se define por **largo × ancho × espesor × cantidad**. El **espesor** debe coincidir con el de alguna tabla del stock; si no, el cálculo avisa.
- **Kerf** (grosor del corte de sierra): 0,3 cm por defecto. Cada pieza “consume” su medida + kerf; la última de una fila no paga corte (el rectángulo libre inicial se agranda en `kerf`).
- Si una pieza es **más ancha que la tabla** y “Unir tablas” está activo, se parte en **tiras** a encolar (la app lo avisa).
- **Retazos** reportados: sobrantes con ambos lados ≥ 5 cm.
- El tubo para ropa **no es madera**: sale aparte en “Otros materiales”.
- Un **tubo puede atravesar una división** (agujero en la división): es normal, no es un error; la app dice a qué altura hacer el agujero (Ø del tubo + 0,2 cm de holgura).

### Diseñador (vista de frente)
- Coordenadas en cm; **y crece hacia abajo** (y = 0 es el techo del mueble). La “altura desde el piso” del plano es `alto − y`.
- Cada pieza: `orient` `'H'` (horizontal) o `'V'` (vertical), `largo` (a lo largo de la pieza), `esp` (grosor), `prof` (fondo, pasa a ser el **ancho** de la pieza a cortar), `x`, `y`.
- Piezas “de borde” (se revisan pegadas al borde del mueble): **piso/inferior**, **techo/superior**, **costado/lateral** (por nombre).

### Habitación (vista desde arriba)
- Coordenadas en cm con el origen en la **esquina superior izquierda** de la caja que contiene al cuarto; `x` a la derecha, `y` hacia abajo.
- Cada mueble: `w` = ancho, `h` = fondo; el **frente** está hacia abajo cuando `rot = 0` (la raya negra gruesa).
- Contorno: lista de paredes `{len, giro}` recorridas **en sentido horario** desde arriba-izquierda hacia la derecha. `giro: 'D'` = esquina normal, `'I'` = esquina que entra (como en una “L”). Para cerrar, `#D − #I = 4`.
- “Inicio” de una pared = su extremo de salida en ese recorrido (la flecha del rótulo indica el sentido).

---

## 4. Colores elegidos por la usuaria (no cambiarlos sin preguntar)

| Pieza | Color |
|---|---|
| Techo / superior | `#6699FF` |
| Piso / inferior | `#a77be0` (morado) |
| Tablas verticales (costado, división, lateral) | `#FF0DFF` |
| Repisa | `#66FFFF` |
| Tubo para ropa | `#a9b2ba` (gris) |
| Otras piezas | paleta por nombre (`COLORES_OTROS`) |

El color se decide por el **nombre** de la pieza (expresiones regulares en `COLORES`). Si ella renombra una pieza y pierde el color, es por eso.

---

## 5. Casos reales que moldearon las reglas (útiles como pruebas)

- **Perchero con división:** una repisa de ancho completo que cruza una división no puede ser una sola pieza (hay que partirla en dos). Pero una **división que “entra” 2 cm en el piso** debe **acortarse** para quedar **montada sobre el piso** (no cortar el piso).
- **Perchero con tubo de 90 cm** que atraviesa la división central: correcto, solo hay que hacerle agujero.
- **Altura total 190, techo y piso de 1,6 cm:** la división correcta mide `190 − 1,6 − 1,6 = 186,8`. El error que vio ella venía de que el **piso había quedado en su posición vieja** (diseñado con 2,5 cm) y la división, corrida 0,9 cm. Ahora la revisión dice “tiene la medida correcta pero está mal ubicada” y al cambiar el grosor de un piso este **sigue pegado abajo**.
- **Sobrante aprovechable:** “en la tabla 5 sobra un pedazo que sirve para el piso inferior del mueble 3” → el optimizador rellena huecos de todas las tablas abiertas.
- **La raya negra de los muebles (Habitación):** representa el **frente** (donde se usa / abren puertas o cajones), no el fondo. Se validó con una mesita de 38 × 28: la raya siempre cae sobre un lado de 38 (el ancho) en las 4 orientaciones. Aun así generó confusión (en muchos planos una línea gruesa marca la parte de atrás), por eso se agregó la opción **Frente** (lado elegible o “sin marca”).
- **“¿Cuánto espacio queda entre un mueble y otro, o espacios vacíos?”:** se resolvió con distancias al vecino más cercano, tabla de separaciones, espacios libres y “¿cabe?”.
- **Escritorio en L:** pidió que al agregar el “escritorio en L” se **dibuje esa forma**. Un rectángulo ocuparía de más (la silla del hueco daría “se monta”), así que los muebles ahora pueden tener **partes** (un L = 2 rectángulos) y todas las revisiones, distancias y espacios libres usan las partes, no la caja.
- **Cuarto de su hija:** tiene **una división (pared interna)** que separa una de las paredes del cuarto → tipo de elemento `tabique`. Algunos de sus muebles no van en ese cuarto y uno está **duplicado** (misma medida externa, distinta distribución interna) → selector de muebles a traer con aviso de copias.

---

## 6. Línea de tiempo de lo construido (resumen)

1. Calculadora básica: piezas + tablas + optimizador + esquemas.
2. Repo `calculo-muebles` creado y publicado; guía de Cloudflare Pages.
3. Opción “Otro” (piezas a mano) → notas “Lo que necesito” → **Diseñador visual** (arrastrar).
4. Profundidad del mueble; botones de borrar; tipos de pieza (techo, piso, costado, división, repisa, tubo).
5. **Piezas calculadas solas** desde el diseño; colores por tipo; medidas dentro de cada tabla.
6. **Varios muebles** y **elegir pestañas** para el cálculo; reacomodo automático mejorado (melamina).
7. Plantilla “Tabla o estante”; **Plano de armado** (PNG/PDF); **Revisar medidas** (+ corrección automática); plano y revisión **por pestaña**.
8. Tubo que atraviesa divisiones + **agujero dibujado**; **secciones contraíbles**.
9. **Pestaña Habitación**: muebles, giro, puertas, ventanas, alfombras, revisión, medidas para colocar, exportación.
10. Arreglo de ancho de página (choque de nombre de clase CSS); validación de la división sobre el piso; validación con espesor 1,6.
11. Habitación: **paredes una por una**, **puertas sobre pared**, **división interna**, **elegir qué muebles traer**, **modificar y guardar medidas** de los muebles predeterminados.
12. Documentación (`README`, `CONTEXTO`, `HANDOFF`).
13. Cortes: el esquema de corte y la lista de cortes muestran el **#número de pieza del Plano de armado** (pedido: poder cruzar el corte con el armado).
15. Habitación: **mueble en L** (escritorio en L dibujado como L real; el hueco cuenta como espacio libre).
14. Cortes: arreglo de piezas que salían “invertidas” (50×180 en vez de 180×50): el resultado ahora muestra siempre **largo × ancho como se escribió** y marca con ↻ las que van giradas en la tabla.
14b. Habitación: **frente** elegible por mueble (la raya negra era confusa: marcaba el frente y ella esperaba otra cosa); **espacios entre muebles**, **espacios libres**, **“¿dónde cabe?”** y aviso opcional de **pasos angostos**.

---

## 7. Ideas que ella no pidió pero podrían servir (sin hacer)

- Que el campo “Espesor de las tablas” del mueble pregunte si se aplica a todas las tablas (como ya hace “Profundidad”).
- Que las plantillas (mesa, librero, gabinete) se carguen directamente en el diseñador.
- Vista de frente (alturas) en la habitación; giros libres; paredes no ortogonales.
- Puertas también en las divisiones internas.
- Sincronización en la nube (Cloudflare Workers KV, que ella ya paga) para usar la app desde varios dispositivos.
