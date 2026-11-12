/* Secreto 06 · La flor que cambia de color (Lugar · la laguna)
   Tocar una flor de Victoria amazonica (pieza 'victoria-flor'); las hojas solas no cuentan.
   ESCENA 3D (motor.reproducir('vitoria-regia', { objeto })): cámara rápida del día a la noche: el sol cae, la flor
   se abre blanca y brilla un poco (está caliente), llegan escarabajos, se cierra con ellos dentro; pasa un día y la
   noche siguiente se abre rosa púrpura y los escarabajos salen volando con polen dorado. Las hojas se mecen. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz, U = I.util;
  function zLaguna() { return I.zDe(/^victoria/, I.zTramo('vitorias') + 0.2 * (I.zTramo('tormenta') - I.zTramo('vitorias'))); }

  AM.registrar({
    id: 'vitoria-regia', n: 6, nombre: 'La flor que cambia de color', original: 'Vitória-régia · Victoria amazonica', tipo: 'Lugar', tramo: 'vitorias',
    pista: 'En la laguna, entre hojas donde cabría un niño, flotan flores blancas. Toca una.',   // (Pau, 12/11) antes decía «espera a la noche» y confundía
    lamina: { fig: ['Fig. 6 — Victoria amazonica: blanca la primera', 'noche, rosa la segunda. El envés, con espinas.'], nota: 'hojas de 2 a 3 m' },   // la página del cuaderno de expedición (js/libro.js)
    lugar: zLaguna, radio: 90,
    detectar: function (api) {
      api.en('clic', function (d) { if (U.toca(d, /^victoria-flor/)) api.disparar(d.objeto || null); });
    },
    escena: function (M, datos, op) {
      var D = 14500 + I.LECTURA;
      var guion = I.guion([
        { en: 1800, hasta: D - 900, html: '<span>1.ª noche · <b>blanca</b><small>caliente y perfumada</small></span>', x: 60, y: 28 },
        { en: 3800, hasta: D - 900, html: '<span>2.ª noche · <b>rosa</b><small>suelta a los escarabajos con polen</small></span>', x: 60, y: 37 },
        { en: 4800, hasta: D - 900, html: '<span>Hojas de <b>hasta ≈ 3 m</b></span>', x: 60, y: 44 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 5400, hasta: D - 400, titulo: 'La flor que cambia de color', pie: 'Vitória-régia · Victoria amazonica · descrita en 1837',
          texto: 'Las hojas de la Victoria amazonica pasan de dos metros y pueden llegar a unos tres; por debajo, unos nervios con espinas las hacen flotar como una balsa. La flor se abre al anochecer, blanca, perfumada y unos grados más caliente que el aire, para atraer a unos escarabajos. De madrugada se cierra con ellos dentro; la noche siguiente vuelve a abrirse, ya rosa, y los suelta cargados de polen hacia otra flor blanca.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', Math.max(0, zLaguna() - 25 * I.unidadesPorMetro()), 1800);
          AM.pedir('reproducir', 'vitoria-regia', { duracion: D, objeto: datos || null });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
