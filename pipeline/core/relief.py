"""Classify a hex's valid MRDEM land samples using the published relief rules."""
import math
import statistics


def classify_relief(samples):
    if not samples:
        return 0
    mean = statistics.fmean(samples)
    sd = statistics.pstdev(samples, mu=mean)
    level = 3 if mean >= 2700 else 2 if sd >= 260 or mean >= 2300 else 1 if sd >= 85 else 0
    low = sorted(samples)[:max(1, math.ceil(len(samples) * .6))]
    if low[-1] < 400 and low[-1] - low[0] < 60:
        level = max(0, level - 1)
    return level
