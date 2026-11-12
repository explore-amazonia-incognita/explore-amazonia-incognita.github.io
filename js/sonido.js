// Amazonia Incognita · el sonido (Pau, 12/11: «una inmersión sonora, como Dolby Atmos: con cascos, que si la tormenta
// está a tu derecha la oigas a la derecha, con un bajo muy grave en los truenos, y que cada tramo sea un mundo»).
//
// Cómo está hecho:
//   · Todo lo que suena tiene un sitio en el mundo y pasa por un PannerNode HRTF (binaural): con cascos, cada sonido
//     viene de donde está y gira con la cabeza. El oyente es la cámara (posición y orientación, cada fotograma).
//   · Ambientes de cada tramo (grabaciones generadas con Higgsfield/Mirelo, datos/sonidos.js): cuatro copias del bucle
//     repartidas en las dos orillas, delante y detrás, a destiempo; entre tramos se funden como la luz.
//   · Por código, porque reaccionan a lo que pasa: lluvia (y el muro de lluvia que se oye venir), viento, el agua de la
//     proa y de la estela, el remo, los golpes en la canoa y sus cosas, el sub-grave de los truenos.
//   · Una reverberación por tramo (respuestas al impulso generadas): el puerto, el río abierto, el bosque inundado, la noche.
//   · Todo arranca con el primer gesto (los navegadores no dejan sonar antes). Botón de silencio abajo a la derecha.
// Coordenadas: las de Three (X = −x lógico); mundo.js pasa la cámara y las posiciones ya en Three.
(function () {
  'use strict';
  var AM = window.AM = window.AM || {};
  var A = AM.audio = { activo: false, silencio: false };
  var ctx = null, salida, mezcla, limitador, subBus, revA, revB, revGA, revGB, revEnvio, buffers = {}, ruidos = {};
  var M = 41.7;
  var CLAVE = 'amazonia-incognita.sonido';

  // ======================= arranque =======================
  function arrancar() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -8; limitador.knee.value = 6; limitador.ratio.value = 6; limitador.attack.value = 0.004; limitador.release.value = 0.25;
    salida = ctx.createGain(); salida.gain.value = A.silencio ? 0 : 1;
    mezcla = ctx.createGain(); mezcla.gain.value = 0.9;
    subBus = ctx.createGain(); subBus.gain.value = 1;              // los graves: sin posición (el grave no tiene dirección)
    mezcla.connect(limitador); subBus.connect(limitador); limitador.connect(salida); salida.connect(ctx.destination);
    // dos reverberaciones que se funden (la del tramo de antes y la del siguiente)
    revEnvio = ctx.createGain(); revEnvio.gain.value = 1;
    revA = ctx.createConvolver(); revB = ctx.createConvolver(); revGA = ctx.createGain(); revGB = ctx.createGain();
    revEnvio.connect(revA); revEnvio.connect(revB); revA.connect(revGA); revB.connect(revGB); revGA.connect(mezcla); revGB.connect(mezcla);
    hacerRuidos();
    cargarMuestras();
    A.activo = true;
    if (ctx.state === 'suspended') ctx.resume();
    if (boton) boton.classList.add('on');
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { addEventListener(ev, arrancar, { passive: true, capture: true }); });

  // ======================= ruidos y muestras =======================
  function bufferRuido(seg, tipo) {
    var n = Math.floor(ctx.sampleRate * seg), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, ult = 0;
      for (var i = 0; i < n; i++) {
        var w = Math.random() * 2 - 1;
        if (tipo === 'rosa') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else if (tipo === 'marron') { ult = (ult + 0.02 * w) / 1.02; d[i] = ult * 3.5; }
        else d[i] = w * 0.5;
      }
      // sin chasquido al dar la vuelta: los últimos 50 ms se funden con los primeros
      var F = Math.floor(ctx.sampleRate * 0.05);
      for (i = 0; i < F; i++) { var k = i / F; d[n - F + i] = d[n - F + i] * (1 - k) + d[i] * k; }
    }
    return b;
  }
  // gotas: muchos «tics» cortos (un seno que se apaga), a destiempo, en un bucle de 6 s
  function bufferGotas(seg, densidad, f0, f1, dur) {
    var sr = ctx.sampleRate, n = Math.floor(sr * seg), b = ctx.createBuffer(2, n, sr);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), cuantas = Math.floor(densidad * seg);
      for (var g = 0; g < cuantas; g++) {
        var t0 = Math.floor(Math.random() * n), f = f0 + Math.random() * (f1 - f0), a = 0.15 + Math.random() * 0.85, L = Math.floor(sr * dur * (0.5 + Math.random()));
        for (var i = 0; i < L; i++) { var j = (t0 + i) % n, e = Math.exp(-i / (L * 0.22)); d[j] += Math.sin(2 * Math.PI * f * (1 + 0.3 * e) * i / sr) * e * a * 0.25; }
      }
    }
    return b;
  }
  function hacerRuidos() {
    // (Pau, 12/11: «se repite cada 10 segundos») bucles largos, cada uno de una duración distinta (11, 13, 17, 19, 23, 29 s)
    ruidos.blanco = bufferRuido(11, 'blanco'); ruidos.rosa = bufferRuido(13, 'rosa'); ruidos.marron = bufferRuido(17, 'marron');
    ruidos.gotas = bufferGotas(19, 900, 2200, 7000, 0.006);
    ruidos.gotasMadera = bufferGotas(23, 140, 650, 1500, 0.012);
    ruidos.gotasHoja = bufferGotas(29, 500, 1200, 3800, 0.008);
  }
  // un bucle sin costura: los últimos 2 s se funden con el principio y se recortan
  function sinCostura(b) {
    var sr = b.sampleRate, F = Math.min(Math.floor(sr * 2), Math.floor(b.length / 4)), n = b.length - F, out = ctx.createBuffer(b.numberOfChannels, n, sr);
    for (var c = 0; c < b.numberOfChannels; c++) {
      var src = b.getChannelData(c), dst = out.getChannelData(c);
      for (var i = 0; i < n; i++) dst[i] = src[i];
      for (i = 0; i < F; i++) { var k = i / F; dst[i] = src[i] * Math.sin(k * Math.PI / 2) + src[n + i] * Math.cos(k * Math.PI / 2); }
    }
    return out;
  }
  function b64(s) { var bin = atob(s.split(',')[1] || s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  function cargarMuestras() {
    var S = window.AMZ_SONIDOS || {};
    Object.keys(S).forEach(function (k) {
      var ok = function (b) { buffers[k] = /^amb-/.test(k) ? sinCostura(b) : b; };
      try { var p = ctx.decodeAudioData(b64(S[k]), ok, function () { /* no se pudo */ }); if (p && p.catch) p.catch(function () {}); } catch (e) { /* nada */ }
    });
  }

  // ======================= piezas: fuentes 3D =======================
  // (Pau, 12/11: «al girar se rompe el audio») el HRTF es caro: solo para los sonidos sueltos; las capas continuas
  // (selva, lluvia, viento, agua) van con 'equalpower', que también se oye a cada lado pero no se atraganta al girar
  function panner(x, y, z, ref, rol, ligero) {
    var p = ctx.createPanner(); p.panningModel = ligero ? 'equalpower' : 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref || 300; p.maxDistance = 200000; p.rolloffFactor = rol == null ? 1 : rol;
    ponerEn(p, x, y, z); return p;
  }
  function ponerEn(p, x, y, z) {
    if (p.positionX) { var t = ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.06); p.positionY.setTargetAtTime(y, t, 0.06); p.positionZ.setTargetAtTime(z, t, 0.06); }
    else p.setPosition(x, y, z);
  }
  // una fuente continua (bucle) con su panner, su ganancia y, si se quiere, un filtro
  function capa(buffer, filtro, ref, rol, envio) {
    var s = ctx.createBufferSource(); s.buffer = buffer; s.loop = true; s.playbackRate.value = 0.97 + Math.random() * 0.06;
    var s2 = ctx.createBufferSource(); s2.buffer = buffer; s2.loop = true; s2.playbackRate.value = 0.81 + Math.random() * 0.06;
    var mez = ctx.createGain(); mez.gain.value = 0.62; s.connect(mez); s2.connect(mez); s2.start(0, Math.random() * buffer.duration);
    var g = ctx.createGain(); g.gain.value = 0;
    var p = panner(0, 0, 0, ref, rol, true), n = mez;
    if (filtro) { n.connect(filtro); n = filtro; if (filtro.siguiente) { filtro.connect(filtro.siguiente); n = filtro.siguiente; } }
    n.connect(g); g.connect(p); p.connect(mezcla);
    if (envio) { var e = ctx.createGain(); e.gain.value = envio; g.connect(e); e.connect(revEnvio); }
    s.start(0, Math.random() * buffer.duration);
    return { s: s, g: g, p: p, f: filtro };
  }
  function filtro(tipo, f, q) { var b = ctx.createBiquadFilter(); b.type = tipo; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }
  function nivel(c, v, tau) {
    v = Math.max(0, v);
    if (v > 0.002 && c.mudo) { c.g.connect(c.p); c.mudo = false; c.silT = 0; }
    c.g.gain.setTargetAtTime(v, ctx.currentTime, tau || 0.25);
    if (v <= 0.002 && !c.mudo) { c.silT = (c.silT || 0) + 1; if (c.silT > 60) { try { c.g.disconnect(c.p); } catch (e) { /* ya */ } c.mudo = true; } }   // 3 s callada: fuera
    else if (v > 0.002) c.silT = 0;
  }

  // ======================= las capas del mundo =======================
  var C = null;
  function montar() {
    C = {};
    // la selva de cada tramo: cuatro copias (orillas delante y detrás) del ambiente que toca, a destiempo
    C.amb = {};
    // la lluvia: un siseo ancho, el repiqueteo, en las hojas de las orillas, y en la madera de la canoa
    C.lluvia = [0, 1, 2, 3].map(function () { return capa(ruidos.rosa, filtro('highpass', 1800, 0.5), 400, 0.6, 0.35); });
    C.repiqueteo = [0, 1, 2, 3].map(function () { return capa(ruidos.gotas, filtro('highpass', 1500, 0.4), 300, 0.7, 0.3); });
    C.hojasLluvia = [0, 1].map(function () { return capa(ruidos.gotasHoja, filtro('bandpass', 2400, 0.6), 500, 0.6, 0.4); });
    C.madera = capa(ruidos.gotasMadera, filtro('peaking', 900, 1.2), 60, 1, 0.1);
    C.muro = capa(ruidos.rosa, filtro('bandpass', 2600, 0.35), 900, 1.1, 0.3);            // el muro de lluvia que se acerca
    // el viento: rachas graves en el río y hojas que se agitan en las dos orillas
    C.viento = capa(ruidos.marron, filtro('lowpass', 500, 0.7), 1000, 0.3, 0.2);
    C.hojas = [0, 1].map(function () { return capa(ruidos.rosa, filtro('highpass', 2800, 0.5), 500, 0.6, 0.3); });
    // el agua de la canoa: el chapoteo quieto, la proa que corta y la estela
    C.chapoteo = capa(ruidos.marron, filtro('bandpass', 420, 1.4), 80, 1, 0.15);
    C.proa = capa(ruidos.rosa, filtro('bandpass', 1300, 0.6), 80, 1, 0.15);
    C.estela = capa(ruidos.blanco, filtro('highpass', 2500, 0.4), 120, 1, 0.2);
    // la noche: un coro de ranas e insectos por código (por si falta la grabación), muy bajo
    C.coro = [0, 1].map(function () { return capa(ruidos.gotasHoja, filtro('bandpass', 4200, 4), 700, 0.5, 0.4); });
    // el motor del barco que pasa: un ronroneo grave que late (diésel o el «pec-pec» de la rabeta)
    C.motor = capa(ruidos.marron, filtro('lowpass', 220, 1.2), 900, 0.9, 0.3);
    C.motorLfo = ctx.createOscillator(); C.motorLfoG = ctx.createGain(); C.motorLfo.frequency.value = 9; C.motorLfoG.gain.value = 0;
    C.motorLfo.connect(C.motorLfoG); C.motorLfoG.connect(C.motor.g.gain); C.motorLfo.start();
  }
  var ambActual = {};
  function capaAmb(id, i) {
    var b = buffers['amb-' + id]; if (!b) return null;
    var s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = [1.0, 0.94, 1.05, 0.9][i % 4];
    var g = ctx.createGain(); g.gain.value = 0; var p = panner(0, 0, 0, 700, 0.35, true);
    var e = ctx.createGain(); e.gain.value = 0.25;
    s.connect(g); g.connect(p); p.connect(mezcla); g.connect(e); e.connect(revEnvio);
    s.start(0, (b.duration * (i * 0.27 + Math.random() * 0.2)) % b.duration);
    return { s: s, g: g, p: p };
  }

  // ======================= la reverberación de cada tramo =======================
  var REV = { manaus: [1.3, 0.025, 0.55], encuentro: [0.7, 0.04, 0.35], igapo: [2.4, 0.012, 0.85], aldea: [1.1, 0.02, 0.5], vitorias: [1.0, 0.03, 0.45],
    tormenta: [1.6, 0.015, 0.6], atardecer: [1.3, 0.02, 0.55], noche: [2.6, 0.02, 0.8], samauma: [2.2, 0.015, 0.75] };   // [duración, pre-retardo, brillo]
  function respuesta(id) {
    var r = REV[id] || [1.2, 0.02, 0.5], sr = ctx.sampleRate, n = Math.floor(sr * (r[0] + r[1])), b = ctx.createBuffer(2, n, sr);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), pre = Math.floor(sr * r[1]), lp = 0;
      for (var i = pre; i < n; i++) { var t = (i - pre) / sr, w = Math.random() * 2 - 1; lp += (w - lp) * (0.15 + 0.6 * r[2] * Math.exp(-t * 3)); d[i] = lp * Math.exp(-t * 6.9 / r[0]) * 0.6; }
      // primeras reflexiones: las orillas y el agua
      for (var k = 0; k < 6; k++) { var j = pre + Math.floor(sr * (0.01 + Math.random() * 0.08)); if (j < n) d[j] += (Math.random() * 0.5 + 0.2) * (c ? 1 : -1); }
    }
    return b;
  }
  var revIds = [null, null];
  function reverberar(a, b, t) {
    if (revIds[0] !== a) { revA.buffer = respuesta(a); revIds[0] = a; }
    if (revIds[1] !== b) { revB.buffer = respuesta(b); revIds[1] = b; }
    revGA.gain.setTargetAtTime(0.55 * (1 - t), ctx.currentTime, 0.4); revGB.gain.setTargetAtTime(0.55 * t, ctx.currentTime, 0.4);
  }

  // ======================= cada fotograma =======================
  var oido = [0, 50, 0], ultimo = 0;
  A.marco = function (e) {
    if (!ctx || !A.activo || (ctx.state !== 'running' && !window.__forzarSonido)) return;
    if (!C) montar();
    var t = ctx.currentTime, L = ctx.listener, cp = e.cam; oido = cp;
    // el oyente: la cámara
    if (L.positionX) { L.positionX.setTargetAtTime(cp[0], t, 0.02); L.positionY.setTargetAtTime(cp[1], t, 0.02); L.positionZ.setTargetAtTime(cp[2], t, 0.02);
      L.forwardX.setTargetAtTime(e.fwd[0], t, 0.02); L.forwardY.setTargetAtTime(e.fwd[1], t, 0.02); L.forwardZ.setTargetAtTime(e.fwd[2], t, 0.02);
      L.upX.setTargetAtTime(e.up[0], t, 0.02); L.upY.setTargetAtTime(e.up[1], t, 0.02); L.upZ.setTargetAtTime(e.up[2], t, 0.02);
    } else { L.setPosition(cp[0], cp[1], cp[2]); L.setOrientation(e.fwd[0], e.fwd[1], e.fwd[2], e.up[0], e.up[1], e.up[2]); }
    if (t - ultimo < 0.05) return;            // lo demás, 20 veces por segundo basta
    ultimo = t;
    var X = cp[0], Z = cp[2], bi = e.bordeIzq, bd = e.bordeDer;     // las orillas (en Three: la izquierda lógica es +X)
    // ---- la selva del tramo: cuatro copias por tramo, en las orillas; se funden entre tramos ----
    var pesos = {}; pesos[e.tramoA] = (pesos[e.tramoA] || 0) + (1 - e.t); pesos[e.tramoB] = (pesos[e.tramoB] || 0) + e.t;
    var vivos = {};
    Object.keys(pesos).forEach(function (id) {
      if (!buffers['amb-' + id]) return; vivos[id] = 1;
      if (!ambActual[id]) ambActual[id] = [0, 1, 2, 3].map(function (i) { return capaAmb(id, i); });
      var w = pesos[id] * (1 - e.lluvia * 0.55) * (e.cuerpo ? 0.5 : 1);
      ambActual[id].forEach(function (c, i) {
        if (!c) return; var lado = i % 2 ? 1 : -1, dz = i < 2 ? 900 : -900;
        ponerEn(c.p, X + lado * (lado > 0 ? bi : bd) * 0.9, 120, Z + dz);
        nivel(c, w * 0.55, 0.6);
      });
    });
    Object.keys(ambActual).forEach(function (id) {
      if (vivos[id] && pesos[id] > 0.001) return;
      ambActual[id].forEach(function (c) { if (c) nivel(c, 0, 0.8); });
      if (!vivos[id]) { var lista = ambActual[id]; delete ambActual[id]; setTimeout(function () { lista.forEach(function (c) { if (c) try { c.s.stop(); } catch (er) { /* ya parado */ } }); }, 4000); }
    });
    reverberar(e.tramoA, e.tramoB, e.t);
    if (e.lluvia < 0.6) vida(e);
    // ---- la lluvia (con el muro que se oye llegar) ----
    var ll = e.lluvia, grab = !!buffers['amb-lluvia'];
    if (grab && !C.lluviaS) { C.lluviaS = [0, 1, 2, 3].map(function (i) { return capaAmb('lluvia', i); }); C.muroS = capaAmb('lluvia', 1); }
    if (C.lluviaS) C.lluviaS.forEach(function (c, i) { var a = i * Math.PI / 2 + 0.3; ponerEn(c.p, X + Math.cos(a) * 600, 250, Z + Math.sin(a) * 600); nivel(c, ll * 0.85, 0.5); });
    C.lluvia.forEach(function (c, i) { var a = i * Math.PI / 2 + 0.6; ponerEn(c.p, X + Math.cos(a) * 500, 200, Z + Math.sin(a) * 500); nivel(c, ll * (grab ? 0.1 : 0.32), 0.5); });
    C.repiqueteo.forEach(function (c, i) { var a = i * Math.PI / 2; ponerEn(c.p, X + Math.cos(a) * 260, 0, Z + Math.sin(a) * 260); nivel(c, ll * 0.5, 0.5); });
    C.hojasLluvia.forEach(function (c, i) { var lado = i ? 1 : -1; ponerEn(c.p, X + lado * (lado > 0 ? bi : bd) * 0.9, 300, Z + 300); nivel(c, ll * 0.42, 0.6); });
    ponerEn(C.madera.p, e.canoa[0], e.canoa[1] + 10, e.canoa[2]); nivel(C.madera, ll * 0.7, 0.4);
    // el muro: suena delante (o detrás, al salir) donde empieza el chaparrón; dentro de la lluvia ya no hace falta
    var dm = e.muro - Z, muroV = e.lluvia < 0.6 && Math.abs(dm) < 16000 ? (1 - Math.abs(dm) / 16000) * 0.9 : 0;
    ponerEn(C.muro.p, X, 300, e.muro); nivel(C.muro, muroV * (grab ? 0.3 : 1), 0.6);
    if (C.muroS) { ponerEn(C.muroS.p, X, 300, e.muro); nivel(C.muroS, muroV * 1.3, 0.6); }
    // ---- el viento ----
    var rach = 0.65 + 0.35 * Math.sin(t * 0.43) * Math.sin(t * 0.17 + 1.3), vi = Math.max(e.viento, 0.12);
    ponerEn(C.viento.p, X - 800, 400, Z + 300); nivel(C.viento, (0.08 + e.viento * 0.55) * rach, 0.8);
    C.viento.f.frequency.setTargetAtTime(260 + 500 * e.viento * rach, t, 0.5);
    C.hojas.forEach(function (c, i) { var lado = i ? 1 : -1; ponerEn(c.p, X + lado * (lado > 0 ? bi : bd), 500, Z + 200 * (i ? 1 : -1)); nivel(c, (0.04 + vi * 0.3) * (0.6 + 0.4 * Math.sin(t * (0.6 + i * 0.27) + i)) * (1 - e.noche * 0.6), 0.6); });
    // ---- el agua de la canoa ----
    var r = Math.min(1, Math.abs(e.vel) / 900);
    ponerEn(C.chapoteo.p, e.canoa[0] + 20, 0, e.canoa[2]); nivel(C.chapoteo, 0.18 * (1 - r * 0.6) * (0.6 + 0.4 * Math.sin(t * 1.3) * Math.sin(t * 0.7)), 0.5);
    ponerEn(C.proa.p, e.proa[0], 0, e.proa[2]); nivel(C.proa, Math.pow(r, 1.4) * 0.75, 0.2); C.proa.f.frequency.setTargetAtTime(700 + 1400 * r, t, 0.3);
    ponerEn(C.estela.p, e.popa[0], 0, e.popa[2]); nivel(C.estela, Math.pow(r, 1.8) * 0.35, 0.3);
    // ---- el motor del barco más cercano ----
    if (e.motor && e.motor.d < 9000) {
      var rab = /rabeta/.test(e.motor.tipo), vm = Math.min(1, 1500 / Math.max(400, e.motor.d)) * (rab ? 0.5 : 0.7);
      ponerEn(C.motor.p, e.motor.x, 30, e.motor.z); nivel(C.motor, vm, 0.4);
      C.motorLfo.frequency.setTargetAtTime(rab ? 11 : 6.5, t, 0.3); C.motorLfoG.gain.setTargetAtTime(vm * 0.6, t, 0.3);
      C.motor.f.frequency.setTargetAtTime(rab ? 480 : 200, t, 0.3);
    } else { nivel(C.motor, 0, 0.8); C.motorLfoG.gain.setTargetAtTime(0, t, 0.5); }
    // ---- la noche: grillos y ranas por código si no hay grabación ----
    var coro = e.noche * (buffers['amb-noche'] ? 0.25 : 1) * (1 - ll);
    C.coro.forEach(function (c, i) { var lado = i ? 1 : -1; ponerEn(c.p, X + lado * (lado > 0 ? bi : bd), 40, Z + 400); nivel(c, coro * 0.35 * (0.7 + 0.3 * Math.sin(t * 2.1 + i * 2)), 0.3); });
  };

  // ======================= la vida que suena sola =======================
  // (Pau, 12/11: «más sonidos, que no se repitan») cada pocos segundos, algo suena en algún sitio de las orillas:
  // guacamayos, loros, garzas, monos, un pez que salta, pajaritos (por código) y, de noche, ranas
  var PALETA = { manaus: ['pajaro', 'pajaro', 'loros', 'garza', 'pez', 'bocina'], encuentro: ['pajaro', 'garza', 'pez', 'pez'],
    igapo: ['pajaro', 'pajaro', 'rana', 'pez', 'loros', 'monos'], aldea: ['pajaro', 'loros', 'perro', 'pez', 'campana', 'pajaro'],
    vitorias: ['pajaro', 'pajaro', 'guacamayo', 'pez', 'garza'], tormenta: ['rana', 'rana'], atardecer: ['monos', 'loros', 'guacamayo', 'pajaro', 'pez'],
    noche: ['rana', 'rana', 'rana', 'pez'], samauma: ['pajaro', 'pajaro', 'monos', 'guacamayo', 'loros'] };
  var proxVida = 3;
  function vida(e) {
    proxVida -= 0.05; if (proxVida > 0) return;
    proxVida = 3.5 + Math.random() * 7;
    var lista = PALETA[e.t < 0.5 ? e.tramoA : e.tramoB] || ['pajaro'], que = lista[(Math.random() * lista.length) | 0];
    if (que === 'bocina' && Math.random() < 0.7) que = 'pajaro';
    if (que === 'campana' && Math.random() < 0.8) que = 'pajaro';
    var lado = Math.random() < 0.5 ? -1 : 1, X = oido[0] + lado * (lado > 0 ? e.bordeIzq : e.bordeDer) * (0.9 + Math.random() * 0.8), Z = oido[2] + (Math.random() - 0.4) * 5000;
    if (que === 'pez') { X = oido[0] + (Math.random() - 0.5) * 1200; Z = oido[2] + 300 + Math.random() * 1800; var bp = buffers.pez; if (bp) unaVez(bp, X, 0, Z, { vol: 0.8, vel: 0.9 + Math.random() * 0.2, ref: 300, envio: 0.3 }); return; }
    if (que === 'pajaro') return pajarito(X, 300 + Math.random() * 500, Z);
    if (que === 'rana') return rana(X, 10, Z);
    var b = que === 'loros' ? buffers['loro-' + (1 + (Math.random() * 3 | 0))] : que === 'monos' ? buffers.monos : buffers[que];
    if (b) unaVez(b, X, 400, Z, { vol: que === 'bocina' ? 0.6 : 0.75, vel: 0.88 + Math.random() * 0.24, ref: 900, rol: 0.6, envio: 0.5 });
  }
  function pajarito(x, y, z) {      // un trino por código: notas cortas que suben o bajan, a veces repetidas
    var f0 = 1800 + Math.random() * 2600, n = 2 + (Math.random() * 6 | 0), sube = Math.random() < 0.5, paso = 0.07 + Math.random() * 0.12, gl = sube ? 1.35 : 0.72;
    for (var i = 0; i < n; i++) tono(x, y, z, { f: [f0 * (1 + (Math.random() - 0.5) * 0.08)], glis: gl, dur: 0.06 + Math.random() * 0.06, vol: 0.05 + Math.random() * 0.04, retraso: i * paso, ref: 400 });
  }
  function rana(x, y, z) {          // un croar: pulsos graves y rápidos
    var f = 180 + Math.random() * 260, n = 3 + (Math.random() * 6 | 0);
    for (var i = 0; i < n; i++) tono(x, y, z, { f: [f, f * 2.02], pesos: [1, 0.4], dur: 0.045, vol: 0.09, retraso: i * (0.05 + Math.random() * 0.02), forma: 'triangle', ref: 300 });
  }

  // ======================= sonidos sueltos =======================
  function unaVez(buffer, x, y, z, op) {
    op = op || {}; if (!buffer) return null;
    var s = ctx.createBufferSource(); s.buffer = buffer; s.playbackRate.value = op.vel || 1;
    var g = ctx.createGain(); g.gain.value = op.vol == null ? 1 : op.vol;
    var n = s; if (op.filtro) { s.connect(op.filtro); n = op.filtro; }
    n.connect(g);
    if (x != null) { var p = panner(x, y, z, op.ref || 200, op.rol == null ? 1 : op.rol); g.connect(p); p.connect(mezcla); } else g.connect(mezcla);
    if (op.envio) { var e = ctx.createGain(); e.gain.value = op.envio; g.connect(e); e.connect(revEnvio); }
    s.start(ctx.currentTime + (op.retraso || 0), op.desde || 0, op.dur);
    return { s: s, g: g };
  }
  // un golpe sintetizado: ruido con envolvente, a través de un filtro (madera, chapuzón, tela…)
  function golpe(x, y, z, o) {
    var t = ctx.currentTime + (o.retraso || 0), s = ctx.createBufferSource(); s.buffer = ruidos[o.ruido || 'blanco']; s.playbackRate.value = o.vel || 1;
    var f = filtro(o.tipo || 'bandpass', o.f || 800, o.q == null ? 1 : o.q), g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vol || 0.6, t + (o.ataque || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.3));
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.dur || 0.3));
    s.connect(f); f.connect(g);
    var p = panner(x, y, z, o.ref || 60, 1); g.connect(p); p.connect(mezcla);
    var e = ctx.createGain(); e.gain.value = o.envio == null ? 0.3 : o.envio; g.connect(e); e.connect(revEnvio);
    s.start(t, Math.random() * 3, (o.dur || 0.3) + 0.05);
  }
  function tono(x, y, z, o) {      // un seno (o varios) que se apaga: madera, metal, burbuja
    var t = ctx.currentTime + (o.retraso || 0), dst;
    if (x != null) { dst = panner(x, y, z, o.ref || 60, 1); dst.connect(mezcla); } else dst = o.sub ? subBus : mezcla;
    (o.f || [440]).forEach(function (fr, i) {
      var os = ctx.createOscillator(), g = ctx.createGain(); os.type = o.forma || 'sine';
      os.frequency.setValueAtTime(fr, t); if (o.glis) os.frequency.exponentialRampToValueAtTime(Math.max(20, fr * o.glis), t + (o.dur || 0.4));
      var a = (o.vol || 0.3) * (o.pesos ? o.pesos[i] : 1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + (o.ataque || 0.003)); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.4) * (o.decaer ? o.decaer[i] || 1 : 1));
      os.connect(g); g.connect(dst); os.start(t); os.stop(t + (o.dur || 0.4) + 0.1);
    });
  }
  function salpicadura(x, z, fuerza) {
    var k = Math.min(1.5, fuerza || 1);
    golpe(x, 2, z, { tipo: 'highpass', f: 1500, q: 0.5, dur: 0.35 + 0.25 * k, vol: 0.45 * k, ref: 120, envio: 0.25 });
    golpe(x, 2, z, { tipo: 'bandpass', f: 600, f2: 250, q: 1.5, dur: 0.25, vol: 0.4 * k, ruido: 'marron', ref: 120, retraso: 0.01 });
    tono(x, 0, z, { f: [260 + Math.random() * 120], glis: 0.45, dur: 0.18, vol: 0.12 * k, retraso: 0.04, ref: 100 });   // el «gloc» de la burbuja
    for (var i = 0; i < 4; i++) golpe(x + (Math.random() - 0.5) * 60, 1, z + (Math.random() - 0.5) * 60, { tipo: 'bandpass', f: 2500 + Math.random() * 2500, q: 3, dur: 0.06, vol: 0.12 * k, retraso: 0.25 + Math.random() * 0.5, ref: 80 });   // las gotas que vuelven a caer
  }
  function trueno(d) {
    // d: { x, z (Three), fuerza 0–1, distancia (m), rayo }
    var cerca = Math.max(0, Math.min(1, 1 - d.distancia / 700)), dir = [d.x - oido[0], 0, d.z - oido[2]], L = Math.hypot(dir[0], dir[2]) || 1;
    var px = oido[0] + dir[0] / L * 1500, pz = oido[2] + dir[2] / L * 1500, py = 900;
    var b = buffers['trueno-1'] && buffers['trueno-2'] ? (Math.random() < 0.5 ? buffers['trueno-1'] : buffers['trueno-2']) : buffers['trueno-1'];
    var corte = filtro('lowpass', 900 + 9000 * cerca * cerca, 0.5);
    if (b) unaVez(b, px, py, pz, { vol: (0.45 + 0.7 * d.fuerza) * (d.rayo ? 1 : 0.6), vel: 0.85 + Math.random() * 0.2, filtro: corte, ref: 1500, rol: 0.2, envio: 0.5 });
    else {
      golpe(px, py, pz, { tipo: 'lowpass', f: 300 + 3000 * cerca, q: 0.3, dur: 3.5 + 2 * Math.random(), vol: 0.5 + 0.5 * d.fuerza, ruido: 'marron', ataque: 0.02 + 0.2 * (1 - cerca), ref: 1500, envio: 0.6 });
      if (cerca > 0.4) golpe(px, py, pz, { tipo: 'highpass', f: 1200, q: 0.3, dur: 0.25, vol: 0.7 * cerca, ataque: 0.002, ref: 1500, envio: 0.4 });
    }
    // el sub-grave: no tiene dirección; se nota en el pecho (con cascos, en la cabeza)
    tono(null, 0, 0, { sub: true, f: [44, 31], pesos: [1, 0.8], glis: 0.7, dur: 2.2 + 2 * d.fuerza, vol: 0.35 + 0.55 * d.fuerza * (d.rayo ? 1 : 0.5), ataque: 0.05 + 0.25 * (1 - cerca) });
    var s2 = ctx.createBufferSource(); s2.buffer = ruidos.marron; var lp = filtro('lowpass', 90, 0.7), g2 = ctx.createGain(), t = ctx.currentTime;
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.9 * d.fuerza, t + 0.15 + 0.3 * (1 - cerca)); g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.5 + 2 * d.fuerza);
    s2.connect(lp); lp.connect(g2); g2.connect(subBus); s2.start(t, Math.random() * 4, 6);
  }

  // ======================= la interfaz: el cuaderno, el Diario y el final =======================
  // (Pau, 12/11) sonidos sin sitio en el mundo (van directos, sin panorama): la plumilla y el lápiz sobre el papel, la
  // hoja, el sello de goma, las campanitas de los secretos y el acorde del final. Mientras el cuaderno está abierto, el
  // mundo baja un poco («foco»), como cuando te concentras en lo que lees.
  var uiBus = null;
  function bus() { if (!uiBus) { uiBus = ctx.createGain(); uiBus.gain.value = 0.9; uiBus.connect(limitador); } return uiBus; }
  function rozar(t, dur, f, q, vol, ritmo) {       // un roce: ruido filtrado con golpes de trazo (la plumilla rasca a golpes)
    var n = Math.max(1, Math.floor(ctx.sampleRate * dur)), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), fase = Math.random() * 6;
    for (var i = 0; i < n; i++) { var s = i / ctx.sampleRate, g = Math.pow(Math.max(0, Math.sin(s * ritmo * 6.283 + Math.sin(s * 2.3 + fase) * 2)), 3); d[i] = (Math.random() * 2 - 1) * (0.22 + g); }
    var src = ctx.createBufferSource(); src.buffer = b; var fl = filtro('bandpass', f, q), g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol, t + 0.03); g2.gain.setValueAtTime(vol, t + Math.max(0.04, dur - 0.06)); g2.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(fl); fl.connect(g2); g2.connect(bus()); src.start(t);
  }
  function campanita(t, f, dur, vol) {
    var sal = ctx.createGain(); sal.gain.setValueAtTime(0, t); sal.gain.linearRampToValueAtTime(vol, t + 0.012); sal.gain.exponentialRampToValueAtTime(0.0008, t + dur); sal.connect(bus());
    [[1, 1], [2.756, 0.3], [5.404, 0.1], [2, 0.16]].forEach(function (p) { var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * p[0]; g.gain.value = p[1]; o.connect(g); g.connect(sal); o.start(t); o.stop(t + dur); });
  }
  AM.sonidoUI = function (nombre, d) {
    if (!ctx || !A.activo || (ctx.state !== 'running' && !window.__forzarSonido)) return;
    d = d || {}; var t = ctx.currentTime + (d.retraso || 0);
    if (nombre === 'pluma') return rozar(t, d.dur || 0.5, 3800, 1.6, 0.09, 9.5);
    if (nombre === 'lapiz') return rozar(t, d.dur || 0.5, 2300, 0.9, 0.06, 5.5);
    if (nombre === 'acuarela') { var s = ctx.createBufferSource(); s.buffer = ruidos.rosa; var lp = filtro('lowpass', 700, 0.5), g = ctx.createGain(), du = d.dur || 3;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + du * 0.3); g.gain.linearRampToValueAtTime(0, t + du); s.connect(lp); lp.connect(g); g.connect(bus()); s.start(t, Math.random() * 5, du + 0.1); return; }
    if (nombre === 'papel') { var sp = ctx.createBufferSource(); sp.buffer = ruidos.blanco; var bp = filtro('bandpass', d.desde || 2600, 0.8), gp = ctx.createGain(), dp = d.dur || 0.9;
      bp.frequency.setValueAtTime(d.desde || 2600, t); bp.frequency.exponentialRampToValueAtTime(d.hasta || 600, t + dp);
      gp.gain.setValueAtTime(0, t); gp.gain.linearRampToValueAtTime(d.vol || 0.12, t + dp * 0.2); gp.gain.linearRampToValueAtTime(0, t + dp); sp.connect(bp); bp.connect(gp); gp.connect(bus()); sp.start(t, Math.random() * 6, dp + 0.1); return; }
    if (nombre === 'sello') {          // el golpe del sello de goma sobre el papel (y la mesa, abajo)
      var o = ctx.createOscillator(), go = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.18);
      go.gain.setValueAtTime(0.55, t); go.gain.exponentialRampToValueAtTime(0.001, t + 0.32); o.connect(go); go.connect(bus()); o.start(t); o.stop(t + 0.34);
      var sn = ctx.createBufferSource(); sn.buffer = ruidos.blanco; var ln = filtro('lowpass', 1600, 0.6), gn = ctx.createGain();
      gn.gain.setValueAtTime(0.22, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.09); sn.connect(ln); ln.connect(gn); gn.connect(bus()); sn.start(t, Math.random() * 5, 0.12); return;
    }
    if (nombre === 'campana') return campanita(t, d.f || 880, d.dur || 2.4, d.vol || 0.06);
    if (nombre === 'acorde') {         // un acorde que crece y se va (el final)
      var sal = ctx.createGain(), du2 = d.dur || 6; sal.gain.setValueAtTime(0, t); sal.gain.linearRampToValueAtTime(d.vol || 0.05, t + du2 * 0.35); sal.gain.linearRampToValueAtTime(0, t + du2);
      var lp2 = filtro('lowpass', 1400, 0.5); sal.connect(lp2); lp2.connect(bus());
      (d.fs || [110, 164.8, 220, 277.2]).forEach(function (f, i) { [-4, 4].forEach(function (dt) { var os = ctx.createOscillator(), gg = ctx.createGain(); os.type = 'sawtooth'; os.frequency.value = f; os.detune.value = dt + i; gg.gain.value = 0.18; os.connect(gg); gg.connect(sal); os.start(t); os.stop(t + du2); }); });
      return;
    }
    if (nombre === 'chispa') { var sc = ctx.createBufferSource(); sc.buffer = ruidos.blanco; var hc = filtro('bandpass', 900, 1.2), gc = ctx.createGain(), dc = d.dur || 1;
      hc.frequency.setValueAtTime(700, t); hc.frequency.exponentialRampToValueAtTime(5200, t + dc); gc.gain.setValueAtTime(0, t); gc.gain.linearRampToValueAtTime(0.05, t + dc * 0.6); gc.gain.linearRampToValueAtTime(0, t + dc);
      sc.connect(hc); hc.connect(gc); gc.connect(bus()); sc.start(t, Math.random() * 6, dc + 0.1); return; }
    if (nombre === 'foco') { mezcla.gain.setTargetAtTime(d.on ? 0.5 : 0.9, ctx.currentTime, 0.6); return; }
  };

  // los sucesos que manda el mundo (AM.sonido(nombre, datos)); las coordenadas llegan en Three
  var proxLoro = 0;
  AM.sonido = function (nombre, d) {
    if (!ctx || !A.activo || (ctx.state !== 'running' && !window.__forzarSonido) || !C) return;
    d = d || {};
    var t = ctx.currentTime;
    if (nombre === 'trueno') return trueno(d);
    if (nombre === 'agua') {
      var bs = [buffers.chapuzon2, buffers.chapuzon3, buffers.chapuzon].filter(Boolean);
      if (bs.length) { unaVez(bs[(Math.random() * bs.length) | 0], d.x, 2, d.z, { vol: 1.2, vel: 0.92 + Math.random() * 0.16, ref: 150, envio: 0.3 }); }
      else salpicadura(d.x, d.z, d.fuerza || 1);
      return;
    }
    if (nombre === 'arbol') {      // sacudir un árbol: las hojas, la grabación, y ramitas que crujen
      if (buffers.hojas) unaVez(buffers.hojas, d.x, d.y, d.z, { vol: d.grande ? 1.3 : 0.9, vel: (d.grande ? 0.8 : 1) * (0.92 + Math.random() * 0.16), ref: 300, rol: 0.7, envio: 0.35 });
      golpe(d.x, d.y, d.z, { tipo: 'highpass', f: 2000, q: 0.4, dur: 1.4, vol: 0.2, ataque: 0.06, ref: 300 });
      for (var r2 = 0; r2 < 3; r2++) golpe(d.x, d.y, d.z, { tipo: 'bandpass', f: 1800 + Math.random() * 1500, q: 4, dur: 0.05, vol: 0.18, retraso: 0.1 + Math.random() * 0.6, ref: 300 });
      return;
    }
    if (nombre === 'objeto') {
      var n = d.tipo || '', flota = /^(barco|gasolinera|puesto|rabeta|canoa-atada|boya|casa-flotante|red-pesca)/.test(n);
      if (/^barco-recreio/.test(n)) unaVez(buffers.bocina, d.x, d.y, d.z, { vol: 1.3, ref: 1200, rol: 0.35, envio: 0.6 });
      else if (/^barco-pequeno/.test(n)) unaVez(buffers.bocina, d.x, d.y, d.z, { vol: 0.9, vel: 1.4, ref: 900, rol: 0.4, envio: 0.5 });
      else if (/^iglesia/.test(n)) unaVez(buffers.campana, d.x, d.y + 300, d.z, { vol: 1.2, ref: 1200, rol: 0.35, envio: 0.7 });
      else if (/^teatro/.test(n)) unaVez(buffers.campana, d.x, d.y, d.z, { vol: 0.8, vel: 0.62, ref: 2500, rol: 0.3, envio: 0.8 });
      else if (/^casa/.test(n)) { if (buffers.perro) unaVez(buffers.perro, d.x + (Math.random() - 0.5) * 300, 60, d.z, { vol: 1, vel: 0.95 + Math.random() * 0.1, ref: 500, rol: 0.5, envio: 0.4 }); tono(d.x, d.y, d.z, { f: [140, 290], pesos: [1, 0.4], dur: 0.35, vol: 0.25, ref: 300 }); }
      else if (/^rabeta/.test(n)) { for (var k2 = 0; k2 < 22; k2++) golpe(d.x, 10, d.z, { tipo: 'lowpass', f: 260 + k2 * 6, q: 2, dur: 0.07, vol: 0.5 * Math.min(1, k2 / 4) * (1 - k2 / 26), ruido: 'marron', retraso: k2 * (0.13 - k2 * 0.002), ref: 400, envio: 0.2 }); }
      else if (/^gasolinera|^boya/.test(n)) tono(d.x, d.y, d.z, { f: [310, 742, 1150, 1960], pesos: [1, 0.7, 0.5, 0.3], decaer: [1, 0.7, 0.5, 0.3], dur: 1.4, vol: 0.25, ref: 400, envio: 0.4 });
      else if (/^victoria/.test(n)) salpicadura(d.x, d.z, 0.4);
      else if (/^red-pesca/.test(n)) golpe(d.x, d.y, d.z, { tipo: 'bandpass', f: 1600, q: 0.5, dur: 0.5, vol: 0.3, ataque: 0.05, ref: 300 });
      else if (/^puesto/.test(n)) { golpe(d.x, d.y, d.z, { tipo: 'lowpass', f: 400, q: 1, dur: 0.18, vol: 0.5, ruido: 'marron', ref: 300 }); golpe(d.x, d.y, d.z, { tipo: 'lowpass', f: 420, q: 1, dur: 0.16, vol: 0.4, ruido: 'marron', retraso: 0.15, ref: 300 }); }
      else tono(d.x, d.y, d.z, { f: [110, 225, 380], pesos: [1, 0.5, 0.3], decaer: [1, 0.6, 0.4], dur: 0.5, vol: 0.4, ref: 300, envio: 0.3 });   // madera
      if (flota) golpe(d.x, 0, d.z, { tipo: 'bandpass', f: 500, q: 0.7, dur: 1.6, vol: 0.3, ataque: 0.15, ruido: 'rosa', ref: 300, envio: 0.2 });     // el agua que se mueve debajo
      return;
    }
    if (nombre === 'remada') { golpe(d.x, 0, d.z, { tipo: 'bandpass', f: 900, f2: 400, q: 0.8, dur: 0.5, vol: 0.32, ref: 60, envio: 0.2 }); tono(d.x, 0, d.z, { f: [180 + Math.random() * 60], glis: 0.5, dur: 0.22, vol: 0.08, retraso: 0.05, ref: 60 }); return; }
    if (nombre === 'chapoteo') return salpicadura(d.x, d.z, d.fuerza || 1.2);
    if (nombre === 'boto') { golpe(d.x, 10, d.z, { tipo: 'bandpass', f: 1400, q: 0.7, dur: 0.45, vol: 0.5, ataque: 0.02, ref: 200, envio: 0.4 }); golpe(d.x, 10, d.z, { tipo: 'lowpass', f: 400, q: 0.5, dur: 0.6, vol: 0.3, ruido: 'marron', ataque: 0.05, retraso: 0.35, ref: 200 }); return; }
    if (nombre === 'aves') {   // un bando que sale: aleteo (ruido con trémolo) y, si hay grabación, sus gritos
      for (var i = 0; i < 6; i++) golpe(d.x + (Math.random() - 0.5) * 200, d.y || 400, d.z + (Math.random() - 0.5) * 200, { tipo: 'bandpass', f: 600 + Math.random() * 500, q: 0.8, dur: 0.12, vol: 0.25, retraso: i * 0.07, ref: 300, envio: 0.3 });
      var bg = buffers[d.tipo === 'garza' ? 'garza' : 'guacamayo']; if (bg) unaVez(bg, d.x, d.y || 400, d.z, { vol: 0.8, vel: 0.95 + Math.random() * 0.1, ref: 500, envio: 0.35 });
      return;
    }
    if (nombre === 'voz') { var bv = [buffers['voz-1'], buffers['voz-2'], buffers['voz-3'], buffers['voz-4']].filter(Boolean); if (bv.length) unaVez(bv[(Math.random() * bv.length) | 0], d.x, 60, d.z, { vol: 1.3, ref: 300, rol: 0.6, envio: 0.45 }); return; }
    if (nombre === 'monos') { var bm = buffers.monos; if (bm) unaVez(bm, d.x, d.y || 600, d.z, { vol: 0.9, ref: 800, rol: 0.5, envio: 0.5 }); return; }
    if (nombre === 'mata') { if (buffers.hojas) unaVez(buffers.hojas, d.x, 20, d.z, { vol: 0.6, vel: 1.15, ref: 200, envio: 0.2 }); golpe(d.x, 0, d.z, { tipo: 'bandpass', f: 700, q: 0.8, dur: 0.8, vol: 0.25, ataque: 0.05, ruido: 'rosa', ref: 200 }); return; }
    if (nombre === 'loro') {
      if (t < proxLoro) return;
      var gritar = { tocado: 1, platanos: 1, caiman: 0.8, trueno: 0.6, salto: 0.3, inquieto: 0.35, mono: 0.4, ave: 0.25, delfin: 0.5, clic: 0.2 }[d.evento] || 0.2;
      if (Math.random() > gritar) return;
      proxLoro = t + 1.2;
      var bl = buffers['loro-' + (1 + (Math.random() * 3 | 0))] || buffers['loro-1'];
      if (bl) unaVez(bl, d.x, d.y, d.z, { vol: 0.85, vel: 0.92 + Math.random() * 0.16, ref: 40, envio: 0.2 });
      else tono(d.x, d.y, d.z, { f: [1900, 2600], glis: 0.7, dur: 0.18, vol: 0.12, forma: 'sawtooth', ref: 40 });
      return;
    }
    if (nombre === 'canoa') {   // cada cosa con su ruido
      var o = d.objeto || '', x = d.x, y = d.y, z = d.z;
      if (/farol/.test(o)) { tono(x, y, z, { f: [3200, 5100], pesos: [1, 0.6], dur: 0.15, vol: 0.08, ref: 30 }); golpe(x, y, z, { tipo: 'bandpass', f: 600, f2: 2400, q: 0.6, dur: 0.6, vol: 0.12, ataque: 0.08, retraso: 0.08, ref: 30 }); }
      else if (/mochila/.test(o)) golpe(x, y, z, { tipo: 'lowpass', f: 260, q: 0.8, dur: 0.22, vol: 0.6, ruido: 'marron', retraso: 0.32, ref: 40, envio: 0.1 });
      else if (/garrafa/.test(o)) { tono(x, y, z, { f: [140, 310], pesos: [1, 0.4], dur: 0.35, vol: 0.2, ref: 40 }); for (var j = 0; j < 4; j++) golpe(x, y, z, { tipo: 'bandpass', f: 500 + j * 90, q: 2, dur: 0.18, vol: 0.12, retraso: 0.12 + j * 0.14, ruido: 'rosa', ref: 40 }); }
      else if (/machete/.test(o)) tono(x, y, z, { f: [1870, 2950, 4420, 6100], pesos: [1, 0.7, 0.5, 0.3], decaer: [1, 0.8, 0.6, 0.4], dur: 1.1, vol: 0.1, ref: 40, envio: 0.3 });
      else if (/red|cuerda/.test(o)) golpe(x, y, z, { tipo: 'bandpass', f: 1800, q: 0.5, dur: 0.3, vol: 0.18, ataque: 0.03, ref: 40 });
      else if (/platanos/.test(o)) golpe(x, y, z, { tipo: 'lowpass', f: 500, q: 1, dur: 0.15, vol: 0.35, ruido: 'marron', ref: 40 });
      else if (/remo/.test(o)) golpe(x, y, z, { tipo: 'bandpass', f: 320, q: 3, dur: 0.25, vol: 0.4, ref: 40 });
      else { tono(x, y, z, { f: [118, 236, 395], pesos: [1, 0.55, 0.3], decaer: [1, 0.6, 0.4], dur: 0.5, vol: 0.4, ref: 50, envio: 0.25 }); golpe(x, y, z, { tipo: 'bandpass', f: 1600, q: 1, dur: 0.05, vol: 0.3, ref: 50 }); }   // un golpe en la madera hueca
      return;
    }
  };

  // ======================= el botón de silencio =======================
  var boton = null;
  try { A.silencio = localStorage.getItem(CLAVE) === '0'; } catch (e) { /* sin almacenamiento */ }
  function crearBoton() {
    boton = document.createElement('button'); boton.id = 'am-sonido'; boton.type = 'button';
    boton.setAttribute('aria-label', 'Sonido'); boton.title = 'Sonido (mejor con cascos)';
    // «Tinta sobre el mundo» (12/11): sin fondo; un círculo a mano alrededor del altavoz
    var aro = 'M22,2.5', r = 7; for (var k = 1; k <= 24; k++) { r = (r * 16807) % 2147483647; var an = -Math.PI / 2 + k / 24 * Math.PI * 2.04, rr = 19.5 + ((r - 1) / 2147483646 - 0.5) * 1.2; aro += ' L' + (22 + Math.cos(an) * rr).toFixed(1) + ',' + (22 + Math.sin(an) * rr).toFixed(1); }
    boton.innerHTML = '<svg class="aro" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"><path d="' + aro + '"/></svg>' +
      '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h3l5-4v14l-5-4H4z"/><path class="ondas" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/><path class="cruz" d="M16 9l6 6M22 9l-6 6"/></svg>';
    var st = document.createElement('style');
    st.textContent = '#am-sonido{position:fixed;right:calc(var(--am-margen,30px) + 8px);bottom:calc(var(--am-margen,30px) + 2px);z-index:40;width:44px;height:44px;padding:0;border:0;background:none;color:var(--am-hueso,#f3e6cf);display:grid;place-items:center;cursor:pointer;opacity:.85;transition:opacity .2s,color .2s;filter:drop-shadow(0 1px 2px rgba(8,5,2,.95)) drop-shadow(0 0 10px rgba(8,5,2,.7))}' +
      '#am-sonido .aro{position:absolute;inset:0;width:44px;height:44px;overflow:visible;opacity:.7}#am-sonido:hover{opacity:1;color:var(--am-acento,#ffb347)}#am-sonido .cruz{display:none}#am-sonido.mudo .cruz{display:inline}#am-sonido.mudo .ondas{display:none}';
    document.head.appendChild(st); document.body.appendChild(boton);
    boton.classList.toggle('mudo', A.silencio);
    boton.addEventListener('click', function (ev) {
      ev.stopPropagation(); A.silencio = !A.silencio; boton.classList.toggle('mudo', A.silencio);
      try { localStorage.setItem(CLAVE, A.silencio ? '0' : '1'); } catch (e) { /* nada */ }
      if (salida) salida.gain.setTargetAtTime(A.silencio ? 0 : 1, ctx.currentTime, 0.15);
    });
    boton.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); arrancar(); });
  }
  // con el diario abierto, el botón se aparta (tapaba «Borrar progreso»)
  function vigilarDiario() {
    var c = document.getElementById('am-cuaderno'); if (!c || !boton || !window.MutationObserver) return;
    var ver = function () { boton.style.display = c.getAttribute('aria-hidden') === 'false' ? 'none' : ''; };
    new MutationObserver(ver).observe(c, { attributes: true, attributeFilter: ['aria-hidden', 'class'] }); ver();
  }
  if (document.body) { crearBoton(); vigilarDiario(); } else addEventListener('DOMContentLoaded', function () { crearBoton(); vigilarDiario(); });
  A.estado = function () { return { ctx: ctx ? ctx.state : 'sin', muestras: Object.keys(buffers), capas: !!C, amb: Object.keys(ambActual) }; };
})();
