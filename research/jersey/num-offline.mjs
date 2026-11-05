// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// node num-offline.mjs clips.json dump.json model.json out.json — 덤프의 모든 검출(키 ≥ MINH)에 등번호 읽기(det.num)를 붙인다.
// 제품과 같은 JS 판독기·같은 자르기로, 분석 화면 크기로 디코드한 프레임에서 읽는다(이 PC 안에서만, 평가 전용).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const APP = process.env.HILIT_APP_ROOT;
const J = await import(pathToFileURL(`${APP}/apps/web/public/tracking/hilit-jersey-number.js`).href);
const [clipsPath, dumpPath, modelPath, outPath] = process.argv.slice(2);
J.loadJerseyModel(JSON.parse(readFileSync(modelPath, 'utf8')));
const clips = Object.fromEntries(JSON.parse(readFileSync(clipsPath, 'utf8')).map((c) => [c.id, c.clipFile]));
const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const MINH = +(process.env.MINH || 60);
function frames(file, W, H, onFrame) {
  const fr = String(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'csv=p=0', file])).trim().split('/');
  const half = 0.5 / (+fr[0] / (+fr[1] || 1)) - 1e-4;
  return new Promise((resolve, reject) => {
    const hw = half.toFixed(5); const sel = `lt(mod(t+${hw}+0.2,0.2),2*${hw})`;
    const p = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select='${sel}',scale=${W}:${H}:flags=bicubic:in_color_matrix=bt709`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
    const size = W * H * 3; let buf = Buffer.alloc(0); let k = 0;
    p.stdout.on('data', (c) => { buf = Buffer.concat([buf, c]); while (buf.length >= size) { onFrame(k++, buf.subarray(0, size)); buf = buf.subarray(size); } });
    p.stderr.on('data', (e) => process.stderr.write(e));
    p.on('close', (code) => (code === 0 ? resolve(k) : reject(new Error('ffmpeg ' + code))));
  });
}
/* 상체 무늬(윤곽 방향 분포) — 가로 4칸 × 세로 3칸 × 방향 8, 32×24 밝기에서. */
function texOf(img, W, H, d) {
  const x0 = d.x + 0.1 * d.width, x1 = d.x + 0.9 * d.width, y0 = d.y + 0.12 * d.height, y1 = d.y + 0.55 * d.height;
  const GW = 24, GH = 18, g = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j += 1) for (let i = 0; i < GW; i += 1) {
    const sx = Math.min(W - 1, Math.max(0, Math.floor(x0 + (i + 0.5) * (x1 - x0) / GW))), sy = Math.min(H - 1, Math.max(0, Math.floor(y0 + (j + 0.5) * (y1 - y0) / GH)));
    const a = (sy * W + sx) * 3; g[j * GW + i] = 0.299 * img[a] + 0.587 * img[a + 1] + 0.114 * img[a + 2];
  }
  const CX = 4, CY = 3, B = 8, out = new Float32Array(CX * CY * B);
  for (let j = 1; j < GH - 1; j += 1) for (let i = 1; i < GW - 1; i += 1) {
    const gx = g[j * GW + i + 1] - g[j * GW + i - 1], gy = g[(j + 1) * GW + i] - g[(j - 1) * GW + i];
    const m = Math.hypot(gx, gy); if (m < 1) continue;
    let ang = Math.atan2(gy, gx); if (ang < 0) ang += Math.PI;
    const b = Math.min(B - 1, Math.floor(ang / Math.PI * B));
    const c = Math.min(CY - 1, Math.floor(j * CY / GH)) * CX + Math.min(CX - 1, Math.floor(i * CX / GW));
    out[c * B + b] += m;
  }
  let n = 0; for (const v of out) n += v * v; n = Math.sqrt(n) || 1;
  return Array.from(out, (v) => +(v / n).toFixed(4));
}
const t0 = Date.now(); let reads = 0;
for (const o of dump) {
  if (!o.debugSamples || (ONLY && !ONLY.has(o.id)) || !clips[o.id] || o.id.startsWith('rk')) continue;
  const W = o.metaDump.width, H = o.metaDump.height;
  let n = 0, conf = 0;
  await frames(clips[o.id], W, H, (k, img) => {
    const s = o.debugSamples[k]; if (!s) return;
    for (const d of s.dets) {
      d.num = null; d.tex = null;
      if (d.height >= 40) d.tex = texOf(img, W, H, d);
      if (process.env.TEXONLY || d.height < MINH) continue;
      const sx = Math.max(0, Math.floor(d.x + J.JERSEY_REGION.x0 * d.width)), sy = Math.max(0, Math.floor(d.y + J.JERSEY_REGION.y0 * d.height));
      const ex = Math.min(W, Math.ceil(d.x + J.JERSEY_REGION.x1 * d.width)), ey = Math.min(H, Math.ceil(d.y + J.JERSEY_REGION.y1 * d.height));
      if (ex - sx < 8 || ey - sy < 8) continue;
      const w = ex - sx, h = ey - sy, rgba = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const a = ((sy + y) * W + sx + x) * 3, b = (y * w + x) * 4; rgba[b] = img[a]; rgba[b + 1] = img[a + 1]; rgba[b + 2] = img[a + 2]; rgba[b + 3] = 255; }
      const r = J.readJersey(J.jerseyInput(rgba, w, h));
      reads += 1; n += 1;
      if (r && r.n !== null) { d.num = { n: r.n, p: +r.p.toFixed(3) }; if (r.p >= 0.8) conf += 1; }
    }
  });
  console.log(o.id, 'reads', n, 'p≥0.8', conf, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
console.log('ms/read', ((Date.now() - t0) / Math.max(1, reads)).toFixed(2));
writeFileSync(outPath, JSON.stringify(dump));
