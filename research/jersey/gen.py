# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 등번호 판독 학습용 합성 상체 그림 — 실제 사람·영상은 쓰지 않는다.
# 숫자: 절차로 그린 블록 숫자 + 허용 글꼴(DejaVu: Bitstream Vera 라이선스, STIX·Inter: SIL OFL 1.1).
# 출력: 2채널(밝기·채도) 32x32, 정답 (len 0/1/2, d1, d2).
import math, random, io
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import os
DEPS = os.environ['RESEARCH_DEPS']  # 사용 허가가 분명한 글꼴이 있는 폴더
MPL = DEPS + '/sam2-venv/Lib/site-packages/matplotlib/mpl-data/fonts/ttf/'
FONT_FILES = [MPL + 'DejaVuSans-Bold.ttf', MPL + 'DejaVuSansMono-Bold.ttf', MPL + 'DejaVuSerif-Bold.ttf', MPL + 'STIXGeneralBol.ttf',
              DEPS + '/sam2-src/demo/frontend/public/fonts/Inter-VariableFont_opsz,wght.ttf']
S = 32
R = 96  # 그리는 크기
_fonts = {}

def font(i, size):
    k = (i, size)
    if k not in _fonts:
        f = ImageFont.truetype(FONT_FILES[i], size)
        if 'Inter' in FONT_FILES[i]:
            try: f.set_variation_by_axes([14, random.choice([700, 800, 900])])
            except Exception: pass
        _fonts[k] = f
    return _fonts[k]

# 블록 숫자: 3x5 칸 사각형
BLOCK = {
    '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
    '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
    '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '010', '010'], '8': ['111', '101', '111', '101', '111'],
    '9': ['111', '101', '111', '001', '111'],
}

COLORS = [(245, 245, 245), (20, 20, 25), (200, 30, 35), (230, 110, 30), (240, 200, 40), (25, 40, 110), (180, 150, 70), (40, 120, 60), (120, 30, 40), (90, 90, 95)]

def jitter(c, a=25):
    return tuple(int(max(0, min(255, v + random.randint(-a, a)))) for v in c)

def contrast_ok(a, b):
    la = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]
    lb = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2]
    ca = max(a) - min(a); cb = max(b) - min(b)
    return abs(la - lb) > 60 or abs(ca - cb) > 90

def draw_digit_block(d, w, h, color, outline):
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    g = BLOCK[d]; cw, ch = w / 3, h / 5
    thick = random.uniform(0.85, 1.0)
    for r in range(5):
        for c in range(3):
            if g[r][c] == '1':
                x0, y0 = c * cw, r * ch
                pad = (1 - thick) * cw / 2
                if outline: dr.rectangle([x0 - 2, y0 - 2, x0 + cw + 1, y0 + ch + 1], fill=outline + (255,))
    for r in range(5):
        for c in range(3):
            if g[r][c] == '1':
                x0, y0 = c * cw, r * ch
                dr.rectangle([x0, y0, x0 + cw - 1, y0 + ch - 1], fill=color + (255,))
    if random.random() < 0.5: im = im.filter(ImageFilter.GaussianBlur(random.uniform(0.5, 1.5)))
    return im

