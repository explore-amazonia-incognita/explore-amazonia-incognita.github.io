/* Secreto 04 · El pez que planta árboles (Mirada · el igapó)
   En el bosque inundado, cada 9–16 s cae un fruto al agua por delante de la canoa (la interfaz le pide al motor
   motor.efecto('fruto', { x, z, dura })). Hay que tocar sus ondas antes de 4,5 s. Si el motor deja caer frutos por
   su cuenta, basta con que emita 'fruto' { x, z }. Un clic en el agua lejos del fruto no cuenta.
   ESCENA 3D (motor.reproducir('tambaqui', { x, z })): donde cayó el fruto asoma un tambaqui (gris oscuro, vientre
   dorado) y se lo traga con un chasquido; la cámara se hunde bajo el espejo negro: entre troncos sumergidos nadan
   peces y una semilla cae despacio al fondo de barro, donde echa raíz (en cámara rápida). */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz;

  AM.registrar({
    id: 'tambaqui', n: 4, nombre: 'El pez que planta árboles', original: 'Tambaqui · Colossoma macropomum', tipo: 'Mirada', tramo: 'igapo',
    pista: 'En el bosque inundado algo cae al agua de vez en cuando. Toca sus ondas antes de que se borren.',
    lamina: { fig: ['Fig. 4 — Tambaqui, Colossoma macropomum.', 'Sus dientes, casi humanos, parten semillas.'], nota: 'hasta ≈ 1 m', regla: true },   // la página del cuaderno de expedición (js/libro.js)
    detectar: function (api) {
      var fruto = null, prox = null, DURA = 4500;
      api.en('pulso', function () {
        var t = api.ahora();
        if (fruto && t > fruto.hasta) fruto = null;
        if (api.tramo() !== 'igapo') { prox = null; return; }
        if (prox === null) prox = t + 5000;               // al entrar en el igapó, el primero tarda un poco
        if (fruto || t < prox) return;
        var u = api.ultimo(), Mu = I.unidadesPorMetro(), yaw = (u.yaw || 0) * Math.PI / 180;
        var dist = (12 + Math.random() * 14) * Mu, lat = (Math.random() - 0.5) * 10 * Mu;
        fruto = { x: (u.x || 0) + Math.sin(yaw) * dist + Math.cos(yaw) * lat, z: (u.z || 0) + Math.cos(yaw) * dist - Math.sin(yaw) * lat, hasta: t + DURA };
        AM.pedir('efecto', 'fruto', { x: fruto.x, z: fruto.z, dura: DURA });
        prox = t + 9000 + Math.random() * 7000;
      });
      api.en('fruto', function (d) { fruto = { x: d.x, z: d.z, hasta: api.ahora() + DURA }; });
      api.en('clic', function (d) {
        if (!fruto || !d.agua) return;
        var dx = d.agua.x - fruto.x, dz = d.agua.z - fruto.z;
        if (Math.sqrt(dx * dx + dz * dz) < 4 * I.unidadesPorMetro()) { var f = { x: fruto.x, z: fruto.z }; fruto = null; api.disparar(f); }
      });
    },
    escena: function (M, datos, op) {
      var D = 13500 + I.LECTURA;
      var guion = I.guion([
        { en: 2000, hasta: D - 900, html: '<span>Tambaqui<small>Colossoma macropomum</small></span>', x: 56, y: 30 },
        { en: 3400, hasta: D - 900, html: '<span><b>&gt; 5 km</b><small>lejos del árbol puede soltar la semilla</small></span>', x: 56, y: 39 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 4800, hasta: D - 400, titulo: 'El pez que planta árboles', pie: 'Tambaqui · Colossoma macropomum · Proc. R. Soc. B, 2011',
          texto: 'Cuando el río inunda la selva, el tambaqui nada entre los troncos y se come los frutos que caen al agua. Muchas semillas pasan enteras por su tripa, a veces durante días, y salen lejos del árbol: un estudio de 2011 en la Amazonia de Perú calculó que pueden acabar a más de 5 km. Así, muchos árboles del bosque inundado se siembran con los peces. Hoy el tambaqui está sobrepescado, y con él viajan menos semillas.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', I.zTramo('igapo') + 0.3 * (I.zTramo('aldea') - I.zTramo('igapo')), 1800);
          AM.pedir('reproducir', 'tambaqui', { duracion: D, x: datos && datos.x, z: datos && datos.z });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
