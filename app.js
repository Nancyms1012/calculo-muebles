'use strict';
/* ====== LÓGICA (sin DOM, testeable) ====== */

const EPS = 1e-6;

// Empaca piezas (cada una {nombre,w,h}) en tablas W x H con cortes guillotina.
function empacar(piezas, W, H, kerf, rotar, orden) {
  const lista = piezas.slice().sort(orden);
  const bins = [];
  for (const p of lista) {
    let mejor = null; // {bin, idx, rot, score}
    for (let b = 0; b < bins.length && !mejor; b++) {
      mejor = mejorEspacio(bins[b], b, p, kerf, rotar);
    }
    if (!mejor) {
      // Rect libre inicial con +kerf para que la última pieza no pague corte
      bins.push({ libres: [{ x: 0, y: 0, w: W + kerf, h: H + kerf }], piezas: [] });
      mejor = mejorEspacio(bins[bins.length - 1], bins.length - 1, p, kerf, rotar);
      if (!mejor) return null;
    }
    colocar(bins[mejor.bin], mejor, p, kerf);
  }
  return bins;
}

function mejorEspacio(bin, b, p, kerf, rotar) {
  let mejor = null;
  const orient = [[p.w, p.h, false]];
  if (rotar && Math.abs(p.w - p.h) > EPS) orient.push([p.h, p.w, true]);
  bin.libres.forEach((f, idx) => {
    for (const [w, h, rot] of orient) {
      const pw = w + kerf, ph = h + kerf;
      if (pw <= f.w + EPS && ph <= f.h + EPS) {
        const score = Math.min(f.w - pw, f.h - ph);
        if (!mejor || score < mejor.score - EPS) mejor = { bin: b, idx, rot, score, w, h };
      }
    }
  });
  return mejor;
}

function colocar(bin, m, p, kerf) {
  const f = bin.libres[m.idx];
  const pw = m.w + kerf, ph = m.h + kerf;
  bin.piezas.push({ nombre: p.nombre, m: p.m, x: f.x, y: f.y, w: m.w, h: m.h, rot: m.rot });
  bin.libres.splice(m.idx, 1);
  const rw = f.w - pw, rh = f.h - ph;
  let r1, r2;
  if (rw < rh) { // corte horizontal largo
    r1 = { x: f.x + pw, y: f.y, w: rw, h: ph };
    r2 = { x: f.x, y: f.y + ph, w: f.w, h: rh };
  } else {
    r1 = { x: f.x + pw, y: f.y, w: rw, h: f.h };
    r2 = { x: f.x, y: f.y + ph, w: pw, h: rh };
  }
  if (r1.w > EPS && r1.h > EPS) bin.libres.push(r1);
  if (r2.w > EPS && r2.h > EPS) bin.libres.push(r2);
}

// Piezas más anchas que la tabla se arman uniendo tiras (encolado).
function expandirTiras(lista, L, A, rotar) {
  const out = [];
  for (const p of lista) {
    const cabeAsi = p.w <= L + EPS && p.h <= A + EPS;
    const cabeGirada = rotar && p.h <= L + EPS && p.w <= A + EPS;
    if (cabeAsi || cabeGirada || p.w > L + EPS) { out.push(p); continue; }
    const n = Math.ceil(p.h / A - EPS);
    const h = Math.round((p.h / n) * 100) / 100;
    for (let i = 1; i <= n; i++) out.push({ nombre: `${p.nombre} (tira ${i}/${n})`, w: p.w, h, tira: true, m: p.m });
  }
  return out;
}

const ORDENES = [
  (a, b) => b.w * b.h - a.w * a.h,
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
  (a, b) => b.h - a.h || b.w - a.w,
  (a, b) => b.w - a.w || b.h - a.h,
];

function optimizar(piezas, W, H, kerf, rotar) {
  // piezas: [{nombre,w,h}] ya expandidas. W = largo tabla, H = ancho tabla.
  const orientadas = piezas.map(p => ({ ...p }));
  let mejor = null;
  for (const orden of ORDENES) {
    const r = empacar(orientadas, W, H, kerf, rotar, orden);
    if (!r) continue;
    const area = r.reduce((s, b) => s + b.piezas.reduce((t, q) => t + q.w * q.h, 0), 0);
    const cand = { bins: r, area };
    if (!mejor || r.length < mejor.bins.length) mejor = cand;
  }
  return mejor;
}

// Retazos aprovechables (sobrantes) de una tabla ya empacada, recortados a los bordes de la tabla.
function retazosDe(bin, L, A, kerf, minimo) {
  const out = [];
  for (const f of bin.libres) {
    const w = Math.min(f.w, L - f.x), h = Math.min(f.h, A - f.y);
    if (w >= minimo - EPS && h >= minimo - EPS) out.push({ x: f.x, y: f.y, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 });
  }
  return out;
}

// Calcula el plan completo. Devuelve {grupos, errores, totalTablas, costoTotal}
function calcularPlan(piezas, stock, kerf, rotar, unir) {
  const errores = [];
  const grupos = [];
  const porEspesor = new Map();
  for (const p of piezas) {
    if (!(p.largo > 0 && p.ancho > 0 && p.cant > 0)) continue;
    const k = +p.espesor;
    if (!porEspesor.has(k)) porEspesor.set(k, []);
    for (let i = 0; i < p.cant; i++) {
      porEspesor.get(k).push({ nombre: p.nombre || 'Pieza', w: +p.largo, h: +p.ancho, m: p.m });
    }
  }
  for (const [esp, lista] of porEspesor) {
    const opciones = stock.filter(s => Math.abs(+s.espesor - esp) < EPS && s.largo > 0 && s.ancho > 0);
    if (!opciones.length) {
      errores.push(`Hay piezas de ${esp} cm de espesor, pero en la sección 3 no hay tablas de ${esp} cm. Agregá una tabla de ese espesor (o cambiá el espesor de las piezas).`);
      continue;
    }
    let elegida = null;
    for (const s of opciones) {
      const exp = unir ? expandirTiras(lista, +s.largo, +s.ancho, rotar) : lista;
      const res = optimizar(exp, +s.largo, +s.ancho, kerf, rotar);
      if (!res) continue;
      const n = res.bins.length;
      const costo = (+s.precio || 0) * n;
      const cand = { stock: s, res, n, costo, tiras: unir ? exp.filter(p => p.tira).length : 0 };
      const tienePrecio = +s.precio > 0;
      if (!elegida) elegida = cand;
      else if (tienePrecio && elegida.costo > 0 ? costo < elegida.costo : n < elegida.n) elegida = cand;
    }
    if (!elegida) {
      // Detectar piezas que no caben
      const s = opciones[0];
      const malas = lista.filter(p => !(p.w <= s.largo && p.h <= s.ancho) && !(rotar && p.h <= s.largo && p.w <= s.ancho));
      const nombres = [...new Set(malas.map(p => `${p.nombre} (${p.w}×${p.h})`))].join(', ');
      errores.push(`Hay piezas de ${esp} cm que no caben en ninguna tabla disponible: ${nombres || 'revisá medidas'}. Considerá activar “permitir girar” o unir tablas.`);
      continue;
    }
    const areaPiezas = elegida.res.area;
    const areaTablas = elegida.n * elegida.stock.largo * elegida.stock.ancho;
    grupos.push({
      espesor: esp,
      stock: elegida.stock,
      tablas: elegida.res.bins,
      n: elegida.n,
      costo: elegida.costo,
      desperdicio: 1 - areaPiezas / areaTablas,
      tiras: elegida.tiras,
    });
  }
  return {
    grupos, errores,
    totalTablas: grupos.reduce((s, g) => s + g.n, 0),
    costoTotal: grupos.reduce((s, g) => s + g.costo, 0),
  };
}

