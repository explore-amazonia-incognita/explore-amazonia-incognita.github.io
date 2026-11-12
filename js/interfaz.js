/* Amazonia Incognita · interfaz (la de la familia: Astra / Thule, adaptada al viaje en canoa)
   El registro de secretos, el progreso (en este navegador), el cuaderno («Diario de a bordo»), la tarjeta de cada
   escena, los avisos, los instrumentos (TRAMO, HORA, REMONTADO y ECO, que late cerca de un secreto de lugar), la
   entrada, el final y los créditos. Para volver o cerrar: la tecla ⌫ (nunca Esc, que saca de la pantalla completa).

   ─────────────────────────────── CONTRATO CON EL MOTOR ───────────────────────────────
   Orden de los <script>: viaje.js → motor → interfaz.js → huevos/01…10 → huevos/final.js → (arranque).
   El motor, cuando ya tiene el mundo montado, llama:
       AM.interfaz.iniciar(motor);     // engancha los detectores y pinta el cuaderno (aún con la carga puesta)
       AM.interfaz.listo();            // cuando ya se ve el río: quita la carga, la entrada (1.ª vez) y #id
   Lo OBLIGATORIO del motor:
       motor.en(evento, fn)            // suscribirse a sus eventos:
         'cuadro' { t, dt, z, yaw, pitch, vel, remo }   cada fotograma (también durante las escenas)
                  z     = distancia río arriba en unidades del viaje (AM.viaje.M = 41,7 u por metro; 0 = el puerto)
                  yaw   = grados, 0 = mirando río arriba, + = a la derecha;  pitch = grados, − = mirando abajo
                  vel   = velocidad de la canoa (u/s, + = río arriba)
                  remo  = lo que PIDE la persona este fotograma (−1…1; − = remar hacia atrás), aunque la canoa no
                          se mueva (en el puerto, z no baja de 0: así se detecta el secreto de Distancia)
         'clic'   { x, y, agua, planta, objeto }        al tocar el mundo (un clic sin arrastre o un toque)
                  x, y  = píxeles de pantalla
                  agua  = { x, z } punto del agua tocado (unidades del mundo) o null
                  planta= el tipo de la pieza tocada ('victoria-flor', 'casa-pilotes-2', 'teatro', 'samauma'…) o null
                  objeto= { tipo, x, z, samauma? } la pieza tocada (opcional, si no basta con «planta»)
   Lo OPCIONAL (si existe se usa; si no, la interfaz sigue igual):
       motor.ir(z, ms)                 llevar la canoa a z (al lanzar un secreto desde el cuaderno, para verlo en su sitio)
       motor.mirar(yaw, pitch, ms)     girar la vista
       motor.reproducir(id, datos)     la coreografía 3D de una escena (cámara, animación, sonido); datos.duracion en ms
       motor.parar(id)                 cortarla (al acabar o al saltar con ⌫)
       motor.efecto(nombre, datos)     efectos sueltos que piden los detectores: 'fruto' { x, z } (un fruto cae al agua)
       motor.sonar(nombre)             un sonido suelto
       motor.bloquear(si)              ignorar la entrada de la persona (durante escenas, entrada y créditos)
       eventos 'limite' { lado: 'atras'|'delante' }   (al empujar contra el principio o el final del río)
               'fruto'  { x, z }                     (si el motor deja caer frutos por su cuenta)
   La interfaz lleva su propio reloj (requestAnimationFrame) para las escenas y las tarjetas, escucha el teclado
   ella misma (⌫ y las palabras de los secretos de Teclado) y mide la inactividad para los de Espera.
   ───────────────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var AM = window.AM = window.AM || {};
  var CLAVE = 'amazonia-incognita.v1';   // no se cambia nunca: borraría el progreso de quien ya juega
  var PRUEBA = /[?&]prueba\b/.test(location.search);
  var AUTOR = { nombre: 'Pau Morató Sebastià', linkedin: 'https://www.linkedin.com/in/pau-morat%C3%B3-sebasti%C3%A0-5554a01b2' };
  var LECTURA = 5000;   // la tarjeta se queda 5 s más de lo que dura la animación (Pau quiere tiempo para leer)
  var TOTAL = 10;

  var I = AM.interfaz = { prueba: PRUEBA, LECTURA: LECTURA, AUTOR: AUTOR };
  var raiz = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- utilidades (AM.interfaz.util) ---------- */
  var U = I.util = {
    dos: function (n) { return (n < 10 ? '0' : '') + n; },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    tramo: function (t, a, b) { return U.clamp((t - a) / (b - a), 0, 1); },
    suave: function (k) { return k * k * (3 - 2 * k); },
    meseta: function (t, a, b, c, d) { return t < a || t > d ? 0 : t < b ? U.suave(U.tramo(t, a, b)) : t <= c ? 1 : 1 - U.suave(U.tramo(t, c, d)); },
    miles: function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); },
    // ¿el clic ha tocado una pieza de este tipo? (mira planta y objeto.tipo)
    toca: function (d, re) {
      if (!d) return false;
      if (d.planta && re.test(d.planta)) return true;
      return !!(d.objeto && d.objeto.tipo && re.test(d.objeto.tipo));
    }
  };
  // llamar a una función opcional del motor (si no existe, no pasa nada)
  var M = null;
  AM.pedir = function (nombre) {
    if (!M || typeof M[nombre] !== 'function') return undefined;
    try { return M[nombre].apply(M, Array.prototype.slice.call(arguments, 1)); } catch (e) { console.error('motor.' + nombre, e); return undefined; }
  };

  /* ---------- el viaje: unidades, tramos y horas ---------- */
  function V() { return AM.viaje || {}; }
  function unidadesPorMetro() { return V().M || 41.7; }
  function largo() { return V().FIN || 1728.25 * 41.7; }
  // dónde empieza cada tramo (fracción del viaje) si no está viaje.js
  var TRAMOS_RESERVA = [['manaus', 0], ['encuentro', 0.0994], ['igapo', 0.1988], ['aldea', 0.3147], ['vitorias', 0.4141], ['tormenta', 0.5135], ['atardecer', 0.7449], ['noche', 0.8443], ['samauma', 0.9602]];   // (12/11) tormenta de 400 m
  var CORTOS = { manaus: 'Manaus', encuentro: 'El Encuentro', igapo: 'El igapó', aldea: 'La aldea', vitorias: 'La laguna', tormenta: 'La tormenta', atardecer: 'El atardecer', noche: 'La noche', samauma: 'La samaúma' };
  // la hora de cada tramo (minutos desde la medianoche del primer día; la samaúma ya es el alba siguiente)
  var HORAS = { manaus: 350, encuentro: 425, igapo: 515, aldea: 625, vitorias: 730, tormenta: 880, atardecer: 1060, noche: 1260, samauma: 1780 };
  var FRANJAS = [[300, 'Alba'], [400, 'Mañana'], [690, 'Mediodía'], [800, 'Tarde'], [1020, 'Atardecer'], [1110, 'Noche'], [1730, 'Alba']];
  function inicios() {
    var T = V().tramos;
    if (T && T.length) return T.map(function (t) { return [t.id, t.z]; });
    return TRAMOS_RESERVA.map(function (t) { return [t[0], t[1] * largo()]; });
  }
  var cacheZ = null, cacheT = null;
  // el tramo dominante en z (el mismo cruce que usa viaje.js para mezclar)
  function tramoEn(z) {
    if (cacheZ !== null && Math.abs(cacheZ - z) < 4) return cacheT;
    var id = null;
    if (V().en) { try { id = V().en(z).tramo.id; } catch (e) { id = null; } }
    if (!id) { var L = inicios(); id = L[0][0]; for (var i = 0; i < L.length; i++) if (z >= L[i][1]) id = L[i][0]; }
    cacheZ = z; cacheT = id; return id;
  }
  function horaEn(z) {
    var L = inicios();
    for (var i = 0; i < L.length - 1; i++) {
      if (z < L[i + 1][1]) { var k = U.clamp((z - L[i][1]) / (L[i + 1][1] - L[i][1]), 0, 1); return HORAS[L[i][0]] + (HORAS[L[i + 1][0]] - HORAS[L[i][0]]) * k; }
    }
    var ult = L[L.length - 1];
    return HORAS[ult[0]] + U.clamp((z - ult[1]) / unidadesPorMetro(), 0, 120) * 0.12;
  }
  function franja(min) { var f = FRANJAS[0][1]; FRANJAS.forEach(function (x) { if (min >= x[0]) f = x[1]; }); return f; }
  // la z de una pieza fija del viaje (por su tipo), o la de reserva
  I.zDe = function (re, reserva) {
    var F = V().FIJOS || [], z = null;
    for (var i = 0; i < F.length; i++) if (re.test(F[i].tipo) || (F[i].samauma && re.test('samauma'))) { z = F[i].z; break; }
    return z == null ? reserva : z;
  };
  I.tramoEn = tramoEn; I.unidadesPorMetro = unidadesPorMetro; I.largo = largo; I.franja = franja;
  // la hora del río para la página del cuaderno: donde estás si estás en su tramo; si no, a mitad de su tramo
  I.horaDe = function (h) { var z = ultimo && ultimo.z; if (z == null || (h.tramo && tramoEn(z) !== h.tramo)) { var L = inicios(), i; for (i = 0; i < L.length; i++) if (L[i][0] === h.tramo) break; z = L[i] ? (L[i][1] + (L[i + 1] ? L[i + 1][1] : largo())) / 2 : 0; } return horaEn(z); };
  I.zTramo = function (id) { var L = inicios(); for (var i = 0; i < L.length; i++) if (L[i][0] === id) return L[i][1]; return 0; };

  /* ---------- registro ----------
     Cada secreto: { id, n, nombre, original?, tipo, tramo, pista, lugar?: () => z (u), radio? (m),
                     detectar(api), escena(motor, datos) }                                                 */
  var huevos = [], final = null;
  var estado = { hallados: {}, final: false, introVista: false };
  AM.registrar = function (h) { huevos.push(h); huevos.sort(function (a, b) { return a.n - b.n; }); };
  AM.registrarFinal = function (h) { final = h; };
  I.huevos = function () { return huevos; };
  I.estado = function () { return estado; };
  function cargar() { try { var s = localStorage.getItem(CLAVE); if (s) { var o = JSON.parse(s); for (var k in o) estado[k] = o[k]; if (!estado.hallados) estado.hallados = {}; } } catch (e) { /* sin almacenamiento */ } }
  function guardar() { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { /* sin almacenamiento */ } }
  function cuantos() { return huevos.filter(function (h) { return estado.hallados[h.id]; }).length; }
  function total() { return Math.max(TOTAL, huevos.length); }

  /* ---------- el reloj propio (escenas, tarjetas, esperas) ---------- */
  var reloj = { t: 0, congelado: false, previo: null };
  var ultimoInput = 0, ultimo = { t: 0, dt: 16, z: 0, yaw: 0, pitch: 0, vel: 0, remo: 0 };
  I.ahora = function () { return reloj.t; };
  I.quieto = function () { return reloj.t - ultimoInput; };
  function tocado() { ultimoInput = reloj.t; }
  I.tocado = tocado;

  /* ---------- eventos para los detectores (solo llegan con el mundo libre) ---------- */
  var oyentes = {};
  function oir(n, fn) { (oyentes[n] = oyentes[n] || []).push(fn); }
  function emitir(n, d) { var l = oyentes[n]; if (!l || !libre()) return; for (var i = 0; i < l.length; i++) { try { l[i](d); } catch (e) { console.error('detector ' + n, e); } } }
  function abierto(id) { var e = $(id); return !!(e && !e.hidden); }
  function libre() { return !escena && !abierto('am-intro') && !abierto('am-creditos') && !cuadernoAbierto(); }
  I.libre = libre;

  /* ---------- escenas ---------- */
  var escena = null;   // { id, s, t, dur, fin, tv, tq }
  function empezarEscena(id, s, alTerminar) {
    escena = { id: id, s: s || {}, t: 0, dur: (s && s.duracion) || 8000, fin: alTerminar, tv: false, tq: false };
    raiz.classList.add('am-en-escena');
    AM.pedir('bloquear', true);
    try { escena.s.inicio && escena.s.inicio(); } catch (e) { console.error('escena ' + id, e); }
  }
  function terminarEscena(saltada) {
    var e = escena; if (!e) return;
    escena = null;
    try { e.s.fin && e.s.fin(saltada); } catch (er) { console.error('fin ' + e.id, er); }
    AM.pedir('parar', e.id);
    I.tarjeta(null); quitarRotulos();
    if (e.lb && AM.libro) AM.libro.cerrar();
    raiz.classList.remove('am-en-escena');
    AM.pedir('bloquear', bloqueoUI());
    tocado();
    e.fin && e.fin(saltada);
  }
  function bloqueoUI() { return abierto('am-intro') || abierto('am-creditos'); }
  function avanzarEscena(dt) {
    var e = escena; if (!e) return;
    e.t += dt;
    try { e.s.cuadro && e.s.cuadro(e.t, dt); } catch (er) { console.error('cuadro ' + e.id, er); }
    var ta = e.s.tarjeta;
    if (ta && !e.tv && e.t >= (ta.en || 0)) { e.tv = true; if (e.s.libro && AM.libro && AM.libro.abrir(e.s.libro.h, ta, e.s.libro.op)) e.lb = true; else I.tarjeta(ta); }
    if (ta && e.tv && !e.tq && e.t >= (ta.hasta || e.dur - 400)) { e.tq = true; if (e.lb) AM.libro.salir(e.t - (ta.en || 0)); else I.tarjeta(null); }
    if (e.lb) AM.libro.cuadro(e.t - (ta.en || 0));
    if (e.t >= e.dur) terminarEscena(false);
  }
  I.escena = function () { return escena; };
  I.saltar = function () { terminarEscena(true); };

  /* ---------- disparar un secreto ---------- */
  I.disparar = function (h, datos, op) {
    op = op || {};
    if (!h || !h.escena || escena || abierto('am-intro') || abierto('am-creditos')) return false;
    // un secreto ya encontrado no vuelve a salir solo; se vuelve a ver desde el cuaderno
    if (estado.hallados[h.id] && !op.cuaderno && !op.prueba) return false;
    cerrarCuaderno();
    var nuevo = !estado.hallados[h.id] && !op.prueba;
    if (nuevo) { estado.hallados[h.id] = Date.now(); guardar(); }
    h.ultimosDatos = datos || h.ultimosDatos || null;
    var s = null;
    try { s = h.escena(M, h.ultimosDatos, { desdeCuaderno: !!(op.cuaderno || op.prueba) }); } catch (e) { console.error('escena ' + h.id, e); s = { duracion: 1000 }; }
    if (s && s.tarjeta && !s.tarjeta.etiqueta) s.tarjeta.etiqueta = 'Secreto ' + U.dos(h.n) + ' / ' + U.dos(total()) + ' · ' + h.tipo;
    // (Pau, 12/11) el cuaderno de expedición en vez de la tarjeta: entra a los ~4 s de la escena 3D y la escena se alarga
    // lo que tarde en escribirse, más el tiempo de leer (js/libro.js)
    if (s && s.tarjeta && AM.libro && AM.libro.listo(h)) {
      var ta = s.tarjeta; ta.en = Math.max(ta.en || 0, 4200);
      s.libro = { h: h, op: { total: total(), cuando: estado.hallados[h.id] || Date.now() } };
      s.duracion = Math.max(s.duracion || 8000, ta.en + AM.libro.duracion(h, ta) + LECTURA + 1300);
      ta.hasta = s.duracion - 1150;
    }
    var conLibro = !!(s && s.libro);
    empezarEscena(h.id, s, function () {
      pintarLista(nuevo ? h.id : null);
      if (nuevo) {
        var n = cuantos(), b = $('am-b-cuaderno');
        if (!conLibro) aviso('Secreto encontrado <b>' + U.dos(n) + '/' + U.dos(total()) + '</b> · ' + h.nombre);
        // la chispa sale del sello (o del centro) y vuela al Diario: el contador rueda y se enciende su rayita
        contador(n - 1);
        chispaAlDiario((conLibro && AM.libro.sello()) || [innerWidth / 2, innerHeight * 0.45], function () {
          contador(n, true); b.classList.remove('am-pulso'); void b.offsetWidth; b.classList.add('am-pulso');
        });
        if (n === total() && !estado.final && final) setTimeout(function () { I.verFinal(); }, 2600);
      }
    });
    return true;
  };
  I.verFinal = function () {
    if (!final || escena) return false;
    cerrarCuaderno();
    var primero = Infinity, ultimoH = 0;
    huevos.forEach(function (h) { var t = estado.hallados[h.id]; if (t) { primero = Math.min(primero, t); ultimoH = Math.max(ultimoH, t); } });
    raiz.classList.add('am-final-activo');
    var s = final.escena(M, { desde: primero, hasta: ultimoH, huevos: huevos, hallados: estado.hallados });
    if (s && s.tarjeta && !s.tarjeta.etiqueta) s.tarjeta.etiqueta = 'Los diez secretos · ' + U.dos(cuantos()) + ' / ' + U.dos(total());
    empezarEscena('final', s, function () {
      raiz.classList.remove('am-final-activo');
      if (cuantos() === total()) { estado.final = true; guardar(); }
      pintarLista();
      mostrarCreditos();
    });
    return true;
  };

  /* ---------- la chispa que vuela al Diario y el contador que rueda ---------- */
  function contador(n, animar) {
    var c = $('am-contador'), seg = $('am-segmentos'), tot = total(); if (!c || !seg) return;
    if (animar && c.animate) {
      c.innerHTML = '<span class="am-rueda"><span>' + U.dos(n - 1) + '</span><span>' + U.dos(n) + '</span></span><span class="am-de">/' + U.dos(tot) + '</span>';
      var r = c.querySelector('.am-rueda');
      try { r.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-50%)' }], { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.1, 1.4)', fill: 'forwards' }); } catch (e) { /* nada */ }
      setTimeout(function () { if (c.querySelector('.am-rueda') === r) c.innerHTML = cifra(n, tot); }, 900);
    } else c.innerHTML = cifra(n, tot);
    marcas(n, tot, animar);
    Array.prototype.forEach.call(seg.children, function (i, k) {
      i.className = k < n ? 'am-si' : '';
      if (animar && k === n - 1) { i.classList.add('am-recien'); }
    });
    if (animar) try { AM.sonidoUI && (AM.sonidoUI('campana', { f: 2637, dur: 1.2, vol: 0.045 }), AM.sonidoUI('campana', { f: 1975.5, dur: 1.6, vol: 0.035, retraso: 0.08 })); } catch (e) { /* sin sonido */ }
  }
  function chispaAlDiario(desde, alLlegar) {
    var b = $('am-contador'), hecho = false;
    function llegar() { if (hecho) return; hecho = true; alLlegar && alLlegar(); }
    if (!b) return llegar();
    var ui = $('am-ui') || document.body, chis = [], t0 = performance.now(), DUR = 1150;
    for (var k = 0; k < 7; k++) { var e = document.createElement('div'); e.className = 'am-chispa'; e.style.opacity = (1 - k / 7).toFixed(2); e.style.transform = 'scale(' + (1 - k * 0.11).toFixed(2) + ')'; ui.appendChild(e); chis.push(e); }
    try { AM.sonidoUI && AM.sonidoUI('chispa', { dur: 1.1 }); } catch (e2) { /* nada */ }
    (function paso() {
      var r = b.getBoundingClientRect(), x1 = r.left + r.width * 0.3, y1 = r.top + r.height / 2, x0 = desde[0], y0 = desde[1], cx = x0 + (x1 - x0) * 0.25, cy = Math.min(y0, y1) - 160;
      var t = (performance.now() - t0) / DUR;
      chis.forEach(function (e, k) { var u = Math.max(0, Math.min(1, t - k * 0.025)); u = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        e.style.left = ((1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1) + 'px'; e.style.top = ((1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1) + 'px'; });
      if (t >= 1) llegar();
      if (t < 1.2) requestAnimationFrame(paso); else chis.forEach(function (e) { e.remove(); });
    })();
    setTimeout(function () { llegar(); chis.forEach(function (e) { e.remove(); }); }, DUR + 900);   // por si la pestaña no pinta
  }

  /* ---------- rótulos de escena (etiquetas en versalitas sobre el mundo, en % de pantalla) ---------- */
  function quitarRotulos() { var r = $('am-rotulos'); if (r) r.innerHTML = ''; }
  I.rotulo = function (html, x, y, op) {
    op = op || {};
    var r = $('am-rotulos'); if (!r) return null;
    var e = document.createElement('div');
    e.className = 'am-rotulo' + (op.lado === 'izq' ? ' am-r-izq' : '') + (op.grande ? ' am-r-grande' : '');
    e.style.left = x + '%'; e.style.top = y + '%';
    e.innerHTML = html;
    r.appendChild(e); void e.offsetWidth; e.classList.add('am-visible');
    return e;
  };
  // un guion de rótulos para la función cuadro(t) de una escena: [{ en, hasta, html, x, y, lado?, grande? }]
  I.guion = function (lista) {
    var els = [];
    return function (t) {
      lista.forEach(function (r, i) {
        if (!els[i] && t >= r.en && t < r.hasta) els[i] = I.rotulo(r.html, r.x, r.y, r);
        if (els[i] && !els[i].fuera && t >= r.hasta) { els[i].fuera = true; els[i].classList.remove('am-visible'); }
      });
    };
  };

  /* ---------- tarjeta ---------- */
  I.tarjeta = function (t) {
    var el = $('am-tarjeta'); if (!el) return;
    if (!t) { el.classList.remove('am-visible'); return; }
    var v = function (x) { return typeof x === 'function' ? x() : (x || ''); };
    $('am-t-etq').textContent = v(t.etiqueta);
    $('am-t-tit').textContent = v(t.titulo);
    $('am-t-txt').innerHTML = v(t.texto);
    $('am-t-pie').textContent = v(t.pie);
    el.classList.remove('am-visible');
    // (12/11) el título y el texto entran renglón a renglón, cada uno desde detrás de su máscara
    [['am-t-tit', 350, 110], ['am-t-txt', 800, 85]].forEach(function (c) {
      var p = $(c[0]); if (!p || !p.textContent) return;
      var html = p.innerHTML, pal = html.split(' ');
      p.innerHTML = pal.map(function (w) { return '<span class="am-pal">' + w + '</span>'; }).join(' ');
      var grupos = [], ult = null;
      Array.prototype.forEach.call(p.querySelectorAll('.am-pal'), function (s) { if (s.offsetTop !== ult) { grupos.push([]); ult = s.offsetTop; } grupos[grupos.length - 1].push(s.innerHTML); });
      p.innerHTML = grupos.map(function (g, i) { return '<span class="am-l"><span style="--d:' + (c[1] + i * c[2]) + 'ms">' + g.join(' ') + '</span></span>'; }).join('');
    });
    void el.offsetWidth; el.classList.add('am-visible');
  };

  /* ---------- aviso ---------- */
  var tAviso = null;
  function aviso(html, ms) {
    var el = $('am-aviso'); el.innerHTML = html; el.classList.add('am-visible');
    clearTimeout(tAviso); tAviso = setTimeout(function () { el.classList.remove('am-visible'); }, ms || 4200);
  }
  I.aviso = aviso;

  /* ---------- cuaderno ---------- */
  function cuadernoAbierto() { var c = $('am-cuaderno'); return !!(c && c.classList.contains('am-abierto')); }
  function abrirCuaderno() {
    $('am-cuaderno').classList.add('am-abierto'); $('am-cuaderno').setAttribute('aria-hidden', 'false');
    $('am-b-cuaderno').setAttribute('aria-expanded', 'true'); raiz.classList.add('am-cuaderno-abierto');
  }
  function cerrarCuaderno() {
    var c = $('am-cuaderno'); if (!c) return;
    var estaba = c.classList.contains('am-abierto');
    c.classList.remove('am-abierto'); c.setAttribute('aria-hidden', 'true');
    $('am-b-cuaderno').setAttribute('aria-expanded', 'false'); raiz.classList.remove('am-cuaderno-abierto');
    if (estaba) tocado();
  }
  I.abrirCuaderno = abrirCuaderno; I.cerrarCuaderno = cerrarCuaderno;

  function fecha(ms) {
    var d = new Date(ms);
    return U.dos(d.getDate()) + '.' + U.dos(d.getMonth() + 1) + '.' + d.getFullYear() + ' · ' + U.dos(d.getHours()) + ':' + U.dos(d.getMinutes());
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* ---------- trazos a mano («Tinta sobre el mundo»): siempre con la misma semilla, salen igual cada vez ---------- */
  function azar(sem) { return function () { sem = (sem * 16807) % 2147483647; return (sem - 1) / 2147483646; }; }
  function f1(v) { return v.toFixed(1); }
  function cifra(n, tot) { return U.dos(n) + '<span class="am-de">/' + U.dos(tot) + '</span>'; }
  // el círculo que rodea el número de un secreto hallado
  function aroAMano(k) {
    var r = azar(100 + k), d = '';
    for (var i = 0; i <= 22; i++) { var a = -2.3 + i / 22 * Math.PI * 2.12, rx = 14.5 + (r() - 0.5) * 1.6, ry = 11.5 + (r() - 0.5) * 1.4; d += (i ? ' L' : 'M') + f1(17 + Math.cos(a) * rx) + ',' + f1(15 + Math.sin(a) * ry); }
    return '<svg class="am-e-aro" viewBox="0 0 34 30" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  // el garabato a lápiz en lugar del nombre que aún no se sabe
  function garabato(letras, k) {
    var r = azar(300 + k), w = Math.round(letras * 11 + 10), d = 'M2,12';
    for (var x = 2; x < w; x += 7 + r() * 3) d += ' L' + f1(x + 3.5) + ',' + f1(4 + r() * 3) + ' L' + f1(x + 7) + ',' + f1(17 - r() * 3);
    return '<svg class="am-e-garabato" width="' + w + '" viewBox="0 0 ' + w + ' 22" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  // las rayitas del Diario: halladas a tinta clara (la última, en ámbar), las demás punteadas; una raya cruza cada cinco
  function marcas(n, tot, nueva) {
    var s = $('am-marcas'); if (!s) return;
    var r = azar(41), paso = 164 / tot, h = '';
    function raya(x0, y0, x1, y1, rr, amp) { var mx = (x0 + x1) / 2 + (rr() - 0.5) * amp * 2, my = (y0 + y1) / 2 + (rr() - 0.5) * amp * 2; return 'M' + f1(x0) + ',' + f1(y0) + ' Q' + f1(mx) + ',' + f1(my) + ' ' + f1(x1) + ',' + f1(y1 + (rr() - 0.5) * amp); }
    for (var i = 0; i < tot; i++) {
      var x = 6 + i * paso, d = raya(x + (r() - 0.5) * 1.6, 3 + r() * 1.4, x + 2.2 + (r() - 0.5) * 1.6, 19 - r() * 1.2, r, 0.9);
      var c = i < n ? 'am-si' + (i === n - 1 ? ' am-ult' : '') : 'am-no';
      if (nueva && i === n - 1) c += ' am-dibujando';
      h += '<path class="' + c + '" d="' + d + '"/>';
    }
    for (var g = 5; g <= n; g += 5) h += '<path class="am-cierra' + (nueva && g === n ? ' am-dibujando' : '') + '" d="' + raya(2 + (g - 5) * paso, 15, (g - 5) * paso + paso * 5 - 2, 6, azar(7 + g), 1.5) + '"/>';
    s.innerHTML = h;
  }

  function pintarLista(recien) {
    var ol = $('am-lista'); if (!ol) return;
    ol.innerHTML = '';
    huevos.forEach(function (h) {
      var ok = !!estado.hallados[h.id];
      var li = el('li', 'am-entrada' + (ok ? ' am-hallada' : '') + (recien === h.id ? ' am-nueva' : ''));
      var num = el('div', 'am-e-num', U.dos(h.n));
      if (ok) num.insertAdjacentHTML('afterbegin', aroAMano(h.n));
      li.appendChild(num);
      var c = el('div', 'am-e-cuerpo');
      var tipo = el('div', 'am-e-tipo', h.tipo);
      if (h.tramo && CORTOS[h.tramo]) tipo.appendChild(el('span', 'am-e-tramo', ' · ' + CORTOS[h.tramo]));
      c.appendChild(tipo);
      var nom = el('div', 'am-e-nombre');
      if (ok) { nom.textContent = h.nombre; if (h.original) nom.appendChild(el('span', 'am-e-original', h.original)); }
      else { nom.innerHTML = garabato(h.nombre.length, h.n); nom.setAttribute('aria-label', 'Por descubrir'); }
      c.appendChild(nom);
      c.appendChild(el('p', 'am-e-pista', h.pista));
      if ((ok || PRUEBA) && h.escena) {
        var meta = el('div', 'am-e-meta');
        if (ok) meta.appendChild(el('span', 'am-e-hallado', 'Hallado · ' + fecha(estado.hallados[h.id])));
        var b = el('button', 'am-e-ver', ok ? 'Volver a ver' : '▶ Probar');
        b.type = 'button';
        b.addEventListener('click', function () { I.disparar(h, null, { prueba: !ok, cuaderno: true }); });
        meta.appendChild(b); c.appendChild(meta);
      }
      li.appendChild(c); ol.appendChild(li);
    });
    var n = cuantos(), tot = total();
    $('am-contador').innerHTML = cifra(n, tot);
    marcas(n, tot);
    var seg = $('am-segmentos'); seg.innerHTML = ''; seg.style.gridTemplateColumns = 'repeat(' + tot + ', 1fr)';
    for (var i = 0; i < tot; i++) seg.appendChild(el('i', i < n ? 'am-si' : ''));
    $('am-ver-final').hidden = !(estado.final || (PRUEBA && final));
    $('am-c-credito-linea').hidden = !estado.final;
    raiz.classList.toggle('am-cognita', !!estado.final);
  }
  I.pintarLista = pintarLista;

  /* ---------- instrumentos ---------- */
  var cuadroHud = 0, previos = {}, tramoActual = null, eco = 0;
  I.eco = function () { return eco; };   // 0–1: cuánto «late» un secreto de lugar cercano (lo usa el loro de la proa)
  function barras(id, valor) {
    var b = Math.ceil(valor * 5 - 0.15); if (previos[id] === b) return; previos[id] = b;
    var is = $(id).children; for (var i = 0; i < is.length; i++) is[i].classList.toggle('am-si', i < b);
  }
  function texto(id, t) { if (previos[id] === t) return; previos[id] = t; $(id).textContent = t; }
  function instrumentos() {
    if (!$('am-hud')) return;
    var z = ultimo.z || 0, Mu = unidadesPorMetro(), objetivo = 0;
    huevos.forEach(function (h) {
      if (!h.lugar || estado.hallados[h.id]) return;
      var zl = typeof h.lugar === 'function' ? h.lugar() : h.lugar; if (zl == null) return;
      objetivo = Math.max(objetivo, U.clamp(1 - Math.abs(z - zl) / ((h.radio || 60) * Mu), 0, 1));
    });
    eco += (objetivo - eco) * 0.12;
    if (++cuadroHud % 5) return;
    barras('am-h-eco', eco);
    $('am-h-eco').classList.toggle('am-latiendo', eco > 0.12);
    $('am-h-eco').style.animationDuration = (1.3 - eco * 0.75).toFixed(2) + 's';
    var id = tramoEn(z);
    if (id !== tramoActual) {
      tramoActual = id; var ht = $('am-h-tramo');
      ht.classList.remove('am-cambia'); void ht.offsetWidth; ht.textContent = CORTOS[id] || id; ht.classList.add('am-cambia');
    }
    var min = horaEn(z), hh = Math.floor(min / 60) % 24, mm = Math.floor(min % 60);
    texto('am-h-hora', U.dos(hh) + ':' + U.dos(mm) + ' · ' + franja(min));
    texto('am-h-remontado', U.miles(U.clamp(z / Mu, 0, 99999)) + ' m · de ' + U.miles(largo() / Mu));
  }

  /* ---------- teclas pulsadas (para el secreto de teclado) ---------- */
  function mostrarTecla(key) {
    if (escena) return;
    if (!(key.length === 1 && /[a-zà-ÿ0-9]/i.test(key))) return;
    var cont = $('am-teclas'); if (!cont) return;
    var k = el('kbd', '', key.toUpperCase());
    cont.appendChild(k);
    while (cont.children.length > 10) cont.removeChild(cont.firstChild);
    setTimeout(function () { if (k.parentNode) k.parentNode.removeChild(k); }, 2300);
  }

  /* ---------- la medalla de la entrada: la canoa y la samaúma al atardecer ---------- */
  function medalla() {
    var cv = $('am-intro-medalla'); if (!cv || !cv.getContext) return;
    var d = Math.min(2, window.devicePixelRatio || 1), sz = 168, c2 = sz / 2; cv.width = cv.height = sz * d;
    var c = cv.getContext('2d'); c.scale(d, d);
    c.save(); c.beginPath(); c.arc(c2, c2, c2 - 2, 0, Math.PI * 2); c.clip();
    // el cielo: de violeta tostado arriba al ámbar del horizonte
    var g = c.createLinearGradient(0, 0, 0, 104);
    g.addColorStop(0, '#2a1a1c'); g.addColorStop(0.55, '#7a3a22'); g.addColorStop(0.88, '#e0782c'); g.addColorStop(1, '#ffb347');
    c.fillStyle = g; c.fillRect(0, 0, sz, 104);
    // el sol, bajo, delante (río arriba es el oeste)
    var gs = c.createRadialGradient(66, 98, 0, 66, 98, 46); gs.addColorStop(0, 'rgba(255,224,160,.95)'); gs.addColorStop(0.22, 'rgba(255,190,96,.55)'); gs.addColorStop(1, 'rgba(255,170,70,0)');
    c.fillStyle = gs; c.fillRect(0, 40, sz, 70);
    c.fillStyle = '#fff0c8'; c.beginPath(); c.arc(66, 99, 9, Math.PI, 0); c.fill();
    // la selva lejana: una franja baja e irregular
    c.fillStyle = '#2b1810';
    c.beginPath(); c.moveTo(0, 104);
    for (var x = 0; x <= sz; x += 4) c.lineTo(x, 99 - Math.abs(Math.sin(x * 0.21) * 2.4) - Math.abs(Math.sin(x * 0.07 + 1) * 2.2));
    c.lineTo(sz, 104); c.fill();
    // la samaúma: tronco, raíces en tabla y copa en sombrilla
    c.fillStyle = '#1a0f0a';
    c.beginPath(); c.moveTo(118, 104); c.lineTo(121.5, 54); c.lineTo(125.5, 54); c.lineTo(129, 104); c.fill();
    c.beginPath(); c.moveTo(106, 104); c.quadraticCurveTo(118, 98, 121, 84); c.lineTo(122, 104); c.fill();
    c.beginPath(); c.moveTo(141, 104); c.quadraticCurveTo(129, 98, 126.5, 86); c.lineTo(125.5, 104); c.fill();
    c.lineWidth = 2; c.strokeStyle = '#1a0f0a'; c.lineCap = 'round';
    [[123.5, 60, 104, 46], [123.5, 58, 145, 44], [123.5, 64, 98, 56], [123.5, 63, 150, 55]].forEach(function (r) { c.beginPath(); c.moveTo(r[0], r[1]); c.quadraticCurveTo((r[0] + r[2]) / 2, r[3] + 3, r[2], r[3]); c.stroke(); });
    [[123, 40, 30, 9], [100, 46, 15, 6], [148, 45, 16, 6], [94, 54, 9, 4], [154, 53, 9, 4], [112, 36, 13, 6], [136, 36, 13, 6]].forEach(function (e) { c.beginPath(); c.ellipse(e[0], e[1], e[2], e[3], 0, 0, Math.PI * 2); c.fill(); });
    // el río: espejo del cielo con estrías de luz
    var ga = c.createLinearGradient(0, 104, 0, sz);
    ga.addColorStop(0, '#9a4e24'); ga.addColorStop(0.35, '#4a2414'); ga.addColorStop(1, '#1c0f09');
    c.fillStyle = ga; c.fillRect(0, 104, sz, sz - 104);
    var r = (function (s) { return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; })(7);
    for (var i = 0; i < 26; i++) {
      var y = 106 + Math.pow(r(), 1.6) * 52, w = (4 + r() * 26) * (1 - (y - 104) / 90), cx = 66 + (r() - 0.5) * (8 + (y - 104) * 1.1);
      c.fillStyle = 'rgba(255,214,150,' + (0.55 - (y - 104) / 130).toFixed(3) + ')'; c.fillRect(cx - w / 2, y, w, 1);
    }
    // la canoa con quien rema
    c.fillStyle = '#120a06';
    c.beginPath(); c.moveTo(40, 121); c.quadraticCurveTo(58, 127, 80, 121); c.quadraticCurveTo(60, 124.5, 40, 121); c.fill();
    c.beginPath(); c.ellipse(60, 116.5, 2.4, 4.2, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(60, 110.8, 2, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.1; c.strokeStyle = '#120a06'; c.beginPath(); c.moveTo(55, 111); c.lineTo(67, 127); c.stroke();
    c.fillStyle = 'rgba(255,214,150,.28)'; c.fillRect(42, 124.5, 36, 0.8);
    // grano de puntos de la familia
    c.fillStyle = 'rgba(243,230,207,.10)'; for (y = 3; y < sz; y += 6) for (x = 3; x < sz; x += 6) c.fillRect(x, y, 1, 1);
    c.restore();
    // el aro punteado en el acento
    c.fillStyle = 'rgba(255,179,71,.85)';
    for (i = 0; i < 120; i++) { var an = i / 120 * Math.PI * 2; c.fillRect(c2 + Math.cos(an) * (c2 - 1.5) - 0.8, c2 + Math.sin(an) * (c2 - 1.5) - 0.8, 1.6, 1.6); }
    cv.classList.add('am-listo');
  }
  I.medalla = medalla;

  /* ---------- créditos ---------- */
  function mostrarCreditos() {
    var c = $('am-creditos');
    c.hidden = false; c.classList.remove('am-saliendo'); void c.offsetWidth; c.classList.add('am-visible');
    AM.pedir('bloquear', true);
    setTimeout(function () { var b = $('am-creditos-enlace'); try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); } }, 2600);
  }
  function cerrarCreditos() {
    var c = $('am-creditos'); if (c.hidden) return;
    c.classList.remove('am-visible'); c.classList.add('am-saliendo');
    setTimeout(function () { c.hidden = true; c.classList.remove('am-saliendo'); AM.pedir('bloquear', bloqueoUI()); tocado(); }, 650);
  }
  I.mostrarCreditos = mostrarCreditos; I.cerrarCreditos = cerrarCreditos;

  /* ---------- la entrada (solo la primera vez) ---------- */
  I.mostrarIntro = function (alEmpezar) {
    var intro = $('am-intro');
    intro.hidden = false; AM.pedir('bloquear', true);
    medalla();
    var b = $('am-empezar');
    b.onclick = function () {
      estado.introVista = true; guardar();
      intro.classList.add('am-saliendo');
      setTimeout(function () { intro.hidden = true; intro.classList.remove('am-saliendo'); AM.pedir('bloquear', bloqueoUI()); tocado(); }, 900);
      alEmpezar && alEmpezar();
    };
    setTimeout(function () { try { b.focus({ preventScroll: true }); } catch (e) { /* nada */ } }, 50);
  };

  /* ---------- el bucle propio ---------- */
  function latido(dt) {
    reloj.t += dt;
    avanzarEscena(dt);
    instrumentos();
    emitir('pulso', { t: reloj.t, dt: dt });
  }
  function bucle(ahora) {
    if (!reloj.congelado) {
      var dt = reloj.previo == null ? 16 : Math.min(100, ahora - reloj.previo);
      latido(dt);
    }
    reloj.previo = ahora;
    requestAnimationFrame(bucle);
  }

  /* ---------- arranque ---------- */
  var iniciado = false;
  I.iniciar = function (motor) {
    if (iniciado) return; iniciado = true;
    M = motor || null;
    I.motor = M;
    cargar();
    var tactil = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var ay = $('am-ayuda');
    if (ay && !ay.dataset.fijo) ay.textContent = tactil ? 'Desliza para remar · arrastra para mirar · toca el agua' : 'Rueda o ↑ ↓ para remar · arrastra para mirar · toca el agua';

    // los eventos del motor → estado y detectores
    if (M && M.en) {
      M.en('cuadro', function (d) {
        if (!d) return;
        for (var k in d) ultimo[k] = d[k];
        if (d.remo && Math.abs(d.remo) > 0.02) tocado();
        emitir('cuadro', ultimo);
      });
      M.en('clic', function (d) { tocado(); emitir('clic', d || {}); });
      M.en('limite', function (d) { emitir('limite', d || {}); });
      M.en('fruto', function (d) { emitir('fruto', d || {}); });
    }
    // la entrada de la persona (para la espera) y el teclado
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (n) { window.addEventListener(n, tocado, { capture: true, passive: true }); });
    window.addEventListener('pointermove', function (e) { if (e.buttons) tocado(); }, { capture: true, passive: true });
    window.addEventListener('keydown', function (e) {
      tocado();
      var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (escena) I.saltar();
        else if (cuadernoAbierto()) cerrarCuaderno();
        else if (!$('am-creditos').hidden) cerrarCreditos();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      mostrarTecla(e.key);
      emitir('tecla', { key: e.key });
    });

    // los detectores
    huevos.forEach(function (h) {
      if (!h.detectar) return;
      try {
        h.detectar({
          motor: M,
          en: oir,
          hallado: function () { return !!estado.hallados[h.id]; },
          disparar: function (datos) { return I.disparar(h, datos); },
          tramo: function () { return tramoEn(ultimo.z || 0); },
          ultimo: function () { return ultimo; },
          ahora: I.ahora,
          quieto: I.quieto
        });
      } catch (e) { console.error('detectar ' + h.id, e); }
    });

    $('am-b-cuaderno').addEventListener('click', function () { cuadernoAbierto() ? cerrarCuaderno() : abrirCuaderno(); });
    $('am-cerrar-cuaderno').addEventListener('click', cerrarCuaderno);
    $('am-saltar').addEventListener('click', function () { I.saltar(); });
    $('am-ver-final').addEventListener('click', function () { I.verFinal(); });
    $('am-borrar').addEventListener('click', function () {
      if (!window.confirm('¿Borrar los secretos encontrados en este navegador?')) return;
      estado = { hallados: {}, final: false, introVista: true }; guardar(); pintarLista();
    });
    $('am-creditos-nombre').textContent = AUTOR.nombre;
    $('am-c-credito-nombre').textContent = AUTOR.nombre;
    $('am-creditos-enlace').href = AUTOR.linkedin; $('am-c-credito').href = AUTOR.linkedin;
    $('am-creditos-cerrar').addEventListener('click', cerrarCreditos);

    pintarLista();
    I.introPendiente = !estado.introVista && !PRUEBA;
    tocado();
    requestAnimationFrame(bucle);
  };

  // el mundo ya se ve: fuera la carga, la entrada la primera vez y, si la dirección lo pide, #id / #final / #creditos
  var yaListo = false;
  I.listo = function () {
    if (yaListo) return; yaListo = true;
    var c = $('am-cargando');
    if (c) { c.classList.add('am-fuera'); setTimeout(function () { c.hidden = true; }, 800); }
    if (I.introPendiente) I.mostrarIntro();
    if (AM.libro) setTimeout(AM.libro.cargar, 1200);   // el cuaderno de expedición (6 MB): cuando el mundo ya se ve
    if (location.hash.length > 1) {
      var id = decodeURIComponent(location.hash.slice(1));
      if (I.debug.ids().indexOf(id) >= 0 || id === 'final' || id === 'creditos') setTimeout(function () { I.debug.disparar(id); }, 700);
    }
  };

  /* ---------- depuración (AM.debug si el motor no pone el suyo; si no, AM.debugInterfaz) ---------- */
  function buscar(id) { for (var i = 0; i < huevos.length; i++) if (huevos[i].id === id) return huevos[i]; return null; }
  I.debug = {
    disparar: function (id, datos) {
      if (id === 'final') return I.verFinal();
      if (id === 'creditos') { mostrarCreditos(); return true; }
      var h = buscar(id); return h ? I.disparar(h, datos, { prueba: true }) : false;
    },
    ids: function () { return huevos.map(function (h) { return h.id; }); },
    congelar: function () { reloj.congelado = true; },
    soltar: function () { reloj.congelado = false; reloj.previo = null; },
    // avanzar el reloj a mano (en trozos de ~16 ms), para las pruebas sin ventana
    paso: function (ms, trozo) { trozo = trozo || 16; while (ms > 0) { var d = Math.min(trozo, ms); latido(d); ms -= d; } },
    // simular un evento del motor como si llegara de verdad
    simular: function (n, d) {
      d = d || {};
      if (n === 'cuadro') { for (var k in d) ultimo[k] = d[k]; if (d.remo && Math.abs(d.remo) > 0.02) tocado(); emitir('cuadro', ultimo); }
      else if (n === 'tecla') { tocado(); emitir('tecla', d); }
      else { if (n === 'clic') tocado(); emitir(n, d); }
    },
    quieto: function (ms) { ultimoInput = reloj.t - ms; },
    estado: function () { return { hallados: Object.keys(estado.hallados), final: estado.final, escena: escena && escena.id, t: reloj.t, tramo: tramoEn(ultimo.z || 0), z: ultimo.z }; },
    borrar: function () { estado = { hallados: {}, final: false, introVista: true }; guardar(); pintarLista(); },
    hallar: function (ids) { (ids || I.debug.ids()).forEach(function (id) { estado.hallados[id] = Date.now(); }); guardar(); pintarLista(); }
  };
  if (!AM.debug) AM.debug = I.debug; else AM.debugInterfaz = I.debug;
})();
