# 🪵 Calculadora de Cortes para Muebles + 🏠 Distribución de Habitación

App web **estática** (HTML + CSS + JavaScript, sin servidor ni instalación) para dos cosas:

1. **Cortes de madera / melamina:** diseñás un mueble, ponés las medidas de las tablas que venden en la tienda y la app calcula **qué piezas cortar, de qué medida y cuántas tablas comprar**, aprovechando los sobrantes. También revisa que las piezas calcen y genera un **plano de armado**.
2. **Habitación:** ponés las medidas del cuarto (pared por pared si no es un rectángulo), acomodás los muebles vistos desde arriba, con puertas, ventanas y divisiones, y la app avisa si algo no cabe.

Todo está en español (voseo) y en **centímetros**.

- Repositorio: <https://github.com/Nancyms1012/calculo-muebles> (rama `main`)
- Archivos: `index.html`, `styles.css`, `app.js` (no hay build, no hay dependencias)
- Documentos para continuar el trabajo: [`CONTEXTO.md`](CONTEXTO.md) y [`HANDOFF.md`](HANDOFF.md)

---

## Cómo usarla (resumen)

La app tiene dos pestañas arriba: **🪵 Cortes de madera** y **🏠 Habitación**.

### 🪵 Cortes de madera

1. **Diseño del mueble** (sección “Diseñador”): poné ancho, alto, fondo y espesor, y agregá piezas con los botones (Techo, Piso, Costado, División, Repisa, Tubo para ropa, otra horizontal/vertical). Se arrastran, se duplican y se borran. Cada pieza tiene su color y muestra sus medidas.
2. **Plantillas rápidas** (Mesa, Banco, Librero, Gabinete, Tabla o estante, Otro): generan piezas con medidas que podés editar.
3. **Piezas a cortar:** salen **solas** del diseño. Si algo no está en el diseño (puertas, fondo, cajones) lo agregás como “piezas adicionales”.
4. **Tablas que venden:** largo, ancho, espesor y precio (opcional) de cada tabla de la tienda. Tiene que haber una del **mismo espesor** que las piezas.
5. **Calcular:** te dice cuántas tablas comprar, la lista de cortes y el esquema de cada tabla (con los retazos que sobran marcados en rojo punteado).
6. **Varios muebles:** con las pestañas de muebles (“+ Agregar otro mueble”) se calculan juntos y comparten tablas. La casilla ✔ de cada pestaña decide cuáles entran al cálculo (sirve para comparar “opción 1” y “opción 2”).
7. **✅ Revisar medidas:** compara cada pieza con sus vecinas como si lo hicieras a mano con la cinta (ver reglas en `HANDOFF.md`). Muchos problemas tienen botón “Corregir”.
8. **📐 Plano de armado:** alturas desde el piso, distancias, espacios libres, agujero del tubo, y una tabla “dónde va” cada pieza. Se puede descargar (PNG) o imprimir (PDF).

### 🏠 Habitación

1. **Medidas del cuarto:** ancho y largo, o **📏 Medir pared por pared** (cada pared con su largo y hacia dónde gira la esquina; sirve para formas en “L”).
2. **Muebles:** elegí de la lista (podés **cambiar las medidas antes de agregar** y guardarlas con 💾), escribí uno con tus medidas (y guardalo con ★ en tu lista), o **traé tus muebles de madera** marcando cuáles.
3. **Puertas** sobre una pared (pared, distancia desde el inicio, ancho, bisagra, hacia adentro/afuera), **ventanas**, **alfombras** y **divisiones / paredes internas**.
4. **Plano:** arrastrá, girá (botón o tecla **R**), pegá a una pared, centrá, duplicá. Verás las distancias a las paredes y la **revisión** automática (se sale, se monta, estorba una puerta).
5. **Medidas para colocar** (tabla con distancias a las 4 paredes) y exportación a PNG / PDF.
6. Podés tener **varias habitaciones o distribuciones** (“opción 2”).

### Funciones generales

- **Secciones contraíbles:** tocá el título de cualquier sección (o “Contraer todas”). Se recuerda lo que dejaste abierto.
- **Respaldo:** “📤 Exportar proyecto” baja un `.json` con **todo** (muebles, habitaciones, medidas guardadas); “📥 Importar proyecto” lo recupera.
- **Atajos en el plano de la habitación:** `R` gira, `Supr` borra, flechas mueven 1 cm (con `Mayús`, 10 cm).

---

## Dónde se guardan los datos

En el **navegador del dispositivo** (`localStorage`), no en un servidor:

| Clave | Qué guarda |
|---|---|
| `calcMuebles_v1` | El proyecto completo (muebles, habitaciones, tablas, medidas guardadas…) |
| `calcMuebles_ui` | Solo la interfaz: secciones contraídas y pestaña abierta |

⚠️ Los datos **no pasan solos** de la computadora al celular. Para moverlos: **Exportar** en uno y **Importar** en el otro. Si se borran los datos del navegador, se pierden: conviene exportar un respaldo de vez en cuando.

---

## Publicar (Cloudflare Pages)

No hay nada que compilar. En Cloudflare → Workers & Pages → Create → Pages → Connect to Git:

- Repositorio: `Nancyms1012/calculo-muebles`
- Production branch: `main`
- Framework preset: **None**
- Build command: *(vacío)*
- Build output directory: `/`

Cada `git push` a `main` vuelve a publicar. Después de actualizar, recargá con **Ctrl+Shift+R** para evitar ver la versión vieja guardada en el navegador.

---

## Probar en la computadora

Abrí `index.html` directamente en el navegador (doble clic). No necesita servidor.

Revisión rápida de sintaxis (si tenés Node): `node --check app.js`.

---

## Limitaciones conocidas

- Acomodo automático de cortes (no hay editor manual para mover piezas dentro de una tabla).
- Habitación: solo vista desde arriba, giros de 90°, paredes en ángulos de 90°.
- Las puertas solo van en las paredes del contorno (no en divisiones internas).
- Los datos viven en un solo navegador (ver arriba).

Más detalle técnico y pendientes en [`HANDOFF.md`](HANDOFF.md).
