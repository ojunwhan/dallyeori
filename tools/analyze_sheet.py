"""Analyze full_sheet.png alpha histogram for region boundaries."""
from PIL import Image
import numpy as np

im = Image.open("assets/sprites/full_sheet.png").convert("RGBA")
a = np.array(im)
alpha = a[:, :, 3]
h, w = alpha.shape
print("size", w, h)

row_density = (alpha > 10).sum(axis=1)
col_density = (alpha > 10).sum(axis=0)
mid = w // 2

# Find y-bands: consecutive rows with very low density (gaps)
low = row_density < max(80.0, row_density.max() * 0.025)
runs = []
s = None
for i, v in enumerate(low):
    if v and s is None:
        s = i
    if not v and s is not None:
        if i - s > 4:
            runs.append((s, i - 1))
        s = None
print("gap runs (y0,y1) len>4:", runs[:25], "... count", len(runs))

# derivative of row_density to find sharp transitions
dr = np.abs(np.diff(row_density.astype(float)))
peaks = np.where(dr > 500)[0]
print("sharp row transitions sample", peaks[:40])

# For each column half, find top row with content and bottom
for half, name in [((0, mid), "left"), ((mid, w), "right")]:
    lo, hi = half
    sub = alpha[:, lo:hi]
    rows = (sub > 10).any(axis=1)
    ys = np.where(rows)[0]
    if len(ys):
        print(name, "content y", ys[0], ys[-1], "span", ys[-1] - ys[0])

# 8 equal columns top — check which columns have peaks (duck frames)
# Assume 8 equal cells in top 700px
top = 700
for i in range(8):
    x0 = i * (w // 8)
    x1 = (i + 1) * (w // 8)
    sub = alpha[0:top, x0:x1]
    ys, xs = np.where(sub > 10)
    if len(ys):
        print(
            f"col{i} x{x0}-{x1} bbox y{ys.min()}-{ys.max()} x{xs.min()+x0}-{xs.max()+x0}",
        )

# Bottom-right quadrant bbox: find minimal rect covering alpha in region x>=mid, y>=750
for y0 in [700, 750, 800, 850, 900]:
    sub = alpha[y0:, mid:]
    if sub.any():
        ys, xs = np.where(sub > 10)
        print(f"BR from y>={y0} bbox", xs.min() + mid, ys.min() + y0, xs.max() + mid, ys.max() + y0)
        break

# Bottom-left quadrant content bbox
sub = alpha[700:, 0:mid]
ys, xs = np.where(sub > 10)
print("BL quad bbox", xs.min(), ys.min() + 700, xs.max(), ys.max() + 700)

# Row-by-row alpha sum for y 700-1504 left half — find drop (touch vs HUD)
for y in range(700, 1504, 20):
    s = alpha[y : y + 20, 0:mid].sum() + alpha[y : y + 20, mid:w].sum()
    print(f"y{y}-{y+20} total_alpha {s}")
# Finer: find y where left half has local minimum between 700-1100
rd = (alpha[700:1100, 0:mid] > 10).sum(axis=1)
print("left half rows 700-1100 density min at", rd.argmin() + 700, "val", rd.min())


# BR quadrant: bbox for y 700-880 vs 880-1504
for y0, y1 in [(700, 880), (880, 1100), (700, 1504)]:
    sub = alpha[y0:y1, mid:w]
    ys, xs = np.where(sub > 10)
    if len(ys):
        print(
            f"BR y{y0}-{y1} bbox",
            xs.min() + mid,
            ys.min() + y0,
            xs.max() + mid,
            ys.max() + y0,
        )

# BL: bbox for y 700-880 vs 880+
for y0, y1 in [(700, 880), (880, 1100), (1100, 1504)]:
    sub = alpha[y0:y1, 0:mid]
    ys, xs = np.where(sub > 10)
    if len(ys):
        print(
            f"BL y{y0}-{y1} bbox",
            xs.min(),
            ys.min() + y0,
            xs.max(),
            ys.max() + y0,
        )

# Full width row bands: first 900px height from y700 - column content in 4 quarters
qh = (1504 - 700) // 2  # 402
qw = 1400
for qi in range(2):
    for qj in range(2):
        x0 = qj * qw
        x1 = x0 + qw
        y0 = 700 + qi * qh
        y1 = y0 + qh
        sub = alpha[y0:y1, x0:x1]
        print(f"quadBLpart qi{qi}qj{qj} y{y0}-{y1} x{x0}-{x1} sum", int(sub.sum()))
