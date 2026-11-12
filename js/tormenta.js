// Amazonia Incognita · la tormenta (Pau, 12/11: «se podría hacer mucho mejor; más larga, que se vean los rayos»).
// Tres cosas que viven aquí y que js/mundo.js enciende en su sitio:
//   1. la lluvia de cerca: miles de trazos finos en una caja que acompaña a la canoa, en la GPU (sin coste en JS);
//   2. las cortinas de lluvia: anillos alrededor de la canoa con vetas que caen; solo se pintan donde llueve, así que
//      el muro del chaparrón se ve venir sobre el río desde lejos;
//   3. los rayos: un canal ramificado en 3D (desplazamiento del punto medio), con su líder que baja, de 1 a 4
//      descargas que parpadean, el resplandor y el trueno, que llega tarde según la distancia (343 m/s).
// Todo en coordenadas lógicas del viaje (x a la derecha, z río arriba); Three dibuja con X = −x.
(function () {
  'use strict';
  var AM = window.AM = window.AM || {};

  AM.crearTormenta = function (C) {
    var THREE = window.THREE, M = AM.viaje.M, VJ = AM.viaje;
    var escena = C.escena, camara = C.camara;
    var uT = C.uT;
    var _v = new THREE.Vector3();

    // lo que comparten la lluvia y las cortinas: dónde llueve (el muro), con qué luz y el destello
    var Z0 = VJ.tormenta(0).muro, PRE = 0.09 * (VJ.tramos.filter(function (t) { return t.id === 'atardecer'; })[0].z - VJ.tramos.filter(function (t) { return t.id === 'tormenta'; })[0].z);
    var comun = {
      uT: uT, uMuro: { value: new THREE.Vector4(Z0[0], Z0[1], Z0[2], Z0[3]) }, uPreLl: { value: PRE }, uLluviaI: { value: 1 },
      uCam: { value: new THREE.Vector3() }, uLuz: { value: new THREE.Vector3(0.3, 0.32, 0.35) }, uFlash: { value: 0 },
      uPx: { value: 0.001 }, uViento: { value: new THREE.Vector2(0, 0) }, uVis: { value: 0 }
    };
    var LLUVIA_Z =
      'uniform vec4 uMuro; uniform float uPreLl, uLluviaI, uVis;\n' +
      'float lluviaZ(float z){ float m=smoothstep(uMuro.x,uMuro.y,z); return max(smoothstep(uMuro.x-uPreLl,uMuro.x-uPreLl*0.45,z)*0.14*(1.0-m), m*(1.0-smoothstep(uMuro.z,uMuro.w,z)))*uLluviaI*uVis; }\n';

    // ======================= 1. la lluvia: gotas que caen (en la GPU) =======================
    // dos capas con el mismo sombreador: la de cerca va con la canoa; la del frente está quieta en el río, justo
    // donde empieza el chaparrón, con trazos más largos y finos para que el muro se vea de lejos como lluvia que cae
    // (Pau, 12/11: la lámina gris del frente «se nota mucho y está como parada»)
    function capaLluvia(N, caja, op) {
      var g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      var sem = new Float32Array(N * 4);
      for (var i = 0; i < N * 4; i++) sem[i] = Math.random();
      g.setAttribute('aS', new THREE.InstancedBufferAttribute(sem, 4));
      g.instanceCount = N;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      var u = Object.assign({ uCaja: { value: caja }, uOrg: { value: new THREE.Vector3() }, uLargo: { value: new THREE.Vector2(op.largo[0], op.largo[1]) },
        uVer: { value: new THREE.Vector4(op.ver[0], op.ver[1], op.ver[2], op.ver[3]) }, uAlfa: { value: op.alfa } }, comun);
      var mat = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false,
        vertexShader: LLUVIA_Z +
          'attribute vec4 aS; uniform vec3 uCam, uCaja, uOrg; uniform vec2 uViento, uLargo; uniform vec4 uVer; uniform float uT, uPx, uAlfa; varying float vA; varying vec2 vQ;\n' +
          'void main(){\n' +
          '  float caida=1350.0*(0.8+0.4*aS.w);\n' +
          '  vec3 v=vec3(uViento.x,-caida,uViento.y);\n' +
          '  vec3 p=uOrg+mod(aS.xyz*uCaja+v*uT-uOrg,uCaja);\n' +
          '  float dens=lluviaZ(p.z);\n' +
          '  if(fract(aS.w*7.31)>dens){ gl_Position=vec4(2.0,2.0,2.0,1.0); vA=0.0; vQ=vec2(0.0); return; }\n' +
          '  vec3 dir=normalize(v); vec3 ac=uCam-p; float d=length(ac);\n' +
          '  vec3 lado=normalize(cross(dir,ac));\n' +
          '  float wf=0.16, w=max(wf,d*uPx*0.7), largo=uLargo.x+aS.w*uLargo.y;\n' +
          '  vec3 pos=p+dir*largo*(position.y-0.5)+lado*w*position.x;\n' +
          '  vA=uAlfa*(0.45+0.9*fract(aS.w*13.7))*min(1.0,wf/w*2.2+0.2)*smoothstep(uVer.x,uVer.y,d)*(1.0-smoothstep(uVer.z,uVer.w,d))*smoothstep(-30.0,10.0,p.y)*(1.0-smoothstep(uCaja.y-260.0,uCaja.y-40.0,p.y-uOrg.y));\n' +
          '  vQ=vec2(position.x,position.y);\n' +
          '  gl_Position=projectionMatrix*viewMatrix*vec4(pos,1.0);\n' +
          '}',
        fragmentShader:
          'uniform vec3 uLuz; uniform float uFlash; varying float vA; varying vec2 vQ;\n' +
          'void main(){ float e=1.0-vQ.x*vQ.x; float l=sin(vQ.y*3.14159); float a=vA*e*l; if(a<0.004) discard;\n' +
          '  gl_FragColor=vec4(uLuz*1.15+vec3(0.75,0.8,1.0)*uFlash*1.15,a); }'
      });
      var m = new THREE.Mesh(g, mat);
      m.frustumCulled = false; m.layers.set(1); m.renderOrder = 8;
      escena.add(m);
      return { malla: m, u: u };
    }
    var CAJA = new THREE.Vector3(2600, 1500, 2600);
    var capaCerca = capaLluvia(34000, CAJA, { largo: [16, 22], ver: [35, 140, 940, 1300], alfa: 0.5 });
    var lluvia = capaCerca.malla;
    // el frente: de orilla a orilla y algo más (unos 180 m) y unos 58 m de hondo, desde el muro hacia dentro
    var CAJA_F = new THREE.Vector3(7600, 3400, 2400);
    var frenteG = capaLluvia(20000, CAJA_F, { largo: [60, 70], ver: [900, 1500, 22000, 30000], alfa: 0.8 });
    frenteG.u.uOrg.value.set(-3800, -30, Z0[0] - 150);

    // ======================= 2. las cortinas de lluvia =======================
    // una textura de vetas verticales (cada columna con su densidad, cortada a trozos), hecha una vez
    var TW = 256, TH = 256, vet = new Uint8Array(TW * TH * 4);
    var col = [], k;
    var crudo = []; for (k = 0; k < TW; k++) crudo.push(Math.pow(Math.random(), 1.6));
    for (k = 0; k < TW; k++) col.push((crudo[(k + TW - 2) % TW] * 0.12 + crudo[(k + TW - 1) % TW] * 0.22 + crudo[k] * 0.32 + crudo[(k + 1) % TW] * 0.22 + crudo[(k + 2) % TW] * 0.12) * 1.15);
    for (var y = 0; y < TH; y++) for (var x = 0; x < TW; x++) {
      var c0 = col[x], ruido = Math.sin(y * 0.11 + c0 * 40) * 0.5 + 0.5, corte = Math.sin(y * 0.031 + c0 * 17 + x * 0.01) * 0.5 + 0.5;
      var v = Math.pow(c0, 1.6) * (0.55 + 0.45 * ruido) * (0.35 + 0.65 * corte);
      var o = (y * TW + x) * 4; vet[o] = vet[o + 1] = vet[o + 2] = Math.min(255, v * 255); vet[o + 3] = 255;
    }
    var texVet = new THREE.DataTexture(vet, TW, TH, THREE.RGBAFormat);
    texVet.wrapS = texVet.wrapT = THREE.RepeatWrapping; texVet.magFilter = THREE.LinearFilter; texVet.minFilter = THREE.LinearMipmapLinearFilter; texVet.generateMipmaps = true; texVet.needsUpdate = true;
    var RADIOS = [900, 1700, 2900, 4600, 7200, 11000], PREV = [350, 900, 1700, 2900, 4600, 7200];
    var cortinas = [];
    RADIOS.forEach(function (R, n) {
      var g = new THREE.CylinderGeometry(R, R, 4200, 96, 1, true);
      g.translate(0, 2100 - 40, 0);
      // repeticiones enteras alrededor del anillo: sin costura detrás
      var r1 = Math.round(6.2832 * R / (420 + n * 90)), r2 = Math.round(6.2832 * R / (170 + n * 40));
      var u = Object.assign({ uVet: { value: texVet }, uR: { value: R }, uGrosor: { value: 1 - Math.exp(-(R - PREV[n]) / 3600) }, uK: { value: n }, uRep: { value: new THREE.Vector2(r1, r2) }, uBruma: { value: new THREE.Vector3(0.4, 0.42, 0.45) }, uNiebla: { value: new THREE.Vector2(3000, 17000) } }, comun);
      var m = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, side: THREE.BackSide,
        vertexShader: 'varying vec3 vW, vL; void main(){ vL=position; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
        fragmentShader: LLUVIA_Z +
          'uniform sampler2D uVet; uniform float uR, uK, uT, uFlash, uGrosor; uniform vec2 uRep; uniform vec3 uLuz, uBruma, uCam; uniform vec2 uViento, uNiebla; varying vec3 vW, vL;\n' +
          'float vetas(vec2 uv){ vec2 u2=vec2(fract(uv.x+0.5)-0.5,uv.y); vec2 dx=dFdx(uv), dy=dFdy(uv), dx2=dFdx(u2), dy2=dFdy(u2);\n' +
          '  if(abs(dx2.x)<abs(dx.x)) dx.x=dx2.x; if(abs(dy2.x)<abs(dy.x)) dy.x=dy2.x; return textureGrad(uVet,uv,dx,dy).r; }\n' +
          'void main(){\n' +
          '  float ll=lluviaZ(vW.z)*mix(1.0,smoothstep(uMuro.x+200.0,uMuro.x+3200.0,vW.z),step(vW.z,uMuro.z)); if(ll<0.01) discard;\n' +
          '  float an=atan(vL.x,vL.z)/6.28318+0.5;\n' +       // 0…1 alrededor del anillo
          '  float inc=-uViento.x/1350.0*vL.y/uR/6.28318;\n' +   // el viento inclina las vetas
          '  float v1=vetas(vec2((an+inc)*uRep.x, vL.y/2600.0+uT*(0.55+uK*0.03)+uK*0.37));\n' +
          '  float v2=vetas(vec2((an+inc)*uRep.y+0.5, vL.y/1500.0+uT*(0.9+uK*0.05)+uK*0.71));\n' +
          '  float vt=v1*0.65+v2*0.5;\n' +
          '  float A=an*6.28318, rafaga=0.55+0.45*sin(A*3.0+uT*0.35+uK*1.7)*sin(A*7.0-uT*0.22+uK);\n' +   // la lluvia va por rachas
          '  float alto=smoothstep(-40.0,160.0,vW.y)*(1.0-smoothstep(1800.0,4100.0,vW.y));\n' +
          '  float spray=exp(-max(vW.y,0.0)/420.0)*0.1*smoothstep(-40.0,60.0,vW.y);\n' +                            // donde rebota, junto al agua, un velo blanco
          '  float d=length(vW-uCam); float fog=smoothstep(uNiebla.x,uNiebla.y,d);\n' +
          '  float a=(uGrosor*(0.55+0.75*vt)*rafaga+spray*0.5)*ll*alto;\n' +
          '  vec3 c=mix(uLuz*1.5,uBruma,0.45)*(0.85+0.3*vt)+vec3(0.75,0.8,1.0)*uFlash*0.28;\n' +
          '  gl_FragColor=vec4(c,clamp(a,0.0,0.85));\n' +
          '}'
      });
      var malla = new THREE.Mesh(g, m); malla.frustumCulled = false; malla.layers.set(1); malla.renderOrder = 7 - n;
      escena.add(malla); cortinas.push({ malla: malla, u: u });
    });

    // ======================= 3. los rayos =======================
    var RAYO_VS =
      'attribute vec3 aA, aB; attribute vec4 aQ; attribute float aAncho; uniform vec3 uCam; uniform float uAncho, uAnchoPx, uPx;\n' +
      'varying float vLado, vInt, vAlong, vD;\n' +
      'void main(){ vec3 P=mix(aA,aB,aQ.y); vec3 dir=normalize(aB-aA); vec3 ac=uCam-P; float d=length(ac);\n' +
      '  vec3 lado=normalize(cross(dir,ac)); float w=max(uAncho*aAncho,d*uPx*uAnchoPx*mix(0.6,1.0,aAncho));\n' +
      '  P+=lado*w*aQ.x+dir*w*(aQ.y*2.0-1.0)*0.6;\n' +
      '  vLado=aQ.x; vInt=aQ.w; vAlong=aQ.z; vD=d; gl_Position=projectionMatrix*viewMatrix*vec4(P,1.0); }';
    var RAYO_FS =
      'uniform float uRevela, uBrillo, uRamas, uHalo, uAten; varying float vLado, vInt, vAlong, vD;\n' +
      'void main(){ if(vAlong>uRevela) discard;\n' +
      '  float x=vLado; float perfil=uHalo>0.5?exp(-x*x*2.6):exp(-x*x*6.0);\n' +
      '  float ramas=vInt>0.99?1.0:vInt*uRamas;\n' +
      '  float nace=smoothstep(0.0,0.07,vAlong);\n' +            // sale de dentro de la nube
      '  float at=uHalo>0.5?exp(-vD/(uAten*1.8)):exp(-vD/uAten);\n' +
      '  vec3 c=uHalo>0.5?vec3(0.45,0.5,1.0):vec3(0.95,0.95,1.0);\n' +
      '  float k=uBrillo*ramas*perfil*nace*at*(uHalo>0.5?0.3:32.0);\n' +
      '  gl_FragColor=vec4(c*k,1.0); }';
    function matRayo(halo) {
      return new THREE.ShaderMaterial({
        uniforms: { uCam: comun.uCam, uPx: comun.uPx, uAncho: { value: halo ? 150 : 9 }, uAnchoPx: { value: halo ? 20 : 2.0 }, uRevela: { value: 0 }, uBrillo: { value: 0 }, uRamas: { value: 1 }, uHalo: { value: halo ? 1 : 0 }, uAten: { value: 26000 } },
        vertexShader: RAYO_VS, fragmentShader: RAYO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      });
    }
    // el canal: desplazamiento del punto medio (los quiebros se hacen más pequeños cuanto más cerca)
    function quebrar(a, b, niveles, rug, out) {
      if (niveles === 0) { out.push([a, b]); return; }
      var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var m = [(a[0] + b[0]) / 2 + (Math.random() - 0.5) * L * rug, (a[1] + b[1]) / 2 + (Math.random() - 0.5) * L * rug * 0.25, (a[2] + b[2]) / 2 + (Math.random() - 0.5) * L * rug];
      quebrar(a, m, niveles - 1, rug, out); quebrar(m, b, niveles - 1, rug, out);
    }
    function hacerRayo(x, z, H) {
      var segs = [];   // [a, b, along0, along1, intensidad, ancho]
      var arriba = [x + (Math.random() - 0.5) * H * 0.5, H, z + (Math.random() - 0.5) * H * 0.5], abajo = [x, -40, z];
      var tronco = []; quebrar(arriba, abajo, 7, 0.36, tronco);
      tronco.forEach(function (s, i) { segs.push([s[0], s[1], i / tronco.length, (i + 1) / tronco.length, 1, 1]); });
      var nR = 5 + (Math.random() * 6 | 0);
      for (var r = 0; r < nR; r++) {
        var j = Math.floor((0.08 + Math.random() * 0.62) * tronco.length), p0 = tronco[j][0], al0 = j / tronco.length;
        var Lr = H * (0.12 + Math.random() * 0.3), ang = Math.random() * 6.283;
        var p1 = [p0[0] + Math.cos(ang) * Lr * 0.75, p0[1] - Lr * (0.6 + Math.random() * 0.5), p0[2] + Math.sin(ang) * Lr * 0.75];
        var rama = []; quebrar(p0, p1, 5, 0.4, rama);
        var it = 0.3 + Math.random() * 0.35, k2 = (Lr / H);
        rama.forEach(function (s, i) { segs.push([s[0], s[1], al0 + k2 * i / rama.length, al0 + k2 * (i + 1) / rama.length, it * (1 - 0.6 * i / rama.length), 0.55]); });
        if (Math.random() < 0.55) {      // una ramita de la rama
          var q = rama[Math.floor(rama.length * (0.3 + Math.random() * 0.4))][0], L2 = Lr * 0.45, a2 = ang + (Math.random() - 0.5) * 2;
          var q1 = [q[0] + Math.cos(a2) * L2 * 0.8, q[1] - L2 * 0.6, q[2] + Math.sin(a2) * L2 * 0.8], sub = []; quebrar(q, q1, 4, 0.42, sub);
          sub.forEach(function (s, i) { segs.push([s[0], s[1], al0 + k2 * 0.5 + (L2 / H) * i / sub.length, al0 + k2 * 0.5 + (L2 / H) * (i + 1) / sub.length, it * 0.5 * (1 - i / sub.length), 0.38]); });
        }
      }
      var n = segs.length, A = new Float32Array(n * 12), B = new Float32Array(n * 12), Q = new Float32Array(n * 16), W = new Float32Array(n * 4), idx = [];
      segs.forEach(function (s, i) {
        var esq = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
        for (var e = 0; e < 4; e++) {
          var o3 = (i * 4 + e) * 3, o4 = (i * 4 + e) * 4;
          A[o3] = -s[0][0]; A[o3 + 1] = s[0][1]; A[o3 + 2] = s[0][2];
          B[o3] = -s[1][0]; B[o3 + 1] = s[1][1]; B[o3 + 2] = s[1][2];
          Q[o4] = esq[e][0]; Q[o4 + 1] = esq[e][1]; Q[o4 + 2] = esq[e][1] ? s[3] : s[2]; Q[o4 + 3] = s[4];
          W[i * 4 + e] = s[5];
        }
        var b0 = i * 4; idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
      g.setAttribute('aA', new THREE.BufferAttribute(A, 3)); g.setAttribute('aB', new THREE.BufferAttribute(B, 3));
      g.setAttribute('aQ', new THREE.BufferAttribute(Q, 4)); g.setAttribute('aAncho', new THREE.BufferAttribute(W, 1));
      g.setIndex(idx); g.boundingSphere = new THREE.Sphere(new THREE.Vector3(-x, H / 2, z), H * 1.2);
      var nucleo = new THREE.Mesh(g, matRayo(false)), halo = new THREE.Mesh(g, matRayo(true));
      nucleo.renderOrder = 9; halo.renderOrder = 9; nucleo.frustumCulled = halo.frustumCulled = false;
      escena.add(halo); escena.add(nucleo);        // capa 0: el río los refleja
      return { g: g, nucleo: nucleo, halo: halo };
    }

    var dormido = hacerRayo(0, -1e6, 10);         // apagado y lejos: compila los sombreadores al empezar, no en el primer rayo
    var eventos = [], proximo = 2, T = { flash: 0, dir: [0, 0.5, 1], cerca: 0, viento: 0, lluvia: 0 };
    var camX = 0, camZ = 0, rafagaVista = -1;
    function lanzar(tq, forzar, azF, dF) {
      var esRayo = forzar === 'rayo' || (forzar !== 'nube' && Math.random() < 0.18 + 0.62 * Math.min(1, tq.rayos * 1.25));
      var cerca = forzar ? 0.8 : tq.cerca;
      // casi la mitad, sobre el cauce (delante, o detrás cuando la tormenta se va): ahí no los tapan los árboles
      var az, q = Math.random(), atras = Math.random() < 0.8 * tq.detras ? Math.PI : 0;
      if (azF != null) az = azF;
      else if (q < 0.45) az = atras + (Math.random() - 0.5) * 0.55;
      else if (q < 0.72) az = atras + (Math.random() - 0.5) * 2.2;
      else az = Math.random() * 6.283;
      var d0 = 16000 + (5200 - 16000) * cerca, d1 = 30000 + (15000 - 30000) * cerca, d = dF || d0 + Math.random() * (d1 - d0);
      var x = camX + Math.sin(az) * d, z = camZ + Math.cos(az) * d, H = 6500 + Math.random() * 3500;
      var ev = { rayo: esRayo, t: 0, x: x, z: z, d: d, H: H, golpes: [], amp: [], fin: 0 };
      if (esRayo) {
        ev.lider = 0.035 + Math.random() * 0.05;
        var n = 1 + (Math.random() * 3.6 | 0), tt = ev.lider;
        for (var i = 0; i < n; i++) { ev.golpes.push(tt); ev.amp.push(i === 0 ? 1 : 0.55 + Math.random() * 0.45); tt += 0.045 + Math.random() * 0.12; }
        ev.fin = tt + 0.7; ev.malla = hacerRayo(x, z, H);
      } else {
        var m = 2 + (Math.random() * 4 | 0), t2 = 0;
        for (var j = 0; j < m; j++) { ev.golpes.push(t2); ev.amp.push(0.25 + Math.random() * 0.45); t2 += 0.06 + Math.random() * 0.22; }
        ev.fin = t2 + 0.5; ev.H = H * (1.2 + Math.random() * 0.6);
      }
      ev.trueno = (d / M) / 343;                    // segundos hasta que llega el trueno
      eventos.push(ev);
      return ev;
    }
    function soltar(ev) { if (ev.malla) { escena.remove(ev.malla.nucleo); escena.remove(ev.malla.halo); ev.malla.g.dispose(); ev.malla.nucleo.material.dispose(); ev.malla.halo.material.dispose(); } }

    // ======================= cada fotograma =======================
    T.actualizar = function (dt, A, cx, cz, vista) {
      camX = cx; camZ = cz;
      var tq = A.torm || { lluvia: 0, rayos: 0, viento: 0, cerca: 0, detras: 0, s: -9 };
      T.viento = tq.viento; T.lluvia = tq.lluvia; T.tq = tq;
      // el viento: sopla de la orilla izquierda a la derecha, con rachas
      var rach = 0.75 + 0.25 * Math.sin(uT.value * 0.7) * Math.sin(uT.value * 0.29 + 1);
      comun.uViento.value.set(-(160 + 260 * tq.viento) * rach, -60);     // (X de Three = −x lógico)
      // (Pau, 12/11) la lluvia de la tormenta no se ve desde la laguna con el cielo azul: solo cuando el cielo ya está cerrado
      var o = A.oscuras || 0; comun.uVis.value = (function (t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); })((o - 0.3) / 0.35);
      comun.uCam.value.copy(camara.position);
      capaCerca.u.uOrg.value.set(camara.position.x - CAJA.x * 0.5, -30, camara.position.z - CAJA.z * 0.5);
      comun.uPx.value = 2 * Math.tan(camara.fov * Math.PI / 360) / Math.max(300, vista.alto);
      comun.uLuz.value.fromArray(vista.luz);
      // ¿hace falta pintar la lluvia? (solo cerca de la tormenta)
      var m = comun.uMuro.value, dentro = camZ > m.x - PRE - 14000 && camZ < m.w + 14000;
      lluvia.visible = dentro && camZ > m.x - PRE - 2000 && camZ < m.w + 2000;
      frenteG.malla.visible = camZ > m.x - 30000 && camZ < m.x + 900;
      cortinas.forEach(function (c) { c.malla.visible = dentro; c.malla.position.set(camara.position.x, 0, camara.position.z); c.u.uBruma.value.fromArray(vista.bruma); c.u.uNiebla.value.set(vista.niebla[0], vista.niebla[1]); });
      // los relámpagos
      if (tq.rayos > 0.01) {
        proximo -= dt;
        if (proximo <= 0) {
          lanzar(tq);
          var media = 13 + (2.6 - 13) * tq.rayos;
          proximo = Math.max(0.7, -Math.log(1 - Math.random() * 0.95) * media * 0.8 + media * 0.2);
          if (Math.random() < 0.18 * tq.rayos) proximo = 0.25 + Math.random() * 0.4;   // a veces dos seguidos
        }
      } else proximo = Math.min(proximo, 3);
      var F = 0, dx = 0, dy = 0, dz = 0, cerca = 0;
      for (var i = eventos.length - 1; i >= 0; i--) {
        var ev = eventos[i]; ev.t += dt;
        var b = 0;
        for (var j = 0; j < ev.golpes.length; j++) { var e = ev.t - ev.golpes[j]; if (e >= 0) b += ev.amp[j] * Math.exp(-e / (ev.rayo ? 0.045 : 0.09)); }
        if (ev.rayo) {
          var t1 = ev.golpes[0], resto = ev.t > t1 ? 0.14 * Math.exp(-(ev.t - t1) / 0.35) : 0;
          var lider = ev.t < t1 ? 0.22 : 0;
          var revela = Math.min(1, ev.t / ev.lider) * 1.02;
          ev.malla.nucleo.material.uniforms.uRevela.value = ev.malla.halo.material.uniforms.uRevela.value = revela;
          var brillo = Math.max(lider, b + resto);
          ev.malla.nucleo.material.uniforms.uBrillo.value = brillo;
          ev.malla.halo.material.uniforms.uBrillo.value = brillo;
          var ramas = ev.t < t1 ? 1 : Math.exp(-(ev.t - t1) / 0.12) * 0.85 + 0.15;
          ev.malla.nucleo.material.uniforms.uRamas.value = ev.malla.halo.material.uniforms.uRamas.value = ramas;
        }
        // cuánto ilumina (más cuanto más cerca): el destello del mundo
        var k = Math.min(2.2, Math.pow(13000 / ev.d, 1.2)) * (ev.rayo ? 1 : 0.6);
        var f = b * k; F += f;
        var ex = ev.x - camX, ez = ev.z - camZ, eh = ev.H * 0.75, L = Math.hypot(ex, eh, ez);
        dx += ex / L * f; dy += eh / L * f; dz += ez / L * f; cerca = Math.max(cerca, f);
        if (!ev.sono && ev.t > ev.golpes[0] + ev.trueno) {      // el trueno
          ev.sono = true;
          try { if (C.trueno) C.trueno({ x: ev.x, z: ev.z, fuerza: Math.min(1, 7000 / ev.d) * (ev.rayo ? 1 : 0.5), distancia: ev.d / M, rayo: ev.rayo }); } catch (er) { /* sin sonido */ }
        }
        if (ev.t > Math.max(ev.fin, ev.golpes[0] + ev.trueno + 0.1)) { soltar(ev); eventos.splice(i, 1); }
      }
      T.flash = F; T.cerca = cerca;
      if (F > 0.0001) { var Ld = Math.hypot(dx, dy, dz) || 1; T.dir = [dx / Ld, dy / Ld, dz / Ld]; }
      comun.uFlash.value = Math.min(2, F);
      // el frente de la tormenta: los pájaros huyen y el viento arranca hojas
      if (tq.s < -0.15) rafagaVista = -1;
      if (rafagaVista < 0 && tq.s > -0.02) { rafagaVista = 0; if (C.bandada) { C.bandada(); C.bandada(); } }
      if (rafagaVista === 0 && tq.s > 0.08) { rafagaVista = 1; if (C.bandada) C.bandada(); }
      if (tq.viento > 0.35 && C.hojaAlViento && Math.random() < dt * 9 * tq.viento) C.hojaAlViento(tq.viento);
    };
    // para probar sin esperar: un rayo delante (o un relámpago en las nubes)
    T.rayo = function (tipo, az, d) { var tq = { rayos: 1, cerca: 0.8, detras: 0 }; return lanzar(tq, tipo || 'rayo', az, d); };
    T.eventos = eventos; T.pre = PRE;
    return T;
  };
})();
