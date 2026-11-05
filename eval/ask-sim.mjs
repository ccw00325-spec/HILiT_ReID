// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 묻기 시뮬레이터(평가 전용) — 제품의 「헷갈리면 바로 묻기」 흐름을 정답(SAM 2)으로 답하는 사용자로 흉내 낸다.
//   묻는 순간 정답이 보이면: 제안이 맞으면 받아들이고, 아니면 정답 사람을 고른다(제안은 확실한 타인으로 기억) → 그 자리에서 다시 찾는다.
//   정답이 안 보이면: 「여기 없음」 → 2초 뒤까지 비우고, 마지막으로 확실했던 자리에서 다시 찾는다(그 2초 안에는 묻지 않음).
//   한 번 찾기에 묻는 횟수는 8번까지(제품 LIVE_ASK_MAX), 넘으면 묻지 않고 끝까지 간다.
// node ask-sim.mjs [split]  env HILIT_APP_ROOT POLICY NOASK=1(묻기 끔 — 기준) ARTIFACTS ONLY
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = process.env.ARTIFACTS;
const core = await import(pathToFileURL(`${process.env.HILIT_APP_ROOT}/apps/web/public/tracking/linked-core.js`).href);
const policy = { ...core.LINKED_POLICY, ...(process.env.POLICY ? JSON.parse(process.env.POLICY) : {}) };
const SPLIT = process.argv[2] || 'dev';
const SEALED = new Set((process.env.SEALED_IDS || '').split(','));
const MAXASK = process.env.NOASK ? 0 : +(process.env.MAXASK || 8);
const seeds = JSON.parse(readFileSync(`${R}/sam2/targets/seeds.json`, 'utf8')).filter((s) => SPLIT === 'all' || (SPLIT === 'sealed') === SEALED.has(s.vid))
  .filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.vid));
