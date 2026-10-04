/* ===== الحالة ===== */
const State = {
  scene: null, camera: null, renderer: null, controls: null,
  raycaster: null,
  items: [], selected: null, editing: null, nextId: 1,
  settings: {
    mdfColor: '#d9b878',
    floorColor: '#8a5a2b',
    wallColor: '#f0ece3',
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
  State.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  State.renderer.toneMappingExposure = 1.05;
  State.renderer.outputEncoding = THREE.sRGBEncoding;

  const hemi = new THREE.HemisphereLight(0xc8dfff, 0x8a5a2b, 0.55);
  State.scene.add(hemi);
  const amb = new THREE.AmbientLight(0xf5f0e6, 0.4);
  State.scene.add(amb);

  const sun = new THREE.DirectionalLight(0xfff5e0, 1.3);
  sun.position.set(200, 300, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -500;
  sun.shadow.camera.right = 500;
  sun.shadow.camera.top = 500;
  sun.shadow.camera.bottom = -500;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0005;
  State.scene.add(sun);


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
  if (typeof updateDragSmooth === 'function') updateDragSmooth();
  if (typeof updateDoorsAnim === 'function') updateDoorsAnim();
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
  // أرضية داخل الغرفة فقط
  if (State.floorMesh) State.scene.remove(State.floorMesh);
  var fL = ROOM.length + ROOM.wallThickness * 2;
  var fW = ROOM.width + ROOM.wallThickness * 2;
  var fmat = new THREE.MeshStandardMaterial({
    map: makeWoodTexture(),
    roughness: 0.7,
    metalness: 0.08
  });
  State.floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(fL, fW), fmat);
  State.floorMesh.rotation.x = -Math.PI / 2;
  State.floorMesh.position.set(0, 0.02, ROOM_BACK_Z + ROOM.width / 2);
  State.floorMesh.receiveShadow = true;
  State.scene.add(State.floorMesh);
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
  // كل عنصر جديد يبدأ مقفلاً
  // (سنضيفه في userData)
  const def = COMPONENTS.map[type];
  if (!def) return null;
  const p = Object.assign({}, def.defaults);
  const t = 1.8;
  const g = def.build(p, t, State.settings.mdfColor);
  const y = (pos && pos.y !== undefined) ? pos.y : (def.defaultY || 0);
  g.position.set(pos ? pos.x : 0, y, pos ? pos.z : 0);
  g.userData = {
    locked: true,
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
  dragY: 0,
  snapDist: 8,
  targetX: 0, targetZ: 0,
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
  setTimeout(updateToggleBtn, 10);
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
  var shotBtn = document.getElementById('fab-shot');
  if (shotBtn) shotBtn.onclick = function(e) { e.stopPropagation(); takeScreenshot(); };
  var undoBtn = document.getElementById('fab-undo');
  if (undoBtn) undoBtn.onclick = function(e) { e.stopPropagation(); History.undo(); };
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
    { t: 'إلكترونيات', items: ['microwave','dishwasher','hood','coffee','toaster'] },
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
  var rowBtns = document.createElement('div');
  rowBtns.style.cssText = 'display:flex;gap:6px;margin-top:14px';
  var oa = document.createElement('button');
  oa.className = 'btn-secondary';
  oa.textContent = 'افتح الكل';
  oa.onclick = function() { toggleAllDoors(true); };
  var ca = document.createElement('button');
  ca.className = 'btn-secondary';
  ca.textContent = 'أغلق الكل';
  ca.onclick = function() { toggleAllDoors(false); };
  rowBtns.appendChild(oa);
  rowBtns.appendChild(ca);
  UI.panelBody.appendChild(rowBtns);
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
  var pb = document.getElementById('props-btn');
  if (pb) pb.onclick = openSelectedProps;
  var tb = document.getElementById('toggle-btn');
  if (tb) tb.onclick = toggleSelected;
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

/* تحديث موقع السحب بسلاسة */

/* أحداث سحب سلسة */
(function attachSmoothDrag() {
  // انتظر تحميل الصفحة
  window.addEventListener('load', function() {
    var c = State.renderer.domElement;
    var smoothMove = function(e) {
      if (!Drag.active || !Drag.item) return;
      var p = getPointerWorld(e);
      var dx = p.x - Drag.startPoint.x;
      var dz = p.z - Drag.startPoint.z;
      Drag.targetX = Drag.itemStartPos.x + dx;
      Drag.targetZ = Drag.itemStartPos.z + dz;
      e.preventDefault();
      e.stopPropagation();
    };
    c.addEventListener('pointermove', smoothMove, true);
  });
})();








function addToScene(type) {
  History.push();
  const def = COMPONENTS.map[type];
  if (!def) return;
  const p = def.defaults;

  // ===== أبواب ونوافذ =====
  if (type === 'door' || type === 'window') {
    const zBack = ROOM_BACK_Z + ROOM.wallThickness / 2 + 0.1;
    const existing = State.items.filter(function(it) {
      return it.userData.type === 'door' || it.userData.type === 'window';
    });
    let x = 0;
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

  const isWallMount = def.mount === 'wall';
  const walls = ['back', 'left', 'right'];

  // ===== العناصر العلوية: صعود تدريجي =====
  if (isWallMount) {
    const baseY = def.defaultY || 145;
    const step = 20;
    const maxY = ROOM.height - p.h - 5;
    for (let y = baseY; y <= maxY; y += step) {
      for (let w = 0; w < walls.length; w++) {
        const spot = findSpotOnWall(walls[w], p.w, p.d, true, y);
        if (spot) {
          createComponent(type, spot.position);
          const it = State.items[State.items.length - 1];
          it.rotation.y = spot.rotation;
          constrainToRoom(it);
          const name = walls[w] === 'back' ? 'الخلفي' : (walls[w] === 'left' ? 'الأيسر' : 'الأيمن');
          setStatus('أضيف @ ' + name + ' · ارتفاع ' + Math.round(y));
          return;
        }
      }
    }
    setStatus('لا توجد مساحة كافية');
    return;
  }

  // ===== العناصر السفلية: صف واحد فقط =====
  for (let w = 0; w < walls.length; w++) {
    const spot = findSpotOnWall(walls[w], p.w, p.d, false, 0);
    if (spot) {
      createComponent(type, spot.position);
      const it = State.items[State.items.length - 1];
      it.rotation.y = spot.rotation;
      constrainToRoom(it);
      const name = walls[w] === 'back' ? 'الخلفي' : (walls[w] === 'left' ? 'الأيسر' : 'الأيمن');
      setStatus('أضيف @ ' + name);
      return;
    }
  }
  setStatus('الحوائط ممتلئة');
}

function findSpotOnWall(wall, newW, newD, isWallMount, rowY) {
  const t = ROOM.wallThickness;
  const halfL = ROOM.length / 2;
  const W = ROOM.width;
  const zBack = ROOM_BACK_Z;
  const zFront = zBack + W;

  let axisMin, axisMax, wallRot, alongZ;
  if (wall === 'back') {
    axisMin = -halfL; axisMax = halfL; wallRot = 0; alongZ = false;
  } else if (wall === 'left') {
    axisMin = zBack; axisMax = zFront; wallRot = Math.PI / 2; alongZ = true;
  } else {
    axisMin = zBack; axisMax = zFront; wallRot = -Math.PI / 2; alongZ = true;
  }

  // عناصر على نفس الحائط + نفس الصف (y متقارب)
  const yTol = 8;
  const itemsOnWall = State.items.filter(function(it) {
    const u = it.userData;
    if (u.type === 'door' || u.type === 'window') return false;
    if ((u.mount === 'wall') !== isWallMount) return false;
    // نفس الصف؟
    if (isWallMount && Math.abs(it.position.y - rowY) > yTol) return false;
    if (!isWallMount && it.position.y > 5) return false;
    const ry = it.rotation.y;
    if (wall === 'back') return Math.abs(ry) < 0.4;
    if (wall === 'left') return ry > 0.4 && ry < Math.PI - 0.4;
    if (wall === 'right') return ry < -0.4 && ry > -Math.PI + 0.4;
    return false;
  });

  const getAxis = function(it) { return alongZ ? it.position.z : it.position.x; };
  itemsOnWall.sort(function(a, b) { return getAxis(a) - getAxis(b); });

  // حساب الإزاحة من الزوايا (لتفادي التداخل مع الحائط المجاور)
  let cornerOffset = 3;

  if (wall === 'left') {
    const backLeft = State.items.filter(function(it) {
      const u = it.userData;
      if (u.type === 'door' || u.type === 'window') return false;
      if ((u.mount === 'wall') !== isWallMount) return false;
      if (isWallMount && Math.abs(it.position.y - rowY) > yTol) return false;
      if (!isWallMount && it.position.y > 5) return false;
      const ry = it.rotation.y;
      if (Math.abs(ry) > 0.4) return false;
      return it.position.x < -halfL + 80;
    });
    let mx = 0;
    backLeft.forEach(function(it) {
      const d = it.userData.params.d;
      if (d > mx) mx = d;
    });
    cornerOffset = mx + 3;
  } else if (wall === 'right') {
    const backRight = State.items.filter(function(it) {
      const u = it.userData;
      if (u.type === 'door' || u.type === 'window') return false;
      if ((u.mount === 'wall') !== isWallMount) return false;
      if (isWallMount && Math.abs(it.position.y - rowY) > yTol) return false;
      if (!isWallMount && it.position.y > 5) return false;
      const ry = it.rotation.y;
      if (Math.abs(ry) > 0.4) return false;
      return it.position.x > halfL - 80;
    });
    let mx = 0;
    backRight.forEach(function(it) {
      const d = it.userData.params.d;
      if (d > mx) mx = d;
    });
    cornerOffset = mx + 3;
  } else if (wall === 'back') {
    const leftItems = State.items.filter(function(it) {
      const u = it.userData;
      if (u.type === 'door' || u.type === 'window') return false;
      if ((u.mount === 'wall') !== isWallMount) return false;
      if (isWallMount && Math.abs(it.position.y - rowY) > yTol) return false;
      if (!isWallMount && it.position.y > 5) return false;
      const ry = it.rotation.y;
      return ry > 0.4 && ry < Math.PI - 0.4;
    });
    let maxL = 0;
    leftItems.forEach(function(it) {
      const d = it.userData.params.d;
      if (d > maxL) maxL = d;
    });
    const rightItems = State.items.filter(function(it) {
      const u = it.userData;
      if (u.type === 'door' || u.type === 'window') return false;
      if ((u.mount === 'wall') !== isWallMount) return false;
      if (isWallMount && Math.abs(it.position.y - rowY) > yTol) return false;
      if (!isWallMount && it.position.y > 5) return false;
      const ry = it.rotation.y;
      return ry < -0.4 && ry > -Math.PI + 0.4;
    });
    let maxR = 0;
    rightItems.forEach(function(it) {
      const d = it.userData.params.d;
      if (d > maxR) maxR = d;
    });
    const startX = -halfL + maxL + 3;
    const endX = halfL - maxR - 3;
    let pos = startX + newW / 2;
    let moved = true, iter = 0;
    while (moved && iter < 300) {
      iter++; moved = false;
      for (let i = 0; i < itemsOnWall.length; i++) {
        const it = itemsOnWall[i];
        const itP = getAxis(it);
        const itW = it.userData.params.w;
        const itL = itP - itW / 2 - 1;
        const itR = itP + itW / 2 + 1;
        const myL = pos - newW / 2;
        const myR = pos + newW / 2;
        if (myR > itL && myL < itR) {
          pos = itR + newW / 2 + 1;
          moved = true; break;
        }
      }
    }
    if (pos + newW / 2 > endX) return null;
    return {
      position: {
        x: pos,
        y: isWallMount ? rowY : 0,
        z: zBack + t / 2 + newD / 2 + 0.2
      },
      rotation: 0
    };
  }

  // الحائط الأيسر أو الأيمن
  let pos = axisMin + cornerOffset + newW / 2;
  let moved = true, iter = 0;
  while (moved && iter < 300) {
    iter++; moved = false;
    for (let i = 0; i < itemsOnWall.length; i++) {
      const it = itemsOnWall[i];
      const itP = getAxis(it);
      const itW = it.userData.params.w;
      const itL = itP - itW / 2 - 1;
      const itR = itP + itW / 2 + 1;
      const myL = pos - newW / 2;
      const myR = pos + newW / 2;
      if (myR > itL && myL < itR) {
        pos = itR + newW / 2 + 1;
        moved = true; break;
      }
    }
  }
  if (pos + newW / 2 > axisMax - 3) return null;

  let x, z;
  if (wall === 'left') {
    x = -halfL + t / 2 + newD / 2 + 0.2;
    z = pos;
  } else {
    x = halfL - t / 2 - newD / 2 - 0.2;
    z = pos;
  }
  return {
    position: {
      x: x,
      y: isWallMount ? rowY : 0,
      z: z
    },
    rotation: wallRot
  };
}




function updateDragSmooth() {
  if (!Drag.active || !Drag.item) return;
  const targetX = Drag.targetX;
  const targetZ = Drag.targetZ;
  const dx = targetX - Drag.item.position.x;
  const dz = targetZ - Drag.item.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.2) return;
  const factor = Math.min(0.5, Math.max(0.15, dist * 0.05));
  Drag.item.position.x += dx * factor;
  Drag.item.position.z += dz * factor;
  constrainToRoom(Drag.item);
  const u = Drag.item.userData;
  if (u.snapWall || u.type === 'door' || u.type === 'window') buildRoom();
}

function constrainToRoom(item) {
  const u = item.userData;
  const fp = getFootprint(item);
  const hW = fp.w / 2, hD = fp.d / 2;
  const halfL = ROOM.length / 2;
  const t = ROOM.wallThickness;

  // الأبواب والنوافذ
  if (u.snapWall || u.type === 'door' || u.type === 'window') {
    const zBack = ROOM_BACK_Z;
    const zFront = ROOM_BACK_Z + ROOM.width;
    const wall = u.wallSide || 'back';
    const px = item.position.x;
    const pz = item.position.z;

    if (wall === 'back') {
      const minX = -halfL + hW;
      const maxX =  halfL - hW;
      // هل وصل إلى الحافة؟
      if (px <= minX + 5) {
        u.wallSide = 'left';
        item.position.x = -halfL + t / 2;
        item.position.z = zBack + Math.max(hD, ROOM.width * 0.3);
        item.rotation.y = Math.PI / 2;
        return;
      }
      if (px >= maxX - 5) {
        u.wallSide = 'right';
        item.position.x = halfL - t / 2;
        item.position.z = zBack + Math.max(hD, ROOM.width * 0.3);
        item.rotation.y = -Math.PI / 2;
        return;
      }
      item.position.z = zBack + t / 2;
      item.position.x = Math.max(minX, Math.min(maxX, px));
      item.rotation.y = 0;
      return;
    }

    if (wall === 'left') {
      const minZ = zBack + hW;
      const maxZ = zFront - hW;
      // رجوع للحائط الخلفي؟
      if (pz <= minZ + 5) {
        u.wallSide = 'back';
        item.position.z = zBack + t / 2;
        item.position.x = -halfL + Math.max(hW, ROOM.length * 0.3);
        item.rotation.y = 0;
        return;
      }
      // الانتقال للحائط الأيمن؟ لا (عبر الخلفي)
      item.position.x = -halfL + t / 2;
      item.position.z = Math.max(minZ, Math.min(maxZ, pz));
      item.rotation.y = Math.PI / 2;
      return;
    }

    if (wall === 'right') {
      const minZ = zBack + hW;
      const maxZ = zFront - hW;
      if (pz <= minZ + 5) {
        u.wallSide = 'back';
        item.position.z = zBack + t / 2;
        item.position.x = halfL - Math.max(hW, ROOM.length * 0.3);
        item.rotation.y = 0;
        return;
      }
      item.position.x = halfL - t / 2;
      item.position.z = Math.max(minZ, Math.min(maxZ, pz));
      item.rotation.y = -Math.PI / 2;
      return;
    }
    return;
  }

  // العناصر العادية
  const zBack = ROOM_BACK_Z;
  const zFront = ROOM_BACK_Z + ROOM.width;
  const ry = item.rotation.y;
  const isLeft = (ry > 0.4 && ry < Math.PI - 0.4);
  const isRight = (ry < -0.4 && ry > -Math.PI + 0.4);

  if (isLeft) {
    item.position.x = -halfL + t / 2 + hW;
    item.position.z = Math.max(zBack + hD, Math.min(zFront - hD, item.position.z));
  } else if (isRight) {
    item.position.x = halfL - t / 2 - hW;
    item.position.z = Math.max(zBack + hD, Math.min(zFront - hD, item.position.z));
  } else {
    item.position.x = Math.max(-halfL + hW, Math.min(halfL - hW, item.position.x));
    item.position.z = Math.max(zBack + hD, Math.min(zFront - hD, item.position.z));
  }
  if (u.mount !== 'wall') item.position.y = 0;
}

/* ===== نظام التراجع ===== */
const History = {
  stack: [],
  max: 500,
  push: function() {
    const snap = JSON.stringify({
      settings: State.settings,
      room: {
        length: ROOM.length, width: ROOM.width,
        height: ROOM.height, wallThickness: ROOM.wallThickness
      },
      items: State.items.map(function(it) {
        return {
          type: it.userData.type,
          params: it.userData.params,
          thickness: it.userData.thickness,
          color: it.userData.color,
          mount: it.userData.mount,
          wallSide: it.userData.wallSide,
          position: { x: it.position.x, y: it.position.y, z: it.position.z },
          rotationY: it.rotation.y
        };
      })
    });
    this.stack.push(snap);
    if (this.stack.length > this.max) this.stack.shift();
    updateUndoBtn();
  },
  undo: function() {
    if (!this.stack.length) return;
    const snap = this.stack.pop();
    const data = JSON.parse(snap);
    applySnapshot(data);
    updateUndoBtn();
    setStatus('تم التراجع');
  }
};

function applySnapshot(data) {
  if (data.settings) Object.assign(State.settings, data.settings);
  if (data.room) {
    ROOM.length = data.room.length;
    ROOM.width = data.room.width;
    ROOM.height = data.room.height;
    ROOM.wallThickness = data.room.wallThickness;
  }
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
      thickness: it.thickness || 18,
      color: it.color || State.settings.mdfColor,
      isItem: true,
      mount: it.mount || def.mount,
      wallSide: it.wallSide || null
    };
    if (it.position) g.position.set(it.position.x, it.position.y, it.position.z);
    if (it.rotationY) g.rotation.y = it.rotationY;
    State.scene.add(g);
    State.items.push(g);
  });
  State.selected = null;
  State.editing = null;
  closeProps();
  refreshEnvironment();
  buildRoom();
}

