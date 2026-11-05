// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 재등장 시험대(평가 전용) — 실제 영상 덤프에서 SAM 2 정답 대상의 검출만 D초 지워 「화면에서 사라졌다 다시 나타남」을 만든다.
// 다른 사람들(같은 유니폼 포함)은 그대로라, 다시 나타났을 때 맞는 사람을 다시 잡는지 / 다른 사람에게 잇는지 / 못 찾는지를 잰다.
// node reentry-bench.mjs [split]   env HILIT_APP_ROOT POLICY DUMP DS=1.5,3,6 V=1 ONLY= DESC=descOff|desc
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const R = process.env.ARTIFACTS;
const APP = process.env.HILIT_APP_ROOT;
const core = await import(pathToFileURL(`${APP}/apps/web/public/tracking/linked-core.js`).href);
const policy = { ...core.LINKED_POLICY, ...(process.env.POLICY ? JSON.parse(process.env.POLICY) : {}) };
const SPLIT = process.argv[2] || 'dev';
const SEALED = new Set((process.env.SEALED_IDS || '').split(','));
const DS = (process.env.DS || '1.5,3,6').split(',').map(Number);
const seeds = JSON.parse(readFileSync(`${R}/sam2/targets/seeds.json`, 'utf8')).filter((s) => SPLIT === 'all' || (SPLIT === 'sealed') === SEALED.has(s.vid))
  .filter((s) => !process.env.ONLY || process.env.ONLY.split(',').includes(s.vid));
