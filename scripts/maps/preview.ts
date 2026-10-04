// Offline preview of one arena from the duel camera: the real Arena code,
// two stand-in archers (1.85 m capsules) on their ledges. Bundled and
// screenshotted by scripts/maps/shoot.ts; query: ?map=<theme id>&view=aim|over|wide&seed=n
// With ?kit=grove|valley|snow it lines up every prop of that pack instead,
// left to right in export order (names in the page title).
import * as THREE from 'three';
import { Arena } from '@/game3d/Arena';
import { PropKit, type KitId } from '@/game3d/mapProps';
import { themeById } from '@/game3d/themes';

const q = new URLSearchParams(location.search);
const theme = themeById(q.get('map') ?? 'grove');
const view = q.get('view') ?? 'aim';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(1280, 600);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // R3F's defaults
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(theme.fog, theme.fogNear, theme.fogFar);
scene.background = new THREE.Color(theme.skyHorizon);
const kitId = q.get('kit') as KitId | null;
if (kitId) {
  scene.fog = null;
  scene.add(new THREE.HemisphereLight('#FFFFFF', '#888888', 2), new THREE.DirectionalLight('#FFFFFF', 2));
  const kit = PropKit.load(kitId)!;
  const keys = kit.keys();
  const scale = Number(q.get('scale') ?? 1);
  let x = 0;
  for (const k of keys) {
    const w = kit.size(k).x * scale;
    kit.place(k, x + w / 2, 0, 0, 0, scale);
    x += w + 1;
  }
  const g = new THREE.Group();
  kit.flush(g);
  scene.add(g);
  const cam = new THREE.PerspectiveCamera(30, 1280 / 600, 0.1, 2000);
  cam.position.set(x / 2, x * 0.12, x * 1.0);
  cam.lookAt(x / 2, x * 0.05, 0);
  renderer.render(scene, cam);
  THREE.DefaultLoadingManager.onLoad = () => renderer.render(scene, cam);
  document.title = `calls ${keys.join(' ')}`;
  throw new Error('lineup');
}
const arena = new Arena(theme, Number(q.get('seed') ?? 12345), { min: -45, max: 120 });
const gap = 24;
arena.setArcher(0, { x: 0, top: 4, facing: 1, color: '#F4A261' });
arena.setArcher(1, { x: gap, top: 3, facing: -1, color: '#E63946' });
scene.add(arena.group);
for (const [x, top] of [
  [0, 4],
  [gap, 3],
]) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.45), new THREE.MeshLambertMaterial({ color: '#111111' }));
  m.position.set(x, top + 0.925, 0);
  scene.add(m);
}
// Same framing rule as DuelView.updateCamera.
const f = view === 'aim' ? { x: 4, y: 4.5, d: 15 } : view === 'over' ? { x: gap / 2, y: 4, d: 34 } : { x: gap / 2, y: 6, d: 70 };
const cam = new THREE.PerspectiveCamera(34, 1280 / 600, 0.1, 900);
cam.position.set(f.x - f.d * 0.1, f.y + f.d * 0.12, f.d);
cam.lookAt(f.x, f.y, 0);
const focus = new THREE.Vector3(f.x, f.y, 0);
const draw = () => {
  for (let n = 0; n < 30; n++) arena.update(n / 60, 1 / 60, focus);
  renderer.render(scene, cam);
  document.title = `calls ${renderer.info.render.calls} tris ${renderer.info.render.triangles}`;
};
draw();
THREE.DefaultLoadingManager.onLoad = draw;
