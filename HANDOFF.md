# HANDOFF — Guía técnica para continuar el trabajo

Estado: **funcional y publicado en `main`**. Este documento sirve para retomar el desarrollo sin perder nada. Complementa a [`README.md`](README.md) (uso) y [`CONTEXTO.md`](CONTEXTO.md) (por qué y decisiones).

- Repo: `Nancyms1012/calculo-muebles`, rama `main`, deploy = `git push` (Cloudflare Pages: preset None, sin build, output `/`).
- **Pendiente de confirmar con Nancy:** si ya conectó el repo a Cloudflare Pages y cuál es la URL final (el subdominio exacto puede llevar un sufijo; otras apps suyas lo tuvieron).
- Sin dependencias, sin `package.json`, sin build, sin tests automáticos en el repo (las pruebas se hicieron con scripts temporales, ver §8).

---

## 1. Estructura de archivos

```
index.html   Estructura. Barra de pestañas + dos <main class="pagina">:
             #vista-cortes  (🪵 Cortes)  y  #vista-hab (🏠 Habitación)
styles.css   Estilos. Incluye reglas de impresión (@media print y body.print-plano / body.print-hab)
app.js       Toda la lógica (≈2200 líneas), en 3 zonas:
             1) LÓGICA PURA (arriba, sin DOM, exportada con module.exports para probar en Node)
             2) INTERFAZ  → bloque  if (typeof document !== 'undefined') { ... }
             3) module.exports (al final)
```

Secciones de `index.html` (cada una es un `section.card` con un `<h2>`; el JS las vuelve contraíbles):

- **Cortes:** 📝 Lo que necesito · 1. Diseño del mueble (plantillas) · ✏ Diseñador · 2. Piezas a cortar · 3. Tablas que venden · Resultado (`#resultado`, oculto hasta calcular) · ✅ Revisar medidas · 📐 Plano de armado · Respaldo
- **Habitación:** 🏠 Habitación (+ `<details>` de paredes) · 🛋 Agregar muebles · 📐 Plano de la habitación · ✏ Muebles de la habitación · 📏 Medidas para colocar

---

## 2. Modelo de datos (`estado`)

Se guarda completo en `localStorage['calcMuebles_v1']` (JSON) y es lo que exporta/importa el respaldo. La interfaz (secciones contraídas, pestaña) va aparte en `calcMuebles_ui`.

```js
estado = {
  v2: true,
  plantilla: 'mesa', valores: {...},          // plantilla elegida y sus campos
  stock: [{nombre, largo, ancho, espesor, precio}],   // tablas que venden
  kerf: 0.3, rotar: false /*ignorado: siempre se gira*/, unir: true,
  notas: '',
  muebles: [{                                  // pestañas de muebles de madera
    uid, nombre, incluir /*✔ para el cálculo*/,
    diseno: { ancho, alto, prof, esp, el: [pieza...] },
    piezas: [{nombre, largo, ancho, espesor, cant}]   // “piezas adicionales”
  }],
  activo: 0,
  // ⚠ estado.diseno y estado.piezas son ALIAS del mueble activo (ver sincronizar/serializar)
  planoModo: 'activo'|'todos', revModo: 'activo'|'todos',
  habs: [{                                     // habitaciones / distribuciones
    nombre, ancho, largo,                      // caja que contiene al cuarto (derivada si hay paredes)
    paredes?: [{len, giro:'D'|'I'}],           // si falta → rectángulo ancho×largo
    sx, sy,                                    // desplazamiento acumulado del origen (ver §6)
    items: [item...]
  }],
  habActiva: 0,
  presetsHab: { 'Cama queen': {w, h} },        // medidas guardadas de los muebles predeterminados
  misPresets: [{nombre, w, h, color}]          // muebles propios guardados con ★
}
```

**Pieza del diseñador (`diseno.el[]`):**
`{ id, nombre, tipo?, orient:'H'|'V', largo, esp, prof, x, y, tubo? }`
`y` crece hacia abajo (0 = techo del mueble). Para `H` el rectángulo es `largo × esp`; para `V`, `esp × largo`. El tubo tiene `tubo:true`, `esp` = diámetro, `prof = 0`.

**Item de habitación (`habs[].items[]`):**
`{ id, nombre, tipo:'mueble'|'alfombra'|'puerta'|'ventana'|'tabique', w, h, x, y, rot:0|90|180|270, color, origen? }`
`origen` = `uid` del mueble de madera del que vino. **Puertas** además: `pared, pos, bisagra:'ini'|'fin', afuera` (fuente de verdad) y `x, y, rot, flip, ax, ay, bx, by` (derivados por `ubicarPuerta`, no editar a mano).

