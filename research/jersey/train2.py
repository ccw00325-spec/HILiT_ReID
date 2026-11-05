# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 미리 만든 합성 자료로 학습(GPU). 실제 평가 자르기는 평가 전용.
import sys, json, time, numpy as np, torch, torch.nn.functional as F
from train import Net, real_set, evaluate
def to_input_t(x):  # x: N,32,32,3 float 0~255 → N,2,32,32 (gen.to_input 과 같은 계산)
    lum = 0.299 * x[..., 0] + 0.587 * x[..., 1] + 0.114 * x[..., 2]
    chroma = x.max(-1).values - x.min(-1).values
    o = torch.stack([lum, chroma], 1)
    m = o.mean((2, 3), keepdim=True); sd = o.std((2, 3), keepdim=True, unbiased=False) + 8.0
    return (o - m) / sd
if __name__ == '__main__':
    files = sys.argv[1].split(','); epochs = int(sys.argv[2]); out = sys.argv[3] if len(sys.argv) > 3 else 'jn.pt'
    Xs, Ys = [], []
    for f in files: d = np.load(f); Xs.append(d['X']); Ys.append(d['Y'])
    X = torch.from_numpy(np.concatenate(Xs)); Y = torch.from_numpy(np.concatenate(Ys))
    dev = 'cuda'; net = Net().to(dev)
    steps = epochs * (len(X) // 256)
    opt = torch.optim.AdamW(net.parameters(), 2e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-3, total_steps=steps)
    RX, RY = real_set(); t0 = time.time(); step = 0
    for ep in range(epochs):
        perm = torch.randperm(len(X))
        for b in range(0, len(X) - 255, 256):
            idx = perm[b:b + 256]
            x = X[idx].to(dev).float(); y = Y[idx].to(dev)
            # 작은 이동(±3화소)
            if True:
                dx, dy = np.random.randint(-3, 4, 2)
                x = torch.roll(x, (int(dy), int(dx)), (1, 2))
            x = to_input_t(x)
            ol, o1, o2 = net(x)
            loss = F.cross_entropy(ol, y[:, 0], label_smoothing=0.05)
            m1 = y[:, 0] > 0; m2 = y[:, 0] == 2
            loss = loss + F.cross_entropy(o1[m1], y[m1, 1], label_smoothing=0.05) + F.cross_entropy(o2[m2], y[m2, 2], label_smoothing=0.05)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); step += 1
        rows, _ = evaluate(net, RX, RY, dev)
        print(ep, f'{time.time() - t0:.0f}s loss {loss.item():.3f} | {rows[1]} | {rows[3]}', flush=True)
    torch.save(net.state_dict(), out)
    rows, preds = evaluate(net, RX, RY, dev); print('\n'.join(rows))
    json.dump([[n, p] for n, p in preds], open(out + '.preds.json', 'w'))
