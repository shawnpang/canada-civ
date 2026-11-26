"""EPSG:3347 (NAD83 / Statistics Canada Lambert), in metres and map km."""
import math
from dataclasses import dataclass

A = 6378137.0
F = 1 / 298.257222101
E = math.sqrt(F * (2 - F))
LON0 = math.radians(-91.8666666666667)
LAT0 = math.radians(63.390675)
FALSE_EASTING = 6200000.0
FALSE_NORTHING = 3000000.0

def _m(phi):
    return math.cos(phi) / math.sqrt(1 - E * E * math.sin(phi) ** 2)

def _t(phi):
    s = E * math.sin(phi)
    return math.tan(math.pi / 4 - phi / 2) / ((1 - s) / (1 + s)) ** (E / 2)

P1, P2 = map(math.radians, (49, 77))
N = math.log(_m(P1) / _m(P2)) / math.log(_t(P1) / _t(P2))
C = _m(P1) / (N * _t(P1) ** N)
RHO0 = A * C * _t(LAT0) ** N

def project(lon, lat):
    """Longitude and latitude in degrees to EPSG:3347 easting/northing."""
    rho = A * C * _t(math.radians(lat)) ** N
    theta = N * (math.radians(lon) - LON0)
    return FALSE_EASTING + rho * math.sin(theta), FALSE_NORTHING + RHO0 - rho * math.cos(theta)

def unproject(x, y):
    dx, dy = x - FALSE_EASTING, RHO0 - (y - FALSE_NORTHING)
    rho = math.hypot(dx, dy)
    t = (rho / (A * C)) ** (1 / N)
    phi = math.pi / 2 - 2 * math.atan(t)
    for _ in range(15):
        s = E * math.sin(phi)
        new = math.pi / 2 - 2 * math.atan(t * ((1 - s) / (1 + s)) ** (E / 2))
        if abs(new - phi) < 1e-13:
            phi = new
            break
        phi = new
    return math.degrees(LON0 + math.atan2(dx, dy) / N), math.degrees(phi)

@dataclass(frozen=True)
class MapProjection:
    min_x: float
    max_y: float
    def to_map(self, x, y):
        return (x - self.min_x) / 1000, (self.max_y - y) / 1000
    def from_map(self, x, y):
        return self.min_x + 1000 * x, self.max_y - 1000 * y
