// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 외형 비교가 조명 변화, 번짐, 가림, 같은 유니폼에서 얼마나 흔들리는지 잽니다. 합성 조각이며 실제 영상의 정확도가 아닙니다.
//   npm run robust                 표로 출력
//   npm run robust -- --check      기준(eval/baseline.json)보다 나빠지면 실패
//   npm run robust -- --write-baseline
//
// A = 제품 판단(decideAppearanceMatch), B = lab 후보(조명 보정 + 위아래 비교 + 품질에 따른 묻기)
// 값 고르기와 채점의 시드를 나눠 두었습니다. 채점 시드는 값을 고를 때 쓰지 않습니다.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorStats, decideWithAsk, describeParts, GATE_DEFAULT, normalizeIllumination, partSimilarity, qualityRisk } from '../lab/robust-appearance.mjs';
import { appearanceSimilarity, decideAppearanceMatch, describeRgba } from '../runtime/apps/web/public/tracking/hilit-appearance.js';
import { applyCondition, CONDITIONS, CROP_H, CROP_W, IDENTITIES, renderPerson } from './lib/crops.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEV_SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);
export const TEST_SEEDS = Array.from({ length: 200 }, (_, i) => 5000 + i);

function view(identity, condition, seed) {
  return applyCondition(renderPerson(identity, seed), condition, seed);
}

/** withTwin: 같은 유니폼의 "다른 사람" 기준이 영상 안에 이미 있는 경우. false 면 비슷한 옷과 다른 옷만 비교합니다. */
export function score(seeds, gate = GATE_DEFAULT, withTwin = true) {
  const out = {};
  for (const condition of Object.keys(CONDITIONS)) {
    const row = { A: { accepted: 0, wrong: 0, asked: 0 }, B: { accepted: 0, wrong: 0, asked: 0 }, n: { self: 0, other: 0 } };
    for (const seed of seeds) {
      // 사용자가 고른 대상의 기준과, 영상 안에서 이미 "다른 사람"으로 확인된 같은 유니폼의 기준
      const anchorRgba = renderPerson('target', seed + 100000);
      const twinRgba = renderPerson('twin', seed + 200000);
      const anchorRaw = describeRgba(anchorRgba, CROP_W, CROP_H);
      const twinRaw = describeRgba(twinRgba, CROP_W, CROP_H);
      const anchorParts = describeParts(normalizeIllumination(anchorRgba), CROP_W, CROP_H);
      const twinParts = describeParts(normalizeIllumination(twinRgba), CROP_W, CROP_H);
      const stats = anchorStats(anchorRgba, CROP_W, CROP_H);
      for (const who of Object.keys(IDENTITIES)) {
        if (!withTwin && who === 'twin') continue;
        const rgba = view(who, condition, seed);
        const raw = describeRgba(rgba, CROP_W, CROP_H);
        const isTarget = who === 'target';
        const a = decideAppearanceMatch({ self: appearanceSimilarity(anchorRaw, raw), other: withTwin ? appearanceSimilarity(twinRaw, raw) : null, samples: raw.samples, trust: 1 });
        const parts = describeParts(normalizeIllumination(rgba), CROP_W, CROP_H);
        const toSelf = partSimilarity(anchorParts, parts);
        const toTwin = partSimilarity(twinParts, parts);
        const b = decideWithAsk({ self: toSelf.best, other: withTwin ? toTwin.best : null, risk: qualityRisk(rgba, CROP_W, CROP_H, stats).risk, split: toSelf.split }, gate);
        if (isTarget) row.n.self += 1; else row.n.other += 1;
        const tally = (bucket, verdict) => {
          if (verdict === 'accept') { if (isTarget) bucket.accepted += 1; else bucket.wrong += 1; }
          else if (verdict === 'ask' || verdict === 'hold') bucket.asked += 1;
        };
        tally(row.A, a);
        tally(row.B, b);
      }
    }
    const total = row.n.self + row.n.other;
    const pct = (x, n) => +(x / n * 100).toFixed(1);
    out[condition] = {
      A: { 맞는사람수락: pct(row.A.accepted, row.n.self), 다른사람수락: pct(row.A.wrong, row.n.other), 묻기: pct(row.A.asked, total) },
      B: { 맞는사람수락: pct(row.B.accepted, row.n.self), 다른사람수락: pct(row.B.wrong, row.n.other), 묻기: pct(row.B.asked, total) },
    };
  }
  return out;
}

export function report(table) {
  const lines = ['| 조건 | 판 | 맞는 사람 수락 % | 다른 사람 수락 % | 보류·묻기 % |', '|---|---|---:|---:|---:|'];
  for (const [k, row] of Object.entries(table)) for (const v of ['A', 'B']) lines.push(`| ${CONDITIONS[k]} | ${v} | ${row[v].맞는사람수락} | ${row[v].다른사람수락} | ${row[v].묻기} |`);
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const table = score(TEST_SEEDS);
  const open = score(TEST_SEEDS, GATE_DEFAULT, false);
  const text = `### 같은 유니폼의 다른 사람이 영상 안에 있을 때\n\n${report(table)}\n\n### 같은 유니폼이 없을 때\n\n${report(open)}`;
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 외형 비교 강건성 (합성)\n\n${text}\n`);
  const file = path.join(ROOT, 'eval/baseline.json');
  if (args.includes('--write-baseline')) {
    writeFileSync(file, `${JSON.stringify({ note: 'Synthetic regression baseline. Not real-footage accuracy.', table }, null, 2)}\n`);
    console.log('기준값을 썼습니다.');
  }
  if (args.includes('--check')) {
    const base = JSON.parse(readFileSync(file, 'utf8')).table;
    const worse = [];
    for (const [k, row] of Object.entries(base)) {
      for (const v of ['A', 'B']) {
        if (table[k][v].다른사람수락 > row[v].다른사람수락 + 3) worse.push(`${k}/${v} 다른 사람 수락 ${row[v].다른사람수락}→${table[k][v].다른사람수락}`);
        if (table[k][v].맞는사람수락 < row[v].맞는사람수락 - 3) worse.push(`${k}/${v} 맞는 사람 수락 ${row[v].맞는사람수락}→${table[k][v].맞는사람수락}`);
      }
    }
    if (worse.length) { console.error(`기준보다 나빠졌습니다:\n  ${worse.join('\n  ')}`); process.exit(1); }
    console.log('기준값 이내입니다.');
  }
}
