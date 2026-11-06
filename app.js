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
  bin.piezas.push({ nombre: p.nombre, x: f.x, y: f.y, w: m.w, h: m.h, rot: m.rot });
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
    for (let i = 1; i <= n; i++) out.push({ nombre: `${p.nombre} (tira ${i}/${n})`, w: p.w, h, tira: true });
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
      porEspesor.get(k).push({ nombre: p.nombre || 'Pieza', w: +p.largo, h: +p.ancho });
    }
  }
  for (const [esp, lista] of porEspesor) {
    const opciones = stock.filter(s => Math.abs(+s.espesor - esp) < EPS && s.largo > 0 && s.ancho > 0);
    if (!opciones.length) {
      errores.push(`No hay tablas de ${esp} cm de espesor para las piezas de ese grosor.`);
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
};

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
      piezas: PLANTILLAS.mesa.piezas(valoresIniciales('mesa')),
      stock: [
        { nombre: 'Tabla 2.5×20×300', largo: 300, ancho: 20, espesor: 2.5, precio: 0 },
        { nombre: 'Tabla 3×30×300', largo: 300, ancho: 30, espesor: 3, precio: 0 },
        { nombre: 'Tabla 7×7×300', largo: 300, ancho: 7, espesor: 7, precio: 0 },
      ],
      kerf: 0.3, rotar: false, unir: true,
    };
  }
  function valoresIniciales(k) {
    const o = {};
    PLANTILLAS[k].campos.forEach(c => o[c[0]] = c[2]);
    return o;
  }
  function cargar() {
    try { const s = JSON.parse(localStorage.getItem(CLAVE)); if (s && s.piezas && s.stock) return s; } catch (e) {}
    return porDefecto();
  }
  function guardar() { localStorage.setItem(CLAVE, JSON.stringify(estado)); }
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
    $('plantilla-campos').innerHTML = t.campos.map(c =>
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
    $('tabla-piezas').tBodies[0].innerHTML = estado.piezas.map((p, i) => `<tr>
      <td><input data-t="piezas" data-i="${i}" data-k="nombre" value="${esc(p.nombre)}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="largo" value="${p.largo}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="ancho" value="${p.ancho}"></td>
      <td><input type="number" step="0.1" min="0" data-t="piezas" data-i="${i}" data-k="espesor" value="${p.espesor}"></td>
      <td><input type="number" step="1" min="1" data-t="piezas" data-i="${i}" data-k="cant" value="${p.cant}"></td>
      <td><button data-del="piezas" data-i="${i}" title="Eliminar">✖</button></td></tr>`).join('');
  }
  function pintarStock() {
    $('tabla-stock').tBodies[0].innerHTML = estado.stock.map((p, i) => `<tr>
      <td><input data-t="stock" data-i="${i}" data-k="nombre" value="${esc(p.nombre)}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="largo" value="${p.largo}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="ancho" value="${p.ancho}"></td>
      <td><input type="number" step="0.1" min="0" data-t="stock" data-i="${i}" data-k="espesor" value="${p.espesor}"></td>
      <td><input type="number" step="1" min="0" data-t="stock" data-i="${i}" data-k="precio" value="${p.precio || 0}"></td>
      <td><button data-del="stock" data-i="${i}" title="Eliminar">✖</button></td></tr>`).join('');
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
    if (estado.piezas.length && !confirm('Esto reemplaza la lista de piezas actual. ¿Continuar?')) return;
    estado.piezas = nuevas; guardar(); pintarPiezas();
  });
  $('btn-add-pieza').addEventListener('click', () => {
    estado.piezas.push({ nombre: 'Pieza', largo: 50, ancho: 10, espesor: 2.5, cant: 1 }); guardar(); pintarPiezas();
  });
  $('btn-limpiar-piezas').addEventListener('click', () => {
    if (confirm('¿Borrar todas las piezas?')) { estado.piezas = []; guardar(); pintarPiezas(); }
  });
  $('btn-add-stock').addEventListener('click', () => {
    estado.stock.push({ nombre: 'Tabla nueva', largo: 240, ancho: 20, espesor: 2.5, precio: 0 }); guardar(); pintarStock();
  });
  $('btn-imprimir').addEventListener('click', () => window.print());

  $('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });
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
        if (!Array.isArray(d.piezas) || !Array.isArray(d.stock)) throw 0;
        if (!confirm('Esto reemplaza el proyecto actual. ¿Continuar?')) return;
        estado = Object.assign(porDefecto(), d); guardar(); iniciar();
      } catch (err) { alert('Archivo no válido.'); }
    };
    rd.readAsText(f);
  });

  $('btn-calcular').addEventListener('click', () => {
    const plan = calcularPlan(estado.piezas, estado.stock, estado.kerf, estado.rotar, estado.unir);
    pintarResultado(plan);
  });

  function pintarResultado(plan) {
    $('resultado').hidden = false;
    const hayPrecio = plan.costoTotal > 0;
    $('resumen').innerHTML = `<div class="kpis">
      <div class="kpi"><b>${plan.totalTablas}</b><span>tablas en total a comprar</span></div>
      ${plan.grupos.map(g => `<div class="kpi"><b>${g.n}</b><span>${esc(g.stock.nombre)}<br>${g.stock.largo}×${g.stock.ancho}×${g.stock.espesor} cm · desperdicio ${Math.round(g.desperdicio * 100)}%</span></div>`).join('')}
      ${hayPrecio ? `<div class="kpi"><b>${fmt(plan.costoTotal)}</b><span>costo estimado</span></div>` : ''}
    </div>`;
    $('avisos').innerHTML = plan.errores.map(m => `<div class="aviso">⚠️ ${esc(m)}</div>`).join('') +
      plan.grupos.filter(g => g.tiras).map(g => `<div class="aviso nota">ℹ️ En ${g.espesor} cm, ${g.tiras} tiras se deben unir con cola para armar piezas más anchas que la tabla (las tiras ya incluyen su corte).</div>`).join('');

    $('lista-cortes').innerHTML = plan.grupos.map(g => {
      const filas = new Map();
      g.tablas.forEach((t, ti) => t.piezas.forEach(p => {
        const k = `${p.nombre}|${p.w}|${p.h}`;
        if (!filas.has(k)) filas.set(k, { nombre: p.nombre, w: p.w, h: p.h, cant: 0, tablas: new Set() });
        const f = filas.get(k); f.cant++; f.tablas.add(ti + 1);
      }));
      return `<div class="grupo"><b>Espesor ${g.espesor} cm — ${esc(g.stock.nombre)}</b>
      <table class="cortes"><thead><tr><th>Pieza</th><th>Largo</th><th>Ancho</th><th>Cant.</th><th>En tabla #</th></tr></thead><tbody>
      ${[...filas.values()].map(f => `<tr><td>${esc(f.nombre)}</td><td>${num(f.w)}</td><td>${num(f.h)}</td><td>${f.cant}</td><td>${[...f.tablas].join(', ')}</td></tr>`).join('')}
      </tbody></table></div>`;
    }).join('');

    $('esquemas').innerHTML = plan.grupos.map(g => g.tablas.map((t, ti) => {
      const W = g.stock.largo, H = g.stock.ancho, sc = 800 / W, fs = Math.max(Math.min(H * sc * 0.28, 14), 7);
      const rects = t.piezas.map(p => `<g><rect x="${p.x * sc}" y="${p.y * sc}" width="${p.w * sc}" height="${p.h * sc}" fill="#8fbf7a" stroke="#2f5d1f"/>
        <text x="${(p.x + p.w / 2) * sc}" y="${(p.y + p.h / 2) * sc}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">${esc(p.nombre)} ${num(p.w)}×${num(p.h)}</text></g>`).join('');
      return `<div class="tabla-sch"><small>Tabla #${ti + 1} · ${esc(g.stock.nombre)} (${W}×${H}×${g.stock.espesor} cm)${t.piezas.some(p => p.rot) ? ' · incluye piezas giradas' : ''}</small>
      <svg viewBox="0 0 800 ${H * sc}">${rects}</svg></div>`;
    }).join('')).join('');
    $('resultado').scrollIntoView({ behavior: 'smooth' });
  }

  function iniciar() {
    $('kerf').value = estado.kerf;
    $('rotar').checked = !!estado.rotar;
    $('unir').checked = estado.unir !== false;
    pintarPlantilla(); pintarPiezas(); pintarStock();
  }
  iniciar();
}

if (typeof module !== 'undefined') module.exports = { calcularPlan, PLANTILLAS };
