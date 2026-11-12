// Amazonia Incognita · el mundo en Three.js: luz del tramo con sombras reales, cielo fotográfico como luz de entorno,
// agua con reflejo y ondas en la GPU, selva instanciada con copas 3D que se mueven con el viento, orillas de tierra,
// vida (aves, delfín, hojas, lluvia, luciérnagas) y el etalonado de película.
// Sustituye al motor propio (js/motor-propio.js, que queda como referencia). Mismo viaje, mismos mandos, misma API.
(function () {
  'use strict';
  var THREE = window.THREE, VJ = window.AM && window.AM.viaje, GL = window.AM && window.AM.glsl;
  var CAPTURA = /captura/.test(location.search);
  var aviso = document.getElementById('aviso');
  if (!THREE || !VJ || !GL) { if (aviso) aviso.style.display = 'flex'; return; }

  // ======================= Constantes del mundo (las del motor propio) =======================
  var OJO = 52;                 // altura de los ojos (1 unidad ≈ 2,4 cm)
  var LARGO = 15000;            // pasillo de piezas que se recicla
  var CERCA = 30;
  var G = 408;                  // gravedad en unidades/s²
  var FOVY = 56 * Math.PI / 180, PITCH = -4.2 * Math.PI / 180;
  var SIM_N = 512, SIM_TAM = 2048;      // ondas: 512² celdas sobre 2048 unidades
  var SOMBRA_CAJA = 3000;               // las sombras cubren ±3000 u alrededor de la canoa (quietas: no siguen la mirada)
  var AVES = { guacamayo: { largo: 40, ale: 3.9 }, garza: { largo: 48, ale: 2.3 }, loro: { largo: 17, ale: 6.0 } };
  var MARCOS = window.AMZ_MARCOS || {};
  var TEX = window.AMZ_TEX || {}, HOJAS = window.AMZ_HOJAS || {};
  var TIENE_TEX = Object.keys(TEX).length > 0;

  function semilla(s) { return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  var azar = semilla(20261111);
  function centro(z) { return 0; }   // (Pau, 11/11) el río va recto: la canoa solo avanza
  function suave(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function hash(a, b) { var h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) % 2147483645 + 1; }
  function ruido1(x) { var i = Math.floor(x), f = x - i, a = hash(i, 17) / 2147483646, b = hash(i + 1, 17) / 2147483646; f = f * f * (3 - 2 * f); return a + (b - a) * f; }
  function ruido2(x, y) {
    var i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    var h = function (a, b) { return hash(a * 7919 + b * 104729, 31) / 2147483646; };
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = h(i, j), b = h(i + 1, j), c = h(i, j + 1), d = h(i + 1, j + 1);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  function srgbALineal(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lin3(c) { return [srgbALineal(c[0]), srgbALineal(c[1]), srgbALineal(c[2])]; }

  // ======================= El renderizador =======================
  var lienzo = document.getElementById('gl');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: CAPTURA });
  } catch (e) { if (aviso) aviso.style.display = 'flex'; return; }
  var gl = renderer.getContext();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // (Pau, 12/11: «miro a la derecha y lo que estaba iluminado se queda sin luz») la caja de sombras ya no va hacia
  // donde miras: está quieta alrededor de la canoa y es más grande; y en su borde la sombra no se corta de golpe:
  // se funde con una «media sombra» de selva (lo que hay más allá no está ni todo al sol ni todo a la sombra)
  THREE.ShaderChunk.shadowmap_pars_fragment =
    'float sombraBorde(float s, vec4 c){ float b=min(min(c.x,1.0-c.x),min(c.y,1.0-c.y)); if(c.z>1.0) b=-1.0; return mix(0.72, s, smoothstep(0.0,0.14,b)); }\n' +
    THREE.ShaderChunk.shadowmap_pars_fragment.split('return mix( 1.0, shadow, shadowIntensity );').join('return mix( 1.0, sombraBorde( shadow, shadowCoord ), shadowIntensity );');
  renderer.shadowMap.autoUpdate = false;          // la sombra se calcula una vez por fotograma (antes del reflejo)
  renderer.toneMapping = THREE.NoToneMapping;     // el revelado lo hace el pase de cine
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.info.autoReset = false;               // contamos todo el fotograma (sombra + reflejo + escena + cine)
  THREE.ShaderChunk.fog_fragment = GL.FOG_FRAGMENT; THREE.ShaderChunk.fog_pars_vertex = GL.FOG_PARS_V; THREE.ShaderChunk.fog_vertex = GL.FOG_V; THREE.ShaderChunk.fog_pars_fragment = GL.FOG_PARS_F;
  var flotante = !!gl.getExtension('EXT_color_buffer_float');
  var ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  var escena = new THREE.Scene();
  escena.fog = new THREE.Fog(0x998877, 2500, 15000);
  var camara = new THREE.PerspectiveCamera(56, 1, 4, 80000);
  camara.layers.enable(1);                         // capa 1: lo que no sale en el reflejo (el agua, los velos de niebla)
  var espejo = new THREE.PerspectiveCamera(56, 1, 4, 80000);
  espejo.layers.set(0);

  // la luz: el sol del tramo (con sombras), el cielo como entorno, un poco de cielo/suelo y el farol de noche
  var sol = new THREE.DirectionalLight(0xffffff, 3);
  sol.castShadow = true;
  sol.shadow.mapSize.set(4096, 4096);
  var sc = sol.shadow.camera; sc.left = -SOMBRA_CAJA; sc.right = SOMBRA_CAJA; sc.top = SOMBRA_CAJA; sc.bottom = -SOMBRA_CAJA; sc.near = 50; sc.far = 14000;
  sol.shadow.bias = -0.0006; sol.shadow.normalBias = 2.2;
  escena.add(sol); escena.add(sol.target);
  var hemi = new THREE.HemisphereLight(0x8899aa, 0x332211, 0.25); escena.add(hemi);
  var farol = new THREE.PointLight(0xffa050, 0, 1500, 1.4); escena.add(farol);

  // uniformes compartidos por todos los materiales (se actualizan una vez por fotograma)
  var U = {
    uT: { value: 0 }, uSolDir: { value: new THREE.Vector3(0, 1, 0) }, uSolLuz: { value: new THREE.Color(1, 1, 1) }, uSimV: { value: null }
  };

  // ======================= Carga: texturas y modelos =======================
  var pendientes = 0, construido = false, fallos = [];
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  // una textura desde un data-URL. op: srgb, repetir, mip, premult
  function textura(src, op, cb) {
    op = op || {};
    var t = new THREE.Texture(); t.flipY = false;
    t.colorSpace = op.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = op.repetir ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.generateMipmaps = op.mip !== false; t.minFilter = op.mip !== false ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.anisotropy = op.mip !== false ? ANISO : 1; t.premultiplyAlpha = !!op.premult;
    if (!src) return t;
    pendientes++;
    var im = new Image();
    im.onload = function () { t.image = im; t.needsUpdate = true; pendientes--; cb && cb(t); };
    im.onerror = function () { fallos.push('textura'); pendientes--; };
    im.src = src;
    return t;
  }
  // texturas de la vida (atlas de aves, hojas que caen, camalotes): premultiplicadas como en el motor propio
  var IMG = {};
  ['camalotes', 'ave-guacamayo', 'ave-garza', 'ave-loro', 'hojas', 'ramas'].forEach(function (n) {
    if (window.AMZ_IMG && AMZ_IMG[n]) IMG[n] = textura(AMZ_IMG[n], { premult: n !== 'ramas', srgb: true });
  });
  // las fotos tileables (cortezas, maderas, barro) y los atlas de hojas
  var FOTO = {};
  Object.keys(TEX).forEach(function (n) { FOTO[n] = textura(TEX[n], { repetir: true }); });
  var ATLAS = {};
  Object.keys(HOJAS).forEach(function (n) { ATLAS[n] = { tex: textura(HOJAS[n].img, {}), marcos: HOJAS[n].marcos }; });
  if (!ATLAS['hojas-selva'] && IMG.ramas) ATLAS['hojas-selva'] = { tex: IMG.ramas, marcos: MARCOS.ramas };
  function atlasPara(nombre) {
    var n = /arbustos|liana/.test(nombre) ? 'arbusto' : /helechos/.test(nombre) ? 'helechos' : /heliconias/.test(nombre) ? 'heliconias' : /hojas-gigantes/.test(nombre) ? 'hojas-gigantes' : 'hojas-selva';
    return ATLAS[n] || ATLAS['hojas-selva'];
  }

  // el mapa de olas (normales de una suma de ondas), igual que el motor propio
  function texOlas() {
    var N = 256, alt = new Float32Array(N * N), r = semilla(99), olas = [];
    for (var k = 0; k < 40; k++) {
      var ang = r() * Math.PI * 2, f = 1 + Math.floor(Math.pow(r(), 1.6) * 22);
      olas.push([Math.round(Math.cos(ang) * f), Math.round(Math.sin(ang) * f * 0.55), r() * 6.283, 1 / Math.pow(f, 1.25)]);
    }
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var h = 0;
      for (k = 0; k < olas.length; k++) { var o = olas[k]; var fase = 6.2832 * (o[0] * x + o[1] * y) / N + o[2]; h += o[3] * (Math.sin(fase) + 0.35 * Math.sin(2 * fase + 1.7)); }
      alt[y * N + x] = h;
    }
    var px = new Uint8Array(N * N * 4), esc = 9.0;
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      var dx = alt[y * N + (x + 1) % N] - alt[y * N + (x + N - 1) % N], dy = alt[((y + 1) % N) * N + x] - alt[((y + N - 1) % N) * N + x];
      var nx = -dx * esc, ny = -dy * esc, nz = 1, l = Math.hypot(nx, ny, nz), i = (y * N + x) * 4;
      px[i] = (nx / l * 0.5 + 0.5) * 255; px[i + 1] = (ny / l * 0.5 + 0.5) * 255; px[i + 2] = (nz / l * 0.5 + 0.5) * 255; px[i + 3] = 255;
    }
    var t = new THREE.DataTexture(px, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = ANISO; t.needsUpdate = true;
    return t;
  }
  var OLAS = texOlas();

  // ---------- los cielos: fotos equirectangulares 360°, solo las del tramo actual y los vecinos en memoria ----------
  var CIELOS = {};   // id → { tex, listo, expo }
  function cielo(id) {
    var c = window.AMZ_CIELOS && AMZ_CIELOS[id]; if (!c || c.h0 != null) return null;   // (el formato viejo cilíndrico ya no existe)
    if (!CIELOS[id]) {
      CIELOS[id] = { listo: false, expo: 1, bruma: c.bruma, zenit: c.zenit, banda: !!c.banda };
      CIELOS[id].tex = textura(c.img, { repetir: true }, function (t) { try { renderer.initTexture(t); } catch (e) { /* se sube al usarla */ } CIELOS[id].listo = true; entornoClave = ''; });
    }
    return CIELOS[id];
  }
  function cielosNecesarios(A) {
    var ids = {}, i = A.a ? VJ.tramos.indexOf(A.a) : 0;
    [i - 1, i, i + 1, i + 2].forEach(function (k) { if (VJ.tramos[k]) ids[VJ.tramos[k].id] = 1; });
    for (var id in CIELOS) if (!ids[id] && CIELOS[id].listo) { CIELOS[id].tex.dispose(); delete CIELOS[id]; }
    for (id in ids) cielo(id);
  }

  // ---------- los modelos (GLB en base64) ----------
  var GLTF = {}, cargaLoader = new THREE.GLTFLoader();
  function cargarGLB(nombre) {
    if (!window.AMZ_GLB || !AMZ_GLB[nombre]) return;
    pendientes++;
    try {
      cargaLoader.parse(b64(AMZ_GLB[nombre]), '', function (g) { GLTF[nombre] = g; pendientes--; }, function (e) { fallos.push(nombre + ': ' + e); pendientes--; });
    } catch (e) { fallos.push(nombre + ': ' + e); pendientes--; }
  }
  var CATALOGO = window.AMZ_CATALOGO || [];
  CATALOGO.forEach(function (c) { cargarGLB(c.nombre); });
  ['delfin', 'kapok', 'kapok-ramas', 'caiman', 'mono', 'garza', 'ribereno', 'teatro-amazonas', 'ciudad-ladera', 'loro', 'ave-garza', 'ave-loro', 'ave-guacamayo', 'persona-pie', 'persona-sentada', 'persona-hamaca'].forEach(cargarGLB);

  // la geometría de un GLB con las transformaciones de sus nodos ya aplicadas (y el material de Meshy, si lo trae)
  function geometriaDe(g) {
    var lista = [];
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(function (o) { if (o.isMesh) { var geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld); lista.push({ geo: geo, mat: o.material }); } });
    return lista;
  }
  // el motor propio dibujaba el mundo en espejo (x a la derecha); Three no. Para que todo quede donde estaba
  // (barcos a la izquierda, árboles inclinados hacia el agua…) cada geometría se refleja en X y se le da la vuelta a los triángulos.
  function espejar(geo) {
    var p = geo.attributes.position, n = geo.attributes.normal, i;
    for (i = 0; i < p.count; i++) p.setX(i, -p.getX(i));
    if (n) for (i = 0; i < n.count; i++) n.setX(i, -n.getX(i));
    if (!geo.index) { var ix = new Uint32Array(p.count); for (i = 0; i < ix.length; i++) ix[i] = i; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
    var I = geo.index;
    for (i = 0; i < I.count; i += 3) { var a = I.getX(i + 1); I.setX(i + 1, I.getX(i + 2)); I.setX(i + 2, a); }
    p.needsUpdate = true; if (n) n.needsUpdate = true; I.needsUpdate = true;
    geo.computeBoundingSphere();
    return geo;
  }
  function voltearTriangulos(geo) {
    var I = geo.index; for (var i = 0; i < I.count; i += 3) { var a = I.getX(i + 1); I.setX(i + 1, I.getX(i + 2)); I.setX(i + 2, a); } I.needsUpdate = true;
  }

  // ======================= Materiales =======================
  // Viento común: los árboles se cimbrean más cuanto más alto (aInst = fase, viento, empuje, alto del modelo).
  var VIENTO_VS =
    'float altM=max(aInst.w,1.0); float hh=clamp(transformed.y/altM,0.0,1.3); hh*=hh;\n' +
    'float vv=(sin(uT*0.7+aInst.x)*0.6+sin(uT*1.9+aInst.x*1.3)*0.3)*aInst.y+sin(uT*6.0+aInst.x)*aInst.z*0.7;\n' +
    'transformed.x+=vv*hh*altM*0.006*uFlex; transformed.z+=vv*hh*altM*0.0035*uFlex;\n';

  // lo que flota (islas de capim, pistia): sube, baja y se ladea con el mapa de ondas en su sitio del río
  var FLOTA_VS =
    '#ifdef USE_INSTANCING\n' +
    'if(uFlota>0.5){ vec3 ip=vec3(instanceMatrix[3]); vec2 su=fract(vec2(-ip.x,ip.z)/' + SIM_TAM.toFixed(1) + '); float e=1.0/' + SIM_N.toFixed(1) + ';\n' +
    '  float h=textureLod(uSimV,su,0.0).r, gx=textureLod(uSimV,su+vec2(e,0.0),0.0).r-textureLod(uSimV,su-vec2(e,0.0),0.0).r, gz=textureLod(uSimV,su+vec2(0.0,e),0.0).r-textureLod(uSimV,su-vec2(0.0,e),0.0).r;\n' +
    '  transformed.y+=clamp(h*0.18,-2.5,2.5)+clamp(gx*transformed.x-gz*transformed.z,-60.0,60.0)*0.004+sin(uT*0.9+aInst.x)*0.6; }\n' +
    '#endif\n';

  // la luz del sol que llega a la hoja (con su sombra), para la translucidez a contraluz
  var LUCES_HOJA = (function () {
    var c = THREE.ShaderChunk.lights_fragment_begin, k = c.indexOf('NUM_DIR_LIGHTS > 0');
    var cola = c.slice(k).replace('RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
      'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight ); luzHoja += directLight.color;');
    return 'vec3 luzHoja = vec3(0.0);\n' + c.slice(0, k) + cola;
  })();

  // Material de un modelo de Blender. tipo por vértice (aMat.x): 0 foto principal, 1 foto segunda, 2 hoja del atlas, 3 color por vértice, 4 foto tercera.
  // modo 0 = corteza (la foto manda, el COLOR_0 normalizado la envejece); modo 1 = madera (la veta de la foto sobre el color pintado).
  function materialModelo(info) {
    var conFoto = !!info.texA;
    var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: info.rugosidad || 0.88, metalness: 0, side: info.dosCaras ? THREE.DoubleSide : THREE.FrontSide, map: info.texA || null });
    if (info.atlas) { m.alphaTest = 0.5; m.alphaToCoverage = true; m.side = THREE.DoubleSide; }
    var u = {
      uTexB: { value: info.texB || info.texA || null }, uTexC: { value: info.texC || info.texA || null },
      uAtlas: { value: info.atlas ? info.atlas.tex : null }, uRects: { value: rectsDe(info.atlas) },
      uMediaVC: { value: info.mediaVC || new THREE.Vector3(0.1, 0.1, 0.1) }, uModo: { value: info.modo || 0 },
      uLumA: { value: info.lumA || 0.25 }, uLumB: { value: info.lumB || 0.25 }, uRealce: { value: info.realce || 1.0 },
      uFlex: { value: info.flex || 0 }, uFlota: { value: info.flota ? 1 : 0 }
    };
    m.onBeforeCompile = function (s) {
      s.uniforms.uT = U.uT; s.uniforms.uSimV = U.uSimV; for (var k in u) s.uniforms[k] = u[k];
      s.vertexShader = 'attribute vec3 aMat; attribute vec4 aInst; varying vec3 vMat; uniform float uT, uFlex, uFlota; uniform sampler2D uSimV;\n' + s.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat=aMat;\n' + VIENTO_VS + FLOTA_VS);
      s.fragmentShader = 'varying vec3 vMat; uniform sampler2D uTexB, uTexC, uAtlas; uniform vec4 uRects[9]; uniform vec3 uMediaVC; uniform float uModo, uLumA, uLumB, uRealce;\n' + s.fragmentShader
        .replace('#include <color_fragment>', '')
        .replace('#include <map_fragment>', conFoto ? [
          'float tipoV=vMat.x; vec3 vc=vColor.rgb; vec3 vcN=clamp(vc/uMediaVC,0.0,3.0); vec3 alb=vc;',
          'if(tipoV<0.5){ vec3 tA=texture2D(map,vMapUv).rgb;',
          '  if(uModo<0.5) alb=tA*mix(vec3(1.0),vcN,0.55);',
          '  else alb=vc*uRealce*mix(1.0,dot(tA,vec3(0.2126,0.7152,0.0722))/uLumA,0.85); }',
          'else if(tipoV<1.5){ vec3 tB=texture2D(uTexB,vMapUv).rgb; alb=vc*uRealce*mix(1.0,dot(tB,vec3(0.2126,0.7152,0.0722))/uLumB,0.9)*vec3(0.95,1.0,1.05); }',
          'else if(tipoV<2.5){ vec4 r=uRects[int(vMat.y+0.5)]; vec4 h=texture2D(uAtlas,mix(r.xy,r.zw,clamp(vMapUv,0.0,1.0))); alb=h.rgb*mix(vec3(1.0),vcN,0.2); diffuseColor.a*=h.a; }',
          'else if(tipoV<3.5){ alb=vc*uRealce; }',
          'else { vec3 tC=texture2D(uTexC,vMapUv).rgb; alb=tC*mix(vec3(1.0),vcN,0.35); }',
          'diffuseColor.rgb*=alb*vMat.z;'].join('\n') : 'diffuseColor.rgb*=vColor.rgb*uRealce*vMat.z;');
    };
    m.customProgramCacheKey = function () { return 'modelo2' + (conFoto ? 1 : 0) + (info.atlas ? 1 : 0); };
    return m;
  }
  function rectsDe(atlas) {
    var r = []; for (var i = 0; i < 9; i++) { var m = atlas && atlas.marcos[i % atlas.marcos.length]; r.push(m ? new THREE.Vector4(m[0], m[1], m[2], m[3]) : new THREE.Vector4(0, 0, 1, 1)); }
    return r;
  }
  // la sombra de un modelo que se mueve con el viento (y, si tiene hojas en tiras, con su silueta)
  function sombraModelo(info) {
    var d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: info.atlas || info.dosCaras ? THREE.DoubleSide : THREE.FrontSide });
    if (info.atlas) { d.map = info.atlas.tex; d.alphaTest = 0.5; }
    var u = { uFlex: { value: info.flex || 0 }, uRects: { value: rectsDe(info.atlas) } };
    d.onBeforeCompile = function (s) {
      s.uniforms.uT = U.uT; for (var k in u) s.uniforms[k] = u[k];
      s.vertexShader = 'attribute vec3 aMat; attribute vec4 aInst; varying vec3 vMat; uniform float uT, uFlex;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMat=aMat;\n' + VIENTO_VS);
      if (info.atlas) s.fragmentShader = 'varying vec3 vMat; uniform vec4 uRects[9];\n' + s.fragmentShader.replace('#include <map_fragment>',
        'if(vMat.x>1.5 && vMat.x<2.5){ vec4 r=uRects[int(vMat.y+0.5)]; diffuseColor.a*=texture2D(map,mix(r.xy,r.zw,clamp(vMapUv,0.0,1.0))).a; }');
    };
    d.customProgramCacheKey = function () { return 'sombraModelo' + (info.atlas ? 1 : 0); };
    return d;
  }

  // Material de las copas: cartas de racimos de hojas fundidas en una geometría, a contraluz, con viento.
  // aHoja = (peso del viento en la carta, fase, tamaño)
  var VIENTO_HOJA_VS = 'float vh=(sin(uT*1.1+aHoja.y+aInst.x)*0.6+sin(uT*2.7+aHoja.y*1.7)*0.3)*aInst.y*0.03*aHoja.z+sin(uT*7.0+aHoja.y*2.0)*aInst.z*0.05*aHoja.z;\n' +
    'transformed.x+=vh*aHoja.x; transformed.z+=vh*0.6*aHoja.x; transformed.y+=vh*0.3*aHoja.x;\n';
  function materialCopa(atlas, flex, trans) {
    var m = new THREE.MeshStandardMaterial({ map: atlas.tex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, vertexColors: true, roughness: 0.72, metalness: 0 });
    var u = { uFlex: { value: flex }, uTrans: { value: trans == null ? 1 : trans } };
    m.onBeforeCompile = function (s) {
      s.uniforms.uT = U.uT; for (var k in u) s.uniforms[k] = u[k];
      s.vertexShader = 'attribute vec3 aHoja; attribute vec4 aInst; uniform float uT, uFlex;\n' + s.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VIENTO_VS + VIENTO_HOJA_VS);
      s.fragmentShader = 'uniform float uTrans;\n' + s.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal=normalize(vNormal); { vec3 vv=normalize(vViewPosition); float dn=dot(normal,vv); if(dn<0.0) normal=normalize(normal-2.0*dn*vv); } vec3 geometryNormalH=normal;')   // la normal «de copa», pero siempre del lado que ves: a contraluz ves la cara en sombra (Pau, 12/11)
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=vec3(0.92,0.95,0.80);')
        .replace('#include <lights_fragment_begin>', LUCES_HOJA)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' +
          '#if NUM_DIR_LIGHTS > 0\n' +
          '  float contra=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),2.0);\n' +
          // mirando hacia el sol, lo que se ve de la copa es su lado en sombra: la luz directa casi no llega (ni el brillo)
          '  float cc=pow(max(dot(normalize(-vViewPosition),directionalLights[0].direction),0.0),1.2);\n' +
          '  reflectedLight.directDiffuse*=1.0-0.8*cc; reflectedLight.directSpecular*=1.0-0.95*cc;\n' +
          '  reflectedLight.directDiffuse+=diffuseColor.rgb*luzHoja*vec3(0.62,0.92,0.30)*(0.05+0.4*contra)*uTrans;\n' +    // la luz que atraviesa la hoja: verde amarillenta, no blanca
          '#endif\n');
    };
    m.customProgramCacheKey = function () { return 'copa'; };
    return m;
  }
  function sombraCopa(atlas, flex) {
    var d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    var u = { uFlex: { value: flex } };
    d.onBeforeCompile = function (s) {
      s.uniforms.uT = U.uT; for (var k in u) s.uniforms[k] = u[k];
      s.vertexShader = 'attribute vec3 aHoja; attribute vec4 aInst; uniform float uT, uFlex;\n' + s.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VIENTO_VS + VIENTO_HOJA_VS);
    };
    d.customProgramCacheKey = function () { return 'sombraCopa'; };
    return d;
  }

  // ---------- una copa: racimos colgados de cada punta de rama, en el sentido en que crece ----------
  function cartaGeo(acc, x, y, z, tam, giro, incl, marco, dentro, atlas, centroC, oc) {
    var m = atlas.marcos[marco % atlas.marcos.length], asp = m[5] / m[4];
    var cy = Math.cos(giro), sy = Math.sin(giro), ct = Math.cos(incl), st = Math.sin(incl);
    var ax = [cy, 0, -sy], up = [sy * st, ct, cy * st];
    var nx = ax[1] * up[2] - ax[2] * up[1], ny = ax[2] * up[0] - ax[0] * up[2], nz = ax[0] * up[1] - ax[1] * up[0];
    var b = acc.pos.length / 3;
    for (var k = 0; k < 4; k++) {
      var qx = k & 1, qy = k >> 1, lx = (qx - 0.5) * tam, ly = (qy - 0.5) * tam * asp;
      var px = x + ax[0] * lx + up[0] * ly, py = y + ax[1] * lx + up[1] * ly, pz = z + ax[2] * lx + up[2] * ly;
      acc.pos.push(px, py, pz);
      // normal doblada hacia fuera de la copa: la luz la envuelve como a un volumen, no como a un naipe
      var ox = px - centroC[0], oy = (py - centroC[1]) * 0.8, oz = pz - centroC[2], ol = Math.hypot(ox, oy, oz) || 1;
      var ex = nx * 0.35 + ox / ol * 0.65, ey = ny * 0.35 + oy / ol * 0.65 + 0.25, ez = nz * 0.35 + oz / ol * 0.65, el = Math.hypot(ex, ey, ez) || 1;
      acc.nor.push(ex / el, ey / el, ez / el);
      acc.uv.push(m[0] + (m[2] - m[0]) * qx, m[1] + (m[3] - m[1]) * (1 - qy));
      acc.hoja.push(qy, dentro * 6.2832, tam);
      acc.col.push(oc, oc, oc * 0.96);
    }
    acc.idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }
  function geoDeCartas(acc) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(acc.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
    g.setAttribute('aHoja', new THREE.Float32BufferAttribute(acc.hoja, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(acc.col, 3));
    g.setIndex(acc.idx);
    return espejar(g);
  }
  function copaDesde(puntas, top, RC, escala, atlas) {
    var acc = { pos: [], nor: [], uv: [], hoja: [], col: [], idx: [] }, rr = semilla(77 + puntas.length), e = escala || 1, N = atlas.marcos.length;
    puntas.forEach(function (t) {
      for (var k = 0; k < 3; k++) {
        var x = t[0] + t[3] * 40 * e * k + (rr() - 0.5) * 90 * e, y = t[1] + t[4] * 40 * e * k + (rr() - 0.4) * 70 * e, z = t[2] + t[5] * 40 * e * k + (rr() - 0.5) * 90 * e;
        var tam = (230 + rr() * 170) * e, giro = Math.atan2(t[3], t[5]) + (rr() - 0.5) * 1.2, incl = (rr() - 0.5) * 0.8, marco = (rr() * N) | 0;
        var dentro = Math.min(1, Math.hypot(x - top[0], z - top[2]) / RC) * 0.92 + 0.05;
        var oc = 0.5 + 0.5 * dentro;            // los racimos de dentro, más a la sombra
        cartaGeo(acc, x, y, z, tam, giro, incl, marco, dentro, atlas, top, oc);
        cartaGeo(acc, x, y, z, tam * 0.85, giro + 1.5708, -incl, (marco + 3) % N, dentro, atlas, top, oc);
      }
    });
    return geoDeCartas(acc);
  }
  function copaHojas(anclas, escala, atlas) {
    var acc = { pos: [], nor: [], uv: [], hoja: [], col: [], idx: [] }, rr = semilla(91 + anclas.length), e = escala || 1, N = atlas.marcos.length;
    var cx = 0, cy = 0, cz = 0; anclas.forEach(function (t) { cx += t[0]; cy += t[1]; cz += t[2]; }); var n = Math.max(1, anclas.length);
    var cc = [cx / n, cy / n * 0.6, cz / n];
    anclas.forEach(function (t) {
      var tam = Math.max(20, t[6] * 2.4) * e, giro = Math.atan2(t[3], t[5]) + (rr() - 0.5) * 0.4, incl = Math.asin(Math.max(-1, Math.min(1, t[4]))) * 0.6, marco = (rr() * N) | 0;
      cartaGeo(acc, t[0], t[1], t[2], tam, giro, incl, marco, 0.5 + rr() * 0.45, atlas, cc, 0.7 + rr() * 0.3);
    });
    return geoDeCartas(acc);
  }

  // ======================= Lotes: muchas copias de un modelo en una sola llamada =======================
  // Cada lote tiene dos mallas instanciadas: «cerca» (proyecta sombra) y «lejos» (no). Cada fotograma se rellenan
  // solo las copias que ve la cámara o su reflejo.
  var LOTES = [];
  function Lote(geo, mat, max, sombra, nombre) {
    this.max = max; this.mallas = []; this.nombre = nombre;
    for (var k = 0; k < 2; k++) {
      var g = new THREE.BufferGeometry();
      for (var a in geo.attributes) g.setAttribute(a, geo.attributes[a]);
      g.setIndex(geo.index);
      var inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); inst.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('aInst', inst);
      var im = new THREE.InstancedMesh(g, mat, max);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.count = 0;
      im.castShadow = k === 0 && !!sombra; im.receiveShadow = true;
      if (sombra && sombra !== true) im.customDepthMaterial = sombra;
      im.userData.inst = inst;
      escena.add(im); this.mallas.push(im);
    }
    this.n = [0, 0];
    LOTES.push(this);
  }
  Lote.prototype.poner = function (m4, cerca, f, v, e, alto) {
    var k = cerca ? 0 : 1, i = this.n[k]; if (i >= this.max) return;
    var im = this.mallas[k]; im.setMatrixAt(i, m4);
    var a = im.userData.inst.array; a[i * 4] = f; a[i * 4 + 1] = v; a[i * 4 + 2] = e; a[i * 4 + 3] = alto;
    this.n[k] = i + 1;
  };
  function empezarLotes() { LOTES.forEach(function (l) { l.n[0] = l.n[1] = 0; }); }
  function terminarLotes() {
    LOTES.forEach(function (l) {
      for (var k = 0; k < 2; k++) { var im = l.mallas[k]; im.count = l.n[k]; if (l.n[k]) { im.instanceMatrix.needsUpdate = true; im.userData.inst.needsUpdate = true; } im.visible = l.n[k] > 0; }
    });
  }

  // ======================= Construir el mundo (cuando todo ha cargado) =======================
  var TIPOS = {
    kapok: { alto: 2300, radio: 1100, viento: 0.35, aves: true, copa: true },
    camalotes: { alto: 70, viento: 0.25 },
    niebla: { alto: 340 }
  };
  var MODELOS = {}, FAMILIAS = {}, KAPOK = null, DELFIN = null, CANOA = null, REMO = null, CRIATURAS = {};
  function familia(nombre) {   // la familia más larga que encaja ('juncos-agua-2' es de 'juncos-agua', no de 'juncos')
    var k = Object.keys(VJ.REGLAS).filter(function (f) { return nombre.indexOf(f) === 0; }).sort(function (a, b) { return b.length - a.length; }); return k.length ? k[0] : null; }

  // componentes conexos (para separar las tiras de hoja de las palmeras de su tronco)
  function componentes(geo) {
    var n = geo.attributes.position.count, par = new Int32Array(n), I = geo.index, i;
    for (i = 0; i < n; i++) par[i] = i;
    function raiz(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    for (i = 0; i < I.count; i += 3) { var a = raiz(I.getX(i)), b = raiz(I.getX(i + 1)), c = raiz(I.getX(i + 2)); par[b] = a; par[c] = a; }
    var r = new Int32Array(n), cuenta = {};
    for (i = 0; i < n; i++) { r[i] = raiz(i); cuenta[r[i]] = (cuenta[r[i]] || 0) + 1; }
    return { raiz: r, cuenta: cuenta };
  }
  function lumTex(nombre) { return { 'barro-orilla': 0.16, 'chapa-oxidada': 0.2, 'corteza-kapok': 0.3, 'corteza-selva': 0.17, 'hojarasca': 0.08, 'madera-pintada': 0.3, 'madera-vieja': 0.2, 'tronco-palmera': 0.17 }[nombre] || 0.2; }
  function medirLumTex(nombre) {   // la luminancia media real de la foto (lineal), para que la veta no oscurezca ni aclare
    var t = FOTO[nombre]; if (!t || !t.image) return lumTex(nombre);
    try {
      var c = document.createElement('canvas'); c.width = c.height = 32; var x = c.getContext('2d'); x.drawImage(t.image, 0, 0, 32, 32);
      var d = x.getImageData(0, 0, 32, 32).data, s = 0;
      for (var i = 0; i < d.length; i += 4) s += 0.2126 * srgbALineal(d[i] / 255) + 0.7152 * srgbALineal(d[i + 1] / 255) + 0.0722 * srgbALineal(d[i + 2] / 255);
      return s / (d.length / 4);
    } catch (e) { return lumTex(nombre); }
  }

  function prepararModelo(c) {
    var g = GLTF[c.nombre]; if (!g) return;
    var geo = geometriaDe(g)[0].geo, nombre = c.nombre;
    if (!geo.index) { var ix = new Uint32Array(geo.attributes.position.count); for (var q = 0; q < ix.length; q++) ix[q] = q; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.color) { var cc = new Float32Array(geo.attributes.position.count * 3).fill(0.12); geo.setAttribute('color', new THREE.BufferAttribute(cc, 3)); }
    geo.computeBoundingBox();
    var bb = geo.boundingBox, alto = bb.max.y, radio = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
    var fam = familia(nombre), regla = fam ? VJ.REGLAS[fam] : {};
    var P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color, n = P.count;
    var esArbol = /^(arbol|igapo|liana|raices|tronco-caido)/.test(nombre), esPalmera = /^palmera/.test(nombre);
    var esAcuatica = /^(capim-flotante|juncos-agua|aninga|pistia)/.test(nombre), esEnser = /^canoa-(mochila|cuerda|farol|platanos|machete|red|garrafa)/.test(nombre);
    var esObjeto = c.carpeta === 'obj' && !/^victoria/.test(nombre) && !esAcuatica && !esEnser;   // (las plantas y los enseres: su color, sin maderas)
    var aMat = new Float32Array(n * 3), suma = [0, 0, 0], cuantos = 0;
    var comp = esPalmera ? componentes(geo) : null, rr = semilla(hash(n, 5));
    var marcoDe = {};
    for (var i = 0; i < n; i++) {
      var r = C.getX(i), gg = C.getY(i), b = C.getZ(i), y = P.getY(i), tipo = 3, marco = 0, ao = 1;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), verde = gg > r * 1.05 && gg > b;
      if (esArbol || (esPalmera && !verde)) tipo = 0;
      if (esPalmera) {
        var cu = comp.cuenta[comp.raiz[i]];
        if (cu <= 12 && verde) { tipo = 2; var rz = comp.raiz[i]; if (marcoDe[rz] == null) marcoDe[rz] = (rr() * 6) | 0; marco = marcoDe[rz]; }
        else if (verde) tipo = 3; else tipo = 0;
      }
      if (esObjeto) {
        var gris = mx - mn < mx * 0.12, pintado = !gris && (gg > r * 1.04 || b > r * 0.92);
        tipo = pintado ? 1 : 0;
        if (gris && N.getY(i) > 0.35 && y > alto * 0.5) tipo = 4;           // los tejados de chapa
      }
      if (esArbol) ao = 0.62 + 0.38 * suave(y / Math.max(1, alto * 0.55));     // el pie del tronco, a la sombra de la selva
      aMat[i * 3] = tipo; aMat[i * 3 + 1] = marco; aMat[i * 3 + 2] = ao;
      if (tipo === 0 || tipo === 4) { suma[0] += r; suma[1] += gg; suma[2] += b; cuantos++; }
    }
    geo.setAttribute('aMat', new THREE.BufferAttribute(aMat, 3));
    var media = cuantos ? new THREE.Vector3(Math.max(0.01, suma[0] / cuantos), Math.max(0.01, suma[1] / cuantos), Math.max(0.01, suma[2] / cuantos)) : new THREE.Vector3(0.1, 0.1, 0.1);
    espejar(geo);
    var texA = null, texB = null, texC = null, modo = 0, atlas = null, flex = 0;
    if (TIENE_TEX) {
      if (esArbol) texA = FOTO['corteza-selva'];
      else if (esPalmera) texA = FOTO['tronco-palmera'];
      else if (esObjeto) { texA = FOTO['madera-vieja']; texB = FOTO['madera-pintada']; texC = FOTO['chapa-oxidada']; modo = 1; }
    }
    if (esPalmera && ATLAS['hoja-palma']) atlas = ATLAS['hoja-palma'];
    if (!atlas && esPalmera) for (i = 0; i < n; i++) if (aMat[i * 3] === 2) aMat[i * 3] = 3;
    flex = esPalmera ? 2.2 : /^arbol|^igapo|^liana/.test(nombre) ? 0.7 : /^juncos-agua/.test(nombre) ? 1.3 : /^aninga/.test(nombre) ? 0.9 : /^capim/.test(nombre) ? 0.8 : /^pistia/.test(nombre) ? 0.25 : /^sotobosque|^juncos/.test(nombre) ? 1.6 : 0;
    var flota = /^(capim-flotante|pistia)/.test(nombre);
    var info = { texA: texA, texB: texB, texC: texC, modo: modo, atlas: atlas, mediaVC: media, dosCaras: c.dosCaras || esAcuatica || /^(barco|rabeta|canoa-atada|gasolinera|puesto|casa-flotante)/.test(nombre),   // (12/11) los barcos, por las dos caras: a un costado le faltaba la popa flex: flex, flota: flota,
      lumA: texA ? medirLumTex(esObjeto ? 'madera-vieja' : esArbol ? 'corteza-selva' : 'tronco-palmera') : 0.2, lumB: texB ? medirLumTex('madera-pintada') : 0.2,
      realce: esObjeto ? 1.25 : 1.0, rugosidad: esObjeto ? 0.8 : 0.9 };
    var mat = materialModelo(info);
    var maxi = /^sotobosque/.test(nombre) ? 220 : /^juncos|^victoria|^capim|^pistia|^aninga/.test(nombre) ? 160 : esEnser ? 2 : 90;
    var mod = { nombre: nombre, alto: alto, radio: radio, familia: fam, flex: flex };
    mod.lote = new Lote(geo, mat, maxi, (esArbol || esPalmera || esObjeto || esAcuatica || /^sotobosque/.test(nombre)) ? sombraModelo(info) : false, nombre);
    mod.mat = mat; mod.geo = geo;
    var pts = window.AMZ_PUNTAS_DE && AMZ_PUNTAS_DE[nombre];
    if (pts && pts.length) {
      var at = atlasPara(nombre);
      if (at) {
        var gc;
        if (c.puntasHoja) gc = copaHojas(pts, regla.hojas || 1, at);
        else { var sy = 0; pts.forEach(function (t) { sy += t[1]; }); gc = copaDesde(pts, [0, sy / pts.length, 0], radio, (regla.hojas || 0.8) * 0.75, at); }
        mod.copa = new Lote(gc, materialCopa(at, flex, /^sotobosque/.test(nombre) ? 0.6 : 1), maxi, sombraCopa(at, flex), nombre + ':copa');
      }
    }
    MODELOS[nombre] = mod;
    if (fam) (FAMILIAS[fam] = FAMILIAS[fam] || []).push(nombre);
    TIPOS[nombre] = { alto: alto, radio: radio, viento: c.viento || 0.4, aves: !!mod.copa && alto > 600, modelo: nombre, familia: fam, copa: !!mod.copa || esPalmera,
      tocable: esObjeto || /^victoria-flor/.test(nombre), lejos: esObjeto ? 7000 : 5000, flota: flota };
  }

  // (Pau, 12/11) la vida al pie de la samaúma: en cada hueco entre dos sapopemas, helechos, heliconias u hojas gigantes,
  // y lianas colgando del tronco. Van como piezas fijas (se tocan, se agitan y dan sombra como las demás)
  function vidaSamauma() {
    if (!KAPOK || !KAPOK.huecos) return;
    var S = null; VJ.FIJOS.forEach(function (f) { if (f.samauma) S = f; }); if (!S) return;
    var e = S.esc || 1, ry = S.rotY || 0, c = Math.cos(ry), s = Math.sin(ry), r = semilla(hash(7741, 3));
    function mundo(lx, lz) { var xr = lx * c - lz * s, zr = lx * s + lz * c; return [S.x - e * xr, S.z + e * zr]; }
    var plantas = ['sotobosque-heliconias-1', 'sotobosque-helechos-1', 'sotobosque-hojas-gigantes-1', 'sotobosque-helechos-2', 'sotobosque-hojas-gigantes-2']
      .filter(function (n) { return TIPOS[n]; });
    var lianas = ['liana-cortina-1', 'liana-cortina-2'].filter(function (n) { return TIPOS[n]; });
    if (!plantas.length) return;
    KAPOK.huecos.forEach(function (h, i) {
      var nn = 1 + (r() < 0.6 ? 1 : 0);
      for (var j = 0; j < nn; j++) {
        var rr = h.r + (h.fuera - h.r) * (0.3 + r() * 0.45), a = h.ang + (r() - 0.5) * 0.12;
        var w = mundo(h.cx + Math.cos(a) * rr, h.cz + Math.sin(a) * rr);
        VJ.FIJOS.push({ tipo: plantas[(i * 2 + j + (r() * 2 | 0)) % plantas.length], x: w[0], z: w[1], esc: 1.0 + r() * 0.5, rotY: r() * 6.283, suelo: true, alSamauma: true });
      }
      if (lianas.length && i % 2 === 0) {
        var wl = mundo(h.cx + Math.cos(h.ang) * h.r * 0.95, h.cz + Math.sin(h.ang) * h.r * 0.95);
        VJ.FIJOS.push({ tipo: lianas[i / 2 % lianas.length | 0], x: wl[0], z: wl[1], esc: 1.2 + r() * 0.3, rotY: ry - h.ang + Math.PI / 2, suelo: true, alSamauma: true });
      }
    });
  }

  // el kapok (Meshy): tronco y raíces en 3D, 1250 u hasta las primeras ramas; ramas de Blender; la copa, racimos en 3D
  function prepararKapok() {
    var g = GLTF.kapok; if (!g) return;
    var l = geometriaDe(g)[0], geo = l.geo;
    geo.computeBoundingBox(); var c = geo.boundingBox, alto = c.max.y - c.min.y, esc = 1250 / alto, cx = (c.max.x + c.min.x) / 2, cz = (c.max.z + c.min.z) / 2;
    var P = geo.attributes.position, sx = 0, sz = 0, n = 0;
    for (var i = 0; i < P.count; i++) {
      var x = (P.getX(i) - cx) * esc, y = (P.getY(i) - c.min.y) * esc - 30, z = (P.getZ(i) - cz) * esc; P.setXYZ(i, x, y, z);
      if (y > 1250 * 0.88) { sx += x; sz += z; n++; }
    }
    var top = [sx / Math.max(1, n), 1250 * 0.9, sz / Math.max(1, n)];
    espejar(geo);
    // los huecos entre las sapopemas (las raíces tabla), a ras de suelo: ahí crece la vida (helechos, heliconias, hojas)
    var tx = 0, tz = 0, tn = 0, NB = 60, rad = new Float32Array(NB);
    for (i = 0; i < P.count; i++) { var yy = P.getY(i); if (yy > 300 && yy < 420) { tx += P.getX(i); tz += P.getZ(i); tn++; } }
    tx /= Math.max(1, tn); tz /= Math.max(1, tn);
    for (i = 0; i < P.count; i++) {
      yy = P.getY(i); if (yy < 5 || yy > 45) continue;
      var dx = P.getX(i) - tx, dz = P.getZ(i) - tz, b = Math.floor((Math.atan2(dz, dx) + Math.PI) / 6.2832 * NB) % NB, rr = Math.hypot(dx, dz);
      if (rr > rad[b]) rad[b] = rr;
    }
    var huecosK = [];
    for (b = 0; b < NB; b++) {
      var r0 = rad[b], esMin = true, vec = 0;
      for (var o = -3; o <= 3; o++) { var rv = rad[(b + o + NB) % NB]; if (o && rv < r0) esMin = false; if (Math.abs(o) >= 2) vec = Math.max(vec, rv); }
      if (esMin && vec > r0 * 1.25) { var ang = (b + 0.5) / NB * 6.2832 - Math.PI; huecosK.push({ ang: ang, r: r0, fuera: vec, cx: tx, cz: tz }); }
    }
    var mat = l.mat.clone(); mat.envMapIntensity = 1; mat.side = THREE.FrontSide;
    KAPOK = { top: top, radio: 1100, huecos: huecosK };
    // (Pau, 12/11: «el árbol del final, mucho más detallado: de cerca se pierde el detalle») sobre la textura de Meshy,
    // corteza de verdad a tamaño real (triplanar, dos escalas) con relieve que coge la luz; musgo en lo que mira arriba
    // y en las grietas; líquenes claros; y la marca oscura y mojada a ras del agua
    var uK = { uCorteza: { value: FOTO['corteza-kapok'] || FOTO['corteza-selva'] || null }, uLumK: { value: medirLumTex('corteza-kapok') } };
    mat.onBeforeCompile = function (s) {
      for (var k in uK) s.uniforms[k] = uK[k];
      s.vertexShader = 'attribute vec4 aInst; varying vec3 vWK, vNK;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
        '{ vec4 wk=vec4(transformed,1.0); vec3 nk=objectNormal;\n#ifdef USE_INSTANCING\n wk=instanceMatrix*wk; nk=mat3(instanceMatrix)*nk;\n#endif\n wk=modelMatrix*wk; vWK=wk.xyz; vNK=normalize(mat3(modelMatrix)*nk); }\n');
      s.fragmentShader = 'uniform sampler2D uCorteza; uniform float uLumK; varying vec3 vWK, vNK;\n' +
        'float hK(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
        'float rK(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hK(i),hK(i+vec2(1,0)),f.x),mix(hK(i+vec2(0,1)),hK(i+vec2(1,1)),f.x),f.y); }\n' +
        'vec3 tri(vec3 w, vec3 b, float esc){ return texture2D(uCorteza,w.zy/esc).rgb*b.x+texture2D(uCorteza,w.xz/esc).rgb*b.y+texture2D(uCorteza,w.xy/esc).rgb*b.z; }\n' +
        'float alturaK;\n' + s.fragmentShader
        .replace('#include <map_fragment>', '#include <map_fragment>\n' +
          '{ vec3 b=pow(abs(vNK),vec3(4.0)); b/=dot(b,vec3(1.0));\n' +
          '  vec3 c1=tri(vWK,b,130.0), c2=tri(vWK+17.0,b,43.0); vec3 cc=c1*0.55+c2*0.45; float l1=dot(c1,vec3(0.2126,0.7152,0.0722)), l2=dot(c2,vec3(0.2126,0.7152,0.0722));\n' +
          '  alturaK=l1*0.5+l2*0.5;\n' +
          '  vec3 rat=clamp(cc/max(uLumK,0.05), vec3(0.62), vec3(1.32));\n' +              // la foto de la corteza (gris, líquenes y musgo de verdad), a su tamaño real
          '  diffuseColor.rgb*=mix(vec3(1.0), rat, 0.72);\n' +
          '  mat2 rm=mat2(0.8,-0.6,0.6,0.8); vec2 pm=vec2(vWK.x+vWK.z*0.7, vWK.y*0.9+vWK.x*0.3)/95.0;\n' +   // musgo: más en lo que mira arriba y en las grietas
          '  float n=rK(pm)*0.5+rK(rm*pm*2.2+5.3)*0.32+rK(rm*rm*pm*5.1+1.7)*0.18;\n' +
          '  float musgo=smoothstep(0.3,0.8,vNK.y)*smoothstep(0.42,0.68,n)+smoothstep(0.8,0.3,alturaK/max(uLumK,0.05))*0.3*smoothstep(0.45,0.65,n);\n' +
          '  musgo*=smoothstep(30.0,140.0,vWK.y);\n' +
          '  diffuseColor.rgb=mix(diffuseColor.rgb, vec3(0.06,0.09,0.028)*(0.75+0.5*n), clamp(musgo,0.0,1.0)*0.6);\n' +
          '  float mojado=1.0-smoothstep(8.0,75.0,vWK.y+8.0*sin(vWK.x*0.01+vWK.z*0.013));\n' +
          '  diffuseColor.rgb*=1.0-0.4*mojado; }\n')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor*=1.0-0.55*(1.0-smoothstep(8.0,75.0,vWK.y));\n')
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' +
          '{ vec3 dpx=dFdx(-vViewPosition), dpy=dFdy(-vViewPosition); float dhx=dFdx(alturaK), dhy=dFdy(alturaK);\n' +      // relieve de la corteza
          '  vec3 r1=cross(dpy,normal), r2=cross(normal,dpx); float det=dot(dpx,r1); vec3 g=sign(det)*(dhx*r1+dhy*r2);\n' +
          '  normal=normalize(abs(det)*normal-g*2.2); }\n');
    };
    mat.customProgramCacheKey = function () { return 'kapok-detalle'; };
    KAPOK.tronco = new Lote(geo, mat, 12, true, 'kapok');
    // ramas (sin coordenadas de textura): se las damos por proyección triplanar en la carga
    if (GLTF['kapok-ramas']) {
      var gr = geometriaDe(GLTF['kapok-ramas'])[0].geo, Pr = gr.attributes.position, Nr = gr.attributes.normal;
      if (!Nr) { gr.computeVertexNormals(); Nr = gr.attributes.normal; }
      var uv = new Float32Array(Pr.count * 2), col = new Float32Array(Pr.count * 3), am = new Float32Array(Pr.count * 3);
      for (i = 0; i < Pr.count; i++) {
        var ax = Math.abs(Nr.getX(i)), ay = Math.abs(Nr.getY(i)), az = Math.abs(Nr.getZ(i));
        var u = ax > ay && ax > az ? [Pr.getZ(i), Pr.getY(i)] : ay > az ? [Pr.getX(i), Pr.getZ(i)] : [Pr.getX(i), Pr.getY(i)];
        uv[i * 2] = u[0] / 140; uv[i * 2 + 1] = u[1] / 140; col[i * 3] = 0.16; col[i * 3 + 1] = 0.15; col[i * 3 + 2] = 0.13; am[i * 3 + 2] = 1;
      }
      gr.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); gr.setAttribute('color', new THREE.BufferAttribute(col, 3)); gr.setAttribute('aMat', new THREE.BufferAttribute(am, 3));
      espejar(gr);
      var info = { texA: FOTO['corteza-kapok'] || FOTO['corteza-selva'] || null, modo: 0, mediaVC: new THREE.Vector3(0.16, 0.15, 0.13), lumA: 0.3 };
      KAPOK.ramas = new Lote(gr, materialModelo(info), 12, true, 'kapok-ramas');
    }
    var at = ATLAS['hojas-selva'];
    if (at && window.AMZ_PUNTAS) KAPOK.copa = new Lote(copaDesde(AMZ_PUNTAS, top, 1100, 1, at), materialCopa(at, 0.5, 1), 12, sombraCopa(at, 0.5), 'kapok:copa');
  }

  // el delfín: el cuerpo a lo largo de x (cabeza hacia +x), y arriba, 100 unidades de largo (≈ 2,4 m); su cuerpo sigue un arco
  function prepararDelfin() {
    var g = GLTF.delfin; if (!g) return;
    var l = geometriaDe(g)[0], geo = l.geo, P = geo.attributes.position, N = geo.attributes.normal;
    geo.computeBoundingBox(); var c = geo.boundingBox, mn = [c.min.x, c.min.y, c.min.z], mx = [c.max.x, c.max.y, c.max.z];
    var ext = [0, 1, 2].map(function (k) { return mx[k] - mn[k]; });
    var largo = ext[0] >= ext[2] ? 0 : 2, cen = [0, 1, 2].map(function (k) { return (mx[k] + mn[k]) / 2; });
    var L = ext[largo], rA = 0, rB = 0, i;
    var get = function (i, k) { return k === 0 ? P.getX(i) : k === 1 ? P.getY(i) : P.getZ(i); };
    for (i = 0; i < P.count; i++) { var t = (get(i, largo) - mn[largo]) / L, r = Math.abs(P.getY(i) - cen[1]); if (t > 0.97) rB = Math.max(rB, r); if (t < 0.03) rA = Math.max(rA, r); }
    var sg = rB < rA ? 1 : -1, esc = 100 / L;     // la cabeza es el extremo más fino (el pico)
    for (i = 0; i < P.count; i++) {
      var x = P.getX(i) - cen[0], y = P.getY(i) - cen[1], z = P.getZ(i) - cen[2], X, Z;
      if (largo === 0) { X = sg * x; Z = sg * z; } else { X = sg * z; Z = -sg * x; }
      P.setXYZ(i, X * esc, y * esc, Z * esc);
      if (N) { var nx = N.getX(i), nz = N.getZ(i); if (largo === 0) N.setXYZ(i, sg * nx, N.getY(i), sg * nz); else N.setXYZ(i, sg * nz, N.getY(i), -sg * nx); }
    }
    if (!geo.index) { var ix = new Uint32Array(P.count); for (i = 0; i < ix.length; i++) ix[i] = i; geo.setIndex(new THREE.BufferAttribute(ix, 1)); }
    voltearTriangulos(geo);     // el sombreador lo lleva a X = −x: los triángulos, del derecho
    var mat = l.mat.clone(); mat.side = THREE.DoubleSide; mat.roughness = 0.2; mat.envMapIntensity = 1.5;
    if (mat.color) mat.color.multiply(new THREE.Color(0.92, 0.84, 0.88));     // (12/11) rosa grisáceo, piel mojada
    var uA = { uArco: { value: new THREE.Vector4(150, 0, 0, 100) }, uArcoC: { value: new THREE.Vector3() }, uArcoDir: { value: new THREE.Vector2(1, 0) } };
    var ARCO = 'uniform vec4 uArco; uniform vec3 uArcoC; uniform vec2 uArcoDir;\n';
    var CUERPO = [
      'vec3 objectNormal; vec3 transformed;',
      '{ vec3 p=position, n=normal; float L=uArco.w, R=uArco.x, s=p.x;',
      '  float cola=clamp(-s/(L*0.5),0.0,1.0); p.y+=sin(uArco.z-s*0.09)*cola*cola*L*0.055;',     // la aleta caudal bate arriba y abajo
      '  float ph=uArco.y+s/R; vec3 d3=vec3(uArcoDir.x,0.0,uArcoDir.y), up=vec3(0.0,1.0,0.0), lado=vec3(d3.z,0.0,-d3.x);',
      '  vec3 Nr=sin(ph)*d3+cos(ph)*up, T=cos(ph)*d3-sin(ph)*up;',
      '  vec3 w=uArcoC+(R+p.y)*Nr+p.z*lado; vec3 nn=normalize(n.x*T+n.y*Nr+n.z*lado);',
      '  transformed=vec3(-w.x,w.y,w.z); objectNormal=vec3(-nn.x,nn.y,nn.z); }'].join('\n');
    var inyectar = function (s, conNormal) {
      for (var k in uA) s.uniforms[k] = uA[k];
      s.vertexShader = ARCO + s.vertexShader.replace('#include <beginnormal_vertex>', conNormal ? CUERPO : '').replace('#include <begin_vertex>', conNormal ? '' : CUERPO);
    };
    mat.onBeforeCompile = function (s) { inyectar(s, true); };
    var dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }); dm.onBeforeCompile = function (s) { inyectar(s, false); };
    var malla = new THREE.Mesh(geo, mat); malla.frustumCulled = false; malla.castShadow = true; malla.customDepthMaterial = dm; malla.visible = false;
    escena.add(malla);
    DELFIN = { malla: malla, u: uA, info: { largo: largo, sg: sg, ext: ext } };
  }

  // ======================= Los pájaros en vuelo, en 3D (herramientas/blender/aves_vuelo.py) =======================
  // (Pau, 12/11: «se nota que son 4 fotogramas») el ala se dobla por el hombro y por la muñeca, la muñeca llega tarde,
  // al subir la mano se recoge hacia atrás y el cuerpo sube y baja al revés que las alas; a ratos planean.
  var VUELO = {}, _qAve = new THREE.Quaternion(), _eAve = new THREE.Euler(0, 0, 0, 'YXZ');
  function prepararVuelo() {
    var info = window.AMZ_AVES || {};
    ['garza', 'loro', 'guacamayo'].forEach(function (esp) {
      var g = GLTF['ave-' + esp], P = info['ave-' + esp]; if (!g || !P) return;
      var geo = geometriaDe(g)[0].geo, MAX = 48;
      var aAve = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); aAve.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aAve', aAve);
      var mat = new THREE.MeshStandardMaterial({ vertexColors: !!geo.attributes.color, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
      var u = { uHombro: { value: P.hombro }, uSemi: { value: P.semi }, uAltoH: { value: P.altoHombro }, uMuneca: { value: P.muneca } };
      mat.onBeforeCompile = function (sh) {
        for (var k in u) sh.uniforms[k] = u[k];
        sh.vertexShader = 'attribute vec4 aAve; uniform float uHombro, uSemi, uAltoH, uMuneca;\n' +
          'mat2 r2(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }\n' +
          'void aletear(inout vec3 p, inout vec3 n){\n' +
          '  float fa=aAve.x, amp=aAve.y, pl=aAve.z;\n' +
          '  float th1=mix(sin(fa)*amp+0.1, 0.08, pl);\n' +                     // el hombro
          '  float th2=mix(sin(fa-0.8)*amp*0.65-0.06, -0.05, pl);\n' +           // la muñeca, que llega tarde
          '  float plega=(1.0-pl)*max(0.0,cos(fa+0.5))*0.6;\n' +                 // al subir, la mano se recoge
          '  p.y-=sin(fa)*amp*(1.0-pl)*uSemi*0.03;\n' +                          // el cuerpo, al revés que las alas
          '  float ax=abs(p.x), sd=p.x<0.0?-1.0:1.0;\n' +
          '  if(ax>uHombro){ float L=uSemi-uHombro, s=(ax-uHombro)/L, w2=smoothstep(uMuneca-0.12,uMuneca+0.1,s), xm=L*uMuneca;\n' +
          '    vec2 q=vec2(ax-uHombro,p.y-uAltoH);\n' +
          '    vec2 qe=r2(th2*w2)*(q-vec2(xm,0.0)); q=vec2(xm,0.0)+qe;\n' +
          '    q=r2(th1)*q; float atras=plega*w2*max(0.0,s-uMuneca)/(1.0-uMuneca)*L*0.5;\n' +
          '    p.x=sd*(uHombro+q.x); p.y=uAltoH+q.y; p.z-=atras;\n' +
          '    vec2 nn=r2(th1+th2*w2)*vec2(n.x*sd,n.y); n.x=nn.x*sd; n.y=nn.y; }\n' +
          '}\n' + sh.vertexShader
            .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 pAve=position; vec3 nAve=objectNormal; aletear(pAve,nAve); objectNormal=nAve;')
            .replace('#include <begin_vertex>', 'vec3 transformed = pAve;');
      };
      var m = new THREE.InstancedMesh(geo, mat, MAX); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0; m.frustumCulled = false;
      escena.add(m);
      VUELO[esp] = { malla: m, attr: aAve, P: P, max: MAX, n: 0 };
    });
  }
  function ponerAves() {
    for (var k in VUELO) VUELO[k].n = 0;
    for (var i = 0; i < aves.length; i++) {
      var av = aves[i]; if (av.retraso > 0) continue;
      var V = VUELO[av.tipo]; if (!V || V.n >= V.max) continue;
      if (Math.hypot(av.x - camX, av.z - camZ) > 30000) continue;
      var planeo = av.crucero ? 0 : Math.max(0, Math.sin(av.fase * 0.11)), vh = Math.hypot(av.vx, av.vz) || 1;
      _eAve.set(-Math.atan2(av.vy, vh) * 0.7, Math.atan2(-av.vx, av.vz), Math.sin(av.fase * 0.13 + i) * (0.06 + 0.12 * planeo), 'YXZ');
      _qAve.setFromEuler(_eAve);
      var e = Math.min(1, av.vida * 2);
      _m4.compose(_pos.set(-av.x, av.y, av.z), _qAve, _esc.set(e, e, e));
      V.malla.setMatrixAt(V.n, _m4);
      V.attr.setXYZW(V.n, av.fase, V.P.amplitud, planeo, 0);
      V.n++;
    }
    for (k in VUELO) { var W2 = VUELO[k]; W2.malla.count = W2.n; W2.malla.instanceMatrix.needsUpdate = true; W2.attr.needsUpdate = true; }
  }

  // la canoa propia y el remo: modelos de Blender sueltos (no instanciados)
  // Todo lo que va en la canoa está en sus coordenadas locales (proa hacia −Z). Como el mundo de Three está reflejado
  // en X, una matriz local M se usa como S·M·S (S = escala −1 en X): basta con cambiar el signo de x y de los giros en Y y Z.
  var CASCO = new Float32Array(27), FAROL = null, LORO = null, REMO_REPOSO = new THREE.Matrix4(), ENSERES = [], golpeCasco = null;
  function localCanoa(m, x, y, z, ry, rx, rz, e) { _pos.set(-x, y, z); _eu.set(rx || 0, -(ry || 0), -(rz || 0), 'YXZ'); _q4.setFromEuler(_eu); _esc.set(e || 1, e || 1, e || 1); return m.compose(_pos, _q4, _esc); }
  var S_X = new THREE.Matrix4().makeScale(-1, 1, 1);
  function prepararCanoa() {
    if (MODELOS['canoa-propia']) {
      var mc = MODELOS['canoa-propia'];
      CANOA = new THREE.Mesh(mc.geo, mc.mat); CANOA.castShadow = CANOA.receiveShadow = true; CANOA.matrixAutoUpdate = false; CANOA.frustumCulled = false; escena.add(CANOA);
      // el perfil interior del casco a la altura del agua (para que el agua no se vea dentro): cada 10 u de −130 a +130
      var P = mc.geo.attributes.position, k, i;
      for (k = 0; k < 27; k++) {
        var zk = -130 + k * 10, fuera = 0, suelo = -99;
        for (i = 0; i < P.count; i++) {
          var x = Math.abs(P.getX(i)), y = P.getY(i), z = P.getZ(i); if (Math.abs(z - zk) > 5) continue;
          if (y > 0 && y < 6 && x > fuera) fuera = x;
          if (x < 3 && y < 8 && y > suelo) suelo = y;
        }
        CASCO[k] = suelo < 4 ? Math.max(0, fuera - 1.2) : 0;
      }
      uAgua.uCasco.value = CASCO;
      // los enseres: mochilas, cuerda, farol, plátanos, machete, red y garrafa, que se mecen con la canoa
      var OB0 = window.AMZ_CANOA_OBJETOS || {}, OB = OB0.objetos || OB0;
      Object.keys(OB).forEach(function (n) {
        var md = MODELOS[n], o = OB[n]; if (!md || !o.matriz) return;
        var me = new THREE.Mesh(md.geo, md.mat); me.castShadow = me.receiveShadow = true; me.matrixAutoUpdate = false; me.frustumCulled = false;
        me.matrix.fromArray(o.matriz).premultiply(S_X).multiply(S_X);
        CANOA.add(me);
        // cada enser guarda su sitio y su base (para menearse alrededor de donde se apoya)
        md.geo.computeBoundingBox(); var bb = md.geo.boundingBox;
        me.userData = { nombre: n, base: me.matrix.clone(), pie: new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2), alto: bb.max.y - bb.min.y, anim: null };
        ENSERES.push(me);
        if (o.llama) FAROL = { local: o.llama.en_canoa };
      });
      if (!FAROL && OB['canoa-farol']) FAROL = { local: [OB['canoa-farol'].posicion[0], OB['canoa-farol'].posicion[1] + 5.34, OB['canoa-farol'].posicion[2]] };
      if (FAROL) {
        var lc = document.createElement('canvas'); lc.width = lc.height = 64; var cx = lc.getContext('2d'), gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.18, 'rgba(255,170,80,0.55)'); gr.addColorStop(0.5, 'rgba(255,120,40,0.12)'); gr.addColorStop(1, 'rgba(255,100,30,0)');
        cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
        var tx = new THREE.CanvasTexture(lc); tx.colorSpace = THREE.SRGBColorSpace;
        FAROL.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
        FAROL.halo.position.set(-FAROL.local[0], FAROL.local[1], FAROL.local[2]); FAROL.halo.scale.set(26, 26, 1); FAROL.halo.visible = false; CANOA.add(FAROL.halo);
        FAROL.llama = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.2, 1.1), fog: false }));
        FAROL.llama.scale.set(1, 1.7, 1); FAROL.llama.position.copy(FAROL.halo.position); FAROL.llama.visible = false; CANOA.add(FAROL.llama);
      }
      prepararLoro(mc.geo);
    }
    if (MODELOS.remo) { REMO = new THREE.Mesh(MODELOS.remo.geo, MODELOS.remo.mat); REMO.castShadow = REMO.receiveShadow = true; REMO.matrixAutoUpdate = false; REMO.frustumCulled = false; escena.add(REMO); }
    // en reposo: a lo largo de la canoa, sobre los bancos (y ≈ 12,5), a estribor (x ≈ +9), la pala hacia proa
    localCanoa(REMO_REPOSO, 10, 11.8, 45, 0, Math.PI / 2, 0, 1);
  }

  // el farol de la canoa: del atardecer a la noche, una llama cálida que tiembla (luz puntual, halo y llama)
  function encenderFarol() {
    var A = AMBIENTE; if (!A || !FAROL || !CANOA) { farol.intensity = 0; return; }
    var wAt = (A.a.id === 'atardecer' ? 1 - A.t : 0) + (A.b.id === 'atardecer' ? A.t : 0);
    var auto = Math.max(suave((A.noche - 0.05) / 0.4), wAt * 0.22);
    // a mano (tocándolo): encendido del todo o apagado; al encenderse, la mecha chisporrotea un momento
    var obj = FAROL.manual == null ? auto : FAROL.manual ? 1 : 0;
    FAROL.nivel = FAROL.nivel == null ? obj : FAROL.nivel + (obj - FAROL.nivel) * Math.min(1, (1 / 60) * (obj > FAROL.nivel ? 5 : 9));
    var nivel = FAROL.nivel;
    if (FAROL.chispa && tiempo - FAROL.chispa < 0.5 && obj > 0.5) nivel *= 0.55 + 0.45 * Math.abs(Math.sin(tiempo * 47));
    var tb = tiempo, temblor = 1 + 0.07 * Math.sin(tb * 11.3) + 0.05 * Math.sin(tb * 23.1 + 1.3) + 0.035 * Math.sin(tb * 41.7 + 0.4);
    _v.set(-FAROL.local[0], FAROL.local[1], FAROL.local[2]).applyMatrix4(CANOA.matrix);
    farol.position.copy(_v); farol.intensity = 3800 * nivel * temblor;
    FAROL.halo.visible = FAROL.llama.visible = nivel > 0.01;
    FAROL.halo.material.opacity = Math.min(1, nivel * 1.1) * (0.85 + 0.15 * temblor);
    var sh = 26 * (0.92 + 0.08 * temblor); FAROL.halo.scale.set(sh, sh, 1);
    FAROL.llama.material.color.setRGB(6 * nivel * temblor, 3.2 * nivel * temblor, 1.1 * nivel);
    uAgua.uFarol.value = nivel * temblor; uAgua.uFarolL.value.set(-_v.x, _v.y, _v.z);
  }

  // ======================= El loro de la proa (Meshy, sin esqueleto: se anima entero) =======================
  // Un amazona de frente azul en su palito, atado a la proa. Respira, mira alrededor, ladea la cabeza, da un saltito;
  // se vuelve hacia lo que pasa (aves, botos, monos, el caimán, un toque en el agua) y se inquieta cerca de un secreto.
  function prepararLoro(geoCanoa) {
    var g = GLTF.loro; if (!g || !CANOA) return;
    var l = geometriaDe(g)[0], geo = l.geo; geo.computeBoundingBox();
    var b = geo.boundingBox, alto = b.max.y - b.min.y, esc = 16 / alto;
    // (Pau, 12/11: «se mueve muy poco y muy falso») un esqueleto hecho a mano: pesos por zonas en el modelo de Meshy
    // (mira a +Z, alto ±0,95): cabeza sobre el cuello, alas plegadas a los lados, cola abajo detrás, cuerpo sobre las patas
    var cx = (b.max.x + b.min.x) / 2, cz = (b.max.z + b.min.z) / 2, y0 = b.min.y, sm = function (a, c, x) { var t = Math.max(0, Math.min(1, (x - a) / (c - a))); return t * t * (3 - 2 * t); };
    var PO = geo.attributes.position, pesos = new Float32Array(PO.count * 4);
    for (var iv = 0; iv < PO.count; iv++) {
      var X = PO.getX(iv), Y = PO.getY(iv), Z = PO.getZ(iv), ax = Math.abs(X);
      var wH = sm(0.4, 0.6, Y) * sm(-0.22, -0.04, Z);
      var wW = sm(0.11, 0.25, ax) * (1 - sm(0.32, 0.52, Y)) * sm(-0.6, -0.22, Y) * (1 - sm(0.0, 0.18, Z)) * (1 - wH);
      var wT = (1 - sm(-0.5, -0.22, Y)) * (1 - sm(-0.16, -0.02, Z));
      var wC = sm(-0.44, -0.26, Y) + wT * (1 - sm(-0.44, -0.26, Y));         // las patas y la percha no se mueven; la cola sí
      pesos[iv * 4] = wH; pesos[iv * 4 + 1] = wW; pesos[iv * 4 + 2] = wT; pesos[iv * 4 + 3] = Math.min(1, wC);
    }
    geo.setAttribute('aLoro', new THREE.BufferAttribute(pesos, 4));
    function aFinal(x, y, z) { return new THREE.Vector3(-(x - cx) * esc, (y - y0) * esc, (z - cz) * esc); }   // como el modelo después de colocarlo y espejarlo
    geo.translate(-cx, -y0, -cz); geo.scale(esc, esc, esc);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    var P = geo.attributes.position, mx = 0, i, sy = 0, n = 0;
    for (i = 0; i < P.count; i++) mx = Math.max(mx, Math.abs(P.getX(i)));
    for (i = 0; i < P.count; i++) if (Math.abs(P.getX(i)) > mx * 0.8) { sy += P.getY(i); n++; }
    var palo = n ? sy / n : 5;            // la altura del palito (lo que sobresale a los lados)
    espejar(geo);
    // la cubierta de proa, medida en la canoa (cerca de z = −114)
    var C = geoCanoa.attributes.position, cub = -99;
    for (i = 0; i < C.count; i++) { var x = C.getX(i), y = C.getY(i), z = C.getZ(i); if (Math.abs(x) < 2.5 && Math.abs(z + 114) < 3 && y < 12 && y > cub) cub = y; }
    if (cub < -50) cub = 2.5;
    var base = Math.max(cub + 0.4, cub + 6 - palo);
    var mat = l.mat.clone(); mat.envMapIntensity = 1.1;
    var uL = { uCab: { value: new THREE.Vector3() }, uCabT: { value: new THREE.Vector3() }, uAla: { value: new THREE.Vector2() }, uCola: { value: new THREE.Vector2() },
      uCuerpo: { value: new THREE.Vector3() }, uResp: { value: 0 }, uPluma: { value: 0 },
      uPivH: { value: aFinal(0, 0.47, 0.04) }, uPivAl: { value: aFinal(0.1, 0.4, -0.06) }, uPivT: { value: aFinal(0, -0.26, -0.1) }, uPivC: { value: aFinal(0, -0.4, 0.1) } };
    uL.uPivAl.value.x = Math.abs(uL.uPivAl.value.x);
    mat.onBeforeCompile = function (sh) {
      for (var k in uL) sh.uniforms[k] = uL[k];
      sh.vertexShader = 'attribute vec4 aLoro; uniform vec3 uCab, uCabT, uCuerpo, uPivH, uPivAl, uPivT, uPivC; uniform vec2 uAla, uCola; uniform float uResp, uPluma;\n' +
        'mat3 rX(float a){ float c=cos(a), s=sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }\n' +
        'mat3 rY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }\n' +
        'mat3 rZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }\n' +
        'void loroDef(inout vec3 p, inout vec3 n){\n' +
        '  float w=aLoro.y; if(w>0.001){ float sd=p.x>0.0?1.0:-1.0; vec3 pv=vec3(uPivAl.x*sd,uPivAl.y,uPivAl.z); mat3 R=rZ((sd>0.0?uAla.y:-uAla.x)*w)*rY(-sd*(sd>0.0?uAla.y:uAla.x)*w*0.35); p=pv+R*(p-pv); n=R*n; }\n' +
        '  w=aLoro.z; if(w>0.001){ mat3 R=rX(uCola.x*w)*rY(uCola.y*w); p=uPivT+R*(p-uPivT); n=R*n; }\n' +
        '  w=aLoro.x; if(w>0.001){ mat3 R=rY(uCab.x*w)*rX(uCab.y*w)*rZ(uCab.z*w); p=uPivH+R*(p-uPivH)+uCabT*w; n=R*n; }\n' +
        '  w=aLoro.w; float k=1.0+(uResp*(1.0-aLoro.x)*(1.0-aLoro.z)+uPluma*0.09)*w;\n' +
        '  p.x*=k; p.z=uPivH.z+(p.z-uPivH.z)*k;\n' +
        '  if(w>0.001){ mat3 R=rX(uCuerpo.x*w)*rZ(uCuerpo.y*w); vec3 q=p-uPivC; q.y*=1.0-uCuerpo.z*w; p=uPivC+R*q; n=R*n; }\n' +
        '}\n' + sh.vertexShader
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 lpLoro=position; vec3 lnLoro=objectNormal; loroDef(lpLoro,lnLoro); objectNormal=lnLoro;')
          .replace('#include <begin_vertex>', 'vec3 transformed = lpLoro;');
    };
    var malla = new THREE.Mesh(geo, mat); malla.castShadow = malla.receiveShadow = true; malla.matrixAutoUpdate = false; malla.frustumCulled = false; CANOA.add(malla);
    var poste = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, base + palo - cub, 7), new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.06, 0.035), roughness: 0.9 }));
    poste.position.set(0, cub + (base + palo - cub) / 2, -114 - 1.2); poste.castShadow = true; CANOA.add(poste);
    var posteLoro = poste;     // el palo de la percha, atado a la proa
    LORO = { malla: malla, poste: posteLoro, u: uL, base: base, palo: palo, z: -114, phi: 0.55, phiObj: 0.55, giro: 2.2, t: 0, proxMirar: 2, proxLadeo: 7, proxSalto: 18, ladeo: -1, salto: -1, excit: 0, nervio: 0, atras: 0, reacT: -9, rapido: 0, ladoSecreto: 1, proxSecreto: 0,
      // la cabeza (giro, cabeceo, ladeo) con su objetivo: va a saltos rápidos, como los pájaros
      cab: [0, 0, 0], cabV: [0, 0, 0], cabObj: [0, 0, 0], proxVistazo: 1, ala: [0, 0], aleteo: 0, proxAseo: 25, aseo: -1, aseoLado: 1, sacudida: -1, proxSacudida: 40, cola: 0, colaV: 0, velAnt: 0, inercia: 0, pasito: 0 };
  }
  // el sonido (js/sonido.js): las posiciones en coordenadas de Three
  function sonar(n, d) { try { if (window.AM.sonido) AM.sonido(n, d); } catch (e) { /* sin sonido */ } }
  function sonarLoro(evento) { var p = { evento: evento, x: 0, y: 0, z: 0 }; if (LORO) { LORO.malla.updateMatrixWorld(); _v.setFromMatrixPosition(LORO.malla.matrixWorld); p.x = _v.x; p.y = _v.y + 10; p.z = _v.z; } sonar('loro', p); }
  function loroMira(x, z, tipo) {
    var L = LORO; if (!L) return;
    if (tiempo - L.reacT < 0.9 && tipo !== 'caiman' && tipo !== 'trueno') return;
    var dx = x - camX, dz = z - (camZ + 70 + 114);
    L.phiObj = Math.max(-2.7, Math.min(2.7, Math.atan2(dx, dz))); L.rapido = 0.55; L.excit = 1; L.reacT = tiempo;
    if (tipo === 'caiman') { L.nervio = 1.6; L.atras = 1; }
    if (tipo === 'trueno') { L.nervio = Math.max(L.nervio, 1.3); L.atras = 1; L.rapido = 0.8; L.aleteo = Math.max(L.aleteo, 0.9); }      // se encoge y aletea con el trueno
    if (tipo === 'caiman') L.aleteo = Math.max(L.aleteo, 0.7);
    if (tipo === 'mono' || tipo === 'delfin' || tipo === 'clic') L.aleteo = Math.max(L.aleteo, 0.35);
    L.aseo = -1;
    L.proxMirar = tiempo + 3 + Math.random() * 2;
    sonarLoro(tipo);
  }
  function vivirLoro(dt) {
    var L = LORO; if (!L) return;
    L.t += dt;
    // lo que llama su atención
    var px = camX, pz = camZ + 184;
    for (var i = 0; i < aves.length; i++) { var av = aves[i]; if (av.retraso > 0 || av.__loro) continue; if (Math.hypot(av.x - px, av.z - pz) < 1200) { aves.forEach(function (o) { if (Math.hypot(o.x - px, o.z - pz) < 1400) o.__loro = true; }); loroMira(av.x, av.z, 'ave'); break; } }
    if (salto && salto.visible && !salto.__loro) { salto.__loro = true; loroMira(salto.C[0], salto.C[2], 'delfin'); }
    for (i = 0; i < criaturas.length; i++) {
      var c = criaturas[i];
      if (c.tipo === 'caiman' && (c.estado === 'quieto' || c.estado === 'hunde') && !c.__loro && Math.hypot(c.x - px, c.z - pz) < 800) { c.__loro = true; loroMira(c.x, c.z, 'caiman'); }
      if (c.tipo === 'mono' && ((!c.__loro && Math.hypot(c.x - px, c.z - pz) < 1500) || (c.estado === 'salta' && !c.__loroS))) { c.__loro = true; if (c.estado === 'salta') c.__loroS = true; loroMira(c.x, c.z, 'mono'); }
      if (c.estado === 'fuera' && c.tipo === 'caiman') c.__loro = false;
    }
    // un secreto de lugar cerca: se inquieta y mira hacia su orilla (si no se sabe, a un lado y a otro)
    var eco = 0; try { eco = window.AM.interfaz && AM.interfaz.eco ? +AM.interfaz.eco() || 0 : 0; } catch (e) { eco = 0; }
    var ag = Math.max(0, (eco - 0.15) / 0.85);
    if (ag > 0 && tiempo > L.proxSecreto && tiempo - L.reacT > 1.2) {
      var lado = ladoDelSecreto(); if (!lado) { L.ladoSecreto = -L.ladoSecreto; lado = L.ladoSecreto; }
      L.phiObj = lado * (1.05 + Math.random() * 0.35); L.rapido = 0.35; L.excit = Math.max(L.excit, 0.4 + ag * 0.6);
      L.proxSecreto = tiempo + 2.6 - 1.6 * ag + Math.random() * 0.6; L.proxMirar = tiempo + 4; sonarLoro('inquieto');
    }
    // lo que hace solo
    if (tiempo > L.proxMirar && tiempo - L.reacT > 2.5) {
      L.phiObj = Math.random() < 0.12 ? (Math.random() < 0.5 ? -2.4 : 2.4) : 0.55 + (Math.random() - 0.5) * 1.75;   // a veces se vuelve a mirarte
      L.proxMirar = tiempo + 2.5 + Math.random() * 4.5;
    }
    if (tiempo > L.proxLadeo) { L.ladeo = 0; L.ladeoS = Math.random() < 0.5 ? -1 : 1; L.proxLadeo = tiempo + 6 + Math.random() * 7; }
    if (tiempo > L.proxSalto && tiempo - L.reacT > 3) { L.salto = 0; L.phiObj += (Math.random() < 0.5 ? -1 : 1) * 0.7; L.proxSalto = tiempo + 15 + Math.random() * 15; sonarLoro('salto'); }
    if (L.baile && tiempo < L.baile) { L.excit = 1; L.cabObj[2] = Math.sin(tiempo * 5) * 0.35; if (Math.random() < dt * 2) L.pasito += 0.5; }
    L.excit = Math.max(0, L.excit - dt * 1.3); L.nervio = Math.max(0, L.nervio - dt); L.atras = Math.max(0, L.atras - dt * 0.6);
    var f = 1 + ag * 1.5, llueve = TORM ? TORM.lluvia : 0, T0 = L.t;
    // la mirada: la cabeza va primero (rápida, a saltos); el cuerpo solo se gira si tiene que mirar muy de lado
    var difGiro = L.phiObj - L.phi;
    if (Math.abs(difGiro) > 1.25 || L.rapido > 0) {
      var kb = L.rapido > 0 ? 6 : 1.6, antes = L.phi; L.phi += (L.phiObj - Math.sign(difGiro) * (L.rapido > 0 ? 0.3 : 0.9) - L.phi) * Math.min(1, dt * kb);
      if (Math.abs(L.phi - antes) > dt * 0.4) L.pasito += dt * 7;                 // se gira a pasitos sobre el palo
    }
    L.rapido = Math.max(0, L.rapido - dt);
    if (T0 > L.proxVistazo) {                       // vistazos: pequeños saltos de la cabeza alrededor de lo que mira
      var excitado = L.excit > 0.3 || ag > 0.2;
      L.cabObj[0] = (L.phiObj - L.phi) + (Math.random() - 0.5) * (excitado ? 0.5 : 0.7);
      L.cabObj[1] = (Math.random() - 0.45) * 0.35 + (Math.random() < 0.15 ? 0.35 : 0);   // a veces mira abajo, al agua
      L.cabObj[2] = Math.random() < 0.25 ? (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.3) : (Math.random() - 0.5) * 0.12;   // ladea la cabeza, curioso
      L.proxVistazo = T0 + (excitado ? 0.25 + Math.random() * 0.5 : 0.5 + Math.random() * 1.6);
    }
    if (L.rapido > 0.4) { L.cabObj[0] = L.phiObj - L.phi; L.cabObj[1] = 0; }
    if (L.ladeo >= 0) { L.ladeo += dt / 1.1; if (L.ladeo >= 1) L.ladeo = -1; else { L.cabObj[2] = L.ladeoS * 0.5; L.cabObj[1] = 0.1; } }
    // asearse: la cabeza baja al ala de un lado y mordisquea; luego se sacude
    if (L.aseo < 0 && T0 > L.proxAseo && L.excit < 0.2 && L.nervio <= 0 && ag < 0.1) { L.aseo = 0; L.aseoLado = Math.random() < 0.5 ? -1 : 1; }
    var alaAseo = 0;
    if (L.aseo >= 0) {
      L.aseo += dt / 2.8;
      if (L.aseo >= 1) { L.aseo = -1; L.proxAseo = T0 + 18 + Math.random() * 25; L.sacudida = 0; }
      else { var en = Math.min(1, L.aseo * 5, (1 - L.aseo) * 5); L.cabObj = [L.aseoLado * 1.45 * en, 0.75 * en + Math.sin(T0 * 26) * 0.07 * en, -L.aseoLado * 0.35 * en]; alaAseo = 0.14 * en; L.proxVistazo = T0 + 0.3; }
    }
    if (L.sacudida < 0 && T0 > L.proxSacudida - (llueve > 0.3 ? 30 : 0)) L.sacudida = 0;     // con la lluvia se sacude a menudo
    var plu = 0, sac = 0;
    if (L.sacudida >= 0) { L.sacudida += dt / 0.75; if (L.sacudida >= 1) { L.sacudida = -1; L.proxSacudida = T0 + 30 + Math.random() * 30; L.colaV += 6; } else { var e = Math.sin(Math.PI * L.sacudida); plu = e; sac = Math.sin(T0 * 52) * e; } }
    // la cabeza sigue al objetivo con un muelle rápido y amortiguado (llega, se para en seco: como un pájaro)
    var mu = L.rapido > 0 ? 340 : 190, am = 2 * Math.sqrt(mu) * 0.92;
    for (var q = 0; q < 3; q++) { var lim = q === 0 ? 1.75 : q === 1 ? 0.9 : 0.6, obj = Math.max(-lim, Math.min(lim, L.cabObj[q])); L.cabV[q] += ((obj - L.cab[q]) * mu - L.cabV[q] * am) * Math.min(dt, 0.033); L.cab[q] += L.cabV[q] * Math.min(dt, 0.033); }
    // la canoa acelera o frena: el loro se echa atrás o adelante y abre un poco las alas para no caerse
    var acel = (vel - L.velAnt) / Math.max(dt, 0.001); L.velAnt = vel;
    L.inercia += (Math.max(-1, Math.min(1, -acel / 900)) - L.inercia) * Math.min(1, dt * 4);
    var rapidez = Math.min(1, Math.abs(vel) / MAXV);
    if (Math.abs(acel) > 1400) L.aleteo = Math.max(L.aleteo, 0.35);
    // aletear: abre las dos alas a la vez y bate rápido (9 Hz), cada vez menos
    L.aleteo = Math.max(0, L.aleteo - dt * 0.9);
    var bate = L.aleteo > 0 ? (0.25 + 0.55 * Math.abs(Math.sin(T0 * 28))) * Math.min(1, L.aleteo * 2.2) : 0;
    var abre = Math.max(bate, Math.abs(L.inercia) * 0.18 + rapidez * 0.06, plu * 0.12);
    L.ala[0] += ((abre + (L.aseoLado < 0 ? alaAseo : 0)) - L.ala[0]) * Math.min(1, dt * 22);
    L.ala[1] += ((abre + (L.aseoLado > 0 ? alaAseo : 0)) - L.ala[1]) * Math.min(1, dt * 22);
    // la cola: hace de contrapeso (muelle) y se agita al sacudirse
    var colaObj = -L.inercia * 0.35 + Math.sin(T0 * 2.6 * f) * 0.04 + bate * 0.2;
    L.colaV += ((colaObj - L.cola) * 120 - L.colaV * 9) * Math.min(dt, 0.033); L.cola += L.colaV * Math.min(dt, 0.033);
    // el cuerpo: respira, se agacha antes de saltar, se encoge con miedo o con lluvia
    var resp = 0.022 * Math.sin(T0 * 2.6 * f) + (L.nervio > 0 ? 0.02 * Math.sin(T0 * 30) * Math.min(1, L.nervio) : 0);
    var agacha = llueve * 0.08 + L.atras * 0.06, y = L.base;
    if (L.salto >= 0) { L.salto += dt / 0.55; if (L.salto >= 1) { L.salto = -1; L.colaV -= 4; } else { var sp = L.salto; if (sp < 0.3) agacha += Math.sin(sp / 0.3 * Math.PI) * 0.16; else { y += Math.sin((sp - 0.3) / 0.7 * Math.PI) * 3; L.ala[0] = L.ala[1] = Math.max(L.ala[0], 0.5 * Math.sin((sp - 0.3) / 0.7 * Math.PI)); } } }
    var paso = L.pasito > 0 ? Math.abs(Math.sin(L.pasito * Math.PI)) * 0.7 : 0; L.pasito = L.pasito > 0 && Math.abs(Math.sin(L.pasito * Math.PI)) > 0.05 ? L.pasito : 0;
    y += paso + (L.excit > 0.3 ? Math.abs(Math.sin(T0 * 14)) * 0.5 * L.excit : 0);
    var u = L.u;
    u.uCab.value.set(L.cab[0], L.cab[1] + (L.excit > 0.4 ? Math.sin(T0 * 18) * 0.08 : 0), L.cab[2] + sac * 0.3);
    u.uCabT.value.set(0, L.excit > 0.4 ? Math.sin(T0 * 18) * 0.5 : 0, 0);
    u.uAla.value.set(L.ala[0], L.ala[1]);
    u.uCola.value.set(L.cola, Math.sin(T0 * 0.9) * 0.05 + sac * 0.25);
    u.uCuerpo.value.set(L.inercia * 0.22 + rapidez * 0.1 - L.atras * 0.2, sac * 0.12 + Math.sin(T0 * 1.05) * 0.02, agacha);
    u.uResp.value = resp + llueve * 0.05; u.uPluma.value = plu + llueve * 0.35;
    // de cara a la proa con phi = 0 (el modelo mira a +Z; en la canoa, la proa es −Z)
    localCanoa(L.malla.matrix, 0, y, L.z, Math.PI + L.phi, 0, 0, 1);
    L.malla.matrixWorldNeedsUpdate = true;
  }
  function ladoDelSecreto() {
    var mejor = null, dm = 3200;
    for (var i = 0; i < piezas.length; i++) {
      var p = piezas[i]; if (!(p.tipo === 'teatro' || p.samauma || /^casa-|^embarcadero|^victoria-flor/.test(p.tipo))) continue;
      var d = Math.abs(p.z - camZ); if (d < dm && p.z > camZ - 600) { dm = d; mejor = p; }
    }
    return mejor ? (mejor.x - camX >= 0 ? 1 : -1) : 0;
  }

  // ======================= Las orillas: franjas de tierra que se reciclan =======================
  // borde(z) suave por lado: el sembrador coloca los árboles con el mismo borde, así nada flota ni sale del agua
  function bordeEn(z, lado) {
    var A = VJ.en(z), n = ruido1(z / 1700 + lado * 31.7) * 0.65 + ruido1(z / 430 + lado * 7.3) * 0.35;
    return A.borde[0] + (A.borde[1] - A.borde[0]) * n;
  }
  function inundadoEn(z) { var A = VJ.en(z); return (A.a.id === 'igapo' ? 1 - A.t : 0) + (A.b.id === 'igapo' ? A.t : 0); }
  // altura del suelo a una distancia s de la línea de orilla (s > 0 tierra adentro)
  function alturaSuelo(s, z, lado, inund) {
    var h;
    if (s < -280) h = -70;
    else if (s < 0) h = -70 + 76 * suave((s + 280) / 280);
    else h = 6 + 26 * suave(s / 500) + 16 * suave((s - 500) / 2200);
    h += (ruido2(z / 260, s / 230 + lado * 9) - 0.5) * 18 * suave((s + 80) / 230) + (ruido2(z / 70, s / 60 + lado * 3) - 0.5) * 5 * suave((s + 200) / 200);
    h -= 34 * inund * suave((s + 100) / 300);
    return h;
  }
  function sueloEn(x, z) {   // altura del suelo en un punto lógico (para apoyar los árboles)
    var lado = x < 0 ? -1 : 1, s = Math.abs(x) - bordeEn(z, lado);
    return alturaSuelo(s, z, lado, inundadoEn(z));
  }
  var TROZO = 1500, COLS = [-560, -380, -280, -210, -150, -100, -60, -30, -10, 10, 35, 70, 120, 190, 280, 400, 560, 780, 1050, 1400, 1850, 2400, 3100, 4000];
  var trozos = {}, matTierra = null;
  function materialTierra() {
    var conFoto = !!(FOTO['barro-orilla'] && FOTO['hojarasca']);
    var m = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, map: conFoto ? FOTO['barro-orilla'] : null, vertexColors: false });
    var u = { uHojarasca: { value: FOTO.hojarasca || null } };
    m.onBeforeCompile = function (s) {
      for (var k in u) s.uniforms[k] = u[k];
      s.vertexShader = 'attribute vec3 aTierra; varying vec3 vTierra; varying vec3 vMundoT;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTierra=aTierra; vMundoT=(modelMatrix*vec4(transformed,1.0)).xyz;');
      s.fragmentShader = 'varying vec3 vTierra; varying vec3 vMundoT; uniform sampler2D uHojarasca;\n' + s.fragmentShader
        .replace('#include <map_fragment>', [
          'vec2 uvT=vec2(-vMundoT.x,vMundoT.z)/260.0;',
          conFoto ? 'vec3 barro=texture2D(map,uvT).rgb, hoja=texture2D(uHojarasca,uvT*0.8+0.31).rgb;' : 'vec3 barro=vec3(0.16,0.10,0.055), hoja=vec3(0.07,0.055,0.035);',
          'vec3 alb=mix(barro,hoja,vTierra.x);',
          'alb*=mix(1.0,0.5,vTierra.y);',                                  // mojado: más oscuro
          'alb*=1.0-0.4*smoothstep(0.8,1.0,vTierra.y);',                     // la raya húmeda donde el agua toca el barro
          'alb*=mix(1.0,0.42,smoothstep(250.0,1400.0,vTierra.z));',       // tierra adentro, a la sombra de la selva
          'diffuseColor.rgb*=alb;'].join('\n'))
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,0.32,vTierra.y);');
    };
    m.customProgramCacheKey = function () { return 'tierra'; };
    return m;
  }
  function crearTrozo(k, lado) {
    var z0 = k * TROZO, filas = Math.round(TROZO / 50) + 1, nc = COLS.length;
    var pos = new Float32Array(filas * nc * 3), at = new Float32Array(filas * nc * 3), idx = [];
    for (var j = 0; j < filas; j++) {
      var z = z0 + j * (TROZO / (filas - 1)), b = bordeEn(z, lado), inund = inundadoEn(z);
      for (var i = 0; i < nc; i++) {
        var s = COLS[i] + (i > 2 && i < nc - 1 ? (ruido2(z / 120, i * 1.7) - 0.5) * 22 : 0), x = lado * (b + s), h = alturaSuelo(s, z, lado, inund), o = (j * nc + i) * 3;
        pos[o] = -x; pos[o + 1] = h; pos[o + 2] = z;
        at[o] = suave((s - 40) / 380) * (0.75 + 0.25 * ruido2(z / 200, s / 150));     // barro → hojarasca
        at[o + 1] = 1 - suave((h - 1) / 14);                                          // mojado junto al agua
        at[o + 2] = Math.max(0, s);
      }
    }
    for (j = 0; j < filas - 1; j++) for (i = 0; i < nc - 1; i++) {
      var a = j * nc + i, bq = a + 1, c = a + nc, d = c + 1;
      if (lado > 0) idx.push(a, c, bq, bq, c, d); else idx.push(a, bq, c, bq, d, c);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aTierra', new THREE.BufferAttribute(at, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) < 0) { voltearTriangulos(g); g.computeVertexNormals(); }
    g.computeBoundingSphere();
    var m = new THREE.Mesh(g, matTierra); m.receiveShadow = true; m.castShadow = false;
    escena.add(m);
    return m;
  }
  // ======================= La selva de fondo: el muro de sotobosque y las filas de árboles tierra adentro =======================
  // (Pau, 12/11) mirando a los lados no se puede ver el horizonte vacío entre los troncos. Detrás de la primera fila
  // (la del sembrador, con modelos de Blender) va un muro continuo de follaje medio y, hasta ~4000 u tierra adentro,
  // filas de árboles baratos (copa de cartas + tronco de 6 caras) con emergentes que rompen la línea del dosel.
  // Todo con instancias; las copas son racimos de cartas de los atlas (no un cartel plano).
  var FONDO = null, PF = 260, slotsFondo = {};
  function geoMasa(atlas, semillaN, n, ancho, fondo, alto, y0, tam0, tam1, ocBase, centroY) {
    var acc = { pos: [], nor: [], uv: [], hoja: [], col: [], idx: [] }, rr = semilla(semillaN), N = atlas.marcos.length;
    for (var i = 0; i < n; i++) {
      var u = rr(), v = rr(), w = rr(), hy = Math.pow(rr(), 0.8);
      var x = (u - 0.5) * ancho, z = (v - 0.5) * fondo, y = y0 + hy * alto;
      if (centroY != null) {   // copa: dentro de un elipsoide, más densa por fuera
        var th = u * 6.2832, ph = Math.acos(1 - 2 * v), rad = 0.55 + 0.45 * Math.sqrt(w);
        x = Math.sin(ph) * Math.cos(th) * ancho * 0.5 * rad; z = Math.sin(ph) * Math.sin(th) * fondo * 0.5 * rad; y = centroY + Math.cos(ph) * alto * 0.5 * rad;
        hy = (Math.cos(ph) + 1) / 2;
      }
      var tam = tam0 + rr() * (tam1 - tam0), giro = rr() * 6.2832, incl = (rr() - 0.5) * 0.9, marco = (rr() * N) | 0;
      var oc = Math.min(1, ocBase + hy * 0.4 + rr() * 0.12);
      cartaGeo(acc, x, y, z, tam, giro, incl, marco, 0.3 + rr() * 0.6, atlas, [0, centroY != null ? centroY : y0 + alto * 0.45, 0], oc);
    }
    return geoDeCartas(acc);
  }
  function prepararFondo() {
    var hs = ATLAS['hojas-selva'], ab = ATLAS.arbusto || hs; if (!hs) return;
    FONDO = { muros: [], copas: [] };
    // el muro: follaje medio y sotobosque (de 1 a 11 m), oscuro abajo
    // (cartas pequeñas, del tamaño real de un arbusto o una rama con hojas: si no, la selva parece de hojas gigantes)
    FONDO.muros.push(new Lote(geoMasa(ab, 301, 150, 560, 240, 300, 5, 55, 105, 0.5), materialCopa(ab, 0.4, 0.8), 520, sombraCopa(ab, 0.4), 'fondo:muro1'));
    FONDO.muros.push(new Lote(geoMasa(hs, 302, 120, 560, 260, 470, 60, 90, 160, 0.48), materialCopa(hs, 0.4, 0.8), 520, sombraCopa(hs, 0.4), 'fondo:muro2'));
    // copas lejanas: pocas cartas grandes en un elipsoide (LOD barato)
    for (var k = 0; k < 3; k++) FONDO.copas.push(new Lote(geoMasa(hs, 400 + k, 46 + k * 6, 820, 820, 460, 0, 200, 330, 0.5, 0), materialCopa(hs, 0.35, 0.8), 700, sombraCopa(hs, 0.35), 'fondo:copa' + k));
    var gt = new THREE.CylinderGeometry(14, 24, 1, 6, 1, true); gt.translate(0, 0.5, 0);
    var nT = gt.attributes.position.count, colT = new Float32Array(nT * 3).fill(0.11), amT = new Float32Array(nT * 3);
    for (var i = 0; i < nT; i++) { amT[i * 3 + 2] = 0.55 + 0.45 * gt.attributes.position.getY(i); }
    gt.setAttribute('color', new THREE.BufferAttribute(colT, 3)); gt.setAttribute('aMat', new THREE.BufferAttribute(amT, 3));
    var uvT = gt.attributes.uv; for (i = 0; i < uvT.count; i++) uvT.setXY(i, uvT.getX(i) * 0.6, uvT.getY(i) * 6);
    FONDO.tronco = new Lote(gt, materialModelo({ texA: FOTO['corteza-selva'] || null, modo: 0, mediaVC: new THREE.Vector3(0.11, 0.11, 0.11), lumA: 0.17, flex: 0.3 }), 2100, true, 'fondo:tronco');
  }
  function zonaPuerto(lado, z) { return lado > 0 && z > 1500 && z < 9400; }
  function slotFondo(k, lado) {
    var r = semilla(hash(k + 7000, lado + 91)), z0 = k * PF, out = [], zc = z0 + PF * 0.5;
    if (zc < -LARGO || zc > VJ.FIN + 7000) return out;
    var b = bordeEn(zc, lado), inund = inundadoEn(zc), puerto = zonaPuerto(lado, zc), m4 = new THREE.Matrix4(), j, x, z, y, e;
    function poner(lote, mx, cx, cy, cz, rad, alto) { out.push({ lote: lote, m: mx.clone(), x: cx, y: cy, z: cz, rad: rad, alto: alto, fase: r() * 6.28 }); }
    // el muro: dos filas al tresbolillo (en el igapó, con huecos: allí el bosque está inundado y se ve el agua entre troncos)
    for (j = 0; j < 2; j++) {
      if (puerto || (inund > 0.5 && r() < 0.65)) { r(); r(); r(); r(); r(); continue; }
      var sm = 160 + j * 230 + r() * 120; z = z0 + r() * PF; x = lado * (b + sm); e = 0.85 + r() * 0.55;
      y = Math.max(-25, sueloEn(x, z)) - 12;
      matrizPieza(x, y, z, Math.PI / 2 + (r() - 0.5) * 0.7, e);
      poner(FONDO.muros[j], _m4, x, y + 220 * e, z, 460 * e, 470 * e); r();
    }
    // las filas de árboles: tronco + copa; uno de cada cinco es emergente (rompe la línea del dosel)
    var filas = [620, 1000, 1400, 1850, 2350, 2900, 3500, 4100];
    for (j = 0; j < filas.length; j++) {
      var salta = r() < 0.1, sf = filas[j] + r() * 380, emerg = r() < 0.2, hc = emerg ? 1450 + r() * 750 : 700 + r() * 620;
      var zf = z0 + r() * PF, ec = (emerg ? 1.2 : 0.8) + r() * 0.45, ry = r() * 6.28, aplast = 0.75 + r() * 0.4, variante = (r() * 3) | 0;
      if (salta) continue;
      if (puerto && sf < 2600) continue;
      x = lado * (b + sf);
      if (Math.hypot(x - TEATRO.x, zf - TEATRO.z) < 1700) continue;             // que no tape el teatro
      var g = Math.max(-40, sueloEn(x, zf)) - 15;
      _m4.compose(_pos.set(-x, g, zf), _q4.identity(), _esc.set(1 + (ec - 1) * 0.5, hc + 60, 1 + (ec - 1) * 0.5));
      poner(FONDO.tronco, _m4, x, g + hc * 0.5, zf, hc * 0.6 + 60, 1);
      _eu.set(0, -ry, 0, 'YXZ'); _q4.setFromEuler(_eu);
      _m4.compose(_pos.set(-x, g + hc, zf), _q4, _esc.set(ec, ec * aplast, ec));
      poner(FONDO.copas[variante], _m4, x, g + hc, zf, 640 * ec, 600);
    }
    return out;
  }
  function selvaDeFondo() {   // reciclar los trozos de selva que entran y salen del pasillo
    if (!FONDO) return;
    var k0 = Math.floor((camZ - LARGO * 0.6) / PF), k1 = Math.floor((camZ + LARGO) / PF), vivos = {};
    for (var k = k0; k <= k1; k++) for (var l = -1; l <= 1; l += 2) { var c = k + ':' + l; vivos[c] = 1; if (!slotsFondo[c]) slotsFondo[c] = slotFondo(k, l); }
    for (var cl in slotsFondo) if (!vivos[cl]) delete slotsFondo[cl];
  }
  function ponerFondo(cy, sy) {
    if (!FONDO) return;
    var alc = ALCANCE[CALIDAD];
    for (var c in slotsFondo) {
      var L = slotsFondo[c];
      for (var i = 0; i < L.length; i++) {
        var o = L[i], d = (o.z - camZ) * cy + (o.x - camX) * sy;
        if (Math.hypot(o.x - camX, o.z - camZ) > alc + 2500) continue;
        if (!seVe(o.x, o.y, o.z, o.rad)) continue;
        var cerca = Math.abs(o.z - camZ) < SOMBRA_CAJA + 700 && Math.abs(o.x - camX) < SOMBRA_CAJA + 700;
        o.lote.poner(o.m, cerca, o.fase, 0.3 * (1 + racha.f * Math.exp(-Math.pow((o.z - racha.z) / 900, 2)) * 2.2), 0, o.alto);
      }
    }
  }

  function actualizarBorde() {
    if (Math.abs(camZ - (bordeZ0 + BORDE_N * BORDE_PASO * 0.3)) < 1500) return;
    bordeZ0 = Math.round(camZ - BORDE_N * BORDE_PASO * 0.3);
    var H = THREE.DataUtils.toHalfFloat;
    for (var i = 0; i < BORDE_N; i++) { var z = bordeZ0 + i * BORDE_PASO; bordeDatos[i * 4] = H(bordeEn(z, -1)); bordeDatos[i * 4 + 1] = H(bordeEn(z, 1)); bordeDatos[i * 4 + 2] = H(inundadoEn(z)); bordeDatos[i * 4 + 3] = H(1); }
    bordeTex.needsUpdate = true; uAgua.uBordeZ.value.set(bordeZ0, BORDE_N * BORDE_PASO);
  }

  // (Pau, 12/11) «aunque hayas puesto un montón de árboles se sigue viendo el fondo»: detrás de todas las filas,
  // un telón de selva profunda, oscuro y continuo, con el borde de arriba recortado como copas; entre los troncos ya
  // no se ve cielo, sino la penumbra del bosque (como en la selva de verdad). En el puerto de Manaus (la ciudad) no va.
  var telones = {}, matTelon = null, TELON_RET = 1750;
  function crearTelon(k, lado) {
    var z0 = k * TROZO, n = Math.round(TROZO / 25) + 1, pos = [], col = [], idx = [], hay = false;
    for (var j = 0; j < n; j++) {
      var z = z0 + j * (TROZO / (n - 1)), x = lado * (bordeEn(z, lado) + TELON_RET + (ruido2(z / 400, lado * 3.1) - 0.5) * 300);
      var fuera = (lado > 0 && z > 800 && z < 10200) || Math.hypot(x - TEATRO.x, z - TEATRO.z) < 2600;
      var top = fuera ? -60 : 560 + 300 * ruido2(z / 330, lado * 1.3) + 160 * ruido2(z / 75, lado * 5.7) + 90 * Math.abs(Math.sin(z / 47 + lado));
      if (!fuera) hay = true;
      var g = Math.max(-40, sueloEn(x, z)) - 40;
      pos.push(-x, g, z, -x, g + Math.max(0, top), z);
      var v = 0.75 + 0.5 * ruido2(z / 90, lado * 9.3);
      col.push(0.010 * v, 0.013 * v, 0.008 * v, 0.03 * v, 0.042 * v, 0.024 * v);
    }
    if (!hay) return null;
    for (j = 0; j < n - 1; j++) { var a = j * 2; if (lado > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
    geo.computeBoundingSphere();
    if (!matTelon) matTelon = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
    var m = new THREE.Mesh(geo, matTelon); escena.add(m);
    return m;
  }
  // ======================= El horizonte de delante y el tráfico del río =======================
  // (Pau, 12/11: «mirando adelante, el horizonte se ve muy vacío») 1) a lo lejos el río no se pierde en el vacío: una
  // franja de selva lejana (azulada por la distancia) lo cierra, como si allí torciera; 2) por el río bajan barcos,
  // barquitos y rabetas que se cruzan contigo, con su estela y su motor
  var horizonte = null;
  function crearHorizonte() {
    var R = 24000, n = 160, pos = [], idx = [], a0 = -1.25, a1 = 1.25;
    for (var i = 0; i <= n; i++) {
      var a = a0 + (a1 - a0) * i / n, x = Math.sin(a) * R, z = Math.cos(a) * R;
      var top = 300 + 120 * ruido2(i * 0.13, 3.3) + 60 * ruido2(i * 0.61, 7.1) + 70 * Math.pow(Math.max(0, Math.sin(i * 1.7 + 2 * ruido2(i * 0.3, 1))), 8);   // (12/11) plano, como la selva lejana (sin montañas)
      pos.push(x, -60, z, x, top, z);
    }
    for (i = 0; i < n; i++) { var b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    horizonte = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x1a2416, fog: false, side: THREE.DoubleSide }));   // con su propia neblina (la del tramo la borraría)
    horizonte.frustumCulled = false; horizonte.renderOrder = -5; escena.add(horizonte);
  }
  var trafico = [], proxBarco = 10, barcoSonoBocina = {};
  var TRAMOS_TRAFICO = { encuentro: 1, aldea: 0.8, atardecer: 0.6 };   // (12/11) en el puerto no: ya está lleno de barcos amarrados
  function vivirTrafico(dt) {
    if (!construido || !AMBIENTE) return;
    if (!horizonte) crearHorizonte();
    horizonte.position.set(-camX, 0, camZ);
    var lc = luzCarta.value, br = bruma3.value, kh = 0.58 + 0.25 * AMBIENTE.niebla; horizonte.material.color.setRGB(0.05 * lc.x * (1 - kh) + br.x * kh * 0.92, 0.075 * lc.y * (1 - kh) + br.y * kh * 0.92, 0.05 * lc.z * (1 - kh) + br.z * kh * 0.95);
    var hay = TRAMOS_TRAFICO[AMBIENTE.tramo.id] || 0;
    proxBarco -= dt;
    if (hay && proxBarco <= 0 && trafico.length < 1 && camZ > 10500) {
      var q = Math.random(), tipo = q < 0.35 ? 'barco-recreio' : q < 0.6 ? 'barco-pequeno' : (Math.random() < 0.5 ? 'rabeta-1' : 'rabeta-2');
      if (TIPOS[tipo]) {
        var z = camZ + 9000 + Math.random() * 5000, x = null, rbN = tipo === 'barco-recreio' ? 170 : tipo === 'barco-pequeno' ? 110 : 60;
        for (var intento = 0; intento < 14 && x === null; intento++) {
          var lado = Math.random() < 0.5 ? -1 : 1, b = Math.min(bordeEn(z, lado), bordeEn(camZ, lado)), xx = lado * (220 + Math.random() * Math.max(10, b - 220 - rbN - 180));
          if (!obstaculosEnCarril(xx, z, z - 5000, rbN, null, true).length && !trafico.some(function (o) { return Math.abs(o.p.x - xx) < rbN + 200 && Math.abs(o.p.z - z) < 6000; })) x = xx;
        }
        if (x === null) { proxBarco = 6; return; }
        var p = sacar(tipo);
        p.x = x; p.z = z; p.y = 0; p.rotY = (Math.random() - 0.5) * 0.08; p.movil = true;   // (Pau, 12/11) la proa por delante: bajan el río hacia la canoa
        trafico.push({ p: p, v: tipo === 'barco-recreio' ? 140 : tipo === 'barco-pequeno' ? 190 : 300, t: Math.random() * 6, tipo: tipo, rb: rbN, objX: x, vx: 0 });
      }
      proxBarco = (70 + Math.random() * 60) / hay;      // (Pau, 12/11) «que pasen menos a menudo»: uno cada minuto o dos
    }
    for (var i = trafico.length - 1; i >= 0; i--) {
      var t = trafico[i], pb = t.p; t.t += dt;
      pb.z -= t.v * dt; pb.y = Math.sin(t.t * 1.3) * 1.2;
      var obs = obstaculosEnCarril(t.objX, pb.z - 2600, pb.z + 150, t.rb, pb).concat(trafico.filter(function (o) { return o !== t && o.p.z < pb.z && o.p.z > pb.z - 2600 && Math.abs(o.p.x - t.objX) < o.rb + t.rb + 120; }).map(function (o) { return { x: o.p.x, z: o.p.z, r: o.rb }; }));
      if (obs.length) {        // el obstáculo más cercano por delante: pasa por el lado con más sitio
        obs.sort(function (a, b) { return b.z - a.z; }); var ob = obs[0], bd = bordeEn(pb.z, 1), bi = bordeEn(pb.z, -1);
        var der = ob.x + ob.r + t.rb + 140, izq = ob.x - ob.r - t.rb - 140, okD = der < bd - t.rb - 120, okI = izq > -bi + t.rb + 120;
        t.objX = okD && okI ? (Math.abs(der - pb.x) < Math.abs(izq - pb.x) ? der : izq) : okD ? der : okI ? izq : t.objX;
      }
      // (Pau, 12/11) las plantas del agua reaccionan al barco: lo que flota se aparta empujado por la proa; lo que
      // tiene raíz se dobla y se agita; y donde pasa queda el agua revuelta
      if (d < 6000) {
        var semi = anchoDe(pb) * 0.5, rL = t.rb + 140;
        for (var q = 0; q < piezas.length; q++) {
          var pl = piezas[q]; if (!/^(capim-flotante|pistia|juncos-agua|aninga|juncos|victoria)/.test(pl.tipo)) continue;
          var ddz = pl.z - pb.z; if (ddz < -semi - 200 || ddz > semi + 150) continue;
          var ddx = pl.x - pb.x, rp = Math.min(anchoDe(pl) * 0.4, 160); if (Math.abs(ddx) > rL + rp) continue;
          var lado2 = ddx >= 0 ? 1 : -1, hondo = 1 - Math.abs(ddx) / (rL + rp);
          if (/^(capim-flotante|pistia)/.test(pl.tipo)) { pl.empujeX = (pl.empujeX || 0) + lado2 * hondo * t.v * 0.9 * dt; }
          pl.empuje = Math.max(pl.empuje || 0, 1.5 + 2.5 * hondo);
          if (Math.random() < dt * 4) gota(pl.x, pl.z, 1.5 + hondo * 2, 10, false, 0.2);
        }
      }
      var vx = Math.max(-90, Math.min(90, (t.objX - pb.x) * 0.5)); t.vx += (vx - t.vx) * Math.min(1, dt * 1.5); pb.x += t.vx * dt;
      pb.rotY = -Math.atan2(t.vx, t.v) * 0.9;               // la proa mira hacia donde va
      var dz = pb.z - camZ, d = Math.hypot(pb.x - camX, dz);
      if (d < 1100 && ((t.t * 20) | 0) % 2 === 0) { var ancho = anchoDe(pb) * 0.3; gota(pb.x, pb.z - ancho, 2 + t.v / 120, 10, false, 0.3); gota(pb.x - ancho * 0.25, pb.z + ancho, 1.2, 9, false, 0.2); gota(pb.x + ancho * 0.25, pb.z + ancho, 1.2, 9, false, 0.2); }
      if (!barcoSonoBocina[i + ':' + t.tipo] && d < 2200 && t.tipo === 'barco-recreio') { barcoSonoBocina[i + ':' + t.tipo] = 1; if (Math.random() < 0.6) sonar('objeto', { tipo: t.tipo, x: -pb.x, y: 200, z: pb.z }); }
      if (pb.z < camZ - 7000 || pb.z > camZ + 20000) { soltarPieza(pb); trafico.splice(i, 1); barcoSonoBocina = {}; }
    }
  }
  // (Pau, 12/11: «que no pasen por encima de otros barcos») lo que hay en el agua y no se puede atravesar
  var RE_OBST = /^(barco|gasolinera|puesto|rabeta|canoa-atada|boya|casa-flotante|red-pesca|muelle|pilas|postes|embarcadero|casa-pilotes|iglesia|igapo-tronco)/;
  function radioLateral(p) { var a = anchoDe(p); return /^(barco|rabeta|canoa)/.test(p.tipo) ? Math.min(a * 0.22, 180) : /^(casa|iglesia|muelle|embarcadero|gasolinera|puesto)/.test(p.tipo) ? Math.min(a * 0.3, 280) : Math.min(a * 0.4, 200); }
  function obstaculosEnCarril(x, z0, z1, rb, propio, sinCanoa) {
    var lista = [];
    for (var i = 0; i < piezas.length; i++) {
      var o = piezas[i]; if (o === propio || !RE_OBST.test(o.tipo)) continue;
      if (o.z < Math.min(z0, z1) - 400 || o.z > Math.max(z0, z1) + 400) continue;
      var ro = radioLateral(o); if (Math.abs(o.x - x) < ro + rb + 90) lista.push({ x: o.x, z: o.z, r: ro });
    }
    if (!sinCanoa && Math.abs(camX - x) < 70 + rb + 120 && camZ + 70 > Math.min(z0, z1) - 300 && camZ + 70 < Math.max(z0, z1) + 300) lista.push({ x: camX, z: camZ + 70, r: 70 });   // la canoa
    return lista;
  }
  function motorCercano() {
    var m = null, md = 1e9;
    for (var i = 0; i < trafico.length; i++) { var pb = trafico[i].p, d = Math.hypot(pb.x - camX, pb.z - camZ); if (d < md) { md = d; m = { x: -pb.x, z: pb.z, d: d, tipo: trafico[i].tipo }; } }
    return m;
  }
  function tierras() {
    var k0 = Math.floor((camZ - LARGO * 0.6) / TROZO), k1 = Math.floor((camZ + LARGO) / TROZO), vivos = {};
    for (var k = k0; k <= k1; k++) for (var l = -1; l <= 1; l += 2) {
      if (k * TROZO > VJ.FIN + 6000 || (k + 1) * TROZO < -LARGO) continue;
      var clave = k + ':' + l; vivos[clave] = 1;
      if (!trozos[clave]) trozos[clave] = crearTrozo(k, l);
      if (!(clave in telones)) telones[clave] = crearTelon(k, l);
    }
    for (var cl in trozos) if (!vivos[cl]) { escena.remove(trozos[cl]); trozos[cl].geometry.dispose(); delete trozos[cl]; }
    for (cl in telones) if (!vivos[cl]) { if (telones[cl]) { escena.remove(telones[cl]); telones[cl].geometry.dispose(); } delete telones[cl]; }
    if (matTelon && AMBIENTE) { var lt = luzCarta.value; matTelon.color.setRGB(Math.min(2, lt.x * 0.9), Math.min(2, lt.y * 0.9), Math.min(2, lt.z * 0.9)); }
  }

  // ======================= Cielo y entorno =======================
  var uCielo = {
    uFotoA: { value: null }, uFotoB: { value: null }, uPanA: { value: new THREE.Vector4() }, uPanB: { value: new THREE.Vector4() }, uMezC: { value: 0 },
    uSol: { value: new THREE.Vector3(0, 1, 0) }, uZenit: { value: new THREE.Vector3() }, uHoriz: { value: new THREE.Vector3() }, uSolCol: { value: new THREE.Vector3() },
    uColBruma: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() }, uNubes: { value: 0 }, uOscuras: { value: 0 }, uNoche: { value: 0 }, uT: U.uT, uRayo: { value: 0 },
    uRayoDir: { value: new THREE.Vector3(0, 0.5, 1) }, uArco: { value: 0 }, uDisco: { value: 0 }
  };
  var cieloMalla = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({ uniforms: uCielo, vertexShader: GL.CIELO_VS, fragmentShader: GL.CIELO_FS, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  cieloMalla.frustumCulled = false; cieloMalla.renderOrder = -1000;
  escena.add(cieloMalla);

  // la luz de entorno: las dos fotos del tramo mezcladas, filtradas con PMREM (se rehace solo cuando cambia la mezcla)
  var pmrem = new THREE.PMREMGenerator(renderer), entornoRT = null, entornoClave = '';
  var rtEqui = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType, depthBuffer: false });
  rtEqui.texture.mapping = THREE.EquirectangularReflectionMapping;
  var uMezcla = { uA: { value: null }, uB: { value: null }, uT: { value: 0 }, uExpoA: { value: 1 }, uExpoB: { value: 1 }, uBandaA: { value: 0 }, uBandaB: { value: 0 } };
  var escenaMezcla = new THREE.Scene(), escenaSim = new THREE.Scene(), camPlano = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var planoMezcla = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: uMezcla, vertexShader: GL.MEZCLA_VS, fragmentShader: GL.MEZCLA_FS, depthTest: false, depthWrite: false }));
  planoMezcla.frustumCulled = false; escenaMezcla.add(planoMezcla);
  function entorno(A) {
    var ca = cielo(A.a.id), cb = cielo(A.b.id), ta = ca && ca.listo ? ca : cb && cb.listo ? cb : null, tb = cb && cb.listo ? cb : ta;
    if (!ta) return;
    var clave = A.a.id + '>' + A.b.id + ':' + Math.round(A.t * 10) + (ta === ca) + (tb === cb);
    if (clave === entornoClave) return;
    entornoClave = clave;
    uMezcla.uA.value = ta.tex; uMezcla.uB.value = tb.tex; uMezcla.uT.value = Math.round(A.t * 10) / 10; uMezcla.uBandaA.value = ta.banda ? 1 : 0; uMezcla.uBandaB.value = tb.banda ? 1 : 0;
    var prev = renderer.getRenderTarget(); renderer.setRenderTarget(rtEqui); renderer.render(escenaMezcla, camPlano); renderer.setRenderTarget(prev);
    entornoRT = pmrem.fromEquirectangular(rtEqui.texture, entornoRT);
    escena.environment = entornoRT.texture;
  }

  // ======================= El agua y sus ondas =======================
  var tipoSim = flotante ? THREE.FloatType : THREE.HalfFloatType;
  function rtSim() { return new THREE.WebGLRenderTarget(SIM_N, SIM_N, { type: tipoSim, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, generateMipmaps: false }); }
  var simA = rtSim(), simB = rtSim();
  var uSim = { uPrev: { value: null }, uAmort: { value: 0.986 }, uTamMundo: { value: SIM_TAM }, uN: { value: 0 }, uGotas: { value: [] }, uEsp: { value: new Float32Array(32) }, uCanoaUV: { value: new THREE.Vector2() } };
  for (var gi = 0; gi < 32; gi++) uSim.uGotas.value.push(new THREE.Vector4());
  // la estela larga: por cada tramo de 16 u del río, cuándo pasó la canoa, a qué velocidad, por qué x (y qué tramo es)
  var ESTELA_N = 2048, ESTELA_PASO = 16, estelaDatos = new Float32Array(ESTELA_N * 4), estelaZ = null;
  for (gi = 0; gi < ESTELA_N; gi++) estelaDatos[gi * 4 + 3] = -1;
  var estelaTex = new THREE.DataTexture(estelaDatos, ESTELA_N, 1, THREE.RGBAFormat, THREE.FloatType);
  estelaTex.minFilter = estelaTex.magFilter = THREE.NearestFilter; estelaTex.generateMipmaps = false; estelaTex.needsUpdate = true;
  function marcarEstela(z0, z1, v, x) {      // la canoa ha pasado de z0 a z1 a velocidad v
    var a = Math.floor(Math.min(z0, z1) / ESTELA_PASO), b = Math.floor(Math.max(z0, z1) / ESTELA_PASO);
    if (b - a > 200) a = b - 200;
    for (var i = a; i <= b; i++) { var k = ((i % ESTELA_N) + ESTELA_N) % ESTELA_N * 4; estelaDatos[k] = tiempo; estelaDatos[k + 1] = v; estelaDatos[k + 2] = x; estelaDatos[k + 3] = i; }
    estelaTex.needsUpdate = true;
  }
  var planoSim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: uSim, vertexShader: GL.SIM_VS, fragmentShader: GL.SIM_FS, depthTest: false, depthWrite: false }));
  planoSim.frustumCulled = false; escenaSim.add(planoSim);
  (function limpiar() { var prev = renderer.getRenderTarget(); [simA, simB].forEach(function (r) { renderer.setRenderTarget(r); renderer.setClearColor(0x000000, 1); renderer.clear(); }); renderer.setRenderTarget(prev); })();

  var reflRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  // el borde de cada orilla a lo largo del río (para que el agua sea más turbia junto al barro): 1024 muestras cada 32 u
  var BORDE_N = 1024, BORDE_PASO = 32, bordeDatos = new Uint16Array(BORDE_N * 4), bordeTex = new THREE.DataTexture(bordeDatos, BORDE_N, 1, THREE.RGBAFormat, THREE.HalfFloatType), bordeZ0 = -1e9;
  bordeTex.minFilter = bordeTex.magFilter = THREE.LinearFilter; bordeTex.wrapS = bordeTex.wrapT = THREE.ClampToEdgeWrapping; bordeTex.generateMipmaps = false;
  var matRefl = new THREE.Matrix4();
  var uAgua = {
    uRefl: { value: reflRT.texture }, uNorm: { value: OLAS }, uSim: { value: simA.texture }, uMatRefl: { value: matRefl },
    uT: U.uT, uTamMundo: { value: SIM_TAM }, uCorriente: { value: 0 }, uRachaZ: { value: 0 }, uRacha: { value: 0 }, uCalma: { value: 0 }, uNegra: { value: 0 },
    uLluvia: { value: 0 }, uNiebla: { value: 0 }, uFarol: { value: 0 }, uExpoRefl: { value: 1 },
    uMuro: { value: new THREE.Vector4().fromArray(VJ.tormenta(0).muro) }, uDisco: { value: 0 }, uNeb: { value: 0 }, uEstela: { value: estelaTex }, uEstelaD: { value: new THREE.Vector2(ESTELA_N, ESTELA_PASO) }, uPreLl: { value: 0.09 * (VJ.tormenta(0).muro[0] - VJ.tormenta(0).muro[0]) }, uLluviaI: { value: 1 },
    uCanoa: { value: new THREE.Vector3() }, uCasco: { value: new Float32Array(27) }, uCamL: { value: new THREE.Vector3() }, uSol: { value: new THREE.Vector3() }, uColBruma: { value: new THREE.Vector3() }, uAguaCol: { value: new THREE.Vector3() },
    uSolCol: { value: new THREE.Vector3() }, uAmb: { value: new THREE.Vector3() }, uFarolL: { value: new THREE.Vector3() }, uNieblaCerca: { value: 2500 }, uNieblaLejos: { value: 15000 }, uDepura: { value: 0 },
    uSombra: { value: null }, uSombraMat: { value: new THREE.Matrix4() }, uConSombra: { value: 0 }, uSombraTam: { value: 2048 }, uBorde: { value: bordeTex }, uBordeZ: { value: new THREE.Vector2(0, BORDE_N * BORDE_PASO) }, uTurbio: { value: new THREE.Vector3(0.012, 0.007, 0.0035) }
  };
  var agua = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: uAgua, vertexShader: GL.AGUA_VS, fragmentShader: GL.AGUA_FS, fog: false, side: THREE.DoubleSide }));
  agua.frustumCulled = false; agua.layers.set(1); agua.renderOrder = -10;
  escena.add(agua);

  // ======================= Partículas y cartas =======================
  var MAXP = 1400;
  var partGeo = new THREE.InstancedBufferGeometry(); partGeo.copy(new THREE.PlaneGeometry(1, 1));
  var partA = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4), partB = new THREE.InstancedBufferAttribute(new Float32Array(MAXP * 4), 4);
  partA.setUsage(THREE.DynamicDrawUsage); partB.setUsage(THREE.DynamicDrawUsage);
  partGeo.setAttribute('a', partA); partGeo.setAttribute('b', partB); partGeo.instanceCount = 0;
  var HR = [], HA = []; (MARCOS.hojas || []).forEach(function (m) { HR.push(new THREE.Vector4(m[0], m[1], m[2], m[3])); HA.push(m[5] / m[4]); });
  while (HR.length < 9) { HR.push(new THREE.Vector4(0, 0, 1, 1)); HA.push(1); }
  var uPart = { uImg: { value: IMG.hojas || null }, uDer: { value: new THREE.Vector3(1, 0, 0) }, uHR: { value: HR }, uHA: { value: HA }, uLuz: { value: 1 } };
  var blendPremult = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, transparent: true, depthWrite: false };
  var particulas = new THREE.Mesh(partGeo, new THREE.ShaderMaterial(Object.assign({ uniforms: uPart, vertexShader: GL.PART_VS, fragmentShader: GL.PART_FS, side: THREE.DoubleSide }, blendPremult)));
  particulas.frustumCulled = false; particulas.renderOrder = 10;
  escena.add(particulas);

  // lo que flota: hojas, ramitas y vainas que bajan despacio con la corriente y suben y bajan con las ondas
  var FLOT_N = 130, flot = [];
  var flGeo = new THREE.InstancedBufferGeometry(); flGeo.copy(new THREE.PlaneGeometry(1, 1));
  var flA = new THREE.InstancedBufferAttribute(new Float32Array(FLOT_N * 4), 4), flB = new THREE.InstancedBufferAttribute(new Float32Array(FLOT_N * 4), 4);
  flA.setUsage(THREE.DynamicDrawUsage); flB.setUsage(THREE.DynamicDrawUsage); flGeo.setAttribute('f0', flA); flGeo.setAttribute('f1', flB); flGeo.instanceCount = 0;
  var uFlot = { uImg: { value: IMG.hojas || null }, uSimV: { value: simA.texture }, uTamMundo: { value: SIM_TAM }, uHR: { value: HR }, uHA: { value: HA }, uLuz: { value: 1 }, uNieblaCerca: { value: 2500 }, uNieblaLejos: { value: 15000 }, uColBruma: { value: new THREE.Vector3() } };
  var flotantes = new THREE.Mesh(flGeo, new THREE.ShaderMaterial(Object.assign({ uniforms: uFlot, vertexShader: GL.FLOT_VS, fragmentShader: GL.FLOT_FS, side: THREE.DoubleSide }, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, transparent: true, depthWrite: false })));
  flotantes.frustumCulled = false; flotantes.layers.set(1); flotantes.renderOrder = 2; escena.add(flotantes);
  function soltarFlotante(f, inicio) {
    var dz = inicio ? -1500 + Math.random() * 4000 : (vel >= -20 ? 1700 + Math.random() * 900 : -1500 - Math.random() * 400);   // (12/11) también detrás
    f.z = camZ + dz; var b = bordeEn(f.z, Math.random() < 0.5 ? -1 : 1);
    f.x = camX + (Math.random() - 0.5) * 2 * Math.min(b * 0.85, 1700);
    var q = Math.random(); f.tipo = q < 0.55 ? 0 : q < 0.85 ? 1 : 2;
    f.tam = f.tipo === 0 ? 6 + Math.random() * 4 : f.tipo === 1 ? 10 + Math.random() * 16 : 3.5 + Math.random() * 2.5;
    f.marco = (Math.random() * 9) | 0; f.ang = Math.random() * 6.28; f.giro = (Math.random() - 0.5) * 0.15; f.sem = Math.random(); f.vz = 16 + Math.random() * 14; f.t = 0;
  }
  function vivirFlotantes(dt) {
    while (flot.length < FLOT_N) { var nf = {}; soltarFlotante(nf, true); flot.push(nf); }
    var n = 0, A = flA.array, B = flB.array;
    for (var i = 0; i < flot.length; i++) {
      var f = flot[i]; f.t += dt;
      f.z -= f.vz * dt; f.x += Math.sin(tiempo * 0.3 + f.sem * 10) * 2.5 * dt; f.ang += f.giro * dt;
      var lat = f.x - camX, dz = f.z - (camZ + 70);
      if (Math.abs(dz) < 150 && Math.abs(lat) < 34) f.x = camX + (lat >= 0 ? 1 : -1) * 34;          // la canoa los aparta (nunca dentro del casco)
      else if (dz > 150 && dz < 330 && Math.abs(lat) < 60) f.x += (lat >= 0 ? 1 : -1) * Math.min(1, Math.abs(vel) / 300 + 0.2) * 40 * dt;
      if (f.z < camZ - 2000 || f.z > camZ + 2800 || Math.abs(f.x - camX) > 2400) soltarFlotante(f, false);
      var o = n * 4, al = Math.min(1, f.t / 1.5);
      A[o] = -f.x; A[o + 1] = f.z; A[o + 2] = f.ang; A[o + 3] = f.tam;
      B[o] = f.tipo; B[o + 1] = f.marco; B[o + 2] = al; B[o + 3] = f.sem; n++;
    }
    flGeo.instanceCount = n; flA.needsUpdate = true; flB.needsUpdate = true;
    uFlot.uSimV.value = simA.texture;
  }

  var uDerComun = { value: new THREE.Vector3(1, 0, 0) };
  var bruma3 = { value: new THREE.Vector3(0.5, 0.5, 0.5) }, luzCarta = { value: new THREE.Vector3(1, 1, 1) }, nCerca = { value: 2500 }, nLejos = { value: 15000 };
  function Cartas(tex, max, capa) {
    var g = new THREE.InstancedBufferGeometry(); g.copy(new THREE.PlaneGeometry(1, 1));
    this.attr = [];
    for (var k = 0; k < 5; k++) { var a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('i' + k, a); this.attr.push(a); }
    g.instanceCount = 0; this.g = g; this.max = max; this.n = 0;
    var u = { uImg: { value: tex }, uDer: uDerComun, uT: U.uT, uTamMundo: { value: SIM_TAM }, uSimV: { value: simA.texture }, uColBruma: bruma3, uLuzCarta: luzCarta, uNieblaCerca: nCerca, uNieblaLejos: nLejos };
    this.u = u;
    this.malla = new THREE.Mesh(g, new THREE.ShaderMaterial(Object.assign({ uniforms: u, vertexShader: GL.CARTA_VS, fragmentShader: GL.CARTA_FS, side: THREE.DoubleSide }, blendPremult)));
    this.malla.frustumCulled = false; this.malla.renderOrder = 5;
    if (capa) this.malla.layers.set(capa);
    escena.add(this.malla);
  }
  Cartas.prototype.poner = function (c) {   // c: { x, y, z (lógicas), giro, ancho, alto, voltear, hundir, rect, fase, viento, empuje, flota, alfa, modo }
    var i = this.n; if (i >= this.max) return; this.n++;
    var A = this.attr, o = i * 4, r = c.rect || [0, 0, 1, 1];
    A[0].array.set([-c.x, c.y, c.z, c.giro || 0], o);
    A[1].array.set([c.ancho, c.alto, c.voltear || 1, c.hundir || 0], o);
    A[2].array[o] = r[0]; A[2].array[o + 1] = r[1]; A[2].array[o + 2] = r[2]; A[2].array[o + 3] = r[3];
    A[3].array.set([c.fase || 0, c.viento || 0, c.empuje || 0, c.flota ? 1 : 0], o);
    A[4].array.set([c.alfa == null ? 1 : c.alfa, c.modo || 0, 0, 0], o);
  };
  Cartas.prototype.cerrar = function () { this.g.instanceCount = this.n; for (var k = 0; k < 5; k++) this.attr[k].needsUpdate = true; this.u.uSimV.value = simA.texture; this.malla.visible = this.n > 0; this.n = 0; };
  var cartasAves = {}, cartasCamalotes = null, cartasNiebla = null;
  ['guacamayo', 'garza', 'loro'].forEach(function (e) { if (IMG['ave-' + e]) cartasAves[e] = new Cartas(IMG['ave-' + e], 160); });
  if (IMG.camalotes) cartasCamalotes = new Cartas(IMG.camalotes, 120);
  cartasNiebla = new Cartas(null, 60, 1);

  // ======================= Posproceso: escena con MSAA → etalonado de película =======================
  var W = 1, H = 1, DPR = 1;
  var rtEscena = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  var compositor = new THREE.EffectComposer(renderer, rtEscena);
  compositor.addPass(new THREE.RenderPass(escena, camara));
  // (Pau, 12/11: «se nota que son capas 2D») la bruma del río, en volumen: para cada píxel, cuánta niebla hay entre el
  // ojo y lo que se ve (más densa a ras del agua, con jirones que derivan); sin planos, así que no corta nada
  var uBruma = { tDiffuse: { value: null }, tProf: { value: null }, uInvProy: { value: new THREE.Matrix4() }, uCamMat: { value: new THREE.Matrix4() },
    uCam: { value: new THREE.Vector3() }, uT: U.uT, uDens: { value: 0 }, uSolT: { value: new THREE.Vector3(0, 0, -1) }, uColN: { value: new THREE.Vector3(0.6, 0.5, 0.45) }, uSolN: { value: new THREE.Vector3(1, 0.7, 0.4) } };
  var pasoBruma = new THREE.ShaderPass(new THREE.ShaderMaterial({ uniforms: uBruma, vertexShader: GL.CINE_VS, fragmentShader: GL.BRUMA_FS, depthTest: false, depthWrite: false }));
  // (12/11) ya no se usa: la bruma va en cada superficie (fog_fragment); el pase leía la profundidad y en Safari cortaba
  pasoBruma.enabled = false;
  var uCine = { tDiffuse: { value: null }, uT: U.uT, uExpo: { value: 1 }, uSat: { value: 0.85 }, uRayoG: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } };
  var pasoCine = new THREE.ShaderPass(new THREE.ShaderMaterial({ uniforms: uCine, vertexShader: GL.CINE_VS, fragmentShader: GL.CINE_FS }));
  compositor.addPass(pasoCine);
  // calidad: 0 = la de siempre (DPR hasta 1,5, sombra 2048); si el ordenador no llega, baja sola por escalones
  // (o con ?calidad=1…3): menos píxeles, reflejo más pequeño y sombra de 1024
  var CALIDAD = Math.max(0, Math.min(3, +((/calidad=(\d)/.exec(location.search) || [])[1] || 0)));
  var DPR_MAX = [1.5, 1.2, 1.0, 0.8], REFL_DIV = [2, 2, 2.5, 3], ALCANCE = [LARGO, 12500, 9500, 7500];
  function medirVentana() {
    W = innerWidth; H = innerHeight; DPR = Math.min(+((/dpr=([\d.]+)/.exec(location.search) || [])[1]) || window.devicePixelRatio || 1, DPR_MAX[CALIDAD]);
    var somb = CALIDAD >= 2 ? 1024 : 2048;
    if (sol.shadow.mapSize.x !== somb) { sol.shadow.mapSize.set(somb, somb); if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; } }
    renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
    compositor.setPixelRatio(DPR); compositor.setSize(W, H);
    reflRT.setSize(Math.round(W * DPR / REFL_DIV[CALIDAD]), Math.round(H * DPR / REFL_DIV[CALIDAD]));
    uCine.uRes.value.set(Math.round(W * DPR), Math.round(H * DPR));
    camara.aspect = W / H; camara.updateProjectionMatrix();
  }
  medirVentana(); addEventListener('resize', medirVentana);

  // ======================= Piezas del mundo y el sembrador =======================
  var piezas = [];
  // El río se divide en huecos (orilla izquierda, orilla derecha, agua, niebla). Cada hueco, con su propia semilla,
  // pide al tramo qué le toca: así el mundo cambia de un tramo a otro y, si vuelves atrás, todo sigue en su sitio.
  var HUECO = 380, HUECO_AGUA = 650, HUECO_NIEBLA = 2100, huecos = {}, libres = {};
  function sacar(tipo) {
    var l = libres[tipo], p = l && l.length ? l.pop() : { tipo: tipo, fase: azar() * 6.28 };
    p.x = 0; p.y = 0; p.z = 0; p.voltear = 1; p.giro = 0; p.alfa = 1; p.empuje = 0; p.volaron = false; p.aves = null; p.d = 1e9; p.esc = 1; p.rotY = 0; p.racha = 0; p.monoVisto = false; p.fondo = false;
    piezas.push(p); return p;
  }
  function soltarPieza(p) { var i = piezas.indexOf(p); if (i >= 0) piezas.splice(i, 1); (libres[p.tipo] = libres[p.tipo] || []).push(p); }
  function colocarModelo(nombre, lado, z, borde, r) {
    var T = TIPOS[nombre]; if (!T) return null;
    var fam = T.familia, R = VJ.REGLAS[fam] || {}, p = sacar(nombre);
    p.z = z; p.lado = lado; p.y = 0;
    var esc = R.esc ? R.esc[0] + r() * (R.esc[1] - R.esc[0]) : 1; p.esc = esc;
    if (R.donde === 'agua') p.x = lado * ((R.dmin || 250) + r() * Math.max(80, borde - (R.dmin || 250) - 100));
    else { var ret = R.retirar || [0, 300]; p.x = lado * (borde + ret[0] + r() * (ret[1] - ret[0])); }
    p.rotY = r() * 6.2832;
    if (R.haciaAgua) p.rotY = lado > 0 ? Math.PI + (r() - 0.5) * 0.8 : (r() - 0.5) * 0.8;          // los inclinados, hacia el río (+X del modelo)
    if (R.tierraMenosZ) p.rotY = lado > 0 ? -Math.PI / 2 : Math.PI / 2;                              // las raíces: la tierra hacia fuera
    if (R.donde === 'orilla') p.y = Math.max(0, sueloEn(p.x, p.z)) - 3;                              // apoyado en el suelo de la orilla
    if (T.aves) { var q = r(); p.aves = q < 0.3 ? { tipo: 'guacamayo', n: 2 } : q < 0.6 ? { tipo: 'loro', n: 4 + (r() * 6 | 0) } : q < 0.75 ? { tipo: 'garza', n: 1 } : null; p.umbral = 600 + r() * 600; }
    return p;
  }
  // nada en el carril de la canoa (|x| < 150, más el tamaño de la planta)
  function carrilLibre(p) {
    var T = TIPOS[p.tipo]; if (!T || !T.familia) return;
    var R = VJ.REGLAS[T.familia] || {}; if (R.donde !== 'agua' && R.donde !== 'margen') return;
    var min = 150 + (T.radio || 60) * (p.esc || 1) * 0.9;
    if (Math.abs(p.x) < min) p.x = (p.x < 0 || (p.x === 0 && p.lado < 0) ? -1 : 1) * min;
  }
  function variante(fam, r) { var l = FAMILIAS[fam]; return l && l.length ? l[(r() * l.length) | 0] : null; }
  function sembrarHueco(clase, k, lado) {
    var r = semilla(hash(k + 100000, clase * 3 + lado + 7)), paso = clase === 0 ? HUECO : clase === 1 ? HUECO_AGUA : HUECO_NIEBLA;
    var z = k * paso + r() * paso * 0.8; if (z > VJ.FIN + 4000 || z < -LARGO) return null;
    var A = VJ.en(z), borde = bordeEn(z, lado), tipo, grupo = [];
    r();   // (consume el azar del borde del motor propio: así cada hueco elige lo mismo que antes)
    if (clase === 2) {
      if (r() > A.niebla * 0.85) return null;
      var pn = sacar('niebla'); pn.z = z; pn.x = (r() - 0.5) * 1400; pn.ancho = 1800 + r() * 1800; return [pn];
    }
    tipo = clase === 0 ? VJ.elegir(z, 'orillas', r) : (r() > 0.6 ? null : VJ.elegir(z, 'agua_obj', r));
    var puerto = clase === 0 && lado > 0 && z > 1500 && z < 9400;          // (Manaus: desde el río se ve el teatro por encima de la ciudad)
    if (puerto && tipo && tipo !== 'palmera-acai') tipo = null;
    if (puerto && tipo && r() < 0.6) tipo = null;
    if (tipo) {
      if (FAMILIAS[tipo] && /^(capim-flotante|juncos-agua|pistia|aninga)$/.test(tipo)) {   // en corros, no sembrado uniforme
        var m0 = colocarModelo(variante(tipo, r), lado, z, borde, r);
        if (m0) {
          grupo.push(m0); var nG = 1 + (r() * (tipo === 'pistia' ? 5 : 3) | 0), ab = tipo === 'aninga' ? 150 : tipo === 'pistia' ? 220 : 340;
          for (var gq = 0; gq < nG; gq++) { var mq = colocarModelo(variante(tipo, r), lado, m0.z + (r() - 0.5) * ab * 1.6, borde, r); if (mq) { mq.x = m0.x + (r() - 0.5) * ab; grupo.push(mq); } }
          grupo.forEach(carrilLibre);
        }
      }
      else if (FAMILIAS[tipo]) { var m = colocarModelo(variante(tipo, r), lado, z, borde, r); if (m) { carrilLibre(m); grupo.push(m); } }
      else if (tipo === 'kapok') {
        var pk = sacar('kapok'); pk.z = z; pk.lado = lado; pk.x = lado * (borde + 450 + r() * 400); pk.rotY = r() * 6.283; pk.esc = 0.85 + r() * 0.35; pk.y = Math.max(0, sueloEn(pk.x, pk.z)) - 6;
        var q = r(); pk.aves = q < 0.4 ? { tipo: 'guacamayo', n: 2 } : q < 0.8 ? { tipo: 'loro', n: 5 + (r() * 7 | 0) } : null; pk.umbral = 650 + r() * 600; grupo.push(pk);
      }
      else if (tipo === 'victoria' && FAMILIAS['victoria-hoja']) {   // un corro de hojas de Victoria, a veces con flor
        var cx0 = lado * (180 + r() * Math.max(200, borde - 400)), nh = 3 + (r() * 4 | 0);
        for (var h = 0; h < nh; h++) { var vh = colocarModelo(variante('victoria-hoja', r), lado, z + (r() - 0.5) * 380, borde, r); if (vh) { vh.x = cx0 + (r() - 0.5) * 420; grupo.push(vh); } }
        for (var nf = r() < 0.6 ? 2 : 1, kf = 0; kf < nf; kf++) { var vf = colocarModelo(variante('victoria-flor', r), lado, z + (r() - 0.5) * 260, borde, r); if (vf) { vf.x = cx0 + (r() - 0.5) * 260; grupo.push(vf); } }   // (Pau, 12/11) siempre hay flor: si no, el secreto no se encuentra
      }
      else if (tipo === 'camalotes') { var pc = sacar('camalotes'); pc.z = z; pc.lado = lado; pc.x = lado * (170 + r() * Math.max(200, borde - 500)); pc.voltear = r() < 0.5 ? -1 : 1; pc.y = 0; grupo.push(pc); }
    }
    if (clase === 0) {   // el sotobosque, las lianas y las raíces que acompañan
      var ns = Math.floor(A.sotobosque + r());
      for (var i = 0; i < ns; i++) { var so = colocarModelo(variante('sotobosque', r), lado, z + (r() - 0.5) * paso, borde, r); if (so) grupo.push(so); }
      if (puerto) return grupo.length ? grupo : null;
      if (r() < 0.25) { var li = colocarModelo(variante('liana-cortina', r), lado, z + (r() - 0.5) * paso, borde, r); if (li) grupo.push(li); }
      if (r() < 0.3) { var ra = colocarModelo(variante('raices-orilla', r), lado, z + (r() - 0.5) * paso, borde, r); if (ra) grupo.push(ra); }
      if (r() < 0.1) { var tc = colocarModelo(variante('tronco-caido', r), lado, z + (r() - 0.5) * paso, borde, r); if (tc) grupo.push(tc); }
      // (Three) la selva de detrás: un segundo árbol tierra adentro para que la orilla tenga fondo al mirar a los lados
      if (!puerto && r() < 0.55) { var f2 = VJ.elegir(z, 'orillas', r); if (f2 && FAMILIAS[f2] && /^arbol/.test(f2)) { var fondo = colocarModelo(variante(f2, r), lado, z + (r() - 0.5) * paso, borde + 700 + r() * 900, r); if (fondo) { fondo.fondo = true; grupo.push(fondo); } } }
    }
    return grupo.length ? grupo : null;
  }
  function sembrador() {
    var clases = [[HUECO, [-1, 1]], [HUECO_AGUA, [-1, 1]], [HUECO_NIEBLA, [0]]], vivos = {};
    for (var c = 0; c < 3; c++) {
      var paso = clases[c][0], k0 = Math.floor((camZ - LARGO * 0.6) / paso), k1 = Math.floor((camZ + LARGO) / paso);
      for (var k = k0; k <= k1; k++) for (var j = 0; j < clases[c][1].length; j++) {
        var lado = clases[c][1][j], clave = c + ':' + k + ':' + lado; vivos[clave] = 1;
        if (!(clave in huecos)) huecos[clave] = sembrarHueco(c, k, lado);
      }
    }
    VJ.FIJOS.forEach(function (f, i) {
      var clave = 'F:' + i;
      if (f.z > camZ - LARGO && f.z < camZ + LARGO + 4000) {
        vivos[clave] = 1;
        if (!(clave in huecos)) {
          var p = sacar(f.tipo); for (var k in f) if (k !== 'tipo') p[k] = f[k];
          if (f.tipo === 'kapok') p.y = Math.max(0, sueloEn(p.x, p.z)) - 6;
          if (f.suelo) p.y = Math.max(0, sueloEn(p.x, p.z)) - 3;
          if (TIPOS[f.tipo] && (f.tipo === 'kapok' || TIPOS[f.tipo].aves)) { p.aves = { tipo: 'guacamayo', n: 4 }; p.umbral = 900; }
          huecos[clave] = [p];
        }
      }
    });
    for (var cl in huecos) if (!vivos[cl]) { if (huecos[cl]) huecos[cl].forEach(soltarPieza); delete huecos[cl]; }
  }
  var salto = null, curioso = null, proxBoto = -1;
  var aves = [], parts = [], ecos = [];

  // ======================= Cámara, mando y ondas =======================
  var pitch = PITCH, pitchObj = PITCH, bloqueado = false, pedido = 0, remoS = 0, viajeIr = null, mirarAnim = null, ultLimite = -9;
  var oyentes = {};
  function emitir(n, d) { var l = oyentes[n]; if (!l) return; for (var i = 0; i < l.length; i++) { try { l[i](d); } catch (e) { console.error('evento ' + n, e); } } }
  var teclaGiro = 0, camZ = 0, camX = 0, yaw = 0, objX = 0, vel = 60, impulso = 0, teclaRemar = 0, arrastre = null, rumbo = 0, ultimoGiro = -99;
  var rayo = { f: 0, prox: 3 };
  var MAXV = 900, tiempo = 0, remada = 0, ladoRemo = 1, proxRemada = 0, golpe = null;
  var racha = { z: 0, f: 0, prox: 4 }, raton = null, sobre = null;
  var gotas = [];
  var base = { vaiven: 0 };
  function gota(x, z, fuerza, radio, propia, espuma) {
    if (gotas.length < 32) gotas.push([((x / SIM_TAM) % 1 + 1) % 1, ((z / SIM_TAM) % 1 + 1) % 1, fuerza, radio, espuma || 0]);
    if (fuerza > 8 && !propia && Math.hypot(x - camX, z - camZ) > 220) ecos.push({ x: x, z: z, f: fuerza, t: tiempo });      // la canoa lo notará cuando llegue la onda
  }
  function salpicar(x, z, n, fuerza) {
    for (var i = 0; i < n && parts.length < MAXP; i++) {
      var a = Math.random() * 6.283, v = (0.3 + Math.random()) * fuerza;
      parts.push({ tipo: 0, x: x, y: 1, z: z, vx: Math.cos(a) * v * 0.45, vz: Math.sin(a) * v * 0.45, vy: v * (0.9 + Math.random() * 0.8), tam: 0.9 + Math.random() * 1.3, rot: 0, vida: 3, alfa: 1 });
    }
  }
  // hasta qué altura se ve a esta distancia (para que lo que sale del árbol se vea)
  function techo(d) { return OJO + Math.max(60, d) * Math.tan(FOVY / 2 + PITCH) * 0.92; }
  function altoDe(p) { var T = TIPOS[p.tipo]; return (T ? T.alto : 600) * (p.esc || 1); }
  function anchoDe(p) { var T = TIPOS[p.tipo]; return (T && T.radio ? T.radio * 2 : 600) * (p.esc || 1); }
  function soltarHojas(p, n, punto) {
    var ancho = anchoDe(p), alto = Math.min(altoDe(p) * 0.8, techo(p.d));
    for (var i = 0; i < n && parts.length < MAXP; i++) {
      var px = punto ? punto[0] + (Math.random() - 0.5) * 70 : p.x + (Math.random() - 0.5) * ancho * 0.6, py = punto ? Math.max(30, punto[1] + (Math.random() - 0.3) * 60) : alto * (0.45 + Math.random() * 0.5), pz = punto ? punto[2] + (Math.random() - 0.5) * 40 + 30 : p.z + (Math.random() - 0.5) * 80;
      parts.push({ tipo: 1, x: px, y: py, z: pz,
        vx: (Math.random() - 0.5) * 30, vz: (Math.random() - 0.5) * 30, vy: -20, tam: 5 + Math.random() * 3.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, vida: 16, alfa: 1, tono: Math.floor(Math.random() * 9), fase: Math.random() * 6 });
    }
  }
  function despegar(p, susto, punto) {
    if (!p.volaron || punto) sonar('aves', { x: -(punto ? punto[0] : p.x), y: punto ? punto[1] : 500, z: punto ? punto[2] : p.z, tipo: p.aves && p.aves.tipo });
    var grupo = p.aves;
    if (!grupo || p.volaron) { if (!punto) return; grupo = Math.random() < 0.7 ? { tipo: 'loro', n: 3 + (Math.random() * 4 | 0) } : { tipo: 'garza', n: 1 }; }
    p.volaron = true;
    var huida = (p.x - camX) > 0 ? 1 : -1;
    if (punto) huida = (punto[0] - camX) * Math.cos(yaw) > 0 ? 1 : -1;
    for (var i = 0; i < grupo.n; i++) {
      var copa = punto ? Math.max(40, punto[1] + (Math.random() - 0.5) * 80) : Math.min(altoDe(p) * (0.62 + Math.random() * 0.25), techo(p.d || 600) * (0.45 + Math.random() * 0.35));
      aves.push({ tipo: grupo.tipo, x: (punto ? punto[0] : p.x) + (Math.random() - 0.5) * (punto ? 120 : 300), y: copa, z: (punto ? punto[2] : p.z) + (Math.random() - 0.5) * (punto ? 60 : 200),
        vx: -huida * (150 + Math.random() * 130), vy: 25 + Math.random() * 45, vz: 40 + Math.random() * 120,
        fase: Math.random() * 6.28, vida: 14, retraso: i * (0.08 + Math.random() * 0.25) + (susto ? 0 : Math.random() * 0.4) });
    }
  }
  function bandadaDetras() {   // garzas que cruzan el río a la espalda, por delante del sol que sale
    var n = 4 + (Math.random() * 6 | 0), lado = Math.random() < 0.5 ? -1 : 1, z = camZ - 2600 - Math.random() * 3000, y = 220 + Math.random() * 380;
    for (var i = 0; i < n; i++) aves.push({ tipo: 'garza', x: -lado * (2400 + i * 70 + Math.random() * 60), y: y + (Math.random() - 0.5) * 70 + i * 6, z: z + (Math.random() - 0.5) * 220 - i * 40, vx: lado * (210 + Math.random() * 25), vy: 0, vz: 10, fase: Math.random() * 6.28, vida: 30, retraso: i * 0.15, crucero: true, detras: true });
  }
  var proxDetras = 6;
  function bandada() {   // aves que cruzan el cielo a lo lejos, de vez en cuando
    var tipo = Math.random() < 0.5 ? 'loro' : (Math.random() < 0.5 ? 'garza' : 'guacamayo'), n = tipo === 'loro' ? 8 + (Math.random() * 8 | 0) : 2 + (Math.random() * 3 | 0);
    var lado = Math.random() < 0.5 ? -1 : 1, z = camZ + 1800 + Math.random() * 2600, y = 700 + Math.random() * 900;
    for (var i = 0; i < n; i++) aves.push({ tipo: tipo, x: centro(z) - lado * (2600 + i * 60), y: y + (Math.random() - 0.5) * 120, z: z + (Math.random() - 0.5) * 300, vx: lado * (230 + Math.random() * 40), vy: 0, vz: -20, fase: Math.random() * 6.28, vida: 26, retraso: 0, crucero: true });
  }

  function rayoDe(sx, sy) {
    var nx = sx / W * 2 - 1, ny = 1 - sy / H * 2;
    return [base.f[0] + base.r[0] * nx * base.tx + base.u[0] * ny * base.ty, base.f[1] + base.r[1] * nx * base.tx + base.u[1] * ny * base.ty, base.f[2] + base.r[2] * nx * base.tx + base.u[2] * ny * base.ty];
  }
  function alAgua(sx, sy) {
    if (!base.f) return null;
    var d = rayoDe(sx, sy); if (d[1] >= -0.002) return null;
    var t = -base.C[1] / d[1]; return { x: base.C[0] + d[0] * t, z: base.C[2] + d[2] * t, d: t };
  }
  function proyectar(x, y, z) {
    var dx = x - base.C[0], dy = y - base.C[1], dz = z - base.C[2];
    var vx = dx * base.r[0] + dy * base.r[1] + dz * base.r[2], vy = dx * base.u[0] + dy * base.u[1] + dz * base.u[2], vz = dx * base.f[0] + dy * base.f[1] + dz * base.f[2];
    return { x: (vx / vz / base.tx * 0.5 + 0.5) * W, y: (0.5 - vy / vz / base.ty * 0.5) * H, d: vz };
  }
  // ¿qué planta hay bajo el ratón? (la más cercana cuyo rectángulo en pantalla lo contiene): árboles, palmeras, lianas, arbustos y kapoks
  // (todo: también las casas, el embarcadero, las flores de Victoria, la samaúma y el teatro, que la interfaz necesita)
  function plantaEn(sx, sy, todo) {
    if (!base.f) return null;
    var mejor = null;
    for (var i = 0; i < piezas.length; i++) {
      var p = piezas[i], T = TIPOS[p.tipo]; if (!T || !(T.copa || (todo && T.tocable))) continue;
      if (!(p.d > CERCA && p.d < (T.lejos || 5000))) continue;
      var alto = altoDe(p), a = proyectar(p.x, p.y, p.z), b = proyectar(p.x, p.y + alto, p.z);
      if (a.d <= 0) continue;
      var mitad = Math.max(T.copa ? 0 : 16, anchoDe(p) / 2 * (a.y - b.y) / alto * (T.copa ? 0.8 : 1)), arriba = Math.min(b.y, a.y - 22);
      var dentro = sx > a.x - mitad && sx < a.x + mitad && sy < a.y + (T.copa ? 0 : 8) && sy > arriba + (a.y - arriba) * (T.copa ? 0.05 : 0);
      if (dentro && T.copa && alto > 400 && sy > b.y + (a.y - b.y) * 0.5) {     // por debajo de la copa solo cuenta el tronco
        var tronco = Math.max(7, mitad * 0.14); dentro = Math.abs(sx - a.x) < tronco;
      }
      if (dentro) {
        var dd = p.d - (p.samauma || p.tipo === 'teatro' ? 3000 : T.copa ? 0 : 400);   // lo que no es un árbol gana a la copa que tenga delante (el teatro, siempre)
        if (!mejor || dd < mejor.dd) mejor = { p: p, dd: dd };
      }
    }
    return mejor ? mejor.p : null;
  }
  addEventListener('wheel', function (e) {
    if (e.target && e.target.closest && e.target.closest('#am-ui') && !e.target.closest('canvas')) return;   // (Pau, 12/11) sobre el diario (o una tarjeta) la rueda desplaza el texto, no la canoa
    e.preventDefault(); if (bloqueado) return; pedido += Math.min(Math.abs(e.deltaY), 120) / 120 * (e.deltaY > 0 ? 1 : -1); impulso += Math.min(Math.abs(e.deltaY), 120) * (e.deltaY > 0 ? 1 : -1) * 2.2; }, { passive: false });
  addEventListener('keydown', function (e) { if (bloqueado) return; if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') teclaGiro = -1; if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') teclaGiro = 1; });
  addEventListener('keyup', function (e) { if (/^(ArrowLeft|ArrowRight|a|A|d|D)$/.test(e.key)) teclaGiro = 0; });
  addEventListener('keydown', function (e) { if (bloqueado) { teclaRemar = 0; return; } if (/^(ArrowUp|w|W| )$/.test(e.key)) { teclaRemar = 1; e.preventDefault(); } if (/^(ArrowDown|s|S)$/.test(e.key)) { teclaRemar = -1; e.preventDefault(); } });
  addEventListener('keyup', function (e) { if (/^(ArrowUp|w|W| |ArrowDown|s|S)$/.test(e.key)) teclaRemar = 0; });
  var vista = document.getElementById('vista'), ultToque = 0;
  function nombreDe(p) { return p.tipo === 'kapok' && p.samauma ? 'samauma' : p.tipo; }
  // (Pau, 12/11) tocar la canoa o lo que lleva no es tocar el agua: cada cosa responde a su manera
  var rayero = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  function tocarCanoa(sx, sy) {
    if (!CANOA) return false;
    _ndc.set(sx / W * 2 - 1, 1 - sy / H * 2); rayero.setFromCamera(_ndc, camara); rayero.far = 900;
    var lista = [CANOA]; if (REMO) lista.push(REMO);
    var hits = rayero.intersectObjects(lista, true);
    for (var i = 0; i < hits.length; i++) {
      var o = hits[i].object; if (o.isSprite) continue;
      var nombre = o === CANOA ? 'canoa' : o === REMO ? 'remo' : LORO && (o === LORO.malla || o === LORO.poste) ? 'loro' : o.userData && o.userData.nombre;
      if (FAROL && (o === FAROL.llama)) nombre = 'canoa-farol';
      if (!nombre) continue;
      reaccionCanoa(nombre, o, hits[i].point);
      emitir('clic', { x: sx, y: sy, agua: null, planta: null, objeto: { tipo: nombre, canoa: true } });
      sonar('canoa', { objeto: nombre, x: hits[i].point.x, y: hits[i].point.y, z: hits[i].point.z });
      return true;
    }
    return false;
  }
  function menear(me, tipo) { if (me && me.userData) me.userData.anim = { t: 0, tipo: tipo, eje: Math.random() < 0.5 ? 1 : -1 }; }
  function reaccionCanoa(nombre, o, punto) {
    var L = LORO, lx = -punto.x, lz = punto.z;            // el punto, en lógicas
    if (nombre === 'loro' && L) {
      // el loro: cada vez una cosa (te mira y ladea la cabeza, baila, se sacude, salta y aletea)
      L.toques = ((L.toques || 0) + 1) % 4;
      L.phiObj = L.phi + (Math.random() < 0.5 ? -1 : 1) * 2.6; L.rapido = 0.5; L.reacT = tiempo; L.aseo = -1;
      if (L.toques === 1) { L.ladeo = 0; L.ladeoS = Math.random() < 0.5 ? -1 : 1; L.excit = Math.max(L.excit, 0.5); L.aleteo = 0.3; }
      else if (L.toques === 2) { L.baile = tiempo + 3.2; }
      else if (L.toques === 3) { L.sacudida = 0; }
      else { L.proxSalto = 0; L.aleteo = 0.8; }
      L.proxMirar = tiempo + 3.5; sonarLoro('tocado');
      return;
    }
    if (nombre === 'remo') { if (Math.abs(vel) < 600) impulso += 340; return; }   // una palada
    if (nombre === 'canoa') {                              // un golpe en el casco: se mece un poco y tiembla el agua a los lados
      golpeCasco = { t: 0, lado: lx > camX ? 1 : -1 };
      for (var k = -1; k <= 1; k += 2) gota(camX + k * 24, lz, 2.2, 9, true);
      if (L) loroMira(lx, lz + 400, 'clic');
      return;
    }
    if (nombre === 'canoa-farol' && FAROL) {              // el farol: se enciende o se apaga (y se balancea en su asa)
      FAROL.manual = !(FAROL.nivel > 0.5); FAROL.chispa = tiempo;
      ENSERES.forEach(function (e) { if (e.userData.nombre === 'canoa-farol') menear(e, 'farol'); });
      return;
    }
    menear(o, /mochila/.test(nombre) ? 'salta' : /garrafa/.test(nombre) ? 'garrafa' : /red|cuerda/.test(nombre) ? 'blando' : 'golpe');
    if (/platanos/.test(nombre) && L) { L.phiObj = L.phi + 1.6 * (lx > camX ? 1 : -1); L.excit = 1; L.rapido = 0.4; L.reacT = tiempo; L.aleteo = 0.45; L.baile = tiempo + 1.6; sonarLoro('platanos'); }   // ¡los plátanos!
    else if (L && Math.random() < 0.6) loroMira(lx, lz + 300, 'clic');
  }
  function vivirEnseres(dt) {
    for (var i = 0; i < ENSERES.length; i++) {
      var me = ENSERES[i], u = me.userData, a = u.anim; if (!a) continue;
      a.t += dt; var t = a.t, e, rx = 0, rz = 0, sy = 1, ty = 0;
      if (a.tipo === 'salta') { ty = t < 0.32 ? Math.sin(t / 0.32 * Math.PI) * u.alto * 0.18 : 0; e = Math.exp(-Math.max(0, t - 0.32) * 7); sy = 1 - 0.1 * e * Math.cos((t - 0.32) * 26) * (t > 0.32 ? 1 : 0); rz = a.eje * 0.12 * Math.exp(-t * 3) * Math.sin(t * 11); }
      else if (a.tipo === 'garrafa') { e = Math.exp(-t * 1.6); rz = a.eje * 0.22 * e * Math.sin(t * 7.5); rx = 0.06 * e * Math.sin(t * 5.3); }
      else if (a.tipo === 'blando') { e = Math.exp(-t * 4); sy = 1 - 0.18 * e * Math.cos(t * 14); rz = a.eje * 0.05 * e * Math.sin(t * 9); }
      else if (a.tipo === 'farol') { e = Math.exp(-t * 1.3); rx = 0.16 * e * Math.sin(t * 6.2); rz = a.eje * 0.05 * e * Math.sin(t * 4.1); }
      else { e = Math.exp(-t * 5); rz = a.eje * 0.14 * e * Math.sin(t * 22); ty = 0.8 * e * Math.abs(Math.sin(t * 22)); }
      if (t > 4) { u.anim = null; me.matrix.copy(u.base); continue; }
      var pv = a.tipo === 'farol' ? new THREE.Vector3(u.pie.x, u.pie.y + u.alto, u.pie.z) : u.pie;   // el farol cuelga de su asa
      _m4b.makeTranslation(pv.x, pv.y + ty, pv.z);
      _eu.set(rx, 0, rz, 'XYZ'); _m4c.makeRotationFromEuler(_eu); _m4b.multiply(_m4c);
      _m4c.makeScale(1 + (1 - sy) * 0.5, sy, 1 + (1 - sy) * 0.5); _m4b.multiply(_m4c);
      _m4c.makeTranslation(-pv.x, -pv.y, -pv.z); _m4b.multiply(_m4c);
      me.matrix.copy(u.base).multiply(_m4b); me.matrixWorldNeedsUpdate = true;
    }
  }
  var _m4b = new THREE.Matrix4(), _m4c = new THREE.Matrix4();
  // (Pau, 12/11: «que todo reaccione y todo tenga sonido») los objetos del río y de las orillas
  function reaccionObjeto(p) {
    var n = p.tipo, flota = /^(barco|gasolinera|puesto|rabeta|canoa-atada|boya|casa-flotante|red-pesca)/.test(n);
    if (flota) {                                  // lo que flota se mece y hace ondas
      p.mece = tiempo;
      for (var k = 0; k < 6; k++) { var an = k / 6 * 6.283, rr = anchoDe(p) * 0.45; gota(p.x + Math.cos(an) * rr, p.z + Math.sin(an) * rr, 3, 10); }
    }
    if (/^victoria-flor/.test(n)) gota(p.x, p.z, 4, 8);
    if (LORO && Math.random() < 0.5) loroMira(p.x, p.z, 'clic');
    sonar('objeto', { tipo: n, x: -p.x, y: (p.y || 0) + Math.min(400, altoDe(p) * 0.5), z: p.z });
    emitir('objeto', { tipo: n, x: p.x, z: p.z });
  }
  // los animales también se pueden tocar: el caimán se hunde, la garza se va volando, el mono salta (y aúlla)
  function tocarCriatura(sx, sy) {
    var mejor = null, md = 1e9;
    for (var i = 0; i < criaturas.length; i++) {
      var c = criaturas[i], Cc = CRIA[c.tipo]; if (!Cc || c.estado === 'fuera' || c.estado === 'vuela') continue;
      var q = proyectar(c.x, c.y + Cc.alto * 0.5, c.z); if (q.d <= 0) continue;
      var rpx = Math.max(28, Math.max(Cc.alto, Cc.largo) * 0.6 / q.d / base.ty * 0.5 * H), dd = Math.hypot(q.x - sx, q.y - sy);
      if (dd < rpx && q.d < md) { md = q.d; mejor = c; }
    }
    if (!mejor) return false;
    var c2 = mejor;
    if (c2.tipo === 'caiman') { c2.estado = 'hunde'; c2.t = 0; gota(c2.x, c2.z, 12, 14); sonar('chapoteo', { x: -c2.x, z: c2.z, fuerza: 1.5 }); loroMira(c2.x, c2.z, 'caiman'); }
    else if (c2.tipo === 'garza') { c2.estado = 'vuela'; c2.t = 0; var hu = c2.x > camX ? 1 : -1; aves.push({ tipo: 'garza', x: c2.x, y: c2.y + 30, z: c2.z, vx: hu * 160, vy: 70, vz: 80, fase: 0, vida: 16, retraso: 0 }); gota(c2.x, c2.z, 3, 6); sonar('aves', { x: -c2.x, y: c2.y + 40, z: c2.z, tipo: 'garza' }); }
    else if (c2.tipo === 'mono') { c2.estado = 'salta'; c2.t = 0; c2.x0 = c2.x; c2.y0 = c2.y; c2.z0 = c2.z; c2.dir = (c2.x > camX ? 1 : -1); sonar('monos', { x: -c2.x, y: c2.y, z: c2.z }); }
    else if (c2.tipo === 'ribereno') { c2.remo = 0; sonar('remada', { x: -c2.x, z: c2.z }); }
    emitir('criatura', { tipo: c2.tipo });
    return true;
  }
  function tocar(sx, sy, fuerte) {
    if (tocarCanoa(sx, sy)) return;
    var a = alAgua(sx, sy), pl = plantaEn(sx, sy, true);
    if (pl && a && a.d < pl.d) pl = null;
    emitir('clic', { x: sx, y: sy, agua: a ? { x: a.x, z: a.z } : null, planta: pl ? nombreDe(pl) : null,
      objeto: pl ? { tipo: nombreDe(pl), x: pl.x, z: pl.z, samauma: !!pl.samauma } : null });
    if (pl && TIPOS[pl.tipo] && TIPOS[pl.tipo].copa) {      // sacudir un árbol: tiembla, caen hojas, salen los pájaros
      var rr = rayoDe(sx, sy), punto = [base.C[0] + rr[0] * pl.d, base.C[1] + rr[1] * pl.d, base.C[2] + rr[2] * pl.d];
      pl.empuje = 2.4; soltarHojas(pl, /^sotobosque/.test(pl.tipo) ? 8 : 16, punto); despegar(pl, true, punto); asustarMonos(pl);
      sonar('arbol', { x: -punto[0], y: punto[1], z: punto[2], grande: altoDe(pl) > 900 }); return;
    }
    if (pl) { reaccionObjeto(pl); return; }
    if (tocarCriatura(sx, sy)) return;
    if (a) loroMira(a.x, a.z, 'clic');
    // (Pau, 12/11) tocar una mata del agua (juncos, capim, aninga, lechuga de agua): se agita, no salta hacia arriba
    if (a) {
      var mata = null, dm = 1e9;
      for (var i = 0; i < piezas.length; i++) { var q = piezas[i]; if (!/^(capim-flotante|juncos-agua|aninga|pistia|juncos)/.test(q.tipo)) continue; var dq = Math.hypot(q.x - a.x, q.z - a.z), rq = Math.max(70, anchoDe(q) * 0.55); if (dq < rq && dq < dm) { dm = dq; mata = q; } }
      if (mata) {
        mata.empuje = 5; sonar('mata', { x: -mata.x, z: mata.z });
        for (var k = 0; k < 5; k++) { var an = Math.random() * 6.283, rr2 = anchoDe(mata) * 0.35 * Math.random(); gota(mata.x + Math.cos(an) * rr2, mata.z + Math.sin(an) * rr2, 1.6, 6); }   // solo un temblor en el agua alrededor
        return;
      }
    }
    if (a && a.d < 950) {
      gota(a.x, a.z, fuerte || 26, 9); salpicar(a.x, a.z, 22, 170); sonar('agua', { x: -a.x, z: a.z, fuerza: 1 });
      if (!salto && !curioso && AMBIENTE && AMBIENTE.tramo.id === 'atardecer' && Math.random() < 0.6) curioso = { t: tiempo + 1.2 + Math.random() * 1.6, x: a.x, z: a.z };   // a los botos les puede la curiosidad
    }
  }
  vista.addEventListener('pointerdown', function (e) { if (bloqueado) return; arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, modo: null }; vista.setPointerCapture(e.pointerId); vista.classList.add('arrastra'); });
  vista.addEventListener('pointermove', function (e) {
    raton = { x: e.clientX, y: e.clientY };
    if (arrastre) {
      var dx = e.clientX - arrastre.x, dy = arrastre.y - e.clientY; arrastre.x = e.clientX; arrastre.y = e.clientY;
      if (!arrastre.modo && Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) > 8) arrastre.modo = 'mirar';
      // (Pau, 12/11) el ratón solo sirve para mirar y tocar: arrastrar a los lados gira la vista 360°, arriba y abajo
      // asoma la cabeza (de −43° a +20°), como si se agarrara el mundo. Remar: solo flechas / W S y la rueda.
      if (arrastre.modo === 'mirar') { rumbo -= dx * 0.0052; pitchObj = Math.max(-0.75, Math.min(0.35, pitchObj - dy * 0.004)); ultimoGiro = tiempo; }
    }
    var ahora = performance.now();
    if (ahora - ultToque > 40) { var a = alAgua(e.clientX, e.clientY); if (a && a.d < 700) { gota(a.x, a.z, arrastre ? 5 : 2.2, 7); ultToque = ahora; } }
  });
  function soltar(e) { if (arrastre && !arrastre.modo && e && e.type === 'pointerup' && !bloqueado) tocar(e.clientX, e.clientY); if (arrastre && arrastre.modo === 'mirar') ultimoGiro = tiempo; arrastre = null; vista.classList.remove('arrastra'); }
  vista.addEventListener('pointerup', soltar); vista.addEventListener('pointercancel', soltar);
  vista.addEventListener('pointerleave', function () { raton = null; });

  // en pantallas táctiles (sin rueda ni teclas): dos botones ▲ ▼ para remar, con el estilo de la interfaz
  (function botonesRemo() {
    if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches) && !/[?&]tactil\b/.test(location.search)) return;
    var st = document.createElement('style');
    st.textContent = '#am-remo{position:fixed;right:calc(var(--am-margen,30px) + 8px);bottom:calc(var(--am-margen,30px) + 44px);z-index:21;display:flex;flex-direction:column;gap:8px;touch-action:none}' +
      '#am-remo button{width:58px;height:58px;border:1px solid var(--am-linea,rgba(243,230,207,.2));background:var(--am-velo,rgba(20,15,10,.74));color:var(--am-hueso,#f3e6cf);' +
      'font:500 18px/1 var(--am-mono,monospace);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);cursor:pointer;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
      '#am-remo button.am-pulsado{border-color:var(--am-acento,#ffb347);color:var(--am-acento,#ffb347)}' +
      '.am-en-escena #am-remo{opacity:.25;pointer-events:none}';
    document.head.appendChild(st);
    var caja = document.createElement('div'); caja.id = 'am-remo'; caja.setAttribute('aria-label', 'Remar');
    [['▲', 1, 'Remar río arriba'], ['▼', -1, 'Remar río abajo']].forEach(function (b) {
      var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = b[0]; bt.setAttribute('aria-label', b[2]);
      var soltarB = function (e) { if (e) e.preventDefault(); if (teclaRemar === b[1]) teclaRemar = 0; bt.classList.remove('am-pulsado'); };
      bt.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (bloqueado) return; teclaRemar = b[1]; bt.classList.add('am-pulsado'); bt.setPointerCapture(e.pointerId); });
      bt.addEventListener('pointerup', soltarB); bt.addEventListener('pointercancel', soltarB); bt.addEventListener('lostpointercapture', soltarB);
      caja.appendChild(bt);
    });
    document.body.appendChild(caja);
  })();

  // la cámara: misma base que el motor propio (lógica) y su gemela en Three
  function camaraDe(balanceo) {
    var pit = pitch + balanceo;
    var cp = Math.cos(pit), sp = Math.sin(pit), cy = Math.cos(yaw), sy = Math.sin(yaw);
    var f = [sy * cp, sp, cy * cp], r = [cy, 0, -sy];
    var u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    var C = [camX, OJO + base.vaiven, camZ];
    base.f = f; base.r = r; base.u = u; base.C = C;
    base.ty = Math.tan(FOVY / 2); base.tx = base.ty * W / H;
    camara.position.set(-C[0], C[1], C[2]);
    camara.up.set(0, 1, 0);
    camara.lookAt(-C[0] - f[0], C[1] + f[1], C[2] + f[2]);
    camara.updateMatrixWorld();
  }
  // la cámara espejo (bajo el agua, mirando hacia arriba) con el plano de recorte oblicuo en y = 0, como el Reflector de Three
  var _v = new THREE.Vector3(), _t = new THREE.Vector3(), _up = new THREE.Vector3(), _rot = new THREE.Matrix4(), _plano = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
  function camaraEspejo() {
    espejo.aspect = camara.aspect; espejo.fov = camara.fov; espejo.near = camara.near; espejo.far = camara.far;
    _rot.extractRotation(camara.matrixWorld);
    _t.set(0, 0, -1).applyMatrix4(_rot).add(camara.position);
    _up.set(0, 1, 0).applyMatrix4(_rot);
    espejo.position.set(camara.position.x, -camara.position.y, camara.position.z);
    _t.y = -_t.y; _up.y = -_up.y;
    espejo.up.copy(_up); espejo.lookAt(_t);
    espejo.updateMatrixWorld(); espejo.projectionMatrix.copy(camara.projectionMatrix);
    matRefl.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    matRefl.multiply(espejo.projectionMatrix); matRefl.multiply(espejo.matrixWorldInverse);
    _plano.setFromNormalAndCoplanarPoint(_v.set(0, 1, 0), _t.set(0, 0, 0));
    _plano.applyMatrix4(espejo.matrixWorldInverse);
    _clip.set(_plano.normal.x, _plano.normal.y, _plano.normal.z, _plano.constant);
    var P = espejo.projectionMatrix.elements;
    _q.x = (Math.sign(_clip.x) + P[8]) / P[0]; _q.y = (Math.sign(_clip.y) + P[9]) / P[5]; _q.z = -1.0; _q.w = (1.0 + P[10]) / P[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    P[2] = _clip.x; P[6] = _clip.y; P[10] = _clip.z + 1.0 - 0.003; P[14] = _clip.w;
    espejo.projectionMatrixInverse.copy(espejo.projectionMatrix).invert();
  }

  // ======================= Vida =======================
  function vivir(dt) {
    // ráfagas de viento: nacen lejos y vienen hacia ti por el río
    racha.prox -= dt;
    if (racha.prox <= 0 && racha.f < 0.05) { racha.z = camZ + 7000; racha.f = 0.7 + Math.random() * 0.5; racha.prox = 9 + Math.random() * 10; }
    if (racha.f > 0) { racha.z -= 1300 * dt; if (racha.z < camZ - 800) racha.f = 0; }
    // insectos que tocan el agua y peces que saltan
    if (Math.random() < dt * 7) { var dz = 120 + Math.random() * 700, z = camZ + dz; gota(centro(z) + (Math.random() - 0.5) * 900, z, 0.7 + Math.random() * 1.2, 2.6); }
    if (Math.random() < dt * 0.35) { var dz2 = 250 + Math.random() * 600, z2 = camZ + dz2, x2 = centro(z2) + (Math.random() - 0.5) * 800; gota(x2, z2, 9, 6); salpicar(x2, z2, 8, 110); }
    // el delfín curioso viene donde has chapoteado
    // (Pau, 12/11) los botos: solo en el Encuentro y al atardecer, uno cada 25–40 s; casi siempre asoman a respirar
    // y se hunden (el arco bajo); un saltito, solo 1 de cada 6. El «boto curioso» que contesta a los chapoteos, solo al atardecer.
    var tramoD = AMBIENTE && AMBIENTE.tramo.id, conBotos = tramoD === 'encuentro' || tramoD === 'atardecer';
    if (curioso && tiempo > curioso.t) {
      var dd = curioso.z - camZ;
      if (tramoD === 'atardecer' && dd > 260 && dd < 1100 && !salto) nuevoSalto(curioso.x, curioso.z + 40, Math.random() < 1 / 6);
      curioso = null;
    }
    if (proxBoto < 0) proxBoto = tiempo + 12 + Math.random() * 15;
    if (!salto && conBotos && tiempo > proxBoto) {
      var zr = 420 + Math.random() * 700, lado = Math.random() < 0.5 ? -1 : 1;
      nuevoSalto(centro(camZ + zr) + lado * (200 + Math.random() * 260), camZ + zr, Math.random() < 1 / 6);
      proxBoto = tiempo + 25 + Math.random() * 15;
    }
    if (!conBotos) proxBoto = Math.max(proxBoto, tiempo + 8);
    // aves
    if (Math.random() < dt * 0.07) bandada();
    for (var i = aves.length - 1; i >= 0; i--) {
      var a = aves[i], A = AVES[a.tipo];
      if (a.retraso > 0) { a.retraso -= dt; continue; }
      a.vida -= dt; a.fase += dt * A.ale * 6.283;
      if (!a.crucero) { a.vy = Math.max(-10, a.vy - 30 * dt); a.vx *= 1 - dt * 0.05; }
      a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
      if (a.vida <= 0 || a.z < camZ - 6000 || a.z > camZ + 30000) aves.splice(i, 1);   // (12/11) también se ven si te giras
    }
    // partículas: gotas que caen y hacen ondas, hojas que planean y flotan
    for (i = parts.length - 1; i >= 0; i--) {
      var q = parts[i]; q.vida -= dt;
      if (q.tipo === 3) { q.x += q.vx * dt; q.y += q.vy * dt; if (q.y < 0) { parts.splice(i, 1); continue; } }
      else if (q.tipo === 7 || q.tipo === 8) moverAire(q, dt);
      else if (q.tipo === 4) { q.x += q.vx * dt + Math.sin(tiempo * 1.7 + q.rot) * 6 * dt; q.y += q.vy * dt + Math.cos(tiempo * 1.3 + q.rot) * 5 * dt; q.z += q.vz * dt; q.alfa = Math.max(0, Math.sin(tiempo * 2.3 + q.rot * 3.0)) * Math.min(1, q.vida); }
      else if (q.tipo === 2) { q.vy -= 60 * dt; q.vx *= 1 - dt * 1.5; q.vz *= 1 - dt * 1.5; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.tam += dt * 18; q.alfa = 0.55 * Math.max(0, q.vida / 1.6); }
      else if (q.tipo === 6) {
        q.vy -= G * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.alfa = 0.75 * Math.min(1, q.vida * 3);
        if (q.y < 0) { if (Math.random() < 0.25) gota(q.x, q.z, 0.5, 3, true, 0.25); parts.splice(i, 1); continue; }
      }
      else if (q.tipo === 0) {
        q.vy -= G * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
        if (q.y < 0) { if (Math.random() < 0.35) gota(q.x, q.z, 0.9, 2.5); parts.splice(i, 1); continue; }
      } else {
        if (q.y > 0) {
          q.fase += dt * 2.4; q.vy = -34 + Math.sin(q.fase) * 16; q.x += (q.vx + Math.cos(q.fase) * 28) * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.rot += q.vr * dt;
          if (q.y <= 0) { q.y = 0.4; gota(q.x, q.z, 1.6, 3); q.vida = Math.min(q.vida, 6); }
        } else { q.z -= 26 * dt; q.alfa = Math.min(1, q.vida / 2); }
      }
      if (q.vida <= 0 || Math.abs(q.z - camZ) > 6000 || q.y < -5) parts.splice(i, 1);   // (12/11) lo de detrás también se ve al girarse
    }
  }

  // ======================= El delfín =======================
  // El boto sale del agua en arco: primero el pico y el melón, resopla, enseña el lomo y la aleta y vuelve a entrar.
  function nuevoSalto(x, z, alto) {
    setTimeout(function () { sonar('boto', { x: -x, z: z }); }, 450);
    var L = 100, cima = alto ? 38 : 9, R = L * (alto ? 1.05 : 1.5), Cy = cima - R, phE = Math.acos(Math.max(-1, Math.min(1, -Cy / R)));
    var lado = (x - camX) > 0 ? -1 : 1, a = (Math.random() - 0.5) * 1.1, d = [Math.cos(a) * lado, Math.sin(a)];
    var med = L / 2 / R, ph0 = -phE - med - 0.08, ph1 = phE + med + 0.08;
    salto = { C: [x, Cy, z], d: d, R: R, phE: phE, ph0: ph0, ph1: ph1, ph: ph0, vel: (alto ? 280 : 190) / R, fase: 0, alto: alto, fuera: false, colaFuera: false, visible: false };
  }
  function puntoArco(ph) { var s = salto; return [s.C[0] + s.R * Math.sin(ph) * s.d[0], s.C[1] + s.R * Math.cos(ph), s.C[2] + s.R * Math.sin(ph) * s.d[1]]; }
  // (Pau, 12/11: «es bastante falso cómo sale y el agua que saca») el agua sigue al cuerpo: donde lo corta hay olitas y
  // espuma (no una ola de golpe en forma de disco); al salir, la cabeza arrastra una lámina de agua que cae en hilos;
  // fuera, le chorrea; al entrar, una corona de salpicaduras, el golpe de la cola, espuma y una nube de gotitas
  function chorro(x, y, z, vx, vy, vz, tam, vida) {
    if (parts.length < MAXP) parts.push({ tipo: 6, x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, tam: tam * 0.75, rot: 0, vida: vida || 2.5, alfa: 0.5 });
  }
  function tangente(ph) { var s = salto; return [Math.cos(ph) * s.d[0], -Math.sin(ph), Math.cos(ph) * s.d[1]]; }
  function actualizarSalto(dt) {
    if (!salto) return;
    var s = salto, med = 50 / s.R;
    // más despacio arriba (como un cuerpo lanzado), más rápido al cortar el agua
    var ritmoArco = 0.72 + 0.4 * Math.min(1, Math.abs(Math.sin(s.ph)) / Math.sin(s.phE + 0.001));
    s.ph += s.vel * dt * ritmoArco; s.fase += dt * (s.alto ? 9 : 6);
    var cabeza = s.ph + med, cola = s.ph - med, vCuerpo = s.vel * s.R * ritmoArco;
    s.visible = cabeza > -s.phE && cola < s.phE;
    var entra = puntoArco(-s.phE), sale = puntoArco(s.phE), lat = [s.d[1], -s.d[0]];
    var fuerte = s.alto ? 1 : 0.55;
    // saliendo: el cuerpo corta el agua por «entra»
    if (cabeza > -s.phE && cola < -s.phE) {
      var Te = tangente(-s.phE);
      for (var k = -1; k <= 1; k += 2) gota(entra[0] + lat[0] * 9 * k, entra[2] + lat[1] * 9 * k, 1.4 + fuerte, 7, false, 0.22);
      for (var j = 0; j < (s.alto ? 6 : 3); j++) {            // la lámina de agua que sube con el cuerpo
        var l = (Math.random() - 0.5) * 22, v = vCuerpo * (0.35 + Math.random() * 0.5);
        chorro(entra[0] + lat[0] * l, 2 + Math.random() * 4, entra[2] + lat[1] * l, Te[0] * v + lat[0] * l * 1.2, Math.abs(Te[1]) * v + 20, Te[2] * v + lat[1] * l * 1.2, 0.7 + Math.random() * 1.1);
      }
    }
    // entrando: corta el agua por «sale»
    if (cabeza > s.phE && cola < s.phE) {
      var Ts = tangente(s.phE);
      for (k = -1; k <= 1; k += 2) gota(sale[0] + lat[0] * 9 * k, sale[2] + lat[1] * 9 * k, 1.6 + fuerte, 7, false, 0.3);
      for (j = 0; j < (s.alto ? 5 : 2); j++) {                // salta agua hacia arriba y hacia atrás
        var l2 = (Math.random() - 0.5) * 26, v2 = vCuerpo * (0.15 + Math.random() * 0.3);
        chorro(sale[0] + lat[0] * l2, 2, sale[2] + lat[1] * l2, -Ts[0] * v2 + lat[0] * l2 * 1.5, 50 + Math.random() * 90 * fuerte, -Ts[2] * v2 + lat[1] * l2 * 1.5, 0.6 + Math.random() * 1.0);
      }
    }
    // fuera del agua: le chorrea agua del cuerpo (los primeros instantes, cada vez menos)
    if (s.visible && s.fuera) {
      var mojado = Math.max(0, 1 - (s.ph - (-s.phE)) / (s.phE * 1.6));
      if (Math.random() < mojado * (s.alto ? 1.6 : 0.8)) {
        var u = s.ph + (Math.random() - 0.5) * 2 * med, p = puntoArco(u), T = tangente(u);
        if (p[1] > 4) chorro(p[0] + lat[0] * (Math.random() - 0.5) * 12, p[1], p[2] + lat[1] * (Math.random() - 0.5) * 12, T[0] * vCuerpo * 0.5, T[1] * vCuerpo * 0.3 - 10, T[2] * vCuerpo * 0.5, 0.5 + Math.random() * 0.7);
      }
    }
    if (!s.fuera && cabeza > -s.phE) {        // asoma la cabeza: un borbotón, la lámina y el resoplido
      s.fuera = true; gota(entra[0], entra[2], s.alto ? 7 : 4.5, 12, false, 0.6);
      var Te2 = tangente(-s.phE);
      for (j = 0; j < (s.alto ? 26 : 12); j++) { var a1 = Math.random() * 6.283, r1 = 6 + Math.random() * 12, vv = 40 + Math.random() * 100 * fuerte;
        chorro(entra[0] + Math.cos(a1) * r1, 1.5, entra[2] + Math.sin(a1) * r1, Math.cos(a1) * vv * 0.25 + Te2[0] * vCuerpo * 0.3, vv * 1.1, Math.sin(a1) * vv * 0.25 + Te2[2] * vCuerpo * 0.3, 0.6 + Math.random() * 1.2); }
      var hx = entra[0], hz = entra[2];
      setTimeout(function () { resoplar(hx + s.d[0] * 30, hz + s.d[1] * 30); }, 180);
    }
    if (!s.colaFuera && cola > s.phE) {       // entra la cola: golpe de aleta, corona de salpicaduras y espuma
      s.colaFuera = true; gota(sale[0], sale[2], s.alto ? 10 : 6, 13, false, 0.9);
      for (j = 0; j < (s.alto ? 60 : 26); j++) { var a2 = Math.random() * 6.283, r2 = 8 + Math.random() * 14, v3 = (60 + Math.random() * 130) * fuerte, sube = 0.8 + Math.random() * 0.9;
        chorro(sale[0] + Math.cos(a2) * r2, 2, sale[2] + Math.sin(a2) * r2, Math.cos(a2) * v3 * 0.3, v3 * sube, Math.sin(a2) * v3 * 0.3, 0.6 + Math.random() * 1.2); }
      sonar('chapoteo', { x: -sale[0], z: sale[2], fuerza: s.alto ? 1.2 : 0.7 });
    }
    if (s.ph > s.ph1) salto = null;
  }
  function resoplar(x, z) {   // (Pau, 12/11: «parece que fuma») el soplido: un chorrito corto de gotitas que sube y cae, sin nube
    for (var i = 0; i < 34; i++) { var a = Math.random() * 6.283, r = Math.random() * 3, v = 90 + Math.random() * 110;
      chorro(x + Math.cos(a) * r, 10, z + Math.sin(a) * r, Math.cos(a) * (8 + Math.random() * 22), v, Math.sin(a) * (8 + Math.random() * 22), 0.35 + Math.random() * 0.45, 1.6); }
  }


  // ======================= Frutos que caen al agua (el secreto del igapó los pide con efecto('fruto')) =======================
  var frutos = [], frutoGeo = new THREE.SphereGeometry(5.5, 14, 10), frutoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(0.09, 0.045, 0.02), roughness: 0.45 });
  function efectoFruto(d) {
    var m = new THREE.Mesh(frutoGeo, frutoMat); m.castShadow = true; escena.add(m);
    var x = d.x != null ? d.x : camX + (Math.random() - 0.5) * 300, z = d.z != null ? d.z : camZ + 600;
    frutos.push({ m: m, x: x, z: z, y: 260 + Math.random() * 140, vy: 0, agua: false, t: 0, giro: Math.random() * 6 });
  }
  function vivirFrutos(dt) {
    for (var i = frutos.length - 1; i >= 0; i--) {
      var f = frutos[i];
      if (!f.agua) {
        f.vy -= G * dt; f.y += f.vy * dt;
        if (f.y <= 2) { f.agua = true; f.y = 0; gota(f.x, f.z, 26, 8); salpicar(f.x, f.z, 14, 120); emitir('fruto', { x: f.x, z: f.z }); }
      } else { f.t += dt; f.y = 1.5 - Math.min(1, f.t / 5) * 9 + Math.sin(f.t * 3) * 0.6; f.z -= 20 * dt; }
      f.m.position.set(-f.x, f.y, f.z); f.m.rotation.y = f.giro + f.t;
      if (f.t > 6) { escena.remove(f.m); frutos.splice(i, 1); }
    }
  }

  // ======================= El Teatro Amazonas: la cúpula de azulejos asoma entre la bruma del puerto =======================
  // Hecho por código: el edificio rosado neoclásico con columnas y la cúpula de escamas verdes, amarillas, azules y blancas.
  // Tamaño real: unos 60 m de ancho y 50 m hasta la linterna (2500 × 2085 u). Si llega el GLB 'teatro-amazonas'
  // (Blender, fachada hacia +Z, Y arriba) se usa ese; si no, el de código.
  var TEATRO = { gx: 3600, gz: 6700, ancla: [595.3, 329.4, -410.7], x: 4195, z: 7110, rotY: -Math.PI / 2 - 0.35, y: 330, ALTO: 2085, ANCHO: 2500 };
  VJ.FIJOS.push({ tipo: 'teatro', x: TEATRO.x, z: TEATRO.z, rotY: TEATRO.rotY, y: TEATRO.y });   // (x, z) = el teatro; la ciudad va en (gx, gz)
  TIPOS.teatro = { alto: TEATRO.ALTO, radio: TEATRO.ANCHO * 0.5, tocable: true, lejos: 14000 };
  function teatroGLB() {
    var g0 = GLTF['teatro-amazonas']; if (!g0) return null;
    var g = new THREE.Group(), m = g0.scene; m.updateMatrixWorld(true);
    var caja = new THREE.Box3().setFromObject(m), tam = new THREE.Vector3(); caja.getSize(tam);
    var gc = GLTF['ciudad-ladera'];
    if (gc) {
      // el centro histórico de Manaus en terrazas (muro, escalinata, casas coloniales, la iglesia) y el teatro en lo alto de la meseta
      TEATRO.ciudad = true;
      var c = gc.scene; g.add(c);
      m.position.set(TEATRO.ancla[0], TEATRO.ancla[1], TEATRO.ancla[2]); g.add(m);
      TIPOS.teatro.alto = tam.y + TEATRO.ancla[1]; TIPOS.teatro.radio = Math.max(tam.x, tam.z) * 0.42;
    } else {
      var esc = TEATRO.ALTO / Math.max(1e-6, tam.y), cen = new THREE.Vector3(); caja.getCenter(cen);
      m.position.set(-cen.x * esc, -caja.min.y * esc, -cen.z * esc); m.scale.setScalar(esc); g.add(m);
      TIPOS.teatro.alto = tam.y * esc; TIPOS.teatro.radio = Math.max(tam.x, tam.z) * esc * 0.5;
    }
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { o.material.envMapIntensity = 1; if (o.geometry.attributes.color) o.material.vertexColors = true; } } });
    return g;
  }
  function prepararTeatro() {
    var gl = teatroGLB();
    if (gl) { gl.visible = false; escena.add(gl); TEATRO.g = gl; return; }
    var g = new THREE.Group();
    function col(r, gg, b) { return new THREE.Color().setRGB(r, gg, b, THREE.SRGBColorSpace); }
    var rosa = new THREE.MeshStandardMaterial({ color: col(0.86, 0.66, 0.60), roughness: 0.85 });
    var blanco = new THREE.MeshStandardMaterial({ color: col(0.90, 0.86, 0.80), roughness: 0.7 });
    var piedra = new THREE.MeshStandardMaterial({ color: col(0.36, 0.33, 0.29), roughness: 0.95 });
    function caja(w, h, d, x, y, z, m) { var b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); g.add(b); return b; }
    var loma = new THREE.MeshStandardMaterial({ color: col(0.16, 0.19, 0.11), roughness: 1 });
    var lm = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), loma); lm.scale.set(2400, 560, 1900); lm.position.set(0, -330, 0); g.add(lm);   // la loma de la ciudad, con árboles (el teatro está en alto)
    caja(1900, 330, 1300, 0, -30, 0, piedra);                 // la escalinata
    caja(1700, 60, 1150, 0, 300, 0, piedra);
    caja(1500, 420, 900, 0, 360, -40, rosa);                  // el cuerpo
    caja(1540, 40, 940, 0, 780, -40, blanco);                 // la cornisa
    caja(1300, 260, 760, 0, 820, -60, rosa);                  // el piso de arriba
    caja(1340, 34, 800, 0, 1080, -60, blanco);
    // el pórtico de columnas, de cara al río (+Z del edificio)
    var fuste = new THREE.CylinderGeometry(22, 26, 400, 14);
    for (var i = 0; i < 8; i++) { var c = new THREE.Mesh(fuste, blanco); c.position.set(-490 + i * 140, 560, 470); g.add(c); }
    caja(1120, 70, 120, 0, 760, 470, blanco);
    var fr = new THREE.Mesh(new THREE.CylinderGeometry(330, 330, 110, 3, 1, false, Math.PI / 2, Math.PI), blanco);   // el frontón
    fr.rotation.x = Math.PI / 2; fr.scale.set(1.7, 1, 0.42); fr.position.set(0, 830, 470); g.add(fr);
    // ventanas oscuras en la fachada
    var hueco = new THREE.MeshStandardMaterial({ color: col(0.16, 0.12, 0.10), roughness: 0.6 });
    for (i = 0; i < 9; i++) { caja(56, 170, 8, -560 + i * 140, 420, 412, hueco); caja(50, 110, 8, -500 + i * 125, 880, 324, hueco); }
    // el tambor y la cúpula de escamas
    var tambor = new THREE.Mesh(new THREE.CylinderGeometry(300, 310, 190, 40), rosa); tambor.position.set(0, 1205, -60); g.add(tambor);
    var anillo = new THREE.Mesh(new THREE.CylinderGeometry(322, 322, 26, 40), blanco); anillo.position.set(0, 1300, -60); g.add(anillo);
    var lienzoC = document.createElement('canvas'); lienzoC.width = 1024; lienzoC.height = 512;
    var cx = lienzoC.getContext('2d'), colores = ['#2f7d3c', '#e9c22a', '#2b4f9e', '#f1ece0', '#2f7d3c', '#e9c22a'];
    cx.fillStyle = '#c9a634'; cx.fillRect(0, 0, 1024, 512);
    for (var fila = 0; fila < 34; fila++) for (var k = 0; k < 64; k++) {      // escamas en franjas diagonales (los colores de la bandera)
      var xx = k * 16 + (fila % 2) * 8, yy = 512 - fila * 15;
      cx.fillStyle = colores[((k + fila) >> 2) % 4]; cx.beginPath(); cx.arc(xx + 8, yy - 8, 8.6, 0, Math.PI); cx.fill();
      cx.strokeStyle = 'rgba(40,30,20,.35)'; cx.lineWidth = 1; cx.stroke();
    }
    var texC = new THREE.CanvasTexture(lienzoC); texC.colorSpace = THREE.SRGBColorSpace; texC.wrapS = THREE.RepeatWrapping; texC.anisotropy = ANISO;
    var cupula = new THREE.Mesh(new THREE.SphereGeometry(320, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ map: texC, roughness: 0.32, metalness: 0.05 }));
    cupula.scale.set(1, 1.28, 1); cupula.position.set(0, 1312, -60); g.add(cupula);
    var linterna = new THREE.Mesh(new THREE.CylinderGeometry(46, 52, 90, 16), blanco); linterna.position.set(0, 1745, -60); g.add(linterna);
    var punta = new THREE.Mesh(new THREE.ConeGeometry(56, 90, 16), new THREE.MeshStandardMaterial({ color: col(0.25, 0.42, 0.28), roughness: 0.5 })); punta.position.set(0, 1835, -60); g.add(punta);
    // (Pau, 12/11) sin velo de niebla propio: la misma bruma que todo lo demás
    g.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.scale.setScalar(TEATRO.ALTO / 1880);          // la linterna, a ~50 m
    TIPOS.teatro.radio = 1500 / 2 * TEATRO.ALTO / 1880;
    g.visible = false; escena.add(g);
    TEATRO.g = g;
  }

  // ======================= Criaturas (Meshy): caimán, monos, garzas y el ribereño =======================
  // Cuatro modelos de Meshy, normalizados por su caja (todos con Y arriba y la cabeza / la proa hacia +Z o +X).
  // Vida sencilla y robusta: el caimán se hunde si te acercas, la garza levanta el vuelo (y pasa a ser la garza
  // dibujada que ya vuela), los monos saltan si sacudes su árbol y el ribereño baja despacio por el río.
  var criaturas = [], brillos = [], CRIA = {};
  // ======================= La gente de los barcos =======================
  // (Pau, 12/11: «que se vea gente dentro del barco») en el barco de pasajeros: hamacas arriba, gente en la barandilla,
  // sentados abajo; en el barquito, el piloto y una pasajera; en las rabetas, quien lleva el motor. Coordenadas del
  // modelo (la proa a −Z); la altura de cada cubierta se mide en la propia malla (un rayo hacia abajo)
  var GENTE = {}, ASIENTOS = {
    'barco-recreio': [['hamaca', -52, 330, 1.5708, 200], ['hamaca', 52, 250, 1.5708, 200], ['hamaca', -52, 150, 1.5708, 200], ['hamaca', 52, 60, 1.5708, 200],
      ['pie', 92, 180, -1.5708, 200], ['pie', -94, 20, 1.5708, 200], ['pie', 0, 395, 3.1416, 120],
      ['sentada', 78, 260, -1.5708, 120], ['sentada', -78, 120, 1.5708, 120], ['hamaca', 0, 200, 1.5708, 120]],
    'barco-pequeno': [['pie', 0, 175, 3.1416, 85], ['sentada', 32, 100, -1.5708, 85]],
    'rabeta-1': [['sentada', 0, 70, 3.1416, 40]], 'rabeta-2': [['sentada', 0, 60, 3.1416, 40]]
  }, asientosListos = {};
  function prepararAsientos() {
    var ray = new THREE.Raycaster(), abajo = new THREE.Vector3(0, -1, 0);
    for (var tipo in ASIENTOS) {
      var md = MODELOS[tipo]; if (!md || !md.geo) continue;
      var malla = new THREE.Mesh(md.geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); malla.updateMatrixWorld(true);
      asientosListos[tipo] = ASIENTOS[tipo].map(function (a) {
        ray.set(new THREE.Vector3(a[1], a[4], a[2]), abajo); ray.far = a[4] + 60;
        var h = ray.intersectObject(malla, false); var y = h.length ? h[0].point.y : null;
        if (y != null && tipo.indexOf('rabeta') === 0 && (y > 18 || y < -6)) y = null;     // en la rabeta, solo el fondo de la barca
        return y == null ? null : { q: a[0], x: a[1], y: a[0] === 'hamaca' ? y + 20 : y, z: a[2], ry: a[3], fase: Math.random() * 6 };
      }).filter(Boolean);
    }
    var cuenta = { pie: 0, sentada: 0, hamaca: 0 };
    for (tipo in asientosListos) asientosListos[tipo].forEach(function (a) { cuenta[a.q] += 6; });
    ['pie', 'sentada', 'hamaca'].forEach(function (k) {
      if (!GENTE[k]) return;
      var mat = GENTE[k].lote.mallas[0].material.clone(), cuello = k === 'pie' ? 0.86 : 0.82, cintura = k === 'pie' ? 0.52 : 0.5;
      // los ejes de giro: el centro de la cabeza y el de la cintura, medidos en el modelo
      var P = GENTE[k].lote.mallas[0].geometry.attributes.position, H0 = GENTE[k].alto, sc = [0, 0, 0], st = [0, 0, 0];
      for (var iv = 0; iv < P.count; iv++) { var hv = P.getY(iv) / H0; if (hv > cuello) { sc[0] += P.getX(iv); sc[1] += P.getZ(iv); sc[2]++; } else if (hv > cintura && hv < cintura + 0.2) { st[0] += P.getX(iv); st[1] += P.getZ(iv); st[2]++; } }
      var pivC = new THREE.Vector2(sc[0] / Math.max(1, sc[2]), sc[1] / Math.max(1, sc[2])), pivT = new THREE.Vector2(st[0] / Math.max(1, st[2]), st[1] / Math.max(1, st[2]));
      if (k !== 'hamaca') mat.onBeforeCompile = function (sh) {
        sh.uniforms.uT = U.uT; sh.uniforms.uPivC = { value: pivC }; sh.uniforms.uPivT = { value: pivT };
        sh.vertexShader = 'attribute vec4 aInst; uniform float uT; uniform vec2 uPivC, uPivT;\n' +
          'mat2 rG(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' +
          '{ float H=max(aInst.w,1.0), h=transformed.y/H, f=aInst.x;\n' +
          // mira alrededor: giros lentos de la cabeza, a veces más amplios
          '  float mira=0.55*sin(uT*0.23+f)*smoothstep(-0.2,0.6,sin(uT*0.11+f*1.7))+0.12*sin(uT*0.9+f*3.0);\n' +
          '  float wC=smoothstep(' + (cuello - 0.04).toFixed(2) + ',' + (cuello + 0.02).toFixed(2) + ',h); vec2 q=transformed.xz-uPivC; transformed.xz=mix(transformed.xz, uPivC+rG(mira)*q, wC);\n' +
          // el tronco: se balancea y gira un poco sobre la cintura (las piernas y el banco, quietos)
          '  float wT=smoothstep(' + cintura.toFixed(2) + ',' + (cintura + 0.18).toFixed(2) + ',h);\n' +
          '  transformed.xz=mix(transformed.xz, uPivT+rG(mira*0.18+0.05*sin(uT*0.37+f))*(transformed.xz-uPivT), wT);\n' +
          '  transformed.x+=wT*(h-' + cintura.toFixed(2) + ')*H*0.04*sin(uT*0.52+f*2.1);\n' +
          // respira: el pecho se hincha un poco
          '  float wP=smoothstep(' + (cintura + 0.1).toFixed(2) + ',' + (cintura + 0.22).toFixed(2) + ',h)*(1.0-wC); transformed.xz=uPivT+(transformed.xz-uPivT)*(1.0+wP*0.012*sin(uT*1.7+f)); }\n');
      };
      GENTE[k].lote = new Lote(GENTE[k].lote.mallas[0].geometry, mat, Math.max(8, cuenta[k]), true, 'gente-' + k);
    });
  }
  var _mBarco = new THREE.Matrix4(), _mLocal = new THREE.Matrix4(), _qG = new THREE.Quaternion(), _eG = new THREE.Euler();
  function ponerGente() {
    for (var i = 0; i < piezas.length; i++) {
      var p = piezas[i], A = asientosListos[p.tipo]; if (!A || !A.length) continue;
      var d = Math.hypot(p.x - camX, p.z - camZ); if (d > 7000) continue;
      if (!seVe(p.x, p.y + 120, p.z, 700)) continue;
      var e = p.esc || 1;
      if (p.mece) { var tm = tiempo - p.mece, am = Math.exp(-tm * 0.55); _mBarco.copy(matriz3(_m4, p.x, p.y + Math.sin(tm * 2.3) * 2.2 * am, p.z, p.rotY || 0, Math.sin(tm * 1.7 + 1) * 0.012 * am, Math.sin(tm * 1.9) * 0.035 * am, e)); }
      else _mBarco.copy(matrizPieza(p.x, p.y, p.z, p.rotY || 0, e));
      var cerca = d < SOMBRA_CAJA + 600;
      for (var k = 0; k < A.length; k++) {
        var a = A[k], G = GENTE[a.q]; if (!G) continue;
        var vaiven = a.q === 'hamaca' ? Math.sin(tiempo * 0.9 + a.fase) * 0.06 : 0, giro = a.q === 'pie' ? Math.sin(tiempo * 0.3 + a.fase) * 0.15 : 0;
        _eG.set(a.q === 'hamaca' ? 0 : 0, a.ry + giro, a.q === 'hamaca' ? vaiven : 0, 'YXZ'); _qG.setFromEuler(_eG);
        _mLocal.compose(_pos.set(a.x, a.y, a.z), _qG, _esc.set(1, 1, 1));
        _m4.multiplyMatrices(_mBarco, _mLocal);
        G.lote.poner(_m4, cerca, a.fase, 0, 0, G.alto);
      }
    }
  }
  function prepararMeshy(nombre, medida, porAlto) {
    var g = GLTF[nombre]; if (!g) return null;
    var l = geometriaDe(g)[0], geo = l.geo; geo.computeBoundingBox();
    var b = geo.boundingBox, ex = b.max.x - b.min.x, ey = b.max.y - b.min.y, ez = b.max.z - b.min.z;
    var esc = medida / (porAlto ? ey : Math.max(ex, ez));
    geo.translate(-(b.max.x + b.min.x) / 2, -b.min.y, -(b.max.z + b.min.z) / 2); geo.scale(esc, esc, esc);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    var info = { alto: ey * esc, largo: Math.max(ex, ez) * esc, ojos: null };
    if (nombre === 'caiman') {   // los ojos: lo más alto de la cabeza a cada lado (el hocico mira a +Z)
      var P = geo.attributes.position, H = ez * esc / 2, oj = [null, null];
      for (var i = 0; i < P.count; i++) {
        var z = P.getZ(i), x = P.getX(i), y = P.getY(i); if (z < H * 0.35 || z > H * 0.8) continue;
        var k = x < 0 ? 0 : 1; if (!oj[k] || y > oj[k][1]) oj[k] = [x, y, z];
      }
      info.ojos = oj;
    }
    espejar(geo);
    var mat = l.mat.clone(); mat.envMapIntensity = 1;
    info.lote = new Lote(geo, mat, nombre === 'mono' ? 8 : 10, true, nombre);
    return info;
  }
  function prepararCriaturas() {
    CRIA.caiman = prepararMeshy('caiman', 125);
    CRIA.mono = prepararMeshy('mono', 30, true);
    CRIA.garza = prepararMeshy('garza', 42, true);
    CRIA.ribereno = prepararMeshy('ribereno', 215);
    // la gente de los barcos (Meshy): de pie 1,75 m; sentada en su banco 1,3 m; en la hamaca, 2,5 m de hamaca
    GENTE.pie = prepararMeshy('persona-pie', 73, true); GENTE.sentada = prepararMeshy('persona-sentada', 54, true); GENTE.hamaca = prepararMeshy('persona-hamaca', 104);
    ['pie', 'sentada', 'hamaca'].forEach(function (k) { if (GENTE[k]) GENTE[k].lote.max = 0; });   // (el tamaño del lote se fija abajo)
    prepararAsientos();
    var r = semilla(4242);
    function zTramo(id, f) { for (var i = 0; i < VJ.tramos.length; i++) if (VJ.tramos[i].id === id) { var z0 = VJ.tramos[i].z, z1 = VJ.tramos[i + 1] ? VJ.tramos[i + 1].z : VJ.FIN + 3000; return z0 + (z1 - z0) * f; } return 0; }
    if (CRIA.caiman) [['noche', 0.12], ['noche', 0.3], ['noche', 0.5], ['noche', 0.72], ['noche', 0.9], ['igapo', 0.35], ['igapo', 0.75]].forEach(function (c, i) {
      var z = zTramo(c[0], c[1]), lado = i % 2 ? 1 : -1, x = lado * (bordeEn(z, lado) - 90 - r() * 160);
      criaturas.push({ tipo: 'caiman', x: x, z: z, y: -14, ry: Math.atan2(-lado, (r() - 0.5) * 1.4), estado: 'quieto', t: 0 });
    });
    if (CRIA.garza) [['manaus', 0.7], ['encuentro', 0.35], ['encuentro', 0.75], ['igapo', 0.55], ['aldea', 0.12], ['aldea', 0.5], ['aldea', 0.85], ['vitorias', 0.15], ['vitorias', 0.38], ['vitorias', 0.6], ['vitorias', 0.82], ['samauma', 0.2]].forEach(function (c, i) {
      var z = zTramo(c[0], c[1]), lado = r() < 0.5 ? -1 : 1, enAgua = c[0] === 'vitorias' && i % 2;
      var x = lado * (bordeEn(z, lado) - (enAgua ? 160 + r() * 200 : 20 + r() * 25));
      criaturas.push({ tipo: 'garza', x: x, z: z, y: enAgua ? -7 : Math.max(-4, Math.min(2, sueloEn(x, z))), ry: r() * 6.28, estado: 'quieto', t: r() * 10 });
    });
  }
  // los monos se sientan en las puntas de rama (8–15 m) de algunos árboles del igapó y de la aldea
  var MONOS_MAX = 6;
  function sentarMonos() {
    if (!CRIA.mono) return;
    var A = AMBIENTE, enTramo = A && (A.tramo.id === 'igapo' || A.tramo.id === 'aldea'); if (!enTramo) return;
    var vivos = criaturas.filter(function (c) { return c.tipo === 'mono'; }).length;
    for (var i = 0; i < piezas.length && vivos < MONOS_MAX; i++) {
      var p = piezas[i]; if (p.monoVisto || !TIPOS[p.tipo] || !/^arbol-medio|^igapo-tronco/.test(p.tipo)) continue;
      if (!(p.d > 500 && p.d < 3800) || Math.abs(p.x) > bordeEn(p.z, p.x < 0 ? -1 : 1) + 520) continue;
      p.monoVisto = true;
      if (hash(Math.round(p.z), 77) / 2147483646 > 0.35) continue;
      var pts = window.AMZ_PUNTAS_DE && AMZ_PUNTAS_DE[p.tipo]; if (!pts) continue;
      var cands = pts.filter(function (t) { return t[1] * (p.esc || 1) > 330 && t[1] * (p.esc || 1) < 640; }); if (!cands.length) continue;
      var t = cands[(hash(Math.round(p.x), 9) % cands.length)], e = p.esc || 1, c = Math.cos(p.rotY || 0), sn = Math.sin(p.rotY || 0);
      var lx = t[0] * e, ly = t[1] * e, lz = t[2] * e;
      criaturas.push({ tipo: 'mono', arbol: p, x: p.x + c * lx + sn * lz, y: p.y + ly - 4, z: p.z - sn * lx + c * lz, ry: Math.atan2(-p.x, (camZ - p.z) * 0.3), estado: 'quieto', t: Math.random() * 10 });
      vivos++;
    }
  }
  function asustarMonos(p) { criaturas.forEach(function (c) { if (c.tipo === 'mono' && c.arbol === p && c.estado === 'quieto') { c.estado = 'salta'; c.t = 0; c.x0 = c.x; c.y0 = c.y; c.z0 = c.z; c.dir = (c.x > camX ? 1 : -1); } }); }
  var riberenoPausa = 6;
  function vivirCriaturas(dt) {
    if (!construido) return;
    var A = AMBIENTE; brillos.length = 0;
    sentarMonos();
    // el ribereño: en la aldea baja despacio por un carril a un lado del río, hacia ti, y pasa de largo
    if (CRIA.ribereno && A) {
      var rib = null; for (var k = 0; k < criaturas.length; k++) if (criaturas[k].tipo === 'ribereno') rib = criaturas[k];
      if (!rib) { riberenoPausa -= dt; if (riberenoPausa <= 0 && A.tramo.id === 'aldea') { var lado = Math.random() < 0.5 ? -1 : 1; criaturas.push({ tipo: 'ribereno', x: lado * (460 + Math.random() * 120), z: camZ + 3400, y: -2, ry: Math.PI / 2, estado: 'rema', t: 0, remo: 0 }); } }
    }
    for (var i = criaturas.length - 1; i >= 0; i--) {
      var c = criaturas[i], dx = c.x - camX, dz = c.z - camZ, d = Math.hypot(dx, dz);
      c.t += dt;
      if (c.tipo === 'caiman') {
        if (c.estado === 'quieto' && d < 600) { c.estado = 'hunde'; c.t = 0; gota(c.x, c.z, 10, 12); sonar('chapoteo', { x: -c.x, z: c.z, fuerza: 1.3 }); }
        if (c.estado === 'hunde') { c.y = -14 - c.t * 9; if (Math.random() < dt * 6) gota(c.x + (Math.random() - 0.5) * 60, c.z + (Math.random() - 0.5) * 60, 3, 8); if (c.t > 3.2) { c.estado = 'fuera'; gota(c.x, c.z, 6, 14); } }
        if (c.estado === 'fuera' && d > 2600) { c.estado = 'quieto'; c.y = -14; }     // vuelve a su sitio cuando ya no miras
        if (c.estado === 'quieto' && CRIA.caiman.ojos && A && A.noche > 0.2 && d < 3200) {
          var cs = Math.cos(c.ry), sn = Math.sin(c.ry), luz = A.noche * Math.min(1, 900 / Math.max(300, d)) * (0.75 + 0.25 * Math.sin(tiempo * 0.7 + i));
          CRIA.caiman.ojos.forEach(function (o) { if (o) brillos.push([c.x + cs * o[0] + sn * o[2], c.y + o[1] + 0.6, c.z - sn * o[0] + cs * o[2], luz]); });
        }
      } else if (c.tipo === 'garza') {
        if (c.estado === 'quieto' && d < 500) {     // levanta el vuelo: la garza 3D se esconde y sale la dibujada
          c.estado = 'vuela'; c.t = 0;
          var huye = dx > 0 ? 1 : -1;
          aves.push({ tipo: 'garza', x: c.x, y: c.y + 30, z: c.z, vx: huye * (140 + Math.random() * 60), vy: 55 + Math.random() * 25, vz: 60 + Math.random() * 60, fase: Math.random() * 6.28, vida: 16, retraso: 0 });
          gota(c.x, c.z, 3, 6);
        }
        if (c.estado === 'vuela' && d > 3000) { c.estado = 'quieto'; }
      } else if (c.tipo === 'mono') {
        if (c.estado === 'quieto' && d < 320) { c.estado = 'salta'; c.t = 0; c.x0 = c.x; c.y0 = c.y; c.z0 = c.z; c.dir = (c.x > camX ? 1 : -1); if (Math.random() < 0.6) sonar('monos', { x: -c.x, y: c.y, z: c.z }); }
        if (c.estado === 'salta') { var u = Math.min(1, c.t / 0.9); c.x = c.x0 + c.dir * 160 * u; c.y = c.y0 + Math.sin(u * Math.PI) * 70 + u * 30; c.z = c.z0 + 60 * u; if (u >= 1) c.estado = 'fuera'; }
        if (!c.arbol || piezas.indexOf(c.arbol) < 0 || dz < -5000) { criaturas.splice(i, 1); continue; }
      } else if (c.tipo === 'ribereno') {
        c.z -= 58 * dt; c.y = -2.2 + Math.sin(c.t * 1.25) * 1.1;
        if (!c.saludo && Math.abs(c.z - camZ) < 650 && Math.abs(c.x - camX) < 900) { c.saludo = true; sonar('voz', { x: -c.x, z: c.z }); loroMira(c.x, c.z, 'ave'); }   // (Pau, 12/11) el ribereño saluda al pasar
        if (Math.abs(c.z - camZ) < 2500) {
          gota(c.x, c.z - 110, 1.2, 6); gota(c.x, c.z + 100, 0.6, 5);              // la proa abre el agua
          c.remo -= dt; if (c.remo <= 0) { c.remo = 1.7; c.ladoR = -(c.ladoR || 1); gota(c.x + c.ladoR * 34, c.z - 20, 7, 8); }
        }
        if (c.z < camZ - 6000 || c.z > camZ + 7000) { criaturas.splice(i, 1); riberenoPausa = 25 + Math.random() * 20; continue; }
      }
    }
  }
  function ponerCriaturas() {
    ponerGente();
    for (var i = 0; i < criaturas.length; i++) {
      var c = criaturas[i], C = CRIA[c.tipo]; if (!C || c.estado === 'fuera' || c.estado === 'vuela') continue;
      var dd = Math.hypot(c.x - camX, c.z - camZ); if (dd > ({ caiman: 3500, garza: 4500, mono: 3200, ribereno: 7000 }[c.tipo] || 5000)) continue;   // (modelos de Meshy: 20–40 mil triángulos)
      if (!seVe(c.x, c.y + C.alto * 0.5, c.z, Math.max(C.alto, C.largo) * 0.8 + 20)) continue;
      var ry = c.ry, rx = 0, rz = 0;
      if (c.tipo === 'mono') ry = c.ry + Math.sin(tiempo * 0.5 + i) * 0.35;                 // mira a un lado y a otro
      if (c.tipo === 'garza') ry = c.ry + Math.sin(tiempo * 0.23 + i * 2.1) * 0.25;
      if (c.tipo === 'ribereno') { rz = Math.sin(c.t * 0.9) * 0.025; rx = Math.sin(c.t * 1.25 + 1) * 0.012; }
      var m = matriz3(_m4, c.x, c.y, c.z, ry, rx, rz, 1);
      C.lote.poner(m, dd < SOMBRA_CAJA + 600, 0, 0, 0, 1);
    }
  }

  // ======================= La bruma del amanecer sobre el río =======================
  // (Pau, 12/11: «mirando atrás al empezar, que se vea más bonito, más increíble») tres capas de neblina baja, a ras
  // del agua y entre los árboles, que se deshacen y derivan despacio; a contraluz se encienden con el sol que sale
  function neblina(A, brumaL) {
    var dn = A.neblina * (1 - A.lluvia) * (1 - A.noche * 0.5);
    uBruma.uDens.value = dn; uAgua.uNeb.value = dn;
    escena.fog.near = Math.floor(escena.fog.near) + Math.min(0.999, dn * 0.9);       // la densidad viaja en la parte decimal (todos los materiales la leen)
    uBruma.uSolT.value.set(-SOL[0], SOL[1], SOL[2]); uBruma.uColN.value.fromArray(brumaL);
    var sl = lin3(A.solCol), k = A.solI * suave((SOL[1] + 0.05) / 0.1); uBruma.uSolN.value.set(sl[0] * k, sl[1] * k, sl[2] * k);
  }

  // (Pau, 12/11) el aire de la samaúma: la pelusa blanca de sus semillas (la «paina» del kapok) bajando despacio y
  // brillando al sol, y unas pocas morfos azules que revolotean entre las raíces y la canoa (azul al abrir, pardo al cerrar)
  var nPelusa = 0, nMorfos = 0;
  function vidaAireSamauma(dt) {
    var cerca = 1 - suave((VJ.FIN - 2500 - camZ) / 9000);           // de 0 (lejos) a 1 (llegando al árbol)
    if (cerca <= 0) return;
    var sx = 420, sz = VJ.FIN + 1900;
    nPelusa = 0; nMorfos = 0; for (var i = 0; i < parts.length; i++) { if (parts[i].tipo === 7) nPelusa++; else if (parts[i].tipo === 8) nMorfos++; }
    if (nPelusa < 45 * cerca && parts.length < MAXP && Math.random() < dt * 9) {
      nPelusa++; var zz = camZ + 40 + Math.random() * 1700;
      parts.push({ tipo: 7, x: camX + (Math.random() - 0.5) * 1500, y: 20 + Math.random() * 420, z: zz, vx: 6 + Math.random() * 8, vz: -4 - Math.random() * 6, vy: -3 - Math.random() * 4,
        tam: 6 + Math.random() * 7, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, vida: 22 + Math.random() * 18, edad: 0, alfa: 0, sem: Math.random(), fase: Math.random() * 6.28 });
    }
    if (nMorfos < 4 && camZ > VJ.FIN - 4500 && parts.length < MAXP) {      // viven entre el final del viaje y las raíces
      nMorfos++; var cx = (Math.random() - 0.35) * 900, cz = VJ.FIN + 120 + Math.random() * 1000;
      parts.push({ tipo: 8, x: cx, y: 30 + Math.random() * 120, z: cz, vx: 0, vy: 0, vz: 0, tam: 12 + Math.random() * 3, rot: 0, vida: 1e6, alfa: 0,
        fase: Math.random() * 6.28, ritmo: 3.6 + Math.random() * 1.4, ox: cx, oz: cz, oy: 45 + Math.random() * 110, rumbo: Math.random() * 6.28, azul: 0 });
    }
  }
  function moverAire(q, dt) {
    if (q.tipo === 7) {
      q.fase += dt * 0.8; var vv = 0.6 + TORM.viento * 3;
      q.x += (q.vx * vv + Math.sin(q.fase) * 9) * dt; q.y += (q.vy + Math.cos(q.fase * 1.3) * 3) * dt; q.z += (q.vz + Math.sin(q.fase * 0.7 + 1) * 6) * dt; q.rot += q.vr * dt;
      q.edad += dt; q.alfa = Math.max(0, Math.min(1, q.edad / 3, q.vida / 4, q.y / 25));
      if (q.y < 1) q.vida = 0;
      return;
    }
    // la morfo: vuelo a saltos (un tirón por aleteo), cambia de rumbo a menudo, ronda su sitio
    q.fase += dt * q.ritmo * 6.283;
    var ab = Math.cos(q.fase);                                    // 1 abiertas … −1 cerradas por arriba
    q.azul += ((ab > -0.2 ? 1 : 0) - q.azul) * Math.min(1, dt * 14);
    q.rumbo += (Math.random() - 0.5) * dt * 5 + Math.sin(tiempo * 0.37 + q.ritmo) * dt * 0.8;
    var dx = q.ox - q.x, dz = q.oz - q.z, dd = Math.hypot(dx, dz);
    if (dd > 260) q.rumbo += (Math.atan2(dz, dx) - q.rumbo) * Math.min(1, dt * 1.5);
    var emp = Math.max(0, -Math.sin(q.fase)) * 120 + 25;        // empujan al bajar las alas
    q.vx += (Math.cos(q.rumbo) * emp - q.vx) * Math.min(1, dt * 3); q.vz += (Math.sin(q.rumbo) * emp - q.vz) * Math.min(1, dt * 3);
    q.vy += ((q.oy - q.y) * 0.6 + Math.max(0, -Math.sin(q.fase)) * 60 - 25 - q.vy) * Math.min(1, dt * 4);
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.y < 12) { q.y = 12; q.vy = Math.abs(q.vy); }
    q.alfa = Math.min(1, q.alfa + dt * 0.5);
    if (Math.abs(q.z - camZ) > 5500) q.vida = 0;
  }

  // ======================= La tormenta (js/tormenta.js) =======================
  function hojaAlViento(v) {        // una hoja arrancada que cruza el río con el viento (de la orilla izquierda a la derecha)
    if (parts.length >= MAXP) return;
    parts.push({ tipo: 1, x: camX - 500 - Math.random() * 900, y: 160 + Math.random() * 520, z: camZ + 60 + Math.random() * 1500,
      vx: 240 + 320 * v + Math.random() * 120, vz: -20 - Math.random() * 40, vy: -20, tam: 5 + Math.random() * 3.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 9, vida: 9, alfa: 1, tono: Math.floor(Math.random() * 9), fase: Math.random() * 6 });
  }
  var TORM = AM.crearTormenta({ escena: escena, camara: camara, uT: U.uT, bandada: function () { bandada(); }, hojaAlViento: hojaAlViento,
    trueno: function (ev) {
      sonar('trueno', { x: -ev.x, z: ev.z, fuerza: ev.fuerza, distancia: ev.distancia, rayo: ev.rayo });
      if (ev.fuerza > 0.22) loroMira(ev.x, ev.z, 'trueno');
      emitir('trueno', ev);
    } });
  uAgua.uPreLl.value = TORM.pre;
  var LUZ = [0, 1, 0];               // de dónde viene la luz directa: el sol o, un instante, el relámpago

  // ======================= El tramo: luz, cielo, agua y tiempo =======================
  var AMBIENTE = null, SOL = [0, 1, 0], BRUMA = [0.8, 0.6, 0.42], AMB = [0.6, 0.6, 0.6], SOLCOL = [1, 0.8, 0.6];
  var elTramo = document.getElementById('tramo'), tramoVisto = null;
  var _c = new THREE.Color();
  function ambiente(dt) {
    var A = AMBIENTE = VJ.en(camZ + 500);
    var el = A.sol[0] * Math.PI / 180, az = A.sol[1] * Math.PI / 180;
    SOL = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
    AMB = A.amb; SOLCOL = [A.solCol[0] * A.solI, A.solCol[1] * A.solI, A.solCol[2] * A.solI];
    // la bruma: la del viaje mezclada con la del cielo de la foto (para que la niebla case con el horizonte)
    var ca = window.AMZ_CIELOS && AMZ_CIELOS[A.a.id], cb = window.AMZ_CIELOS && AMZ_CIELOS[A.b.id];
    var bA = ca && ca.bruma ? ca.bruma : A.a.bruma, bB = cb && cb.bruma ? cb.bruma : A.b.bruma, bc = [0, 1, 2].map(function (k) { return bA[k] + (bB[k] - bA[k]) * A.t; });
    BRUMA = [0, 1, 2].map(function (k) { return A.bruma[k] * 0.45 + bc[k] * 0.55; });
    // la lluvia: además de los anillos (en el agua) y los trazos (js/tormenta.js), gotas de verdad en las ondas de cerca
    var llC = VJ.tormenta(camZ).lluvia;
    if (llC > 0.02) for (var i = 0; i < llC * 8; i++) gota(camX + (Math.random() - 0.5) * 1400, camZ + (Math.random() - 0.3) * 1000, 0.9 + Math.random() * 1.6, 2.2);
    // luciérnagas de noche, en las orillas
    if (A.noche > 0.3) for (i = 0; i < A.noche * 8 && parts.length < MAXP; i++) {
      var lado = Math.random() < 0.5 ? -1 : 1, zz = camZ - 1400 + Math.random() * 3900;   // (12/11) alrededor, no solo delante
      parts.push({ tipo: 4, x: camX + lado * (380 + Math.random() * 900), y: 15 + Math.random() * 220, z: zz, vx: (Math.random() - 0.5) * 12, vz: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 6, tam: 7, rot: Math.random() * 6, vida: 4 + Math.random() * 4, alfa: 1 });
    }
    vidaAireSamauma(dt);
    if (elTramo && A.tramo !== tramoVisto) { tramoVisto = A.tramo; elTramo.textContent = A.tramo.nombre; }

    // ---- la luz de Three ----
    var brumaL = lin3(BRUMA), solL = lin3(A.solCol), alto = suave((SOL[1] + 0.06) / 0.11);
    var solI = A.solI * alto * (1 - A.oscuras * 0.55);
    sol.color.setRGB(solL[0], solL[1], solL[2]);
    sol.intensity = 4.6 * solI;
    var sombraSol = solI > 0.03;
    sol.castShadow = sombraSol;
    escena.fog.color.setRGB(brumaL[0], brumaL[1], brumaL[2]);
    escena.fog.near = 7000 + (2600 - 7000) * A.niebla; escena.fog.far = 34000 + (17000 - 34000) * A.niebla;   // (Pau, 12/11) sin velo blanco en el horizonte
    escena.environmentIntensity = (0.55 + 0.45 * A.foto) * (1 - A.noche * 0.6);
    var amb = lin3(A.amb), zen = lin3(A.zenit);
    hemi.color.setRGB(zen[0], zen[1], zen[2]); hemi.groundColor.setRGB(amb[0] * 0.35, amb[1] * 0.28, amb[2] * 0.2); hemi.intensity = 0.35 + A.noche * 0.9;
    farol.distance = 600; farol.decay = 2;
    // el cielo
    var ra = cielo(A.a.id), rb = cielo(A.b.id);
    uCielo.uFotoA.value = ra && ra.listo ? ra.tex : null; uCielo.uFotoB.value = rb && rb.listo ? rb.tex : null;
    uCielo.uPanA.value.set(uCielo.uFotoA.value ? 1 : 0, A.a.cieloExpo || 1, ra && ra.banda ? 1 : 0, 0); uCielo.uPanB.value.set(uCielo.uFotoB.value ? 1 : 0, A.b.cieloExpo || 1, rb && rb.banda ? 1 : 0, 0);
    uCielo.uMezC.value = A.t; uCielo.uSol.value.set(SOL[0], SOL[1], SOL[2]);
    uCielo.uZenit.value.fromArray(A.zenit); uCielo.uHoriz.value.fromArray(A.horiz); uCielo.uSolCol.value.fromArray(SOLCOL); uCielo.uColBruma.value.fromArray(BRUMA); uCielo.uAmb.value.fromArray(AMB);
    uCielo.uNubes.value = A.nubes; uCielo.uOscuras.value = A.oscuras; uCielo.uNoche.value = A.noche;
    cielosNecesarios(A); entorno(A);
    // el agua
    var aguaL = lin3(A.agua);
    uAgua.uAguaCol.value.fromArray(aguaL); uAgua.uCalma.value = A.calma; uAgua.uNegra.value = A.negra; uAgua.uLluvia.value = A.lluvia; uAgua.uFarol.value = A.noche; uAgua.uNiebla.value = A.niebla;
    uAgua.uSol.value.set(SOL[0], SOL[1], SOL[2]); uAgua.uSolCol.value.set(solL[0] * A.solI * (1 - A.oscuras * 0.8), solL[1] * A.solI * (1 - A.oscuras * 0.8), solL[2] * A.solI * (1 - A.oscuras * 0.8));
    uAgua.uColBruma.value.fromArray(brumaL); uAgua.uAmb.value.fromArray(AMB);
    uAgua.uRachaZ.value = racha.z; uAgua.uRacha.value = 0;   // (Pau, 12/11) sin franja rizada que pasa cada pocos segundos
    uAgua.uCorriente.value = tiempo * 26;

    // ---- la tormenta: lluvia, viento, rayos (con su luz) y el arcoíris al escampar ----
    TORM.actualizar(dt, A, camX, camZ, { alto: H * DPR, luz: [brumaL[0] * 0.8, brumaL[1] * 0.8, brumaL[2] * 0.85], bruma: brumaL, niebla: [escena.fog.near, escena.fog.far] });
    var F = TORM.flash, FD = TORM.dir;
    LUZ = SOL;
    if (F > 0.002) {
      // el relámpago, un instante, es la luz directa: sombras duras de los árboles y brillos en el agua hacia él
      var wq = Math.min(1, F * 3) * suave((A.oscuras - 0.3) / 0.4);
      var fy = Math.max(0.3, FD[1]), fl = Math.hypot(FD[0], fy, FD[2]);
      var lx = SOL[0] + (FD[0] / fl - SOL[0]) * wq, ly = SOL[1] + (fy / fl - SOL[1]) * wq, lz = SOL[2] + (FD[2] / fl - SOL[2]) * wq, ll = Math.hypot(lx, ly, lz) || 1;
      LUZ = [lx / ll, ly / ll, lz / ll];
      var kc = Math.min(1, F * 2);
      sol.color.setRGB(solL[0] + (0.78 - solL[0]) * kc, solL[1] + (0.83 - solL[1]) * kc, solL[2] + (1.0 - solL[2]) * kc);
      sol.intensity += F * 5 * (0.35 + 0.65 * wq);
      if (wq > 0.05) sol.castShadow = true;
      hemi.intensity += F * 0.45; escena.environmentIntensity += F * 0.3;
      uAgua.uSol.value.set(LUZ[0], LUZ[1], LUZ[2]);
      uAgua.uSolCol.value.x += 0.8 * F; uAgua.uSolCol.value.y += 0.85 * F; uAgua.uSolCol.value.z += 1.0 * F;
    }
    U.uSolDir.value.set(-LUZ[0], LUZ[1], LUZ[2]);
    uCielo.uRayo.value = F * 0.9; uCielo.uRayoDir.value.set(FD[0], FD[1], FD[2]);
    uCielo.uArco.value = A.torm ? A.torm.arco : 0;
    uCielo.uDisco.value = A.disco || 0; uAgua.uDisco.value = (A.disco || 0) * (1 - A.lluvia);
    neblina(A, brumaL);
    if ((A.disco || 0) > 0.5 && construido) { proxDetras -= dt; if (proxDetras <= 0) { bandadaDetras(); proxDetras = 14 + Math.random() * 18; } }

    // las cartas y partículas: tan iluminadas como el tramo
    var luz = A.foto * (1 + (AMB[0] * 1.55 - 1) * 0.35), lc = Math.pow(Math.max(0.02, luz), 2.2) * 1.4;
    luzCarta.value.set(lc * Math.pow(1 + (AMB[0] * 1.55 - 1) * 0.35, 0.3), lc, lc * Math.pow(1 + (AMB[2] * 1.55 - 1) * 0.35, 0.3));
    bruma3.value.fromArray(brumaL); nCerca.value = escena.fog.near; nLejos.value = escena.fog.far;
    uPart.uLuz.value = Math.max(0.08, lc);
    uFlot.uLuz.value = Math.max(0.05, lc * 0.9); uFlot.uNieblaCerca.value = escena.fog.near; uFlot.uNieblaLejos.value = escena.fog.far; uFlot.uColBruma.value.fromArray(brumaL);
    uCine.uExpo.value = A.expo; uCine.uSat.value = A.sat; uCine.uRayoG.value = Math.min(1, TORM.flash * 0.18);
  }

  // ======================= Llenar los lotes: lo que se ve (y lo que se refleja) =======================
  var frusto = new THREE.Frustum(), frustoE = new THREE.Frustum(), _m4 = new THREE.Matrix4(), _esf = new THREE.Sphere(), _pos = new THREE.Vector3(), _q4 = new THREE.Quaternion(), _esc = new THREE.Vector3(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');
  function matrizPieza(x, y, z, ry, e) { _pos.set(-x, y, z); _eu.set(0, -ry, 0, 'YXZ'); _q4.setFromEuler(_eu); _esc.set(e, e, e); return _m4.compose(_pos, _q4, _esc); }
  function matriz3(m, x, y, z, ry, rx, rz, e) { _pos.set(-x, y, z); _eu.set(rx, -ry, -rz, 'YXZ'); _q4.setFromEuler(_eu); _esc.set(e, e, e); return m.compose(_pos, _q4, _esc); }
  function seVe(x, y, z, r) { _esf.center.set(-x, y, z); _esf.radius = r; return frusto.intersectsSphere(_esf) || frustoE.intersectsSphere(_esf); }
  function llenarLotes() {
    frusto.setFromProjectionMatrix(_m4.multiplyMatrices(camara.projectionMatrix, camara.matrixWorldInverse));
    frustoE.setFromProjectionMatrix(_m4.multiplyMatrices(espejo.projectionMatrix, espejo.matrixWorldInverse));
    empezarLotes(); var teatroVisto = false;
    for (var i = 0; i < piezas.length; i++) {
      var p = piezas[i], T = TIPOS[p.tipo]; if (!T) continue;
      // (Pau, 12/11) «las cosas no pueden desaparecer nunca»: nada se descarta por estar «detrás» según la vista;
      // solo por distancia real y por una esfera generosa (con la copa, que sobresale de las ramas) fuera de la vista y del reflejo
      var dReal = Math.hypot(p.x - camX, p.z - camZ);
      if (p.tipo === 'teatro' && TEATRO.g) {     // el teatro y la ciudad: un grupo de mallas que Three recorta una a una con sus propias cajas
        if (dReal < ALCANCE[CALIDAD] + 6000) {
          TEATRO.g.visible = true; teatroVisto = true;
          if (TEATRO.ciudad) { TEATRO.g.position.set(-TEATRO.gx, 0, TEATRO.gz); TEATRO.g.rotation.y = Math.PI; }   // el río queda al −X de la ciudad
          else { TEATRO.g.position.set(-p.x, p.y, p.z); TEATRO.g.rotation.y = -(p.rotY || 0); }
        }
        continue;
      }
      if (dReal > ALCANCE[CALIDAD] + 1500) continue;
      if (p.fondo && CALIDAD >= 2) continue;
      var e = p.esc || 1, alto = T.alto * e, radio = Math.max(alto * 0.6, ((T.radio || 300) + (T.copa ? 320 : 60)) * 1.2 * e) + 40;
      if (!seVe(p.x, p.y + alto * 0.5, p.z, radio)) continue;
      var cerca = Math.abs(p.z - camZ) < SOMBRA_CAJA + 700 && Math.abs(p.x - camX) < SOMBRA_CAJA + 700;
      var vto = (T.viento || 0.4) * (1 + (p.racha || 0) * 2.2 + TORM.viento * 2.6), m = matrizPieza(p.x, p.y, p.z, p.rotY || 0, e);
      if (p.mece) { var tm = tiempo - p.mece, am = Math.exp(-tm * 0.55); if (tm > 8) p.mece = 0; else m = matriz3(_m4, p.x, p.y + Math.sin(tm * 2.3) * 2.2 * am, p.z, p.rotY || 0, Math.sin(tm * 1.7 + 1) * 0.012 * am, Math.sin(tm * 1.9) * 0.035 * am, e); }
      var emp = (p.empuje || 0) + TORM.viento * 0.28;     // con el viento de la tormenta, las copas se agitan
      if (T.modelo) {
        var md = MODELOS[T.modelo];
        md.lote.poner(m, cerca, p.fase || 0, vto, emp, md.alto);
        if (md.copa) md.copa.poner(m, cerca, p.fase || 0, vto, emp, md.alto);
      } else if (p.tipo === 'kapok' && KAPOK) {
        KAPOK.tronco.poner(m, cerca, 0, 0, 0, 1);
        if (KAPOK.ramas) KAPOK.ramas.poner(m, cerca, p.fase || 0, vto, emp, 1300);
        if (KAPOK.copa) KAPOK.copa.poner(m, cerca, p.fase || 0, vto, emp, 1300);
      }
    }
    ponerCriaturas(); ponerFondo(Math.cos(yaw), Math.sin(yaw));
    terminarLotes();
    if (TEATRO.g && !teatroVisto) TEATRO.g.visible = false;
  }
  function llenarCartas(lista) {
    // de lejos a cerca (se mezclan con transparencia)
    lista.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < lista.length; i++) {
      var p = lista[i];
      if (p.tipo === 'ave') {
        var mk = MARCOS['ave-' + p.especie], c = cartasAves[p.especie]; if (!mk || !c) continue;
        var m = mk[p.marco], esc = AVES[p.especie].largo / mk[1][4], ancho = m[4] * esc, alto = m[5] * esc;
        c.poner({ x: p.x, y: p.y - alto / 2, z: p.z, giro: p.giro, ancho: ancho, alto: alto, voltear: p.voltear, rect: m, alfa: p.alfa });
      } else if (p.tipo === 'camalotes' && cartasCamalotes) {
        cartasCamalotes.poner({ x: p.x, y: 0, z: p.z, giro: p.giro, ancho: 70 * 995 / 357, alto: 70, voltear: p.voltear, hundir: 0.32, fase: p.fase, viento: 0.25 * (1 + (p.racha || 0) * 2.2), empuje: p.empuje, flota: true, alfa: p.alfa });
      } else if (p.tipo === 'niebla') {
        cartasNiebla.poner({ x: p.x, y: -0.3 * 340, z: p.z, ancho: p.ancho, alto: 340, modo: 1, alfa: p.alfa });
      }
    }
    for (var e in cartasAves) cartasAves[e].cerrar();
    if (cartasCamalotes) cartasCamalotes.cerrar(); cartasNiebla.cerrar();
  }
  function llenarParticulas() {
    var n = 0, A = partA.array, B = partB.array;
    for (var i = 0; i < parts.length && n < MAXP; i++) {
      var q = parts[i], o = n * 4;
      A[o] = -q.x; A[o + 1] = q.y; A[o + 2] = q.z; A[o + 3] = q.tam;
      B[o] = q.tipo; B[o + 1] = q.tipo === 1 || q.tipo === 7 ? q.rot : q.tipo === 8 ? q.fase : q.tipo === 6 ? Math.atan2(-q.vx * _derV.x + q.vz * _derV.z, q.vy) : 0; B[o + 2] = q.alfa;
      B[o + 3] = q.tipo === 1 ? (q.tono || 0) : q.tipo === 7 ? q.sem : q.tipo === 8 ? q.azul : q.tipo === 2 ? 0 : Math.min(1, Math.abs(q.vy || 0) / 250); n++;
    }
    for (i = 0; i < brillos.length && n < MAXP; i++) {
      var o2 = n * 4, b = brillos[i]; A[o2] = -b[0]; A[o2 + 1] = b[1]; A[o2 + 2] = b[2]; A[o2 + 3] = 4.2; B[o2] = 5; B[o2 + 1] = 0; B[o2 + 2] = b[3]; B[o2 + 3] = 0; n++;
    }
    partGeo.instanceCount = n; partA.needsUpdate = true; partB.needsUpdate = true; particulas.visible = n > 0;
  }

  // ======================= Bucle =======================
  var elVel = document.getElementById('vel'), elDist = document.getElementById('dist'), proa = document.getElementById('proa'), solCSS = document.getElementById('sol');
  var ultimo = performance.now(), congelado = false, acumSim = 0, fotogramas = 0, avisado = false;
  var _derV = new THREE.Vector3();
  function pasoSim() {
    uSim.uPrev.value = simA.texture;
    var n = gotas.length; uSim.uN.value = n;
    for (var i = 0; i < 32; i++) { var g = gotas[i]; if (g) { uSim.uGotas.value[i].set(g[0], g[1], g[2], g[3]); uSim.uEsp.value[i] = g[4] || 0; } }
    uSim.uCanoaUV.value.set(((camX / SIM_TAM) % 1 + 1) % 1, (((camZ + 70) / SIM_TAM) % 1 + 1) % 1);
    renderer.setRenderTarget(simB); renderer.render(escenaSim, camPlano);
    var tmp = simA; simA = simB; simB = tmp; gotas.length = 0;
  }
  var lento = { suma: 0, n: 0, espera: 4 };
  function vigilarRitmo(ms) {   // si durante 2 s el fotograma pasa de 24 ms, baja un escalón de calidad (solo con el reloj real)
    if (congelado || !construido || document.hidden) return;
    if (lento.espera > 0) { lento.espera -= ms / 1000; return; }
    lento.suma += ms; lento.n++;
    if (lento.n >= 120) {
      if (lento.suma / lento.n > 24 && CALIDAD < 3) { CALIDAD++; medirVentana(); lento.espera = 3; }
      lento.suma = 0; lento.n = 0;
    }
  }
  function cuadro(ahora) {
    vigilarRitmo(ahora - ultimo);
    var dt = Math.min(0.05, Math.max(0, (ahora - ultimo) / 1000)); ultimo = ahora; tiempo += dt; U.uT.value = tiempo;
    if (bloqueado) { teclaRemar = 0; teclaGiro = 0; impulso = 0; pedido = 0; }
    if (teclaRemar) impulso += 2600 * dt * teclaRemar;
    // lo que pide la persona este fotograma (−1…1), aunque la canoa no se pueda mover (la interfaz lo necesita)
    var pidio = Math.max(-1, Math.min(1, pedido + teclaRemar)); pedido = 0;
    remoS = Math.abs(pidio) >= Math.abs(remoS) * 0.97 && pidio !== 0 ? pidio : remoS * Math.exp(-dt * 5);
    if (Math.abs(remoS) < 0.01) remoS = 0;
    vel += impulso; impulso = 0;
    vel -= vel * Math.min(1, dt * 0.7);                    // (Pau, 11/11) sin remar, la canoa se desliza hasta pararse
    vel = Math.max(-MAXV, Math.min(MAXV, vel));             // adelante y atrás, igual de rápido
    camZ += vel * dt;
    if (viajeIr) {          // ir(z, ms): la canoa se desliza sola hasta z
      var ki = Math.min(1, (tiempo - viajeIr.t0) / viajeIr.dur), ks = ki * ki * (3 - 2 * ki);
      camZ = viajeIr.z0 + (viajeIr.z1 - viajeIr.z0) * ks; vel = 0; if (ki >= 1) viajeIr = null;
    }
    if (camZ > VJ.FIN) { camZ = VJ.FIN; vel = Math.min(vel, 0); if (remoS > 0.1 && tiempo - ultLimite > 0.4) { ultLimite = tiempo; emitir('limite', { lado: 'delante' }); } }
    if (camZ < 0) { camZ = 0; vel = Math.max(vel, 0); }
    if (camZ <= 0.5 && remoS < -0.1 && tiempo - ultLimite > 0.4) { ultLimite = tiempo; emitir('limite', { lado: 'atras' }); }
    ambiente(dt);
    rumbo += teclaGiro * dt * 1.5; if (teclaGiro) ultimoGiro = tiempo;
    if (mirarAnim) {        // mirar(yaw, pitch, ms): la vista gira sola
      var km = Math.min(1, (tiempo - mirarAnim.t0) / mirarAnim.dur), kk = km * km * (3 - 2 * km);
      rumbo = mirarAnim.y0 + (mirarAnim.y1 - mirarAnim.y0) * kk; pitchObj = mirarAnim.p0 + (mirarAnim.p1 - mirarAnim.p0) * kk; ultimoGiro = tiempo;
      if (km >= 1) mirarAnim = null;
    }
    if (tiempo - ultimoGiro > 10 && !bloqueado && !(arrastre && arrastre.modo === 'mirar')) {     // a los 10 s sin tocar nada, vuelve a mirar al frente
      var frente = Math.round(rumbo / 6.2832) * 6.2832; rumbo += (frente - rumbo) * Math.min(1, dt * 0.9);
      pitchObj += (PITCH - pitchObj) * Math.min(1, dt * 0.9);
    }
    yaw += (rumbo - yaw) * Math.min(1, dt * 3.0);
    pitch += (pitchObj - pitch) * Math.min(1, dt * 4.0);
    remada += dt * (1.1 + vel / 500);

    // la canoa nota las ondas que le llegan (velocidad de onda ≈ 170 u/s)
    var oleaje = 0, alabeo = 0;
    for (var e = ecos.length - 1; e >= 0; e--) {
      var ec = ecos[e], edad = tiempo - ec.t; if (edad > 5) { ecos.splice(e, 1); continue; }
      var dx = ec.x - camX, dz = ec.z - (camZ + 120), dist = Math.hypot(dx, dz), fr = edad * 170;
      var w = Math.exp(-Math.pow((dist - fr) / 45, 2)) * Math.exp(-edad * 0.7) * Math.min(1, ec.f / 26) / (1 + dist / 400);
      oleaje += Math.sin((dist - fr) / 14) * w; alabeo += Math.sin((dist - fr) / 14 + 1) * w * (dx > 0 ? 1 : -1);
    }
    base.vaiven = Math.sin(remada * 2.1) * (0.8 + vel / 700) + oleaje * 5;
    var balanceo = oleaje * 0.012;
    var ritmo = Math.min(1, Math.abs(vel) / 500);
    // la canoa 3D: va recta a lo largo del río, se mece con las olas; el remo palea a un lado y a otro
    if (CANOA) {
      var rzc = alabeo * 0.035 + Math.sin(remada * 1.05) * (0.006 + Math.abs(vel) / 60000), rxc = balanceo * 0.7 + Math.sin(remada * 2.1) * 0.004;
      if (golpeCasco) { golpeCasco.t += dt; rzc += golpeCasco.lado * 0.022 * Math.exp(-golpeCasco.t * 2.2) * Math.sin(golpeCasco.t * 7); if (golpeCasco.t > 3) golpeCasco = null; }
      vivirEnseres(dt);
      matriz3(CANOA.matrix, camX, base.vaiven * 0.55 - 3, camZ + 70, Math.PI, rxc, rzc, 1); CANOA.matrixWorldNeedsUpdate = true;
      if (REMO) {
        if (golpe && tiempo - golpe.t0 < golpe.dur) {
          var g = (tiempo - golpe.t0) / golpe.dur, L = golpe.lado, tir = g < 0.62 ? g / 0.62 : 1 - (g - 0.62) / 0.38;   // tirón y recuperación
          var hund = g < 0.62 ? Math.sin(Math.min(1, g / 0.62) * Math.PI) : 0;
          var ang = golpe.sg * (0.75 - tir * 1.4), alza = g < 0.62 ? 0 : Math.sin((g - 0.62) / 0.38 * Math.PI) * 14;
          matriz3(REMO.matrix, camX + L * 30, OJO - 4 + alza - hund * 8, camZ + 34, Math.PI / 2 * L, ang, L * (0.62 - hund * 0.1), 1);
          if (!golpe.agua && g > 0.06) {   // la pala entra en el agua
            golpe.agua = true; var pz = camZ + 34 + golpe.sg * 50, px = camX + L * 66; sonar('remada', { x: -px, z: pz });
            gota(px, pz, 9 + ritmo * 6, 11, true, 0.3); salpicar(px, pz, 10, 120);
          }
          if (g > 0.15 && g < 0.6 && ((tiempo * 30) | 0) % 2 === 0) gota(camX + L * 66, camZ + 34 + golpe.sg * (50 - tir * 110), 1.4, 8, true);   // rastro suave y regular de la pala
        } else REMO.matrix.multiplyMatrices(CANOA.matrix, REMO_REPOSO);   // en reposo: sobre los bancos, a lo largo, la pala hacia proa
        REMO.matrixWorldNeedsUpdate = true;
      }
      encenderFarol();
      vivirLoro(dt);
    }
    if (Math.abs(vel) > 25) {
      // (Pau, 12/11) «que si la barca va rápido se note»: la proa abre el agua y levanta espuma a los lados,
      // la espuma corre pegada al casco y se queda atrás en el río; la popa deja un remolino blanco
      var sg = vel > 0 ? 1 : -1, rr = ritmo * ritmo, zProa = camZ + 70 + 120 * sg, zPopa = camZ + 70 - 118 * sg;
      gota(camX, zProa + 18 * sg, 1.4 + ritmo * 3.2, 6, true, 0.15 * rr);
      gota(camX - 16, zProa, 0.6 + ritmo * 1.6, 5, true, 0.3 * rr); gota(camX + 16, zProa, 0.6 + ritmo * 1.6, 5, true, 0.3 * rr);
      var lado = (tiempo * 60 | 0) % 2 ? 1 : -1, zc = camZ + 70 + (Math.random() - 0.3) * 200 * sg;
      gota(camX + lado * (21 + Math.random() * 6), zc, 0.3 + ritmo * 0.6, 5, true, 0.22 * rr);
      gota(camX + (Math.random() - 0.5) * 24, zPopa, 0.4 + ritmo * 0.8, 7 + ritmo * 4, true, 0.12 * ritmo);
      marcarEstela(estelaZ == null ? camZ + 70 : estelaZ, camZ + 70, Math.abs(vel), camX);
      if (ritmo > 0.3) {
        var nS = Math.round(dt * 600 * (ritmo - 0.3) * (ritmo - 0.3) * 3 + Math.random() * 0.5);
        for (var sp = 0; sp < nS && parts.length < MAXP; sp++) {         // los abanicos de agua de la zProa
          var ld = Math.random() < 0.5 ? -1 : 1, fv = (0.5 + Math.random()) * ritmo;
          parts.push({ tipo: 6, x: camX + ld * (13 + Math.random() * 4), y: 1.5 + Math.random() * 2, z: zProa + (Math.random() - 0.3) * 26 * sg,
            vx: ld * (25 + Math.random() * 45) * fv, vz: vel * (0.85 + Math.random() * 0.12), vy: (25 + Math.random() * 45) * fv, tam: 0.35 + Math.random() * 0.6, rot: 0, vida: 0.7, alfa: 0.6 });
        }
      }
    }
    estelaZ = camZ + 70;
    if (Math.abs(vel) > 160 && tiempo > proxRemada) {
      ladoRemo = -ladoRemo; var dur = 1.25 - ritmo * 0.55; golpe = { t0: tiempo, dur: dur * 0.92, lado: ladoRemo, agua: false, sg: vel > 0 ? 1 : -1 };
      proxRemada = tiempo + dur;
    }

    camaraDe(balanceo);
    if (window.AM.audio && AM.audio.activo && AMBIENTE) {
      camara.updateMatrixWorld(); var me = camara.matrixWorld.elements;
      _v.set(-camX, 0, camZ + 70); var zm = TORM ? VJ.tormenta(0).muro[0] : 0;
      AM.audio.marco({ cam: [camara.position.x, camara.position.y, camara.position.z], fwd: [-me[8], -me[9], -me[10]], up: [me[4], me[5], me[6]],
        tramoA: AMBIENTE.a.id, tramoB: AMBIENTE.b.id, t: AMBIENTE.t, lluvia: TORM ? TORM.lluvia : 0, viento: TORM ? TORM.viento : 0, noche: AMBIENTE.noche,
        vel: vel, canoa: [-camX, 0, camZ + 70], proa: [-camX, 0, camZ + 70 + 125 * (vel >= 0 ? 1 : -1)], popa: [-camX, 0, camZ + 70 - 125 * (vel >= 0 ? 1 : -1)],
        bordeIzq: bordeEn(camZ, -1), bordeDer: bordeEn(camZ, 1), muro: zm, motor: motorCercano() });
    }
    vivir(dt); vivirFrutos(dt);
    var yawG = Math.atan2(Math.sin(yaw), Math.cos(yaw)) * 180 / Math.PI;
    emitir('cuadro', { t: tiempo * 1000, dt: dt * 1000, z: camZ, x: camX, yaw: yawG, pitch: pitch * 180 / Math.PI, vel: vel, remo: remoS });
    var cy = Math.cos(yaw), sy = Math.sin(yaw);

    // piezas: reciclar, reaccionar y orden
    var bajo = raton && !bloqueado ? plantaEn(raton.x, raton.y, true) : null;
    if (bajo !== sobre) { sobre = bajo; vista.classList.toggle('sobre', !!bajo); }
    if (construido) { sembrador(); tierras(); selvaDeFondo(); }
    var lista = [];
    for (var i = 0; i < piezas.length; i++) {
      var p = piezas[i];
      var d = (p.z - camZ) * cy + (p.x - camX) * sy;
      var T = TIPOS[p.tipo];
      if (p.tipo === 'camalotes') {
        p.z -= 18 * dt;                                     // la corriente se los lleva
        var lat = p.x - camX, dz0 = p.z - camZ;
        if (dz0 < 420 && dz0 > 0 && Math.abs(lat) < 130) p.x += (lat > 0 ? 1 : -1) * cy * Math.min(1, ritmo + 0.2) * 70 * dt;   // la proa los aparta
      }
      if (T && T.flota) p.z -= 5 * dt;                       // lo que flota baja muy despacio con la corriente
      if (p.empujeX) { var mv = p.empujeX * Math.min(1, dt * 1.6); p.x += mv; p.empujeX -= mv; if (Math.abs(p.empujeX) < 0.5) p.empujeX = 0; }
      if (p === bajo && T.copa) p.empuje = Math.max(p.empuje, 1);
      p.empuje = Math.max(0, p.empuje - dt * 0.9);
      p.racha = racha.f * Math.exp(-Math.pow((p.z - racha.z) / 900, 2));
      p.d = d;
      if (T && T.aves && !p.volaron && p.aves && d > CERCA && d < p.umbral && Math.abs(vel) > 40) despegar(p, false);
      if (d < CERCA && !T.modelo && p.tipo !== 'kapok') continue;
      if (p.tipo === 'niebla') p.alfa = Math.min(1, (LARGO - d) / (LARGO * 0.12)) * Math.min(1, (d - CERCA) / 600) * 0.4;
      else p.alfa = Math.min(1, (LARGO - d) / (LARGO * 0.12));
      if (p.tipo === 'camalotes' || p.tipo === 'niebla') lista.push(p);
    }
    if (Object.keys(VUELO).length) ponerAves();
    else for (i = 0; i < aves.length; i++) {
      var av = aves[i]; if (av.retraso > 0) continue;
      var da = (av.z - camZ) * cy + (av.x - camX) * sy; if (da < CERCA) continue;
      var planeo = av.crucero ? 0 : Math.max(0, Math.sin(av.fase * 0.11));
      var lt = av.vx * cy - av.vz * sy, sa = Math.sin(av.fase);
      var marco = planeo > 0.8 ? 3 : sa > 0.45 ? 0 : sa < -0.45 ? 2 : 1;
      lista.push({ tipo: 'ave', especie: av.tipo, marco: marco, x: av.x, y: av.y, z: av.z, giro: Math.atan2(av.vy, Math.abs(lt) + 60) * 0.5, voltear: lt >= 0 ? 1 : -1, alfa: Math.min(1, av.vida), d: da });
    }
    actualizarSalto(dt);
    vivirCriaturas(dt); vivirTrafico(dt);

    acumSim += dt; var pasos = 0;
    while (acumSim > 1 / 60 && pasos < 3) { pasoSim(); acumSim -= 1 / 60; pasos++; }
    if (!construido) { renderer.setRenderTarget(null); if (!congelado) requestAnimationFrame(cuadro); return; }

    // ---- dibujar ----
    camaraEspejo();
    llenarLotes(); llenarCartas(lista); llenarParticulas(); vivirFlotantes(dt);
    if (DELFIN) {
      DELFIN.malla.visible = !!(salto && salto.visible);
      if (salto) { DELFIN.u.uArco.value.set(salto.R, salto.ph, salto.fase, 100); DELFIN.u.uArcoC.value.fromArray(salto.C); DELFIN.u.uArcoDir.value.set(salto.d[0], salto.d[1]); }
    }
    actualizarBorde();
    uAgua.uSim.value = simA.texture; U.uSimV.value = simA.texture; uAgua.uCamL.value.set(camX, base.C[1], camZ); uAgua.uCanoa.value.set(camX, camZ + 70, CANOA ? 1 : 0);
    _derV.setFromMatrixColumn(camara.matrixWorld, 0); uDerComun.value.copy(_derV); uPart.uDer.value.copy(_derV);
    // la sombra: una caja que sigue a la canoa (un poco por delante de donde miras), ajustada a la rejilla de la sombra
    if (sol.castShadow) {
      var tx = SOMBRA_CAJA * 2 / sol.shadow.mapSize.x * 4, cxs = Math.round(camX / tx) * tx, czs = Math.round((camZ + 70) / tx) * tx;
      sol.target.position.set(-cxs, 0, czs); sol.position.set(-cxs - LUZ[0] * 6000, Math.max(0.08, LUZ[1]) * 6000, czs + LUZ[2] * 6000);
      sol.target.updateMatrixWorld(); sol.updateMatrixWorld();
      renderer.shadowMap.needsUpdate = true;
    } else { sol.target.position.set(-camX, 0, camZ); sol.position.set(-camX - LUZ[0] * 6000, LUZ[1] * 6000, camZ + LUZ[2] * 6000); }
    // la sombra en el agua (el mapa de sombras ya está hecho cuando se pinta la escena principal)
    var hayS = sol.castShadow && sol.shadow.map && sol.shadow.map.depthTexture;
    uAgua.uConSombra.value = hayS ? 1 : 0; if (hayS) { uAgua.uSombra.value = sol.shadow.map.depthTexture; uAgua.uSombraMat.value.copy(sol.shadow.matrix); uAgua.uSombraTam.value = sol.shadow.mapSize.x; }
    renderer.info.reset();
    // el reflejo (media resolución): el mundo visto desde la cámara espejo
    cieloMalla.visible = !escena.background;
    renderer.setRenderTarget(reflRT); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(escena, espejo);
    renderer.setRenderTarget(null);
    // la escena y el etalonado
    uBruma.uInvProy.value.copy(camara.projectionMatrixInverse); uBruma.uCamMat.value.copy(camara.matrixWorld); uBruma.uCam.value.copy(camara.position);
    compositor.render(dt);
    fotogramas++;
    if (!avisado && pendientes === 0 && window.AM.interfaz && AM.interfaz.listo) { avisado = true; try { AM.interfaz.listo(); } catch (e) { console.error(e); } }

    // la proa en 2D (solo si no hay canoa 3D) y los rayos del sol
    if (CANOA && proa && proa.style.display !== 'none') proa.style.display = 'none';
    var ps = proyectar(camX + SOL[0] * 1e5, OJO + SOL[1] * 1e5, camZ + SOL[2] * 1e5);
    // (Pau, 12/11) fuera los rayos de sol en 2D (un abanico pintado encima de todo, aunque el sol estuviera tapado)
    if (solCSS && solCSS.style.display !== 'none') solCSS.style.display = 'none';
    if (false) {
      solCSS.style.transform = 'translate(' + ps.x + 'px,' + ps.y + 'px) rotate(' + (tiempo * 1.1) + 'deg)';
      var vsol = ps.d > 0 && SOL[1] > -0.02 ? Math.round((1 - AMBIENTE.oscuras) * (1 - AMBIENTE.noche) * 20) / 20 : 0; if (vsol !== solCSS.__v) { solCSS.__v = vsol; solCSS.style.opacity = (0.22 * vsol).toFixed(3); }
    }
    if (elVel) elVel.textContent = Math.round(Math.abs(vel) / VJ.M * 3.6) + ' km/h' + (vel < -20 ? ' ↓' : '');
    if (elDist) elDist.textContent = Math.round(camZ / VJ.M) + ' m';
    if (!congelado) requestAnimationFrame(cuadro);
  }


  // ======================= Arranque =======================
  function construir() {
    CATALOGO.forEach(prepararModelo);
    prepararKapok(); vidaSamauma(); prepararDelfin(); prepararCanoa(); prepararVuelo();
    matTierra = materialTierra();
    prepararTeatro();
    try { prepararFondo(); } catch (e) { console.error('selva de fondo', e); }
    try { prepararCriaturas(); } catch (e) { console.error('criaturas', e); }
    // compilar ya todos los programas (así no hay tirones la primera vez que aparece cada modelo)
    try {
      LOTES.forEach(function (l) { l.mallas.forEach(function (m) { m.visible = true; }); });
      if (TEATRO.g) TEATRO.g.visible = true; if (DELFIN) DELFIN.malla.visible = true;
      renderer.compile(escena, camara);
      LOTES.forEach(function (l) { l.mallas.forEach(function (m) { m.visible = false; }); });
      if (TEATRO.g) TEATRO.g.visible = false; if (DELFIN) DELFIN.malla.visible = false;
    } catch (e) { console.error(e); }
    construido = true;
    if (window.AM.interfaz && AM.interfaz.iniciar) { try { AM.interfaz.iniciar(motor); } catch (e) { console.error(e); } }
  }
  (function esperarCarga() {
    if (pendientes > 0) return setTimeout(esperarCarga, 50);
    try { construir(); } catch (e) { window.__errMundo = String(e && e.stack || e); console.error(e); }
  })();
  // #tramo=atardecer (o #z=47000) abre el viaje en ese punto
  (function () {
    var m = /tramo=(\w+)/.exec(location.hash), mz = /z=(\d+)/.exec(location.hash);
    if (m) VJ.tramos.forEach(function (t, i) { if (t.id === m[1]) camZ = t.z + ((VJ.tramos[i + 1] ? VJ.tramos[i + 1].z : VJ.FIN) - t.z) * 0.3; });
    if (mz) camZ = +mz[1];
    cielosNecesarios(VJ.en(camZ + 500));   // las fotos del cielo del primer tramo, ya desde el principio
  })();
  requestAnimationFrame(cuadro);

  // ======================= El motor para la interfaz (contrato de js/interfaz.js) =======================
  function aGrados(r) { return r * 180 / Math.PI; }
  function mirarA(yawRad, pitchRad, ms) {
    var y1 = rumbo + Math.atan2(Math.sin(yawRad - rumbo), Math.cos(yawRad - rumbo)), p1 = pitchRad == null ? pitchObj : pitchRad;
    if (ms > 0) mirarAnim = { y0: rumbo, y1: y1, p0: pitchObj, p1: p1, t0: tiempo, dur: ms / 1000 };
    else { mirarAnim = null; rumbo = yaw = y1; pitchObj = pitch = p1; }
    ultimoGiro = tiempo;
  }
  function mirarPunto(x, y, z, ms) { var dx = x - camX, dz = z - camZ, d = Math.hypot(dx, dz) || 1; mirarA(Math.atan2(dx, dz), Math.atan2(y - OJO, d), ms); }
  function samaumaFija() { var f = null; VJ.FIJOS.forEach(function (x) { if (x.samauma) f = x; }); return f ? { x: f.x, z: f.z, y: 0 } : null; }
  function piezaDe(re) { for (var i = 0; i < piezas.length; i++) if (re.test(piezas[i].tipo) || (piezas[i].samauma && re.test('samauma'))) return piezas[i]; return null; }
  var escenaMotor = null;
  var motor = {
    en: function (n, fn) { (oyentes[n] = oyentes[n] || []).push(fn); },
    ir: function (z, ms) { z = Math.max(0, Math.min(VJ.FIN, +z || 0)); if (ms > 0) viajeIr = { z0: camZ, z1: z, t0: tiempo, dur: ms / 1000 }; else { viajeIr = null; camZ = z; } vel = 0; },
    mirar: function (yawG, pitchG, ms) { mirarA((+yawG || 0) * Math.PI / 180, pitchG == null ? null : pitchG * Math.PI / 180, ms); },
    bloquear: function (si) { bloqueado = !!si; if (bloqueado) { arrastre = null; teclaRemar = 0; teclaGiro = 0; vista.classList.remove('arrastra'); } },
    efecto: function (nombre, d) { if (nombre === 'fruto') efectoFruto(d || {}); },
    sonar: function () {},
    // pequeñas coreografías de cámara y vida para las escenas de los secretos (lo demás lo pinta la interfaz)
    reproducir: function (id, d) {
      d = d || {}; escenaMotor = id;
      var o = d.objeto, p;
      if (id === 'teatro') { p = piezaDe(/^teatro$/); if (p) mirarPunto(p.x, 1300, p.z, 2600); }
      else if (id === 'mar-dulce') mirarA(Math.PI, PITCH + 0.03, 3200);
      else if (id === 'encuentro') mirarA(-0.35, -0.5, 2600);
      else if (id === 'boto') { nuevoSalto(camX + 140, camZ + 320, false); setTimeout(function () { if (escenaMotor === 'boto') nuevoSalto(camX - 260, camZ + 900, false); }, 3600); setTimeout(function () { if (escenaMotor === 'boto') nuevoSalto(camX + 380, camZ + 1200, true); }, 6500); }
      else if (id === 'sapopemas') { p = piezaDe(/samauma/); if (p) { mirarPunto(p.x, 900, p.z, 3000); p.empuje = 2.4; p.volaron = false; p.aves = { tipo: 'guacamayo', n: 6 }; despegar(p, true); } }
      else if (id === 'final') { var S0 = samaumaFija(); if (S0) mirarPunto(S0.x, 240, S0.z, 2200); }   // (12/11) lo demás lo marca js/huevos/final.js con su reloj
      else if (id === 'crecida' || id === 'vitoria-regia') { if (o && o.x != null) mirarPunto(o.x, id === 'crecida' ? 60 : 5, o.z, 2400); }
      else if (id === 'tambaqui') { if (d.x != null) mirarPunto(d.x, 0, d.z, 1600); }
      else if (id === 'rios-voladores') mirarA(yaw, 0.45, 4000);
      else if (id === 'amazonas') { for (var i = 0; i < 160 && parts.length < MAXP; i++) parts.push({ tipo: 4, x: camX + (Math.random() - 0.5) * 1600, y: 5 + Math.random() * 160, z: camZ + 150 + Math.random() * 1800, vx: (Math.random() - 0.5) * 12, vz: (Math.random() - 0.5) * 12, vy: Math.random() * 10, tam: 7, rot: Math.random() * 6, vida: 6 + Math.random() * 6, alfa: 1 }); }
    },
    // para la interfaz: dónde cae en pantalla un punto del mundo (coordenadas lógicas) y dónde está la samaúma
    proyectar: function (x, y, z) { var q = proyectar(x, y, z); return [q.x, q.y, q.d]; },
    samauma: function () { return samaumaFija(); },
    mirarPunto: function (x, y, z, ms) { mirarPunto(x, y, z, ms); },
    // el final: una tanda de luciérnagas que suben del agua delante de la samaúma
    luciernagas: function (n) { var S = samaumaFija(); if (!S) return;
      for (var k = 0; k < n && parts.length < MAXP; k++) parts.push({ tipo: 4, x: S.x + (Math.random() - 0.5) * 2200, y: 2 + Math.random() * 40, z: S.z - 300 - Math.random() * 1500,
        vx: (Math.random() - 0.5) * 14, vz: (Math.random() - 0.5) * 14, vy: 30 + Math.random() * 55, tam: 7 + Math.random() * 3, rot: Math.random() * 6, vida: 9 + Math.random() * 6, alfa: 1 }); },
    parar: function (id) { if (escenaMotor === id) escenaMotor = null; mirarA(Math.round(rumbo / 6.2832) * 6.2832, PITCH, 1600); },
    get z() { return camZ; }, get yaw() { return aGrados(yaw); }, get listo() { return construido && pendientes === 0; }
  };
  window.AM.motor = motor;

  window.__amazonia = {
    get listo() { return construido && pendientes === 0; }, get flotante() { return flotante; },
    get z() { return camZ; }, get cuenta() { return { aves: aves.length, parts: parts.length, ecos: ecos.length, piezas: piezas.length, criaturas: criaturas.length, brillos: brillos.length }; },
    paso: function (ms, v, mx) { congelado = true; var n = Math.ceil(ms / 16.67); for (var i = 0; i < n; i++) { if (v != null) vel = v; if (mx != null) objX = mx; cuadro(ultimo + 16.67); } },
    tocar: function (sx, sy) { tocar(sx, sy); },
    en: function (n, fn) { motor.en(n, fn); }, efecto: function (n, d) { motor.efecto(n, d); }, pitch: function (g) { pitchObj = pitch = g * Math.PI / 180; },
    ir: function (z, ms) { motor.ir(z, ms); },
    get tramo() { return AMBIENTE && AMBIENTE.tramo.id; },
    mirar: function (y) { yaw = rumbo = y; objX = 0; ultimoGiro = tiempo; },
    delfin: function (dz, alto, lat) { nuevoSalto(camX + (lat == null ? 160 : lat), camZ + (dz || 500), !!alto); },
    get criaturas() { return criaturas.map(function (c) { return [c.tipo, c.estado, Math.round(c.x), Math.round(c.y), Math.round(c.z - camZ)]; }); },
    criatura: function (tipo, dz, x) { for (var i = 0; i < criaturas.length; i++) { var c = criaturas[i]; if (c.tipo === tipo) { c.z = camZ + dz; if (x != null) c.x = x; c.estado = c.tipo === 'ribereno' ? 'rema' : 'quieto'; if (c.tipo === 'caiman') c.y = -14; return true; } } return false; },
    donde: function (re) { re = new RegExp(re); return piezas.filter(function (p) { return re.test(p.tipo) || (p.samauma && re.test('samauma')); }).map(function (p) { var q = proyectar(p.x, p.y + altoDe(p) * 0.5, p.z); return [p.tipo, Math.round(q.x), Math.round(q.y), Math.round(q.d), Math.round(p.x), Math.round(p.z - camZ)]; }); },
    verEntorno: function (si) { escena.background = si && entornoRT ? entornoRT.texture : null; cieloMalla.visible = !si; },
    lotes: function (re) { re = new RegExp(re || "."); return LOTES.filter(function (l) { return re.test(l.nombre); }).map(function (l) { return [l.nombre, l.mallas[0].count, l.mallas[1].count, l.mallas[0].visible]; }); },
    get loro() { return LORO ? { phi: +LORO.phi.toFixed(2), phiObj: +LORO.phiObj.toFixed(2), excit: +LORO.excit.toFixed(2), nervio: +LORO.nervio.toFixed(2), base: LORO.base, palo: LORO.palo } : null; },
    get casco() { return Array.prototype.map.call(CASCO, function (v) { return +v.toFixed(1); }); },
    get salto() { return salto ? { ph: salto.ph, visible: salto.visible } : null; },
    get info3d() { return { delfin: DELFIN && DELFIN.info, kapok: !!KAPOK, modelos: Object.keys(MODELOS).length, fallos: fallos, error: window.__errMundo || null }; },
    depura: function (k) { uAgua.uDepura.value = k; },
    get enseres() { var out = []; ENSERES.concat(LORO ? [LORO.malla] : []).forEach(function (me) { var u = me.userData || {}; var v = new THREE.Vector3(u.pie ? u.pie.x : 0, u.pie ? u.pie.y + u.alto * 0.5 : 8, u.pie ? u.pie.z : 0).applyMatrix4(me.matrixWorld).project(camara); out.push([u.nombre || 'loro', Math.round((v.x + 1) / 2 * W), Math.round((1 - v.y) / 2 * H), u.anim ? +u.anim.t.toFixed(2) : -1]); }); return out; },
    get farolNivel() { return FAROL ? +(FAROL.nivel || 0).toFixed(2) : null; },
    avesPrueba: function (tipo, n, dz, planeo, dx, vx) { for (var i = 0; i < (n || 1); i++) aves.push({ tipo: tipo, x: camX + (dx == null ? -260 : dx) + i * 70, y: 140 + i * 15, z: camZ + (dz || 700) + i * 40, vx: vx == null ? 180 : vx, vy: 8, vz: 30, fase: i * 1.7, vida: 30, retraso: 0, crucero: !planeo }); },
    holgura: function () { var peor = 1e9, info = null; trafico.forEach(function (t) { var pb = t.p; piezas.forEach(function (o) { if (o === pb || !RE_OBST.test(o.tipo)) return; if (Math.abs(o.z - pb.z) > (anchoDe(o) + anchoDe(pb)) * 0.45) return; var h = Math.abs(o.x - pb.x) - radioLateral(o) - t.rb; if (h < peor) { peor = h; info = [t.tipo, o.tipo, Math.round(pb.x), Math.round(o.x), Math.round(pb.z - o.z)]; } }); }); return trafico.length ? [Math.round(peor), info] : null; },
    soltarBarco: function (z) { proxBarco = 0; },
    aire: function () { return parts.filter(function (q) { return q.tipo === 7 || q.tipo === 8; }).map(function (q) { var p = proyectar(q.x, q.y, q.z); return [q.tipo, Math.round(p.x), Math.round(p.y), Math.round(p.d), +q.alfa.toFixed(2)]; }); },
    girarPieza: function (re, ang) { re = new RegExp(re); piezas.forEach(function (p) { if (re.test(p.tipo)) p.rotY = (p.rotY || 0) + ang; }); },
    get traficoInfo() { return { n: trafico.length, prox: +proxBarco.toFixed(1), tramo: AMBIENTE && AMBIENTE.tramo.id, camZ: Math.round(camZ), barcos: trafico.map(function (t) { return [t.tipo, Math.round(t.p.x), Math.round(t.p.z - camZ)]; }) }; },
    fov: function (g) { camara.fov = g; camara.updateProjectionMatrix(); },
    loroHaz: function (que) { var L = LORO; if (!L) return; if (que === 'aseo') { L.proxAseo = 0; L.excit = 0; L.nervio = 0; } else if (que === 'sacude') L.sacudida = 0; else if (que === 'aletea') L.aleteo = 1; else if (que === 'salto') L.proxSalto = 0; else if (typeof que === 'number') { L.phiObj = que; L.rapido = 0.6; } },
    get loroEstado() { var L = LORO; return L ? { phi: +L.phi.toFixed(2), cab: L.cab.map(function (v) { return +v.toFixed(2); }), ala: L.ala.map(function (v) { return +v.toFixed(2); }), aseo: +L.aseo.toFixed(2), sac: +L.sacudida.toFixed(2) } : null; },
    rayo: function (tipo, az, d) { var ev = TORM.rayo(tipo, az, d); return { d: Math.round(ev.d), x: Math.round(ev.x - camX), z: Math.round(ev.z - camZ) }; },
    get tormenta() { var t = TORM.tq || {}; return { s: +(t.s || 0).toFixed(3), lluvia: +(t.lluvia || 0).toFixed(2), rayos: +(t.rayos || 0).toFixed(2), viento: +(t.viento || 0).toFixed(2), arco: +(t.arco || 0).toFixed(2), flash: +TORM.flash.toFixed(2), eventos: TORM.eventos.length }; },
    raton: function (sx, sy) { raton = sx == null ? null : { x: sx, y: sy }; },
    medir: function (n) {   // ms por fotograma, esperando a la GPU
      congelado = true; var px = new Uint8Array(4), t = [];
      for (var i = 0; i < n; i++) { var a = performance.now(); cuadro(ultimo + 16.67); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); }
      t.sort(function (a, b) { return a - b; }); return 'p50 ' + t[n >> 1].toFixed(1) + ' ms · p95 ' + t[Math.floor(n * 0.95)].toFixed(1) + ' ms';
    },
    get calidad() { return CALIDAD; },
    info: function () { return { llamadas: renderer.info.render.calls, triangulos: renderer.info.render.triangles, texturas: renderer.info.memory.textures, geometrias: renderer.info.memory.geometries, programas: renderer.info.programs.length }; },
    foto: function () { var im = document.createElement('img'); im.src = lienzo.toDataURL('image/jpeg', 0.92); im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0'; lienzo.parentNode.insertBefore(im, lienzo.nextSibling); lienzo.style.visibility = 'hidden'; }
  };
})();
