/* Amazonia Incognita · el cursor «gota y ondas» (Pau, 13/11)
   Un aro dibujado a mano, como los círculos del Diario, con un punto en el centro. El punto va pegado al ratón y el aro
   le sigue con un poco de inercia, como algo que flota. Tres estados:
     · normal: aro hueso;
     · sobre algo que se toca (una planta, un secreto, un botón): el aro se abre y se pone ámbar;
     · arrastrando para mirar: el aro se cierra sobre el punto (agarra).
   Al tocar sin arrastrar, dos ondas se abren desde el punto, como al tocar el agua.
   Solo con ratón (pointer: fine); en el móvil y la tableta no hay cursor. No toca el motor: lee las clases
   .sobre y .arrastra que pone mundo.js en #vista. Todo es un elemento pequeño con transform, sin pintar nada grande. */
(function () {
  'use strict';
  if (!window.matchMedia || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  if (/[?&]captura\b/.test(location.search)) return;              // las capturas de prueba, sin cursor

  var quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  // el aro a mano: casi un círculo de radio 8, un poco irregular; el final se pasa del principio y lo cruza, como los del Diario
  var ARO = 'M29.9,17.6 C32.3,23.4 28.6,30.6 21.9,30.6 C15.5,30.6 12.8,25.7 13.4,20.9 C14.1,15.8 18.3,13.1 22.7,13.5 C26.9,13.9 30.3,17 31.3,22.9';

  // las ondas, en cambio, cerradas y lisas: tumbadas en perspectiva, el cruce del trazo haría un ojo
  var ONDA = 'M30.2,22.1 C30.3,26.6 26.5,30.1 21.9,30.1 C17.4,30.1 13.8,26.7 13.9,22 C14,17.4 17.6,13.9 22.1,13.9 C26.6,13.9 30.1,17.4 30.2,22.1Z';

  function svgAro(clase, d) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 44 44'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', clase);
    var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d || ARO); s.appendChild(p);
    return s;
  }

  var raiz = document.documentElement;
  var capa = document.createElement('div'); capa.className = 'am-cursor'; capa.setAttribute('aria-hidden', 'true');
  var aro = document.createElement('div'); aro.className = 'am-cursor-aro'; aro.appendChild(svgAro('am-cursor-svg', ONDA));
  var punto = document.createElement('div'); punto.className = 'am-cursor-punto';
  capa.appendChild(aro); capa.appendChild(punto);

  var vista = null, x = -100, y = -100, ax = -100, ay = -100, visible = false, sobreUI = false, animando = false, previo = 0;
  var abajo = null;                                                // dónde empezó la pulsación, para saber si fue un toque

  function estado() {
    var sobre = sobreUI || (vista && vista.classList.contains('sobre'));
    var agarra = vista && vista.classList.contains('arrastra') && abajo && abajo.movido;
    capa.classList.toggle('am-cursor-sobre', !!sobre && !agarra);
    capa.classList.toggle('am-cursor-agarra', !!agarra);
  }

  function colocar() {
    punto.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    aro.style.transform = 'translate3d(' + ax + 'px,' + ay + 'px,0)';
  }

  // el aro alcanza al punto con una inercia que no depende de los fotogramas por segundo; se para cuando llega
  function seguir(t) {
    var dt = previo ? Math.min(64, t - previo) : 16; previo = t;
    var k = 1 - Math.exp(-dt / 55);
    ax += (x - ax) * k; ay += (y - ay) * k;
    if (Math.abs(x - ax) < 0.15 && Math.abs(y - ay) < 0.15) { ax = x; ay = y; animando = false; previo = 0; }
    colocar();
    if (animando) requestAnimationFrame(seguir);
  }

  function onda(px, py, ambar) {
    for (var i = 0; i < 2; i++) {
      var o = document.createElement('div'); o.className = 'am-cursor-onda' + (ambar ? ' am-cursor-onda-ambar' : '');
      o.style.left = px + 'px'; o.style.top = py + 'px';
      o.appendChild(svgAro('am-cursor-svg'));
      capa.appendChild(o);
      var giro = (Math.random() * 360) | 0;                         // cada onda empieza el trazo en otro sitio: no se repite
      var a = o.animate(
        quieto
          ? [{ opacity: 0.9 }, { opacity: 0 }]
          // las ondas se tumban sobre el agua: elipses en perspectiva (alto = 55 % del ancho) que se abren y se apagan
          : [{ transform: 'translate(-50%,-50%) scale(.8,.62) rotate(' + giro + 'deg)', opacity: 0.95 },
             { transform: 'translate(-50%,-50%) scale(' + (i ? 2.8 : 3.9) + ',' + (i ? 1.55 : 2.15) + ') rotate(' + (giro + 14) + 'deg)', opacity: 0 }],
        { duration: quieto ? 500 : (i ? 900 : 1150), delay: i * 140, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'both' });
      a.onfinish = (function (n) { return function () { n.remove(); }; })(o);
    }
  }

  function mover(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!visible) { visible = true; ax = x; ay = y; capa.classList.add('am-cursor-visible'); }
    if (abajo && !abajo.movido && Math.abs(x - abajo.x) + Math.abs(y - abajo.y) > 6) { abajo.movido = true; estado(); }
    if (quieto) { ax = x; ay = y; colocar(); return; }
    punto.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (!animando) { animando = true; requestAnimationFrame(seguir); }
  }

  function iniciar() {
    vista = document.getElementById('vista');
    document.body.appendChild(capa);
    raiz.classList.add('am-cursor-propio');

    window.addEventListener('pointermove', mover, { passive: true });
    window.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;
      mover(e);
      abajo = { x: e.clientX, y: e.clientY, movido: false };
      capa.classList.add('am-cursor-pulsa');
    }, { passive: true, capture: true });
    window.addEventListener('pointerup', function (e) {
      if (e.pointerType !== 'mouse') return;
      capa.classList.remove('am-cursor-pulsa');
      // solo un toque sobre el mundo (no un arrastre ni un botón) hace ondas en el agua
      if (abajo && !abajo.movido && vista && vista.contains(e.target)) onda(e.clientX, e.clientY, vista.classList.contains('sobre'));
      abajo = null; estado();
    }, { passive: true, capture: true });

    // los botones y enlaces de la interfaz también abren el aro
    document.addEventListener('pointerover', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('button, a[href], [role="button"]') : null;
      var si = !!(t && !t.disabled);
      if (si !== sobreUI) { sobreUI = si; estado(); }
    }, { passive: true });

    // el ratón sale de la ventana: el cursor se esconde; vuelve al moverse
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) { visible = false; capa.classList.remove('am-cursor-visible'); } });
    window.addEventListener('blur', function () { visible = false; capa.classList.remove('am-cursor-visible'); });

    // mundo.js pone .sobre y .arrastra en #vista dentro de su bucle: se escuchan sin preguntar en cada fotograma
    if (vista && window.MutationObserver) new MutationObserver(estado).observe(vista, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
