/* ===== الحالة ===== */
const State = {
  scene: null, camera: null, renderer: null, controls: null,
  raycaster: null,
  items: [], selected: null, editing: null, nextId: 1,
  settings: {
    mdfColor: '#d6b98a',
    floorColor: '#a0825c',
    wallColor: '#ede6d6',
    skyTop: '#1e3c72',
    skyBottom: '#7ec8e3'
  }
};
const COMPONENTS = {};
const ROOM_BACK_Z = -500;
const ROOM = {
  length: 400, width: 300, height: 250,
  wallThickness: 5, visible: true, group: null
};

function makeSkyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, State.settings.skyTop);
  g.addColorStop(0.6, State.settings.skyBottom);
  g.addColorStop(1, '#dfeaf2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function buildFloor() {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(State.settings.floorColor),
    roughness: 0.85, metalness: 0.02
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}

function refreshEnvironment() {
  if (State.scene) State.scene.background = makeSkyTexture();
}

function initThree() {
  const canvas = document.getElementById('c');
  State.scene = new THREE.Scene();
  State.scene.background = makeSkyTexture();

  State.camera = new THREE.PerspectiveCamera(50,
    window.innerWidth / window.innerHeight, 1, 5000);
  State.camera.position.set(280, 220, 300);

  State.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  State.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  State.renderer.setSize(window.innerWidth, window.innerHeight, false);
  State.renderer.shadowMap.enabled = true;
  State.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xa0825c, 0.6);
  State.scene.add(hemi);
  const amb = new THREE.AmbientLight(0xf5f0e6, 0.4);
  State.scene.add(amb);

  const sun = new THREE.DirectionalLight(0xfff8e8, 1.2);
  sun.position.set(200, 300, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0005;
  State.scene.add(sun);

  const floor = buildFloor();
  State.scene.add(floor);

  State.controls = new THREE.OrbitControls(State.camera, State.renderer.domElement);
  State.controls.enableDamping = true;
  State.controls.dampingFactor = 0.08;
  State.controls.minDistance = 60;
  State.controls.maxDistance = 1200;
  State.controls.maxPolarAngle = Math.PI / 2 - 0.04;
  State.controls.target.set(0, 80, ROOM_BACK_Z + 200);
  State.controls.enabled = true;

  State.raycaster = new THREE.Raycaster();
  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  State.camera.aspect = window.innerWidth / window.innerHeight;
  State.camera.updateProjectionMatrix();
  State.renderer.setSize(window.innerWidth, window.innerHeight, false);
}

function animate() {
  requestAnimationFrame(animate);
  State.controls.update();
  State.renderer.render(State.scene, State.camera);
}

/* ===== بناء الحوائط (بلوكات حول الثقوب) ===== */
function buildWall(w, h, t, holes, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.92, metalness: 0
  });
  const box = function(bw, bh, bx, by) {
    if (bw < 0.5 || bh < 0.5) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), mat);
    m.position.set(bx, by, 0);
    m.receiveShadow = true;
    group.add(m);
  };
  const L = -w / 2, R = w / 2;
  const clamped = holes.map(function(h) {
    const x0 = Math.max(L, h.x - h.w / 2);
    const x1 = Math.min(R, h.x + h.w / 2);
    const y0 = Math.max(0, h.y - h.h / 2);
    const y1 = Math.min(h, h.y + h.h / 2);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2 };
  }).filter(Boolean).sort(function(a, b) { return a.x0 - b.x0; });

  if (!clamped.length) {
    box(w, h, 0, h / 2);
    return group;
  }
  let cur = L;
  for (let i = 0; i < clamped.length; i++) {
    const ho = clamped[i];
    if (ho.x0 > cur + 0.5) box(ho.x0 - cur, h, cur + (ho.x0 - cur) / 2, h / 2);
    if (ho.y0 > 0.5) box(ho.w, ho.y0, ho.cx, ho.y0 / 2);
    if (ho.y1 < h - 0.5) box(ho.w, h - ho.y1, ho.cx, (ho.y1 + h) / 2);
    cur = ho.x1;
  }
  if (cur < R - 0.5) box(R - cur, h, cur + (R - cur) / 2, h / 2);
  return group;
}

function getWallHoles(side) {
  const holes = [];
  const zCenter = ROOM_BACK_Z + ROOM.width / 2;
  State.items.forEach(function(it) {
    const u = it.userData;
    if (u.type !== 'door' && u.type !== 'window') return;
    if ((u.wallSide || 'back') !== side) return;
    const p = u.params;
    let lx;
    if (side === 'back') lx = it.position.x;
    else if (side === 'left') lx = zCenter - it.position.z;
    else lx = it.position.z - zCenter;
    holes.push({ x: lx, y: it.position.y + p.h / 2, w: p.w, h: p.h });
  });
  return holes;
}

function buildRoom() {
  if (ROOM.group) {
    State.scene.remove(ROOM.group);
    ROOM.group = null;
  }
  if (!ROOM.visible) return;
  const g = new THREE.Group();
  const t = ROOM.wallThickness;
  const h = ROOM.height;
  const L = ROOM.length;
  const W = ROOM.width;
  const zBack = ROOM_BACK_Z;

  const back = buildWall(L, h, t, getWallHoles('back'), State.settings.wallColor);
  back.position.set(0, 0, zBack);
  g.add(back);

  const left = buildWall(W, h, t, getWallHoles('left'), State.settings.wallColor);
  left.rotation.y = Math.PI / 2;
  left.position.set(-L / 2, 0, zBack + W / 2);
  g.add(left);

  const right = buildWall(W, h, t, getWallHoles('right'), State.settings.wallColor);
  right.rotation.y = -Math.PI / 2;
  right.position.set(L / 2, 0, zBack + W / 2);
  g.add(right);

  ROOM.group = g;
  State.scene.add(g);
}

