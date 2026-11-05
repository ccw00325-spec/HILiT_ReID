// SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
// 합성 사람 조각(48×96)과 가혹 조건. 실제 사람 사진을 쓰지 않습니다. 수치는 실제 영상의 정확도가 아닙니다.
export const CROP_W = 48;
export const CROP_H = 96;

export const IDENTITIES = {
  target: { shirt: [205, 45, 45], pants: [30, 30, 90], stripe: 0 },
  twin: { shirt: [205, 45, 45], pants: [30, 30, 90], stripe: 0 }, // 같은 유니폼
  similar: { shirt: [190, 80, 40], pants: [40, 40, 80], stripe: 0 }, // 비슷한 옷
  different: { shirt: [40, 150, 200], pants: [210, 210, 210], stripe: 3 },
};

export const CONDITIONS = {
  normal: '보통',
  low_light: '조명 급감',
  bright: '조명 급증',
  blur: '심한 번짐',
  upper_occluded: '상반신 가림',
  lower_occluded: '하반신 가림',
  side_occluded: '옆 가림',
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderPerson(identity, seed, { w = CROP_W, h = CROP_H } = {}) {
  const r = rng(seed);
  const id = IDENTITIES[identity];
  const data = new Uint8ClampedArray(w * h * 4);
  const bg = [70 + r() * 60, 90 + r() * 60, 70 + r() * 70];
  const jitter = (c, s) => c.map((v) => v + (r() - 0.5) * s);
  const shirt = jitter(id.shirt, identity === 'twin' ? 14 : 18);
  const pants = jitter(id.pants, 14);
  const skin = jitter([225, 185, 155], 20);
  const cx = w / 2 + (r() - 0.5) * 6;
  const halfW = w * (0.28 + r() * 0.05);
  const headEnd = h * (0.15 + r() * 0.02), waist = h * (0.56 + r() * 0.04);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.abs(x - cx);
      let c = bg;
      if (y < headEnd) { if (dx < halfW * 0.55) c = skin; }
      else if (y < waist) { if (dx < halfW) c = id.stripe && Math.floor(y / 6) % id.stripe === 0 ? shirt.map((v) => v * 0.65) : shirt; }
      else if (dx < halfW && dx > 1) c = pants;
      const shade = 0.9 + 0.1 * Math.sin((x / w) * Math.PI);
      const n = (r() - 0.5) * 8;
      const p = (y * w + x) * 4;
      data[p] = c[0] * shade + n;
      data[p + 1] = c[1] * shade + n;
      data[p + 2] = c[2] * shade + n;
      data[p + 3] = 255;
    }
  }
  return data;
}

export function applyCondition(source, condition, seed, { w = CROP_W, h = CROP_H } = {}) {
  const r = rng(seed * 17 + condition.length);
  const data = Uint8ClampedArray.from(source);
  const paint = (test) => {
    const c = [20 + r() * 60, 20 + r() * 60, 20 + r() * 60];
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) if (test(x, y)) { const p = (y * w + x) * 4; data[p] = c[0]; data[p + 1] = c[1]; data[p + 2] = c[2]; }
  };
  switch (condition) {
    case 'low_light':
    case 'bright': {
      const gain = condition === 'low_light' ? 0.3 + r() * 0.1 : 1.5 + r() * 0.3;
      const tint = [1 + (r() - 0.5) * 0.3, 1 + (r() - 0.5) * 0.2, 1 + (r() - 0.5) * 0.4];
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c += 1) data[i + c] = data[i + c] * gain * tint[c];
      break;
    }
    case 'blur': {
      const R = 4;
      const copy = Uint8ClampedArray.from(data);
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        for (let c = 0; c < 3; c += 1) {
          let s = 0, n = 0;
          for (let k = -R; k <= R; k += 1) {
            const yy = y + Math.round(k * 0.6), xx = x + k;
            if (xx >= 0 && xx < w && yy >= 0 && yy < h) { s += copy[(yy * w + xx) * 4 + c]; n += 1; }
          }
          data[(y * w + x) * 4 + c] = s / n;
        }
      }
      break;
    }
    case 'upper_occluded': paint((x, y) => y < h * 0.5); break;
    case 'lower_occluded': paint((x, y) => y >= h * 0.5); break;
    case 'side_occluded': paint((x) => x < w * 0.45); break;
    default:
  }
  return data;
}
