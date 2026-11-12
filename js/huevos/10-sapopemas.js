/* Secreto 10 · La madre de la selva (Gesto · la samaúma)
   Golpear las raíces de la samaúma: tres toques sobre ella (pieza 'samauma' / 'sapopema', u objeto con samauma: true)
   en menos de 3 s, con al menos 0,15 s entre uno y otro. Un toque suelto no basta.
   ESCENA 3D (motor.reproducir('sapopemas')): cada golpe retumba: un anillo de sonido sale de las raíces por la niebla
   y se aleja entre los troncos; levantan el vuelo los guacamayos; a lo lejos, otro árbol contesta con tres golpes
   (el eco, con retraso); la cámara sube por el tronco hasta la copa, por encima del dosel, al alba, con rayos. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz, U = I.util;
  function esSamauma(d) { return U.toca(d, /samauma|sapopema/) || !!(d.objeto && d.objeto.samauma); }

  AM.registrar({
    id: 'sapopemas', n: 10, nombre: 'La madre de la selva', original: 'Sumaúma · Ceiba pentandra', tipo: 'Gesto', tramo: 'samauma',
    pista: 'La madre de la selva tiene raíces como paredes. Llama a su puerta tres veces.',
    lamina: { fig: ['Fig. 10 — Samaúma, Ceiba pentandra, con una', 'persona entre las sapopemas. Vaina y paina.'], nota: 'más de 60 m' },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var golpes = [];
      api.en('clic', function (d) {
        if (!esSamauma(d)) { golpes = []; return; }
        var t = api.ahora();
        if (golpes.length && t - golpes[golpes.length - 1] < 150) return;
        golpes.push(t);
        golpes = golpes.filter(function (x) { return t - x < 3000; });
        if (golpes.length >= 3) { golpes = []; api.disparar(d.objeto || null); }
      });
    },
    escena: function (M, datos, op) {
      var D = 15000 + I.LECTURA;
      var guion = I.guion([
        { en: 2200, hasta: D - 900, html: '<span>Sapopemas<small>raíces en tabla, como paredes</small></span>', x: 58, y: 30 },
        { en: 3600, hasta: D - 900, html: '<span><b>&gt; 60 m</b> de altura<small>por encima del dosel</small></span>', x: 58, y: 39 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 5200, hasta: D - 400, titulo: 'La madre de la selva', pie: 'Sumaúma o samaúma · Ceiba pentandra',
          texto: 'La samaúma es de los árboles más altos de la Amazonia: puede pasar de 60 metros. Para sostenerse en un suelo blando y pobre abre raíces en tabla, las sapopemas, como paredes de varios metros. Según cuentan los ribereños, golpeadas con un palo retumban por la selva, y servían para avisar, pedir ayuda o encontrarse cuando alguien se perdía. Por eso la llaman la madre de la selva.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.largo(), 1800);
          AM.pedir('reproducir', 'sapopemas', { duracion: D });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