/* ===== مواد ===== */
function mdfMat(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color || State.settings.mdfColor),
    roughness: 0.68, metalness: 0.04
  });
}

function panel(w, h, d, x, y, z, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mdfMat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.15 })
  );
  m.add(line);
  return m;
}

function buildBaseDoor1(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const ih = H - 2*t;
  for (let i = 1; i <= p.shelves; i++) {
    g.add(panel(W - 2*t, t, D - t, 0, t + (ih / (p.shelves + 1)) * i, t/2, c));
  }
  g.add(panel(W - 2*t - 2, H - 2*t - 2, t, 0, H/2, D/2 + t/2, c));
  return g;
}

function buildBaseDoor2(p, t, c) {
  const g = buildBaseDoor1(p, t, c);
  const W = p.w, H = p.h, D = p.d;
  g.children.pop();
  const dw = (W - 2*t) / 2 - 2;
  g.add(panel(dw, H - 2*t - 2, t, -dw/2 - 1, H/2, D/2 + t/2, c));
  g.add(panel(dw, H - 2*t - 2, t,  dw/2 + 1, H/2, D/2 + t/2, c));
  return g;
}

function buildBaseDrawers(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const dh = (H - 2*t) / 3;
  for (let i = 0; i < 3; i++) {
    g.add(panel(W - 2*t - 2, dh - 4, t, 0, t + dh * i + dh/2, D/2 + t/2, c));
  }
  return g;
}

function buildBaseOven(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const oh = H * 0.55;
  const om = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.3, metalness: 0.6 });
  const od = new THREE.Mesh(new THREE.BoxGeometry(W - 2*t - 4, oh, t), om);
  od.position.set(0, t + oh/2 + 4, D/2 + t/2);
  g.add(od);
  const dh = H - 2*t - oh - 8;
  if (dh > 8) g.add(panel(W - 2*t - 2, dh - 4, t, 0, t + oh + 8 + dh/2, D/2 + t/2, c));
  return g;
}

function buildBaseSink(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const dw = (W - 2*t) / 2 - 2;
  g.add(panel(dw, H - 2*t - 2, t, -dw/2 - 1, H/2, D/2 + t/2, c));
  g.add(panel(dw, H - 2*t - 2, t,  dw/2 + 1, H/2, D/2 + t/2, c));
  const sm = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.85 });
  const sk = new THREE.Mesh(new THREE.BoxGeometry(W - 2*t - 8, 6, D - 12), sm);
  sk.position.set(0, H - t - 3, 0);
  g.add(sk);
  return g;
}

function buildWallOpen(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const ih = H - 2*t;
  for (let i = 1; i <= p.shelves; i++) {
    g.add(panel(W - 2*t, t, D - t, 0, t + (ih / (p.shelves + 1)) * i, t/2, c));
  }
  return g;
}

function buildTallFridge(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  const fm = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.25, metalness: 0.75 });
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));
  const th = H * 0.55;
  const bh = H - th - 2*t - 4;
  const dt = new THREE.Mesh(new THREE.BoxGeometry(W - 2*t - 2, th, t), fm);
  dt.position.set(0, t + bh + 2 + th/2, D/2 + t/2);
  g.add(dt);
  const db = new THREE.Mesh(new THREE.BoxGeometry(W - 2*t - 2, bh, t), fm);
  db.position.set(0, t + bh/2, D/2 + t/2);
  g.add(db);
  return g;
}

function aluMat() {
  return new THREE.MeshStandardMaterial({ color: 0xb8bcc1, roughness: 0.3, metalness: 0.85 });
}
function glassMat() {
  return new THREE.MeshStandardMaterial({
    color: 0xc0dff0, roughness: 0.05, metalness: 0.05,
    transparent: true, opacity: 0.28
  });
}
function aluBar(w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), aluMat());
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function buildDoor(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = t * 1.1;
  const fw = 5;
  g.add(aluBar(W, fw, D, 0, H - fw/2, 0));
  g.add(aluBar(W, fw, D, 0, fw/2, 0));
  g.add(aluBar(fw, H - 2*fw, D, -W/2 + fw/2, H/2, 0));
  g.add(aluBar(fw, H - 2*fw, D,  W/2 - fw/2, H/2, 0));
  const midY = H * 0.4;
  g.add(aluBar(W - 2*fw, fw/2, D, 0, midY, 0));
  const gTop = new THREE.Mesh(new THREE.BoxGeometry(W - 2*fw, H - midY - fw, D - 1), glassMat());
  gTop.position.set(0, (midY + fw/2 + H - fw/2) / 2, 0);
  g.add(gTop);
  const gBot = new THREE.Mesh(new THREE.BoxGeometry(W - 2*fw, midY - fw, D - 1), glassMat());
  gBot.position.set(0, (fw/2 + midY - fw/2) / 2, 0);
  g.add(gBot);
  const hMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.25, metalness: 0.9 });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(2, 22, 2.5), hMat);
  handle.position.set(W/2 - fw - 4, H * 0.42, D/2 + 1);
  g.add(handle);
  return g;
}

function buildWindow(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = t * 0.9;
  const fw = 4;
  g.add(aluBar(W, fw, D, 0, H - fw/2, 0));
  g.add(aluBar(W, fw, D, 0, fw/2, 0));
  g.add(aluBar(fw, H - 2*fw, D, -W/2 + fw/2, H/2, 0));
  g.add(aluBar(fw, H - 2*fw, D,  W/2 - fw/2, H/2, 0));
  g.add(aluBar(fw/2, H - 2*fw, D, 0, H/2, 0));
  g.add(aluBar(W - 2*fw, fw/2, D, 0, H/2, 0));
  const iw = (W - 2*fw) / 2 - fw/4;
  const ih = (H - 2*fw) / 2 - fw/4;
  [{x:-iw/2-fw/4, y:H/2+ih/2+fw/4}, {x:iw/2+fw/4, y:H/2+ih/2+fw/4},
   {x:-iw/2-fw/4, y:H/2-ih/2-fw/4}, {x:iw/2+fw/4, y:H/2-ih/2-fw/4}].forEach(function(o) {
    const gl = new THREE.Mesh(new THREE.BoxGeometry(iw, ih, D - 1), glassMat());
    gl.position.set(o.x, o.y, 0);
    g.add(gl);
  });
  return g;
}

