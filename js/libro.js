/* Amazonia Incognita · el cuaderno de expedición
   (Pau, 12/11: «el secreto, con el cuaderno, pero profesional: el cuaderno realista, el dibujo realista, todo realista»)
   Cuando encuentras un secreto, después de unos segundos de su escena en 3D, entra un cuaderno de expedición de verdad
   (foto de Higgsfield) y se rellena delante de ti:
     · en la página izquierda, la lámina de naturalista del secreto: primero el lápiz (un frente irregular que avanza)
       y luego la acuarela, que florece en manchas; debajo, la nota a lápiz y el pie de la lámina en tinta;
     · en la derecha, la fecha y la hora del río a lápiz, el título en tinta con su subrayado y el texto renglón a
       renglón, sobre las rayas del papel; el pie, a lápiz; y al final el sello de goma «08 · ocho de diez».
   En pantallas estrechas (móvil en vertical) se ve solo la página derecha, con la lámina arriba.
   Todo va con el reloj de la escena (cuadro(t) desde js/interfaz.js): se pausa, se salta y se prueba sin ventana.
   Datos: datos/cuaderno.js (herramientas/empaquetar_cuaderno.py), que se carga tarde, cuando el mundo ya está listo.
   Cada secreto puede traer `lamina: { fig: ['línea 1', 'línea 2'], nota: 'a lápiz', regla: true }`.            */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;
  var R0 = 0.1571, PASO = 0.0334;                   // el primer renglón y la distancia entre renglones (medidos en la foto)
  var D = null, IMG = {}, raiz = null, velo = null, foto = null, cv = null, trazos = null, sello = null, selloNum = null, selloTxt = null;
  var L = null;                                     // el cuaderno abierto: { h, items, ... }
  var ROMANOS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  var NUMEROS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
  var MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
  function renglon(k) { return R0 + k * PASO; }
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function eo(k) { return 1 - Math.pow(1 - k, 3); }
  function eio(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function sonar(n, d) { if (AM.sonidoUI) try { AM.sonidoUI(n, d); } catch (e) { /* sin sonido */ } }

  /* ---------- carga (tarde) ---------- */
  var cargando = false;
  function cargar() {
    if (D || cargando) return; cargando = true;
    var s = document.createElement('script'); s.src = 'datos/cuaderno.js';
    s.onload = function () { D = window.AMZ_CUADERNO || null; if (D) preparar(); };
    s.onerror = function () { cargando = false; };
    document.body.appendChild(s);
  }
  function imagen(src) { var im = new Image(); im.decoding = 'async'; im.src = src; return im; }
  function preparar() {
    foto = imagen(D.libro);
    for (var id in D.laminas) IMG[id] = { color: imagen(D.laminas[id].color), lapiz: imagen(D.laminas[id].lapiz) };
    var ui = document.getElementById('am-ui');
    velo = document.createElement('div'); velo.className = 'am-libro-velo'; ui.appendChild(velo);
    raiz = document.createElement('div'); raiz.className = 'am-libro'; raiz.setAttribute('aria-hidden', 'true');
    raiz.innerHTML = '<img class="am-libro-foto" alt=""><canvas class="am-libro-dibujo"></canvas>' +
      '<svg class="am-libro-trazos" preserveAspectRatio="none"></svg>' +
      '<svg class="am-libro-sello" viewBox="0 0 120 120" aria-hidden="true"><defs>' +
      '<filter id="am-desgaste" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="r"/>' +
      '<feColorMatrix in="r" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.6 1.75"/></filter>' +
      '<mask id="am-tinta-sello"><rect width="120" height="120" fill="#fff"/><rect width="120" height="120" filter="url(#am-desgaste)"/></mask>' +
      '<path id="am-aro-sello" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0"/></defs>' +
      '<g mask="url(#am-tinta-sello)" fill="#a8401c" stroke="#a8401c"><circle cx="60" cy="60" r="55" fill="none" stroke-width="2.6"/><circle cx="60" cy="60" r="35" fill="none" stroke-width="1.2"/>' +
      '<text class="am-sello-txt" font-family="IBM Plex Mono, monospace" font-weight="600" font-size="8.2" letter-spacing="2.4" stroke="none"><textPath href="#am-aro-sello"></textPath></text>' +
      '<text class="am-sello-num" x="60" y="73" text-anchor="middle" font-family="Instrument Serif, serif" font-size="38" stroke="none"></text></g></svg>';
    ui.appendChild(raiz);
    raiz.querySelector('.am-libro-foto').src = D.libro;
    cv = raiz.querySelector('.am-libro-dibujo'); trazos = raiz.querySelector('.am-libro-trazos'); trazos.setAttribute('viewBox', '0 0 1000 ' + (1000 / (D.aspecto || 1.5)).toFixed(1));  /* misma escala en x y en y */ sello = raiz.querySelector('.am-libro-sello');
    selloNum = raiz.querySelector('.am-sello-num'); selloTxt = raiz.querySelector('textPath');
    addEventListener('resize', function () { if (L) { colocar(); } });
  }

  /* ---------- el sitio del cuaderno en la pantalla ---------- */
  function modo() { return innerWidth < 760 || innerWidth / innerHeight < 0.95 ? 'una' : 'doble'; }
  function colocar() {
    var W, x, y, asp = D.aspecto || 1.5;
    if (L.modo === 'doble') { W = Math.min(innerWidth * 0.76, innerHeight * 0.86 * asp); x = innerWidth * 0.51 - W / 2; y = innerHeight * 0.5 - W / asp / 2; }
    else {   // solo la página derecha (de x 0,513 a 0,862 del cuaderno; de y 0,078 a 0,879), centrada
      W = Math.min(innerWidth * 0.95 / 0.349, innerHeight * 0.9 / (0.801 / asp)); x = innerWidth / 2 - W * 0.6875; y = innerHeight / 2 - W / asp * 0.4785;
    }
    L.W = W; L.H = W / asp;
    raiz.style.width = W + 'px'; raiz.style.left = x + 'px'; raiz.style.top = y + 'px';
    // la lámina: su caja y el lienzo (a la resolución de la pantalla)
    var lam = L.lamina, dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(W * lam.ancho * dpr), h = Math.round(w / lam.asp);
    cv.style.left = lam.x * 100 + '%'; cv.style.top = lam.y * 100 + '%'; cv.style.width = lam.ancho * 100 + '%'; cv.style.height = (h / dpr) + 'px';
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; L.dibujado = -1; }
  }

  /* ---------- montar la página de un secreto ---------- */
  function texto(clase, txt, x, k) {
    var e = document.createElement('div'); e.className = 'am-lb-t ' + clase; e.textContent = txt;
    e.style.left = x * 100 + '%'; e.style.top = renglon(k) * 100 + '%'; raiz.appendChild(e); return e;
  }
  function partir(txt, clase, ancho) {            // corta en renglones que caben en «ancho» (fracción del cuaderno)
    var m = texto(clase + ' am-lb-medir', '', 0, 0), W = L.W * ancho, out = [], cur = '';
    txt.split(' ').forEach(function (w) { m.textContent = cur ? cur + ' ' + w : w; if (m.getBoundingClientRect().width > W && cur) { out.push(cur); cur = w; } else cur = m.textContent; });
    if (cur) out.push(cur); m.remove(); return out;
  }
  function linea(e, t0, msLetra, lapiz) { var t1 = t0 + Math.max(260, e.textContent.length * msLetra); L.items.push({ tipo: 'clip', el: e, t0: t0, t1: t1, son: lapiz ? 'lapiz' : 'pluma' }); return t1; }
  function trazo(d, color, ancho, t0, dur, son) {
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.style.stroke = color; p.style.strokeWidth = ancho; trazos.appendChild(p);
    var lg = p.getTotalLength ? p.getTotalLength() : 300; p.style.strokeDasharray = lg; p.style.strokeDashoffset = lg;
    L.items.push({ tipo: 'trazo', el: p, lg: lg, t0: t0, t1: t0 + dur, son: son }); return t0 + dur;
  }
  function fechaDiario(ms) { var d = new Date(ms || Date.now()); return d.getDate() + ' ' + MESES[d.getMonth()]; }
  function hora(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return (min / 60 | 0) + ':' + ('0' + (min % 60)).slice(-2); }

  function abrir(h, ta, op) {
    if (!D || !raiz || !D.laminas[h.id] || !IMG[h.id]) return false;
    op = op || {};
    cerrar();
    var lm = D.laminas[h.id], info = h.lamina || {}, una = modo() === 'una';
    L = { h: h, modo: una ? 'una' : 'doble', items: [], t: -1, salida: null, fin: 0, sonados: {}, dibujado: -1,
      lamina: una ? { x: 0.548, y: 0.178, ancho: 0.29, asp: lm.aspecto } : { x: 0.158, y: 0.19, ancho: 0.312, asp: lm.aspecto },
      img: IMG[h.id], semillas: lm.semillas.map(function (c, i) { return { x: c[0], y: c[1], d: ((i * 0.618) % 1) * 0.75, f: i * 1.7 }; }) };
    raiz.classList.toggle('am-una', una);
    raiz.querySelectorAll('.am-lb-t').forEach(function (e) { e.remove(); }); trazos.innerHTML = '';
    colocar();
    var XD = 0.548, XI = 0.165, ANCHO = 0.29, VH = 1000 / (D.aspecto || 1.5);
    var n = h.n || 0, tot = op.total || 10, tipo = (h.tipo || '').toUpperCase();
    // la cabecera: el día que lo encontraste y la hora del río donde pasa
    var minutos = I.horaDe ? I.horaDe(h) : null;
    var cab = fechaDiario(op.cuando) + (minutos != null ? ' · ' + (I.franja ? I.franja(minutos) : '') + ' · ' + hora(minutos) : '');
    var t = 0;
    if (!una) linea(texto('am-lb-lapiz am-lb-mayus', 'Lámina ' + ROMANOS[n] + ' · del natural', XI, 0), 900, 22, true);
    linea(texto('am-lb-lapiz am-lb-mayus', cab, XD, 0), una ? 900 : 1300, 22, true);
    // el título (en tinta) y su subrayado a pulso
    var kT = una ? 11 : 2, tit = texto('am-lb-tit', ta.titulo || h.nombre, XD, kT);
    var tamT = 4.3; while (tit.getBoundingClientRect().width / L.W > ANCHO + 0.015 && tamT > 2.7) { tamT *= 0.95; tit.style.fontSize = tamT + 'cqw'; }   // los títulos largos, más pequeños
    var fT = linea(tit, 2000, tamT < 3.5 ? 70 : 95);
    var wT = Math.min(tit.getBoundingClientRect().width / L.W, ANCHO + 0.02), x0 = XD * 1000, x1 = (XD + wT) * 1000 + 12, yS = (renglon(kT) + 0.012) * VH;
    trazo('M' + x0 + ',' + yS + ' C' + (x0 + 40) + ',' + (yS - 3) + ' ' + (x1 - 60) + ',' + (yS + 4) + ' ' + x1 + ',' + (yS - 2), '#24180e', 1.7, fT + 80, 480, 'pluma');
    // el texto, renglón a renglón (si no cabe, la letra un poco más pequeña)
    var k0 = una ? kT + 2 : 4, kMax = una ? 21 : 16, tam = 1.62, lineas;
    for (var intento = 0; intento < 6; intento++) {
      raiz.style.setProperty('--am-lb-letra', tam + 'cqw');
      lineas = partir(ta.texto || '', 'am-lb-tinta', ANCHO);
      if (k0 + lineas.length - 1 <= kMax) break; tam *= 0.94;
    }
    t = fT + 650;
    lineas.forEach(function (l, i) { t = linea(texto('am-lb-tinta', l, XD, k0 + i), t, 12) + 110; });
    var kUlt = k0 + lineas.length - 1;
    if (!una && ta.pie) { partir(ta.pie, 'am-lb-lapiz', ANCHO).slice(0, 2).forEach(function (l, i) { t = linea(texto('am-lb-lapiz', l, XD, kUlt + 2 + i), t + 120, 18, true); }); }
    // la página izquierda: la nota a lápiz (con una escala, si es un animal) y el pie de la lámina en tinta
    if (!una) {
      var tl = 6800, yN = L.lamina.y + L.lamina.ancho * (D.aspecto || 1.5) / L.lamina.asp + 0.02;
      if (info.regla) { var y = yN * VH, a = 178, b = 456, c = 'rgba(62,60,58,0.72)';
        trazo('M' + a + ',' + y + ' L' + b + ',' + (y - 1), c, 1, tl, 650, 'lapiz'); trazo('M' + a + ',' + (y - 7) + ' L' + a + ',' + (y + 7), c, 1, tl + 600, 110); trazo('M' + b + ',' + (y - 8) + ' L' + b + ',' + (y + 6), c, 1, tl + 680, 110); }
      var kN = Math.ceil((yN - R0) / PASO + 0.6);
      if (info.nota) linea(texto('am-lb-lapiz' + (info.regla ? ' am-lb-centro' : ''), info.nota, info.regla ? 0.317 : XI, kN), tl + 800, 38, true);
      var fig = info.fig || ['Fig. ' + n + ' — ' + (h.original || h.nombre) + '.'], tf = tl + 1400;
      fig.forEach(function (l, i) { tf = linea(texto('am-lb-tinta am-lb-fig', l, XI, kN + 2 + i), tf, 13) + 110; });
      t = Math.max(t, tf);
    }
    // el sello: al final, en la esquina libre de la página derecha
    selloNum.textContent = I.util.dos(n);
    var aro = 'SECRETO · ' + NUMEROS[n].toUpperCase() + ' DE ' + NUMEROS[tot].toUpperCase() + ' · ' + tipo + ' · ';
    selloTxt.textContent = aro; selloTxt.parentNode.setAttribute('letter-spacing', Math.max(0.6, (276 - aro.length * 4.95) / aro.length).toFixed(2));   // la vuelta justa
    var ks = una ? Math.min(20, kUlt + 1.2) : Math.min(19.2, Math.max(kUlt + (ta.pie ? 4.6 : 2.6), 17.5));
    sello.style.left = (una ? 80 : 75.5) + '%'; sello.style.top = (una ? 14 : renglon(ks) * 100) + '%';   // en el móvil, en la esquina de arriba (libre)
    L.tSello = t + 450; L.fin = L.tSello + 500;
    L.items.push({ tipo: 'papel', t0: 0 });
    L.items.push({ tipo: 'acuarela', t0: 3200 });
    if (op.medir) return true;
    raiz.classList.add('am-abierto'); velo.classList.add('am-abierto');
    document.documentElement.classList.add('am-libro-abierto');
    sonar('foco', { on: true });
    cuadro(0);
    return true;
  }

  /* ---------- la lámina: el lápiz y luego la acuarela ---------- */
  var off = null;
  var LAP0 = 1200, LAPD = 2800, COL0 = 3300, COLD = 3600;
  function pintarLamina(t) {
    if (!L || !cv.width) return;
    var fin = t >= COL0 + COLD * 1.3;
    if (fin && L.dibujado === 1) return;
    var x = cv.getContext('2d'), w = cv.width, h = cv.height, im = L.img;
    if (!im.color.complete || !im.lapiz.complete) return;
    x.clearRect(0, 0, w, h);
    var uc = (t - COL0) / COLD;
    if (uc > 0) {                                   // la acuarela: manchas que florecen desde dentro del dibujo
      if (!off) off = document.createElement('canvas');
      if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
      var o = off.getContext('2d'); o.globalCompositeOperation = 'source-over'; o.clearRect(0, 0, w, h); o.fillStyle = '#000';
      if (uc >= 1.25) o.fillRect(0, 0, w, h);
      else L.semillas.forEach(function (s) {
        var v = cl((uc - s.d * 0.6) / 0.55); if (v <= 0) return; var R = (1 - Math.pow(1 - v, 2.2)) * w * 0.34;
        o.beginPath(); for (var a = 0; a <= 28; a++) { var an = a / 28 * 6.2832, rr = R * (0.8 + 0.2 * Math.sin(an * 3 + s.f) * Math.sin(an * 5 - s.f)); o[a ? 'lineTo' : 'moveTo'](s.x * w + Math.cos(an) * rr, s.y * h + Math.sin(an) * rr * 0.82); }
        o.fill();
      });
      o.globalCompositeOperation = 'source-in'; o.drawImage(im.color, 0, 0, w, h);
      x.drawImage(off, 0, 0);
    }
    var ul = (t - LAP0) / LAPD;
    if (ul > 0) {                                   // el lápiz: un frente irregular que avanza de izquierda a derecha
      var fr = Math.min(1.25, ul) * w * 1.15 - w * 0.08;
      x.save(); x.beginPath(); x.moveTo(-5, -5);
      for (var yy = 0; yy <= h + 6; yy += 6) x.lineTo(fr + Math.sin(yy * 0.045 + t * 0.004) * w * 0.02 + Math.sin(yy * 0.011) * w * 0.05, yy);
      x.lineTo(-5, h + 6); x.closePath(); x.clip();
      x.globalAlpha = uc > 0 ? Math.max(0.42, 1 - uc * 0.55) : 1; x.drawImage(im.lapiz, 0, 0, w, h); x.restore(); x.globalAlpha = 1;
    }
    L.dibujado = fin ? 1 : 0;
  }

  /* ---------- un fotograma (t en ms desde que se abrió) ---------- */
  function cuadro(t) {
    if (!L) return;
    var antes = L.t; L.t = t;
    // entrar, el golpe del sello, salir
    var ke = eo(cl(t / 1400)), dy = (1 - ke) * 0.12, rot = 5 * (1 - ke) - 1.2 * ke, esc = 1.06 - 0.06 * ke, op = cl(t / 500);
    var ks = t - L.tSello; if (ks > 250 && ks < 560) { var g = Math.sin((ks - 250) / 310 * Math.PI); dy += 0.004 * g; esc -= 0.003 * g; }
    var vel = cl(t / 1200);
    if (L.salida != null) { var kx = cl((t - L.salida) / 1000), ki = kx * kx * kx; dy += 0.14 * ki; rot += 3.7 * ki; esc -= 0.05 * ki; op *= 1 - ki; vel *= 1 - kx; }
    raiz.style.opacity = op;
    raiz.style.transform = 'translateY(' + (dy * L.H).toFixed(1) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + esc.toFixed(4) + ')';
    velo.style.opacity = vel;
    // la letra y los trazos
    for (var i = 0; i < L.items.length; i++) {
      var it = L.items[i], k = it.t1 ? cl((t - it.t0) / (it.t1 - it.t0)) : 0;
      if (it.son && antes < it.t0 && t >= it.t0 && t < it.t1) sonar(it.son, { dur: (it.t1 - it.t0) / 1000 });
      if (it.tipo === 'clip') { if (k !== it.k) { it.k = k; it.el.style.clipPath = it.el.style.webkitClipPath = 'inset(-30% ' + (100 - k * 104).toFixed(2) + '% -50% -4%)'; } }
      else if (it.tipo === 'trazo') { if (k !== it.k) { it.k = k; it.el.style.strokeDashoffset = (it.lg * (1 - eio(k))).toFixed(1); } }
      else if (it.tipo === 'papel' && antes < 0 && t >= 0) sonar('papel', { dur: 0.9 });
      else if (it.tipo === 'acuarela' && antes < it.t0 && t >= it.t0) sonar('acuarela', { dur: 3.6 });
    }
    pintarLamina(t);
    // el sello: cae, aprieta y se queda
    var kz = cl(ks / 380), so = ks < 0 ? 0 : kz < 0.72 ? 0.92 * (kz / 0.72) : 0.92 - 0.06 * (kz - 0.72) / 0.28, se = ks < 0 ? 1.45 : kz < 0.72 ? 1.45 - 0.48 * eio(kz / 0.72) : 0.97 + 0.03 * (kz - 0.72) / 0.28;
    sello.style.opacity = so; sello.style.transform = 'translate(-50%, -50%) rotate(-13deg) scale(' + se.toFixed(3) + ')';
    if (antes < L.tSello + 270 && t >= L.tSello + 270) sonar('sello');
  }

  function salir(t) { if (L && L.salida == null) { L.salida = t; sonar('papel', { dur: 0.8, desde: 600, hasta: 2500, vol: 0.08 }); sonar('foco', { on: false }); } }
  function cerrar() {
    if (!L) return;
    var r = sello.getBoundingClientRect(); ultimoSello = [r.left + r.width / 2, r.top + r.height / 2];
    L = null; raiz.classList.remove('am-abierto'); velo.classList.remove('am-abierto'); velo.style.opacity = 0; raiz.style.opacity = 0;
    document.documentElement.classList.remove('am-libro-abierto'); sonar('foco', { on: false });
  }
  var ultimoSello = null;

  AM.libro = {
    cargar: cargar,
    listo: function (h) { var im = h && IMG[h.id]; return !!(D && raiz && foto && foto.complete && im && im.color.complete && im.lapiz.complete); },
    abrir: abrir, cuadro: cuadro, salir: salir, cerrar: cerrar,
    // cuánto tarda en escribirse entera (para alargar la escena): se monta en vacío y se mide
    duracion: function (h, ta) { if (!this.listo(h)) return 0; abrir(h, ta, { total: 10, medir: true }); var f = L ? L.fin : 0; L = null; return f; },
    sello: function () { if (L) { var r = sello.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; } return ultimoSello; },
    abierto: function () { return !!L; }
  };
})();
