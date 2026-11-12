/* Secreto 03 · Dos ríos que no se tocan (Mirada · el Encuentro de las Aguas)
   En el tramo del Encuentro, asomarse por la borda (mirar al agua: pitch por debajo de −12°) y quedarse mirando la
   raya unos 2,5 s; se puede mover un poco la vista. Si se deja de mirar, se empieza de cero.
   (Pau, 12/11: «me parece difícil de encontrar»: antes −18°, 3,5 s y la vista totalmente quieta)
   ESCENA 3D (motor.reproducir('encuentro')): la cámara baja hasta rozar el agua justo en la raya: a la izquierda el
   Negro, oscuro y de espejo; a la derecha el Solimões, café con leche; remolinos que se enroscan en la frontera sin
   mezclarse. Después sube en vertical (vista de pájaro) y la raya se pierde a lo lejos, kilómetros. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;

  AM.registrar({
    id: 'encuentro', n: 3, nombre: 'Dos ríos que no se tocan', original: 'Encontro das Águas', tipo: 'Mirada', tramo: 'encuentro',
    pista: 'Dos ríos van juntos sin tocarse. Mira hacia el agua, donde cambia de color, y quédate mirando unos segundos.',
    lamina: { fig: ['Fig. 3 — Encontro das Águas: el Negro y el', 'Solimões, unos 6 km sin mezclarse.'], nota: '≈ 28 °C   ·   ≈ 22 °C' },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var mirando = 0, prev = null;
      api.en('cuadro', function (d) {
        var dt = Math.min(100, d.dt || 16), quieta = true;
        if (prev) quieta = Math.abs((d.yaw || 0) - prev.yaw) + Math.abs((d.pitch || 0) - prev.pitch) < 2.5;
        prev = { yaw: d.yaw || 0, pitch: d.pitch || 0 };
        if (api.tramo() === 'encuentro' && (d.pitch || 0) < -12 && quieta) mirando += dt; else mirando = Math.max(0, mirando - dt * 2);
        if (mirando > 2500) { mirando = 0; api.disparar(); }
      });
    },
    escena: function (M, datos, op) {
      var D = 13500 + I.LECTURA;
      var guion = I.guion([
        { en: 1800, hasta: D - 900, html: '<span>Rio Negro<small>≈ 28 °C · ≈ 2 km/h</small></span>', x: 40, y: 42, lado: 'izq' },
        { en: 2300, hasta: D - 900, html: '<span>Solimões<small>≈ 22 °C · de 4 a 6 km/h</small></span>', x: 60, y: 42 },
        { en: 3600, hasta: D - 900, html: '<span><b>≈ 6 km</b> juntos sin mezclarse</span>', x: 50, y: 24 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 4800, hasta: D - 400, titulo: 'Dos ríos que no se tocan', pie: 'Encontro das Águas · Rio Negro e Solimões',
          texto: 'Frente a Manaus, el Río Negro, oscuro como el café, se junta con el Solimões, del color del barro que baja de los Andes. Durante unos 6 km corren uno al lado del otro sin mezclarse: el Negro va a unos 28 °C y a unos 2 km/h; el Solimões, a unos 22 °C, de 4 a 6 km/h y mucho más cargado de sedimento (las cifras cambian con la estación). Desde aquí, en Brasil, el río ya se llama Amazonas.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.zTramo('encuentro') + 0.25 * (I.zTramo('igapo') - I.zTramo('encuentro')), 1800);
          AM.pedir('reproducir', 'encuentro', { duracion: D });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
