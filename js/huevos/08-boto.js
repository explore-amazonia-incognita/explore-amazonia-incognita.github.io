/* Secreto 08 · El boto (Gesto · el atardecer)
   Al atardecer, chapotear: tres toques en el agua en menos de 2,2 s (con al menos 0,12 s entre uno y otro).
   Dos toques, o toques en el cielo o en la orilla, no cuentan.
   ESCENA 3D (motor.reproducir('boto')): se abren las ondas de los chapoteos; un boto rosa asoma junto a la canoa,
   resopla, gira la cabeza hacia ti (el cuello flexible) y se sumerge; otros dos asoman más lejos, contra el cielo en
   llamas. Al final, en la orilla en penumbra, un sombrero blanco flota río abajo (el guiño a la leyenda). */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;

  AM.registrar({
    id: 'boto', n: 8, nombre: 'El boto', original: 'Boto-cor-de-rosa · Inia geoffrensis', tipo: 'Gesto', tramo: 'atardecer',
    pista: 'Al atardecer, chapotea tres veces en el agua y alguien vendrá a ver quién llama.',
    lamina: { fig: ['Fig. 8 — Boto, Inia geoffrensis. Asomó junto a', 'la canoa al tercer chapoteo.'], nota: '≈ 2,5 m', regla: true },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var toques = [];
      api.en('clic', function (d) {
        if (!d.agua || api.tramo() !== 'atardecer') { toques = []; return; }
        var t = api.ahora();
        if (toques.length && t - toques[toques.length - 1] < 120) return;
        toques.push(t);
        toques = toques.filter(function (x) { return t - x < 2200; });
        if (toques.length >= 3) { toques = []; api.disparar({ x: d.agua.x, z: d.agua.z }); }
      });
    },
    escena: function (M, datos, op) {
      var D = 14000 + I.LECTURA;
      var guion = I.guion([
        { en: 2200, hasta: D - 900, html: '<span>Boto<small>Inia geoffrensis · hasta unos 2,5 m</small></span>', x: 58, y: 28 },
        { en: 3600, hasta: D - 900, html: '<span><b>En peligro</b><small>Lista Roja de la UICN · desde 2018</small></span>', x: 58, y: 37 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 5000, hasta: D - 400, titulo: 'El boto', pie: 'Boto-cor-de-rosa · Inia geoffrensis · en peligro desde 2018',
          texto: 'El boto es el delfín de río más grande: puede pasar de 2,5 m y, de adulto, se vuelve rosado. Tiene las vértebras del cuello sueltas y gira la cabeza para nadar entre los troncos del bosque inundado. Desde 2018 está en peligro de extinción. Según la leyenda, en las noches de fiesta sale del río convertido en un hombre vestido de blanco, con sombrero para esconder el agujero por el que respira.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.zTramo('atardecer') + 0.3 * (I.zTramo('noche') - I.zTramo('atardecer')), 1800);
          AM.pedir('reproducir', 'boto', { duracion: D, x: datos && datos.x, z: datos && datos.z });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