**Migración:** `migrar(s)` (dentro del bloque de interfaz) completa cualquier campo nuevo con valores por defecto. **Todo campo nuevo del estado debe inicializarse ahí** para no romper proyectos viejos ni respaldos `.json` antiguos.

**Alias importante:** `estado.diseno`/`estado.piezas` apuntan a los del mueble activo. Antes de leer varios muebles hay que llamar `sincronizar()`; `serializar()` los excluye al guardar. Al cambiar de pestaña se usa `irAMueble(i)`.

---

## 3. Mapa de funciones

### Lógica pura (testeable en Node)

| Área | Funciones |
|---|---|
| Optimizador de cortes | `empacar`, `mejorEspacio`, `colocar`, `optimizar`, `expandirTiras`, `retazosDe`, `calcularPlan` |
| Diseño → piezas | `piezasDesdeDiseno`, `materialesDesdeDiseno` (el tubo va aparte) |
| Plantillas | `PLANTILLAS` (mesa, banco, librero, gabinete, tabla, otro) con `campos`, `piezas(v)`, `dibujo(v)` |
| Colores | `COLORES`, `COLORES_OTROS`, `colorDe(nombre)`, `leyendaHTML` |
| Plano de armado | `calcularPlano(d)`, `svgPlano`, `pasaPor`, `sugerirArreglo`, `fixExtremo` |
| Revisión de medidas | `revisarDiseno(d)` → `{pl, problemas, notas, okPiezas}` |
| Habitación | `geomHab`, `rectDentro`, `distParedes`, `ubicarPuerta`, `cerrarParedes`, `rectHab`, `revisarHabitacion`, `posicionLibre`, `snapMove`, `PRESETS_HAB`, `nuevaHab`, `paredesRect`, `esRectangular` |
| Utilidades | `r(n)` redondea a 2 decimales · `fN(n)` formatea 1 decimal con coma · `escH` escapa HTML |

### Interfaz (dentro de `if (typeof document !== 'undefined')`)

`cargar/guardar/migrar/serializar/sincronizar` · `iniciar` · muebles: `irAMueble`, `incluidos`, `piezasDeMueble`, `todasLasPiezas` · diseñador: `nuevoEl`, `pintarCanvas`, `clampEl` · resultado: `pintarResultado` · revisión: `generarRevision`, `corregirTodo`, `aplicarFix` · plano: `generarPlano`, `descargarPng` · habitación: `mostrarVista`, `pintarHab`, `refrescarHab`, `construirHabSvg`, `dibujarItemHab`, `aplicarParedes`, `agregarItemHab`, `presetsHab`, `moverPuertaA` · secciones: `iniciarColapsables`.

---

## 4. Algoritmos clave

### 4.1 Optimizador de cortes (`optimizar` / `empacar`)
- Agrupa piezas **por espesor**; para cada espesor prueba cada tabla del stock de ese espesor y elige la mejor (con precio: la más barata; sin precio: la de menos tablas).
- Empaque **guillotina** con rectángulos libres. Cada pieza se coloca en el **mejor hueco de cualquier tabla ya abierta** (esto aprovecha sobrantes entre muebles) y, si no cabe, abre otra tabla.
- Se prueban **6 órdenes** (`ORDENES`: área, lado largo, alto, largo, perímetro, lado corto) × **3 heurísticas** de hueco (`HEUR`: `bss`, `bls`, `baf`) y se queda la que usa **menos tablas** (empate: la de menos área usada en la última tabla).
- `calcularPlan(..., rotar=true, unir)`: en la interfaz se llama siempre con `rotar = true` (melamina).
- Piezas con `m` (índice de mueble) para rotularlas M1, M2… en los esquemas.