SKEL = {
    '0': [[(0.2, 0), (0.8, 0), (1, 0.15), (1, 0.85), (0.8, 1), (0.2, 1), (0, 0.85), (0, 0.15), (0.2, 0)]],
    '1': [[(0.2, 0.18), (0.55, 0), (0.55, 1)]],
    '2': [[(0, 0.15), (0.2, 0), (0.8, 0), (1, 0.15), (1, 0.4), (0, 1), (1, 1)]],
    '3': [[(0, 0), (1, 0), (1, 0.4), (0.8, 0.5), (0.3, 0.5)], [(0.8, 0.5), (1, 0.6), (1, 0.85), (0.8, 1), (0, 1)]],
    '4': [[(0.75, 1), (0.75, 0), (0, 0.65), (1, 0.65)]],
    '5': [[(1, 0), (0, 0), (0, 0.45), (0.8, 0.45), (1, 0.6), (1, 0.85), (0.8, 1), (0, 1)]],
    '6': [[(0.9, 0), (0.2, 0), (0, 0.2), (0, 0.85), (0.2, 1), (0.8, 1), (1, 0.85), (1, 0.6), (0.8, 0.45), (0, 0.45)]],
    '7': [[(0, 0), (1, 0), (0.35, 1)]],
    '8': [[(0.2, 0), (0.8, 0), (1, 0.12), (1, 0.35), (0.8, 0.47), (0.2, 0.47), (0, 0.35), (0, 0.12), (0.2, 0)],
          [(0.2, 0.47), (0, 0.6), (0, 0.88), (0.2, 1), (0.8, 1), (1, 0.88), (1, 0.6), (0.8, 0.47)]],
    '9': [[(0.1, 1), (0.8, 1), (1, 0.8), (1, 0.15), (0.8, 0), (0.2, 0), (0, 0.15), (0, 0.4), (0.2, 0.55), (1, 0.55)]],
}

def draw_digit_stroke(d, w, h, color, outline):
    sw = h * random.uniform(0.16, 0.3); pad = sw
    im = Image.new('RGBA', (int(w + 2 * pad + 4), int(h + 2 * pad + 4)), (0, 0, 0, 0)); dr = ImageDraw.Draw(im)
    j = lambda v: v + random.uniform(-0.04, 0.04)
    polys = [[(pad + 2 + j(x) * w, pad + 2 + j(y) * h) for x, y in pl] for pl in SKEL[d]]
    joint = random.choice([None, 'curve'])
    if d == '1' and random.random() < 0.5: polys = [[(pad + 2 + 0.55 * w, pad + 2), (pad + 2 + 0.55 * w, pad + 2 + h)]]
    if outline:
        for pl in polys: dr.line(pl, fill=outline + (255,), width=int(sw + random.uniform(3, 7)), joint=joint)
    for pl in polys: dr.line(pl, fill=color + (255,), width=int(sw), joint=joint)
    return im

