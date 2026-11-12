/* Secreto 05 · La regla del puerto (Lugar · la aldea)
   Tocar los pilotes de una casa de la aldea (piezas 'casa-pilotes-*', también 'embarcadero' o 'casa-flotante-*').
   ESCENA 3D (motor.reproducir('crecida')): la cámara se acerca a un pilote con rayas pintadas; en cámara rápida (el sol
   corre por el cielo, días que pasan) el agua sube por los pilotes hasta casi el suelo de las casas, y luego baja
   hasta dejar la orilla de barro y una casa flotante varada; vuelve al nivel de hoy. */
(function () {
  'use strict';
  var AM = window.AM, I = AM.interfaz, U = I.util;
  function zAldea() { return I.zDe(/^casa-pilotes/, 0.39 * I.largo()); }

  AM.registrar({
    id: 'crecida', n: 5, nombre: 'La regla del puerto', original: 'Cheia e vazante · desde 1902', tipo: 'Lugar', tramo: 'aldea',
    pista: 'Las casas de la aldea van de puntillas sobre el agua. Toca sus patas: guardan la altura del río.',
    lamina: { fig: ['Fig. 5 — La regla del puerto de Manaus; al', 'lado, una casa sobre pilotes.'], nota: '30,02 m (2021)  ·  12,11 m (2024)' },   // la página del cuaderno de expedición (js/libro.js)
    lugar: zAldea, radio: 80,
    detectar: function (api) {
      api.en('clic', function (d) { if (U.toca(d, /^(casa-pilotes|embarcadero|casa-flotante)/)) api.disparar(d.objeto || null); });
    },
    escena: function (M, datos, op) {
      var D = 14000 + I.LECTURA;
      var guion = I.guion([
        { en: 1600, hasta: D - 900, html: '<span><b>30,02 m</b><small>16 de junio de 2021 · la mayor crecida</small></span>', x: 60, y: 24 },
        { en: 3200, hasta: D - 900, html: '<span><b>12,11 m</b><small>9 de octubre de 2024 · la menor bajante</small></span>', x: 60, y: 42 },
        { en: 4200, hasta: D - 900, html: '<span>≈ 10 m arriba y abajo<small>cada año, de media</small></span>', x: 60, y: 33 }
      ]);
      return {
        duracion: D,
        tarjeta: { en: 5200, hasta: D - 400, titulo: 'La regla del puerto', pie: 'Porto de Manaus · cota do Rio Negro · desde 1902',
          texto: 'Aquí el río sube y baja cada año unos 10 metros de media, y en los últimos años más de 12: la crecida llega hacia junio y la bajante, hacia octubre. Por eso las casas se levantan sobre pilotes o flotan sobre troncos. En la regla del puerto de Manaus, que se lee cada día desde 1902, la crecida más alta fue de 30,02 m (junio de 2021) y la bajante más honda, de 12,11 m (octubre de 2024): casi 18 metros entre una y otra.' },
        inicio: function () {
          if (op && op.desdeCuaderno) AM.pedir('ir', Math.max(0, zAldea() - 30 * I.unidadesPorMetro()), 1800);
          AM.pedir('reproducir', 'crecida', { duracion: D, objeto: datos || null });
        },
        cuadro: function (t) { guion(t); }
      };
    }
  });
})();