### 4.2 Revisión de medidas (`revisarDiseno`)
Orden de reglas (cada una puede traer `fix` automático):
0. **Borde:** piso/techo/costados (por nombre) separados 0,05–5 cm del borde del mueble → error + fix. **Si hay alguno, devuelve de inmediato** (lo demás depende de esto) con un aviso “corregí primero y volvé a revisar”.
1. **Superposiciones** (`calcularPlano().choques`). Si es una vertical que entra por el extremo en una horizontal que la rodea, se explica en la regla 4 (no se duplica).
2. **Fuera del mueble**; 2b. **Tubo** que termina dentro de una vertical (si la atraviesa de lado a lado es una *nota* de agujero, no un error).
3. **Horizontales/tubos**: largo = espacio entre las verticales vecinas (si no, “hueco” + fix).
4. **Verticales**: largo y posición entre la horizontal de arriba y la de abajo, **incluyendo** la horizontal en la que la vertical se mete por su extremo (cuando está “en medio” de ella). Si el largo es correcto pero la posición no → tipo `ubicacion` (“tiene la medida correcta pero está mal ubicada”).
5. **Totales** (las piezas ocupan lo que dice el mueble), 6. **Fondos distintos**.
`corregirTodo(mi)` aplica los `fix` en bucle (máx. 6 vueltas) hasta que no queden.

### 4.3 Geometría de la habitación (`geomHab`)
- Recorre `paredes` empezando en (0,0) hacia la derecha; `giro 'D'` = +90° horario, `'I'` = −90°. `cierra` = vuelve a (0,0) con rumbo “este”. Normaliza para que la caja empiece en (0,0) y devuelve `{pts, walls[{a,b,dx,dy,len,nx,ny,dir}], w, h, area, horario, sx, sy, falta}`.
- La normal hacia **adentro** de cada pared es `(-dy, dx)`.
- `rectDentro` = 4 esquinas (recortadas 0,5 cm) dentro del polígono (ray casting) + ninguna pared cruza el interior.
- `ubicarPuerta`: a partir de `(pared, pos, w, bisagra, afuera)` calcula la caja del abanico (`x,y`), la rotación y el espejo (`flip`) con la transformación `translate(c) rotate(rot) [scale(-1,1)] translate(-w/2,-h/2)`; verificado en las 16 combinaciones (4 paredes × bisagra × adentro/afuera).
- `snapMove`: se pega (≤ 4 cm) a paredes, vértices, centro y bordes de otros elementos; si no, a la cuadrícula.

---

## 5. Convenciones de dibujo

- Todo SVG usa **atributos en línea** (no clases CSS) para poder exportarlo a PNG.
- El PNG se genera serializando el SVG → `Image` → `canvas` ×2 → `toBlob`.
- Etiquetas con halo blanco (`stroke="#fff" paint-order="stroke"`).
- Selección = contorno rojo discontinuo; conflicto = contorno rojo grueso; distancias a paredes = verde discontinuo; guías de ajuste = magenta discontinuo.

---

## 6. Trampas conocidas (¡leer antes de tocar!)

1. **Choque de nombres CSS:** la clase `.vista` ya es del pequeño dibujo `#vista-mueble` (`max-width: 360px`). Una vez se la puse a los `<main>` y la página quedó angosta. Los contenedores de pestañas usan **`.pagina`**. Antes de crear una clase nueva: `grep -n "\.nombre" styles.css`.
2. **`[hidden]` pierde contra `display:`**: por eso existen `main[hidden]`, `.row[hidden]`, `.madera-panel[hidden]` en el CSS. Si ocultás con `hidden` un elemento con `display:flex/grid`, agregá su regla.
3. **Secciones contraíbles:** `iniciarColapsables()` mueve el contenido de cada sección a `.card-body` **después** de cargar. Los `id` siguen funcionando, pero hay que expandir antes de hacer `scrollIntoView` (ya existe `expandir(sec)`). El estado contraído se guarda **por posición** (índice) en `calcMuebles_ui`: insertar una sección nueva en el medio corre los índices guardados (efecto menor).
4. **IDs numéricos con decimales** (`Date.now()+Math.random()`): al leerlos de `data-*` usar `Number(...)`.
5. **`rect.y2 > Hh`** etc.: en `calcularPlano` los elementos traen `w`/`h` del **rectángulo** (ya orientado) además de `largo`/`esp`; para una vertical `h` = su largo. No confundir con `largo`.
6. **Habitación y desplazamiento del origen:** si las paredes se extienden hacia la izquierda/arriba del punto de partida, `geomHab` normaliza y cambia `sx/sy`; `aplicarParedes(hb)` mueve los muebles la diferencia para que no “salten”. Cualquier cambio de paredes debe pasar por `aplicarParedes` (lo hace `tocoParedes`).
7. **Atajos de teclado:** `Supr` borra la pieza del diseñador **solo** en la vista Cortes (`vistaActual === 'cortes'`); en Habitación hay otro manejador. Mantener esa guarda.
8. **Casilla “Girar piezas”:** quedó fija y deshabilitada (el cálculo siempre gira). `estado.rotar` ya no se usa.
9. **Impresión:** `body.print-plano` / `body.print-hab` se agregan solo durante `window.print()` y ocultan el resto con `!important`.

