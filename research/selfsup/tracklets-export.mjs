// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 영상 전체에 제품 줄 만들기(buildTracklets)를 돌려 검출마다 줄 번호를 붙이고, 평가 대상(SAM 2 정답) 검출은 학습에서 빼도록 표시한다.
// node tracklets-export.mjs outDir   env HILIT_APP_ROOT ARTIFACTS
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = process.env.ARTIFACTS;
const core = await import(pathToFileURL(`${process.env.HILIT_APP_ROOT}/apps/web/public/tracking/linked-core.js`).href);
const outDir = process.argv[2];
const dump = JSON.parse(readFileSync(`${R}/sam2/dump.json`, 'utf8'));
const seeds = JSON.parse(readFileSync(`${R}/sam2/targets/seeds.json`, 'utf8'));
const iou = (a, b) => { const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const i = ix * iy; const u = a.width * a.height + b.width * b.height - i; return u > 0 ? i / u : 0; };
for (const o of dump) {
  if (!o.debugSamples || o.id.startsWith('rk') || !existsSync(`${outDir}/${o.id}.idx.json`)) continue;
  const samples = o.debugSamples.map((s) => ({ t: s.t, dets: s.dets.map((d) => ({ ...d, desc: null })) }));
  const frame = { width: o.metaDump.width, height: o.metaDump.height };
  const built = core.buildTracklets(samples, frame);
  /* (si, di) → trackId */
  const tid = new Map();
  built.perSample.forEach((row, si) => row.forEach((r) => { tid.set(`${si}:${samples[si].dets.indexOf(r.det)}`, r.trackId); }));
  /* 평가 대상 검출 — 이 영상의 모든 시드 대상의 SAM 2 정답 상자와 IoU ≥ 0.3 */
  const excl = new Set();
  const ansFile = `${R}/sam2/targets/${o.id}.answers.json`;
  const ans = existsSync(ansFile) ? JSON.parse(readFileSync(ansFile, 'utf8')).targets : {};
  for (const sd of seeds.filter((s) => s.vid === o.id)) {
    const a = ans[sd.id]; if (!a) continue;
    for (const r of a.rows) {
      const box = r.fwd || r.bwd; if (!box) continue;
      const g = { x: box[0] / sd.srcScale, y: box[1] / sd.srcScale, width: box[2] / sd.srcScale, height: box[3] / sd.srcScale };
      const si = samples.findIndex((s) => Math.abs(s.t - r.t) < 0.051); if (si < 0) continue;
      samples[si].dets.forEach((d, di) => { if (iou(d, g) >= 0.3) excl.add(`${si}:${di}`); });
    }
  }
  const idx = JSON.parse(readFileSync(`${outDir}/${o.id}.idx.json`, 'utf8'));
  const rows = idx.map(([si, di]) => [tid.get(`${si}:${di}`) ?? -1, excl.has(`${si}:${di}`) ? 1 : 0]);
  writeFileSync(`${outDir}/${o.id}.trk.json`, JSON.stringify(rows));
  console.log(o.id, 'tracks', built.tracks.length, 'crops', idx.length, 'excluded', rows.filter((r) => r[1]).length);
}