COMPONENTS.map = {
  base_door1:   { name: 'سفلي بباب',    icon: '🚪',  build: buildBaseDoor1,  defaults: { w: 60, h: 72, d: 55, shelves: 1 }, mount: 'floor' },
  base_door2:   { name: 'سفلي ببابين',  icon: '🚪🚪', build: buildBaseDoor2,  defaults: { w: 90, h: 72, d: 55, shelves: 1 }, mount: 'floor' },
  base_drawers: { name: 'سفلي أدراج',   icon: '🗄️',  build: buildBaseDrawers, defaults: { w: 45, h: 72, d: 55, shelves: 0 }, mount: 'floor' },
  base_oven:    { name: 'فرن',          icon: '🔥',  build: buildBaseOven,   defaults: { w: 60, h: 72, d: 55, shelves: 0 }, mount: 'floor' },
  base_sink:    { name: 'حوض',          icon: '🚰',  build: buildBaseSink,   defaults: { w: 80, h: 90, d: 55, shelves: 0 }, mount: 'floor' },
  wall_door1:   { name: 'علوي بباب',    icon: '📦',  build: buildBaseDoor1,  defaults: { w: 60, h: 72, d: 35, shelves: 1 }, mount: 'wall', defaultY: 145 },
  wall_door2:   { name: 'علوي ببابين',  icon: '📦📦', build: buildBaseDoor2,  defaults: { w: 90, h: 72, d: 35, shelves: 1 }, mount: 'wall', defaultY: 145 },
  wall_open:    { name: 'علوي مفتوح',   icon: '📂',  build: buildWallOpen,   defaults: { w: 60, h: 72, d: 35, shelves: 1 }, mount: 'wall', defaultY: 145 },
  tall_fridge:  { name: 'ثلاجة',        icon: '❄️',  build: buildTallFridge, defaults: { w: 75, h: 180, d: 65, shelves: 0 }, mount: 'floor' },
  door:         { name: 'باب ألمنيوم',  icon: '🚪',  build: buildDoor,       defaults: { w: 90, h: 210, d: 0, shelves: 0 }, mount: 'wall', defaultY: 0, snapWall: true },
  window:       { name: 'نافذة ألمنيوم', icon: '🪟',  build: buildWindow,     defaults: { w: 120, h: 120, d: 0, shelves: 0 }, mount: 'wall', defaultY: 100, snapWall: true }
};

function createComponent(type, pos) {
  const def = COMPONENTS.map[type];
  if (!def) return null;
  const p = Object.assign({}, def.defaults);
  const t = 1.8;
  const g = def.build(p, t, State.settings.mdfColor);
  const y = (pos && pos.y !== undefined) ? pos.y : (def.defaultY || 0);
  g.position.set(pos ? pos.x : 0, y, pos ? pos.z : 0);
  g.userData = {
    id: State.nextId++, type: type, params: p, thickness: 18,
    color: State.settings.mdfColor, isItem: true, mount: def.mount,
    wallSide: def.snapWall ? 'back' : null
  };
  State.scene.add(g);
  State.items.push(g);
  if (def.snapWall) buildRoom();
  return g;
}

/* ===== القيود ===== */
function getFootprint(item) {
  const u = item.userData;
  const rot = Math.abs(Math.sin(item.rotation.y)) > 0.5;
  return rot ? { w: u.params.d, d: u.params.w } : { w: u.params.w, d: u.params.d };
}

function constrainToRoom(item) {
  const u = item.userData;
  const fp = getFootprint(item);
  const hW = fp.w / 2, hD = fp.d / 2;
  const halfL = ROOM.length / 2;
  const t = ROOM.wallThickness;

  if (u.snapWall || u.type === 'door' || u.type === 'window') {
    const px = item.position.x;
    const pz = item.position.z;
    const dBack = Math.abs(pz - ROOM_BACK_Z);
    const dLeft = Math.abs(px - (-halfL));
    const dRight = Math.abs(px - halfL);
    const m = Math.min(dBack, dLeft, dRight);
    const side = (m === dBack) ? 'back' : (m === dLeft ? 'left' : 'right');
    u.wallSide = side;
    const zBack = ROOM_BACK_Z;
    const zFront = ROOM_BACK_Z + ROOM.width;
    if (side === 'back') {
      item.position.z = ROOM_BACK_Z + t / 2 + 0.1;
      item.position.x = Math.max(-halfL + hW, Math.min(halfL - hW, item.position.x));
      item.rotation.y = 0;
    } else if (side === 'left') {
      item.position.x = -halfL - t / 2 - 0.1;
      item.position.z = Math.max(zBack + hW, Math.min(zFront - hW, item.position.z));
      item.rotation.y = Math.PI / 2;
    } else {
      item.position.x = halfL + t / 2 + 0.1;
      item.position.z = Math.max(zBack + hW, Math.min(zFront - hW, item.position.z));
      item.rotation.y = -Math.PI / 2;
    }
    return;
  }

  const minX = -halfL + hW, maxX = halfL - hW;
  const minZ = ROOM_BACK_Z + hD, maxZ = ROOM_BACK_Z + ROOM.width - hD;
  item.position.x = Math.max(minX, Math.min(maxX, item.position.x));
  item.position.z = Math.max(minZ, Math.min(maxZ, item.position.z));
  if (u.mount !== 'wall') item.position.y = 0;
}

