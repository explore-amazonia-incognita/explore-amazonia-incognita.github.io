// Amazonia Incognita · el viaje: los nueve tramos río arriba y cómo cambia el mundo de uno a otro.
// Se va hacia el oeste (río arriba): al amanecer el sol queda a la espalda y al atardecer, delante.
// Cada tramo fija la hora, el cielo, el agua, el tiempo y lo que crece en las orillas; entre tramos todo se mezcla.
(function () {
  'use strict';
  var AM = window.AM = window.AM || {};
  var M = 41.7;   // unidades por metro (1 u ≈ 2,4 cm)
  // (Pau, 11/11) el viaje entero, 1,5 km (antes 6,5, «demasiado largo»); (Pau, 12/11) la tormenta, más larga:
  // 400 m en vez de 172, y los demás tramos igual que estaban → 1,73 km
  var TRAMO_M = [['manaus', 0], ['encuentro', 171.75], ['igapo', 343.5], ['aldea', 543.9], ['vitorias', 715.65],
    ['tormenta', 887.4], ['atardecer', 1287.4], ['noche', 1459.15], ['samauma', 1659.55]];
  var METROS = 1728.25;
  var LARGO_VIAJE = METROS * M;
  var L0 = 1500 * M;                     // el largo de antes: las piezas fijas de la aldea siguen donde estaban
  function zDe(id) { for (var i = 0; i < TRAMO_M.length; i++) if (TRAMO_M[i][0] === id) return TRAMO_M[i][1] * M; return 0; }

  // sol: elevación y acimut en grados (acimut 0 = delante, río arriba; 180 = a la espalda; + = a la derecha)
  // cielo: zenit, horizonte, color del sol, ambiente. nubes: cobertura 0–1, oscuras 0–1.
  // agua: color base del río; calma 0–1 (espejo); negra: lado izquierdo del Encuentro (0–1).
  // orillas: qué crece y cuánto; borde = distancia del centro del río a la orilla (unidades).
  var T = [
    { id: 'manaus', nombre: 'Manaus', sub: 'El puerto al amanecer', z: zDe('manaus'),
      sol: [5.5, 177], zenit: [0.36, 0.42, 0.55], horiz: [0.98, 0.70, 0.48], solCol: [1.0, 0.62, 0.38], solI: 1.0, amb: [0.55, 0.48, 0.46],
      nubes: 0.45, oscuras: 0.0, lluvia: 0, niebla: 0.75, bruma: [0.92, 0.72, 0.56], noche: 0, disco: 1, neblina: 1,
      agua: [0.33, 0.22, 0.12], calma: 0.35, negra: 0, expo: 1.0, sat: 0.85, foto: 0.95,
      borde: [900, 1400], orillas: { 'arbol-medio': 2, 'palmera-acai': 2.2, 'arbol-emergente': 0.8, 'palmera-buriti': 0.5 }, agua_obj: { juncos: 0.8, 'capim-flotante': 1, pistia: 0.6 }, sotobosque: 2.5 },
    { id: 'encuentro', nombre: 'El Encuentro de las Aguas', sub: 'El río se parte en dos', z: zDe('encuentro'),
      sol: [16, 160], zenit: [0.40, 0.52, 0.68], horiz: [0.92, 0.82, 0.70], solCol: [1.0, 0.86, 0.66], solI: 1.1, amb: [0.60, 0.60, 0.62],
      nubes: 0.35, oscuras: 0.0, lluvia: 0, niebla: 0.5, bruma: [0.86, 0.80, 0.72], noche: 0, disco: 0.4, neblina: 0.2,
      agua: [0.42, 0.29, 0.16], calma: 0.15, negra: 1, expo: 1.0, sat: 0.85, foto: 1.0,
      borde: [2200, 2800], orillas: { 'arbol-emergente': 1.5, 'arbol-medio': 1.5, 'palmera-acai': 1 }, agua_obj: { 'capim-flotante': 1.2, juncos: 0.4 }, sotobosque: 2 },
    { id: 'igapo', nombre: 'El igapó', sub: 'El bosque inundado', z: zDe('igapo'),
      sol: [32, 150], zenit: [0.42, 0.55, 0.66], horiz: [0.78, 0.82, 0.72], solCol: [1.0, 0.92, 0.76], solI: 0.9, amb: [0.42, 0.48, 0.40],
      nubes: 0.3, oscuras: 0.0, lluvia: 0, niebla: 0.9, bruma: [0.62, 0.70, 0.58], noche: 0, disco: 0, neblina: 0.6,
      agua: [0.07, 0.05, 0.03], calma: 0.9, negra: 0, expo: 0.92, sat: 0.8, foto: 0.85,
      borde: [420, 900], orillas: { 'arbol-medio': 2, 'arbol-emergente': 1, kapok: 0.5, 'palmera-acai': 0.6 }, agua_obj: { 'igapo-tronco': 3.5, 'juncos-agua': 1, aninga: 1, pistia: 0.8 }, sotobosque: 1.2 },
    { id: 'aldea', nombre: 'La aldea', sub: 'Casas sobre pilotes', z: zDe('aldea'),
      sol: [52, 120], zenit: [0.36, 0.52, 0.74], horiz: [0.80, 0.84, 0.86], solCol: [1.0, 0.95, 0.85], solI: 1.15, amb: [0.62, 0.64, 0.66],
      nubes: 0.4, oscuras: 0.0, lluvia: 0, niebla: 0.35, bruma: [0.80, 0.82, 0.80], noche: 0, disco: 0, neblina: 0,
      agua: [0.30, 0.21, 0.12], calma: 0.5, negra: 0, expo: 1.0, sat: 0.85, foto: 1.0,
      borde: [900, 1300], orillas: { 'palmera-acai': 3, 'arbol-medio': 2, 'palmera-buriti': 1 }, agua_obj: { juncos: 0.8, 'capim-flotante': 1, aninga: 0.8, pistia: 0.8 }, sotobosque: 2.5 },
    { id: 'vitorias', nombre: 'La laguna', sub: 'Nenúfares gigantes al mediodía', z: zDe('vitorias'),
      sol: [72, 90], zenit: [0.34, 0.50, 0.74], horiz: [0.82, 0.86, 0.88], solCol: [1.0, 0.97, 0.90], solI: 1.2, amb: [0.64, 0.66, 0.68],
      nubes: 0.5, oscuras: 0.0, lluvia: 0, niebla: 0.3, bruma: [0.82, 0.85, 0.84], noche: 0, disco: 0, neblina: 0,
      agua: [0.20, 0.17, 0.10], calma: 0.85, negra: 0, expo: 1.0, sat: 0.85, foto: 1.0,
      borde: [1300, 1900], orillas: { 'arbol-emergente': 1.5, 'arbol-medio': 1.5, 'palmera-buriti': 1.5 }, agua_obj: { victoria: 6, 'juncos-agua': 1.2, pistia: 1, aninga: 0.8 }, sotobosque: 2 },
    { id: 'tormenta', nombre: 'La tormenta', sub: 'Lluvia tropical', z: zDe('tormenta'),
      sol: [40, 40], zenit: [0.20, 0.23, 0.28], horiz: [0.42, 0.46, 0.50], solCol: [0.55, 0.58, 0.62], solI: 0.35, amb: [0.40, 0.44, 0.48],
      nubes: 1.0, oscuras: 0.85, lluvia: 1, niebla: 1.0, bruma: [0.42, 0.46, 0.50], noche: 0, disco: 0, neblina: 0, cieloExpo: 0.72,
      agua: [0.24, 0.21, 0.17], calma: 0, negra: 0, expo: 0.92, sat: 0.65, foto: 0.62,
      borde: [1250, 1900], orillas: { 'arbol-medio': 2, 'palmera-acai': 2, 'arbol-emergente': 1 }, agua_obj: { 'capim-flotante': 1, juncos: 0.5 }, sotobosque: 2.5 },
    { id: 'atardecer', nombre: 'El atardecer', sub: 'Los botos', z: zDe('atardecer'),
      sol: [3.5, -42], zenit: [0.30, 0.32, 0.46], horiz: [1.0, 0.62, 0.36], solCol: [1.0, 0.55, 0.28], solI: 1.0, amb: [0.52, 0.42, 0.42],
      nubes: 0.55, oscuras: 0.1, lluvia: 0, niebla: 0.6, bruma: [0.78, 0.55, 0.46], noche: 0, disco: 0, neblina: 0,
      agua: [0.30, 0.20, 0.12], calma: 0.75, negra: 0, expo: 1.0, sat: 0.9, foto: 0.9,
      borde: [1100, 1700], orillas: { 'palmera-buriti': 2.2, 'arbol-emergente': 1.5, 'arbol-medio': 1 }, agua_obj: { 'juncos-agua': 1, 'capim-flotante': 0.8, aninga: 0.6 }, sotobosque: 2 },
    { id: 'noche', nombre: 'La noche', sub: 'Estrellas y luciérnagas', z: zDe('noche'),
      sol: [-25, -30], zenit: [0.025, 0.04, 0.09], horiz: [0.08, 0.11, 0.18], solCol: [0.25, 0.32, 0.5], solI: 0.12, amb: [0.16, 0.20, 0.32],
      nubes: 0.1, oscuras: 0.2, lluvia: 0, niebla: 0.4, bruma: [0.06, 0.08, 0.12], noche: 1, disco: 0, neblina: 0.25,
      agua: [0.03, 0.03, 0.05], calma: 0.95, negra: 0, expo: 1.0, sat: 0.75, foto: 0.2,
      borde: [800, 1200], orillas: { 'arbol-medio': 2, 'palmera-acai': 1.5, 'arbol-emergente': 1 }, agua_obj: { juncos: 1, 'juncos-agua': 1, aninga: 0.8 }, sotobosque: 2 },
    { id: 'samauma', nombre: 'La samaúma', sub: 'La madre de la selva', z: zDe('samauma'),
      sol: [6, 175], zenit: [0.30, 0.38, 0.52], horiz: [0.92, 0.74, 0.60], solCol: [1.0, 0.68, 0.44], solI: 0.95, amb: [0.50, 0.46, 0.48],
      nubes: 0.3, oscuras: 0.0, lluvia: 0, niebla: 1.0, bruma: [0.86, 0.76, 0.66], noche: 0, disco: 1, neblina: 0.85,
      agua: [0.18, 0.13, 0.08], calma: 0.9, negra: 0, expo: 1.0, sat: 0.85, foto: 0.9,
      borde: [800, 1200], orillas: { 'arbol-emergente': 2, kapok: 0.8, 'arbol-medio': 1 }, agua_obj: { 'juncos-agua': 0.8, aninga: 1, pistia: 0.6 }, sotobosque: 1.5 }
  ];
  var FIN = LARGO_VIAJE;   // la canoa se detiene ante la samaúma
  // piezas que no las pone el azar: siempre en el mismo sitio (la samaúma del final, el puerto, la aldea, la laguna…)
  var FIJOS = [
    { tipo: 'kapok', x: 420, z: FIN + 1900, esc: 2.6, rotY: 0.6, samauma: true },
    // el puerto de Manaus: barcos de pasajeros amarrados a la izquierda, la gasolinera flotante a la derecha
    { tipo: 'barco-recreio', x: -760, z: 1600, rotY: 0.08 }, { tipo: 'barco-recreio', x: -830, z: 2700, rotY: -0.05, esc: 0.95 },
    { tipo: 'gasolinera-flotante', x: 820, z: 3400, rotY: -Math.PI / 2 }, { tipo: 'barco-recreio', x: -720, z: 4900, rotY: 0.12, esc: 1.05 },
    { tipo: 'canoa-atada-1', x: 640, z: 3150, rotY: 0.2 }, { tipo: 'canoa-atada-2', x: -560, z: 3600, rotY: -0.3 },
    // más vida en el puerto: muelle de hormigón con cajas, puesto flotante de fruta, rabetas, barquito, boyas, postes y una red
    { tipo: 'muelle-hormigon', x: 1020, z: 900, rotY: -Math.PI / 2 }, { tipo: 'muelle-hormigon', x: 1020, z: 1400, rotY: -Math.PI / 2 }, { tipo: 'muelle-hormigon', x: 1020, z: 1900, rotY: -Math.PI / 2 },
    { tipo: 'pilas-cajas', x: 1080, y: 188, z: 1300, rotY: -Math.PI / 2 }, { tipo: 'pilas-cajas', x: 1100, y: 188, z: 1820, rotY: -Math.PI / 2 - 0.3 },
    { tipo: 'puesto-flotante', x: 640, z: 2350, rotY: -Math.PI / 2 }, { tipo: 'rabeta-1', x: -520, z: 2100, rotY: 0.15 }, { tipo: 'rabeta-2', x: 560, z: 4300, rotY: Math.PI },
    { tipo: 'barco-pequeno', x: -600, z: 6200, rotY: 0.1 }, { tipo: 'boya-1', x: -300, z: 3000 }, { tipo: 'boya-2', x: 380, z: 5200, rotY: 0.6 },
    { tipo: 'postes-amarre', x: -650, z: 3750 },
    // (Pau, 12/11) mirando atrás al empezar: el río abierto hacia el sol que sale, con barcos lejanos a contraluz en la bruma
    { tipo: 'barco-recreio', x: 1700, z: -11500, rotY: 0.35, esc: 1.1 }, { tipo: 'barco-recreio', x: -2600, z: -14000, rotY: -0.25 },
    { tipo: 'barco-pequeno', x: -1100, z: -6200, rotY: -0.4 }, { tipo: 'rabeta-1', x: 650, z: -3800, rotY: 2.6 }, { tipo: 'rabeta-2', x: -350, z: -8600, rotY: 0.2 }, { tipo: 'red-pesca', x: -1150, y: 30, z: 5600, rotY: Math.PI / 2 },
    // la aldea: casas sobre pilotes de cara al río, casas flotantes, la iglesia y el embarcadero
    { tipo: 'casa-pilotes-1', x: -960, z: 0.375 * L0, rotY: Math.PI / 2 }, { tipo: 'casa-pilotes-2', x: 1000, z: 0.383 * L0, rotY: -Math.PI / 2 },
    { tipo: 'embarcadero', x: -780, z: 0.391 * L0, rotY: Math.PI / 2 }, { tipo: 'iglesia', x: -1080, z: 0.398 * L0, rotY: Math.PI / 2 },
    { tipo: 'casa-flotante-1', x: 720, z: 0.402 * L0, rotY: -Math.PI / 2 }, { tipo: 'casa-pilotes-3', x: 1020, z: 0.412 * L0, rotY: -Math.PI / 2 },
    { tipo: 'casa-flotante-2', x: -700, z: 0.418 * L0, rotY: Math.PI / 2 }, { tipo: 'casa-pilotes-1', x: 980, z: 0.428 * L0, rotY: -Math.PI / 2, esc: 0.95 },
    { tipo: 'canoa-atada-1', x: -700, z: 0.389 * L0, rotY: 0.3 }, { tipo: 'canoa-atada-2', x: 820, z: 0.386 * L0, rotY: -0.2 },
    { tipo: 'casa-pilotes-2', x: -990, z: 0.432 * L0, rotY: Math.PI / 2, esc: 1.05 }
  ];

  // cuánto pesa cada tramo en z: cada uno es «puro» en su tercio central y se funde con el siguiente
  function pesos(z) {
    for (var i = 0; i < T.length - 1; i++) {
      var a = T[i].z, b = T[i + 1].z, largo = b - a;
      if (z < b) {
        var t = Math.max(0, Math.min(1, (z - (a + largo * 0.62)) / (largo * 0.38)));   // (12/11) acaba justo en el siguiente: sin salto
        t = t * t * (3 - 2 * t);
        return [i, i + 1, t];
      }
    }
    return [T.length - 1, T.length - 1, 0];
  }
  function mezcla(a, b, t) {
    if (typeof a === 'number') return a + (b - a) * t;
    if (Array.isArray(a)) return a.map(function (v, k) { return v + (b[k] - v) * t; });
    return t < 0.5 ? a : b;
  }
  var CAMPOS = ['disco', 'neblina', 'sotobosque', 'sol', 'zenit', 'horiz', 'solCol', 'solI', 'amb', 'nubes', 'oscuras', 'lluvia', 'niebla', 'bruma', 'noche', 'agua', 'calma', 'negra', 'expo', 'sat', 'foto', 'borde'];
  // ---- la tormenta por dentro (Pau, 12/11: «mucho mejor, más larga, que se vean los rayos») ----
  // s = 0 al empezar el tramo, 1 al empezar el atardecer. Antes: el cielo se cierra sobre la laguna y relampaguea
  // dentro de las nubes. 0–0,12: llega el frente (viento, primeras gotas gordas, rayos delante). 0,12: el muro de
  // lluvia, que se ve venir sobre el agua. 0,14–0,62: el chaparrón, con rayos cerca y a todo alrededor. 0,62–0,92:
  // escampa, la tormenta se va hacia atrás (los rayos, detrás) y, con el sol bajo, sale el arcoíris a la espalda.
  var Z_TORM = zDe('tormenta'), L_TORM = zDe('atardecer') - zDe('tormenta');
  var MURO = [0.12, 0.14, 0.62, 0.92];                 // dónde empieza, está entera, empieza a irse y se ha ido la lluvia
  function rampa(s, a, b) { var t = Math.max(0, Math.min(1, (s - a) / (b - a))); return t * t * (3 - 2 * t); }
  function tormenta(z) {
    var s = (z - Z_TORM) / L_TORM;
    var lluvia = Math.max(rampa(s, 0.03, 0.08) * 0.14 * (1 - rampa(s, 0.12, 0.14)), rampa(s, MURO[0], MURO[1]) * (1 - rampa(s, MURO[2], MURO[3])));
    var rayos = rampa(s, -0.3, -0.05) * 0.3 + rampa(s, -0.02, 0.1) * 0.4 + rampa(s, 0.12, 0.18) * 0.3;
    rayos *= 1 - rampa(s, 0.6, 0.8) * 0.55; rayos *= 1 - rampa(s, 0.9, 1.15);
    var cerca = rampa(s, 0.08, 0.2) * (1 - rampa(s, 0.55, 0.72));          // lo cerca que caen
    var detras = rampa(s, 0.55, 0.75);                                    // la tormenta se va: rayos a la espalda
    var viento = rampa(s, -0.06, 0.06) * (1 - rampa(s, 0.14, 0.3) * 0.35) * (1 - rampa(s, 0.6, 0.9) * 0.85) * (1 - rampa(s, 0.95, 1.2));
    var arco = rampa(s, 0.7, 0.9) * (1 - rampa(s, 1.05, 1.25));
    return { s: s, lluvia: lluvia, rayos: rayos, cerca: cerca, detras: detras, viento: viento, arco: arco,
      muro: [Z_TORM + MURO[0] * L_TORM, Z_TORM + MURO[1] * L_TORM, Z_TORM + MURO[2] * L_TORM, Z_TORM + MURO[3] * L_TORM] };
  }
  function en(z) {
    var p = pesos(z), A = T[p[0]], B = T[p[1]], t = p[2], o = { tramo: t < 0.5 ? A : B, i: t < 0.5 ? p[0] : p[1], t: t, a: A, b: B };
    CAMPOS.forEach(function (k) { o[k] = mezcla(A[k], B[k], t); });
    var tq = o.torm = tormenta(z);
    o.lluvia = tq.lluvia;
    return o;
  }
  // qué poner en un hueco de la orilla (o del agua) a esta distancia: según el tramo dominante
  function elegir(z, dic, r) {
    var p = pesos(z), d = r() < p[2] ? T[p[1]][dic] : T[p[0]][dic], tot = 0, k;
    for (k in d) tot += d[k];
    if (!tot) return null;
    var x = r() * tot;
    for (k in d) { x -= d[k]; if (x <= 0) return k; }
    return null;
  }
  // dónde va cada familia de plantas: orilla (retirada tierra adentro) o agua (desde dmin hasta la orilla)
  var REGLAS = {
    'arbol-emergente': { donde: 'orilla', retirar: [250, 900], esc: [0.9, 1.15], hojas: 1.0 },
    'arbol-medio':     { donde: 'orilla', retirar: [40, 450], esc: [0.85, 1.15], hojas: 0.8, haciaAgua: true },
    'igapo-tronco':    { donde: 'agua', dmin: 280, esc: [0.85, 1.2], hojas: 0.8 },
    'palmera-acai':    { donde: 'orilla', retirar: [-40, 350], esc: [0.85, 1.1] },
    'palmera-buriti':  { donde: 'orilla', retirar: [0, 500], esc: [0.85, 1.15] },
    'liana-cortina':   { donde: 'orilla', retirar: [-30, 120], esc: [0.8, 1.1], hojas: 0.5 },
    'juncos':          { donde: 'margen', retirar: [-260, -40], esc: [0.8, 1.2] },
    'raices-orilla':   { donde: 'orilla', retirar: [-60, 20], esc: [0.9, 1.3], tierraMenosZ: true },
    'sotobosque':      { donde: 'orilla', retirar: [-40, 260], esc: [0.8, 1.3], hojas: 1 },
    'victoria-hoja':   { donde: 'agua', dmin: 160, esc: [0.85, 1.25] },
    'victoria-flor':   { donde: 'agua', dmin: 160, esc: [1, 1.2] },
    'tronco-caido':    { donde: 'orilla', retirar: [-300, -80], esc: [0.8, 1.2] },
    'capim-flotante':  { donde: 'agua', dmin: 180, esc: [0.8, 1.3] },
    'juncos-agua':     { donde: 'agua', dmin: 140, esc: [0.8, 1.25] },
    'aninga':          { donde: 'margen', retirar: [-420, -60], esc: [0.85, 1.2] },
    'pistia':          { donde: 'agua', dmin: 150, esc: [0.8, 1.3] }
  };
  AM.viaje = { REGLAS: REGLAS, tramos: T, en: en, tormenta: tormenta, elegir: elegir, FIN: FIN, M: M, FIJOS: FIJOS };
})();