function updateUndoBtn() {
  const b = document.getElementById('fab-undo');
  if (b) b.style.opacity = History.stack.length ? '1' : '0.35';
}

/* ===== لقطة شاشة ===== */
function takeScreenshot() {
  try {
    // أخفِ العناصر المؤقتة
    const oldSel = State.selected;
    if (State.selected) {
      State.selected.traverse(function(o) {
        if (o.isLineSegments && o.userData._hi) {
          o.material.color.setHex(0x000000);
          o.material.opacity = 0.15;
          delete o.userData._hi;
        }
      });
    }
    // رندر
    if (typeof updateDoorsAnim === 'function') updateDoorsAnim();
  State.renderer.render(State.scene, State.camera);
    const dataURL = State.renderer.domElement.toDataURL('image/png');

    // استخدم navigator.share إن توفر
    if (navigator.share && navigator.canShare) {
      fetch(dataURL).then(function(r) { return r.blob(); }).then(function(blob) {
        const file = new File([blob], 'kitchen-design.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'مصمم المطبخ' }).catch(function() {
            downloadDataURL(dataURL);
          });
          return;
        }
        downloadDataURL(dataURL);
      }).catch(function() {
        downloadDataURL(dataURL);
      });
    } else {
      downloadDataURL(dataURL);
    }

    // أعِد الإبراز
    if (oldSel) highlightItem(oldSel);
    setStatus('تم التصوير');
  } catch (e) {
    setStatus('فشل: ' + e.message);
  }
}

