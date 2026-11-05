#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 기본 검사. 네트워크와 비공개 정본, 비공개 평가 자료 없이 돈다.
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CROP_H, CROP_W, renderPerson, applyCondition } from '../eval/lib/crops.mjs';
import { anchorStats, decideWithAsk, describeParts, normalizeIllumination, partSimilarity, qualityRisk } from '../lab/robust-appearance.mjs';
import { scan } from './detect-copy.mjs';
import { fileFingerprint, isStampable } from './lib/stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const test = (name, fn) => Promise.resolve().then(fn).then((n) => console.log(`통과 ${name}${n ? ` — ${n}` : ''}`), (e) => { failures.push(name); console.log(`실패 ${name}: ${e.message}`); });
const assert = (ok, m) => { if (!ok) throw new Error(m); };
const walk = (d, b = '') => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === '.git' || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name), `${b}${e.name}/`) : [`${b}${e.name}`]));
const all = walk(ROOT);

await test('모든 코드 파일에 표시와 고유 지문이 있다', () => {
  const code = all.filter((p) => p.startsWith('runtime/') && isStampable(p));
  assert(code.length > 40, '파일 수');
  for (const p of code) {
    const head = readFileSync(path.join(ROOT, p), 'utf8').slice(0, 700);
    assert(head.includes(fileFingerprint(p)) && head.includes('ccw00325@gmail.com'), `표시 없음 ${p}`);
  }
  return `${code.length}개`;
});

await test('공개하면 안 되는 것이 없다', () => {
  const NAMES = new RegExp(['HILiT_(?:Research|Editor|Edit_APK|Docs|Admin)', 'hilit_(?:loss|admin|lp)'].join('|'));
  const SECRET = /gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|hf_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sk-(?:ant-)?[A-Za-z0-9_-]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|[a-z0-9]{20}\.supabase\.co/;
  const PC = /\b[A-Za-z]:[\\/](?:GPT|Users|기술결정등)/;
  const FP = new RegExp(['d3f1a7c0', 'e9b24f85'].join(''));
  const CLIPS = /\bfb\d\d\b/;
  for (const p of all) {
    assert(!/\.(onnx|tflite|task|pth|pt|ckpt|bin|safetensors|wasm|apk|aab|mp4|mov|keystore|jks|pem|p12|npy|npz)$/i.test(p), `이진 ${p}`);
    assert(statSync(path.join(ROOT, p)).size < 1024 * 1024, `큰 파일 ${p}`);
    if (p.endsWith('.jpg')) { assert(p === 'assets/hilit-tec-banner.jpg', `사진 ${p}`); continue; }
    const t = readFileSync(path.join(ROOT, p), 'utf8');
    assert(!NAMES.test(t), `비공개 이름 ${p}`);
    assert(!SECRET.test(t), `비밀값 ${p}`);
    assert(!PC.test(t), `내 PC 경로 ${p}`);
    assert(!FP.test(t), `제품 지문 ${p}`);
    if (p.startsWith('eval/') || p.startsWith('research/')) assert(!CLIPS.test(t), `영상 이름 ${p}`);
  }
  return `${all.length}개`;
});

await test('조명 보정이 밝기와 색을 되돌린다', () => {
  const src = renderPerson('target', 11);
  const dark = applyCondition(src, 'low_light', 11);
  const mean = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; return s / (a.length / 4); };
  assert(mean(dark) < mean(src) * 0.6, '조건이 어둡지 않습니다');
  assert(Math.abs(mean(normalizeIllumination(dark)) - 110) < 12, `밝기 ${mean(normalizeIllumination(dark))}`);
  assert(normalizeIllumination(new Uint8ClampedArray(400)).every((v) => v === 0), '검은 조각은 그대로 둡니다');
});

await test('위아래 비교가 가려진 쪽을 드러낸다', () => {
  const a = describeParts(normalizeIllumination(renderPerson('target', 21)), CROP_W, CROP_H);
  const b = describeParts(normalizeIllumination(applyCondition(renderPerson('target', 22), 'upper_occluded', 22)), CROP_W, CROP_H);
  const r = partSimilarity(a, b);
  assert(r.lower > r.upper, `위 ${r.upper} 아래 ${r.lower}`);
  assert(r.split > 0.1, `차이 ${r.split}`);
});

await test('품질이 나쁘면 위험 값이 오른다', () => {
  const src = renderPerson('target', 31);
  const s = anchorStats(src, CROP_W, CROP_H);
  assert(qualityRisk(applyCondition(src, 'blur', 31), CROP_W, CROP_H, s).risk > 0.3, '번짐');
  assert(qualityRisk(applyCondition(src, 'low_light', 31), CROP_W, CROP_H, s).risk > 0.3, '어두움');
  assert(qualityRisk(src, CROP_W, CROP_H, s).risk < 0.1, '보통');
});

await test('세 갈래 판단: 애매하면 묻는다', () => {
  assert(decideWithAsk({ self: 0.9, other: 0.3 }) === 'accept', '확실한 대상');
  assert(decideWithAsk({ self: 0.6, other: 0.9 }) === 'reject', '다른 사람');
  assert(decideWithAsk({ self: 0.8, other: 0.79 }) === 'ask', '같은 유니폼');
  assert(decideWithAsk({ self: 0.8, other: 0.75, risk: 1 }) === 'ask', '품질 나쁨은 차이를 더 요구');
  assert(decideWithAsk({ self: 0.8, other: 0.7, risk: 0 }) === 'accept', '품질 좋으면 수락');
  assert(decideWithAsk({ self: 0.8, split: 0.5 }) === 'ask', '위아래 엇갈림');
  assert(decideWithAsk({ self: 0.3 }) === 'ask', '낮은 점수는 단정하지 않음');
});

const tmp = mkdtempSync(path.join(os.tmpdir(), 'hilit-reid-test-'));
try {
  await test('표시를 지운 사본도 찾고 무관한 코드는 넘긴다', async () => {
    const src = readFileSync(path.join(ROOT, 'runtime/apps/web/public/tracking/hilit-appearance.js'), 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\b(const|let)\s+([a-zA-Z_]\w*)/g, (m, k, n) => `${k} q_${n}`);
    const f = path.join(tmp, 'x.js');
    writeFileSync(f, stripped);
    const hit = await scan([f]);
    assert(hit.marks.length === 0 && hit.code.some((c) => c.source.endsWith('hilit-appearance.js')), '못 찾음');
    assert(!(await scan([path.join(ROOT, 'tools/lib/winnow.mjs')])).found, '오탐');
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

await test('라이선스 문서가 맞다', () => {
  const l = readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  for (const need of ['LicenseRef-HILiT-NCA-1.1', 'ccw00325@gmail.com', 'HILiT ReID', 'HILiT_ReID', '조찬우', '서면 승인']) assert(l.includes(need), need);
});

console.log(failures.length ? `실패 ${failures.length}건` : '전체 통과');
process.exit(failures.length ? 1 : 0);
