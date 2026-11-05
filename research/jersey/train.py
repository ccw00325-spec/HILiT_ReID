# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 등번호 판독기 학습(합성만) + 실제 평가 자르기로 확인(평가 전용, 학습에 넣지 않음).
import json, sys, time, random
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F
from PIL import Image
import gen

REGION = (0.05, 0.08, 0.95, 0.58)  # x0,y0,x1,y1 (상자 비율)

class Net(nn.Module):
    def __init__(s):
        super().__init__()
        s.c1 = nn.Conv2d(2, 24, 3, padding=1); s.b1 = nn.BatchNorm2d(24)
        s.c2 = nn.Conv2d(24, 48, 3, padding=1); s.b2 = nn.BatchNorm2d(48)
        s.c3 = nn.Conv2d(48, 96, 3, padding=1); s.b3 = nn.BatchNorm2d(96)
        s.c4 = nn.Conv2d(96, 96, 3, padding=1); s.b4 = nn.BatchNorm2d(96)
        s.fc = nn.Linear(96 * 16, 160)
        s.hl = nn.Linear(160, 3); s.h1 = nn.Linear(160, 10); s.h2 = nn.Linear(160, 10)
    def forward(s, x):
        x = F.max_pool2d(F.relu(s.b1(s.c1(x))), 2)
        x = F.max_pool2d(F.relu(s.b2(s.c2(x))), 2)
        x = F.max_pool2d(F.relu(s.b3(s.c3(x))), 2)
        x = F.relu(s.b4(s.c4(x)))
        x = F.dropout(F.relu(s.fc(x.flatten(1))), 0.2, s.training)
        return s.hl(x), s.h1(x), s.h2(x)

class Synth(torch.utils.data.IterableDataset):
    def __iter__(s):
        wi = torch.utils.data.get_worker_info()
        seed = (wi.id if wi else 0) * 7919 + int(time.time() * 1000) % 100000
        random.seed(seed); np.random.seed(seed % (2**32))
        while True:
            x, y = gen.sample()
            yield torch.from_numpy(x), torch.tensor(y)

def real_set():
    meta = json.load(open('real-meta.json')); lab = json.load(open('real-labels.json'))
    xs, ys = [], []
    for i in range(len(meta)):
        im = Image.open(f'real/{i:04d}.png').convert('RGB')
        w, h = im.size
        c = im.crop((int(REGION[0] * w), int(REGION[1] * h), max(int(REGION[0] * w) + 1, int(REGION[2] * w)), max(int(REGION[1] * h) + 1, int(REGION[3] * h))))
        c = c.resize((gen.S, gen.S), Image.BILINEAR)
        xs.append(gen.to_input(np.asarray(c).astype(np.float32))); ys.append(lab[str(i)])
    return torch.from_numpy(np.stack(xs)), ys

def decode(ol, o1, o2):
    pl, p1, p2 = F.softmax(ol, 1), F.softmax(o1, 1), F.softmax(o2, 1)
    out = []
    for k in range(pl.shape[0]):
        best, bp = None, float(pl[k, 0])
        for n in range(100):
            p = float(pl[k, 1] * p1[k, n]) if n < 10 else float(pl[k, 2] * p1[k, n // 10] * p2[k, n % 10])
            if p > bp: bp, best = p, n
        out.append((best, bp))
    return out

def evaluate(net, X, Y, dev):
    net.eval()
    with torch.no_grad(): preds = decode(*[t.cpu() for t in net(X.to(dev))])
    net.train()
    rows = []
    for thr in (0.5, 0.7, 0.8, 0.9, 0.95):
        ok = sum(1 for (n, p), y in zip(preds, Y) if y not in '-?' and n is not None and p >= thr and str(n) == y)
        wrong = sum(1 for (n, p), y in zip(preds, Y) if y not in '-?' and n is not None and p >= thr and str(n) != y)
        fp = sum(1 for (n, p), y in zip(preds, Y) if y == '-' and n is not None and p >= thr)
        fq = sum(1 for (n, p), y in zip(preds, Y) if y == '?' and n is not None and p >= thr)
        rows.append(f'thr{thr}: 맞음 {ok}/{sum(1 for y in Y if y not in "-?")} 틀린번호 {wrong} 없는데읽음 {fp}/{sum(1 for y in Y if y == "-")} 애매에서읽음 {fq}')
    return rows, preds

if __name__ == '__main__':
    steps = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    net = Net().to(dev)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
    dl = torch.utils.data.DataLoader(Synth(), batch_size=128, num_workers=6, persistent_workers=True)
    X, Y = real_set()
    t0 = time.time()
    for step, (x, y) in enumerate(dl):
        if step >= steps: break
        x, y = x.to(dev), y.to(dev)
        ol, o1, o2 = net(x)
        loss = F.cross_entropy(ol, y[:, 0], label_smoothing=0.05)
        m1 = y[:, 0] > 0; m2 = y[:, 0] == 2
        if m1.any(): loss = loss + F.cross_entropy(o1[m1], y[m1, 1], label_smoothing=0.05)
        if m2.any(): loss = loss + F.cross_entropy(o2[m2], y[m2, 2], label_smoothing=0.05)
        opt.zero_grad(); loss.backward(); opt.step(); sched.step()
        if step % 2000 == 0 or step == steps - 1:
            rows, _ = evaluate(net, X, Y, dev)
            print(step, f'{time.time() - t0:.0f}s loss {loss.item():.3f}', '|', rows[1], '|', rows[3], flush=True)
    torch.save(net.state_dict(), 'jn.pt')
    rows, preds = evaluate(net, X, Y, dev)
    print('\n'.join(rows))
    json.dump([[n, p] for n, p in preds], open('real-preds.json', 'w'))
