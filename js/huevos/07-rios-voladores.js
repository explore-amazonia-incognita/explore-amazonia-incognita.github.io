/* Secreto 07 · Los ríos voladores (Espera · la tormenta)
   En la tormenta, no tocar nada durante 30 s (ni remar, ni mirar, ni teclas), con el diario cerrado. Cualquier
   entrada vuelve a empezar la cuenta; cerrar el diario o acabar una escena, también.
   ESCENA 3D (motor.reproducir('rios-voladores')): la lluvia amaina y la cámara mira arriba: de las copas sube vapor
   en hilos blancos que se juntan en un río de nubes que corre hacia el oeste; la vista se eleva por encima de la
   selva y el río del cielo tuerce hacia el sur al chocar con los Andes (silueta lejana, nevada). */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;
  var ESPERA = 30000;

  AM.registrar({
    id: 'rios-voladores', n: 7, nombre: 'Los ríos voladores', original: 'Rios voadores', tipo: 'Espera', tramo: 'tormenta',
    pista: 'Bajo la tormenta, suelta el remo y espera. La selva también está lloviendo… hacia arriba.',
    lamina: { fig: ['Fig. 7 — La selva devuelve el agua al aire', 'y el viento se la lleva hacia el oeste.'], nota: 'más de 1.000 l al día por árbol' },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      api.en('pulso', function () {
        if (document.hidden || api.hallado() || api.tramo() !== 'tormenta') return;
        if (api.quieto() >= ESPERA) { I.tocado(); api.disparar(); }
      });
    },
    escena: function (M, datos, op) {
      var D = 14500 + I.LECTURA;
      var guion = I.guion([
        { en: 2000, hasta: D - 900, html: '<span><b>&gt; 1.000 litros</b> al día<small>los que suda un árbol grande</small></span>', x: 58, y: 24 },
        { en: 3300, hasta: D - 900, html: '<span><b>≈ 20.000 millones de t</b> al día<small>de vapor de toda la selva</small></span>', x: 58, y: 33 },
        { en: 4300, hasta: D - 900, html: '<span>≈ 17.000 millones de t<small>lo que el río lleva al mar</small></span>', x: 58, y: 42 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 5400, hasta: D - 400, titulo: 'Los ríos voladores', pie: 'Rios voadores · Antonio Donato Nobre · INPA · 2014',
          texto: 'La lluvia que cae aquí vuelve a subir: un árbol grande puede devolver al aire más de 1.000 litros de agua al día. Según el investigador Antonio Nobre, la selva entera evapora unos 20.000 millones de toneladas diarias, más de lo que el propio Amazonas lleva al mar, unos 17.000 millones. El viento empuja ese vapor hacia el oeste, los Andes lo tuercen hacia el sur y parte de la lluvia del centro y el sur de Brasil, de Paraguay y del norte de Argentina nace aquí.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.zTramo('tormenta') + 0.3 * (I.zTramo('atardecer') - I.zTramo('tormenta')), 1800);
          AM.pedir('reproducir', 'rios-voladores', { duracion: D });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
