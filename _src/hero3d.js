// Hero scene: procedural objects (one per kind of thing I build), printed live in
// Ben-Day halftone with an ink outline. The light follows the pointer, so the dots move.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const INK = new THREE.Color('#16130F');
const PAPER = new THREE.Color('#F1E9D8');
const RED = new THREE.Color('#E5371C');
const YELLOW = new THREE.Color('#F7C531');
const BLUE = new THREE.Color('#9CC3D9');

const halftoneVert = /* glsl */ `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const halftoneFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uInk;
  uniform vec3 uLight;
  uniform float uCell;
  uniform float uPR;
  uniform float uHover;
  varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    float l = dot(n, normalize(uLight)) * 0.5 + 0.5;
    // three cel bands, then halftone dots grow into the shadow side
    float band = l > 0.72 ? 1.0 : (l > 0.42 ? 0.62 : 0.3);
    float shade = clamp(1.0 - band + (1.0 - l) * 0.35, 0.0, 1.0);
    vec2 p = gl_FragCoord.xy / uPR;
    const float a = 0.7854;
    mat2 r = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 cell = fract((r * p) / uCell) - 0.5;
    float rad = sqrt(shade) * 0.58;
    float dotMask = 1.0 - smoothstep(rad - 0.06, rad + 0.06, length(cell));
    vec3 col = mix(uColor, uInk, dotMask * (0.92 - uHover * 0.25));
    // a hard paper glint on the lit edge
    float spec = step(0.965, l);
    col = mix(col, vec3(1.0, 0.98, 0.94), spec * 0.85);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const outlineVert = /* glsl */ `
  uniform float uThick;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    mv.xyz += n * uThick * (-mv.z) * 0.012;
    gl_Position = projectionMatrix * mv;
  }
`;
const outlineFrag = /* glsl */ `
  uniform vec3 uInk;
  void main() { gl_FragColor = vec4(uInk, 1.0); }