function downloadDataURL(dataURL) {
  try {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'kitchen-design-' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('تم الحفظ في التنزيلات');
  } catch (e) {
    // fallback: افتح في نافذة جديدة
    const w = window.open();
    if (w) {
      w.document.write('<img src="' + dataURL + '" style="max-width:100%"><p>اضغط مطوّلاً على الصورة للحفظ</p>');
    } else {
      setStatus('تعذّر الحفظ');
    }
  }
}

/* ===== أدوات الباب والدرج ===== */


/* ===== حركة الأبواب والأدراج ===== */

function toggleAllDoors(open) {
  State.items.forEach(function(it) {
    it.traverse(function(c) {
      if (c.userData.isDoor || c.userData.isDrawer) c.userData.open = open;
    });
  });
  setStatus(open ? 'فتح الكل' : 'إغلاق الكل');
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
  const dw = W - 2*t - 2, dh = H - 2*t - 2, dz = D/2 + t/2;
  g.add(makeDoorPanel(dw, dh, t, dw/2, H/2, dz, 'right', c));
  return g;
}

function buildBaseDoor2(p, t, c) {
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
  const dw = (W - 2*t) / 2 - 2, dh = H - 2*t - 2, dz = D/2 + t/2;
  const leftCX = -dw/2 - 1;
  g.add(makeDoorPanel(dw, dh, t, leftCX - dw/2, H/2, dz, 'left', c));
  const rightCX = dw/2 + 1;
  g.add(makeDoorPanel(dw, dh, t, rightCX + dw/2, H/2, dz, 'right', c));
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
    const cy = t + dh * i + dh/2;
    g.add(makeDrawerFront(W - 2*t - 2, dh - 4, t, 0, cy, D/2 + t/2, c));
  }
  return g;
}



