/* Secreto 01 · El teatro de la selva (Lugar · Manaus)
   Tocar la cúpula de azulejos del Teatro Amazonas, que asoma entre la bruma del puerto (pieza 'teatro' del motor).
   ESCENA 3D (motor.reproducir('teatro')): la cámara gira hacia la cúpula y se acerca despacio (de 1× a 2,5×); la luz
   rasante del alba recorre las escamas, que se encienden por franjas en verde, amarillo y azul; gaviotas cruzan;
   de muy lejos suena un aria (tres compases) que se apaga con la tarjeta. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz, U = I.util;
  function zTeatro() { return I.zDe(/^teatro/, 2600); }

  AM.registrar({
    id: 'teatro', n: 1, nombre: 'El teatro de la selva', original: 'Teatro Amazonas · 1896', tipo: 'Lugar', tramo: 'manaus',
    pista: 'Entre la bruma del puerto asoma una cúpula con los colores de una bandera. Tócala.',
    lamina: { fig: ['Fig. 1 — Teatro Amazonas, Manaus. La cúpula,', 'con sus escamas de cerámica de Alsacia.'], nota: 'inaugurado el 31.12.1896' },   // la página del cuaderno de expedición (js/libro.js)
    lugar: zTeatro, radio: 70,
    detectar: function (api) {
      api.en('clic', function (d) { if (U.toca(d, /^teatro/)) api.disparar(d.objeto || null); });
    },
    escena: function (M, datos, op) {
      var D = 12500 + I.LECTURA, Mu = I.unidadesPorMetro();
      var guion = I.guion([
        { en: 2400, hasta: D - 900, html: '<span><b>36.000</b> escamas de cerámica<small>esmaltadas, llegadas de Alsacia</small></span>', x: 58, y: 28 },
        { en: 3600, hasta: D - 900, html: '<span>Verde · amarillo · azul<small>los colores de la bandera de Brasil</small></span>', x: 58, y: 37 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 4400, hasta: D - 400, titulo: 'El teatro de la selva', pie: 'Teatro Amazonas · Manaus · 31.12.1896',
          texto: 'En plena fiebre del caucho, Manaus quiso tener su ópera en medio de la selva. El Teatro Amazonas se inauguró el 31 de diciembre de 1896, tras más de una década de obras, con mármol de Italia y hierro forjado en Europa. Su cúpula lleva unas 36.000 escamas de cerámica esmaltada traídas de Alsacia, con los colores de la bandera de Brasil.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', Math.max(0, zTeatro() - 40 * Mu), 1800);
          AM.pedir('reproducir', 'teatro', { duracion: D, z: zTeatro() });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
