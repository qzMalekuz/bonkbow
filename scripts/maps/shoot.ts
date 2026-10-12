// Screenshots arenas offline (scripts/maps/preview.ts) in headless Brave
// through the DevTools protocol, and prints draw calls / triangles.
//   bun scripts/maps/shoot.ts <outDir> grove:aim valley:over snow:wide …
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Bun APIs used here (the repo has no bun-types).
declare const Bun: {
  build(o: object): Promise<{ success: boolean; logs: unknown[] }>;
  spawn(cmd: string[], o: object): { kill(): void };
  sleep(ms: number): Promise<void>;
};

const BROWSER = process.env.BROWSER ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const [outDir, ...shots] = process.argv.slice(2);
if (!outDir || !shots.length) throw new Error('usage: bun scripts/maps/shoot.ts <outDir> <map>:<view>[:seed] …');
const site = join(outDir, 'site');
mkdirSync(site, { recursive: true });
const built = await Bun.build({
  entrypoints: [fileURLToPath(new URL('./preview.ts', import.meta.url).href)],
  outdir: site,
  target: 'browser',
  naming: 'preview.js',
  loader: { '.jpg': 'file' },
});
if (!built.success) throw new AggregateError(built.logs, 'build failed');
writeFileSync(
  join(site, 'index.html'),
  '<html><body style="margin:0"><pre id="err"></pre><script>onerror=(m,s,l,c,e)=>{err.textContent+=m+" "+l+":"+c+"\\n"+(e&&e.stack)}</script><script src="preview.js"></script></body></html>',
);

const port = 9333;
const browser = Bun.spawn(
  [BROWSER, '--headless=new', `--user-data-dir=${join(outDir, 'profile')}`, `--remote-debugging-port=${port}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--hide-scrollbars', '--window-size=1280,600', 'about:blank'],
  { stdout: 'ignore', stderr: 'ignore' },
);
try {
  let url = '';
  for (let i = 0; i < 50 && !url; i++) {
    await Bun.sleep(200);
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      url = pages.find((p) => p.type === 'page')?.webSocketDebuggerUrl ?? '';
    } catch {}
  }
  if (!url) throw new Error('browser did not start');
  const ws = new WebSocket(url);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map<number, (v: { result: Record<string, any> }) => void>();
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<{ result: Record<string, any> }>((r) => {
      waiting.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const state = async () =>
    (await send('Runtime.evaluate', { expression: 'document.title + " " + (document.getElementById("err")?.textContent ?? "")' })).result.result.value as string;
  for (const shot of shots) {
    const [map, view = 'aim', seed = '12345'] = shot.split(':');
    // "kit:<id>[:scale]" lines up a pack's props.
    const query = map === 'kit' ? `kit=${view}&scale=${shot.split(':')[2] ?? 1}` : `map=${map}&view=${view}&seed=${seed}`;
    await send('Page.navigate', { url: `file://${site}/index.html?${query}` });
    for (let i = 0; i < 60 && !(await state()).startsWith('calls'); i++) await Bun.sleep(250);
    await Bun.sleep(2000); // textures
    const png = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${map}-${view}.png`), Buffer.from(png.result.data, 'base64'));
    console.log(`${map}:${view} ${await state()}`);
  }
  ws.close();
} finally {
  browser.kill();
}