function updateDoorsAnim() {
  State.items.forEach(function(item) {
    item.traverse(function(child) {
      if (child.userData.isDoor) {
        var t;
        if (child.userData.open) {
          if (child.userData.hinge === 'right') t = child.userData.openAngle;
          else t = -child.userData.openAngle;
        } else t = 0;
        child.rotation.y += (t - child.rotation.y) * 0.18;
      } else if (child.userData.isDrawer) {
        var tz = child.userData.closedZ + (child.userData.open ? child.userData.slideOut : 0);
        child.position.z += (tz - child.position.z) * 0.18;
      }
    });
  });
}

function makeDrawerFront(w, h, d, cx, cy, cz, color) {
  const g = new THREE.Group();
  g.position.set(cx, cy, cz);

  // الواجهة
  const front = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mdfMat(color));
  front.castShadow = true;
  front.receiveShadow = true;
  front.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(front.geometry),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })
  ));
  g.add(front);

  // حواف الصندوق (sides + bottom + back)
  const sideMat = mdfMat(color);
  const sT = Math.max(1.2, d * 0.7);
  const boxD = 45; // عمق الصندوق
  // الجانبان
  const left = new THREE.Mesh(new THREE.BoxGeometry(sT, h - 4, boxD), sideMat);
  left.position.set(-w/2 + sT/2, 0, -boxD/2 - d/2);
  g.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(sT, h - 4, boxD), sideMat);
  right.position.set(w/2 - sT/2, 0, -boxD/2 - d/2);
  g.add(right);
  // القاع
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, sT, boxD), sideMat);
  bottom.position.set(0, -h/2 + sT/2 + 1, -boxD/2 - d/2);
  g.add(bottom);
  // الظهر
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h - 4, sT), sideMat);
  back.position.set(0, 0, -boxD - d/2 + sT/2);
  g.add(back);

  g.userData.isDrawer = true;
  g.userData.open = false;
  g.userData.slideOut = 25;
  g.userData.closedZ = cz;
  return g;
}

/* نسيج خشبي للأرضية */
function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  // لون الأساس
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, 0, 512, 512);
  // خطوط خشبية
  for (let i = 0; i < 200; i++) {
    const y = Math.random() * 512;
    ctx.strokeStyle = 'rgba(0,0,0,' + (0.03 + Math.random() * 0.06) + ')';
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + (Math.random() - 0.5) * 15, 340, y + (Math.random() - 0.5) * 15, 512, y + (Math.random() - 0.5) * 8);
    ctx.stroke();
  }
  // بلوكات ألواح
  for (let i = 0; i < 8; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, i * 64);
    ctx.lineTo(512, i * 64);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  tex.anisotropy = 8;
  return tex;
}


