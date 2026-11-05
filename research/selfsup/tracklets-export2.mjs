// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 영상 전체에 제품 줄 만들기(buildTracklets)를 돌려 검출마다 줄 번호를 붙이고, 평가 대상(SAM 2 정답) 검출은 학습에서 빼도록 표시한다.
// node tracklets-export.mjs outDir   env HILIT_APP_ROOT ARTIFACTS
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = process.env.ARTIFACTS;
const core = await import(pathToFileURL(`${process.env.HILIT_APP_ROOT}/apps/web/public/tracking/linked-core.js`).href);
const outDir = process.argv[2];
const EVENTS = readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => JSON.parse(l));
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
  /* 제품과 같은 조건 — 시험대 사건마다 대상 검출을 사라진 구간에서는 빼고, 사라지기 전·다시 나타난 뒤를 다른 줄로 나눈다. */
  const evs = EVENTS.filter((e) => e.vid === o.id);
  const ansFile = `${R}/sam2/targets/${o.id}.answers.json`;
  const ans = existsSync(ansFile) ? JSON.parse(readFileSync(ansFile, 'utf8')).targets : {};
  const mark = new Map(); /* key → { excl, seg, target } */
  for (const id of [...new Set(evs.map((e) => e.id))]) {
    const a = ans[id]; if (!a) continue;
    const mine = evs.filter((e) => e.id === id);
    const sc = mine[0].srcScale;
    for (const r of a.rows) {
      const box = r.fwd || r.bwd; if (!box) continue;
      const g = { x: box[0] / sc, y: box[1] / sc, width: box[2] / sc, height: box[3] / sc };
      const si = samples.findIndex((x) => Math.abs(x.t - r.t) < 0.051); if (si < 0) continue;
      const t = samples[si].t;
      const inWin = mine.some((e) => t > e.tc + 1e-6 && t < e.tc + e.D - 1e-6);
      const seg = mine.filter((e) => e.tc + e.D <= t + 1e-6).length;
      samples[si].dets.forEach((d, di) => {
        if (iou(d, g) < 0.3) return;
        const k = `${si}:${di}`;
        const prev = mark.get(k);
        if (prev && prev.target !== id) { prev.excl = true; return; }
        mark.set(k, { excl: inWin, seg, target: id });
      });
    }
  }
  const idx = JSON.parse(readFileSync(`${outDir}/${o.id}.idx.json`, 'utf8'));
  const rows = idx.map(([si, di]) => {
    const t0 = tid.get(`${si}:${di}`) ?? -1;
    const m = mark.get(`${si}:${di}`);
    if (t0 < 0) return [-1, 0];
    if (!m) return [t0 * 1000, 0];
    return [t0 * 1000 + 1 + m.seg, m.excl ? 1 : 0];
  });
  writeFileSync(`${outDir}/${o.id}.trk.json`, JSON.stringify(rows));
  console.log(o.id, 'tracks', built.tracks.length, 'crops', idx.length, 'excluded', rows.filter((r) => r[1]).length, 'targetSegs', new Set(rows.filter((r) => r[0] % 1000).map((r) => r[0])).size);
}
