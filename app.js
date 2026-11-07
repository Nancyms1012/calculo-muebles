'use strict';
/* ====== LÓGICA (sin DOM, testeable) ====== */

const EPS = 1e-6;

// Empaca piezas (cada una {nombre,w,h}) en tablas W x H con cortes guillotina.
function empacar(piezas, W, H, kerf, rotar, orden, heur) {
  const lista = piezas.slice().sort(orden);
  const bins = [];
  for (const p of lista) {
    // Buscar el mejor hueco en CUALQUIER tabla ya abierta (así se rellenan sobrantes de tablas previas).
    let mejor = null;
    for (let b = 0; b < bins.length; b++) {
      const c = mejorEspacio(bins[b], b, p, kerf, rotar, heur);
      if (c && (!mejor || c.score < mejor.score - EPS)) mejor = c;
    }
    if (!mejor) {
      bins.push({ libres: [{ x: 0, y: 0, w: W + kerf, h: H + kerf }], piezas: [] });
      mejor = mejorEspacio(bins[bins.length - 1], bins.length - 1, p, kerf, rotar, heur);
      if (!mejor) return null;
    }
    colocar(bins[mejor.bin], mejor, p, kerf);
  }
  return bins;
}

// heur: cómo puntuar un hueco (menor = mejor). bss=lado corto, bls=lado largo, baf=área sobrante.
function mejorEspacio(bin, b, p, kerf, rotar, heur) {
  let mejor = null;
  const orient = [[p.w, p.h, false]];
  if (rotar && Math.abs(p.w - p.h) > EPS) orient.push([p.h, p.w, true]);
  bin.libres.forEach((f, idx) => {
    for (const [w, h, rot] of orient) {
      const pw = w + kerf, ph = h + kerf;
      if (pw <= f.w + EPS && ph <= f.h + EPS) {
        const dw = f.w - pw, dh = f.h - ph;
        let score;
        if (heur === 'bls') score = Math.max(dw, dh);
        else if (heur === 'baf') score = f.w * f.h - pw * ph;
        else score = Math.min(dw, dh); // 'bss'
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
  (a, b) => b.w * b.h - a.w * a.h,                 // área desc
  (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h), // lado largo desc
  (a, b) => b.h - a.h || b.w - a.w,                // alto desc
  (a, b) => b.w - a.w || b.h - a.h,                // largo desc
  (a, b) => (b.w + b.h) - (a.w + a.h),             // perímetro desc
  (a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h), // lado corto desc
];
const HEUR = ['bss', 'bls', 'baf'];

function optimizar(piezas, W, H, kerf, rotar) {
  // piezas: [{nombre,w,h}] ya expandidas. W = largo tabla, H = ancho tabla.
  const orientadas = piezas.map(p => ({ ...p }));
  let mejor = null;
  for (const orden of ORDENES) {
    for (const heur of HEUR) {
      const r = empacar(orientadas, W, H, kerf, rotar, orden, heur);
      if (!r) continue;
      const usada = r.reduce((s, b) => s + b.piezas.reduce((t, q) => t + q.w * q.h, 0), 0);
      const area = usada;
      // Preferir menos tablas; a igualdad, concentrar el desperdicio (menos área usada en la última tabla).
      const ult = r.length ? r[r.length - 1].piezas.reduce((t, q) => t + q.w * q.h, 0) : 0;
      const cand = { bins: r, area, n: r.length, ult };
      if (!mejor || cand.n < mejor.n - EPS || (Math.abs(cand.n - mejor.n) < EPS && cand.ult < mejor.ult - EPS)) mejor = cand;
    }
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
  tabla: {
    nombre: 'Tabla o estante',
    campos: [['largo', 'Largo', 100], ['ancho', 'Ancho (fondo)', 30], ['esp', 'Espesor', 1.8], ['cant', 'Cantidad', 1]],
    piezas: v => [{ nombre: 'Tabla o estante', largo: v.largo, ancho: v.ancho, espesor: v.esp, cant: Math.max(1, Math.round(v.cant) || 1) }],
    dibujo: v => dibujoTabla(v),
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

function dibujoTabla(v) {
  const W = 300, Hh = 200, pad = 30;
  const esc = Math.min((W - 2 * pad) / Math.max(v.largo, 1), (Hh - 2 * pad) / Math.max(v.ancho, 1));
  const w = v.largo * esc, h = v.ancho * esc, x0 = (W - w) / 2, y0 = (Hh - h) / 2 - 8;
  return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#66FFFF" stroke="#333"/>
  <text x="${W / 2}" y="${y0 + h / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12">${v.largo} × ${v.ancho} × ${v.esp} cm${(v.cant || 1) > 1 ? ' (x' + v.cant + ')' : ''}</text>
  <text x="${W / 2}" y="${y0 + h + 16}" text-anchor="middle" font-size="11">largo ${v.largo} cm</text>
  <text transform="translate(${x0 - 8},${y0 + h / 2}) rotate(-90)" text-anchor="middle" font-size="11">ancho ${v.ancho} cm</text>`;
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

/* ====== PLANO DE ARMADO ====== */
function fN(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
function escH(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Tablas verticales que un tubo atraviesa por el medio (el tubo pasa por un agujero en ellas).
function pasaPor(t, vs, A) {
  if (t.x < -0.05 || t.x2 > A + 0.05) return []; // fuera del mueble: no tiene sentido hablar de agujeros
  return vs.filter(v => v.x > t.x + 0.05 && v.x2 < t.x2 - 0.05 && Math.min(v.y2, t.y2) - Math.max(v.y, t.y) > 0.05);
}

// Convierte un diseño en medidas de armado. Coordenadas del diseño: x desde la izquierda, y desde ARRIBA.
function calcularPlano(d) {
  const A = +d.ancho, Hh = +d.alto;
  const el = d.el.map(e => {
    const horiz = e.orient !== 'V';
    const w = horiz ? +e.largo : +e.esp, h = horiz ? +e.esp : +e.largo;
    return Object.assign({}, e, { w, h, x2: e.x + w, y2: e.y + h });
  });
  const hs = el.filter(e => e.orient !== 'V' && !e.tubo).sort((a, b) => a.y - b.y || a.x - b.x);
  const vs = el.filter(e => e.orient === 'V').sort((a, b) => a.x - b.x || a.y - b.y);
  const ts = el.filter(e => e.tubo).sort((a, b) => a.y - b.y);
  const orden = hs.concat(vs, ts);
  orden.forEach((e, i) => { e.n = i + 1; });

  // Espacio libre (alto) entre una tabla horizontal y la siguiente que tiene debajo
  const luces = [];
  for (const a of hs) {
    let sig = null;
    for (const b of hs) {
      if (b === a || b.y < a.y2 - 0.01) continue;
      if (Math.min(a.x2, b.x2) - Math.max(a.x, b.x) <= 0.01) continue;
      if (!sig || b.y < sig.y) sig = b;
    }
    if (sig && sig.y - a.y2 > 0.05) luces.push({ y1: a.y2, y2: sig.y, luz: r(sig.y - a.y2), de: a, a: sig });
  }
  // Espacio libre (ancho) entre tablas verticales
  const anchosLibres = [];
  for (let i = 0; i < vs.length - 1; i++) {
    const a = vs[i], b = vs[i + 1];
    if (Math.min(a.y2, b.y2) - Math.max(a.y, b.y) > 0.01 && b.x - a.x2 > 0.05)
      anchosLibres.push({ luz: r(b.x - a.x2), de: a, a: b });
  }
  // Piezas que se superponen (no calzarían al armar)
  const choques = [];
  const duras = el.filter(e => !e.tubo);
  for (let i = 0; i < duras.length; i++) for (let j = i + 1; j < duras.length; j++) {
    const a = duras[i], b = duras[j];
    const ox = Math.min(a.x2, b.x2) - Math.max(a.x, b.x), oy = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
    if (ox > 0.05 && oy > 0.05) choques.push({ a, b, ox: r(ox), oy: r(oy) });
  }

  const idsChoque = new Set();
  choques.forEach(c => { idsChoque.add(c.a.n); idsChoque.add(c.b.n); });

  const filas = orden.map(e => {
    let medidas, pos;
    if (e.tubo) {
      const cy = e.y + e.h / 2;
      medidas = `${fN(e.largo)} cm de largo · Ø ${fN(e.esp)}`;
      pos = `Centro del tubo a ${fN(Hh - cy)} cm del piso. Desde la izquierda: ${fN(e.x)} cm (hasta ${fN(e.x2)} cm).`;
      pasaPor(e, vs, A).forEach(v => {
        pos += ` Atraviesa ${v.n}. ${v.nombre}: hacerle un agujero de Ø ${fN(e.esp)} cm (un poco más grande para que pase), con el centro a ${fN(Hh - cy)} cm del piso (${fN(cy - v.y)} cm desde el borde superior de esa pieza).`;
      });
    } else if (e.orient === 'V') {
      medidas = `${fN(e.largo)} × ${fN(e.prof)} × ${fN(e.esp)}`;
      pos = `Borde izquierdo a ${fN(e.x)} cm del lado izquierdo (borde derecho a ${fN(e.x2)} cm; ${fN(A - e.x2)} cm del lado derecho). Va desde ${fN(Hh - e.y2)} hasta ${fN(Hh - e.y)} cm de altura.`;
    } else {
      medidas = `${fN(e.largo)} × ${fN(e.prof)} × ${fN(e.esp)}`;
      pos = `Cara superior a ${fN(Hh - e.y)} cm del piso (cara inferior a ${fN(Hh - e.y2)} cm). Desde la izquierda: ${fN(e.x)} cm (hasta ${fN(e.x2)} cm; ${fN(A - e.x2)} cm del lado derecho).`;
    }
    return { n: e.n, nombre: e.nombre, medidas, pos, tubo: !!e.tubo, choque: idsChoque.has(e.n) };
  });
  choques.forEach(c => { c.sugerencia = sugerirArreglo(c); });
  return { A, Hh, prof: +d.prof, el: orden, hs, vs, ts, luces, anchosLibres, choques, filas, idsChoque };
}

// Qué hacer para que dos piezas superpuestas calcen.
function sugerirArreglo(c) {
  const a = c.a, b = c.b;
  const h = a.orient !== 'V' ? a : (b.orient !== 'V' ? b : null);
  const v = a.orient === 'V' ? a : (b.orient === 'V' ? b : null);
  const nom = e => `${e.n}. ${e.nombre}`;
  if (h && v && h !== v) {
    if (v.x > h.x + 0.05 && v.x2 < h.x2 - 0.05) {
      const izq = r(v.x - h.x), der = r(h.x2 - v.x2);
      return `La pieza ${nom(h)} atraviesa a ${nom(v)}. Cortala en DOS piezas: una de ${fN(izq)} cm (a la izquierda) y otra de ${fN(der)} cm (a la derecha), o quitá una de las dos.`;
    }
    if (v.x <= h.x + 0.05) {
      return `La pieza ${nom(v)} choca con el extremo de ${nom(h)}. Acortá ${nom(h)} a ${fN(r(h.x2 - v.x2))} cm y empezala a ${fN(v.x2)} cm desde la izquierda.`;
    }
    return `La pieza ${nom(v)} choca con el extremo de ${nom(h)}. Acortá ${nom(h)} a ${fN(r(v.x - h.x))} cm.`;
  }
  if (h && !v) {
    const alto = Math.min(a.y2, b.y2) - Math.max(a.y, b.y);
    return `${nom(a)} y ${nom(b)} están en el mismo lugar (se montan ${fN(r(alto))} cm de alto). Mové una más arriba o más abajo, o borrá la que sobre.`;
  }
  return `${nom(a)} y ${nom(b)} se montan. Separalas o acortá una de las dos.`;
}

// Arreglo automático cuando una horizontal choca con el EXTREMO de una vertical (acortarla).
function fixExtremo(c) {
  const a = c.a, b = c.b, E = 0.05;
  const h = a.orient !== 'V' ? a : (b.orient !== 'V' ? b : null);
  const v = a.orient === 'V' ? a : (b.orient === 'V' ? b : null);
  if (!h || !v || h === v) return null;
  if (v.x > h.x + E && v.x2 < h.x2 - E) return null; // la atraviesa por el medio: hay que partirla
  if (v.x <= h.x + E) {
    const largo = r(h.x2 - v.x2);
    return largo > 0 ? { id: h.id, x: v.x2, largo } : null;
  }
  const largo = r(v.x - h.x);
  return largo > 0 ? { id: h.id, largo } : null;
}

// Dibujo SVG autónomo (estilos en línea, para poder exportarlo a PNG).
function svgPlano(pl, colorFn, titulo) {
  const { A, Hh, el, hs, vs, ts, luces } = pl;
  const s = Math.min(520 / A, 480 / Hh);
  const W = A * s, H = Hh * s;
  const carriles = [];
  luces.slice().sort((a, b) => a.y1 - b.y1).forEach(l => {
    let c = carriles.findIndex(fin => fin <= l.y1 + 0.01);
    if (c < 0) { c = carriles.length; carriles.push(0); }
    carriles[c] = l.y2; l.carril = c;
  });
  const ML = 110, MT = 76, MR = 40 + Math.max(1, carriles.length) * 18, MB = 78;
  const ox = ML, oy = MT, X = x => ox + x * s, Y = y => oy + y * s;
  const tw = Math.max(Math.round(ML + W + MR), 480), th = Math.round(MT + H + MB);
  const F = 'font-family="Arial, sans-serif"';
  let g = `<rect x="0" y="0" width="${tw}" height="${th}" fill="#fff"/>`;
  g += `<text x="12" y="20" font-size="14" font-weight="bold" ${F}>${escH(titulo)}</text>`;
  g += `<text x="12" y="36" font-size="10" fill="#555" ${F}>Medidas en cm. Alturas desde el piso hasta la cara superior de cada tabla.</text>`;

  // ancho total (arriba)
  const ya = oy - 14;
  g += `<line x1="${X(0)}" y1="${ya}" x2="${X(A)}" y2="${ya}" stroke="#222"/><line x1="${X(0)}" y1="${ya - 4}" x2="${X(0)}" y2="${ya + 4}" stroke="#222"/><line x1="${X(A)}" y1="${ya - 4}" x2="${X(A)}" y2="${ya + 4}" stroke="#222"/>`;
  g += `<text x="${X(A / 2)}" y="${ya - 7}" text-anchor="middle" font-size="11" font-weight="bold" ${F}>ancho ${fN(A)} cm · fondo ${fN(pl.prof)} cm</text>`;

  // recuadro del mueble
  g += `<rect x="${X(0)}" y="${Y(0)}" width="${W}" height="${H}" fill="#fff" stroke="#999" stroke-dasharray="4 3"/>`;

  // marcas de altura (izquierda)
  const marcas = [];
  hs.forEach(h => marcas.push({ y: h.y, t: fN(Hh - h.y) }));
  ts.forEach(t => { const cy = t.y + t.h / 2; marcas.push({ y: cy, t: 'Ø ' + fN(Hh - cy), tubo: true }); });
  marcas.sort((a, b) => a.y - b.y);
  const uniq = marcas.filter((m, i, arr) => i === 0 || !(Math.abs(m.y - arr[i - 1].y) < 0.01 && m.t === arr[i - 1].t));
  uniq.push({ y: Hh, t: 'piso = 0', piso: true });
  let ultimo = -1e9;
  uniq.forEach(m => { m.py = Y(m.y); m.ly = Math.max(m.py, ultimo + 13); ultimo = m.ly; });
  uniq.forEach(m => {
    if (!m.piso) g += `<line x1="${ox - 8}" y1="${m.py}" x2="${ox + W}" y2="${m.py}" stroke="${m.tubo ? '#4a6' : '#bbb'}" stroke-dasharray="2 3"/>`;
    g += `<line x1="${ox - 8}" y1="${m.py}" x2="${ox - 14}" y2="${m.ly}" stroke="#222"/>`;
    g += `<text x="${ox - 17}" y="${m.ly + 4}" text-anchor="end" font-size="11" font-weight="bold" ${m.tubo ? 'fill="#2a6a3a"' : ''} ${F}>${escH(m.t)}</text>`;
  });
  g += `<text transform="translate(14,${oy + H / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#555" ${F}>ALTURA DESDE EL PISO (cm)</text>`;
  g += `<line x1="${ox - 10}" y1="${Y(Hh)}" x2="${ox + W + 10}" y2="${Y(Hh)}" stroke="#222" stroke-width="2.5"/>`;

  // piezas
  el.forEach(e => {
    const px = X(e.x), py = Y(e.y), pw = e.w * s, ph = e.h * s;
    const mal = pl.idsChoque && pl.idsChoque.has(e.n);
    g += `<rect x="${px}" y="${py}" width="${pw}" height="${ph}" ${e.tubo ? `rx="${Math.min(pw, ph) / 2}"` : ''} fill="${colorFn(e.nombre)}" stroke="${mal ? '#e00000' : '#222'}" stroke-width="${mal ? 3 : 1}"/>`;
    const vert = ph > pw, largoPx = Math.max(pw, ph);
    const full = `${e.n}. ${e.nombre}`;
    const txt = full.length * 5.6 <= largoPx - 6 ? full : String(e.n);
    const attrs = `font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="middle" stroke="#fff" stroke-width="2.5" paint-order="stroke" ${F}`;
    const cx = px + pw / 2, cy = py + ph / 2;
    g += vert ? `<text transform="translate(${cx},${cy}) rotate(-90)" ${attrs}>${escH(txt)}</text>` : `<text x="${cx}" y="${cy}" ${attrs}>${escH(txt)}</text>`;
  });

  // zonas donde las piezas se superponen
  (pl.choques || []).forEach(c => {
    const x1 = Math.max(c.a.x, c.b.x), x2 = Math.min(c.a.x2, c.b.x2), y1 = Math.max(c.a.y, c.b.y), y2 = Math.min(c.a.y2, c.b.y2);
    const cx = X((x1 + x2) / 2), cy = Y((y1 + y2) / 2), rr = Math.max(7, Math.max((x2 - x1) * s, (y2 - y1) * s) / 2 + 4);
    g += `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="#e00000" stroke-width="2"/><text x="${cx + rr + 3}" y="${cy - rr}" font-size="16" font-weight="bold" fill="#e00000" ${F}>!</text>`;
  });

  // espacios libres verticales (derecha)
  luces.forEach(l => {
    const x = ox + W + 16 + l.carril * 18, y1 = Y(l.y1), y2 = Y(l.y2);
    g += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#b00"/><line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}" stroke="#b00"/><line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}" stroke="#b00"/>`;
    if (y2 - y1 >= 30) g += `<text transform="translate(${x - 4},${(y1 + y2) / 2}) rotate(-90)" text-anchor="middle" font-size="10" fill="#b00" ${F}>libre ${fN(l.luz)}</text>`;
  });

  // medidas horizontales (abajo)
  const yb = Y(Hh) + 28;
  const pts = [...new Set([0, r(A)].concat(vs.flatMap(v => [r(v.x), r(v.x2)])))].sort((a, b) => a - b);
  g += `<line x1="${X(0)}" y1="${yb}" x2="${X(A)}" y2="${yb}" stroke="#222"/>`;
  pts.forEach(p => { g += `<line x1="${X(p)}" y1="${yb - 4}" x2="${X(p)}" y2="${yb + 4}" stroke="#222"/>`; });
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = pts[i + 1] - pts[i];
    if (seg * s >= 26) g += `<text x="${X(pts[i] + seg / 2)}" y="${yb + 16}" text-anchor="middle" font-size="11" font-weight="bold" ${F}>${fN(seg)}</text>`;
  }
  g += `<text x="${X(A / 2)}" y="${yb + 32}" text-anchor="middle" font-size="10" fill="#555" ${F}>DISTANCIAS HORIZONTALES (cm), de izquierda a derecha</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tw} ${th}" data-w="${tw}" data-h="${th}" style="width:100%;max-width:${tw}px;height:auto;background:#fff;border:1px solid #ccc">${g}</svg>`;
}

/* ====== REVISIÓN DE MEDIDAS (¿calzan las piezas?) ====== */
// Revisa un diseño como se haría a mano: cada pieza contra sus vecinas.
// Devuelve {pl, problemas:[{nivel:'error'|'aviso', tipo, texto, piezas:[...], fix?}], okPiezas:[...]}
function revisarDiseno(d) {
  const pl = calcularPlano(d);
  const A = pl.A, Hh = pl.Hh, E = 0.05;
  const nom = e => `${e.n}. ${e.nombre}`;
  const probs = [];
  const notas = [];
  const invol = new Set();
  const malPos = new Set();
  const add = (nivel, tipo, texto, piezas, fix) => {
    probs.push({ nivel, tipo, texto, piezas, fix });
    piezas.forEach(p => invol.add(p.n));
  };

  // 1) Superposiciones
  pl.choques.forEach(c => add('error', 'choque',
    `${nom(c.a)} y ${nom(c.b)} se montan ${fN(c.ox)} × ${fN(c.oy)} cm. ${c.sugerencia}`, [c.a, c.b], fixExtremo(c)));

  // 2) Piezas fuera del mueble
  pl.el.forEach(e => {
    const f = [];
    if (e.x < -E) f.push(`${fN(-e.x)} cm a la izquierda`);
    if (e.x2 > A + E) f.push(`${fN(e.x2 - A)} cm a la derecha`);
    if (e.y < -E) f.push(`${fN(-e.y)} cm por arriba`);
    if (e.y2 > Hh + E) f.push(`${fN(e.y2 - Hh)} cm por abajo`);
    if (f.length) malPos.add(e.n);
    if (f.length) add('error', 'fuera', `${nom(e)} se sale del mueble (${f.join(', ')}). El mueble mide ${fN(A)} × ${fN(Hh)} cm.`, [e]);
  });

  // 2b) Tubos que se meten dentro de una tabla vertical
  pl.ts.forEach(t => {
    if (t.x < -E || t.x2 > A + E) return; // ya se informa como “se sale del mueble”
    const pasa = pasaPor(t, pl.vs, A);
    pasa.forEach(v => {
      const cy = t.y + t.h / 2;
      notas.push({ tipo: 'agujero', piezas: [t, v],
        texto: `${nom(t)} atraviesa ${nom(v)}: es normal, pero hay que hacerle un agujero de Ø ${fN(t.esp)} cm (un poco más grande para que el tubo pase), con el centro a ${fN(Hh - cy)} cm del piso (${fN(cy - v.y)} cm desde el borde superior de esa pieza).` });
    });
    pl.vs.forEach(v => {
      if (pasa.includes(v)) return;
      const ox = Math.min(t.x2, v.x2) - Math.max(t.x, v.x), oy = Math.min(t.y2, v.y2) - Math.max(t.y, v.y);
      if (ox > E && oy > E) add('error', 'choque', `${nom(t)} se mete ${fN(ox)} cm dentro de ${nom(v)} (el tubo termina dentro de la tabla). El tubo debe ir de una tabla vertical a la otra: acortalo o movelo.`, [t, v]);
    });
  });

  // 3) Horizontales (y tubos): ¿calzan entre las verticales vecinas?
  pl.hs.concat(pl.ts).forEach(h => {
    if (invol.has(h.n)) return;
    let L = null, R = null;
    pl.vs.forEach(v => {
      const ov = Math.min(v.y2, h.y2) - Math.max(v.y, h.y);
      if (ov <= E) return;
      if (v.x2 <= h.x + E && (!L || v.x2 > L.x2)) L = v;
      if (v.x >= h.x2 - E && (!R || v.x < R.x)) R = v;
    });
    const lb = L ? L.x2 : 0, rb = R ? R.x : A;
    const gl = h.x - lb, gr = rb - h.x2;
    if (gl > E || gr > E) {
      const nuevo = r(rb - lb);
      const ln = L ? nom(L) : 'el borde izquierdo del mueble', rn = R ? nom(R) : 'el borde derecho del mueble';
      const hueco = gl > E && gr > E ? `Queda un hueco de ${fN(gl)} cm a la izquierda y ${fN(gr)} cm a la derecha.`
        : gl > E ? `Queda un hueco de ${fN(gl)} cm a la izquierda.` : `Queda un hueco de ${fN(gr)} cm a la derecha.`;
      add(L || R ? 'error' : 'aviso', 'hueco',
        `${nom(h)} mide ${fN(h.w)} cm, pero el espacio entre ${ln} y ${rn} mide ${fN(nuevo)} cm. ${hueco} Para que calce debe medir ${fN(nuevo)} cm.`,
        [h], L || R ? { id: h.id, x: lb, largo: nuevo } : null);
    }
  });

  // 4) Verticales: ¿llegan de tabla a tabla?
  pl.vs.forEach(v => {
    if (malPos.has(v.n)) return;
    let T = null, B = null;
    pl.hs.forEach(h => {
      const ov = Math.min(h.x2, v.x2) - Math.max(h.x, v.x);
      if (ov <= E) return;
      if (h.y2 <= v.y + E && (!T || h.y2 > T.y2)) T = h;
      if (h.y >= v.y2 - E && (!B || h.y < B.y)) B = h;
    });
    const tb = T ? T.y2 : 0, bb = B ? B.y : Hh;
    const gt = v.y - tb, gb = bb - v.y2;
    if (gt > E || gb > E) {
      const nuevo = r(bb - tb);
      const tn = T ? nom(T) : 'el borde superior del mueble', bn = B ? nom(B) : 'el piso (borde inferior del mueble)';
      const hueco = gt > E && gb > E ? `Queda un hueco de ${fN(gt)} cm arriba y ${fN(gb)} cm abajo.`
        : gt > E ? `Queda un hueco de ${fN(gt)} cm arriba.` : `Queda un hueco de ${fN(gb)} cm abajo.`;
      add(T || B ? 'error' : 'aviso', 'hueco',
        `${nom(v)} mide ${fN(v.h)} cm de alto, pero el espacio entre ${tn} y ${bn} mide ${fN(nuevo)} cm. ${hueco} Para que calce debe medir ${fN(nuevo)} cm.`,
        [v], T || B ? { id: v.id, y: tb, largo: nuevo } : null);
    }
  });

  // 5) Medidas totales del mueble
  if (pl.el.length) {
    const minX = Math.min(...pl.el.map(e => e.x)), maxX = Math.max(...pl.el.map(e => e.x2));
    const minY = Math.min(...pl.el.map(e => e.y)), maxY = Math.max(...pl.el.map(e => e.y2));
    const w = r(maxX - minX), h = r(maxY - minY);
    if (Math.abs(w - A) > E || Math.abs(h - Hh) > E) {
      add('aviso', 'total', `Las piezas ocupan ${fN(w)} cm de ancho × ${fN(h)} cm de alto, pero el mueble está configurado en ${fN(A)} × ${fN(Hh)} cm. Revisá las piezas de las orillas (costados, techo, piso) o el ancho/alto del mueble.`, []);
    }
  }

  // 6) Fondo y espesor consistentes
  const duras = pl.el.filter(e => !e.tubo);
  const porFondo = new Map();
  duras.forEach(e => { const k = r(e.prof); if (!porFondo.has(k)) porFondo.set(k, []); porFondo.get(k).push(e); });
  if (porFondo.size > 1) {
    const partes = [...porFondo].map(([k, l]) => `${fN(k)} cm (${l.map(x => x.n).join(', ')})`).join(' · ');
    add('aviso', 'fondo', `Las piezas no tienen el mismo fondo: ${partes}. Si todo el mueble tiene un solo fondo, usá “Aplicar profundidad a TODAS las tablas”.`, []);
  }
  const espDis = r(d.esp);
  const raros = duras.filter(e => Math.abs(e.esp - espDis) > E);
  if (raros.length) {
    add('aviso', 'espesor', `Hay piezas con espesor distinto al del mueble (${fN(espDis)} cm): ${raros.map(e => `${nom(e)} = ${fN(e.esp)} cm`).join(', ')}. Los largos de las demás deben calcularse con el espesor real.`, raros);
  }

  const okPiezas = pl.el.filter(e => !invol.has(e.n));
  return { pl, problemas: probs, notas, okPiezas };
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
    const plan = calcularPlan(todasLasPiezas(), estado.stock, estado.kerf, true, estado.unir);
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
    const malos = incluidos().filter(i => estado.muebles[i].diseno.el.length && revisarDiseno(estado.muebles[i].diseno).problemas.some(p => p.nivel === 'error')).map(i => estado.muebles[i].nombre);
    $('rev-aviso').innerHTML = malos.length ? `<div class="aviso">⚠ Las piezas de ${malos.map(esc).join(', ')} tienen medidas que no calzan entre sí. Revisalas en “✅ Revisar medidas” antes de cortar.</div>` : '';
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
        const separado = incluidos().reduce((t, i) => t + calcularPlan(piezasDeMueble(i), estado.stock, estado.kerf, true, estado.unir).totalTablas, 0);
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
      techo:    { nombre: 'Techo / superior', orient: 'H', largo: interior, x: e, y: 0 },
      piso:     { nombre: 'Piso / inferior', orient: 'H', largo: interior, x: e, y: d.alto - e },
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

  /* ---- Qué muebles mostrar en Plano / Revisión ---- */
  function indicesVista(selId_) {
    sincronizar();
    return $(selId_).value === 'todos' ? incluidos() : [estado.activo];
  }
  function refrescarVistas() {
    if ($('rev-out').innerHTML.trim() && $('rev-modo').value === 'activo') generarRevision();
    if ($('plano-out').innerHTML.trim() && $('plano-modo').value === 'activo') generarPlano();
  }

  /* ---- Revisar medidas ---- */
  let revFixes = [];
  function irAPieza(mi, id) {
    irAMueble(mi);
    selId = id; pintarTablaDiseno(); pintarCanvas();
    $('d-leyenda').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function aplicarFix(d, f) {
    const e = d.el.find(x => x.id === f.id);
    if (!e) return;
    if (f.x !== undefined) e.x = r(f.x);
    if (f.y !== undefined) e.y = r(f.y);
    if (f.largo !== undefined) e.largo = r(f.largo);
  }
  function refrescarDiseno(mi) {
    guardar();
    if (mi === estado.activo) { pintarTablaDiseno(); pintarCanvas(); }
  }
  function corregirTodo(mi) {
    const d = estado.muebles[mi].diseno;
    for (let it = 0; it < 6; it++) {
      const fx = revisarDiseno(d).problemas.filter(p => p.fix).map(p => p.fix);
      if (!fx.length) break;
      const hecho = new Set();
      fx.forEach(f => { if (!hecho.has(f.id)) { hecho.add(f.id); aplicarFix(d, f); } });
    }
    refrescarDiseno(mi);
  }
  function generarRevision() {
    const idx = indicesVista('rev-modo');
    if (!idx.length) { alert('Marcá con ✔ al menos un mueble para revisar.'); return; }
    revFixes = [];
    $('rev-out').innerHTML = idx.map(i => {
      const mu = estado.muebles[i], d = mu.diseno;
      if (!d.el.length) return `<div class="plano-mueble"><h3>${esc(mu.nombre)}</h3><p class="hint">Este mueble no tiene piezas en el diseño. Agregalas en el Diseñador.</p></div>`;
      const rv = revisarDiseno(d);
      const errores = rv.problemas.filter(p => p.nivel === 'error').length;
      const avisos = rv.problemas.length - errores;
      const hayFix = rv.problemas.some(p => p.fix);
      const cab = !rv.problemas.length
        ? `<div class="ok-box">✔ <b>Todo calza.</b> Las ${rv.pl.el.length} piezas encajan entre sí y con las medidas del mueble (${fN(rv.pl.A)} × ${fN(rv.pl.Hh)} × ${fN(rv.pl.prof)} cm).</div>`
        : `<div class="aviso${errores ? '' : ' warn'}"><b>${errores ? '⚠' : 'ℹ'} ${errores} problema(s) de medidas${avisos ? ` y ${avisos} aviso(s)` : ''}.</b> ${rv.okPiezas.length} de ${rv.pl.el.length} piezas están bien.</div>`;
      const items = rv.problemas.map(p => {
        const k = p.fix ? (revFixes.push({ mi: i, fix: p.fix }) - 1) : -1;
        const ver = p.piezas.slice(0, 3).map(e => `<button data-rir="${e.id}" data-mi="${i}">Ver ${e.n}. ${esc(e.nombre)}</button>`).join(' ');
        return `<div class="aviso${p.nivel === 'aviso' ? ' warn' : ''}">${p.nivel === 'error' ? '⚠' : 'ℹ'} ${esc(p.texto)}
          <div class="no-print" style="margin-top:6px">${k >= 0 ? `<button class="primary" data-fixi="${k}">✔ Corregir esta pieza</button> ` : ''}${ver}</div></div>`;
      }).join('');
      const notasHtml = rv.notas.map(n => `<div class="aviso nota">ℹ ${esc(n.texto)}
          <div class="no-print" style="margin-top:6px">${n.piezas.map(e => `<button data-rir="${e.id}" data-mi="${i}">Ver ${e.n}. ${esc(e.nombre)}</button>`).join(' ')}</div></div>`).join('');
      const oks = rv.okPiezas.length && rv.problemas.length
        ? `<p class="hint">✔ Calzan bien: ${rv.okPiezas.map(e => `${e.n}. ${esc(e.nombre)}`).join(' · ')}</p>` : '';
      const adic = mu.piezas.length
        ? `<p class="hint">Nota: las “piezas adicionales” (${mu.piezas.map(p => esc(p.nombre)).join(', ')}) no tienen posición en el diseño, así que su medida no se puede comparar con las vecinas.</p>` : '';
      return `<div class="plano-mueble"><h3>${esc(mu.nombre)}</h3>${cab}
        ${hayFix ? `<div class="no-print"><button class="primary" data-fixall="${i}">✔ Corregir todo lo que se pueda</button></div>` : ''}
        ${items}${notasHtml}${oks}${adic}</div>`;
    }).join('');
  }
  $('btn-revisar').addEventListener('click', generarRevision);
  $('rev-modo').addEventListener('change', () => { estado.revModo = $('rev-modo').value; guardar(); if ($('rev-out').innerHTML.trim()) generarRevision(); });
  $('rev-out').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.rir) { irAPieza(+b.dataset.mi, Number(b.dataset.rir)); return; }
    if (b.dataset.fixi !== undefined) {
      const x = revFixes[+b.dataset.fixi]; if (!x) return;
      aplicarFix(estado.muebles[x.mi].diseno, x.fix); refrescarDiseno(x.mi); generarRevision(); return;
    }
    if (b.dataset.fixall !== undefined) {
      if (!confirm('Se van a ajustar el largo y la posición de las piezas que no calzan, según las vecinas. ¿Continuar?')) return;
      corregirTodo(+b.dataset.fixall); generarRevision();
    }
  });

  /* ---- Plano de armado ---- */
  function generarPlano() {
    const idx = indicesVista('plano-modo');
    if (!idx.length) { alert('Marcá con ✔ al menos un mueble para generar su plano.'); return; }
    $('plano-out').innerHTML = '<div class="no-print" style="margin:8px 0"><button class="primary" data-pl="print">🖨 Imprimir / guardar PDF</button></div>' + idx.map(i => {
      const mu = estado.muebles[i], d = mu.diseno;
      if (!d.el.length) return `<div class="plano-mueble"><h3>${esc(mu.nombre)}</h3><p class="hint">Este mueble no tiene piezas en el diseño. Agregalas en el Diseñador.</p></div>`;
      const pl = calcularPlano(d);
      const tit = `${mu.nombre} — ${fN(pl.A)} × ${fN(pl.Hh)} × ${fN(pl.prof)} cm (ancho × alto × fondo)`;
      const nom = e => `“${esc(e.nombre)}” (${e.n})`;
      const resumenMal = pl.choques.length
        ? `<div class="aviso"><b>⚠ ${pl.idsChoque.size} piezas tienen problema (marcadas en rojo en el dibujo):</b> ${pl.filas.filter(f => f.choque).map(f => `<b>${f.n}.</b> ${esc(f.nombre)}`).join(' · ')}</div>` : '';
      const avisos = resumenMal + pl.choques.map(c => `<div class="aviso">⚠ ${nom(c.a)} y ${nom(c.b)} se superponen ${fN(c.ox)} × ${fN(c.oy)} cm.<br><b>Qué hacer:</b> ${esc(c.sugerencia)}<br>
        <span class="no-print"><button data-ir="${c.a.id}" data-mi="${i}">Ver “${esc(c.a.nombre)}” (${c.a.n}) en el diseñador</button> <button data-ir="${c.b.id}" data-mi="${i}">Ver “${esc(c.b.nombre)}” (${c.b.n}) en el diseñador</button></span></div>`).join('');
      const libres = pl.luces.map(l => `<li>Entre ${nom(l.de)} y ${nom(l.a)}: <b>${fN(l.luz)} cm</b> de alto libre</li>`)
        .concat(pl.anchosLibres.map(l => `<li>Entre ${nom(l.de)} y ${nom(l.a)}: <b>${fN(l.luz)} cm</b> de ancho libre</li>`)).join('');
      return `<div class="plano-mueble">
        <h3>${esc(mu.nombre)}</h3>
        ${avisos}
        ${svgPlano(pl, colorDe, tit).replace('<svg ', `<svg data-mi="${i}" `)}
        <div class="no-print"><button data-pl="png" data-mi="${i}">⬇ Descargar imagen (PNG)</button></div>
        ${libres ? `<p><b>Espacios libres:</b></p><ul>${libres}</ul>` : ''}
        <div class="table-wrap"><table class="cortes"><thead><tr><th>#</th><th>Pieza</th><th>Medidas (largo × fondo × espesor, cm)</th><th>Dónde va</th></tr></thead><tbody>
        ${pl.filas.map(f => `<tr><td><b>${f.n}</b></td><td><i class="sw" style="background:${colorDe(f.nombre)}"></i>${esc(f.nombre)}${f.choque ? ' <span class="malo">⚠ revisar</span>' : ''}</td><td>${esc(f.medidas)}</td><td>${esc(f.pos)}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="hint">Cómo usarlo: marcá en el piso o en el costado la altura indicada y apoyá la tabla de modo que su cara superior quede en esa marca. Los números del dibujo coinciden con la tabla.</p>
      </div>`;
    }).join('');
  }
  function descargarPng(i) {
    const svg = document.querySelector(`#plano-out svg[data-mi="${i}"]`);
    if (!svg) return;
    const w = +svg.dataset.w, h = +svg.dataset.h;
    let src = new XMLSerializer().serializeToString(svg).replace('<svg ', `<svg width="${w}" height="${h}" `);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'plano-' + estado.muebles[i].nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_') + '.png';
        a.click();
      });
    };
    img.onerror = () => alert('No se pudo crear la imagen. Usá “Imprimir / guardar PDF”.');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
  }
  function imprimirPlano() {
    document.body.classList.add('print-plano');
    const quitar = () => { document.body.classList.remove('print-plano'); window.removeEventListener('afterprint', quitar); };
    window.addEventListener('afterprint', quitar);
    window.print();
  }
  $('btn-plano').addEventListener('click', generarPlano);
  $('plano-modo').addEventListener('change', () => { estado.planoModo = $('plano-modo').value; guardar(); if ($('plano-out').innerHTML.trim()) generarPlano(); });
  $('plano-out').addEventListener('click', ev => {
    const ir = ev.target.closest('button[data-ir]');
    if (ir) {
      const id = Number(ir.dataset.ir);
      irAMueble(+ir.dataset.mi);
      selId = id; pintarTablaDiseno(); pintarCanvas();
      $('d-leyenda').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const b = ev.target.closest('button[data-pl]'); if (!b) return;
    if (b.dataset.pl === 'png') descargarPng(+b.dataset.mi); else imprimirPlano();
  });

  function iniciar() {
    pintarMuebles();
    $('notas').value = estado.notas || '';
    $('d-ancho').value = dis().ancho; $('d-alto').value = dis().alto; $('d-prof').value = dis().prof; $('d-esp').value = dis().esp;
    pintarTablaDiseno(); pintarCanvas();
    $('kerf').value = estado.kerf;
    $('rotar').checked = !!estado.rotar;
    $('unir').checked = estado.unir !== false;
    pintarPlantilla(); pintarPiezas(); pintarStock();
    $('plano-modo').value = estado.planoModo || 'activo';
    $('rev-modo').value = estado.revModo || 'activo';
    refrescarVistas();
  }
  iniciar();
}

if (typeof module !== 'undefined') module.exports = { revisarDiseno, calcularPlano, svgPlano, retazosDe, colorDe, calcularPlan, PLANTILLAS, piezasDesdeDiseno, materialesDesdeDiseno };
