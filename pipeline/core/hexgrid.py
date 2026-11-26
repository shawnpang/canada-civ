"""Pointy-top odd-r grid in map kilometres."""
import math
from dataclasses import dataclass

@dataclass(frozen=True)
class HexGrid:
    cols: int
    rows: int
    radius: float = 25
    @classmethod
    def covering(cls, width, height, radius=25):
        return cls(math.ceil(width / (math.sqrt(3) * radius)) + 1,
                   math.ceil(height / (1.5 * radius)) + 1, radius)
    def center(self, col, row):
        return (math.sqrt(3) * self.radius * (col + 0.5 * (row & 1)), 1.5 * self.radius * row)
    def cell(self, x, y):
        q = (math.sqrt(3) / 3 * x - y / 3) / self.radius
        r = (2 * y / 3) / self.radius
        s = -q-r
        rq, rr, rs = (math.floor(v + 0.5) for v in (q, r, s))
        dq, dr, ds = abs(rq-q), abs(rr-r), abs(rs-s)
        if dq > dr and dq > ds:
            rq = -rr-rs
        elif dr > ds:
            rr = -rq-rs
        col = rq + (rr - (rr & 1)) // 2
        return col, rr
