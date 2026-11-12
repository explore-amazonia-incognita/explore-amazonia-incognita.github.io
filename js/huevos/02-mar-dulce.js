/* Secreto 02 · La Mar Dulce (Distancia · Manaus)
   Todos reman río arriba: hay que intentar ir hacia el mar, remar hacia atrás contra el principio del viaje (en el
   puerto, z ≈ 0) durante un rato. Lo detecta el 'remo' negativo con la canoa parada en el puerto, o los 'limite'
   { lado: 'atras' } del motor. Un toque suelto hacia atrás no basta.
   ESCENA 3D (motor.reproducir('mar-dulce')): la canoa da media vuelta y mira río abajo (al este, con el sol de cara);
   la cámara se eleva y el río se ensancha hasta perder las orillas, como un mar; al fondo, la raya marrón del río
   entrando en el azul del Atlántico; olas largas y lentas. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;

  AM.registrar({
    id: 'mar-dulce', n: 2, nombre: 'La Mar Dulce', original: 'Santa María de la Mar Dulce · 1500', tipo: 'Distancia', tramo: 'manaus',
    pista: 'Todos reman río arriba. Tú intenta llegar al mar: rema hacia atrás, más allá del puerto.',
    lamina: { fig: ['Fig. 2 — Agua dulce en mar abierto, antes', 'de ver la costa. Pinzón, año 1500.'], nota: 'más de 200.000 m³ por segundo' },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var empuje = 0, golpes = [];
      // el empuje sube mientras se rema hacia atrás en el puerto y baja despacio si se para (la rueda va a ráfagas)
      api.en('cuadro', function (d) {
        var dt = Math.min(100, d.dt || 16), Mu = I.unidadesPorMetro();
        if ((d.z || 0) <= 1.5 * Mu && (d.remo || 0) < -0.25) empuje += dt;
        else empuje = Math.max(0, empuje - dt * 0.5);
        if (empuje > 1500) { empuje = 0; api.disparar(); }
      });
      api.en('limite', function (d) {
        if (d.lado !== 'atras') return;
        var t = api.ahora(); golpes.push(t);
        golpes = golpes.filter(function (g) { return t - g < 3000; });
        if (golpes.length >= 4) { golpes = []; api.disparar(); }
      });
    },
    escena: function (M) {
      var D = 13000 + I.LECTURA;
      var guion = I.guion([
        { en: 2200, hasta: D - 900, html: '<span>Manaus → el Atlántico<small>unos 1.500 km río abajo</small></span>', x: 56, y: 26 },
        { en: 3400, hasta: D - 900, html: '<span><b>&gt; 200.000 m³</b> por segundo<small>de agua dulce que entra en el mar</small></span>', x: 56, y: 35 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 4600, hasta: D - 400, titulo: 'La Mar Dulce', pie: 'Santa María de la Mar Dulce · Vicente Yáñez Pinzón · 1500',
          texto: 'Río abajo, a unos 1.500 km de aquí, el Amazonas entra en el Atlántico con más de 200.000 metros cúbicos de agua por segundo: más que los siete ríos siguientes juntos y entre un 15 y un 20 % de toda el agua que los ríos del mundo llevan al mar. En 1500, Vicente Yáñez Pinzón encontró agua dulce en mar abierto, antes de ver la costa, y llamó a la desembocadura Santa María de la Mar Dulce.' },
        inicio: function () { AM.pedir('ir', 0, 1200); AM.pedir('reproducir', 'mar-dulce', { duracion: D }); },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