function buildFloor() {
  const L = ROOM.length + ROOM.wallThickness * 2;
  const W = ROOM.width + ROOM.wallThickness * 2;
  const mat = new THREE.MeshStandardMaterial({
    map: makeWoodTexture(),
    roughness: 0.7,
    metalness: 0.08
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, W), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.01, ROOM_BACK_Z + ROOM.width / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function updateToggleBtn() {
  var btn = document.getElementById('toggle-btn');
  if (!btn) return;
  var item = State.selected;
  if (!item) { btn.classList.add('hidden'); return; }
  var hasMech = false, anyOpen = false;
  item.traverse(function(c) {
    if (c.userData.isDoor || c.userData.isDrawer) {
      hasMech = true;
      if (c.userData.open) anyOpen = true;
    }
  });
  if (!hasMech) { btn.classList.add('hidden'); return; }
  btn.classList.remove('hidden');
  btn.textContent = anyOpen ? '🔒' : '🔓';
  if (anyOpen) btn.classList.add('open'); else btn.classList.remove('open');
}

function toggleSelected() {
  var item = State.selected;
  if (!item) return;
  var anyOpen = false;
  item.traverse(function(c) {
    if ((c.userData.isDoor || c.userData.isDrawer) && c.userData.open) anyOpen = true;
  });
  item.traverse(function(c) {
    if (c.userData.isDoor || c.userData.isDrawer) c.userData.open = !anyOpen;
  });
  updateToggleBtn();
}


function buildBaseSink(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));

  const dw = (W - 2*t) / 2 - 2, dh = H - 2*t - 2, dz = D/2 + t/2;
  g.add(makeDoorPanel(dw, dh, t, -dw - 1, H/2, dz, 'left', c));
  g.add(makeDoorPanel(dw, dh, t,  dw + 1, H/2, dz, 'right', c));

  const cH = 4;
  const cMat = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.25, metalness: 0.4 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(W, cH, D), cMat);
  counter.position.set(0, H - t + cH/2, 0);
  counter.castShadow = true;
  counter.receiveShadow = true;
  g.add(counter);

  const sinkMat = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.15, metalness: 0.95 });
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.3, metalness: 0.9 });
  const sW = (W - 8) / 2 - 3;
  const sD = D - 12;
  const sH = cH + 2;

  [-1, 1].forEach(function(side) {
    const cx = side * (sW/2 + 2);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(sW, cH + 0.5, sD), sinkMat);
    rim.position.set(cx, H - t + cH/2 + 0.5, 0);
    g.add(rim);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(sW - 3, sH, sD - 3), innerMat);
    inner.position.set(cx, H - t + cH/2 + 0.5 - sH/2 + 1, 0);
    g.add(inner);
  });

  const tapMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.1, metalness: 0.98 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 4, 24), tapMat);
  base.position.set(0, H - t + cH + 2, -D/2 + 6);
  base.castShadow = true;
  g.add(base);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 18, 20), tapMat);
  stem.position.set(0, H - t + cH + 13, -D/2 + 6);
  stem.castShadow = true;
  g.add(stem);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 14, 20), tapMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, H - t + cH + 22, -D/2 + 13);
  arm.castShadow = true;
  g.add(arm);

  const noz = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3, 20), tapMat);
  noz.position.set(0, H - t + cH + 20.5, -D/2 + 20);
  g.add(noz);

  const hMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc1, roughness: 0.15, metalness: 0.98 });
  const hnd = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 2), hMat);
  hnd.position.set(0, H - t + cH + 22, -D/2 + 4);
  hnd.castShadow = true;
  g.add(hnd);

  return g;
}


/* ===== زر الخصائص ===== */
function updatePropsBtn() {
  var btn = document.getElementById('props-btn');
  if (!btn) return;
  if (State.selected) btn.classList.remove('hidden');
  else btn.classList.add('hidden');
}

function openSelectedProps() {
  if (!State.selected) return;
  selectItem(State.selected);
}


/* ===== إلكترونيات ===== */

// ميكروويف

// غسالة أطباق (باب أمامي)

// شفاط (hood)
function buildHood(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.2, metalness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.4, metalness: 0.6 });
  // غطاء سفلي (مائل)
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.25, D), steel);
  base.position.set(0, H * 0.125, 0);
  base.castShadow = true;
  g.add(base);
  // مدخنة عمودية
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.35, H * 0.75, D * 0.4), steel
  );
  chimney.position.set(0, H * 0.25 + H * 0.375, -D * 0.15);
  chimney.castShadow = true;
  g.add(chimney);
  // شريط تحكم
  const ctrl = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.5, 5, D * 0.5), dark
  );
  ctrl.position.set(0, H * 0.02, D * 0.2);
  g.add(ctrl);
  // شاشة
  const scr = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 3),
    new THREE.MeshStandardMaterial({ color: 0x0a1a25, emissive: 0x00d2a8, emissiveIntensity: 2 })
  );
  scr.position.set(0, H * 0.02, D * 0.2 + 0.3);
  g.add(scr);
  // فتحة الشفط السفلية
  const vent = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.85, 1, D * 0.85), dark
  );
  vent.position.set(0, -1, 0);
  g.add(vent);
  return g;
}

// ماكينة قهوة
function buildCoffee(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.3, metalness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.15, metalness: 0.95 });
  // جسم
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.8, D), black);
  body.position.set(0, H * 0.4, 0);
  body.castShadow = true;
  g.add(body);
  // رأس علوي
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.2, D), steel);
  top.position.set(0, H * 0.9, 0);
  g.add(top);
  // فتحة الخروج
  const noz = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 4, 12), steel
  );
  noz.position.set(0, H * 0.75, D/2 - 6);
  g.add(noz);
  // شاشة
  const scr = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 3),
    new THREE.MeshStandardMaterial({ color: 0x0a1a25, emissive: 0x00a8ff, emissiveIntensity: 2 })
  );
  scr.position.set(0, H * 0.6, D/2 + 0.05);
  g.add(scr);
  // قاعدة كوب
  const cupBase = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.7, 1, D * 0.6), steel
  );
  cupBase.position.set(0, 0.5, 2);
  g.add(cupBase);
  return g;
}

// محمصة
function buildToaster(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc1, roughness: 0.25, metalness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1f, roughness: 0.5, metalness: 0.4 });
  // جسم
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(W, H, D), steel
  );
  body.position.set(0, H/2, 0);
  body.castShadow = true;
  g.add(body);
  // فتحتان علويتان
  [1, -1].forEach(function(side) {
    const slot = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.25, 0.8, D * 0.6), black
    );
    slot.position.set(side * W * 0.2, H - 0.4, 0);
    g.add(slot);
  });
  // ذراع جانبي
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(1, H * 0.4, 1.5), black
  );
  lever.position.set(W/2 + 0.5, H * 0.5, 0);
  g.add(lever);
  return g;
}