function piezasDesdeDiseno(el) {
  const m = new Map();
  for (const e of el) {
    if (e.tubo) continue;
    const p = { nombre: e.nombre || 'Pieza', largo: r(e.largo), ancho: r(e.prof), espesor: r(e.esp), cant: 1 };
    const k = [p.nombre, p.largo, p.ancho, p.espesor].join('|');
    if (m.has(k)) m.get(k).cant++; else m.set(k, p);
  }
  return [...m.values()];
}

// Tubos para ropa: no se cortan de tabla, se listan aparte.
function materialesDesdeDiseno(el) {
  const m = new Map();
  for (const e of el) {
    if (!e.tubo) continue;
    const k = r(e.largo) + '|' + r(e.esp);
    if (m.has(k)) m.get(k).cant++; else m.set(k, { nombre: e.nombre || 'Tubo para ropa', largo: r(e.largo), diametro: r(e.esp), cant: 1 });
  }
  return [...m.values()];
}

/* ====== PLANTILLAS ====== */
const PLANTILLAS = {
  mesa: {
    nombre: 'Mesa / Escritorio',
    campos: [['largo', 'Largo total', 140], ['ancho', 'Ancho total', 70], ['alto', 'Alto total', 75],
      ['eTop', 'Espesor tablero', 3], ['ePata', 'Grosor patas (cuadradas)', 7], ['aTrav', 'Ancho travesaños', 8], ['eTrav', 'Espesor travesaños', 2.5]],
    piezas: v => [
      { nombre: 'Tablero', largo: v.largo, ancho: v.ancho, espesor: v.eTop, cant: 1 },
      { nombre: 'Pata', largo: r(v.alto - v.eTop), ancho: v.ePata, espesor: v.ePata, cant: 4 },
      { nombre: 'Travesaño largo', largo: r(v.largo - 2 * v.ePata - 4), ancho: v.aTrav, espesor: v.eTrav, cant: 2 },
      { nombre: 'Travesaño corto', largo: r(v.ancho - 2 * v.ePata - 4), ancho: v.aTrav, espesor: v.eTrav, cant: 2 },
    ],
    dibujo: v => dibujoMesa(v),
  },
  banco: {
    nombre: 'Banco',
    campos: [['largo', 'Largo', 100], ['ancho', 'Ancho', 30], ['alto', 'Alto', 45],
      ['eTop', 'Espesor asiento', 3], ['ePata', 'Grosor patas', 5], ['aTrav', 'Ancho travesaños', 7], ['eTrav', 'Espesor travesaños', 2.5]],
    piezas: v => PLANTILLAS.mesa.piezas(v).map(p => p.nombre === 'Tablero' ? { ...p, nombre: 'Asiento' } : p),
    dibujo: v => dibujoMesa(v),
  },
  librero: {
    nombre: 'Librero / Estante',
    campos: [['ancho', 'Ancho total', 80], ['alto', 'Alto total', 180], ['fondo', 'Fondo', 30],
      ['esp', 'Espesor de tablas', 2], ['repisas', 'Repisas intermedias', 4]],
    piezas: v => [
      { nombre: 'Lateral', largo: v.alto, ancho: v.fondo, espesor: v.esp, cant: 2 },
      { nombre: 'Tapa', largo: r(v.ancho - 2 * v.esp), ancho: v.fondo, espesor: v.esp, cant: 1 },
      { nombre: 'Base', largo: r(v.ancho - 2 * v.esp), ancho: v.fondo, espesor: v.esp, cant: 1 },
      { nombre: 'Repisa', largo: r(v.ancho - 2 * v.esp), ancho: v.fondo, espesor: v.esp, cant: v.repisas },
    ],
    dibujo: v => dibujoCaja(v, v.repisas, false),
  },
  gabinete: {
    nombre: 'Gabinete con puertas',
    campos: [['ancho', 'Ancho total', 80], ['alto', 'Alto total', 90], ['fondo', 'Fondo', 40],
      ['esp', 'Espesor de tablas', 1.8], ['repisas', 'Repisas intermedias', 1]],
    piezas: v => [
      { nombre: 'Lateral', largo: v.alto, ancho: v.fondo, espesor: v.esp, cant: 2 },
      { nombre: 'Tapa', largo: r(v.ancho - 2 * v.esp), ancho: v.fondo, espesor: v.esp, cant: 1 },
      { nombre: 'Base', largo: r(v.ancho - 2 * v.esp), ancho: v.fondo, espesor: v.esp, cant: 1 },
      { nombre: 'Repisa', largo: r(v.ancho - 2 * v.esp), ancho: r(v.fondo - 1), espesor: v.esp, cant: v.repisas },
      { nombre: 'Puerta', largo: v.alto, ancho: r(v.ancho / 2 - 0.2), espesor: v.esp, cant: 2 },
    ],
    dibujo: v => dibujoCaja(v, v.repisas, true),
  },
  otro: {
    nombre: 'Otro (digitar mis propias piezas)',
    campos: [],
    piezas: () => [],
    dibujo: () => '<text x="150" y="95" text-anchor="middle" font-size="13" fill="#6d5f52">Diseño personalizado</text><text x="150" y="115" text-anchor="middle" font-size="11" fill="#6d5f52">Agregá tus piezas en la sección 2</text>',
  },
};