function updateRotation(item) {
  const u = item.userData;
  if (u.snapWall || u.type === 'door' || u.type === 'window') return;
  const fp = getFootprint(item);
  const hW = fp.w / 2, hD = fp.d / 2;
  const halfL = ROOM.length / 2;
  const minX = -halfL + hW, maxX = halfL - hW;
  const minZ = ROOM_BACK_Z + hD, maxZ = ROOM_BACK_Z + ROOM.width - hD;
  const s = 12;
  const dL = Math.abs(item.position.x - minX);
  const dR = Math.abs(item.position.x - maxX);
  const dB = Math.abs(item.position.z - minZ);
  const dF = Math.abs(item.position.z - maxZ);
  const m = Math.min(dL, dR, dB, dF);
  if (m > s) { item.rotation.y = 0; return; }
  if (m === dB) item.rotation.y = 0;
  else if (m === dF) item.rotation.y = Math.PI;
  else if (m === dL) item.rotation.y = Math.PI / 2;
  else if (m === dR) item.rotation.y = -Math.PI / 2;
}

const Drag = {
  active: false, item: null,
  startPoint: new THREE.Vector3(),
  itemStartPos: new THREE.Vector3(),
  plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
  snapDist: 8,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2()
};

function getPointerWorld(e) {
  const rect = State.renderer.domElement.getBoundingClientRect();
  Drag.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  Drag.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  Drag.raycaster.setFromCamera(Drag.pointer, State.camera);
  const p = new THREE.Vector3();
  Drag.raycaster.ray.intersectPlane(Drag.plane, p);
  return p || new THREE.Vector3();
}

function pickItemAt(e) {
  const rect = State.renderer.domElement.getBoundingClientRect();
  const mx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const my = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  State.raycaster.setFromCamera({ x: mx, y: my }, State.camera);
  const hits = State.raycaster.intersectObjects(State.items, true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && State.items.indexOf(o) < 0) o = o.parent;
  return o;
}

function highlightItem(item) {
  State.items.forEach(function(it) {
    it.traverse(function(o) {
      if (o.isLineSegments && o.userData._hi) {
        o.material.color.setHex(0x000000);
        o.material.opacity = 0.15;
        delete o.userData._hi;
      }
    });
  });
  if (!item) return;
  item.traverse(function(o) {
    if (o.isLineSegments) {
      o.material.color.setHex(0x00d2a8);
      o.material.opacity = 1;
      o.userData._hi = true;
    }
  });
}

function applySnap(item) {
  const fp = getFootprint(item);
  const hW = fp.w / 2, hD = fp.d / 2;
  const s = Drag.snapDist;
  const halfL = ROOM.length / 2;
  const minX = -halfL + hW, maxX = halfL - hW;
  const minZ = ROOM_BACK_Z + hD, maxZ = ROOM_BACK_Z + ROOM.width - hD;
  if (Math.abs(item.position.z - minZ) < s * 2.5) item.position.z = minZ;
  if (Math.abs(item.position.z - maxZ) < s * 2.5) item.position.z = maxZ;
  if (Math.abs(item.position.x - minX) < s * 2.5) item.position.x = minX;
  if (Math.abs(item.position.x - maxX) < s * 2.5) item.position.x = maxX;
  State.items.forEach(function(o) {
    if (o === item) return;
    const ofp = getFootprint(o);
    const oHW = ofp.w / 2, oHD = ofp.d / 2;
    if (Math.abs(item.position.z - o.position.z) < s) {
      const r = o.position.x + oHW + hW;
      if (Math.abs(item.position.x - r) < s) { item.position.x = r; item.position.z = o.position.z; }
      const l = o.position.x - oHW - hW;
      if (Math.abs(item.position.x - l) < s) { item.position.x = l; item.position.z = o.position.z; }
    }
    if (Math.abs(item.position.x - o.position.x) < s) {
      const f = o.position.z + oHD + hD;
      if (Math.abs(item.position.z - f) < s) { item.position.z = f; item.position.x = o.position.x; }
      const b = o.position.z - oHD - hD;
      if (Math.abs(item.position.z - b) < s) { item.position.z = b; item.position.x = o.position.x; }
    }
  });
  item.position.x = Math.max(minX, Math.min(maxX, item.position.x));
  item.position.z = Math.max(minZ, Math.min(maxZ, item.position.z));
  updateRotation(item);
}