COMPONENTS.map.microwave = {
  name: 'ميكروويف', icon: '📻',
  build: buildMicrowave,
  defaults: { w: 60, h: 40, d: 40, shelves: 0 },
  mount: 'wall', defaultY: 145
};
COMPONENTS.map.dishwasher = {
  name: 'غسالة أطباق', icon: '🍽️',
  build: buildDishwasher,
  defaults: { w: 60, h: 82, d: 55, shelves: 0 },
  mount: 'floor'
};
COMPONENTS.map.hood = {
  name: 'شفاط', icon: '🌬️',
  build: buildHood,
  defaults: { w: 90, h: 90, d: 50, shelves: 0 },
  mount: 'wall', defaultY: 160
};
COMPONENTS.map.coffee = {
  name: 'ماكينة قهوة', icon: '☕',
  build: buildCoffee,
  defaults: { w: 25, h: 35, d: 30, shelves: 0 },
  mount: 'floor'
};
COMPONENTS.map.toaster = {
  name: 'محمصة', icon: '🍞',
  build: buildToaster,
  defaults: { w: 28, h: 20, d: 18, shelves: 0 },
  mount: 'floor'
};

function setupDragEvents() {
  const c = State.renderer.domElement;
  let sx = 0, sy = 0, moved = false, down = null, wasSel = false;

  c.addEventListener('pointerdown', function(e) {
    const item = pickItemAt(e);
    down = item;
    sx = e.clientX;
    sy = e.clientY;
    moved = false;
    const isDW = item && item.userData &&
      (item.userData.type === 'door' || item.userData.type === 'window');
    wasSel = (State.selected === item && item !== null) || isDW;

    if (item && item.userData && item.userData.locked) {
      setStatus('العنصر مقفل');
      e.stopPropagation();
      return;
    }

    if (item && wasSel) {
      History.push();
      Drag.active = true;
      Drag.item = item;
      Drag.itemStartPos.copy(item.position);
      Drag.startPoint.copy(getPointerWorld(e));
      Drag.dragY = item.position.y;
      Drag.plane.set(new THREE.Vector3(0, 1, 0), -Drag.dragY);
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
        Drag.targetX = Drag.itemStartPos.x + dx;
        Drag.targetZ = Drag.itemStartPos.z + dz;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  c.addEventListener('pointerup', function(e) {
    if (Drag.active && Drag.item && moved) {
      applySnap(Drag.item);
      const u = Drag.item.userData;
      if (u.snapWall || u.type === 'door' || u.type === 'window') buildRoom();
      Drag.active = false;
      if (State.controls) State.controls.enabled = true;
      Drag.item = null;
      down = null;
      moved = false;
      e.stopPropagation();
      return;
    }

    if (down && !moved) {
      State.selected = down;
      highlightItem(down);
      renderList();
      closeProps();
      updateToggleBtn();
      updatePropsBtn();
      e.stopPropagation();
    } else if (!down && !moved) {
      State.selected = null;
      highlightItem(null);
      closeProps();
      renderList();
      updateToggleBtn();
      updatePropsBtn();
      e.stopPropagation();
    }

    Drag.active = false;
    if (State.controls) State.controls.enabled = true;
    Drag.item = null;
    down = null;
    moved = false;
  }, true);

  c.addEventListener('pointercancel', function() {
    if (Drag.active && Drag.item) applySnap(Drag.item);
    Drag.active = false;
    if (State.controls) State.controls.enabled = true;
    Drag.item = null;
    down = null;
    moved = false;
  }, true);
}



function buildDishwasher(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xc8ccd2, roughness: 0.2, metalness: 0.9
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f, roughness: 0.35, metalness: 0.7
  });

  // هيكل
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));

  // باب أمامي (يفتح)
  const doorW = W - 2*t - 4;
  const doorH = H - 2*t - 4;
  const door = makeDoorPanel(
    doorW, doorH, 3,
    doorW / 2,                    // hinge يمين
    H/2,
    D/2 + t/2 + 1.5,
    'right',
    steelMat
  );
  g.add(door);

  // خط علوي داكن
  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(W - 2*t - 2, 6, 4), darkMat
  );
  topBar.position.set(0, H - t - 4, D/2 + t/2 + 3.5);
  g.add(topBar);

  // شاشة
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a25, emissive: 0x00d2a8, emissiveIntensity: 2
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), screenMat);
  screen.position.set(W/2 - 14, H - t - 4, D/2 + t/2 + 5.55);
  g.add(screen);

  // مقبض أفقي على الباب
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(doorW - 8, 2.5, 4), darkMat
  );
  handle.position.set(0, H - t - 14, D/2 + t/2 + 4.5);
  g.add(handle);

  return g;
}

