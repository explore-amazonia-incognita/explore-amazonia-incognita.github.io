// Lector de modelos GLB (glTF 2.0 binario), sin dependencias.
// Devuelve las mallas con posiciones, normales, coordenadas de textura e índices ya en Float32Array/Uint32Array,
// con la transformación de cada nodo aplicada, y las imágenes de los materiales como Blob.
(function () {
  'use strict';
  function b64(s) { var bin = atob(s), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
  var TAM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  var TIPO = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  function mul(a, b) {   // matrices 4×4 por columnas
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; }
    return o;
  }
  function matNodo(n) {
    if (n.matrix) return new Float32Array(n.matrix);
    var t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1];
    var x = q[0], y = q[1], z = q[2], w = q[3];
    return new Float32Array([
      (1 - 2 * (y * y + z * z)) * s[0], (2 * (x * y + z * w)) * s[0], (2 * (x * z - y * w)) * s[0], 0,
      (2 * (x * y - z * w)) * s[1], (1 - 2 * (x * x + z * z)) * s[1], (2 * (y * z + x * w)) * s[1], 0,
      (2 * (x * z + y * w)) * s[2], (2 * (y * z - x * w)) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
      t[0], t[1], t[2], 1]);
  }
  window.leerGLB = function (base64) {
    var buf = b64(base64), dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('No es un GLB');
    var pos = 12, json = null, bin = null;
    while (pos < buf.byteLength) {
      var largo = dv.getUint32(pos, true), tipo = dv.getUint32(pos + 4, true);
      if (tipo === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, pos + 8, largo)));
      else if (tipo === 0x004E4942) bin = buf.slice(pos + 8, pos + 8 + largo);
      pos += 8 + largo;
    }
    function acc(i) {
      var a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = TIPO[a.componentType], n = TAM[a.type];
      var ini = (bv.byteOffset || 0) + (a.byteOffset || 0), paso = bv.byteStride || 0, cuantos = a.count * n;
      if (!paso || paso === n * T.BYTES_PER_ELEMENT) return new T(bin.slice(ini, ini + cuantos * T.BYTES_PER_ELEMENT));
      var o = new T(cuantos), v = new DataView(bin), tb = T.BYTES_PER_ELEMENT;
      for (var e = 0; e < a.count; e++) for (var c = 0; c < n; c++) {
        var off = ini + e * paso + c * tb;
        o[e * n + c] = T === Float32Array ? v.getFloat32(off, true) : T === Uint16Array ? v.getUint16(off, true) : T === Uint32Array ? v.getUint32(off, true) : T === Uint8Array ? v.getUint8(off) : v.getInt16(off, true);
      }
      return o;
    }
    function imagen(texIdx) {
      if (texIdx == null || !json.textures) return null;
      var t = json.textures[texIdx], im = json.images[t.source], bv = json.bufferViews[im.bufferView];
      return new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType || 'image/png' });
    }
    var mallas = [];
    function visitar(ni, padre) {
      var n = json.nodes[ni], M = mul(padre, matNodo(n));
      if (n.mesh != null) json.meshes[n.mesh].primitives.forEach(function (p) {
        var P = acc(p.attributes.POSITION), N = p.attributes.NORMAL != null ? acc(p.attributes.NORMAL) : null, UV = p.attributes.TEXCOORD_0 != null ? acc(p.attributes.TEXCOORD_0) : null;
        var I = p.indices != null ? acc(p.indices) : null;
        var C = null;
        if (p.attributes.COLOR_0 != null) {   // color por vértice (lineal): a RGBA de 0 a 1
          var ac = json.accessors[p.attributes.COLOR_0], cr = acc(p.attributes.COLOR_0), nc = TAM[ac.type], div = ac.componentType === 5126 ? 1 : ac.componentType === 5123 ? 65535 : 255;
          C = new Float32Array(ac.count * 4);
          for (var e = 0; e < ac.count; e++) { C[e * 4] = cr[e * nc] / div; C[e * 4 + 1] = cr[e * nc + 1] / div; C[e * 4 + 2] = cr[e * nc + 2] / div; C[e * 4 + 3] = nc > 3 ? cr[e * nc + 3] / div : 1; }
        }
        // aplica la transformación del nodo
        for (var v = 0; v < P.length; v += 3) {
          var x = P[v], y = P[v + 1], z = P[v + 2];
          P[v] = M[0] * x + M[4] * y + M[8] * z + M[12]; P[v + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]; P[v + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
          if (N) { var a = N[v], b = N[v + 1], c = N[v + 2], nx = M[0] * a + M[4] * b + M[8] * c, ny = M[1] * a + M[5] * b + M[9] * c, nz = M[2] * a + M[6] * b + M[10] * c, l = Math.hypot(nx, ny, nz) || 1; N[v] = nx / l; N[v + 1] = ny / l; N[v + 2] = nz / l; }
        }
        var mat = p.material != null ? json.materials[p.material] : {}, pbr = mat.pbrMetallicRoughness || {};
        mallas.push({
          pos: P, nor: N, uv: UV, col: C, idx: I ? (I instanceof Uint32Array ? I : new Uint32Array(I)) : null,
          color: imagen(pbr.baseColorTexture && pbr.baseColorTexture.index),
          normal: imagen(mat.normalTexture && mat.normalTexture.index),
          rugosidad: imagen(pbr.metallicRoughnessTexture && pbr.metallicRoughnessTexture.index),
          factor: pbr.baseColorFactor || [1, 1, 1, 1], metal: pbr.metallicFactor != null ? pbr.metallicFactor : 1, rugo: pbr.roughnessFactor != null ? pbr.roughnessFactor : 1
        });
      });
      (n.children || []).forEach(function (h) { visitar(h, M); });
    }
    var I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    (json.scenes[json.scene || 0].nodes).forEach(function (n) { visitar(n, I4); });
    return mallas;
  };
})();
