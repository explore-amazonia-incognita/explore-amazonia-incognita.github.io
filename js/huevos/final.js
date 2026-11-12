/* Amazonia Incognita · el final
   (Pau, 12/11: «el final, con las dos a la vez»: las luciérnagas y el mapa del río)
   Con los diez, la canoa llega a la samaúma y la mirada sube despacio por el tronco (js/mundo.js, reproducir('final'))
   mientras cientos de luciérnagas suben del agua. Diez de ellas, grandes, son los diez secretos: salen del agua en su
   sitio del mundo (proyectadas desde 3D, así se mueven con la cámara), suben hasta la copa y, al llegar, dicen su
   nombre. Después vuelan, en arco, cada una a su lugar en el mapa del viaje, de Manaus a la samaúma; el río se dibuja
   uniéndolas y cada una se enciende al pasar la luz. Luego, en grande, «Amazonia incognita»: una línea tacha el «in»,
   queda «cognita» y el título vuela a su sitio arriba a la izquierda. Al final, la tarjeta y los créditos.
   Los que falten (solo en «Volver a ver» de prueba) quedan apagados. Todo va con el reloj de la escena (cuadro(t)).  */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz, U = I.util;
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function eo(k) { return 1 - Math.pow(1 - k, 3); }
  function eio(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
  function e2(k) { return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; }
  function sonar(n, d) { if (AM.sonidoUI) try { AM.sonidoUI(n, d); } catch (e) { /* sin sonido */ } }
  function cruza(a, b, x) { return a < x && b >= x; }

  // el tiempo (ms): A, suben; B, vuelan al mapa; M, el río se dibuja; T, el título; la tarjeta
  var TB = 9500, TM = TB + 1500, DM = 5500, TD = TM + DM + 1000, TT = TD + 500, TC = TT + 6800;
  var NOTAS = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  // el río del mapa (apaisado) y dónde cae cada secreto (fracción del viaje, a mitad de su tramo)
  var RIO = [[50, 560], [140, 548, 170, 480, 250, 474], [340, 468, 330, 400, 410, 384], [500, 366, 470, 296, 560, 284], [650, 272, 640, 206, 720, 194], [800, 182, 790, 116, 868, 100], [900, 94, 930, 82, 950, 66]];
  var DONDE = { teatro: 0.035, 'mar-dulce': 0.075, encuentro: 0.149, tambaqui: 0.257, crecida: 0.364, 'vitoria-regia': 0.464, 'rios-voladores': 0.629, boto: 0.795, amazonas: 0.902, sapopemas: 0.985 };

  function camino(vertical) {        // en el móvil, el mismo río de pie (de abajo arriba)
    function p(x, y) { return vertical ? [(200 + (620 - y - 60) / 494 * 260).toFixed(1), (1000 - x).toFixed(1)] : [x, y]; }
    var d = 'M' + p(RIO[0][0], RIO[0][1]).join(',');
    for (var i = 1; i < RIO.length; i++) { var c = RIO[i]; d += ' C' + p(c[0], c[1]).join(',') + ' ' + p(c[2], c[3]).join(',') + ' ' + p(c[4], c[5]).join(','); }
    return d;
  }

  AM.registrarFinal({
    escena: function (M, datos) {
      var lista = (datos && datos.huevos) || I.huevos(), hallados = (datos && datos.hallados) || {};
      var todos = lista.every(function (h) { return hallados[h.id]; });
      var D = TC + 7000 + I.LECTURA, capa = $('am-final'), movil = innerWidth < 760 || innerWidth / innerHeight < 0.95;
      var S = null, luces = [], mapa = null, rio = null, luzRio = null, cabeza = null, finTxt = null, L = 0, puntosPantalla = null;
      var titulo = null, caja = null, letras = [], pre = null, preW = 0, vuelo = null, previo = -1;

      function montar() {
        capa.innerHTML = ''; capa.className = 'am-final am-fn' + (movil ? ' am-fn-movil' : '');
        var velo = document.createElement('div'); velo.className = 'am-fn-velo'; capa.appendChild(velo);
        // el mapa
        mapa = document.createElement('div'); mapa.className = 'am-fn-mapa';
        var vb = movil ? '0 0 620 1000' : '0 0 1000 620', d = camino(movil);
        mapa.innerHTML = '<svg viewBox="' + vb + '"><defs><filter id="am-fn-brillo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter></defs>' +
          '<path class="am-fn-orilla" d="' + d + '" transform="translate(' + (movil ? '-14,0' : '0,-16') + ')"/><path class="am-fn-orilla" d="' + d + '" transform="translate(' + (movil ? '14,0' : '0,16') + ')"/>' +
          '<path class="am-fn-rioluz" d="' + d + '"/><path class="am-fn-rio" d="' + d + '"/></svg>';
        capa.appendChild(mapa);
        var svg = mapa.querySelector('svg'); rio = svg.querySelector('.am-fn-rio'); luzRio = svg.querySelector('.am-fn-rioluz'); L = rio.getTotalLength();
        [rio, luzRio].forEach(function (p) { p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
        function el(t, at, padre) { var e = document.createElementNS(NS, t); for (var k in at) e.setAttribute(k, at[k]); (padre || svg).appendChild(e); return e; }
        var p0 = rio.getPointAtLength(0), pL = rio.getPointAtLength(L);
        el('text', { x: p0.x + (movil ? 0 : 0), y: p0.y + 34, class: 'am-fn-extremo', 'text-anchor': movil ? 'middle' : 'start' }).textContent = 'Manaus · 0 m';
        finTxt = el('text', { x: pL.x, y: pL.y - 22, class: 'am-fn-extremo', 'text-anchor': movil ? 'middle' : 'end' }); finTxt.textContent = 'Samaúma · ' + U.miles(1728) + ' m';
        cabeza = el('circle', { r: 4, class: 'am-fn-cabeza' });
        // las diez luces (cada una con su estela y su nombre) y su marca en el mapa
        S = AM.pedir('samauma') || null;
        lista.forEach(function (h, i) {
          var ok = !!hallados[h.id], f = DONDE[h.id] != null ? DONDE[h.id] : (i + 0.5) / lista.length;
          var p = rio.getPointAtLength(f * L), q = rio.getPointAtLength(Math.min(L, f * L + 2)), nx = -(q.y - p.y), ny = q.x - p.x, nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          var lado = movil ? (p.x > 310 ? 1 : -1) : (i % 2 ? 1 : -1), dist = movil ? 26 : 46;
          if (movil) { nx = 1; ny = 0; }
          var ox = p.x + nx * dist * lado, oy = p.y + ny * dist * lado, g = el('g', {});
          var anillo = el('circle', { cx: p.x, cy: p.y, r: 5, class: 'am-fn-anillo' }, g);
          var punto = el('circle', { cx: p.x, cy: p.y, r: 3.2, class: 'am-fn-punto' + (ok ? '' : ' am-apagado') }, g);
          var guia = el('line', { x1: p.x + nx * 8 * lado, y1: p.y + ny * 8 * lado, x2: ox, y2: oy, class: 'am-fn-guia' }, g), gl = Math.hypot(ox - p.x, oy - p.y) - 8;
          guia.style.strokeDasharray = gl; guia.style.strokeDashoffset = gl;
          var der = ox >= p.x, tx = el('text', { x: ox + (der ? 8 : -8), y: oy + 4, 'text-anchor': der ? 'start' : 'end', class: ok ? '' : 'am-apagado' }, g);
          var num = U.dos(h.n), tn = document.createElementNS(NS, 'tspan'); tn.setAttribute('class', 'am-fn-n'); var tt = document.createElementNS(NS, 'tspan');
          if (movil) { tn.textContent = num; tx.appendChild(tn); }
          else if (der) { tn.textContent = num + '  '; tt.textContent = h.nombre; tx.appendChild(tn); tx.appendChild(tt); }
          else { tt.textContent = h.nombre + '  '; tn.textContent = num; tx.appendChild(tt); tx.appendChild(tn); }
          [anillo].forEach(function (c) { c.style.transformBox = 'fill-box'; c.style.transformOrigin = 'center'; });
          var luz = null, etq = null, estela = [];
          if (ok) {
            luz = document.createElement('div'); luz.className = 'am-fn-luz'; capa.appendChild(luz);
            for (var k = 0; k < 6; k++) { var e = document.createElement('div'); e.className = 'am-fn-estela'; capa.appendChild(e); estela.push(e); }
            etq = document.createElement('div'); etq.className = 'am-fn-etq';
            etq.innerHTML = (lado > 0 ? '<b>' + num + '</b>' + h.nombre : h.nombre + '<b class="am-dcha">' + num + '</b>'); capa.appendChild(etq);
          }
          // en el mundo: sale del agua entre la canoa y el árbol y sube a la copa
          var sx = S ? S.x : 420, sz = S ? S.z : 0, sem = Math.sin(i * 12.9898) * 43758.5453; sem -= Math.floor(sem);
          luces.push({ h: h, ok: ok, f: f, lado: lado, luz: luz, etq: etq, estela: estela, anillo: anillo, punto: punto, guia: guia, gl: gl, tx: tx, nota: NOTAS[i % 10],
            t0: 1100 + i * 520, dur: 3600, fase: i * 1.7,
            p0: [sx - 900 + ((i * 0.37) % 1) * 1800, 4, sz - 600 - sem * 700],
            p1: [sx + (i % 2 ? 1 : -1) * (180 + 320 * Math.abs(Math.sin(i * 1.7))) + (i / 9 - 0.5) * 300, 900 + i * 165, sz - 250],
            ultimo: null, desde: null, hecho: false });
        });
        // el título grande
        titulo = document.createElement('div'); titulo.className = 'am-fn-titulo';
        titulo.innerHTML = '<div class="am-fn-caja"><h2><span class="am-fn-a"></span> <em><span class="am-fn-pre"></span><span class="am-fn-b"></span></em></h2><p>Los diez secretos del río · ' + U.dos(lista.filter(function (h) { return hallados[h.id]; }).length) + ' / ' + U.dos(lista.length) + '</p></div>';
        capa.appendChild(titulo); caja = titulo.querySelector('.am-fn-caja');
        function partes(sel, txt) { var c = titulo.querySelector(sel); txt.split('').forEach(function (ch) { var s = document.createElement('span'); s.className = 'am-fn-letra'; s.textContent = ch; c.appendChild(s); letras.push(s); }); }
        partes('.am-fn-a', 'Amazonia'); partes('.am-fn-pre', 'in'); partes('.am-fn-b', 'cognita');
        pre = titulo.querySelector('.am-fn-pre');
        capa.style.opacity = 1;
      }

      function trayecto(c, u, t) {     // la luz en el mundo a una altura u (0 agua … 1 copa), con su vaivén
        var e = eo(cl(u)), w = Math.sin(t / 700 + c.fase) * 40 * (1 - e * 0.5);
        var x = c.p0[0] + (c.p1[0] - c.p0[0]) * e + w + Math.sin(e * Math.PI) * 160 * c.lado, y = c.p0[1] + (c.p1[1] - c.p0[1]) * e + Math.cos(t / 900 + c.fase) * 12, z = c.p0[2] + (c.p1[2] - c.p0[2]) * e;
        return AM.pedir('proyectar', x, y, z) || null;
      }
      function poner(e, x, y, esc, op) { e.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + esc.toFixed(3) + ')'; e.style.opacity = op.toFixed(3); }

      function cuadro(t) {
        var antes = previo; previo = t;
        if (!titulo) return;
        // la mirada sube por el tronco hasta la copa; del agua suben luciérnagas (en el mundo, js/mundo.js)
        if (S && antes < 2400 && t >= 2400) AM.pedir('mirarPunto', S.x, 2300, S.z, 7600);
        if (t < 10500 && Math.floor(t / 220) !== Math.floor(Math.max(0, antes) / 220)) AM.pedir('luciernagas', 9);
        capa.querySelector('.am-fn-velo').style.opacity = (0.35 * cl((t - 600) / 3000) + 0.4 * cl((t - TB) / 1500)).toFixed(3);
        // ---- A: suben del agua a la copa (en el mundo); B: vuelan al mapa (en la pantalla) ----
        if (t >= TB && !puntosPantalla) {
          var ctm = mapa.querySelector('svg').getScreenCTM(), sp = mapa.querySelector('svg').createSVGPoint();
          puntosPantalla = luces.map(function (c) { sp.x = +c.punto.getAttribute('cx'); sp.y = +c.punto.getAttribute('cy'); var q = sp.matrixTransform(ctm); return [q.x, q.y]; });
          sonar('chispa', { dur: 1.6 });
        }
        var atenua = 1 - 0.78 * cl((t - TD) / 1400);
        luces.forEach(function (c, i) {
          if (!c.ok) return;
          var u = (t - c.t0) / c.dur, pulso = 0.82 + 0.18 * Math.sin(t / 1000 * 2.6 + c.fase);
          if (t < TB || !puntosPantalla) {
            if (u <= 0) { poner(c.luz, -99, -99, 1, 0); c.estela.forEach(function (e) { e.style.opacity = 0; }); c.etq.style.opacity = 0; return; }
            var p = trayecto(c, u, t); if (!p || p[2] <= 0) return;
            c.ultimo = [p[0], p[1]];
            poner(c.luz, p[0], p[1], pulso, cl(u * 4));
            c.estela.forEach(function (e, k) { var q = u < 1.3 ? trayecto(c, u - (k + 1) * 0.035, t) : null; if (q && q[2] > 0) poner(e, q[0], q[1], 1 - k * 0.12, 0.5 * (1 - k / 6) * cl(1.3 - u) * cl(u * 4)); else e.style.opacity = 0; });
            var ke = cl((u - 0.8) / 0.25); c.etq.style.opacity = ke; c.etq.style.transform = 'translate3d(' + (c.lado > 0 ? p[0] + 22 : p[0] - 22 - c.etq.offsetWidth).toFixed(1) + 'px,' + (p[1] - 6).toFixed(1) + 'px,0)';
            c.etq.style.filter = 'blur(' + ((1 - ke) * 4).toFixed(2) + 'px)';
            if (antes >= 0 && cruza((antes - c.t0) / c.dur, u, 0.8)) sonar('campana', { f: c.nota, dur: 2.4, vol: 0.05 });
          } else {
            if (!c.desde) c.desde = c.ultimo || [innerWidth / 2, innerHeight / 2];
            var v = cl((t - TB - i * 120) / 1600), ev = eio(v), d = puntosPantalla[i];
            var qx = c.desde[0] + (d[0] - c.desde[0]) * ev, qy = c.desde[1] + (d[1] - c.desde[1]) * ev - Math.sin(ev * Math.PI) * 90;
            poner(c.luz, qx, qy, (v < 1 ? pulso : 0.7 + 0.25 * Math.sin(t / 1000 * 2.2 + c.fase)), atenua);
            c.estela.forEach(function (e, k) { var w = eio(cl(v - (k + 1) * 0.03)); poner(e, c.desde[0] + (d[0] - c.desde[0]) * w, c.desde[1] + (d[1] - c.desde[1]) * w - Math.sin(w * Math.PI) * 90, 1 - k * 0.12, v < 1 && v > 0 ? 0.4 * (1 - k / 6) : 0); });
            c.etq.style.opacity = 1 - cl((t - TB) / 500);
          }
        });
        // ---- el mapa: aparece, el río se dibuja y enciende cada secreto ----
        mapa.style.opacity = (cl((t - TB - 300) / 1200) * (1 - 0.6 * cl((t - TD) / 1400)) * (1 - 0.35 * cl((t - TC) / 1200))).toFixed(3);   // detrás de la tarjeta, más apagado
        var um = cl((t - TM) / DM), em = e2(um), off = L * (1 - em), ph = rio.getPointAtLength(em * L);
        rio.style.strokeDashoffset = off; luzRio.style.strokeDashoffset = off;
        cabeza.setAttribute('cx', ph.x); cabeza.setAttribute('cy', ph.y); cabeza.style.opacity = um > 0 && um < 1 ? 1 : 0;
        luces.forEach(function (c) {
          var tE = TM + c.f * DM * 1.0, k = (t - tE);   // aproximado: cuando la cabeza pasa por su sitio
          if (!c.tE) { var a = 0, b = 1; for (var it = 0; it < 22; it++) { var m = (a + b) / 2; if (e2(m) < c.f) a = m; else b = m; } c.tE = TM + a * DM; }
          k = t - c.tE;
          c.punto.style.opacity = k >= 0 ? 1 : 0;
          var kr = cl(k / 1300); c.anillo.style.opacity = k >= 0 && c.ok ? (0.9 * (1 - kr)).toFixed(3) : 0; c.anillo.style.transform = 'scale(' + (1 + 5 * eo(kr)).toFixed(3) + ')';
          c.guia.style.strokeDashoffset = (c.gl * (1 - eo(cl((k - 150) / 500)))).toFixed(1);
          var kt = cl((k - 400) / 900); c.tx.style.opacity = kt * (c.ok ? 1 : 0.5); c.tx.style.transform = 'translateY(' + ((1 - kt) * 6).toFixed(1) + 'px)';
          if (c.ok && antes >= 0 && antes < c.tE && t >= c.tE) sonar('campana', { f: c.nota, dur: 2.4, vol: 0.045 });
        });
        finTxt.style.opacity = cl((t - TM - DM) / 800);
        // ---- el título: letra a letra, se tacha el «in», queda «cognita» y vuela a su sitio ----
        titulo.style.opacity = t >= TT ? 1 : 0;
        letras.forEach(function (l, i) { var k = cl((t - TT - 100 - i * 55) / 1200), e = eo(k); l.style.opacity = k.toFixed(3); l.style.transform = 'translateY(' + ((1 - e) * 30).toFixed(1) + '%)'; l.style.filter = k < 1 ? 'blur(' + ((1 - k) * 8).toFixed(2) + 'px)' : 'none'; });
        var pp = titulo.querySelector('p'), kp = cl((t - TT - 1200) / 1500); pp.style.opacity = kp * (1 - cl((t - TT - 5200) / 400)); pp.style.letterSpacing = (0.6 - 0.28 * eo(kp)).toFixed(3) + 'em';
        titulo.style.setProperty('--am-tachar', eo(cl((t - TT - 2300) / 800)).toFixed(3));
        if (!preW && t >= TT) preW = pre.getBoundingClientRect().width;
        var kc = eio(cl((t - TT - 3200) / 1100)); pre.style.maxWidth = preW ? (preW * (1 - kc)).toFixed(1) + 'px' : ''; pre.style.opacity = (1 - kc).toFixed(3);
        if (antes >= 0 && cruza(antes, t, TT)) sonar('acorde', { fs: [110, 164.81, 220, 277.18], dur: 7, vol: 0.05 });
        if (antes >= 0 && cruza(antes, t, TT + 2300)) { sonar('campana', { f: 523.25, dur: 4, vol: 0.07 }); sonar('campana', { f: 783.99, dur: 4, vol: 0.05, retraso: 0.1 }); sonar('campana', { f: 1046.5, dur: 4.5, vol: 0.035, retraso: 0.25 }); }
        if (t >= TT + 5200) {
          if (!vuelo) { var r = caja.getBoundingClientRect(), m = document.querySelector('.am-marca .am-titulo'), mr = m ? m.getBoundingClientRect() : { left: 40, top: 30, height: 36 };
            vuelo = { dx: mr.left - r.left, dy: mr.top - r.top, k: mr.height / Math.max(1, titulo.querySelector('h2').getBoundingClientRect().height) }; }
          var kv = eio(cl((t - TT - 5200) / 1500));
          caja.style.transform = 'translate(' + (vuelo.dx * kv).toFixed(1) + 'px,' + (vuelo.dy * kv).toFixed(1) + 'px) scale(' + (1 + (vuelo.k - 1) * kv).toFixed(4) + ')';
          titulo.style.opacity = 1 - cl((t - TT - 6300) / 400);
        } else caja.style.transform = 'none';
        if (todos && t >= TT + 6550) document.documentElement.classList.add('am-cognita');
        // al final, todo se va
        if (t > D - 1600) capa.style.opacity = (1 - cl((t - (D - 1600)) / 1200)).toFixed(3);
      }

      return {
        duracion: D,
        tarjeta: { en: TC, hasta: D - 400, titulo: 'Amazonia cognita', pie: 'Rio acima · los diez secretos del río',
          texto: 'Has encontrado los diez secretos del río. En kilómetro y medio has subido del puerto de Manaus a la samaúma, del alba a la noche y otra vez al alba. El Amazonas lleva más agua que ningún otro río de la Tierra y su cuenca ocupa unos 7 millones de km², casi catorce veces España. La selva desconocida ya lo es un poco menos.' },
        inicio: function () {
          AM.pedir('ir', I.largo(), 2400);
          AM.pedir('reproducir', 'final', { duracion: D, hallados: lista.map(function (h) { return !!hallados[h.id]; }) });
          if (!capa) return;
          montar(); cuadro(0);
        },
        cuadro: function (t) { if (capa) cuadro(t); },
        fin: function () {
          if (todos) document.documentElement.classList.add('am-cognita');
          if (capa) { capa.style.opacity = 0; setTimeout(function () { if (capa.style.opacity === '0') { capa.innerHTML = ''; capa.className = 'am-final'; } }, 900); }
        }
      };
    }
  });
})();
