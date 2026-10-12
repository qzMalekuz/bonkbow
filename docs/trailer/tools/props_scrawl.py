"""Scrawled props shared by the 2D films."""
import math


def target(pen, c, r):
    for i, col in enumerate(((242, 232, 200), (30, 30, 30), (60, 120, 220), (214, 48, 48), (240, 195, 50))):
        rr = r * (1 - i / 5)
        pen.blob([(c[0] + math.cos(a) * rr * 0.55, c[1] + math.sin(a) * rr) for a in [k * math.tau / 14 for k in range(14)]], w=5, fill=col, amp=1.5)
    pen.line([(c[0], c[1] + r), (c[0] - 20, c[1] + r + 70)], 7); pen.line([(c[0], c[1] + r), (c[0] + 24, c[1] + r + 70)], 7)