def draw_number(txt, color, outline):
    """숫자 문자열을 RGBA 그림으로(대략 키 60화소)."""
    H = 60
    r = random.random()
    if r < 0.4:
        w = int(H * random.uniform(0.4, 0.62)); gap = int(H * random.uniform(0.0, 0.1))
        parts = [draw_digit_stroke(ch, w, H, color, outline) for ch in txt]
        im = Image.new('RGBA', (sum(p.width for p in parts) + gap * (len(parts) - 1) + 4, max(p.height for p in parts) + 4), (0, 0, 0, 0))
        x = 2
        for p in parts: im.alpha_composite(p, (x, 2)); x += p.width + gap - int(p.width * 0.15)
        return im
    if r < 0.55:
        w = int(H * random.uniform(0.45, 0.7)); gap = int(H * random.uniform(0.05, 0.15))
        parts = [draw_digit_block(ch, w, H, color, outline) for ch in txt]
        im = Image.new('RGBA', (len(parts) * w + (len(parts) - 1) * gap + 6, H + 6), (0, 0, 0, 0))
        for k, p in enumerate(parts): im.alpha_composite(p, (3 + k * (w + gap), 3))
        return im
    f = font(random.randrange(len(FONT_FILES)), int(H * 1.25))
    bbox = f.getbbox(txt)
    im = Image.new('RGBA', (bbox[2] - bbox[0] + 16, bbox[3] - bbox[1] + 16), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    sw = random.choice([0, 0, 2, 3, 4]) if outline else 0
    dr.text((8 - bbox[0], 8 - bbox[1]), txt, font=f, fill=color + (255,), stroke_width=sw, stroke_fill=(outline or color) + (255,))
    if random.random() < 0.3:  # 가로로 늘이거나 줄임(글꼴 폭 다양화)
        im = im.resize((max(4, int(im.width * random.uniform(0.7, 1.4))), im.height))
    return im

def torso_scene(jersey, numtxt):
    bgc = random.choice([(70, 130, 60), (90, 150, 70), (60, 110, 50), (150, 140, 120), (120, 120, 125), (200, 190, 170), (40, 40, 40), (170, 90, 70)])
    im = Image.new('RGB', (R, R), jitter(bgc, 30)); dr = ImageDraw.Draw(im)
    # 배경 무늬(선·흐림)
    for _ in range(random.randint(0, 3)):
        y = random.randint(0, R); dr.line([0, y, R, y + random.randint(-20, 20)], fill=jitter((230, 230, 230), 20), width=random.randint(1, 3))
    # 몸통: 가운데 사다리꼴
    cxm = R / 2 + random.uniform(-10, 10)
    tw = R * random.uniform(0.5, 0.85); top = random.uniform(0, 16)
    sh = random.uniform(0.05, 0.18) * R
    body = [(cxm - tw / 2 - sh, top + 10), (cxm - tw / 2 + 4, top + 4), (cxm + tw / 2 - 4, top + 4), (cxm + tw / 2 + sh, top + 10),
            (cxm + tw / 2 + random.uniform(-6, 3), R + 5), (cxm - tw / 2 - random.uniform(-6, 3), R + 5)]
    dr.polygon(body, fill=jersey)
    # 어깨 받침·팔
    if random.random() < 0.8:
        for side in (-1, 1):
            ax = cxm + side * (tw / 2 + random.uniform(-4, 8))
            aw = random.uniform(7, 16)
            armc = jersey if random.random() < 0.6 else jitter(random.choice(COLORS), 20)
            dr.rectangle([ax - aw / 2, top + 10, ax + aw / 2, R], fill=armc)
    # 머리·헬멧
    if random.random() < 0.7:
        hr = random.uniform(9, 16); hy = top - hr * random.uniform(0.1, 0.7)
        dr.ellipse([cxm - hr, hy - hr, cxm + hr, hy + hr], fill=jitter(random.choice([(30, 30, 30), (230, 230, 230), (200, 40, 30), (230, 110, 40), (30, 50, 120), (190, 160, 120)]), 20))
    # 줄무늬(심판·소매 줄)
    if random.random() < 0.12:
        sc = random.choice([(250, 250, 250), (15, 15, 15)]); step = random.randint(6, 12)
        for x in range(0, R, step * 2): dr.rectangle([x, top + 8, x + step - 1, R], fill=sc)
    # 옷 접힘 음영
    arr = np.asarray(im).astype(np.float32)
    if random.random() < 0.7:
        fx = random.uniform(0.05, 0.25); ph = random.uniform(0, 6.28)
        xs = np.arange(R)[None, :, None]; ys = np.arange(R)[:, None, None]
        arr *= 1 + random.uniform(0.05, 0.25) * np.sin(xs * fx + ys * fx * random.uniform(-0.5, 0.5) + ph)
    arr *= np.linspace(random.uniform(0.6, 1.2), random.uniform(0.6, 1.2), R)[:, None, None]
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    # 이름 글자줄(숫자 위 작은 글자)
    if random.random() < 0.2:
        letters = ''.join(random.choice('ABCDEFGHJKLMNPRSTUVWYZ ') for _ in range(random.randint(3, 8)))
        f = font(random.randrange(len(FONT_FILES)), random.randint(8, 14))
        ImageDraw.Draw(im).text((cxm - random.uniform(10, 25), top + random.uniform(12, 20)), letters, font=f, fill=jitter(random.choice(COLORS), 20))
    # 숫자
    if numtxt:
        ncol = None
        for _ in range(20):
            c = jitter(random.choice(COLORS), 20)
            if contrast_ok(c, jersey): ncol = c; break
        ncol = ncol or ((250, 250, 250) if sum(jersey) < 380 else (15, 15, 15))
        outline = jitter(random.choice(COLORS), 20) if random.random() < 0.35 else None
        num = draw_number(numtxt, ncol, outline)
        nh = R * random.uniform(0.3, 0.55)
        nw = num.width * nh / num.height * random.choice([random.uniform(0.85, 1.15), random.uniform(0.85, 1.15), random.uniform(0.55, 0.85)])  # 옆으로 돌면 좁아진다
        nw = min(nw, tw * 1.05)
        num = num.resize((max(4, int(nw)), max(4, int(nh))), Image.BILINEAR)
        num = num.rotate(random.uniform(-12, 12), resample=Image.BILINEAR, expand=True)
        # 휜 옷: 세로 줄마다 조금씩 위아래로
        if random.random() < 0.5:
            a = np.asarray(num).copy(); amp = random.uniform(0.5, 3); fr = random.uniform(0.05, 0.2)
            for x in range(a.shape[1]): a[:, x] = np.roll(a[:, x], int(amp * math.sin(x * fr)), axis=0)
            num = Image.fromarray(a)
        px = int(cxm - num.width / 2 + random.uniform(-0.08, 0.08) * tw)
        py = int(R * random.uniform(0.18, 0.42))
        im.paste(num, (px, py), num)
    # 가림(팔·다른 사람)
    if random.random() < 0.2:
        dr = ImageDraw.Draw(im)
        x = random.uniform(0, R); w = random.uniform(6, 20)
        dr.rectangle([x, random.uniform(0, R / 2), x + w, R], fill=jitter(random.choice(COLORS + [jersey]), 20))
    return im

def degrade(im):
    # 사람 키 40~200 화소에서 상체가 차지하는 크기로 줄였다 다시 32로
    s = random.choice([random.uniform(20, 32), random.uniform(28, 48), random.uniform(40, 70)])
    w = max(6, int(s * random.uniform(0.75, 1.3))); h = max(6, int(s))
    im = im.resize((w, h), random.choice([Image.BILINEAR, Image.BICUBIC, Image.BOX]))
    if random.random() < 0.3: im = im.filter(ImageFilter.GaussianBlur(random.uniform(0.3, 0.8)))
    if random.random() < 0.6:
        b = io.BytesIO(); im.save(b, 'JPEG', quality=random.randint(25, 85)); im = Image.open(b).convert('RGB')
    im = im.resize((S, S), Image.BILINEAR)
    if random.random() < 0.7:  # 영상 압축의 색 해상도 반감(4:2:0)
        y, cb, cr = im.convert('YCbCr').split()
        f = random.choice([2, 2, 3])
        cb = cb.resize((S // f, S // f), Image.BILINEAR).resize((S, S), Image.BILINEAR); cr = cr.resize((S // f, S // f), Image.BILINEAR).resize((S, S), Image.BILINEAR)
        im = Image.merge('YCbCr', (y, cb, cr)).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    a = a * random.uniform(0.7, 1.3) + random.uniform(-30, 30)
    a += np.random.normal(0, random.uniform(0, 4), a.shape)
    return np.clip(a, 0, 255)

def to_input(rgb):
    """rgb float(HxWx3, 0~255) → 2채널(밝기·채도) 정규화. JS 쪽과 같은 계산."""
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    chroma = rgb.max(-1) - rgb.min(-1)
    out = np.stack([lum, chroma]).astype(np.float32)
    for c in range(2):
        m = out[c].mean(); sd = out[c].std() + 8.0
        out[c] = (out[c] - m) / sd
    return out

def sample():
    r = random.random()
    if r < 0.3: n = None
    elif r < 0.45: n = random.randint(0, 9)
    else: n = random.randint(10, 99)
    txt = '' if n is None else str(n)
    jersey = jitter(random.choice(COLORS), 30)
    im = torso_scene(jersey, txt)
    x = to_input(degrade(im))
    if n is None: y = (0, 0, 0)
    elif n < 10: y = (1, n, 0)
    else: y = (2, n // 10, n % 10)
    return x, y

if __name__ == '__main__':
    random.seed(1); np.random.seed(1)
    tiles = []
    for i in range(48):
        r = random.random(); n = None if r < 0.3 else random.randint(0, 99)
        jersey = jitter(random.choice(COLORS), 30)
        tiles.append(Image.fromarray(degrade(torso_scene(jersey, '' if n is None else str(n))).astype(np.uint8)).resize((96, 96), Image.NEAREST))
    sheet = Image.new('RGB', (96 * 8, 96 * 6))
    for i, t in enumerate(tiles): sheet.paste(t, ((i % 8) * 96, (i // 8) * 96))
    sheet.save('synth-preview.png')