`;

export function initHero3D(container, { onPick, reduced } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    container.classList.add('no-webgl');
    return null;
  }
  const pr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pr);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 16);

  const light = new THREE.Vector3(-0.6, 0.7, 0.8);
  const shared = {
    uInk: { value: INK },
    uLight: { value: light },
    uPR: { value: pr },
    uCell: { value: 6.0 },
  };

  const world = new THREE.Group();
  scene.add(world);

  const pickables = [];

  function inked(geo, color, thick = 1) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...shared, uColor: { value: color.clone() }, uHover: { value: 0 } },
      vertexShader: halftoneVert,
      fragmentShader: halftoneFrag,
    });
    const mesh = new THREE.Mesh(geo, mat);
    // smooth normals for the hull so hard-edged shapes don't crack open
    const hullGeo = geo.clone();
    hullGeo.deleteAttribute('normal');
    if (hullGeo.getAttribute('uv')) hullGeo.deleteAttribute('uv');
    const merged = mergeVertices(hullGeo, 1e-3);
    merged.computeVertexNormals();
    const hull = new THREE.Mesh(merged, new THREE.ShaderMaterial({
      uniforms: { uInk: shared.uInk, uThick: { value: 0.9 * thick } },
      vertexShader: outlineVert,
      fragmentShader: outlineFrag,
      side: THREE.BackSide,
    }));
    mesh.add(hull);
    return mesh;
  }

  // ---------- the cast ----------
  function submarine() {
    const g = new THREE.Group();
    const body = inked(new THREE.CapsuleGeometry(0.62, 2.2, 10, 24), YELLOW);
    body.rotation.z = Math.PI / 2;
    const tower = inked(new RoundedBoxGeometry(0.75, 0.7, 0.45, 3, 0.12), YELLOW);
    tower.position.set(0.15, 0.78, 0);
    const scope = inked(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 10), INK.clone().lerp(PAPER, 0.15), 0.6);
    scope.position.set(0.3, 1.35, 0);
    const prop = inked(new THREE.ConeGeometry(0.32, 0.5, 4), RED);
    prop.rotation.z = Math.PI / 2;
    prop.position.set(-1.95, 0, 0);
    for (let i = -1; i <= 1; i++) {
      const port = inked(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 20), BLUE, 0.5);
      port.rotation.x = Math.PI / 2;
      port.position.set(i * 0.62 + 0.2, 0.05, 0.58);
      g.add(port);
    }
    g.add(body, tower, scope, prop);
    return g;
  }

  function phone() {
    const g = new THREE.Group();
    const body = inked(new RoundedBoxGeometry(1.25, 2.4, 0.2, 4, 0.16), RED);
    const screen = inked(new RoundedBoxGeometry(1.05, 2.0, 0.06, 2, 0.06), PAPER, 0.4);
    screen.position.z = 0.1;
    const bolt = new THREE.Shape();
    bolt.moveTo(0.05, 0.42); bolt.lineTo(-0.2, -0.02); bolt.lineTo(0.0, -0.02);
    bolt.lineTo(-0.08, -0.42); bolt.lineTo(0.22, 0.06); bolt.lineTo(0.02, 0.06); bolt.closePath();
    const boltMesh = inked(new THREE.ExtrudeGeometry(bolt, { depth: 0.08, bevelEnabled: false }), YELLOW, 0.5);
    boltMesh.position.z = 0.14;
    g.add(body, screen, boltMesh);
    return g;
  }

  function volcano() {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      pts.push(new THREE.Vector2(0.25 + (1 - t) * 1.25 + Math.sin(t * 9) * 0.03, t * 1.7));
    }
    pts.unshift(new THREE.Vector2(0, 0));
    pts.push(new THREE.Vector2(0.22, 1.62));
    const cone = inked(new THREE.LatheGeometry(pts, 28), new THREE.Color('#C9B79A'));
    const lava = inked(new THREE.SphereGeometry(0.3, 16, 12), RED, 0.7);
    lava.position.y = 1.72;
    lava.scale.set(1, 0.7, 1);
    g.add(cone, lava);
    for (let i = 0; i < 3; i++) {
      const puff = inked(new THREE.IcosahedronGeometry(0.22 + i * 0.07, 1), PAPER, 0.6);
      puff.position.set(0.12 * (i % 2 ? 1 : -1), 2.15 + i * 0.36, 0);
      puff.userData.puff = i;
      g.add(puff);
    }
    g.position.y = -0.9;
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  function book() {
    const g = new THREE.Group();
    const coverL = inked(new RoundedBoxGeometry(1.2, 1.6, 0.08, 2, 0.03), RED);
    const coverR = inked(new RoundedBoxGeometry(1.2, 1.6, 0.08, 2, 0.03), RED);
    coverL.position.x = -0.6; coverR.position.x = 0.6;
    const left = new THREE.Group(); left.add(coverL); left.rotation.y = 0.32;
    const right = new THREE.Group(); right.add(coverR); right.rotation.y = -0.32;
    const pagesL = inked(new RoundedBoxGeometry(1.1, 1.5, 0.14, 2, 0.03), PAPER, 0.6);
    pagesL.position.set(-0.56, 0, 0.1); left.add(pagesL);
    const pagesR = inked(new RoundedBoxGeometry(1.1, 1.5, 0.14, 2, 0.03), PAPER, 0.6);
    pagesR.position.set(0.56, 0, 0.1); right.add(pagesR);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.12 : 0.3, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starMesh = inked(new THREE.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: false }), YELLOW, 0.6);
    starMesh.position.set(0, 1.15, 0.25);
    starMesh.userData.spin = true;
    g.add(left, right, starMesh);
    return g;
  }

  function jet() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, 1.4); s.lineTo(0.18, 0.5); s.lineTo(1.25, -0.35); s.lineTo(1.25, -0.6);
    s.lineTo(0.2, -0.35); s.lineTo(0.18, -0.85); s.lineTo(0.55, -1.15); s.lineTo(0.55, -1.3);
    s.lineTo(0, -1.15); s.lineTo(-0.55, -1.3); s.lineTo(-0.55, -1.15); s.lineTo(-0.18, -0.85);
    s.lineTo(-0.2, -0.35); s.lineTo(-1.25, -0.6); s.lineTo(-1.25, -0.35); s.lineTo(-0.18, 0.5); s.closePath();
    const wing = inked(new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 }), new THREE.Color('#B9C3C9'));
    wing.position.z = -0.06;
    const canopy = inked(new THREE.CapsuleGeometry(0.13, 0.4, 6, 12), BLUE, 0.6);
    canopy.position.set(0, 0.55, 0.15);
    g.add(wing, canopy);
    g.rotation.x = -1.0;
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  function bubble() {
    const s = new THREE.Shape();
    const w = 1.2, h = 0.8, r = 0.45;
    s.moveTo(-w + r, -h);
    s.lineTo(-0.35, -h); s.lineTo(-0.75, -h - 0.55); s.lineTo(-0.05, -h);
    s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
    s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h);
    s.lineTo(-w + r, h); s.quadraticCurveTo(-w, h, -w, h - r);
    s.lineTo(-w, -h + r); s.quadraticCurveTo(-w, -h, -w + r, -h);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 10 });
    geo.center();
    const g = new THREE.Group();
    g.add(inked(geo, PAPER));
    for (let i = -1; i <= 1; i++) {
      const dot = inked(new THREE.SphereGeometry(0.15, 14, 10), i === 0 ? RED : INK.clone().lerp(PAPER, 0.2), 0.5);
      dot.position.set(i * 0.5, 0.12, 0.22);
      dot.userData.typing = i + 1;
      g.add(dot);
    }
    return g;
  }

  function city() {
    const g = new THREE.Group();
    const slab = inked(new RoundedBoxGeometry(2.1, 0.18, 1.5, 2, 0.05), new THREE.Color('#C9B79A'));
    slab.position.y = -0.8;
    g.add(slab);
    const towers = [[-0.6, 1.2, -0.25, YELLOW], [0.05, 1.9, 0.1, PAPER], [0.62, 0.85, -0.3, RED], [-0.1, 0.6, 0.48, BLUE], [0.6, 1.35, 0.42, PAPER]];
    for (const [x, hgt, z, c] of towers) {
      const t = inked(new RoundedBoxGeometry(0.5, hgt, 0.5, 2, 0.04), c, 0.8);
      t.position.set(x, -0.71 + hgt / 2, z);
      g.add(t);
    }
    return g;
  }

  const cast = [
    { make: submarine, id: 'sonar', label: 'Sonar Defence', pos: [-2.6, 2.3, 0], scale: 0.8, rot: [0.25, -0.5, 0] },
    { make: bubble, id: 'storyforge', label: 'StoryForge', pos: [1.6, 2.5, -0.6], scale: 0.85, rot: [0.1, -0.35, 0.05] },
    { make: phone, id: 'repair', label: 'Repair Sim', pos: [3.5, 0.2, 0.3], scale: 0.8, rot: [0.1, -0.5, -0.12] },
    { make: city, id: 'delhi', label: 'Delhi Pulse Twin', pos: [-0.2, -0.05, 0.9], scale: 0.9, rot: [0.45, 0.6, 0] },
    { make: volcano, id: 'volcano', label: 'Volcano Sim', pos: [-3.3, -1.7, -0.4], scale: 0.85, rot: [0.15, 0, 0] },
    { make: book, id: 'mela', label: 'Mela Story', pos: [1.3, -2.4, 0.2], scale: 0.85, rot: [0.25, -0.25, 0.08] },
    { make: jet, id: 'mig', label: 'MiG-29K Carrier Sim', pos: [3.7, -2.7, -0.8], scale: 0.6, rot: [0.2, -0.7, 0.4] },
  ];

  const actors = cast.map((c, i) => {
    const obj = c.make();
    obj.scale.setScalar(c.scale);
    obj.position.set(...c.pos);
    obj.rotation.set(...c.rot);
    obj.userData = { ...c, base: obj.position.clone(), baseRot: obj.rotation.clone(), phase: i * 1.37, hover: 0, intro: 0 };
    obj.traverse(m => {
      if (m.isMesh && m.material.uniforms?.uColor) {
        m.userData.actor = obj;
        pickables.push(m);
      }
    });
    world.add(obj);
    return obj;
  });

  // ---------- sizing ----------
  let width = 1, height = 1;
  const stage = new THREE.Group();
  scene.remove(world);
  stage.add(world);
  scene.add(stage);
  function resize() {
    const r = container.getBoundingClientRect();
    width = Math.max(1, r.width); height = Math.max(1, r.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    const wide = width > 900;
    // on desktop the cast lives in the right-hand ~45% of the panel; the headline owns the left
    if (wide) {
      stage.position.set(halfW * 0.56, -0.15, 0);
      stage.scale.setScalar(Math.min(1.05, (halfW * 0.42) / 4.3, halfH / 4.1));
    } else {
      stage.position.set(0, 0, 0);
      stage.scale.setScalar(Math.min(1, (halfW * 0.92) / 4.4, halfH / 4.1));
    }
    shared.uCell.value = wide ? 6.5 : 5.0;
  }
  resize();
  new ResizeObserver(resize).observe(container);

  // ---------- input ----------
  const pointer = new THREE.Vector2(9, 9);
  const target = { lx: -0.6, ly: 0.7, tiltX: 0, tiltY: 0 };
  const raycaster = new THREE.Raycaster();
  let hovered = null;
  let drag = null;
  const spin = { y: 0, v: 0 };

  container.addEventListener('pointermove', e => {
    const r = container.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    if (drag) {
      const dx = e.clientX - drag.x;
      spin.v = dx * 0.004;
      spin.y += dx * 0.004;
      drag.x = e.clientX;
      drag.moved += Math.abs(dx);
    }
  });
  container.addEventListener('pointerleave', () => { pointer.set(9, 9); });
  container.addEventListener('pointerdown', e => { drag = { x: e.clientX, moved: 0 }; });
  window.addEventListener('pointerup', () => {
    if (drag && drag.moved < 6 && hovered && onPick) onPick(hovered.userData.id);
    drag = null;
  });
  window.addEventListener('pointermove', e => {
    // the light follows the pointer across the whole viewport, not just the canvas
    target.lx = (e.clientX / window.innerWidth) * 2 - 1;
    target.ly = -((e.clientY / window.innerHeight) * 2 - 1);
    target.tiltY = target.lx * 0.18;
    target.tiltX = -target.ly * 0.1;
  }, { passive: true });

  const label = container.querySelector('[data-hero-label]');

  // ---------- loop ----------
  let running = true, visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: '100px' });
  io.observe(container);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });

  const state = { intro: reduced ? 1 : 0, scroll: 0 };
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();

  function frame() {
    if (!running || !visible) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    light.x += (target.lx * 1.4 - light.x) * 0.08;
    light.y += (target.ly * 1.2 + 0.2 - light.y) * 0.08;

    if (!drag) { spin.v *= 0.94; spin.y += spin.v; spin.y *= 0.985; }
    world.rotation.y += (target.tiltY + spin.y - world.rotation.y) * 0.08;
    world.rotation.x += (target.tiltX - world.rotation.x) * 0.08;

    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    const next = hit ? hit.object.userData.actor : null;
    if (next !== hovered) {
      hovered = next;
      container.style.cursor = hovered ? 'pointer' : drag ? 'grabbing' : 'grab';
      if (label) {
        label.textContent = hovered ? hovered.userData.label : '';
        label.classList.toggle('on', !!hovered);
      }
    }

    actors.forEach((a, i) => {
      const u = a.userData;
      u.hover += ((a === hovered ? 1 : 0) - u.hover) * 0.15;
      const intro = THREE.MathUtils.clamp(state.intro * 1.6 - i * 0.09, 0, 1);
      const e = 1 - Math.pow(1 - intro, 3);
      const bob = reduced ? 0 : Math.sin(t * 0.9 + u.phase) * 0.14;
      a.position.set(
        u.base.x * (0.4 + 0.6 * e) + state.scroll * (u.base.x > 0 ? 1.4 : -1.4),
        u.base.y + bob + (1 - e) * -3 - state.scroll * 1.5,
        u.base.z
      );
      const s = u.scale * e * (1 + u.hover * 0.14);
      a.scale.setScalar(Math.max(0.0001, s));
      // the ink hull keeps a fixed screen thickness, so hide actors until they have real size
      a.visible = s > 0.02;
      a.rotation.x = u.baseRot.x + (reduced ? 0 : Math.sin(t * 0.6 + u.phase) * 0.06);
      a.rotation.y = u.baseRot.y + (reduced ? 0 : Math.sin(t * 0.45 + u.phase) * 0.18) + u.hover * 0.4 + state.scroll * 1.2;
      a.rotation.z = u.baseRot.z;
      a.traverse(m => {
        if (m.material?.uniforms?.uHover) m.material.uniforms.uHover.value = u.hover;
        if (!reduced && m.userData.typing !== undefined) m.position.y = 0.12 + Math.max(0, Math.sin(t * 6 - m.userData.typing * 0.9)) * 0.12;
        if (!reduced && m.userData.spin) m.rotation.z = t * 0.8;
        if (!reduced && m.userData.puff !== undefined) {
          const k = (t * 0.35 + m.userData.puff / 3) % 1;
          m.position.y = 2.0 + k * 1.3;
          m.scale.setScalar(0.6 + k * 0.9);
          m.visible = k < 0.92;
        }
      });
    });

    if (label && hovered) {
      hovered.getWorldPosition(tmp).project(camera);
      label.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * width}px, ${(-tmp.y * 0.5 + 0.5) * height - 70}px) translate(-50%, -100%)`;
    }

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);
  if (reduced) frame();

  return { state, resize };
}
