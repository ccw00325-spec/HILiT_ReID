// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 실험: 조명 변화와 가림에 덜 흔들리는 외형 비교, 그리고 품질에 따라 "묻기"를 늘리는 판단. 제품에 적용되어 있지 않습니다.
// 외형 점수는 고른 대상이 맞는지 보는 보조 근거입니다. 신원 확률이 아니고, 사람을 식별하거나 저장하는 데 쓰지 않습니다.
import { appearanceSimilarity, describeRgba } from '../runtime/apps/web/public/tracking/hilit-appearance.js';

/** 회색 세계 가정으로 조명 색과 전체 밝기를 맞춥니다. 조각 안의 값만 쓰고 저장하지 않습니다. */
export function normalizeIllumination(rgba, targetLuma = 110) {
  let r = 0, g = 0, b = 0;
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) { r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
  r /= n; g /= n; b /= n;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  if (luma < 3) return Uint8ClampedArray.from(rgba);
  const out = new Uint8ClampedArray(rgba.length);
  const gr = (luma / Math.max(r, 1)) * (targetLuma / luma), gg = (luma / Math.max(g, 1)) * (targetLuma / luma), gb = (luma / Math.max(b, 1)) * (targetLuma / luma);
  for (let i = 0; i < rgba.length; i += 4) { out[i] = rgba[i] * gr; out[i + 1] = rgba[i + 1] * gg; out[i + 2] = rgba[i + 2] * gb; out[i + 3] = 255; }
  return out;
}

function region(rgba, w, y0, y1) {
  return rgba.subarray(y0 * w * 4, y1 * w * 4);
}

/** 위아래를 따로 비교합니다. 한쪽이 가려져도 보이는 쪽 근거를 남기려는 것입니다. */
export function describeParts(rgba, w, h) {
  const half = Math.floor(h / 2);
  return {
    all: describeRgba(rgba, w, h),
    upper: describeRgba(region(rgba, w, 0, half), w, half),
    lower: describeRgba(region(rgba, w, half, h), w, h - half),
  };
}

export function partSimilarity(a, b) {
  const all = appearanceSimilarity(a.all, b.all) ?? 0;
  const upper = appearanceSimilarity(a.upper, b.upper) ?? 0;
  const lower = appearanceSimilarity(a.lower, b.lower) ?? 0;
  return { all, upper, lower, best: Math.max(all, upper, lower), split: Math.abs(upper - lower) };
}

/** 조각 품질: 기준 대비 밝기 차이와 선명도. 나쁠수록 1 에 가깝습니다. */
export function qualityRisk(rgba, w, h, anchor) {
  let luma = 0, edge = 0, count = 0;
  const L = (x, y) => { const p = (y * w + x) * 4; return 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]; };
  for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
    const c = L(x, y);
    luma += c;
    edge += Math.abs(4 * c - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1));
    count += 1;
  }
  luma /= count;
  edge /= count;
  const exposure = Math.min(1, Math.abs(Math.log2(Math.max(luma, 2) / Math.max(anchor.luma, 2))));
  const blur = Math.min(1, Math.max(0, 1 - edge / Math.max(anchor.edge, 1e-3)));
  return { luma, edge, exposure, blur, risk: Math.max(exposure, blur) };
}

export function anchorStats(rgba, w, h) {
  const q = qualityRisk(rgba, w, h, { luma: 1, edge: 1 });
  return { luma: q.luma, edge: q.edge };
}

export const GATE_DEFAULT = { accept: 0.62, margin: 0.03, riskMargin: 0.1, rejectMargin: 0.08, splitAsk: 0.3 };

/**
 * 세 갈래 판단. accept: 대상이 맞아 보임, reject: 다른 사람에 더 가까움, ask: 사용자에게 묻기.
 * 품질이 나쁘거나 위아래 결과가 엇갈리면 확신을 낮춰 더 자주 묻습니다.
 */
export function decideWithAsk({ self, other = null, risk = 0, split = 0 }, gate = GATE_DEFAULT) {
  const margin = gate.margin + gate.riskMargin * risk;
  if (other !== null && other > self + gate.rejectMargin) return 'reject';
  if (other !== null && self - other < margin) return 'ask';
  if (split > gate.splitAsk) return 'ask';
  if (self >= gate.accept + gate.riskMargin * risk * 0.5) return 'accept';
  return 'ask';
}