// Color por tipo de pieza, para identificarlas fácil.
const COLORES = [
  ['Techo / superior', /techo|superior|tapa/, '#6699FF'],
  ['Piso / inferior', /piso|inferior|base/, '#a77be0'],
  ['Vertical (costado / división)', /costado|lateral|divisi|vertical/, '#FF0DFF'],
  ['Repisa', /repisa|estante/, '#66FFFF'],
  ['Tubo para ropa', /tubo/, '#a9b2ba'],
];
const COLORES_OTROS = ['#e6c84a', '#4fc3c9', '#c98f6b', '#b5d65a', '#e58fd1', '#8aa0e8'];
function colorDe(nombre) {
  const n = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [, re, c] of COLORES) if (re.test(n)) return c;
  let h = 0;
  for (const ch of n.replace(/\s*\(tira.*$/, '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORES_OTROS[h % COLORES_OTROS.length];
}
function leyendaHTML(nombres) {
  const vistos = new Map();
  for (const n of nombres) { const base = String(n).replace(/\s*\(tira.*$/, ''); if (!vistos.has(base)) vistos.set(base, colorDe(base)); }
  return '<div class="leyenda">' + [...vistos].map(([n, c]) => `<span><i style="background:${c}"></i>${String(n).replace(/[&<>]/g, '')}</span>`).join('') + '</div>';
}

function r(n) { return Math.round(n * 100) / 100; }

function dibujoMesa(v) {
  const W = 300, Hh = 200, pad = 20;
  const esc = Math.min((W - 2 * pad) / v.largo, (Hh - 2 * pad - 14) / v.alto);
  const w = v.largo * esc, h = v.alto * esc, x0 = (W - w) / 2, y0 = pad;
  const et = Math.max(v.eTop * esc, 3), ep = Math.max(v.ePata * esc, 3);
  const at = v.aTrav * esc;
  return `
  <rect x="${x0}" y="${y0}" width="${w}" height="${et}" fill="#c89a63" stroke="#6b4423"/>
  <rect x="${x0 + ep}" y="${y0 + et}" width="${w - 2 * ep}" height="${at}" fill="#d9b585" stroke="#6b4423"/>
  <rect x="${x0}" y="${y0 + et}" width="${ep}" height="${h - et}" fill="#b07d45" stroke="#6b4423"/>
  <rect x="${x0 + w - ep}" y="${y0 + et}" width="${ep}" height="${h - et}" fill="#b07d45" stroke="#6b4423"/>
  <text x="${W / 2}" y="${y0 + h + 14}" text-anchor="middle" font-size="11">${v.largo} × ${v.alto} cm (fondo ${v.ancho})</text>`;
}

function dibujoCaja(v, repisas, puertas) {
  const W = 300, Hh = 200, pad = 16;
  const esc = Math.min((W - 2 * pad) / v.ancho, (Hh - 2 * pad - 14) / v.alto);
  const w = v.ancho * esc, h = v.alto * esc, x0 = (W - w) / 2, y0 = pad;
  const e = Math.max(v.esp * esc, 2.5);
  let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f3e6d2" stroke="#6b4423"/>
  <rect x="${x0}" y="${y0}" width="${e}" height="${h}" fill="#b07d45"/>
  <rect x="${x0 + w - e}" y="${y0}" width="${e}" height="${h}" fill="#b07d45"/>
  <rect x="${x0}" y="${y0}" width="${w}" height="${e}" fill="#b07d45"/>
  <rect x="${x0}" y="${y0 + h - e}" width="${w}" height="${e}" fill="#b07d45"/>`;
  const n = +repisas || 0;
  for (let i = 1; i <= n; i++) {
    const y = y0 + (h * i) / (n + 1) - e / 2;
    s += `<rect x="${x0}" y="${y}" width="${w}" height="${e}" fill="#b07d45"/>`;
  }
  if (puertas) {
    s += `<rect x="${x0 + 1}" y="${y0 + 1}" width="${w / 2 - 1.5}" height="${h - 2}" fill="#c89a63aa" stroke="#6b4423"/>
    <rect x="${x0 + w / 2 + 0.5}" y="${y0 + 1}" width="${w / 2 - 1.5}" height="${h - 2}" fill="#c89a63aa" stroke="#6b4423"/>`;
  }
  s += `<text x="${W / 2}" y="${y0 + h + 14}" text-anchor="middle" font-size="11">${v.ancho} × ${v.alto} cm (fondo ${v.fondo})</text>`;
  return s;
}

/* ====== INTERFAZ ====== */
if (typeof document !== 'undefined') {
  const CLAVE = 'calcMuebles_v1';
  let estado = cargar();

  function porDefecto() {
    return {
      plantilla: 'mesa',
      valores: {},
      piezas: [], v2: true,
      stock: [
        { nombre: 'Tabla 2×30×300', largo: 300, ancho: 30, espesor: 2, precio: 0 },
        { nombre: 'Tabla 2.5×20×300', largo: 300, ancho: 20, espesor: 2.5, precio: 0 },
        { nombre: 'Tabla 3×30×300', largo: 300, ancho: 30, espesor: 3, precio: 0 },
        { nombre: 'Tabla 7×7×300', largo: 300, ancho: 7, espesor: 7, precio: 0 },
      ],
      kerf: 0.3, rotar: false, unir: true, notas: '',
      diseno: nuevoDiseno(),
    };
  }
  function nuevoDiseno() { return { ancho: 80, alto: 180, prof: 30, esp: 2, el: [] }; }
  function migrar(s) {
    if (!Array.isArray(s.muebles) || !s.muebles.length) {
      s.muebles = [{ nombre: 'Mueble 1', diseno: s.diseno || nuevoDiseno(), piezas: s.piezas || [] }];
      s.activo = 0;
    }
    s.muebles.forEach((m, i) => {
      if (!m.nombre) m.nombre = 'Mueble ' + (i + 1);
      if (!m.diseno) m.diseno = nuevoDiseno();
      if (!m.diseno.el) m.diseno.el = [];
      if (!m.diseno.prof) m.diseno.prof = 30;
      if (!m.diseno.esp) m.diseno.esp = 2;
      if (!Array.isArray(m.piezas)) m.piezas = [];
      if (m.incluir === undefined) m.incluir = true;
    });
    if (!(s.activo >= 0 && s.activo < s.muebles.length)) s.activo = 0;
    s.diseno = s.muebles[s.activo].diseno;
    s.piezas = s.muebles[s.activo].piezas;
    return s;
  }
  function serializar() {
    sincronizar();
    return JSON.stringify(Object.assign({}, estado, { diseno: undefined, piezas: undefined }));
  }
  function sincronizar() {
    const m = estado.muebles[estado.activo];
    m.diseno = estado.diseno; m.piezas = estado.piezas;
  }
  function valoresIniciales(k) {
    const o = {};
    PLANTILLAS[k].campos.forEach(c => o[c[0]] = c[2]);
    return o;
  }
  function cargar() {
    try {
      const s = JSON.parse(localStorage.getItem(CLAVE));
      if (s && s.stock && (s.piezas || s.muebles)) {
        // Migración: antes el diseño se copiaba a la lista; ahora el diseño se calcula solo.
        if (!s.v2) { s.v2 = true; if (s.diseno && s.diseno.el && s.diseno.el.length) s.piezas = []; }
        return migrar(s);
      }
    } catch (e) {}
    return migrar(porDefecto());
  }
  function guardar() { localStorage.setItem(CLAVE, serializar()); }
  const $ = id => document.getElementById(id);
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => '₡' + Math.round(n).toLocaleString('es-CR');
  const num = n => (Math.round(n * 100) / 100).toString().replace('.', ',');

  function pintarPlantilla() {
    const sel = $('plantilla');
    sel.innerHTML = Object.entries(PLANTILLAS).map(([k, p]) => `<option value="${k}">${p.nombre}</option>`).join('');
    sel.value = estado.plantilla;
    const t = PLANTILLAS[estado.plantilla];
    const vals = Object.assign(valoresIniciales(estado.plantilla), estado.valores[estado.plantilla] || {});
    const custom = estado.plantilla === 'otro';
    $('btn-generar').hidden = custom;
    $('plantilla-campos').innerHTML = custom ? '<p class="hint">Sin plantilla: digitá tus piezas (nombre, medidas, espesor y cantidad) en la sección 2 con “+ Agregar pieza”. Las piezas que ya tengas se conservan.</p>' : t.campos.map(c =>
      `<label>${c[1]} (cm)<input type="number" step="0.1" min="0" data-campo="${c[0]}" value="${vals[c[0]]}"></label>`).join('');
    pintarVista();
  }
  function leerValores() {
    const v = {};
    document.querySelectorAll('[data-campo]').forEach(i => v[i.dataset.campo] = parseFloat(i.value) || 0);
    estado.valores[estado.plantilla] = v;
    return v;
  }
  function pintarVista() {
    const v = leerValores();
    $('vista-mueble').innerHTML = PLANTILLAS[estado.plantilla].dibujo(v);
  }

  function pintarPiezas() {
    $('p-todas').checked = false;
    $('tabla-piezas').tBodies[0].innerHTML = estado.piezas.map((p, i) => `<tr>
      <td><input type="checkbox" data-selp="${i}"></td>
      <td><input data-t="piezas" data-i="${i}" data-k="nombre" value="${esc(p.nombre)}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="largo" value="${p.largo}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="ancho" value="${p.ancho}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="espesor" value="${p.espesor}"></td>
      <td><input type="number" step="1" min="1" data-t="piezas" data-i="${i}" data-k="cant" value="${p.cant}"></td>
      <td><button class="danger" data-del="piezas" data-i="${i}" title="Eliminar esta pieza">🗑</button></td></tr>`).join('');
  }
  function pintarStock() {
    $('tabla-stock').tBodies[0].innerHTML = estado.stock.map((p, i) => `<tr>
      <td><input data-t="stock" data-i="${i}" data-k="nombre" value="${esc(p.nombre)}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="largo" value="${p.largo}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="ancho" value="${p.ancho}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="espesor" value="${p.espesor}"></td>
      <td><input type="number" step="1" min="0" data-t="stock" data-i="${i}" data-k="precio" value="${p.precio || 0}"></td>
      <td><button class="danger" data-del="stock" data-i="${i}" title="Eliminar esta tabla">🗑</button></td></tr>`).join('');
  }

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.t) {
      const v = t.dataset.k === 'nombre' ? t.value : parseFloat(t.value) || 0;
      estado[t.dataset.t][+t.dataset.i][t.dataset.k] = v;
      guardar();
    } else if (t.dataset && t.dataset.campo) { pintarVista(); guardar(); }
    else if (t.id === 'kerf') { estado.kerf = parseFloat(t.value) || 0; guardar(); }
    else if (t.id === 'rotar') { estado.rotar = t.checked; guardar(); }
    else if (t.id === 'unir') { estado.unir = t.checked; guardar(); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.del) { estado[b.dataset.del].splice(+b.dataset.i, 1); guardar(); b.dataset.del === 'piezas' ? pintarPiezas() : pintarStock(); }
  });
  $('plantilla').addEventListener('change', e => { estado.plantilla = e.target.value; pintarPlantilla(); guardar(); });
  $('btn-generar').addEventListener('click', () => {
    const v = leerValores();
    const nuevas = PLANTILLAS[estado.plantilla].piezas(v);
    if (estado.piezas.length && !confirm('Esto reemplaza las piezas adicionales actuales (las del diseño no cambian). ¿Continuar?')) return;
    estado.piezas = nuevas; guardar(); pintarPiezas();
  });
  $('btn-add-pieza').addEventListener('click', () => {
    estado.piezas.push({ nombre: 'Pieza', largo: 50, ancho: 10, espesor: 2.5, cant: 1 }); guardar(); pintarPiezas();
  });
  $('p-todas').addEventListener('change', e => {
    document.querySelectorAll('[data-selp]').forEach(c => c.checked = e.target.checked);
  });
  $('btn-borrar-sel').addEventListener('click', () => {
    const idx = [...document.querySelectorAll('[data-selp]')].filter(c => c.checked).map(c => +c.dataset.selp);
    if (!idx.length) { alert('Marcá primero las piezas que querés borrar (casilla a la izquierda).'); return; }
    if (!confirm(`¿Borrar ${idx.length} pieza(s)?`)) return;
    estado.piezas = estado.piezas.filter((_, i) => !idx.includes(i)); guardar(); pintarPiezas();
  });
  $('btn-limpiar-piezas').addEventListener('click', () => {
    if (confirm('¿Borrar todas las piezas?')) { estado.piezas = []; guardar(); pintarPiezas(); }
  });
  $('btn-add-stock').addEventListener('click', () => {
    estado.stock.push({ nombre: 'Tabla nueva', largo: 240, ancho: 20, espesor: 2.5, precio: 0 }); guardar(); pintarStock();
  });
  $('btn-imprimir').addEventListener('click', () => window.print());

  $('btn-export').addEventListener('click', () => {
    sincronizar();
    const blob = new Blob([JSON.stringify(Object.assign({}, estado, { diseno: undefined, piezas: undefined }), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mueble-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
  });
  $('btn-import').addEventListener('click', () => $('file-import').click());
  $('file-import').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if ((!Array.isArray(d.piezas) && !Array.isArray(d.muebles)) || !Array.isArray(d.stock)) throw 0;
        if (!confirm('Esto reemplaza el proyecto actual. ¿Continuar?')) return;
        estado = migrar(Object.assign(porDefecto(), d)); guardar(); iniciar();
      } catch (err) { alert('Archivo no válido.'); }
    };
    rd.readAsText(f);
  });

  $('btn-calcular').addEventListener('click', () => {
    if (!incluidos().length) { alert('Marcá con ✔ al menos una pestaña (mueble) para incluir en el cálculo.'); return; }
    const plan = calcularPlan(todasLasPiezas(), estado.stock, estado.kerf, estado.rotar, estado.unir);
    pintarResultado(plan);
  });

  function pintarResultado(plan) {
    $('resultado').hidden = false;
    const multi = incluidos().length > 1;
    const nomM = i => estado.muebles[i] ? estado.muebles[i].nombre : '';
    const hayPrecio = plan.costoTotal > 0;
    $('resumen').innerHTML = `<div class="kpis">
      <div class="kpi"><b>${plan.totalTablas}</b><span>tablas en total a comprar</span></div>
      ${plan.grupos.map(g => `<div class="kpi"><b>${g.n}</b><span>${esc(g.stock.nombre)}<br>${g.stock.largo}×${g.stock.ancho}×${g.stock.espesor} cm · desperdicio ${Math.round(g.desperdicio * 100)}%</span></div>`).join('')}
      ${hayPrecio ? `<div class="kpi"><b>${fmt(plan.costoTotal)}</b><span>costo estimado</span></div>` : ''}
    </div>`;
    const noInc = estado.muebles.filter(m => m.incluir === false).map(m => m.nombre);
    $('incluidos-res').innerHTML = estado.muebles.length > 1
      ? `<p class="hint">Calculado con: <b>${incluidos().map(i => esc(estado.muebles[i].nombre)).join(', ')}</b>${noInc.length ? ` · No incluidos: ${noInc.map(esc).join(', ')}` : ''}</p>` : '';
    $('notas-print').textContent = estado.notas ? '📝 ' + estado.notas : '';
    $('avisos').innerHTML = plan.errores.map(m => `<div class="aviso">⚠️ ${esc(m)}</div>`).join('') +
      plan.grupos.filter(g => g.tiras).map(g => `<div class="aviso nota">ℹ️ En ${g.espesor} cm, ${g.tiras} tiras se deben unir con cola para armar piezas más anchas que la tabla (las tiras ya incluyen su corte).</div>`).join('');

    $('lista-cortes').innerHTML = plan.grupos.map(g => {
      const filas = new Map();
      g.tablas.forEach((t, ti) => t.piezas.forEach(p => {
        const k = `${p.m}|${p.nombre}|${p.w}|${p.h}`;
        if (!filas.has(k)) filas.set(k, { nombre: p.nombre, m: p.m, w: p.w, h: p.h, cant: 0, tablas: new Set() });
        const f = filas.get(k); f.cant++; f.tablas.add(ti + 1);
      }));
      return `<div class="grupo"><b>Espesor ${g.espesor} cm — ${esc(g.stock.nombre)}</b>
      <table class="cortes"><thead><tr><th>Pieza</th>${multi ? '<th>Mueble</th>' : ''}<th>Largo</th><th>Ancho</th><th>Cant.</th><th>En tabla #</th></tr></thead><tbody>
      ${[...filas.values()].map(f => `<tr><td><i class="sw" style="background:${colorDe(f.nombre)}"></i>${esc(f.nombre)}</td>${multi ? `<td>${esc(nomM(f.m))}</td>` : ''}<td>${num(f.w)}</td><td>${num(f.h)}</td><td>${f.cant}</td><td>${[...f.tablas].join(', ')}</td></tr>`).join('')}
      </tbody></table></div>`;
    }).join('');

    const mats = todosLosMateriales();
    if (mats.length) $('lista-cortes').innerHTML += `<div class="grupo"><b>Otros materiales (no se cortan de tabla)</b><ul>${mats.map(m => `<li>${m.cant} × ${esc(m.nombre)}${multi ? ' (' + esc(m.mueble) + ')' : ''}: ${num(m.largo)} cm de largo, Ø ${num(m.diametro)} cm</li>`).join('')}</ul></div>`;
    const nombresRes = [];
    plan.grupos.forEach(g => g.tablas.forEach(t => t.piezas.forEach(p => nombresRes.push(p.nombre))));
    $('leyenda-res').innerHTML = leyendaHTML(nombresRes);
    let extra = '';
    if (multi) {
      extra += `<p class="hint"><b>Muebles:</b> ${incluidos().map(i => `<b>M${i + 1}</b> = ${esc(estado.muebles[i].nombre)}`).join(' · ')}</p>`;
      if (!plan.errores.length) {
        const separado = incluidos().reduce((t, i) => t + calcularPlan(piezasDeMueble(i), estado.stock, estado.kerf, estado.rotar, estado.unir).totalTablas, 0);
        const ahorro = separado - plan.totalTablas;
        extra += ahorro > 0
          ? `<div class="aviso nota">♻ Cortando todos los muebles juntos y aprovechando los sobrantes comprás <b>${plan.totalTablas}</b> tablas en vez de ${separado} (cada mueble por separado). ¡Ahorrás ${ahorro}!</div>`
          : `<div class="aviso nota">ℹ Cortando por separado necesitarías ${separado} tablas; juntos ${plan.totalTablas}.</div>`;
      }
      extra += '<p class="hint">Los recuadros rojos punteados son sobrantes (retazos) que aún podés aprovechar.</p>';
    } else extra = '<p class="hint">Los recuadros rojos punteados son sobrantes (retazos) que aún podés aprovechar.</p>';
    $('leyenda-res').innerHTML += extra;
    $('esquemas').innerHTML = plan.grupos.map(g => g.tablas.map((t, ti) => {
      const W = g.stock.largo, H = g.stock.ancho, sc = 800 / W, fs = Math.max(Math.min(H * sc * 0.28, 14), 7);
      const rects = t.piezas.map(p => `<g><rect x="${p.x * sc}" y="${p.y * sc}" width="${p.w * sc}" height="${p.h * sc}" fill="${colorDe(p.nombre)}" stroke="#333" stroke-width="1"/>
        <text x="${(p.x + p.w / 2) * sc}" y="${(p.y + p.h / 2) * sc}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${multi ? `<tspan font-weight="bold">M${p.m + 1}</tspan> ` : ''}${esc(p.nombre)} ${num(p.w)}×${num(p.h)}</text></g>`).join('');
      const retazos = retazosDe(t, W, H, estado.kerf, 5).map(z => `<g><rect x="${z.x * sc}" y="${z.y * sc}" width="${z.w * sc}" height="${z.h * sc}" fill="none" stroke="#c33" stroke-width="1.5" stroke-dasharray="6 4"/>
        <text x="${(z.x + z.w / 2) * sc}" y="${(z.y + z.h / 2) * sc}" font-size="${fs * 0.9}" fill="#c33" text-anchor="middle" dominant-baseline="middle">sobra ${num(z.w)}×${num(z.h)}</text></g>`).join('');
      return `<div class="tabla-sch"><small>Tabla #${ti + 1} · ${esc(g.stock.nombre)} (${W}×${H}×${g.stock.espesor} cm)${t.piezas.some(p => p.rot) ? ' · incluye piezas giradas' : ''}</small>
      <svg viewBox="0 0 800 ${H * sc}">${rects}${retazos}</svg></div>`;
    }).join('')).join('');
    $('resultado').scrollIntoView({ behavior: 'smooth' });
  }


  /* ---- Muebles ---- */
  function pintarTabs() {
    $('m-tabs').innerHTML = estado.muebles.map((m, i) => `<span class="tabw${m.incluir === false ? ' off' : ''}"><input type="checkbox" data-inc="${i}" title="Incluir en el cálculo de tablas"${m.incluir !== false ? ' checked' : ''}><button class="tab${i === estado.activo ? ' act' : ''}" data-mi="${i}">${esc(m.nombre)}</button></span>`).join('');
  }
  function pintarMuebles() {
    pintarTabs();
    $('m-nombre').value = estado.muebles[estado.activo].nombre;
    $('m-del').disabled = estado.muebles.length < 2;
    $('m-total').textContent = textoTotal();
  }
  function irAMueble(i) {
    sincronizar();
    estado.activo = i;
    estado.diseno = estado.muebles[i].diseno; estado.piezas = estado.muebles[i].piezas;
    selId = null; guardar(); iniciar();
  }
  $('m-tabs').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (b) irAMueble(+b.dataset.mi);
  });
  $('m-tabs').addEventListener('change', ev => {
    const c = ev.target.closest('input[data-inc]'); if (!c) return;
    estado.muebles[+c.dataset.inc].incluir = c.checked; guardar(); pintarTabs(); $('m-total').textContent = textoTotal();
  });
  $('m-nombre').addEventListener('input', ev => {
    estado.muebles[estado.activo].nombre = ev.target.value || ('Mueble ' + (estado.activo + 1)); guardar(); pintarTabs();
  });
  $('m-add').addEventListener('click', () => {
    sincronizar();
    estado.muebles.push({ nombre: 'Mueble ' + (estado.muebles.length + 1), diseno: nuevoDiseno(), piezas: [] });
    irAMueble(estado.muebles.length - 1);
  });
  $('m-dup').addEventListener('click', () => {
    sincronizar();
    const o = estado.muebles[estado.activo], c = JSON.parse(JSON.stringify(o));
    c.nombre = o.nombre + ' (opción 2)';
    c.incluir = true;
    c.diseno.el.forEach(e => e.id = Date.now() + Math.random());
    estado.muebles.push(c);
    irAMueble(estado.muebles.length - 1);
  });
  $('m-del').addEventListener('click', () => {
    if (estado.muebles.length < 2) return;
    if (!confirm(`¿Eliminar "${estado.muebles[estado.activo].nombre}" con todo su diseño?`)) return;
    estado.muebles.splice(estado.activo, 1);
    estado.activo = Math.min(estado.activo, estado.muebles.length - 1);
    irAMueble(estado.activo);
  });

  /* ---- Notas ---- */
  $('notas').addEventListener('input', e => { estado.notas = e.target.value; guardar(); });

  /* ---- Diseñador ---- */
  const NS = 'http://www.w3.org/2000/svg';
  let selId = null, arrastre = null;
  function dis() { if (!estado.diseno) estado.diseno = { ancho: 80, alto: 180, prof: 30, esp: 2, el: [] }; if (!estado.diseno.prof) estado.diseno.prof = 30; if (!estado.diseno.esp) estado.diseno.esp = 2; return estado.diseno; }
  function rectDe(e) { return e.orient === 'V' ? { w: e.esp, h: e.largo } : { w: e.largo, h: e.esp }; }

  function pintarCanvas() {
    const d = dis(), cv = $('d-canvas'), pad = Math.max(d.ancho, d.alto) * 0.05 + 2;
    cv.setAttribute('viewBox', `${-pad} ${-pad} ${d.ancho + 2 * pad} ${d.alto + 2 * pad}`);
    const fs = Math.max(d.ancho, d.alto) / 45;
    let g = `<rect x="0" y="0" width="${d.ancho}" height="${d.alto}" fill="#fff" stroke="#999" stroke-dasharray="2 2" stroke-width=".3"/>`;
    for (let x = 10; x < d.ancho; x += 10) g += `<line x1="${x}" y1="0" x2="${x}" y2="${d.alto}" stroke="#eee" stroke-width=".2"/>`;
    for (let y = 10; y < d.alto; y += 10) g += `<line x1="0" y1="${y}" x2="${d.ancho}" y2="${y}" stroke="#eee" stroke-width=".2"/>`;
    g += `<text x="${d.ancho / 2}" y="${d.alto + pad - 1}" font-size="${fs}" text-anchor="middle">${d.ancho} cm · fondo ${d.prof} cm</text>`;
    g += `<text transform="translate(${-pad + fs},${d.alto / 2}) rotate(-90)" font-size="${fs}" text-anchor="middle">${d.alto} cm</text>`;
    d.el.forEach(e => {
      const q = rectDe(e);
      g += `<rect class="el${e.id === selId ? ' sel' : ''}${e.tubo ? ' tubo' : ''}" ${e.tubo ? `rx="${q.h / 2}"` : ''} data-id="${e.id}" style="fill:${colorDe(e.nombre)}" x="${e.x}" y="${e.y}" width="${q.w}" height="${q.h}"/>`;
      const medidas = e.tubo ? `${num(e.largo)} cm · Ø${num(e.esp)}` : `${num(e.largo)}×${num(e.prof)}×${num(e.esp)}`;
      const largoVisible = Math.max(q.w, q.h), fz = fs * 0.8, anchoCh = fz * 0.55;
      let txt = `${e.nombre} ${medidas}`;
      if (txt.length * anchoCh > largoVisible * 0.95) txt = medidas;
      if (txt.length * anchoCh <= largoVisible * 0.98) {
        const cx = e.x + q.w / 2, cy = e.y + q.h / 2, vert = q.h > q.w;
        const attrs = `font-size="${fz}" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="${fz * 0.22}" paint-order="stroke" stroke-linejoin="round"`;
        g += vert
          ? `<text transform="translate(${cx},${cy}) rotate(-90)" ${attrs}>${esc(txt)}</text>`
          : `<text x="${cx}" y="${cy}" ${attrs}>${esc(txt)}</text>`;
      }
    });
    cv.innerHTML = g;
    pintarResumenDiseno();
  }
  function piezasDeMueble(i) {
    sincronizar();
    const mu = estado.muebles[i];
    return piezasDesdeDiseno(mu.diseno.el).concat(mu.piezas).map(p => Object.assign({}, p, { m: i }));
  }
  function incluidos() { return estado.muebles.map((m, i) => i).filter(i => estado.muebles[i].incluir !== false); }
  function todasLasPiezas() { return incluidos().flatMap(i => piezasDeMueble(i)); }
  function textoTotal() {
    const inc = incluidos(), act = estado.muebles[estado.activo];
    const tot = todasLasPiezas().reduce((t, p) => t + p.cant, 0);
    if (estado.muebles.length < 2) return 'Si agregás otro mueble, sus piezas se cortan junto con las de este y se aprovechan los pedazos que sobran. También sirve para guardar otra opción de diseño.';
    let t = `Marcá con ✔ las pestañas que querés incluir en el cálculo de tablas. Ahora: ${inc.length} de ${estado.muebles.length} (${tot} piezas en total).`;
    if (act.incluir === false) t += ` ⚠ “${act.nombre}” NO está incluido en el cálculo.`;
    return t;
  }
  function todosLosMateriales() {
    sincronizar();
    return estado.muebles.flatMap((mu, i) => mu.incluir === false ? [] : materialesDesdeDiseno(mu.diseno.el).map(x => Object.assign({}, x, { mueble: mu.nombre })));
  }
  function pintarLeyenda() {
    const nombres = dis().el.map(e => e.nombre);
    $('d-leyenda').innerHTML = nombres.length ? leyendaHTML(nombres) : '';
  }
  function pintarAuto() {
    pintarLeyenda();
    const ps = piezasDesdeDiseno(dis().el), mats = materialesDesdeDiseno(dis().el);
    const total = ps.reduce((t, p) => t + p.cant, 0);
    $('piezas-auto').innerHTML = ps.length
      ? `<b>Del diseño: ${total} piezas</b><div class="table-wrap"><table class="cortes"><thead><tr><th>Pieza</th><th>Largo</th><th>Ancho</th><th>Espesor</th><th>Cant.</th></tr></thead><tbody>${
        ps.map(p => `<tr><td><i class="sw" style="background:${colorDe(p.nombre)}"></i>${esc(p.nombre)}</td><td>${num(p.largo)}</td><td>${num(p.ancho)}</td><td>${num(p.espesor)}</td><td><b>${p.cant}</b></td></tr>`).join('')
      }</tbody></table></div>` + (mats.length ? `<p class="hint">Aparte (no es madera): ${mats.map(m => `${m.cant} × ${esc(m.nombre)} de ${num(m.largo)} cm`).join(', ')}</p>` : '')
      : '<p class="hint">Todavía no hay piezas: agregá techo, piso, costados, repisas, etc. en el Diseñador (arriba) y aparecerán aquí solas.</p>';
  }
  function pintarResumenDiseno() {
    pintarAuto();
    $('m-total').textContent = textoTotal();
    const d = dis(), ps = piezasDesdeDiseno(d.el);
    $('d-resumen').innerHTML = d.el.length
      ? `<b>Mueble ${d.ancho} × ${d.alto} × ${d.prof} cm (ancho × alto × fondo) — ${ps.reduce((t, p) => t + p.cant, 0)} piezas de madera:</b> ` + ps.map(p => `${p.cant} × ${esc(p.nombre)} (${num(p.largo)}×${num(p.ancho)}×${num(p.espesor)})`).join(' · ')
        + (materialesDesdeDiseno(d.el).length ? '<br><b>Otros materiales:</b> ' + materialesDesdeDiseno(d.el).map(m => `${m.cant} × ${esc(m.nombre)} de ${num(m.largo)} cm (Ø ${num(m.diametro)} cm)`).join(' · ') : '')
      : 'Todavía no hay tablas en el diseño.';
  }
  function pintarTablaDiseno() {
    $('d-tabla').tBodies[0].innerHTML = dis().el.map((e, i) => `<tr${e.id === selId ? ' style="background:#fbeede"' : ''}>
      <td><input data-d="${i}" data-k="nombre" value="${esc(e.nombre)}"></td>
      <td><select data-d="${i}" data-k="orient"><option value="H"${e.orient === 'H' ? ' selected' : ''}>Horizontal</option><option value="V"${e.orient === 'V' ? ' selected' : ''}>Vertical</option></select></td>
      ${['largo', 'esp', 'prof', 'x', 'y'].map(k => `<td><input type="number" step="0.5" min="0" data-d="${i}" data-k="${k}" value="${e[k]}"></td>`).join('')}
      <td><button data-dup="${i}" title="Duplicar">⧉</button><button class="danger" data-deld="${i}" title="Eliminar esta tabla">🗑</button></td></tr>`).join('');
  }
  function nuevoEl(tipo) {
    const d = dis(), e = d.esp, n = d.el.filter(x => x.tipo === tipo).length;
    const base = { id: Date.now() + Math.random(), tipo, esp: e, prof: d.prof };
    const interior = Math.max(1, r(d.ancho - 2 * e));
    const defs = {
      techo:    { nombre: 'Techo / superior', orient: 'H', largo: d.ancho, x: 0, y: 0 },
      piso:     { nombre: 'Piso / inferior', orient: 'H', largo: d.ancho, x: 0, y: d.alto - e },
      costado:  { nombre: 'Costado', orient: 'V', largo: d.alto, x: n % 2 === 0 ? 0 : d.ancho - e, y: 0 },
      division: { nombre: 'División', orient: 'V', largo: Math.max(1, r(d.alto - 2 * e)), x: r(d.ancho / 2 - e / 2), y: e },
      repisa:   { nombre: 'Repisa', orient: 'H', largo: interior, x: e, y: Math.min(d.alto - 2 * e, r(d.alto * (n + 1) / 5)) },
      tubo:     { nombre: 'Tubo para ropa', orient: 'H', largo: interior, x: e, y: 12, esp: 3, prof: 0, tubo: true },
      h:        { nombre: 'Tabla horizontal', orient: 'H', largo: d.ancho, x: 0, y: Math.min(d.alto - e, d.el.length * 10) },
      v:        { nombre: 'Tabla vertical', orient: 'V', largo: d.alto, x: 0, y: 0 },
    };
    const el = Object.assign(base, defs[tipo]);
    clampEl(el);
    selId = el.id; d.el.push(el); guardar(); pintarTablaDiseno(); pintarCanvas();
  }
  function clampEl(e) {
    const d = dis(), q = rectDe(e);
    e.x = Math.max(0, Math.min(d.ancho - q.w, e.x));
    e.y = Math.max(0, Math.min(d.alto - q.h, e.y));
  }
  $('d-botones').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    nuevoEl(b.dataset.tipo || (b.id === 'd-add-h' ? 'h' : 'v'));
  });
  $('d-esp').addEventListener('input', ev => { dis().esp = Math.max(0.5, parseFloat(ev.target.value) || 0.5); guardar(); });
  $('d-ancho').addEventListener('input', e => { dis().ancho = Math.max(10, parseFloat(e.target.value) || 10); guardar(); pintarCanvas(); });
  $('d-alto').addEventListener('input', e => { dis().alto = Math.max(10, parseFloat(e.target.value) || 10); guardar(); pintarCanvas(); });
  $('d-prof').addEventListener('change', e => {
    const d = dis(); d.prof = Math.max(1, parseFloat(e.target.value) || 1); e.target.value = d.prof;
    const tablas = d.el.filter(x => !x.tubo);
    if (tablas.length && tablas.some(x => x.prof !== d.prof)) {
      if (confirm(`¿Poner la profundidad ${d.prof} cm en las ${tablas.length} tablas del diseño?`)) tablas.forEach(x => x.prof = d.prof);
    }
    guardar(); pintarTablaDiseno(); pintarCanvas();
  });
  $('d-prof').addEventListener('input', e => { dis().prof = Math.max(1, parseFloat(e.target.value) || 1); guardar(); });
  $('d-aplicar-prof').addEventListener('click', () => {
    const d = dis(), tablas = d.el.filter(x => !x.tubo);
    if (!tablas.length) { alert('Todavía no hay tablas en el diseño.'); return; }
    tablas.forEach(x => x.prof = d.prof); guardar(); pintarTablaDiseno(); pintarCanvas();
    alert(`Listo: profundidad ${d.prof} cm aplicada a ${tablas.length} tablas.`);
  });
  function borrarSelDiseno() {
    const d = dis(), i = d.el.findIndex(x => x.id === selId);
    if (i < 0) { alert('Tocá primero una tabla en el dibujo (o en la lista) para seleccionarla.'); return; }
    d.el.splice(i, 1); selId = null; guardar(); pintarTablaDiseno(); pintarCanvas();
  }
  $('d-borrar-sel').addEventListener('click', borrarSelDiseno);
  document.addEventListener('keydown', ev => {
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selId && !/INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) borrarSelDiseno();
  });
  $('d-limpiar').addEventListener('click', () => {
    if (confirm('¿Borrar todo el diseño?')) { dis().el = []; selId = null; guardar(); pintarTablaDiseno(); pintarCanvas(); }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.d !== undefined) {
      const el = dis().el[+t.dataset.d], k = t.dataset.k;
      el[k] = (k === 'nombre' || k === 'orient') ? t.value : parseFloat(t.value) || 0;
      if (k !== 'nombre') clampEl(el);
      guardar(); pintarCanvas();
    }
  });
  document.addEventListener('focusin', e => {
    const t = e.target;
    if (t.dataset && t.dataset.d !== undefined) {
      const el = dis().el[+t.dataset.d];
      if (el && el.id !== selId) { selId = el.id; pintarCanvas(); }
    }
  });
  document.addEventListener('change', e => {
    if (e.target.dataset && e.target.dataset.d !== undefined) pintarTablaDiseno();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.deld !== undefined) { dis().el.splice(+b.dataset.deld, 1); guardar(); pintarTablaDiseno(); pintarCanvas(); }
    if (b.dataset.dup !== undefined) {
      const o = dis().el[+b.dataset.dup], c = { ...o, id: Date.now() + Math.random(), x: o.x + 3, y: o.y + 3 };
      clampEl(c); dis().el.push(c); selId = c.id; guardar(); pintarTablaDiseno(); pintarCanvas();
    }
  });
  function ptSvg(ev) {
    const cv = $('d-canvas'), pt = cv.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(cv.getScreenCTM().inverse());
  }
  $('d-canvas').addEventListener('pointerdown', ev => {
    const r0 = ev.target.closest('rect.el');
    if (!r0) { selId = null; pintarCanvas(); pintarTablaDiseno(); return; }
    const id = +r0.dataset.id, el = dis().el.find(x => x.id === id);
    selId = id;
    const p = ptSvg(ev);
    arrastre = { el, dx: p.x - el.x, dy: p.y - el.y };
    $('d-canvas').setPointerCapture(ev.pointerId);
    pintarCanvas(); pintarTablaDiseno();
  });
  $('d-canvas').addEventListener('pointermove', ev => {
    if (!arrastre) return;
    const p = ptSvg(ev), e = arrastre.el;
    e.x = Math.round((p.x - arrastre.dx) * 2) / 2;
    e.y = Math.round((p.y - arrastre.dy) * 2) / 2;
    clampEl(e); pintarCanvas();
  });
  const finArrastre = () => { if (arrastre) { arrastre = null; guardar(); pintarTablaDiseno(); } };
  $('d-canvas').addEventListener('pointerup', finArrastre);
  $('d-canvas').addEventListener('pointercancel', finArrastre);

  function iniciar() {
    pintarMuebles();
    $('notas').value = estado.notas || '';
    $('d-ancho').value = dis().ancho; $('d-alto').value = dis().alto; $('d-prof').value = dis().prof; $('d-esp').value = dis().esp;
    pintarTablaDiseno(); pintarCanvas();
    $('kerf').value = estado.kerf;
    $('rotar').checked = !!estado.rotar;
    $('unir').checked = estado.unir !== false;
    pintarPlantilla(); pintarPiezas(); pintarStock();
  }
  iniciar();
}

if (typeof module !== 'undefined') module.exports = { retazosDe, colorDe, calcularPlan, PLANTILLAS, piezasDesdeDiseno, materialesDesdeDiseno };
