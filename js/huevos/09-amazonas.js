/* Secreto 09 · El río de las amazonas (Teclado · la noche)
   Escribir AMAZONAS (con o sin mayúsculas; vale en cualquier tramo, aunque la pista vive en la noche).
   ESCENA 3D (motor.reproducir('amazonas')): de noche, río abajo, pasan despacio dos bergantines del siglo XVI con
   faroles; en la orilla se encienden hogueras una tras otra; las luciérnagas se juntan sobre el agua. Encima, la
   interfaz escribe «Amazonas» letra a letra. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;
  var PALABRA = 'AMAZONAS';
  function normal(k) { return k.normalize ? k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : k.toUpperCase(); }

  AM.registrar({
    id: 'amazonas', n: 9, nombre: 'El río de las amazonas', original: 'Río de las Amazonas · 1542', tipo: 'Teclado', tramo: 'noche',
    pista: 'Un fraile contó que aquí luchaban mujeres, como en un mito griego. Escribe el nombre que le quedó al río.',
    lamina: { fig: ['Fig. 9 — Un bergantín como el de Orellana,', 'río abajo hacia el Atlántico, 1542.'], nota: '24 de junio de 1542' },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var buf = '';
      api.en('tecla', function (d) {
        if (!d.key || d.key.length !== 1) return;
        buf = (buf + normal(d.key)).replace(/[^A-Z]/g, '').slice(-PALABRA.length);
        if (buf === PALABRA) { buf = ''; api.disparar(); }
      });
    },
    escena: function (M, datos, op) {
      var D = 14000 + I.LECTURA, letras = null;
      var guion = I.guion([
        { en: 1400, hasta: D - 900, html: '<span>24 de junio de 1542<small>según fray Gaspar de Carvajal</small></span>', x: 58, y: 30 },
        { en: 2600, hasta: D - 900, html: '<span>Francisco de Orellana<small>de los Andes al Atlántico, río abajo</small></span>', x: 58, y: 39 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 4800, hasta: D - 400, titulo: 'El río de las amazonas', pie: 'Francisco de Orellana · fray Gaspar de Carvajal · 1542',
          texto: 'En 1542, Francisco de Orellana bajó el río entero, de los Andes al Atlántico: fue el primer europeo en hacerlo. El 24 de junio, según su cronista, fray Gaspar de Carvajal, los atacó un pueblo en el que unas mujeres luchaban al frente de los hombres. Les recordaron a las amazonas de los mitos griegos, y el río se quedó con su nombre. Qué vieron de verdad, nadie lo sabe.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.zTramo('noche') + 0.3 * (I.zTramo('samauma') - I.zTramo('noche')), 1800);
          AM.pedir('reproducir', 'amazonas', { duracion: D });
        },
        cuadro: function (t) {
          guion(t);
          // la palabra, letra a letra, en grande
          var n = Math.max(0, Math.min(PALABRA.length, Math.floor((t - 600) / 140)));
          if (t > 600 && t < D - 900) {
            if (!letras) letras = I.rotulo('', 50, 16, { grande: true });
            if (letras && letras.dataset.n !== String(n)) { letras.dataset.n = n; letras.textContent = 'Amazonas'.slice(0, n); letras.style.transform = 'translate(-50%, -50%)'; }
          } else if (letras && t >= D - 900) letras.classList.remove('am-visible');
        }
      };
    }
  });
})();
