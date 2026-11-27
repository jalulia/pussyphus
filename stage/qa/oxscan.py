# python3 qa/oxscan.py img... — count rendered pixels in the banned oxblood band (OKLCH L .18-.46, C >= .07, h 8-34)
import sys, numpy as np
from PIL import Image
def oklch(rgb):
    c = rgb / 255.0; lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
    M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468], [1.9779984951, -2.4285922050, 0.4505937099], [0.0259040371, 0.7827717662, -0.8086757660]])
    lms = np.cbrt(lin @ M1.T); lab = lms @ M2.T
    L = lab[..., 0]; C = np.hypot(lab[..., 1], lab[..., 2]); h = np.degrees(np.arctan2(lab[..., 2], lab[..., 1])) % 360
    return L, C, h
tot = 0
for f in sys.argv[1:]:
    a = np.asarray(Image.open(f).convert('RGB')).astype(float); L, C, h = oklch(a)
    m = (L >= 0.18) & (L <= 0.46) & (C >= 0.07) & (h >= 8) & (h <= 34); n = int(m.sum()); tot += n
    ex = ['#%02x%02x%02x' % tuple(int(v) for v in a[m][i]) for i in range(min(3, n))]
    print(f'{f}: {n} px', ex)
print('TOTAL', tot)
