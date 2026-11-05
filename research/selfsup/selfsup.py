# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 영상 한 편 안 자기지도 외형 학습(평가 실험) — 외부 데이터·사전학습 가중치 없이 무작위 초기값에서.
#   같은 줄 = 같은 사람(양성), 같은 순간 함께 보인 다른 줄 = 다른 사람(음성). 함께 보인 적 없는 줄끼리는 모른다(손실 0).
#   평가 대상(SAM 2 정답) 검출은 학습에서 뺀다(새는 것 막기).
# python selfsup.py cropsDir clipId [steps]
import sys, json, time, numpy as np, torch, torch.nn as nn, torch.nn.functional as F
torch.backends.cudnn.benchmark = True
D, clip = sys.argv[1], sys.argv[2]
STEPS = int(sys.argv[3]) if len(sys.argv) > 3 else 600
EMB = int(sys.argv[4]) if len(sys.argv) > 4 else 128
WIDTH = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
SEED = 20261024
torch.manual_seed(SEED); np.random.seed(SEED)
CH, CW = 64, 32
X = np.fromfile(f'{D}/{clip}.bin', dtype=np.uint8).reshape(-1, CH, CW, 3)
idx = np.array(json.load(open(f'{D}/{clip}.idx.json')))
trk = np.array(json.load(open(f'{D}/{clip}.trk.json')))
si = idx[:, 0]; tid = trk[:, 0]; excl = trk[:, 1].astype(bool)
use = (tid >= 0) & ~excl
# 줄별 학습 조각
tracks = {}
for i in np.where(use)[0]: tracks.setdefault(int(tid[i]), []).append(i)
tracks = {k: np.array(v) for k, v in tracks.items() if len(v) >= 2}
tids = sorted(tracks)
present = {}  # 표본 → 그 표본에 학습 조각이 있는 줄
for k in tids:
    for i in tracks[k]: present.setdefault(int(si[i]), set()).add(k)
cannot = {k: set() for k in tids}
for s, ks in present.items():
    for a in ks: cannot[a] |= ks - {a}
dev = 'cuda' if torch.cuda.is_available() else 'cpu'
Xt = torch.from_numpy(X).to(dev)

def c(i, o): return [nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True)]
class Net(nn.Module):
    def __init__(s, w=1.0, emb=128):
        super().__init__()
        a, b, d = int(32 * w), int(64 * w), int(96 * w)
        s.f = nn.Sequential(*c(3, a), *c(a, a), nn.MaxPool2d(2), *c(a, b), *c(b, b), nn.MaxPool2d(2), *c(b, d), *c(d, d), nn.MaxPool2d(2))
        s.fc = nn.Linear(4 * d, emb)
    def forward(s, x):
        f = s.f(x)                                   # N,d,8,4
        f = F.adaptive_avg_pool2d(f, (4, 1)).flatten(1)  # 위아래 4띠(머리·상체·허리·다리)
        return F.normalize(s.fc(f), dim=1)

def prep(xb, train):
    x = xb.permute(0, 3, 1, 2).float() / 255.0
    if train:
        n = x.shape[0]
        x = x * torch.empty(n, 1, 1, 1, device=x.device).uniform_(0.75, 1.25) + torch.empty(n, 1, 1, 1, device=x.device).uniform_(-0.08, 0.08)
        x = x * torch.empty(n, 3, 1, 1, device=x.device).uniform_(0.92, 1.08)
        dx, dy = np.random.randint(-3, 4), np.random.randint(-4, 5)
        x = torch.roll(x, (dy, dx), (2, 3))
        # 지우기(가림 흉내)
        m = torch.rand(n, device=x.device) < 0.3
        if m.any():
            h, w = np.random.randint(10, 30), np.random.randint(6, 16); y0, x0 = np.random.randint(0, CH - h), np.random.randint(0, CW - w)
            x[m, :, y0:y0 + h, x0:x0 + w] = torch.rand(int(m.sum()), 3, 1, 1, device=x.device)
    return (x - 0.45) / 0.25

net = Net(WIDTH, EMB).to(dev)
t0 = time.time()
if len(tids) >= 4 and sum(len(v) for v in cannot.values()) > 0:
    opt = torch.optim.Adam(net.parameters(), 1e-3, weight_decay=5e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, STEPS)
    P, K = 16, 4
    keys = list(present.keys())
    for step in range(STEPS):
        # 같은 순간에 함께 보인 줄들을 묶어 고른다(음성이 배치 안에 있게)
        chosen = []
        while len(chosen) < P:
            s = keys[np.random.randint(len(keys))]
            for k in present[s]:
                if k not in chosen: chosen.append(k)
                if len(chosen) >= P: break
            if len(present) < 3: break
        ids, lab = [], []
        for j, k in enumerate(chosen):
            sel = np.random.choice(tracks[k], K, replace=len(tracks[k]) < K)
            ids.extend(sel); lab.extend([j] * K)
        lab_t = torch.tensor(lab, device=dev)
        e = net(prep(Xt[torch.tensor(np.array(ids), device=dev)], True))
        sim = e @ e.t()
        same = lab_t[:, None] == lab_t[None, :]
        clP = torch.tensor([[kb in cannot[ka] for kb in chosen] for ka in chosen], device=dev)
        cl = clP[lab_t][:, lab_t]
        eye = torch.eye(len(ids), dtype=torch.bool, device=dev)
        pos = torch.where(same & ~eye, sim, torch.full_like(sim, 2.0)).min(1).values
        neg = torch.where(cl, sim, torch.full_like(sim, -2.0)).max(1).values
        ok = cl.any(1)
        if ok.any():
            loss = F.relu(neg[ok] - pos[ok] + 0.3).mean()
            opt.zero_grad(); loss.backward(); opt.step()
        sched.step()
net.eval()
out = []
with torch.no_grad():
    for b in range(0, len(X), 1024):
        out.append(net(prep(Xt[b:b + 1024], False)).cpu().numpy().astype(np.float16))
np.save(f'{D}/{clip}.emb.npy', np.concatenate(out) if out else np.zeros((0, EMB), np.float16))
print(clip, 'tracks', len(tids), 'crops', int(use.sum()), f'{time.time() - t0:.1f}s', flush=True)
