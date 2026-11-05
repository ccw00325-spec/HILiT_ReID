# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
# 학습한 판독기를 JS 용 JSON 으로(배치정규화 접어 넣고 텐서별 int8 양자화).
import sys, json, base64, hashlib, numpy as np, torch
from train import Net
net = Net(); net.load_state_dict(torch.load(sys.argv[1], map_location='cpu')); net.eval()
def fold(conv, bn):
    w = conv.weight.detach().numpy(); b = conv.bias.detach().numpy()
    g = bn.weight.detach().numpy(); be = bn.bias.detach().numpy(); m = bn.running_mean.numpy(); v = bn.running_var.numpy()
    s = g / np.sqrt(v + bn.eps)
    return w * s[:, None, None, None], (b - m) * s + be
T = {}
for i, (c, b) in enumerate([(net.c1, net.b1), (net.c2, net.b2), (net.c3, net.b3), (net.c4, net.b4)], 1):
    w, bb = fold(c, b); T[f'c{i}w'] = w; T[f'c{i}b'] = bb
for n in ['fc', 'hl', 'h1', 'h2']:
    l = getattr(net, n); T[n + 'w'] = l.weight.detach().numpy(); T[n + 'b'] = l.bias.detach().numpy()
out = {'version': 'jersey-number-v1', 'input': {'size': 32, 'channels': ['luma', 'chroma'], 'region': [0.05, 0.08, 0.95, 0.58]}, 'tensors': {}}
for k, a in T.items():
    a = a.astype(np.float32).ravel(); sc = float(np.abs(a).max() / 127) or 1e-8
    q = np.clip(np.round(a / sc), -127, 127).astype(np.int8)
    out['tensors'][k] = {'shape': list(T[k].shape), 'scale': sc, 'q': base64.b64encode(q.tobytes()).decode()}
s = json.dumps(out, separators=(',', ':'))
open(sys.argv[2], 'w').write(s)
print(len(s), 'bytes sha256', hashlib.sha256(s.encode()).hexdigest())
