// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// node crops-offline.mjs clips.json dump.json outDir — 덤프 검출(키 ≥ MINH)마다 64×32 RGB 조각을 만든다(이 PC 안에서만, 평가 전용).
// 출력: <clip>.bin (N×64×32×3 uint8), <clip>.idx.json [[si, di], ...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
const [clipsPath, dumpPath, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const clips = Object.fromEntries(JSON.parse(readFileSync(clipsPath, 'utf8')).map((c) => [c.id, c.clipFile]));
const dump = JSON.parse(readFileSync(dumpPath, 'utf8'));
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const MINH = +(process.env.MINH || 30);
const CH = 64, CW = 32;
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
/** 넓이 평균으로 상자를 CH×CW 로. */
function crop(img, W, H, d, out, off) {
  const x0 = Math.max(0, d.x), y0 = Math.max(0, d.y), x1 = Math.min(W, d.x + d.width), y1 = Math.min(H, d.y + d.height);
  for (let j = 0; j < CH; j += 1) {
    const ya = y0 + (j * (y1 - y0)) / CH, yb = y0 + ((j + 1) * (y1 - y0)) / CH;
    for (let i = 0; i < CW; i += 1) {
      const xa = x0 + (i * (x1 - x0)) / CW, xb = x0 + ((i + 1) * (x1 - x0)) / CW;
      let r = 0, g = 0, b = 0, a = 0;
      for (let yy = Math.floor(ya); yy < Math.min(H, Math.ceil(yb)); yy += 1) {
        const wy = Math.min(yy + 1, yb) - Math.max(yy, ya); if (wy <= 0) continue;
        for (let xx = Math.floor(xa); xx < Math.min(W, Math.ceil(xb)); xx += 1) {
          const wx = Math.min(xx + 1, xb) - Math.max(xx, xa); if (wx <= 0) continue;
          const k = (yy * W + xx) * 3, w = wx * wy;
          r += img[k] * w; g += img[k + 1] * w; b += img[k + 2] * w; a += w;
        }
      }
      const o = off + (j * CW + i) * 3;
      out[o] = a ? r / a : 0; out[o + 1] = a ? g / a : 0; out[o + 2] = a ? b / a : 0;
    }
  }
}
for (const o of dump) {
  if (!o.debugSamples || (ONLY && !ONLY.has(o.id)) || !clips[o.id] || o.id.startsWith('rk')) continue;
  const W = o.metaDump.width, H = o.metaDump.height;
  const idx = []; const chunks = [];
  await frames(clips[o.id], W, H, (k, img) => {
    const s = o.debugSamples[k]; if (!s) return;
    s.dets.forEach((d, di) => {
      if (d.height < MINH) return;
      const buf = Buffer.alloc(CH * CW * 3);
      crop(img, W, H, d, buf, 0);
      chunks.push(buf); idx.push([k, di]);
    });
  });
  writeFileSync(`${outDir}/${o.id}.bin`, Buffer.concat(chunks));
  writeFileSync(`${outDir}/${o.id}.idx.json`, JSON.stringify(idx));
  console.log(o.id, idx.length);
}