function renderProps(item) {
  State.editing = item;
  const u = item.userData;
  const type = u.type;
  UI.propsTitle.textContent = COMPONENTS.map[type].name;
  UI.propsBody.innerHTML = '';

  const isDW = (type === 'door' || type === 'window');
  const isElectronic = ['microwave','dishwasher','hood','coffee','toaster'].indexOf(type) >= 0;
  const hasShelves = ['base_door1','base_door2','wall_door1','wall_door2','wall_open'].indexOf(type) >= 0;
  const hasMDF = !isDW && !isElectronic;

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
    inp.onchange = h;
    inp.onblur = h;
  };

  // العرض
  addNum('العرض (سم)', u.params.w, 20, 200, function(v) {
    u.params.w = v;
    State.editing = rebuildItem(State.editing);
    State.selected = State.editing;
    constrainToRoom(State.editing);
    if (isDW) buildRoom();
    else updateRotation(State.editing);
  });

  // الارتفاع
  addNum('الارتفاع (سم)', u.params.h, 20, 250, function(v) {
    u.params.h = v;
    State.editing = rebuildItem(State.editing);
    State.selected = State.editing;
    if (isDW && State.editing.position.y + v > ROOM.height) {
      State.editing.position.y = Math.max(0, ROOM.height - v);
    }
    if (isDW) buildRoom();
  });

  // العمق (لغير الأبواب والنوافذ والإلكترونيات الصغيرة)
  if (!isDW && type !== 'coffee' && type !== 'toaster') {
    addNum('العمق (سم)', u.params.d, 20, 90, function(v) {
      u.params.d = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
      constrainToRoom(State.editing);
      updateRotation(State.editing);
    });
  }

  // الرفوف (فقط للخزائن)
  if (hasShelves) {
    addNum('الرفوف', u.params.shelves, 0, 6, function(v) {
      u.params.shelves = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
    });
  }

  // الارتفاع عن الأرض (للعناصر العلوية)
  if (u.mount === 'wall') {
    const maxY = ROOM.height - u.params.h;
    addNum('الارتفاع عن الأرض (سم)', Math.round(item.position.y), 0, maxY, function(v) {
      State.editing.position.y = v;
      if (isDW) buildRoom();
    });
  }

  // سمك MDF (فقط للخزائن MDF)
  if (hasMDF) {
    addNum('سمك MDF (ملم)', u.thickness, 10, 30, function(v) {
      u.thickness = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
      if (isDW) buildRoom();
    });
  } else if (isDW) {
    // سمك الأبواب والنوافذ (المعدن)
    addNum('سمك (سم)', u.thickness, 3, 15, function(v) {
      u.thickness = v;
      State.editing = rebuildItem(State.editing);
      State.selected = State.editing;
      buildRoom();
    });
  }

  // اللون (فقط للخزائن MDF)
  if (hasMDF) {
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

  // زر القفل
  const lockBtn = document.createElement('button');
  lockBtn.className = 'btn-secondary';
  lockBtn.textContent = u.locked ? '🔒 مقفل' : '🔓 مفتوح';
  lockBtn.style.background = u.locked ? '#3a2a2a' : '#2a3a2a';
  lockBtn.style.borderColor = u.locked ? '#ff6b6b' : '#00d2a8';
  lockBtn.onclick = function() {
    u.locked = !u.locked;
    renderProps(item);
  };
  UI.propsBody.appendChild(lockBtn);

  // زر الحذف
  const del = document.createElement('button');
  del.className = 'btn-secondary btn-danger';
  del.textContent = 'حذف';
  del.onclick = function() {
    History.push();
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


function buildBaseOven(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;

  // هيكل MDF
  g.add(panel(t, H, D, -W/2 + t/2, H/2, 0, c));
  g.add(panel(t, H, D,  W/2 - t/2, H/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, t/2, 0, c));
  g.add(panel(W - 2*t, t, D, 0, H - t/2, 0, c));
  g.add(panel(W - 2*t, H - 2*t, t, 0, H/2, -D/2 + t/2, c));

  const oh = H * 0.62;
  const oy = t + 4;
  const om = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f, roughness: 0.15, metalness: 0.85
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x050505, roughness: 0.4, metalness: 0.3
  });

  // ===== التجويف الأسود للفرن (الخلف) =====
  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(W - 2*t - 8, oh - 4, t + 1),
    blackMat
  );
  cavity.position.set(0, oy + oh/2, D/2 + t/2 - 1);
  g.add(cavity);

  // ===== باب الفرن (يفتح) =====
  const doorW = W - 2*t - 4;
  const doorH = oh - 2;
  const doorPanel = makeDoorPanel(
    doorW, doorH, 3,
    doorW / 2,                     // hinge يمين
    oy + oh/2,
    D/2 + t/2 + 3,                 // أمام التجويف
    'right',
    om
  );

  // استبدل الخطوط بـ LineBasicMaterial أرق لتفادي المربعات
  doorPanel.children[0].children.forEach(function(ch) {
    if (ch.isLineSegments) {
      ch.material.opacity = 0.08;
      ch.material.color.setHex(0x333333);
    }
  });

  // نافذة زجاجية في الباب
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x101418, roughness: 0.08, metalness: 0.5,
    transparent: true, opacity: 0.9, clearcoat: 1
  });
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(doorW - 20, doorH - 20, 1), glassMat
  );
  glass.position.set(-doorW/2 + 5, 0, 2.5);
  doorPanel.children[0].add(glass);

  // مقبض على الباب
  const hMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a30, roughness: 0.3, metalness: 0.95
  });
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(doorW - 12, 2.5, 3), hMat
  );
  handle.position.set(-doorW/2 + 5, doorH/2 - 6, 3.5);
  doorPanel.children[0].add(handle);

  g.add(doorPanel);

  // لوحة تحكم علوية
  const panelH = H - t - oh - 10;
  if (panelH > 6) {
    const py0 = oy + oh + 4;
    const pm = new THREE.MeshStandardMaterial({
      color: 0x25252a, roughness: 0.3, metalness: 0.7
    });
    const ctrl = new THREE.Mesh(
      new THREE.BoxGeometry(W - 2*t - 4, panelH - 2, 2), pm
    );
    ctrl.position.set(0, py0 + (panelH-2)/2, D/2 + t/2 + 1);
    g.add(ctrl);

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a2030, emissive: 0x00a0ff, emissiveIntensity: 1.5
    });
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(22, panelH * 0.45), screenMat
    );
    screen.position.set(-8, py0 + (panelH-2)/2, D/2 + t/2 + 2.05);
    g.add(screen);

    const kMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1f, roughness: 0.4, metalness: 0.85
    });
    [8, 18, 28].forEach(function(off) {
      const k = new THREE.Mesh(
        new THREE.CylinderGeometry(2, 2, 2, 16), kMat
      );
      k.rotation.x = Math.PI / 2;
      k.position.set(off, py0 + (panelH-2)/2, D/2 + t/2 + 2.5);
      g.add(k);
    });
  }

  return g;
}

function buildMicrowave(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;

  const black = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f, roughness: 0.4, metalness: 0.6
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0xc8ccd2, roughness: 0.25, metalness: 0.85
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a0a0c, roughness: 0.05, metalness: 0.4,
    transparent: true, opacity: 0.92, clearcoat: 1
  });
  const innerBlack = new THREE.MeshStandardMaterial({
    color: 0x050508, roughness: 0.5, metalness: 0.2
  });

  // جسم
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), black);
  body.position.set(0, H/2, 0);
  body.castShadow = true;
  g.add(body);

  // تجويف أسود (خلف الزجاج)
  const innerW = W * 0.6;
  const cavity = new THREE.Mesh(
    new THREE.BoxGeometry(innerW, H * 0.68, 1),
    innerBlack
  );
  cavity.position.set(-W/2 + innerW/2 + 4, H/2, D/2 - 0.5);
  g.add(cavity);

  // زجاج الباب (بلا خطوط)
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(innerW + 2, H * 0.72),
    glassMat
  );
  glass.position.set(-W/2 + innerW/2 + 4, H/2, D/2 + 0.5);
  g.add(glass);

  // إطار الزجاج
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(innerW + 4, H * 0.72 + 4, 0.5),
    steel
  );
  frame.position.set(-W/2 + innerW/2 + 4, H/2, D/2 + 0.3);
  g.add(frame);
  // أعد الزجاج فوق الإطار
  glass.position.z = D/2 + 0.65;

  // لوحة التحكم الجانبية
  const panelW = W - innerW - 12;
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(panelW, H - 4, 1),
    steel
  );
  panel.position.set(W/2 - panelW/2 - 4, H/2, D/2 + 0.3);
  g.add(panel);

  // شاشة
  const scr = new THREE.Mesh(
    new THREE.PlaneGeometry(panelW - 6, 5),
    new THREE.MeshStandardMaterial({
      color: 0x0a1a25, emissive: 0x00a8ff, emissiveIntensity: 2,
      roughness: 0.2, metalness: 0.5
    })
  );
  scr.position.set(W/2 - panelW/2 - 4, H - 8, D/2 + 0.9);
  g.add(scr);

  // أزرار
  const kMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f, roughness: 0.4, metalness: 0.85
  });
  [0, 1, 2, 3].forEach(function(i) {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 1.2, 16), kMat
    );
    b.rotation.x = Math.PI / 2;
    b.position.set(W/2 - panelW/2 - 4, H - 18 - i * 5, D/2 + 0.9);
    g.add(b);
  });

  // مقبض على يمين الباب
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, H * 0.4, 3), kMat
  );
  handle.position.set(W/2 - 3, H/2, D/2 + 3);
  handle.castShadow = true;
  g.add(handle);

  return g;
}