function setupDragEvents() {
  const c = State.renderer.domElement;
  let sx = 0, sy = 0, moved = false, down = null, wasSel = false;
  let lastT = 0, lastI = null;

  c.addEventListener('pointerdown', function(e) {
    const item = pickItemAt(e);
    down = item;
    sx = e.clientX; sy = e.clientY; moved = false;
    const isDW = item && item.userData &&
      (item.userData.type === 'door' || item.userData.type === 'window');
    wasSel = (State.selected === item && item !== null) || isDW;
    if (item && wasSel) {
      Drag.active = true;
      Drag.item = item;
      Drag.itemStartPos.copy(item.position);
      Drag.startPoint.copy(getPointerWorld(e));
      if (State.controls) State.controls.enabled = false;
    }
  }, true);

  c.addEventListener('pointermove', function(e) {
    if (Drag.active && Drag.item) {
      const d = Math.sqrt((e.clientX - sx) ** 2 + (e.clientY - sy) ** 2);
      if (d > 6) moved = true;
      if (moved) {
        const p = getPointerWorld(e);
        const dx = p.x - Drag.startPoint.x;
        const dz = p.z - Drag.startPoint.z;
        Drag.item.position.x = Drag.itemStartPos.x + dx;
        Drag.item.position.z = Drag.itemStartPos.z + dz;
        constrainToRoom(Drag.item);
        const u = Drag.item.userData;
        if (u.snapWall || u.type === 'door' || u.type === 'window') buildRoom();
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  c.addEventListener('pointerup', function(e) {
    const now = Date.now();
    const dt = now - lastT;
    if (Drag.active && Drag.item && moved) {
      applySnap(Drag.item);
      const u = Drag.item.userData;
      if (u.snapWall || u.type === 'door' || u.type === 'window') buildRoom();
      Drag.active = false;
      if (State.controls) State.controls.enabled = true;
      Drag.item = null; down = null; moved = false;
      lastT = 0; lastI = null;
      e.stopPropagation();
      return;
    }
    if (down && !moved) {
      if (!wasSel) {
        State.selected = down;
        highlightItem(down);
        renderList();
        closeProps();
        setStatus('نقرة ثانية للخصائص');
        lastT = now; lastI = down;
      } else if (lastI === down && dt < 400) {
        selectItem(down);
        lastT = 0; lastI = null;
      } else {
        lastT = now; lastI = down;
      }
      e.stopPropagation();
    } else if (!down && !moved) {
      State.selected = null;
      highlightItem(null);
      closeProps();
      renderList();
      e.stopPropagation();
    }
    Drag.active = false;
    if (State.controls) State.controls.enabled = true;
    Drag.item = null; down = null; moved = false;
  }, true);

  c.addEventListener('pointercancel', function() {
    if (Drag.active && Drag.item) applySnap(Drag.item);
    Drag.active = false;
    if (State.controls) State.controls.enabled = true;
    Drag.item = null; down = null; moved = false;
  }, true);
}

/* ===== الواجهة ===== */
const UI = {};

function initUI() {
  UI.panel = document.getElementById('panel');
  UI.panelTitle = document.getElementById('panel-title');
  UI.panelBody = document.getElementById('panel-body');
  UI.props = document.getElementById('props');
  UI.propsTitle = document.getElementById('props-title');
  UI.propsBody = document.getElementById('props-body');
  UI.status = document.getElementById('status');

  document.getElementById('panel-close').onclick = closePanel;
  document.getElementById('props-close').onclick = closeProps;

  const fm = document.getElementById('fab-main');
  const menu = document.getElementById('fab-menu');
  fm.onclick = function(e) {
    e.stopPropagation();
    const open = !menu.classList.contains('hidden');
    if (open) { menu.classList.add('hidden'); fm.classList.remove('open'); }
    else { menu.classList.remove('hidden'); fm.classList.add('open'); }
  };
  document.querySelectorAll('.fab-item').forEach(function(b) {
    b.onclick = function(e) {
      e.stopPropagation();
      openPanel(b.dataset.panel);
      menu.classList.add('hidden');
      fm.classList.remove('open');
    };
  });
}

function openPanel(name) {
  UI.panel.classList.remove('hidden');
  UI.panelTitle.textContent = ({
    add: 'إضافة', colors: 'ألوان', list: 'العناصر',
    room: 'الغرفة', cut: 'القص', io: 'ملف'
  })[name] || 'لوحة';
  UI.panelBody.innerHTML = '';
  if (name === 'add') renderAdd();
  else if (name === 'colors') renderColors();
  else if (name === 'list') renderList();
  else if (name === 'room') renderRoom();
  else if (name === 'cut') renderCut();
  else if (name === 'io') renderIO();
}
function closePanel() { UI.panel.classList.add('hidden'); }
function openProps() { UI.props.classList.remove('hidden'); }
function closeProps() { UI.props.classList.add('hidden'); }

function setStatus(m) {
  if (!UI.status) return;
  UI.status.textContent = m;
  if (window._st) clearTimeout(window._st);
  window._st = setTimeout(function() {
    UI.status.textContent = 'نقرة = تحديد · نقرتان = خصائص';
  }, 2500);
}

function renderAdd() {
  const cats = [
    { t: 'صناديق سفلية', items: ['base_door1','base_door2','base_drawers','base_oven','base_sink'] },
    { t: 'صناديق علوية', items: ['wall_door1','wall_door2','wall_open'] },
    { t: 'عناصر أخرى', items: ['tall_fridge'] },
    { t: 'مكونات البناء', items: ['door','window'] }
  ];
  cats.forEach(function(cat) {
    const sec = document.createElement('div');
    sec.className = 'category';
    sec.innerHTML = '<h3>' + cat.t + '</h3>';
    const grid = document.createElement('div');
    grid.className = 'items-grid';
    cat.items.forEach(function(type) {
      const def = COMPONENTS.map[type];
      const card = document.createElement('div');
      card.className = 'item-card';
      card.innerHTML = '<span class="ic">' + def.icon + '</span><span class="ttl">' + def.name + '</span>';
      card.onclick = function() { addToScene(type); };
      grid.appendChild(card);
    });
    sec.appendChild(grid);
    UI.panelBody.appendChild(sec);
  });
}

function addToScene(type) {
  const def = COMPONENTS.map[type];
  if (!def) return;
  const p = def.defaults;
  if (type === 'door' || type === 'window') {
    const zBack = ROOM_BACK_Z + ROOM.wallThickness / 2 + 0.1;
    let x = 0;
    const existing = State.items.filter(function(it) {
      return it.userData.type === 'door' || it.userData.type === 'window';
    });
    if (existing.length) {
      const last = existing[existing.length - 1];
      x = last.position.x + last.userData.params.w / 2 + p.w / 2 + 15;
    }
    const halfL = ROOM.length / 2;
    if (x > halfL - p.w / 2 - 5) x = 0;
    createComponent(type, { x: x, y: def.defaultY, z: zBack });
    setStatus('أضيف');
    buildRoom();
    return;
  }
  const hW = p.w / 2;
  const halfL = ROOM.length / 2;
  let x = -halfL + hW + 5;
  State.items.forEach(function(it) {
    if (it.userData.mount === 'floor' || it.userData.type.indexOf('wall_') === 0) {
      const fp = getFootprint(it);
      const r = it.position.x + fp.w / 2 + hW + 2;
      if (r > x) x = r;
    }
  });
  if (x > halfL - hW) x = -halfL + hW + 5;
  const z = ROOM_BACK_Z + ROOM.wallThickness / 2 + p.d / 2 + 0.1;
  createComponent(type, { x: x, y: def.defaultY || 0, z: z });
  setStatus('أضيف');
}

function renderColors() {
  const c1 = document.createElement('div');
  c1.className = 'field';
  c1.innerHTML = '<label>لون MDF</label><input type="color" id="c-mdf" value="' + State.settings.mdfColor + '">';
  UI.panelBody.appendChild(c1);
  document.getElementById('c-mdf').oninput = function(e) {
    State.settings.mdfColor = e.target.value;
    State.items.forEach(function(it) {
      if (it.userData.type !== 'door' && it.userData.type !== 'window') {
        it.userData.color = e.target.value;
        rebuildItem(it);
      }
    });
  };
  const c2 = document.createElement('div');
  c2.className = 'field';
  c2.innerHTML = '<label>لون الأرضية</label><input type="color" id="c-floor" value="' + State.settings.floorColor + '">';
  UI.panelBody.appendChild(c2);
  document.getElementById('c-floor').oninput = function(e) {
    State.settings.floorColor = e.target.value;
    State.scene.children.forEach(function(o) {
      if (o.isMesh && o.geometry && o.geometry.type === 'PlaneGeometry') {
        o.material.color.set(e.target.value);
      }
    });
  };
  const c3 = document.createElement('div');
  c3.className = 'field';
  c3.innerHTML = '<label>لون الجدران</label><input type="color" id="c-wall" value="' + State.settings.wallColor + '">';
  UI.panelBody.appendChild(c3);
  document.getElementById('c-wall').oninput = function(e) {
    State.settings.wallColor = e.target.value;
    buildRoom();
  };
  const c4 = document.createElement('div');
  c4.className = 'field';
  c4.innerHTML = '<label>السماء (أعلى)</label><input type="color" id="c-sky1" value="' + State.settings.skyTop + '">';
  UI.panelBody.appendChild(c4);
  document.getElementById('c-sky1').oninput = function(e) {
    State.settings.skyTop = e.target.value;
    refreshEnvironment();
  };
  const c5 = document.createElement('div');
  c5.className = 'field';
  c5.innerHTML = '<label>السماء (أسفل)</label><input type="color" id="c-sky2" value="' + State.settings.skyBottom + '">';
  UI.panelBody.appendChild(c5);
  document.getElementById('c-sky2').oninput = function(e) {
    State.settings.skyBottom = e.target.value;
    refreshEnvironment();
  };
}

function renderList() {
  if (!State.items.length) {
    UI.panelBody.innerHTML = '<p style="text-align:center;color:#b9b9c6;padding:20px">لا عناصر</p>';
    return;
  }
  State.items.forEach(function(it, i) {
    const def = COMPONENTS.map[it.userData.type];
    const div = document.createElement('div');
    div.className = 'list-item';
    if (State.selected === it) div.classList.add('active');
    div.innerHTML = '<span>' + (i+1) + '. ' + def.icon + ' ' + def.name + '</span>' +
      '<span style="font-size:11px;color:#b9b9c6">' +
      Math.round(it.userData.params.w) + '×' + Math.round(it.userData.params.h) + '</span>';
    div.onclick = function() {
      State.selected = it;
      highlightItem(it);
      renderProps(it);
      openProps();
    };
    UI.panelBody.appendChild(div);
  });
}

function renderRoom() {
  const add = function(label, key, min, max, step) {
    const d = document.createElement('div');
    d.className = 'field';
    d.innerHTML = '<label>' + label + ' (سم)</label>' +
      '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + ROOM[key] + '">';
    UI.panelBody.appendChild(d);
    const inp = d.querySelector('input');
    const h = function() {
      let v = parseFloat(inp.value) || min;
      v = Math.max(min, Math.min(max, v));
      inp.value = v;
      ROOM[key] = v;
      State.items.forEach(function(it) { constrainToRoom(it); });
      buildRoom();
    };
    inp.onchange = h; inp.onblur = h;
  };
  add('الطول', 'length', 200, 1000, 10);
  add('العرض', 'width', 200, 800, 10);
  add('الارتفاع', 'height', 200, 400, 5);
  add('سمك الحائط', 'wallThickness', 2, 20, 1);

  const h3 = document.createElement('div');
  h3.className = 'category';
  h3.innerHTML = '<h3>مساحات جاهزة</h3>';
  UI.panelBody.appendChild(h3);
  const g = document.createElement('div');
  g.className = 'items-grid';
  [{ n: 'صغير', L: 250, W: 200, H: 250 },
   { n: 'متوسط', L: 400, W: 300, H: 270 },
   { n: 'كبير', L: 600, W: 400, H: 300 }].forEach(function(pr) {
    const c = document.createElement('div');
    c.className = 'item-card';
    c.innerHTML = '<span class="ic">📐</span><span class="ttl">' + pr.n + '</span>';
    c.onclick = function() {
      ROOM.length = pr.L; ROOM.width = pr.W; ROOM.height = pr.H;
      State.items.forEach(function(it) { constrainToRoom(it); });
      buildRoom();
      renderRoom();
    };
    g.appendChild(c);
  });
  UI.panelBody.appendChild(g);

  const clr = document.createElement('button');
  clr.className = 'btn-secondary btn-danger';
  clr.textContent = 'حذف كل العناصر';
  clr.style.marginTop = '16px';
  clr.onclick = function() {
    State.items.forEach(function(it) { State.scene.remove(it); });
    State.items = [];
    State.selected = null;
    closeProps();
    buildRoom();
  };
  UI.panelBody.appendChild(clr);
}

function renderCut() {
  if (!State.items.length) {
    UI.panelBody.innerHTML = '<p style="text-align:center;color:#b9b9c6;padding:20px">لا عناصر</p>';
    return;
  }
  const acc = {};
  State.items.forEach(function(it) {
    const u = it.userData;
    if (u.type === 'door' || u.type === 'window') return;
    const p = u.params;
    const t = u.thickness / 10;
    const W = p.w, H = p.h, D = p.d;
    const add = function(name, w, h) {
      const k = name + '|' + w.toFixed(1) + '|' + h.toFixed(1);
      if (acc[k]) acc[k].q++;
      else acc[k] = { name: name, w: w, h: h, q: 1 };
    };
    add('جانب', D, H);
    add('جانب', D, H);
    add('قاع', W - 2*t, D);
    add('سقف', W - 2*t, D);
    add('ظهر', W - 2*t, H - 2*t);
    if (['base_door1','wall_door1'].indexOf(u.type) >= 0) add('باب', W - 2*t, H - 2*t);
    if (['base_door2','wall_door2','base_sink'].indexOf(u.type) >= 0) {
      const dw = (W - 2*t) / 2;
      add('باب', dw, H - 2*t);
      add('باب', dw, H - 2*t);
    }
    if (u.type === 'base_drawers') {
      const dh = (H - 2*t) / 3;
      add('درج', W - 2*t, dh);
      add('درج', W - 2*t, dh);
      add('درج', W - 2*t, dh);
    }
    if (p.shelves > 0) {
      for (let i = 0; i < p.shelves; i++) add('رف', W - 2*t, D - t);
    }
  });
  const table = document.createElement('table');
  table.className = 'cut-table';
  table.innerHTML = '<thead><tr><th>القطعة</th><th>عرض</th><th>طول</th><th>عدد</th></tr></thead>';
  const tb = document.createElement('tbody');
  let total = 0;
  Object.keys(acc).forEach(function(k) {
    const x = acc[k];
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + x.name + '</td><td>' + x.w.toFixed(1) + '</td><td>' + x.h.toFixed(1) + '</td><td>' + x.q + '</td>';
    tb.appendChild(tr);
    total += x.w * x.h * x.q / 10000;
  });
  table.appendChild(tb);
  UI.panelBody.appendChild(table);
  const tot = document.createElement('div');
  tot.className = 'cut-total';
  tot.textContent = 'المساحة: ' + total.toFixed(3) + ' م²';
  UI.panelBody.appendChild(tot);
}

function renderIO() {
  const exp = document.createElement('button');
  exp.className = 'btn-primary';
  exp.textContent = 'تصدير JSON';
  exp.onclick = function() {
    const data = {
      version: '1.0', settings: State.settings, room: ROOM,
      items: State.items.map(function(it) {
        return {
          type: it.userData.type, params: it.userData.params,
          thickness: it.userData.thickness, color: it.userData.color,
          mount: it.userData.mount, wallSide: it.userData.wallSide,
          position: { x: it.position.x, y: it.position.y, z: it.position.z },
          rotationY: it.rotation.y
        };
      })
    };
    prompt('انسخ:', JSON.stringify(data));
  };
  UI.panelBody.appendChild(exp);

  const imp = document.createElement('button');
  imp.className = 'btn-secondary';
  imp.textContent = 'استيراد JSON';
  imp.onclick = function() {
    const t = prompt('الصق:');
    if (!t) return;
    try { loadScene(JSON.parse(t)); } catch (e) { alert('خطأ'); }
  };
  UI.panelBody.appendChild(imp);

  const sav = document.createElement('button');
  sav.className = 'btn-secondary';
  sav.textContent = 'حفظ في المتصفح';
  sav.onclick = function() {
    localStorage.setItem('kd_scene', JSON.stringify({
      settings: State.settings, room: ROOM,
      items: State.items.map(function(it) {
        return {
          type: it.userData.type, params: it.userData.params,
          thickness: it.userData.thickness, color: it.userData.color,
          mount: it.userData.mount, wallSide: it.userData.wallSide,
          position: { x: it.position.x, y: it.position.y, z: it.position.z },
          rotationY: it.rotation.y
        };
      })
    }));
    setStatus('تم الحفظ');
  };
  UI.panelBody.appendChild(sav);

  const loa = document.createElement('button');
  loa.className = 'btn-secondary';
  loa.textContent = 'تحميل من المتصفح';
  loa.onclick = function() {
    const t = localStorage.getItem('kd_scene');
    if (!t) { alert('لا يوجد حفظ'); return; }
    loadScene(JSON.parse(t));
  };
  UI.panelBody.appendChild(loa);
}

function loadScene(data) {
  if (data.settings) Object.assign(State.settings, data.settings);
  if (data.room) Object.assign(ROOM, data.room);
  State.items.forEach(function(it) { State.scene.remove(it); });
  State.items = [];
  (data.items || []).forEach(function(it) {
    const def = COMPONENTS.map[it.type];
    if (!def) return;
    const p = Object.assign({}, def.defaults, it.params || {});
    const t = (it.thickness || 18) / 10;
    const g = def.build(p, t, it.color || State.settings.mdfColor);
    g.userData = {
      id: State.nextId++, type: it.type, params: p,
      thickness: it.thickness || 18, color: it.color || State.settings.mdfColor,
      isItem: true, mount: it.mount || def.mount, wallSide: it.wallSide || null
    };
    if (it.position) g.position.set(it.position.x, it.position.y, it.position.z);
    if (it.rotationY) g.rotation.y = it.rotationY;
    State.scene.add(g);
    State.items.push(g);
  });
  refreshEnvironment();
  buildRoom();
  setStatus('تم التحميل');
}

/* ===== الخصائص ===== */
function selectItem(item) {
  State.selected = item;
  renderProps(item);
  openProps();
  renderList();
}

function renderProps(item) {
  State.editing = item;
  const u = item.userData;
  UI.propsTitle.textContent = COMPONENTS.map[u.type].name;
  UI.propsBody.innerHTML = '';

  const addNum = function(label, val, min, max, onC) {
    const d = document.createElement('div');
    d.className = 'field';
    d.innerHTML = '<label>' + label + '</label>' +
      '<input type="number" min="' + min + '" max="' + max + '" step="1" value="' + val + '">';
    UI.propsBody.appendChild(d);
    const inp = d.querySelector('input');
    const h = function() {
      let v = parseFloat(inp.value) || min;
      v = Math.max(min, Math.min(max, v));
      inp.value = v;
      onC(v);
    };
    inp.onchange = h; inp.onblur = h;
  };

  const isDW = u.type === 'door' || u.type === 'window';

  addNum('العرض (سم)', u.params.w, 20, 200, function(v) {
    u.params.w = v;
    State.editing = rebuildItem(State.editing);
    State.selected = State.editing;
    constrainToRoom(State.editing);
    if (isDW) buildRoom();
    else updateRotation(State.editing);
  });

  addNum('الارتفاع (سم)', u.params.h, 20, 250, function(v) {
    u.params.h = v;
    State.editing = rebuildItem(State.editing);
    State.selected = State.editing;
    if (isDW && State.editing.position.y + v > ROOM.height) {
      State.editing.position.y = Math.max(0, ROOM.height - v);
    }
    if (isDW) buildRoom();
  });

  if (!isDW) {
    addNum('العمق (سم)', u.params.d, 20, 90, function(v) {
      u.params.d = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
      constrainToRoom(State.editing);
      updateRotation(State.editing);
    });
    addNum('الرفوف', u.params.shelves, 0, 6, function(v) {
      u.params.shelves = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
    });
  }

  if (u.mount === 'wall') {
    const maxY = ROOM.height - u.params.h;
    addNum('الارتفاع عن الأرض (سم)', Math.round(item.position.y), 0, maxY, function(v) {
      State.editing.position.y = v;
      if (isDW) buildRoom();
    });
  }

  addNum(isDW ? 'السمك (سم)' : 'سمك MDF (ملم)', u.thickness, isDW ? 3 : 10, isDW ? 15 : 30, function(v) {
    u.thickness = v;
    State.editing = rebuildItem(State.editing);
    State.selected = State.editing;
    if (isDW) buildRoom();
  });

  if (!isDW) {
    const cRow = document.createElement('div');
    cRow.className = 'field';
    cRow.innerHTML = '<label>اللون</label><input type="color" value="' + u.color + '">';
    UI.propsBody.appendChild(cRow);
    cRow.querySelector('input').oninput = function(e) {
      u.color = e.target.value;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
    };
  }

  const del = document.createElement('button');
  del.className = 'btn-secondary btn-danger';
  del.textContent = 'حذف';
  del.onclick = function() {
    State.scene.remove(item);
    State.items = State.items.filter(function(x) { return x !== item; });
    State.selected = null;
    State.editing = null;
    closeProps();
    renderList();
    if (isDW) buildRoom();
  };
  UI.propsBody.appendChild(del);
}

function disposeObj(o) {
  o.traverse(function(c) {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (Array.isArray(c.material)) c.material.forEach(function(m) { m.dispose(); });
      else c.material.dispose();
    }
  });
}

function rebuildItem(item) {
  const u = item.userData;
  const def = COMPONENTS.map[u.type];
  const t = u.thickness / 10;
  while (item.children.length) {
    const c = item.children[0];
    item.remove(c);
    disposeObj(c);
  }
  const temp = def.build(u.params, t, u.color);
  while (temp.children.length) item.add(temp.children[0]);
  return item;
}

/* ===== الإقلاع ===== */
window.addEventListener('load', function() {
  initUI();
  initThree();
  setupDragEvents();
  buildRoom();
  setStatus('جاهز');
});

function buildWall(w, wallH, t, holes, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.92, metalness: 0
  });
  const box = function(bw, bh, bx, by) {
    if (bw < 0.5 || bh < 0.5) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), mat);
    m.position.set(bx, by, 0);
    m.receiveShadow = true;
    group.add(m);
  };
  const L = -w / 2, R = w / 2;
  const clamped = holes.map(function(ho) {
    const x0 = Math.max(L, ho.x - ho.w / 2);
    const x1 = Math.min(R, ho.x + ho.w / 2);
    const y0 = Math.max(0, ho.y - ho.h / 2);
    const y1 = Math.min(wallH, ho.y + ho.h / 2);
    if (x1 - x0 < 1 || y1 - y0 < 1) return null;
    return { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2 };
  }).filter(Boolean).sort(function(a, b) { return a.x0 - b.x0; });

  if (!clamped.length) {
    box(w, wallH, 0, wallH / 2);
    return group;
  }
  let cur = L;
  for (let i = 0; i < clamped.length; i++) {
    const ho = clamped[i];
    if (ho.x0 > cur + 0.5) box(ho.x0 - cur, wallH, cur + (ho.x0 - cur) / 2, wallH / 2);
    if (ho.y0 > 0.5) box(ho.w, ho.y0, ho.cx, ho.y0 / 2);
    if (ho.y1 < wallH - 0.5) box(ho.w, wallH - ho.y1, ho.cx, (ho.y1 + wallH) / 2);
    cur = ho.x1;
  }
  if (cur < R - 0.5) box(R - cur, wallH, cur + (R - cur) / 2, wallH / 2);
  return group;
}
