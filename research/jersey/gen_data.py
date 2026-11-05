# SPDX-License-Identifier: LicenseRef-HILiT-NCA-1.1
import sys, random, numpy as np
from multiprocessing import Pool
import gen
def work(seed):
    random.seed(seed); np.random.seed(seed)
    n = 2000; X = np.zeros((n, 32, 32, 3), np.uint8); Y = np.zeros((n, 3), np.int64)
    for i in range(n):
        r = random.random()
        num = None if r < 0.3 else (random.randint(0, 9) if r < 0.45 else random.randint(10, 99))
        jersey = gen.jitter(random.choice(gen.COLORS), 30)
        X[i] = gen.degrade(gen.torso_scene(jersey, '' if num is None else str(num))).astype(np.uint8)
        Y[i] = (0, 0, 0) if num is None else ((1, num, 0) if num < 10 else (2, num // 10, num % 10))
    return X, Y
if __name__ == '__main__':
    chunks = int(sys.argv[1]); base = int(sys.argv[2]) if len(sys.argv) > 2 else 1000
    with Pool(7) as p: res = p.map(work, range(base, base + chunks))
    X = np.concatenate([r[0] for r in res]); Y = np.concatenate([r[1] for r in res])
    np.savez(sys.argv[3] if len(sys.argv) > 3 else 'data.npz', X=X, Y=Y); print(X.shape)