function makeDoorPanel(w, h, d, hx, hy, hz, hinge, matOrColor) {
  const g = new THREE.Group();
  g.position.set(hx, hy, hz);
  const geo = new THREE.BoxGeometry(w, h, d);
  let mat;
  if (matOrColor && matOrColor.isMaterial) mat = matOrColor;
  else mat = mdfMat(matOrColor);
  const mesh = new THREE.Mesh(geo, mat);
  if (hinge === 'right') mesh.position.x = -w / 2;
  else mesh.position.x = w / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // خطوط خفيفة جداً
  const line = new THREE.LineSegments(
    new THREE.EdgesGeometry(geo),
    new THREE.LineBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.05
    })
  );
  mesh.add(line);
  g.add(mesh);
  g.userData.isDoor = true;
  g.userData.hinge = hinge;
  g.userData.open = false;
  g.userData.openAngle = Math.PI / 2.2;
  return g;
}

function buildTallFridge(p, t, c) {
  const g = new THREE.Group();
  const W = p.w, H = p.h, D = p.d;

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xe0e4e8, roughness: 0.12, metalness: 0.95
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1f, roughness: 0.3, metalness: 0.7
  });
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5, roughness: 0.4, metalness: 0.1
  });
  const hMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a30, roughness: 0.3, metalness: 0.95
  });

  const wallT = 2.5;
  const doorT = 5;

  // ===== الجسم (5 أوجه) =====
  const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, D), steelMat);
  left.position.set(-W/2 + wallT/2, H/2, 0);
  left.castShadow = true;
  g.add(left);

  const right = new THREE.Mesh(new THREE.BoxGeometry(wallT, H, D), steelMat);
  right.position.set(W/2 - wallT/2, H/2, 0);
  right.castShadow = true;
  g.add(right);

  const top = new THREE.Mesh(new THREE.BoxGeometry(W, wallT, D), steelMat);
  top.position.set(0, H - wallT/2, 0);
  g.add(top);

  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, wallT, D), steelMat);
  bottom.position.set(0, wallT/2, 0);
  g.add(bottom);

  const back = new THREE.Mesh(new THREE.BoxGeometry(W - 2*wallT, H - 2*wallT, wallT), steelMat);
  back.position.set(0, H/2, -D/2 + wallT/2);
  g.add(back);

  // ===== فاصل =====
  const splitY = H * 0.35;
  const split = new THREE.Mesh(
    new THREE.BoxGeometry(W - 2*wallT, 2, D - wallT), darkMat
  );
  split.position.set(0, splitY, wallT/2);
  g.add(split);

  // ===== أرفف داخلية =====
  const fridgeInnerH = H - splitY - wallT*2;
  [0.33, 0.66].forEach(function(fr) {
    const sh = new THREE.Mesh(
      new THREE.BoxGeometry(W - 2*wallT - 2, 1.5, D - wallT*2 - 2),
      innerMat
    );
    sh.position.set(0, splitY + fridgeInnerH * fr, 0);
    g.add(sh);
  });

  const frzInnerH = splitY - wallT*2;
  const frzSh = new THREE.Mesh(
    new THREE.BoxGeometry(W - 2*wallT - 2, 1.5, D - wallT*2 - 2),
    innerMat
  );
  frzSh.position.set(0, splitY - frzInnerH * 0.5, 0);
  g.add(frzSh);

  // ===== باب الفريزر =====
  const freezerH = splitY - 1;
  const fw = W - 1;
  const fd = makeDoorPanel(
    fw, freezerH, doorT,
    fw / 2,
    freezerH / 2 + 0.5,
    D / 2 + doorT / 2 + 0.5,
    'right',
    steelMat
  );
  // مقبض أفقي قصير
  const hFreezer = new THREE.Mesh(
    new THREE.BoxGeometry(fw - 18, 2.5, 4), hMat
  );
  hFreezer.position.set(0, freezerH/2 - 12, doorT/2 + 2);
  fd.children[0].add(hFreezer);
  g.add(fd);

  // ===== باب الثلاجة =====
  const fridgeH = H - splitY - 1;
  const frd = makeDoorPanel(
    fw, fridgeH, doorT,
    fw / 2,
    splitY + 0.5 + fridgeH / 2,
    D / 2 + doorT / 2 + 0.5,
    'right',
    steelMat
  );
  // مقبض عمودي قصير في الأعلى
  const hLen = Math.min(35, fridgeH * 0.35);
  const hFridge = new THREE.Mesh(
    new THREE.BoxGeometry(2.5, hLen, 4), hMat
  );
  hFridge.position.set(-fw/2 + 10, fridgeH/2 - hLen/2 - 15, doorT/2 + 2);
  frd.children[0].add(hFridge);
  g.add(frd);

  // ===== شاشة =====
  const screenMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a25, emissive: 0x00a8ff, emissiveIntensity: 2.0,
    roughness: 0.2, metalness: 0.5
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), screenMat);
  screen.position.set(-W/2 + 12, splitY + 1 + fridgeH * 0.85, D/2 + doorT + 0.3);
  g.add(screen);

  return g;
}