const dump = Object.fromEntries(JSON.parse(readFileSync(process.env.DUMP || `${R}/sam2/dump.json`, 'utf8')).map((o) => [o.id, o]));
const toDesc = (d) => (d ? { values: Float32Array.from(d.values), samples: d.samples, trust: d.trust } : null);
const iou = (a, b) => { if (!a || !b) return 0; const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)); const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); const i = ix * iy; const u = a.width * a.height + b.width * b.height - i; return u > 0 ? i / u : 0; };
const B = (a, s) => (a ? { x: a[0] / s, y: a[1] / s, width: a[2] / s, height: a[3] / s } : null);
const centerIn = (p, g) => { const cx = p.x + p.width / 2, cy = p.y + p.height / 2; return cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height; };
const CLAIM = new Set(['TRACKING_OK', 'TRACKING_WARNING']);
const DESCK = process.env.DESC || 'desc';
const embCache = {};
function f16(h) { const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024); }
const tot = {}; const T = (D) => (tot[D] ||= { events: 0, ok: 0, wrong: 0, missed: 0, asked: 0, okPts: 0, sPts: 0, mPts: 0, pts: 0, asks: 0 });
const extra = process.env.EXTRA ? (await import(pathToFileURL(process.env.EXTRA).href)) : null;
for (const sd of seeds) {
  const ansAll = existsSync(`${R}/sam2/targets/${sd.vid}.answers.json`) ? JSON.parse(readFileSync(`${R}/sam2/targets/${sd.vid}.answers.json`, 'utf8')) : null;
  const ans = ansAll?.targets?.[sd.id];
  const o = dump[sd.vid];
  if (!ans || !o?.debugSamples) continue;
  const s = sd.srcScale;
  const all = o.debugSamples.filter((q) => q.t >= sd.seedT - 1e-6 && q.t <= sd.endT + 1e-6)
    .map((q) => ({ t: q.t, dets: q.dets.map((d) => ({ ...d, desc: toDesc(d[DESCK] ?? null), num: d.num ?? null })) }));
  if (process.env.EMB) {
    /* 영상 안 자기지도 임베딩(평가 실험) — (표본, 검출) 마다 붙인다. */
    const base = `${process.env.EMB}/${sd.vid}`;
    if (existsSync(`${base}.emb.npy`)) {
      embCache[sd.vid] ??= (() => {
        const idx = JSON.parse(readFileSync(`${base}.idx.json`, 'utf8'));
        const buf = readFileSync(`${base}.emb.npy`);
        const hl = buf.readUInt16LE(8); const data = buf.subarray(10 + hl);
        const dim = data.length / 2 / idx.length;
        const m = new Map();
        idx.forEach(([k, di], r) => { const v = new Float32Array(dim); for (let j = 0; j < dim; j += 1) v[j] = f16(data.readUInt16LE((r * dim + j) * 2)); m.set(`${k}:${di}`, v); });
        return m;
      })();
      const off = o.debugSamples.findIndex((q) => q.t >= sd.seedT - 1e-6);
      all.forEach((smp, i) => smp.dets.forEach((d, di) => { d.emb = embCache[sd.vid].get(`${off + i}:${di}`) ?? null; }));
    }
  }
  let cutT = Infinity, run = 0;
  for (const r of ans.rows) { const split = (r.fwd && !(r.bwd && r.agree >= 0.5)) || (!r.fwd && r.bwd); run = split ? run + 1 : 0; if (run >= 3) { cutT = r.t - 0.2; break; } }
  /* 표본별 정답 상자(VIS)·정답 검출 번호 */
  const G = all.map((smp) => {
    if (smp.t >= cutT) return null;
    const r = ans.rows.find((q) => Math.abs(q.t - smp.t) < 0.051);
    if (!r) return null;
    const f = B(r.fwd, s), b = B(r.bwd, s);
    if (!(f && b && r.agree >= 0.5)) return null;
    let di = -1, bv = 0.5;
    smp.dets.forEach((d, k) => { const v = iou(d, f); if (v > bv) { bv = v; di = k; } });
    return { g: f, di };
  });
  const on = (k) => G[k] && G[k].di >= 0;
  for (const D of DS) {
    let lastEv = -Infinity, nEv = 0;
    for (let k = 10; k < all.length && nEv < (+process.env.NEV || 4); k += 1) {
      const tc = all[k].t;
      if (tc - lastEv < (+process.env.SPACE || D + 4)) continue;
      const pre = all.map((q, i) => i).filter((i) => all[i].t >= tc - (+process.env.PRE || 2) - 1e-6 && all[i].t <= tc + 1e-6);
      const win = all.map((q, i) => i).filter((i) => all[i].t > tc + 1e-6 && all[i].t < tc + D - 1e-6);
      const post = all.map((q, i) => i).filter((i) => all[i].t >= tc + D - 1e-6 && all[i].t <= tc + D + 3 + 1e-6);
      if (pre.length < 4 * (+process.env.PRE || 2) || post.length < 10) continue;
      if (pre.filter(on).length < pre.length * 0.8 || post.filter(on).length < 6) continue;
      if (!on(post[0]) && !on(post[1])) continue;
      /* 창 안 정답 상자 — 모르면 앞뒤 정답 상자로 잇는다 */
      const known = [...pre, ...win, ...post].filter((i) => G[i]);
      const gAt = (i) => {
        if (G[i]) return G[i].g;
        const a = known.filter((j) => j < i).at(-1), b = known.find((j) => j > i);
        if (a === undefined || b === undefined) return null;
        const f = (all[i].t - all[a].t) / (all[b].t - all[a].t);
        const A = G[a].g, Bb = G[b].g;
        return { x: A.x + (Bb.x - A.x) * f, y: A.y + (Bb.y - A.y) * f, width: A.width + (Bb.width - A.width) * f, height: A.height + (Bb.height - A.height) * f };
      };
      const idx = [...pre, ...win, ...post];
      const samples = idx.map((i) => {
        if (!win.includes(i)) return all[i];
        const g = gAt(i);
        return { t: all[i].t, dets: g ? all[i].dets.filter((d) => iou(d, g) < 0.3) : all[i].dets };
      });
      const seedI = pre.find(on);
      const seedBox = G[seedI].g;
      const seedDet = all[seedI].dets[G[seedI].di];
      const built = core.buildTracklets(samples, sd.frame, policy);
      const input = { samples, built, frame: sd.frame, seed: { t: all[seedI].t, box: seedBox }, rejected: [], seedDescs: [seedDet?.desc].filter(Boolean), stopOnAsk: process.env.ASK === '1' };
      if (extra?.prepare) extra.prepare(input, { sd, o });
      const link = core.linkTarget(input, policy);
      if (!link.ok) continue;
      const traj = core.renderTrajectory(samples, link, { startT: samples[0].t, endT: samples.at(-1).t });
      const at = (t) => traj.reduce((b, q) => (Math.abs(q.t - t) < Math.abs(b.t - t) ? q : b), traj[0]);
      /* 지우기 직전까지 대상 위였나 */
      let preOk = 0;
      for (const i of pre.slice(-4)) { const p = at(all[i].t); if (CLAIM.has(p.state) && G[i] && (iou(p.box, G[i].g) >= 0.3 || centerIn(p.box, G[i].g))) preOk += 1; }
      if (preOk < 3) continue;
      const tt = T(D);
      tt.events += 1; nEv += 1; lastEv = tc;
      if (process.env.EVENTS_OUT) appendFileSync(process.env.EVENTS_OUT, `${JSON.stringify({ vid: sd.vid, id: sd.id, tc, D, srcScale: s })}
`);
      let okN = 0, sN = 0, mN = 0;
      const codes = [];
      for (const i of post) {
        if (!G[i]) continue;
        const p = at(all[i].t);
        let v;
        if (!CLAIM.has(p.state)) v = 'm';
        else if (iou(p.box, G[i].g) >= 0.3 || centerIn(p.box, G[i].g)) v = 'H';
        else v = 'S';
        codes.push(v);
        if (v === 'H') okN += 1; else if (v === 'S') sN += 1; else mN += 1;
      }
      if (link.ask) tt.asks += 1;
      tt.pts += okN + sN + mN; tt.okPts += okN; tt.sPts += sN; tt.mPts += mN;
      /* 묻기(ASK=1): 다시 나타난 무렵(사라진 뒤 ~ 나타난 뒤 3초) 멈춰 물었으면 사용자가 정답을 고른다고 보고 따로 센다. */
      const askedHere = link.ask && link.ask.t >= tc - 0.2 && link.ask.t <= tc + D + 3 + 1e-6;
      const cat = askedHere && sN === 0 ? 'asked' : sN > 0 ? 'wrong' : okN > 0 ? 'ok' : 'missed';
      tt[cat] += 1;
      {
        let truthTr2 = null;
        for (const i of post) { if (!G[i]) continue; const k2 = idx.indexOf(i); const r = built.perSample[k2].find((x) => iou(x.obs.box, G[i].g) >= 0.5); if (r) { truthTr2 = r.trackId; break; } }
        const d0 = link.decisions.find((d) => d.kind === 'lost' && d.at >= tc - 0.3 && d.cands);
        if (d0) {
          const c = d0.cands.find((x) => x.id === truthTr2);
          tt.lostEv = (tt.lostEv || 0) + 1;
          if (process.env.TEX) {
            const cos = (a, b) => { let s2 = 0; for (let k = 0; k < a.length; k += 1) s2 += a[k] * b[k]; return s2; };
            const byId = new Map(built.tracks.map((x) => [x.id, x]));
            const isoOb = (o) => built.perSample[o.si].every((r) => r.obs === o || iou(r.obs.box, o.box) < 0.05);
            const gal = [];
            for (let k = 0; k < samples.length && samples[k].t <= d0.at + 1e-6; k += 1) {
              const stt = link.state[k]; if (stt?.kind !== 'obs') continue;
              const o = byId.get(stt.trackId).obs.find((x) => x.si === k); if (o?.tex && isoOb(o)) gal.push(o.tex);
            }
            const texScore = (id, t0) => {
              const tx = byId.get(id).obs.filter((o) => o.t >= t0 - 1e-6 && o.t - t0 <= 3 && o.tex).map((o) => o.tex);
              if (!gal.length || !tx.length) return null;
              const per = tx.map((t) => { const s2 = gal.map((g) => cos(g, t)).sort((a, b) => b - a); return s2.length > 1 ? (s2[0] + s2[1]) / 2 : s2[0]; }).sort((a, b) => a - b);
              return per[Math.floor(per.length / 2)];
            };
            const sc = d0.cands.map((x) => ({ id: x.id, sim: x.sim, tex: texScore(x.id, x.t) }));
            const W2 = +process.env.TEXW || 0;
            const comb = (x) => x.sim + W2 * (x.tex ?? 0);
            const tr2 = sc.find((x) => x.id === truthTr2);
            if (tr2) {
              tt.texN = (tt.texN || 0) + 1;
              if (!sc.some((x) => x.id !== tr2.id && comb(x) > comb(tr2))) tt.texTop1 = (tt.texTop1 || 0) + 1;
              if (tr2.tex !== null && !sc.some((x) => x.id !== tr2.id && x.tex !== null && x.tex > tr2.tex)) tt.texOnly1 = (tt.texOnly1 || 0) + 1;
              if (tr2.tex !== null) tt.texHas = (tt.texHas || 0) + 1;
            }
          }
          if (process.env.EMB) {
            const dot = (a, b) => { let s2 = 0; for (let k = 0; k < a.length; k += 1) s2 += a[k] * b[k]; return s2; };
            const byId = new Map(built.tracks.map((x) => [x.id, x]));
            const detOf = (o) => built.perSample[o.si].find((r) => r.obs === o)?.det;
            const isoOb = (o) => built.perSample[o.si].every((r) => r.obs === o || iou(r.obs.box, o.box) < 0.05);
            const gal = [];
            for (let k = 0; k < samples.length && samples[k].t <= d0.at + 1e-6; k += 1) {
              const stt = link.state[k]; if (stt?.kind !== 'obs') continue;
              const o = byId.get(stt.trackId).obs.find((x) => x.si === k); const e = o && isoOb(o) ? detOf(o)?.emb : null; if (e) gal.push(e);
            }
            const eScore = (id, t0) => {
              const es = byId.get(id).obs.filter((o) => o.t >= t0 - 1e-6 && o.t - t0 <= 3).map((o) => detOf(o)?.emb).filter(Boolean);
              if (!gal.length || !es.length) return null;
              const per = es.map((e) => { const s2 = gal.map((g) => dot(g, e)).sort((a, b) => b - a); return s2.length > 1 ? (s2[0] + s2[1]) / 2 : s2[0]; }).sort((a, b) => a - b);
              return per[Math.floor(per.length / 2)];
            };
            const sc = d0.cands.map((x) => ({ id: x.id, sim: x.sim, e: eScore(x.id, x.t), t: x.t }));
            const tr2 = sc.find((x) => x.id === truthTr2);
            if (tr2 && tr2.e !== null) {
              tt.eN = (tt.eN || 0) + 1;
              if (!sc.some((x) => x.id !== tr2.id && x.e !== null && x.e > tr2.e)) tt.eTop1 = (tt.eTop1 || 0) + 1;
              if (!sc.some((x) => x.id !== tr2.id && x.sim > tr2.sim)) tt.cTop1 = (tt.cTop1 || 0) + 1;
              const rv = sc.filter((x) => x.id !== tr2.id && x.e !== null).sort((a, b) => b.e - a.e)[0];
              if (process.env.EGAPS) console.log('EGAP', JSON.stringify({ D, ok: !rv || tr2.e > rv.e, te: +tr2.e.toFixed(3), re: rv ? +rv.e.toFixed(3) : null, ts: tr2.sim, rs: rv?.sim ?? null }));
            }
          }
          if (process.env.GAPS) {
            const W = +process.env.GAPW || 3;
            const srt = [...d0.cands].sort((a, b) => b.sim - a.sim);
            const top = srt[0];
            const rivals = srt.filter((x) => x.id !== top.id && Math.abs(x.t - top.t) <= W);
            console.log('GAP', JSON.stringify({ D, ok: top.id === truthTr2, inC: !!c, s1: top.sim, n1: top.neg, s2: rivals[0]?.sim ?? 0, gap: +(top.sim - (rivals[0]?.sim ?? 0)).toFixed(3), dt: +(top.t - d0.at).toFixed(1), self: d0.selfRef }));
          }
          if (c) { tt.inC = (tt.inC || 0) + 1; if (!d0.cands.some((x) => x.id !== c.id && x.sim > c.sim)) tt.top1 = (tt.top1 || 0) + 1; }
        }
      }
      if (process.env.V) {
        const sIdx = (i) => idx.indexOf(i);
        let truthTr = null;
        for (const i of post) { if (!G[i]) continue; const k2 = sIdx(i); const r = built.perSample[k2].find((x) => iou(x.obs.box, G[i].g) >= 0.5); if (r) { truthTr = r.trackId; break; } }
        const lostD = link.decisions.filter((d) => d.kind === 'lost' && d.at >= tc - 0.3);
        const info = lostD.map((d) => { const c = d.cands.find((x) => x.id === truthTr); return { at: d.at, n: d.candidates, pass: d.passing, selfRef: d.selfRef && +d.selfRef.toFixed(3), truth: c ? [c.sim, c.neg] : 'notCand', top: d.cands.sort((a, b) => b.sim - a.sim).slice(0, 3).map((x) => [x.id, x.sim, x.neg]) }; });
        console.log(sd.id, 'D', D, 'tc', tc.toFixed(1), cat, codes.join(''), 'truthTr', truthTr, JSON.stringify(link.decisions.filter((d) => d.kind !== 'lost').map((d) => [d.kind, +(d.at ?? 0).toFixed(1), d.trackId ?? d.to])), JSON.stringify(info));
      }
    }
  }
}
for (const [D, t] of Object.entries(tot)) {
  console.log(`D=${D}s 사건 ${t.events} · 맞게 다시 잡음 ${t.ok} · 다른 사람 ${t.wrong} · 못 찾음 ${t.missed}${t.asked ? ` · 물어봄 ${t.asked}` : ''} | 지점 ${t.pts}: 맞음 ${(100 * t.okPts / t.pts).toFixed(1)}% 다른 사람 ${(100 * t.sPts / t.pts).toFixed(1)}% 놓침 ${(100 * t.mPts / t.pts).toFixed(1)}%${t.asks ? ` 물음 ${t.asks}` : ''} | 후보 안 정답 ${t.inC || 0}/${t.lostEv || 0} 닮음 1등 ${t.top1 || 0}${t.eN ? ` | 임베딩 1등 ${t.eTop1 || 0}/${t.eN} (같은 사건 색 1등 ${t.cTop1 || 0})` : ''}${t.texN ? ` | 결합 1등 ${t.texTop1 || 0}/${t.texN} 무늬만 1등 ${t.texOnly1 || 0}/${t.texHas || 0}` : ''}`);
}