const dump = Object.fromEntries(JSON.parse(readFileSync(process.env.DUMP || `${R}/sam2/dump.json`, 'utf8')).map((o) => [o.id, o]));
const toDesc = (d) => (d ? { values: Float32Array.from(d.values), samples: d.samples, trust: d.trust } : null);
const iou = (a, b) => { if (!a || !b) return 0; const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const i = ix * iy; const u = a.width * a.height + b.width * b.height - i; return u > 0 ? i / u : 0; };
const B = (a, s) => (a ? { x: a[0] / s, y: a[1] / s, width: a[2] / s, height: a[3] / s } : null);
const centerIn = (p, g) => { const cx = p.x + p.width / 2, cy = p.y + p.height / 2; return cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height; };
const CLAIM = new Set(['TRACKING_OK', 'TRACKING_WARNING']);
const T = { vis: 0, H: 0, L: 0, S: 0, D: 0, m: 0, abs: 0, absClaim: 0, asks: 0, askYes: 0, askPick: 0, askAbsent: 0, sec: 0, targets: 0, wrongTargets: 0 };
for (const sd of seeds) {
  const ansF = `${R}/sam2/targets/${sd.vid}.answers.json`;
  const ans = existsSync(ansF) ? JSON.parse(readFileSync(ansF, 'utf8')).targets?.[sd.id] : null;
  const o = dump[sd.vid];
  if (!ans || !o?.debugSamples) continue;
  const s = sd.srcScale;
  const all = o.debugSamples.filter((q) => q.t >= sd.seedT - 1e-6 && q.t <= sd.endT + 1e-6).map((q) => ({ t: q.t, dets: q.dets.map((d) => ({ ...d, desc: toDesc(d.desc) })) }));
  let cutT = Infinity, run = 0;
  for (const r of ans.rows) { const split = (r.fwd && !(r.bwd && r.agree >= 0.5)) || (!r.fwd && r.bwd); run = split ? run + 1 : 0; if (run >= 3) { cutT = r.t - 0.2; break; } }
  const G = all.map((smp) => {
    const r = ans.rows.find((q) => Math.abs(q.t - smp.t) < 0.051);
    if (!r || smp.t >= cutT) return { cls: 'UNS' };
    const f = B(r.fwd, s), b = B(r.bwd, s);
    if (!f && !b) return { cls: 'ABS' };
    if (!(f && b && r.agree >= 0.5)) return { cls: 'UNS' };
    let det = null, bv = 0.5;
    for (const d of smp.dets) { const v = iou(d, f); if (v > bv) { bv = v; det = d; } }
    return { cls: 'VIS', g: f, det };
  });
  const seedDet = all[0].dets.reduce((b, d) => (iou(d, sd.box) > iou(b, sd.box) ? d : b), all[0].dets[0]);
  /* 최종 궤적: 표본마다 { claim, box } */
  const out = new Array(all.length).fill(null);
  const rejected = [];
  const confirmed = [seedDet?.desc].filter(Boolean);
  let startI = 0, seedBox = sd.box, askNotBefore, asks = 0;
  const forcedAbsent = []; /* 사용자가 「없음」이라고 한 구간 — 다시 찾은 결과보다 우선 */
  const applyAbsent = () => { for (const [a, b] of forcedAbsent) for (let k = a; k < b; k += 1) out[k] = { claim: false }; };
  for (let guard = 0; guard < 40 && startI < all.length - 1; guard += 1) {
    const samples = all.slice(startI);
    const built = core.buildTracklets(samples, sd.frame, policy);
    const link = core.linkTarget({ samples, built, frame: sd.frame, seed: { t: samples[0].t, box: seedBox }, rejected, seedDescs: confirmed,
      stopOnAsk: asks < MAXASK, askNotBefore, followThrough: asks >= MAXASK }, policy);
    if (!link.ok) break;
    const traj = core.renderTrajectory(samples, link, { startT: samples[0].t, endT: samples.at(-1).t });
    const at = (t) => traj.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b), traj[0]);
    const endK = link.ask ? link.ask.si : samples.length;
    for (let k = 0; k < endK; k += 1) {
      const p = at(samples[k].t);
      out[startI + k] = { claim: CLAIM.has(p.state), box: p.box };
    }
    applyAbsent();
    if (!link.ask) break;
    asks += 1; T.asks += 1;
    if (process.env.V) console.log(sd.id, 'ask', link.ask.reason, link.ask.t);
    const askI = startI + link.ask.si;
    const prop = link.ask.proposal?.box ? { t: link.ask.proposal.t, box: link.ask.proposal.box } : null;
    /* 정답이 보이는 첫 표본(0.6초 안) */
    let vi = -1;
    for (let k = askI; k < all.length && all[k].t <= all[askI].t + 0.6 + 1e-6; k += 1) if (G[k].cls === 'VIS' && G[k].det) { vi = k; break; }
    if (vi >= 0) {
      const g = G[vi].g;
      const propOk = prop && Math.abs(prop.t - all[vi].t) < 0.25 && iou(prop.box, g) >= 0.5;
      if (prop && !propOk) rejected.push({ t: prop.t, box: prop.box });
      if (propOk) T.askYes += 1; else T.askPick += 1;
      for (let k = askI; k < vi; k += 1) out[k] = { claim: false };
      if (G[vi].det.desc) confirmed.push(G[vi].det.desc);
      startI = vi; seedBox = G[vi].det; askNotBefore = undefined;
    } else {
      T.askAbsent += 1;
      if (prop) rejected.push({ t: prop.t, box: prop.box });
      const next = all[askI].t + 2;
      let ni = askI; while (ni < all.length && all[ni].t < next - 1e-6) { out[ni] = { claim: false }; ni += 1; }
      /* 마지막으로 확실했던 자리(3초 안)에서 다시 — 제품 lastConfidentPoint */
      let li = askI - 1; while (li >= 0 && !(out[li]?.claim) && all[askI].t - all[li].t <= 3) li -= 1;
      if (li < 0 || !out[li]?.claim || all[askI].t - all[li].t > 3) {
        /* 출발점이 없다 — 다음 장면에서 다시 묻는 대신 그 자리 정답으로(제품: 그 뒤 장면을 묻는다) */
        let vj = -1; for (let k = ni; k < all.length; k += 1) if (G[k].cls === 'VIS' && G[k].det) { vj = k; break; }
        if (vj < 0) break;
        asks += 1; T.asks += 1; T.askPick += 1; /* 그 뒤 장면을 다시 물음 */
        for (let k = ni; k < vj; k += 1) out[k] = { claim: false };
        startI = vj; seedBox = G[vj].det; askNotBefore = undefined;
      } else {
        forcedAbsent.push([askI, ni]);
        startI = li; seedBox = out[li].box; askNotBefore = next;
      }
    }
  }
  applyAbsent();
  /* 채점 */
  let wrong = false;
  for (let k = 1; k < all.length; k += 1) {
    const g = G[k], p = out[k] || { claim: false };
    if (g.cls === 'UNS') continue;
    if (g.cls === 'ABS') { T.abs += 1; if (p.claim) T.absClaim += 1; continue; }
    T.vis += 1;
    let v;
    if (!p.claim) v = 'm';
    else if (iou(p.box, g.g) >= 0.5) v = 'H';
    else if (iou(p.box, g.g) >= 0.3 || centerIn(p.box, g.g)) v = 'L';
    else if (all[k].dets.some((d) => iou(d, p.box) >= 0.5 && iou(d, g.g) < 0.3)) v = 'S';
    else v = 'D';
    T[v] += 1;
    if (v === 'S') wrong = true;
  }
  T.targets += 1; if (wrong) T.wrongTargets += 1;
  T.sec += all.at(-1).t - all[0].t;
}
const pc = (a) => `${(100 * a / T.vis).toFixed(1)}%`;
console.log(`보임 ${T.vis} | IoU0.5 ${pc(T.H)} 느슨 ${pc(T.H + T.L)} | 다른 사람 ${T.S} 빈 곳 ${T.D} 놓침 ${T.m} | 없음 ${T.abs} 중 우김 ${T.absClaim} | 다른 사람이 한 번이라도 나온 대상 ${T.wrongTargets}/${T.targets} | 물음 ${T.asks}(맞다 ${T.askYes}·골라 줌 ${T.askPick}·없음 ${T.askAbsent}) · 분당 ${(T.asks / (T.sec / 60)).toFixed(2)}`);