---

## 7. Cómo agregar cosas (recetas)

- **Un tipo de pieza nuevo en el diseñador:** botón en `#d-botones` con `data-tipo`; entrada en el objeto `defs` de `nuevoEl`; si necesita color, regla en `COLORES`; si no es madera, tratarlo como el tubo (`materialesDesdeDiseno`).
- **Un mueble predeterminado nuevo de la habitación:** una fila en `PRESETS_HAB` `[nombre, ancho, fondo, color]`.
- **Una regla nueva de revisión:** agregarla en `revisarDiseno` con `add(nivel, tipo, texto, piezas, fix?)`; el `fix` es `{id, x?, y?, largo?}`. Probarla con `corregirTodo`.
- **Un campo nuevo en `estado`:** valor por defecto en `porDefecto()` **y** en `migrar()`.
- **Un tipo nuevo de elemento de habitación:** `TIPO_TXT`, rama en `dibujarItemHab`, orden de dibujo en `construirHabSvg`, y decidir si es obstáculo (`ES_OBSTACULO`).

---

## 8. Cómo se probó (para repetirlo)

No hay tests en el repo; se usaron scripts temporales **fuera del repo** (p. ej. `/projects/sandbox/_jt`, borrado al terminar):

- **Lógica pura:** `const A = require('./app.js')` y llamar `calcularPlan`, `revisarDiseno`, `geomHab`, `ubicarPuerta`, etc. con diseños armados a mano. Casos útiles: ver §5 de `CONTEXTO.md`.
- **Interfaz:** `jsdom` (`npm i jsdom` en una carpeta temporal): cargar `index.html` quitando la etiqueta `<script src="app.js">`, `runScripts:'outside-only'`, `window.eval(app.js)`, y simular clics/inputs. Hay que **stubear** `confirm`, `alert`, `HTMLElement.prototype.scrollIntoView` y, para arrastrar, `createSVGPoint`, `getScreenCTM`, `setPointerCapture`.
- **Vista real:** el navegador de Playwright del sandbox **no abre `file:`** ni `localhost`; se renderizó con `page.setContent(<svg…>)` y `browser_take_screenshot`. Los glifos emoji/flechas pueden verse como cuadritos en ese navegador de prueba, no en uno normal.
- **Entorno del sandbox:** `node` no está en el PATH directo → usar `bash -lc 'node …'`. `/tmp` no siempre es accesible desde el `cwd` del repo.
- Siempre: `node --check app.js` antes de cada commit.

---

## 9. Pendientes y mejoras posibles

**Pedido por Nancy y aún sin resolver:** nada abierto. Última aclaración pendiente: *¿la división del cuarto de su hija necesita una abertura / puerta?* (hoy las puertas solo van en paredes del contorno).

**Ideas (no pedidas):**
- Campo “Espesor de las tablas” del mueble: preguntar si se aplica a todas las tablas existentes (hoy solo afecta las piezas nuevas).
- Cargar las plantillas (mesa/librero/gabinete) directamente en el diseñador.
- Editor manual de acomodo dentro de cada tabla (hoy es automático).
- Habitación: vista de frente con alturas, giros libres, paredes no ortogonales, puertas en divisiones.
- Sincronización en la nube (Cloudflare Workers KV, plan que ella ya tiene) para varios dispositivos.
- Pruebas automáticas dentro del repo (hoy son scripts descartables).
- Quitar `estado.rotar` del modelo y la casilla visual cuando ya no haga falta.

---

## 10. Checklist antes de publicar

1. `node --check app.js`
2. Probar a mano: calcular un mueble, “Revisar medidas”, generar plano, abrir Habitación, arrastrar un mueble, exportar/importar `.json`.
3. Si se agregó un campo al estado → está en `porDefecto()` y `migrar()`.
4. `git add index.html styles.css app.js README.md CONTEXTO.md HANDOFF.md` → `git commit` → `git push` (a `main`).
5. Avisar a Nancy que recargue con **Ctrl+Shift+R**.

> Si algo falla en un proyecto ya guardado, pedirle el respaldo `.json` (“📤 Exportar proyecto”) y reproducirlo importándolo.
