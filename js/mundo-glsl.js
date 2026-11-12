// Amazonia Incognita · los sombreadores del motor Three.js (cielo, agua, ondas, partículas, cartas, etalonado)
// y los trozos que se inyectan en los materiales PBR (viento, cortezas, hojas a contraluz).
// Todo el GLSL vive aquí para que js/mundo.js se lea como la lógica del mundo.
//
// Coordenadas: el mundo «lógico» del viaje es el del motor propio (x a la derecha, z río arriba).
// Three.js dibuja con X = −x (así la vista no sale en espejo); los sombreadores que trabajan con
// datos lógicos (agua, cielo, delfín) convierten con vec3(-X, Y, Z).
(function () {
  'use strict';
  var AM = window.AM = window.AM || {};
  var LARGO = 15000;

  // ---------- ruido compartido ----------
  var RUIDO =
    'float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float h31(vec3 p){ p=fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }\n' +
    'float ruido(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }\n' +
    'float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<6;i++){ s+=a*ruido(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=0.5; } return s; }\n';

  // ---------- la niebla del tramo (la misma fórmula para todos los materiales) ----------
  // sube suave hasta el 90 % y el último 10 % se cierra antes del final del pasillo, para que nada aparezca de golpe
  var NIEBLA_FN = 'float factorNiebla(float d, float cerca, float lejos){ return smoothstep(cerca,lejos,d)*0.9+0.1*smoothstep(' + (LARGO * 0.7).toFixed(1) + ',' + (LARGO * 0.95).toFixed(1) + ',d); }\n';
  // (Pau, 12/11: «se notan cortes en la bruma») la bruma del río, calculada en cada superficie (no sobre la imagen):
  // la cantidad de bruma entre el ojo y ese punto, más densa a ras del agua; densidad = fract(fogNear)/0.9
  var BRUMA_GLSL =
    'float hNb(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float rNb(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hNb(i),hNb(i+vec2(1,0)),f.x),mix(hNb(i+vec2(0,1)),hNb(i+vec2(1,1)),f.x),f.y); }\n' +
    'float brumaRio(vec3 W, vec3 C, float dens){\n' +
    '  vec3 d=W-C; float L=length(d); float y0=max(C.y,0.0), y1=max(W.y,0.0), dy=y1-y0;\n' +
    '  float H1=60.0, H2=210.0; float col=abs(dy)>0.5 ? (H1*(exp(-y0/H1)-exp(-y1/H1))+0.35*H2*(exp(-y0/H2)-exp(-y1/H2)))/dy : exp(-y0/H1)+0.35*exp(-y0/H2);\n' +
    '  vec3 M=C+d*0.5; float n=(rNb(M.xz/2200.0)*0.6+rNb(M.xz/650.0+3.3)*0.4)*0.5+(rNb(W.xz/2200.0+1.7)*0.6+rNb(W.xz/650.0+7.1)*0.4)*0.5;\n' +
    '  float jiron=0.45+1.1*smoothstep(0.3,0.75,n);\n' +
    '  return 1.0-exp(-dens*0.00028*col*L*jiron*smoothstep(80.0,1400.0,L));\n' +
    '}\n';
  var FOG_PARS_V = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vNieblaW;\n#endif\n';
  var FOG_V = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vNieblaW = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);\n#endif\n';
  var FOG_PARS_F = '#ifdef USE_FOG\n uniform vec3 fogColor; varying float vFogDepth; varying vec3 vNieblaW;\n#ifdef FOG_EXP2\n uniform float fogDensity;\n#else\n uniform float fogNear; uniform float fogFar;\n#endif\n' + BRUMA_GLSL + '#endif\n';
  var FOG_FRAGMENT =
    '#ifdef USE_FOG\n' +
    '#ifndef FOG_EXP2\n' +
    '  { float dnb=fract(fogNear)/0.9; if(dnb>0.002){ gl_FragColor.rgb=mix(gl_FragColor.rgb, fogColor*1.06, brumaRio(vNieblaW, cameraPosition, dnb)); } }\n' +
    '#endif\n' +
    '  float fogFactor = smoothstep( fogNear, fogFar, vFogDepth )*0.72 + 0.28*smoothstep(' + (LARGO * 0.78).toFixed(1) + ',' + (LARGO * 0.99).toFixed(1) + ', vFogDepth );\n' +
    '  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n' +
    '#endif\n';

  // ---------- El cielo: foto equirectangular 360° (o, sin foto, el de código) ----------
  var CIELO_GLSL =
    'uniform vec3 uSol, uZenit, uHoriz, uSolCol, uColBruma, uAmb, uRayoDir; uniform float uNubes, uOscuras, uNoche, uT, uRayo, uArco, uDisco;\n' + RUIDO +
    'vec3 cieloCodigo(vec3 d){\n' +
    '  float el=d.y, e=max(el,0.0);\n' +
    '  vec3 col=mix(uHoriz,uZenit,pow(e,0.5));\n' +
    '  float sd=max(dot(d,uSol),0.0), alto=smoothstep(-0.10,0.03,uSol.y);\n' +
    '  col+=uSolCol*(pow(sd,5.0)*0.22+pow(sd,48.0)*0.45)*alto*(1.0-uOscuras*0.8);\n' +
    '  col+=uSolCol*smoothstep(0.99935,0.9997,sd)*4.0*(1.0-uOscuras)*alto;\n' +
    '  if(uNoche>0.01){\n' +
    '    vec3 q=d*420.0; vec3 ci=floor(q); float h=h31(ci); vec3 f=fract(q)-0.5; float r=length(f);\n' +
    '    vec3 mw=normalize(vec3(0.35,0.55,-0.76)); float dm=dot(d,mw); float banda=exp(-dm*dm*22.0);\n' +
    '    float est=step(0.9962-banda*0.006,h)*smoothstep(0.45,0.0,r)*(0.35+0.65*fract(h*97.0));\n' +
    '    float nube=fbm(vec2(atan(d.x,d.z)*3.0,d.y*6.0)+3.0)*banda;\n' +
    '    col+=(vec3(0.9,0.95,1.0)*est*1.7+vec3(0.55,0.55,0.72)*nube*0.32)*uNoche*smoothstep(0.0,0.07,el);\n' +
    '  }\n' +
    '  if(el>0.0 && uNubes>0.01){\n' +
    '    vec2 uv=d.xz/(el+0.12)*0.55+vec2(uT*0.004,uT*0.009);\n' +
    '    float n=fbm(uv*1.4);\n' +
    '    float cov=smoothstep(1.0-uNubes*0.85-0.08,1.0-uNubes*0.85+0.28,n);\n' +
    '    float n2=fbm(uv*1.4+uSol.xz*0.06);\n' +
    '    float ilum=clamp(0.6+(n-n2)*3.0,0.0,1.0);\n' +
    '    vec3 nc=mix((uZenit*0.6+uHoriz*0.4)*0.75, uSolCol*1.05+uHoriz*0.3, ilum*alto);\n' +
    '    nc+=uSolCol*pow(sd,8.0)*0.6*alto;\n' +
    '    nc=mix(nc, vec3(0.15,0.16,0.19)+uHoriz*0.1, uOscuras);\n' +
    '    nc=mix(nc, uZenit*1.4, uNoche*0.85);\n' +
    '    col=mix(col,nc,cov*smoothstep(0.0,0.16,el)*0.97);\n' +
    '  }\n' +
    '  col=mix(col,uColBruma,(1.0-smoothstep(0.0,0.10,abs(el)))*0.55);\n' +
    '  return pow(max(col,0.0),vec3(2.2));\n' +          // el cielo de código está en gamma: a lineal
    '}\n';
  var CIELO_VS =
    'varying vec3 vDir;\n' +
    'void main(){ vDir=position; vec4 p=projectionMatrix*vec4(mat3(viewMatrix)*position,1.0); gl_Position=p.xyww; }';
  var CIELO_FS =
    CIELO_GLSL +
    'uniform sampler2D uFotoA, uFotoB; uniform vec4 uPanA, uPanB; uniform float uMezC; varying vec3 vDir;\n' +
    // los colores del arcoíris: h = 0 violeta (dentro) … 1 rojo (fuera)
    'vec3 arcoCol(float h){ return vec3(smoothstep(0.42,0.8,h)+0.25*exp(-pow(h/0.1,2.0)), exp(-pow((h-0.55)/0.2,2.0)), exp(-pow((h-0.18)/0.17,2.0))); }\n' +
    // la foto: el frente del río en el centro, el horizonte a media altura; la costura (detrás) sin rayas
    // banda > 0,5: el formato en alta (herramientas/cielos_hd.py): solo de −12° a +90°, sin costura detrás
    'vec3 panorama(sampler2D t, vec3 d, float expo, vec2 flujo, float banda){\n' +
    '  float az=atan(d.x,d.z), el=asin(clamp(d.y,-1.0,1.0));\n' +
    // (sin deriva global: si la foto girase, la costura y el sol dejarían de estar donde tocan; las nubes, en cambio,
    // se mueven con un campo de flujo suave que no llega a la línea de la selva del horizonte)
    '  float u0=clamp(0.5+az/6.28318+flujo.x,0.0006,0.9994);\n' +
    '  vec2 uv=vec2(u0, banda>0.5 ? clamp((1.5707963-el)/1.7802358,0.001,0.999) : 0.5-el/3.14159+flujo.y);\n' +
    '  vec2 u2=vec2(fract(uv.x+0.5),uv.y);\n' +
    '  vec2 dx=dFdx(uv), dy=dFdy(uv), dx2=dFdx(u2), dy2=dFdy(u2);\n' +
    '  if(abs(dx2.x)<abs(dx.x)) dx.x=dx2.x; if(abs(dy2.x)<abs(dy.x)) dy.x=dy2.x;\n' +
    '  vec3 c=textureGrad(t,uv,dx,dy).rgb;\n' +
    // detrás, donde se juntan los bordes de la foto, se funden los dos lados (sin costura)
    '  float w=banda>0.5?0.0:smoothstep(3.02,3.1416,abs(az))*0.5;\n' +          // una franja de unos 7° justo detrás
    '  if(w>0.0){ vec2 um=vec2(1.0-u0,uv.y); c=mix(c,textureGrad(t,um,dx,dy).rgb,w); }\n' +
    '  return c*expo;\n' +
    '}\n' +
    // (Pau, 12/11: «el cielo no es tan realista») 1) las nubes de la foto viven: se desplazan y cambian de forma
    // despacio (dos fases de un campo de flujo que se funden, sin saltos); 2) encima de la cabeza, donde la foto solo
    // tenía degradado, una capa de nubes propia que se mueve con el viento y está iluminada por el sol del tramo
    'vec2 campo(vec3 d){ vec2 q=vec2(atan(d.x,d.z)*1.6,d.y*5.0); return vec2(0.9+ruido(q*1.3+3.1)-0.5, (ruido(q*1.7+9.2)-0.5)*0.5); }\n' +
    'vec3 conFlujo(sampler2D t, vec3 d, float expo){\n' +
    '  float w=smoothstep(0.035,0.14,d.y); if(w<0.001) return panorama(t,d,expo,vec2(0.0),0.0);\n' +
    '  vec2 f=campo(d)*vec2(0.006,0.004)*w; float t1=fract(uT*0.012), t2=fract(uT*0.012+0.5);\n' +
    '  vec3 c1=panorama(t,d,expo,f*(t1-0.5),0.0), c2=panorama(t,d,expo,f*(t2-0.5),0.0);\n' +
    '  return mix(c1,c2,abs(1.0-2.0*t1)); }\n' +
    'float fbm4(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*ruido(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(3.1,1.7); a*=0.5; } return s/0.9375; }\n' +
    'vec3 nubesAltas(vec3 d, vec3 col, float hd){\n' +
    // con los cielos en alta, la foto llega casi arriba: las nubes propias solo cerca del cenit
    '  float k=mix(smoothstep(0.28,0.62,d.y), smoothstep(0.8,0.97,d.y), hd)*min(1.0,0.35+uNubes*0.9)*(1.0-uNoche); if(k<0.002) return col;\n' +
    '  vec2 p=d.xz/(d.y+0.1)*2.8+vec2(uT*0.012,uT*0.007);\n' +
    '  vec2 q=vec2(fbm4(p*0.8+1.7),fbm4(p*0.8+8.3));\n' +              // las deforma (no salen redondas ni en filas)
    '  float n=fbm4(p*1.5+q*0.7)*0.8+fbm(p*4.0+q)*0.2, n2=fbm4(p*1.5+q*0.7+uSol.xz*0.09)*0.8+fbm(p*4.0+q+uSol.xz*0.2)*0.2;\n' +
    '  float cub=smoothstep(0.56-uNubes*0.16,0.72-uNubes*0.16,n);\n' +
    '  float luz=clamp(0.55+(n-n2)*4.0,0.0,1.0);\n' +              // iluminadas del lado del sol, más oscuras debajo
    '  float alto=smoothstep(-0.08,0.15,uSol.y);\n' +
    '  vec3 sombra=(uZenit*0.55+uHoriz*0.35)*mix(0.9,0.55,uOscuras);\n' +
    '  vec3 lit=mix(uHoriz*0.7,uSolCol*0.95+uHoriz*0.25,alto)*mix(1.0,0.45,uOscuras);\n' +
    '  vec3 nc=pow(max(mix(sombra,lit,luz),0.0),vec3(2.2));\n' +
    '  return mix(col,nc,cub*k*0.95); }\n' +
    'void main(){\n' +
    '  vec3 D=normalize(vDir); vec3 d=vec3(-D.x,D.y,D.z);\n' +            // a coordenadas lógicas
    '  d.y=max(d.y,-0.002);\n' +
    // (12/11) sin el campo de flujo: mezclaba dos copias desplazadas de la foto y la emborronaba
    '  vec3 a=uPanA.x>0.5?panorama(uFotoA,d,uPanA.y,vec2(0.0),uPanA.z):cieloCodigo(d);\n' +
    '  vec3 b=uPanB.x>0.5?panorama(uFotoB,d,uPanB.y,vec2(0.0),uPanB.z):cieloCodigo(d);\n' +
    '  vec3 col=mix(a,b,uMezC);\n' +
    '  col=nubesAltas(d,col,mix(uPanA.z,uPanB.z,uMezC));\n' +
    // el sol que sale (o se pone) cuando la foto no lo trae: disco algo achatado junto al horizonte, corona y resplandor
    '  if(uDisco>0.001){ vec3 ds=normalize(vec3(d.x,(d.y-uSol.y)*1.18+uSol.y,d.z)); float ang=acos(clamp(dot(ds,uSol),-1.0,1.0));\n' +
    '    float disco=1.0-smoothstep(0.0082,0.0098,ang);\n' +
    '    float corona=exp(-ang*ang/0.0011)*0.9+exp(-ang/0.11)*0.28+exp(-ang/0.42)*0.09;\n' +
    '    vec3 sc=pow(max(uSolCol,0.0),vec3(1.6));\n' +
    '    col+=sc*uDisco*(disco*30.0*vec3(1.0,0.92,0.8)+corona*1.3)*smoothstep(-0.015,0.012,d.y); }\n' +
    // el relámpago: las nubes se encienden por dentro (su propia forma), mucho más alrededor del rayo
    '  if(uRayo>0.001){ float cr=max(dot(d,uRayoDir),0.0); float foco=pow(cr,40.0)*5.0+pow(cr,8.0)*1.4+pow(cr,2.0)*0.3+0.1;\n' +
    '    col+=(col*6.0+vec3(0.03,0.034,0.05))*uRayo*foco*smoothstep(-0.03,0.2,d.y); }\n' +
    // el arcoíris de cuando escampa: a 42° del punto opuesto al sol (rojo fuera), el secundario a 51° (al revés)
    // y la banda oscura de Alejandro entre los dos; más vivo abajo, donde la lluvia que se va está más cerca
    '  if(uArco>0.001){ float ang=degrees(acos(clamp(dot(d,-uSol),-1.0,1.0)));\n' +
    '    float lum=dot(col,vec3(0.2126,0.7152,0.0722));\n' +
    '    float h1=(ang-40.5)/1.9, h2=(ang-50.3)/3.3;\n' +
    '    vec3 a1=arcoCol(clamp(h1,0.0,1.0))*smoothstep(-0.35,0.05,h1)*(1.0-smoothstep(0.95,1.35,h1));\n' +
    '    vec3 a2=arcoCol(clamp(1.0-h2,0.0,1.0))*smoothstep(-0.3,0.05,h2)*(1.0-smoothstep(0.95,1.3,h2));\n' +
    '    float vis=uArco*smoothstep(-0.004,0.05,d.y)*(1.0-0.55*smoothstep(0.25,0.75,d.y))*smoothstep(-0.03,0.04,uSol.y);\n' +
    '    col*=1.0+vis*(0.10*(1.0-smoothstep(36.0,40.5,ang))-0.09*smoothstep(42.6,43.6,ang)*(1.0-smoothstep(49.2,50.3,ang)));\n' +
    '    col+=(a1*0.55+a2*0.2)*(lum*1.1+0.004)*vis; }\n' +
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}';

  // la luz de entorno: las dos fotos del cielo mezcladas en un equirectangular pequeño (luego PMREM)
  var MEZCLA_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
  var MEZCLA_FS =
    'uniform sampler2D uA, uB; uniform float uT, uExpoA, uExpoB, uBandaA, uBandaB; varying vec2 vUv;\n' +
    // el equirect de Three tiene u=0,5 hacia −X y v=0 abajo; la foto, el frente (+Z) en el centro y v=0 arriba
    'void main(){ vec2 uv=vec2(fract(vUv.x-0.25),1.0-vUv.y); float el=(vUv.y-0.5)*3.14159265; vec2 ub=vec2(uv.x,clamp((1.5707963-el)/1.7802358,0.001,0.999));\n' +
    '  vec3 a=textureLod(uA,uBandaA>0.5?ub:uv,2.0).rgb*uExpoA, b=textureLod(uB,uBandaB>0.5?ub:uv,2.0).rgb*uExpoB; gl_FragColor=vec4(mix(a,b,uT),1.0); }';

  // ---------- Simulación de ondas (ping-pong 512² sobre 2048 u, toroidal) ----------
  var SIM_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
  var SIM_FS =
    'uniform sampler2D uPrev; uniform float uAmort, uTamMundo; uniform int uN; uniform vec4 uGotas[32]; uniform float uEsp[32]; uniform vec2 uCanoaUV;\n' +
    'varying vec2 vUv;\n' +
    'void main(){\n' +
    '  vec2 e=1.0/vec2(textureSize(uPrev,0));\n' +
    '  vec4 a=texture(uPrev,vUv);\n' +
    '  float s=texture(uPrev,vUv+vec2(e.x,0.0)).r+texture(uPrev,vUv-vec2(e.x,0.0)).r+texture(uPrev,vUv+vec2(0.0,e.y)).r+texture(uPrev,vUv-vec2(0.0,e.y)).r;\n' +
    '  float n=(s*0.5-a.g)*uAmort;\n' +
    // la espuma: se difunde un poco, se deshace despacio (≈ 8 s a la mitad) y nace donde la ola rompe
    '  float eb=(texture(uPrev,vUv+vec2(e.x,0.0)).b+texture(uPrev,vUv-vec2(e.x,0.0)).b+texture(uPrev,vUv+vec2(0.0,e.y)).b+texture(uPrev,vUv-vec2(0.0,e.y)).b)*0.25;\n' +
    '  float esp=mix(a.b,eb,0.12)*0.99855;\n' +
    '  float pend=abs(texture(uPrev,vUv+vec2(e.x,0.0)).r-texture(uPrev,vUv-vec2(e.x,0.0)).r)+abs(texture(uPrev,vUv+vec2(0.0,e.y)).r-texture(uPrev,vUv-vec2(0.0,e.y)).r);\n' +
    '  esp+=max(0.0,pend-4.0)*0.004;\n' +
    '  for(int i=0;i<32;i++){ if(i>=uN) break; vec4 g=uGotas[i];\n' +
    '    vec2 d=(fract(vUv-g.xy+0.5)-0.5)*uTamMundo; float k=exp(-dot(d,d)/(g.w*g.w)); n+=g.z*k; esp+=uEsp[i]*k; }\n' +
    // el mapa da la vuelta (2048 u): lejos de la canoa se borra, para que la espuma de detrás no salga delante
    '  vec2 rel=(fract(vUv-uCanoaUV+0.5)-0.5)*uTamMundo; esp*=1.0-smoothstep(820.0,960.0,length(rel));\n' +
    '  gl_FragColor=vec4(clamp(n,-40.0,40.0),a.r,clamp(esp,0.0,3.0),1.0);\n' +
    '}';

  // ---------- El agua ----------
  // Todo en coordenadas lógicas (como el motor propio) y en luz lineal. El reflejo viene de una cámara espejo
  // a media resolución (uMatRefl lleva un punto del mundo a su imagen) y las olas lo rompen.
  var AGUA_VS =
    'uniform vec3 uCamL; varying vec3 vW; varying float vProf;\n' +
    'void main(){ vec3 p=vec3(-uCamL.x+position.x*60000.0, 0.0, uCamL.z+position.y*60000.0);\n' +
    '  vW=p; vec4 mv=viewMatrix*vec4(p,1.0); vProf=-mv.z; gl_Position=projectionMatrix*mv; }';
  var AGUA_FS =
    'uniform float uCasco[27];\n' +
    'uniform vec3 uCanoa; uniform sampler2D uRefl, uNorm, uSim; uniform mat4 uMatRefl; uniform float uT, uTamMundo, uCorriente, uRachaZ, uRacha, uCalma, uNegra, uLluvia, uNiebla, uFarol, uExpoRefl;\n' +
    'uniform vec3 uCamL, uSol, uColBruma, uAguaCol, uSolCol, uAmb, uFarolL; uniform float uNieblaCerca, uNieblaLejos, uDepura, uPreLl, uLluviaI, uDisco, uNeb; uniform vec4 uMuro; uniform sampler2D uEstela; uniform vec2 uEstelaD;\n' +
    'uniform sampler2DShadow uSombra; uniform mat4 uSombraMat; uniform float uConSombra, uSombraTam; uniform sampler2D uBorde; uniform vec2 uBordeZ; uniform vec3 uTurbio;\n' +
    'varying vec3 vW; varying float vProf;\n' + NIEBLA_FN + BRUMA_GLSL +
    // la sombra del sol (la misma que proyectan árboles y orillas sobre la tierra), con PCF de 4 muestras y borde suave
    'float sombraAgua(vec3 w){ if(uConSombra<0.5) return 1.0; vec4 c=uSombraMat*vec4(w,1.0); c.xyz/=c.w;\n' +
    '  if(c.x<0.0||c.x>1.0||c.y<0.0||c.y>1.0||c.z>1.0) return 1.0;\n' +
    '  float b=c.z-0.0008, tx=1.6/uSombraTam;\n' +
    '  float s=texture(uSombra,vec3(c.xy+vec2(-tx,-tx),b))+texture(uSombra,vec3(c.xy+vec2(tx,-tx),b))+texture(uSombra,vec3(c.xy+vec2(-tx,tx),b))+texture(uSombra,vec3(c.xy+vec2(tx,tx),b));\n' +
    '  return mix(1.0,s*0.25,smoothstep(0.0,0.06,min(min(c.x,1.0-c.x),min(c.y,1.0-c.y)))); }\n' +
    'vec3 nm(vec2 uv){ vec3 n=texture(uNorm,uv).rgb*2.0-1.0; return vec3(n.x,n.z,n.y); }\n' +
    // cuánto llueve en cada punto del río: unas gotas gordas antes del muro, el muro y la lluvia que se va
    'float lluviaZ(float z){ float m=smoothstep(uMuro.x,uMuro.y,z); return max(smoothstep(uMuro.x-uPreLl,uMuro.x-uPreLl*0.45,z)*0.14*(1.0-m), m*(1.0-smoothstep(uMuro.z,uMuro.w,z)))*uLluviaI; }\n' +
    // la estela: por cada tramo de 16 u de río, cuándo pasó la canoa, a qué velocidad y por qué x
    'vec4 estelaEn(float z){ float i0=floor(z/uEstelaD.y); vec4 a=texture(uEstela,vec2((mod(i0,uEstelaD.x)+0.5)/uEstelaD.x,0.5)); return abs(a.w-i0)<0.5?a:vec4(-1e5,0.0,0.0,0.0); }\n' +
    'float hA(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    // los anillos de las gotas: tres rejillas desplazadas, cada celda con su gota a destiempo (la pendiente del anillo)
    'vec2 anillos(vec2 p, float t, float dens){ vec2 n=vec2(0.0);\n' +
    '  for(int k=0;k<3;k++){ float fk=float(k); vec2 q=p/(17.0+fk*6.0)+vec2(fk*0.37,fk*0.61); vec2 i=floor(q), f=fract(q);\n' +
    '    float h=hA(i+fk*19.1); if(fract(h*91.7)>dens) continue; vec2 c=0.3+0.4*vec2(h,fract(h*41.3));\n' +
    '    float ph=fract(t*(0.9+0.5*fract(h*7.7))+h*13.0); vec2 dd=f-c; float r=length(dd);\n' +
    '    float x=(r-0.02-ph*0.3)*34.0; float a=(1.0-ph)*(1.0-ph);\n' +
    '    n+=dd/(r+1e-3)*sin(x*1.6)*exp(-x*x*0.3)*a; }\n' +
    '  return n; }\n' +
    'void main(){\n' +
    '  vec3 vP=vec3(-vW.x,0.0,vW.z);\n' +
    // dentro del casco no hay agua: el perfil interior de la canoa (medido en su geometría, cada 10 u de proa a popa)
    '  if(uCanoa.z>0.5){ float zl=-(vP.z-uCanoa.y); float fi=(zl+130.0)/10.0; if(fi>0.0&&fi<26.0){ int i0=int(floor(fi)); float hw=mix(uCasco[i0],uCasco[i0+1],fract(fi)); if(abs(vP.x-uCanoa.x)<hw) discard; } }\n' +
    '  vec3 V=uCamL-vP; float dist=length(V); V/=dist;\n' +
    '  float lejos=smoothstep(300.0,9000.0,dist);\n' +
    '  vec2 p=vP.xz; float t=uT;\n' +
    '  float racha=uRacha*exp(-pow((vP.z-uRachaZ)/700.0,2.0));\n' +
    '  vec3 n1=nm(p/900.0+vec2(0.013*t,-uCorriente/900.0));\n' +
    '  vec3 n2=nm(p/310.0*mat2(0.8,-0.6,0.6,0.8)+vec2(-0.02*t,-uCorriente/310.0*0.9));\n' +
    '  vec3 n3=nm(p/95.0*mat2(0.6,0.8,-0.8,0.6)+vec2(0.031*t+racha*0.3,-uCorriente/95.0*0.8));\n' +
    '  vec3 n4=nm(p/36.0+vec2(0.08*t,-0.11*t));\n' +
    '  float k=1.0-uCalma*0.75; n1*=k; n2*=k; n3*=k;\n' +
    '  float ll=lluviaZ(vP.z);\n' +
    '  n4*=1.0+ll*1.5; racha+=ll*0.6;\n' +
    // la estela larga: una V que se abre (los brazos de Kelvin, a ≈19,5°), una franja central de espuma que se ensancha
    // y se deshace, y después la «calma de estela» (una banda más lisa que refleja mejor)
    '  vec4 E=estelaEn(vP.z); float edad=uT-E.x; float eCentro=0.0, eBrazo=0.0, eLiso=0.0; vec2 eN=vec2(0.0);\n' +
    '  if(edad>0.0 && edad<120.0 && E.y>40.0){ float vk=clamp((E.y-40.0)/600.0,0.0,1.0); float dxs=vP.x-E.z, dx=abs(dxs);\n' +
    '    float an=18.0+edad*4.5; eCentro=exp(-dx*dx/(an*an))*exp(-edad/16.0)*vk;\n' +
    '    eLiso=exp(-dx*dx/(an*an*2.2))*(1.0-exp(-edad/6.0))*exp(-edad/70.0)*vk;\n' +
    '    float br=14.0+edad*E.y*0.354*0.5, aw=10.0+edad*4.0; float u=(dx-br)/aw; eBrazo=exp(-u*u)*exp(-edad/9.0)*vk;\n' +
    // el brazo son olitas en fila (crestas oblicuas que se desplazan), no una rampa: rompen el reflejo en una línea rizada
    '    float fa=(dx*0.94+vP.z*0.34)/4.5-uT*7.0; float cr=sin(fa)*(0.6+0.4*sin(fa*0.37+dx*0.05));\n' +
    '    eN=vec2(sign(dxs)*(-2.0*u*eBrazo)*0.04+sign(dxs)*cr*eBrazo*0.16, cr*eBrazo*0.08); }\n' +
    '  vec3 N=vec3(0.0,1.0,0.0)+vec3(eN.x,0.0,eN.y)+vec3(n1.x,0.0,n1.z)*0.17+vec3(n2.x,0.0,n2.z)*0.13*(1.0-lejos*0.6)+vec3(n3.x,0.0,n3.z)*(0.09+racha*0.25)*(1.0-lejos)+vec3(n4.x,0.0,n4.z)*racha*0.35*(1.0-lejos);\n' +
    '  vec2 su=fract(p/uTamMundo); vec2 e=1.0/vec2(textureSize(uSim,0));\n' +
    '  float hL=texture(uSim,su-vec2(e.x,0.0)).r, hR=texture(uSim,su+vec2(e.x,0.0)).r, hD=texture(uSim,su-vec2(0.0,e.y)).r, hU=texture(uSim,su+vec2(0.0,e.y)).r, h0=texture(uSim,su).r;\n' +
    '  float pesoSim=1.0-smoothstep(650.0,1000.0,length(vP.xz-uCamL.xz));\n' +
    '  N+=vec3(hL-hR,0.0,hD-hU)*0.16*pesoSim;\n' +
    // rizos capilares, siempre, muy finos, solo cerca de la canoa
    '  float cerca=1.0-smoothstep(120.0,700.0,dist);\n' +
    '  vec3 n5=nm(p/11.0*mat2(0.8,0.6,-0.6,0.8)+vec2(0.17*t,0.05*t)), n6=nm(p/6.5+vec2(-0.09*t,0.21*t));\n' +
    '  N+=(vec3(n5.x,0.0,n5.z)*0.05+vec3(n6.x,0.0,n6.z)*0.035)*cerca*(1.0-uCalma*0.5)*(1.0-eLiso*0.7)*(1.0+eCentro*2.5);\n' +
    '  if(ll>0.01){ float ca=1.0-smoothstep(250.0,1700.0,dist); if(ca>0.0){ vec2 an=anillos(p,t,0.35+ll*0.65); N+=vec3(an.x,0.0,an.y)*0.3*ca*min(1.0,ll*2.5); } }\n' +
    '  N=normalize(N);\n' +
    // la orilla: a qué distancia está el barro (la textura lleva el borde de cada lado a lo largo del río)
    '  vec3 bd=texture(uBorde,vec2(clamp((vP.z-uBordeZ.x)/uBordeZ.y,0.0,1.0),0.5)).rgb;\n' +
    '  float sB=abs(vP.x)-(vP.x<0.0?bd.r:bd.g);\n' +
    '  float turb=smoothstep(-560.0,-50.0,sB)*(1.0-bd.b*0.6);\n' +
    '  float lin=smoothstep(-105.0,-62.0,sB)*(1.0-smoothstep(-58.0,-44.0,sB))*(1.0-bd.b);\n' +
    // el reflejo: la imagen de la cámara espejo, rota por las olas (hacia abajo en pantalla, como el motor propio)
    '  vec4 pr=uMatRefl*vec4(vW,1.0); vec2 ruv=pr.xy/pr.w;\n' +
    '  vec2 off=N.xz*vec2(0.9,0.6)*(0.032/(1.0+dist/700.0));\n' +
    '  vec2 sx=sign(dFdx(ruv.x)+1e-9)*vec2(1.0), sy=vec2(sign(dFdy(ruv.y)+1e-9));\n' +
    '  vec2 ruv2=ruv+vec2(off.x*sx.x, -abs(off.y)*sy.y);\n' +
    // el reflejo se emborrona con el viento, la lluvia y el agua turbia de la orilla (mipmaps + 4 muestras)
    '  float lod=clamp(0.35+(1.0-uCalma)*1.1+ll*1.6+turb*0.5+lejos*0.4,0.0,3.2);\n' +
    '  vec2 rc=clamp(ruv2,0.002,0.998), px=exp2(lod)*0.7/vec2(textureSize(uRefl,0));\n' +
    '  vec3 refl=(textureLod(uRefl,rc+vec2(px.x,0.0),lod).rgb+textureLod(uRefl,rc-vec2(px.x,0.0),lod).rgb+textureLod(uRefl,rc+vec2(0.0,px.y),lod).rgb+textureLod(uRefl,rc-vec2(0.0,px.y),lod).rgb)*0.25*uExpoRefl;\n' +
    '  float luzSol=sombraAgua(vW);\n' +
    '  float ndv=max(dot(N,V),0.0);\n' +
    '  float F=0.22+0.78*pow(1.0-ndv,3.0);\n' +
    '  float linea=40.0+sin(vP.z*0.0011+t*0.15)*140.0+sin(vP.z*0.0047+t*0.4)*45.0+n2.x*70.0;\n' +
    '  float negra=uNegra*(1.0-smoothstep(-35.0,35.0,vP.x-linea));\n' +
    '  vec3 agua=mix(uAguaCol,vec3(0.0025,0.0016,0.0011),negra)*mix(vec3(1.0),uAmb*1.6,0.5);\n' +
    '  F=mix(F*(1.0-uNegra*0.45),0.42+0.58*pow(1.0-ndv,2.0),negra*0.85);\n' +
    '  float dif=max(dot(N,normalize(uSol+vec3(0.0,0.6,0.0))),0.0);\n' +
    '  agua+=vec3(0.025,0.010,0.0025)*pow(dif,3.0)*0.6;\n' +
    '  agua=mix(agua, agua*1.35+vec3(0.0015,0.0006,0.0), smoothstep(-2.0,4.0,h0)*pesoSim*0.5);\n' +
    // junto a la orilla, más turbia y oscura; a la sombra de los árboles, el cuerpo del agua se apaga
    '  agua=mix(agua, agua*0.55+uTurbio, turb*0.75); F*=1.0-turb*0.18;\n' +
    '  agua*=mix(0.5,1.0,luzSol);\n' +
    '  vec3 col=mix(agua,refl,F*(1.0-racha*0.25));\n' +
    '  col*=1.0-0.4*lin;\n' +
    '  vec3 R=reflect(-V,N); float rs=max(dot(R,uSol),0.0);\n' +
    '  float ex=mix(900.0,160.0,lejos); col+=uSolCol*smoothstep(-0.05,0.04,uSol.y)*(min(pow(rs,ex)*mix(14.0,4.0,lejos),6.0)+pow(rs,90.0)*0.6+pow(rs,12.0)*0.05)*(1.0-ll*0.85)*luzSol;\n' +
    '  if(uFarol>0.01){ vec3 ld=normalize(uFarolL-vP); float rl=max(dot(R,ld),0.0); float dl=length(uFarolL.xz-vP.xz);\n' +
    '    col+=vec3(1.0,0.4,0.09)*uFarol*(pow(rl,260.0)*5.0+pow(rl,40.0)*0.035+exp(-dl*dl/9000.0)*0.015); }\n' +
    '  float esp=smoothstep(3.0,9.0,abs(h0))*pesoSim; col=mix(col,vec3(0.45,0.33,0.22)*(0.3+0.7*uSolCol.g),esp*0.1);\n' +
    // la espuma: encaje de burbujas (dos escalas de la textura de olas), blanca sucia como el agua del río
    '  float sb=texture(uSim,su).b*pesoSim+eCentro*0.6;\n' +
    '  if(sb>0.01){ float f1=texture(uNorm,p/46.0+vec2(0.0,-uCorriente/46.0)).r, f2=texture(uNorm,p/15.0+vec2(0.37,-uCorriente/15.0)).g, f3=texture(uNorm,p/5.5+0.61).b;\n' +
    '    float enc=f1*0.5+f2*0.35+f3*0.25; float um=1.12-min(sb,1.0)*0.42;\n' +
    '    float lace=smoothstep(um,um+0.1,enc)*min(1.0,sb*1.6);\n' +
    '    vec3 blanco=(uAmb*0.32+vec3(0.05,0.045,0.04))*(0.55+0.45*luzSol)+uSolCol*0.05*luzSol;\n' +
    '    col=mix(col,blanco*vec3(1.0,0.96,0.88),clamp(lace,0.0,0.8)); }\n' +
    // donde llueve fuerte, el agua se vuelve gris claro y mate (las gotas la martillean); al frente del muro, la línea blanca
    '  col=mix(col, uColBruma*1.02, ll*(0.16+0.3*smoothstep(300.0,4500.0,dist)));\n' +
    '  float fr=smoothstep(uMuro.x-650.0,uMuro.x+30.0,vP.z)*(1.0-smoothstep(uMuro.x+30.0,uMuro.x+420.0,vP.z))*uLluviaI;\n' +
    '  col=mix(col, uColBruma*1.25, fr*0.45);\n' +
    '  col=mix(col, mix(uColBruma,refl,0.55), smoothstep(mix(9000.0,3000.0,uNiebla),mix(36000.0,18000.0,uNiebla),dist)*0.6);\n' +
    '  col=mix(col, uColBruma, 0.1*smoothstep(' + (LARGO * 0.7).toFixed(1) + ',' + (LARGO * 0.95).toFixed(1) + ',vProf));\n' +
    // el camino de luz del sol bajo sobre el agua (después de la bruma: llega hasta el horizonte)
    '  if(uDisco>0.001){ float ext=1.0-smoothstep(500.0,30000.0,dist)*0.55; col+=pow(max(uSolCol,0.0),vec3(1.6))*uDisco*(pow(rs,700.0)*7.0+pow(rs,60.0)*0.55+pow(rs,12.0)*0.06)*smoothstep(-0.03,0.03,uSol.y)*(1.0-ll*0.9)*ext; }\n' +
    '  if(uNeb>0.002) col=mix(col, uColBruma*1.06, brumaRio(vW, cameraPosition, uNeb));\n' +
    '  if(uDepura>0.5) col=uDepura>2.5?vec3(luzSol,turb,lin):uDepura>1.5?vec3(fract(ruv*10.0),0.0):refl;\n' +
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}';

  // ---------- Partículas: gotas, hojas, resoplido, lluvia y luciérnagas (instancias) ----------
  // a = (x, y, z, tamaño) en coordenadas Three; b = (tipo, giro, alfa, extra)
  var PART_VS =
    'attribute vec4 a; attribute vec4 b; uniform vec3 uDer; uniform vec4 uHR[9]; uniform float uHA[9];\n' +
    'varying vec2 vUv; varying vec4 vB; varying vec4 vR; varying float vAltura;\n' +
    'void main(){\n' +
    '  vec2 q=position.xy+0.5;\n' +
    '  vec2 l=(q-0.5)*a.w; vR=vec4(0.0);\n' +
    '  if(b.x>2.5 && b.x<3.5) l*=vec2(0.35,38.0);\n' +
    '  if(b.x>5.5 && b.x<6.5) l*=vec2(0.55,2.6);\n' +
    '  if(b.x>0.5 && b.x<1.5){ int k=int(b.w+0.5); vR=uHR[k]; l*=vec2(0.3+0.7*abs(cos(b.y*1.7)),uHA[k]); } else if(b.x<6.5) l*=vec2(1.0,1.0+b.w*2.5);\n' +
    '  float gi=b.y; if(b.x>7.5){ l*=vec2(0.12+0.88*abs(cos(b.y)),0.72); gi=0.0; }\n' +      // la morfo: las alas se abren y se cierran (se ve de lado)
    '  float s=sin(gi), co=cos(gi); l=mat2(co,s,-s,co)*l;\n' +
    '  vec3 dh=normalize(vec3(uDer.x,0.0,uDer.z));\n' +
    '  vec3 p=a.xyz+dh*l.x+vec3(0.0,l.y,0.0);\n' +
    '  vAltura=a.y; vUv=vec2(q.x,1.0-q.y); vB=b;\n' +
    '  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.0);\n' +
    '}';
  var PART_FS =
    'uniform sampler2D uImg; uniform float uLuz; varying vec2 vUv; varying vec4 vB; varying vec4 vR; varying float vAltura;\n' +
    'void main(){\n' +
    '  if(vAltura<-1.0) discard;\n' +
    '  vec2 d=(vUv-0.5)*2.0; float r=length(d);\n' +
    '  vec4 t;\n' +
    '  if(vB.x<0.5){ float a=(1.0-smoothstep(0.35,1.0,r))*vB.z*0.45; vec3 col=mix(vec3(0.3,0.25,0.2),vec3(0.75,0.72,0.66),smoothstep(0.7,0.0,r))*uLuz*0.8; t=vec4(col*a,a); }\n' +       // gotas: agua, no lucecitas
    '  else if(vB.x<1.5){ t=texture(uImg,mix(vR.xy,vR.zw,vUv))*vB.z; t.rgb=pow(max(t.rgb,0.0),vec3(2.2))*vec3(1.0,0.8,0.6)*uLuz; }\n' +
    '  else if(vB.x<2.5){ float a=exp(-r*r*3.0)*(1.0-smoothstep(0.7,1.0,r))*vB.z; t=vec4(vec3(1.0,0.86,0.7)*a*uLuz,a); }\n' +
    '  else if(vB.x<3.5){ float a=(1.0-smoothstep(0.0,1.0,abs(d.x)))*(1.0-abs(d.y))*vB.z*0.55; t=vec4(vec3(0.58,0.64,0.74)*a*uLuz,a); }\n' +
    '  else if(vB.x<4.5){ float a=exp(-r*r*5.0)*vB.z; t=vec4(vec3(0.7,1.0,0.2)*a*6.0,0.0); }\n' +      // luciérnagas: luz que suma
    '  else if(vB.x<5.5){ float a=exp(-r*r*7.0)*vB.z; t=vec4(vec3(1.0,0.42,0.12)*a*5.0,0.0); }\n' +
    '  else if(vB.x<6.5){ float a=exp(-d.x*d.x*3.0-d.y*d.y*1.2)*vB.z*0.6; t=vec4(vec3(0.72,0.7,0.64)*uLuz*a,a); }\n' +
    '  else if(vB.x<7.5){ float sm=vB.w*6.283, an=atan(d.y,d.x);\n' +    // la pelusa del kapok: un copo de algodón irregular (tres mechones) con fibras finas
    '    vec2 o1=0.28*vec2(cos(sm),sin(sm)), o2=0.3*vec2(cos(sm+2.3),sin(sm+2.3)), o3=0.22*vec2(cos(sm+4.4),sin(sm+4.4));\n' +
    '    float m=exp(-dot(d-o1,d-o1)*9.0)+exp(-dot(d-o2,d-o2)*11.0)*0.8+exp(-dot(d-o3,d-o3)*13.0)*0.7;\n' +
    '    float fib=0.8+0.2*sin(an*13.0+sm*5.0+r*9.0);\n' +
    '    float a=clamp(m*fib,0.0,1.0)*(1.0-smoothstep(0.75,1.0,r))*vB.z*0.7; t=vec4(vec3(1.0,0.97,0.9)*uLuz*1.1*a,a*0.85); }\n' +
    '  else { vec2 w=vec2(abs(d.x),d.y);\n' +                                                                 // la mariposa morfo azul: dos alas y el cuerpo
    '    float fa=length((w-vec2(0.46,0.2))/vec2(0.5,0.52)), ha=length((w-vec2(0.36,-0.36))/vec2(0.36,0.36)), ala=min(fa,ha);\n' +
    '    float a=(1.0-smoothstep(0.86,1.0,ala))*step(0.03,w.x)+(1.0-smoothstep(0.035,0.06,w.x))*(1.0-smoothstep(0.45,0.6,abs(d.y+0.05)));\n' +
    '    float borde=smoothstep(0.62,0.9,ala); vec3 azul=mix(vec3(0.05,0.32,0.95),vec3(0.35,0.75,1.0),smoothstep(0.7,0.0,ala))*1.6;\n' +
    '    vec3 dorso=mix(vec3(0.16,0.11,0.06),vec3(0.42,0.3,0.14),smoothstep(0.3,0.1,abs(ha-0.45)));\n' +
    '    vec3 c=mix(mix(dorso,azul,vB.w),vec3(0.02),borde*0.85); a=clamp(a,0.0,1.0)*vB.z; t=vec4(c*uLuz*a,a); }\n' +       // el rocío de la proa                 // ojos del caimán a la luz del farol
    '  gl_FragColor=t;\n' +
    '}';

  // ---------- Lo que flota: hojas, ramitas y vainas que bajan con la corriente (planas sobre el agua, con las ondas) ----------
  // f0 = (x, z Three, giro, tamaño) · f1 = (tipo 0 hoja / 1 ramita / 2 vaina, marco, alfa, semilla)
  var FLOT_VS =
    'attribute vec4 f0, f1; uniform sampler2D uSimV; uniform float uTamMundo; uniform vec4 uHR[9]; uniform float uHA[9];\n' +
    'varying vec2 vUv; varying vec4 vR; varying float vTipo, vAlfa, vProf, vSem;\n' +
    'void main(){\n' +
    '  vec2 q=position.xy; float tipo=f1.x; int k=int(f1.y+0.5); vR=uHR[k];\n' +
    '  vec2 tam=tipo<0.5?vec2(f0.w,f0.w*uHA[k]):tipo<1.5?vec2(f0.w,f0.w*0.16):vec2(f0.w,f0.w*0.62);\n' +
    '  float c=cos(f0.z), s=sin(f0.z); vec2 l=q*tam; l=vec2(c*l.x-s*l.y,s*l.x+c*l.y);\n' +
    '  vec2 su=fract(vec2(-f0.x,f0.y)/uTamMundo); float e=1.0/float(textureSize(uSimV,0).x);\n' +
    '  float h=textureLod(uSimV,su,0.0).r, gx=textureLod(uSimV,su+vec2(e,0.0),0.0).r-textureLod(uSimV,su-vec2(e,0.0),0.0).r, gz=textureLod(uSimV,su+vec2(0.0,e),0.0).r-textureLod(uSimV,su-vec2(0.0,e),0.0).r;\n' +
    '  vec3 p=vec3(f0.x+l.x, clamp(h*0.55,-14.0,14.0)+0.5+(gx*l.x-gz*l.y)*0.02, f0.y+l.y);\n' +
    '  vUv=q+0.5; vTipo=tipo; vAlfa=f1.z; vSem=f1.w;\n' +
    '  vec4 mv=viewMatrix*vec4(p,1.0); vProf=-mv.z; gl_Position=projectionMatrix*mv;\n' +
    '}';
  var FLOT_FS =
    'uniform sampler2D uImg; uniform float uLuz, uNieblaCerca, uNieblaLejos; uniform vec3 uColBruma;\n' +
    'varying vec2 vUv; varying vec4 vR; varying float vTipo, vAlfa, vProf, vSem;\n' + NIEBLA_FN +
    'void main(){\n' +
    '  vec2 d=(vUv-0.5)*2.0; vec4 t;\n' +
    '  if(vTipo<0.5){ t=texture(uImg,mix(vR.xy,vR.zw,vec2(vUv.x,1.0-vUv.y))); t.rgb=pow(max(t.rgb/max(t.a,1e-3),0.0),vec3(2.2))*vec3(0.75,0.62,0.45)*t.a; }\n' +   // hoja mojada, ya algo pasada
    '  else if(vTipo<1.5){ float a=(1.0-smoothstep(0.55,1.0,abs(d.y)))*(1.0-smoothstep(0.88,1.0,abs(d.x))); vec3 c=mix(vec3(0.030,0.020,0.012),vec3(0.07,0.05,0.03),fract(vSem*13.0)); t=vec4(c*a,a); }\n' +
    '  else { float r=length(d); float a=1.0-smoothstep(0.75,1.0,r); vec3 c=mix(vec3(0.025,0.016,0.010),vec3(0.09,0.06,0.03),smoothstep(0.6,-0.4,d.y+d.x*0.3)); t=vec4(c*a,a); }\n' +
    '  t.rgb*=uLuz; t*=vAlfa;\n' +
    '  float f=factorNiebla(vProf,uNieblaCerca,uNieblaLejos); t.rgb=mix(t.rgb,uColBruma*t.a,f);\n' +
    '  if(t.a<0.01) discard;\n' +
    '  gl_FragColor=t;\n' +
    '}';

  // ---------- Cartas: aves, camalotes y velos de niebla (instancias, de cara a la cámara en horizontal) ----------
  // i0 = (x, y, z, giro) Three · i1 = (ancho, alto, voltear, hundir) · i2 = rect del atlas · i3 = (fase, viento, empuje, flota) · i4 = (alfa, modo, 0, 0)
  var CARTA_VS =
    'attribute vec4 i0, i1, i2, i3, i4; uniform vec3 uDer; uniform float uT, uTamMundo; uniform sampler2D uSimV;\n' +
    'varying vec2 vUv; varying vec4 vR; varying float vAlfa, vModo, vProf, vEmpuje, vFase;\n' +
    'void main(){\n' +
    '  vec2 q=position.xy+0.5;\n' +
    '  vec2 l=vec2((q.x-0.5)*i1.x, q.y*i1.y);\n' +
    '  float giro=i0.w; vec3 b=i0.xyz;\n' +
    '  if(i3.w>0.5){\n' +   // lo que flota sube, baja y se ladea con las ondas (el mapa de ondas va en coordenadas lógicas)
    '    vec2 su=fract(vec2(-b.x,b.z)/uTamMundo); float e=1.0/float(textureSize(uSimV,0).x);\n' +
    '    float h=textureLod(uSimV,su,0.0).r, gx=textureLod(uSimV,su+vec2(e,0.0),0.0).r-textureLod(uSimV,su-vec2(e,0.0),0.0).r;\n' +
    '    b.y+=clamp(h*0.55,-14.0,14.0); giro+=clamp(gx*0.05,-0.35,0.35);\n' +
    '  }\n' +
    '  vec2 c=vec2(0.0, i1.y*0.5); float s=sin(giro), co=cos(giro);\n' +
    '  l=c+mat2(co,s,-s,co)*(l-c);\n' +
    '  float k=q.y*q.y;\n' +
    '  float v=(sin(uT*0.9+i3.x)*0.6+sin(uT*2.3+i3.x*1.7)*0.25)*i3.y+sin(uT*6.5+i3.x)*i3.z*0.7;\n' +
    '  l.x+=v*k*i1.y*0.022;\n' +
    '  l.y-=i1.w*i1.y;\n' +
    '  vec3 dh=normalize(vec3(uDer.x,0.0,uDer.z));\n' +
    '  vec3 p=b+dh*l.x*i1.z+vec3(0.0,l.y,0.0);\n' +
    '  vUv=vec2(q.x,1.0-q.y); vR=i2; vAlfa=i4.x; vModo=i4.y; vEmpuje=i3.z; vFase=i3.x;\n' +
    '  vec4 mv=viewMatrix*vec4(p,1.0); vProf=-mv.z; gl_Position=projectionMatrix*mv;\n' +
    '}';
  var CARTA_FS =
    'uniform sampler2D uImg; uniform vec3 uColBruma, uLuzCarta; uniform float uNieblaCerca, uNieblaLejos, uT;\n' +
    'varying vec2 vUv; varying vec4 vR; varying float vAlfa, vModo, vProf, vEmpuje, vFase;\n' + NIEBLA_FN +
    'void main(){\n' +
    '  vec4 t;\n' +
    '  if(vModo>0.5){ vec2 d=(vUv-0.5)*2.0; float r2=dot(d,d); float a=exp(-r2*3.0)*(1.0-smoothstep(0.55,1.0,sqrt(r2)))*0.55; t=vec4(mix(uColBruma,uColBruma*1.15+vec3(0.05,0.04,0.03),0.25)*a,a); }\n' +
    '  else { vec2 j=vec2(sin(vUv.y*95.0+uT*12.0+vFase),cos(vUv.x*83.0+uT*10.0+vFase))*0.0022*vEmpuje*(1.0-vUv.y);\n' +
    '    t=texture(uImg,mix(vR.xy,vR.zw,vUv+j)); t.rgb=pow(max(t.rgb/max(t.a,1e-3),0.0),vec3(2.2))*t.a*uLuzCarta; }\n' +
    '  if(vModo<0.5){ float f=factorNiebla(vProf,uNieblaCerca,uNieblaLejos); t.rgb=mix(t.rgb,uColBruma*t.a,f); }\n' +
    '  gl_FragColor=t*vAlfa;\n' +
    '}';

  // ---------- Etalonado de película (35 mm) ----------
  // entra la escena en luz lineal (HDR); sale sRGB ya etalonado: halación, PBR Neutral, color contenido, grano y viñeta
  // ---------- La bruma del río, en volumen (pase después de la escena) ----------
  // Densidad ρ(y) = D·e^(−y/H) (H ≈ 0,7 m): la integral a lo largo del rayo es analítica; tres muestras de ruido a lo
  // largo del rayo la rompen en jirones que derivan. Luz: el color de la bruma y, a contraluz, el sol que la atraviesa.
  var BRUMA_FS =
    'uniform sampler2D tDiffuse, tProf; uniform mat4 uInvProy, uCamMat; uniform vec3 uCam, uSolT, uColN, uSolN; uniform float uDens, uT; varying vec2 vUv;\n' +
    'float hB(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }\n' +
    'float rB(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hB(i),hB(i+vec2(1,0)),f.x),mix(hB(i+vec2(0,1)),hB(i+vec2(1,1)),f.x),f.y); }\n' +
    'float fB(vec2 p){ return rB(p)*0.55+rB(p*2.3+7.1)*0.3+rB(p*5.1+3.7)*0.15; }\n' +
    'void main(){\n' +
    '  vec4 base=texture2D(tDiffuse,vUv); float z=texture2D(tProf,vUv).r;\n' +
    '  vec4 v=uInvProy*vec4(vUv*2.0-1.0,z*2.0-1.0,1.0); v/=v.w; vec3 P=(uCamMat*vec4(v.xyz,1.0)).xyz;\n' +
    '  vec3 d=P-uCam; float L=length(d); vec3 dir=d/max(L,1e-3); if(z>0.99999){ L=40000.0; P=uCam+dir*L; }\n' +
    '  L=min(L,42000.0); P=uCam+dir*L;\n' +
    '  float y0=max(uCam.y,0.0), y1=max(P.y,0.0), dy=y1-y0;\n' +
    // dos capas de densidad que se suman (≈1,5 m y ≈5 m): la bruma se va aclarando poco a poco hacia arriba, sin borde
    '  float H1=60.0, H2=210.0; float col=abs(dy)>0.5 ? (H1*(exp(-y0/H1)-exp(-y1/H1))+0.35*H2*(exp(-y0/H2)-exp(-y1/H2)))/dy : exp(-y0/H1)+0.35*exp(-y0/H2);\n' +
    // jirones: la bruma no es pareja; tres puntos del rayo, cerca del agua
    '  float n=0.0; for(int i=0;i<3;i++){ float tt=(float(i)+0.5)/3.0; vec3 Q=uCam+dir*min(L,9000.0)*tt; n+=fB(Q.xz/2200.0+vec2(uT*0.006,uT*0.0035))*0.6+fB(Q.xz/650.0+vec2(-uT*0.012,uT*0.008)+3.3)*0.4; }\n' +
    '  n/=3.0; float jiron=0.45+1.1*smoothstep(0.3,0.75,n);\n' +
    '  float tau=uDens*0.00028*col*L*jiron*smoothstep(80.0,1400.0,L);\n' +
    '  float T=exp(-tau);\n' +
    '  float c=max(dot(dir,uSolT),0.0); vec3 luz=uColN*1.02+uSolN*(pow(c,6.0)*1.4+pow(c,60.0)*2.5+0.06);\n' +
    '  gl_FragColor=vec4(base.rgb*T+luz*(1.0-T),base.a);\n' +
    '}';
  var CINE_VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  var CINE_FS =
    'uniform sampler2D tDiffuse; uniform float uT, uExpo, uSat, uRayoG; uniform vec2 uRes; varying vec2 vUv;\n' +
    'vec3 neutro(vec3 color){ float x=min(color.r,min(color.g,color.b)); float off=x<0.08?x-6.25*x*x:0.04; color-=off;\n' +
    '  float peak=max(color.r,max(color.g,color.b)); if(peak<0.76) return color; float d=0.24; float np=1.0-d*d/(peak+d-0.76); color*=np/peak;\n' +
    '  float g=1.0-1.0/(0.15*(peak-np)+1.0); return mix(color,vec3(np),g); }\n' +
    'vec3 aSRGB(vec3 c){ c=clamp(c,0.0,1.0); return mix(c*12.92, 1.055*pow(c,vec3(1.0/2.4))-0.055, step(0.0031308,c)); }\n' +
    'void main(){\n' +
    '  vec3 col=texture(tDiffuse,vUv).rgb*uExpo*(1.0+uRayoG*0.6);\n' +
    '  vec3 b=textureLod(tDiffuse,vUv,4.0).rgb*0.55+textureLod(tDiffuse,vUv,6.0).rgb*0.45; b*=uExpo;\n' +
    '  float lb=dot(b,vec3(0.2126,0.7152,0.0722)); col+=b*max(lb-0.55,0.0)*vec3(1.0,0.55,0.3)*0.55;\n' +   // halación: las luces fuertes sangran en rojizo
    '  col=aSRGB(neutro(col));\n' +
    '  float l=dot(col,vec3(0.299,0.587,0.114));\n' +
    '  col=mix(vec3(l),col,uSat);\n' +                                                    // color contenido
    '  col*=mix(vec3(0.95,1.0,1.05),vec3(1.0),smoothstep(0.0,0.45,l));\n' +             // sombras algo frías
    '  col*=mix(vec3(1.0),vec3(1.05,1.0,0.92),smoothstep(0.5,1.0,l));\n' +              // luces cálidas
    '  col=0.035+col*0.93;\n' +                                                           // negros levantados
    '  col=mix(col,col*col*(3.0-2.0*col),0.18);\n' +
    '  vec2 v=vUv-0.5; col*=1.0-dot(v,v)*0.35;\n' +
    '  vec2 fc=floor(vUv*uRes*0.75);\n' +
    '  float g=fract(sin(dot(fc+fract(uT*7.13)*vec2(91.7,47.3),vec2(12.9898,78.233)))*43758.5453)-0.5;\n' +
    '  col+=g*0.022*(0.55+0.45*(1.0-l));\n' +                                            // grano fino que se mueve
    '  gl_FragColor=vec4(col,1.0);\n' +
    '}';

  AM.glsl = {
    LARGO: LARGO, RUIDO: RUIDO, NIEBLA_FN: NIEBLA_FN, FOG_FRAGMENT: FOG_FRAGMENT, FOG_PARS_V: FOG_PARS_V, FOG_V: FOG_V, FOG_PARS_F: FOG_PARS_F, BRUMA_GLSL: BRUMA_GLSL,
    CIELO_VS: CIELO_VS, CIELO_FS: CIELO_FS, MEZCLA_VS: MEZCLA_VS, MEZCLA_FS: MEZCLA_FS,
    SIM_VS: SIM_VS, SIM_FS: SIM_FS, AGUA_VS: AGUA_VS, AGUA_FS: AGUA_FS,
    PART_VS: PART_VS, PART_FS: PART_FS, CARTA_VS: CARTA_VS, CARTA_FS: CARTA_FS,
    CINE_VS: CINE_VS, CINE_FS: CINE_FS, BRUMA_FS: BRUMA_FS, FLOT_VS: FLOT_VS, FLOT_FS: FLOT_FS
  };
})();
