#!/usr/bin/env python3
"""
Create a shadow-board cut outline from a photo of a tool on A4 paper.

The script detects the A4 paper, crops it, segments the tool from the white
paper, dilates the mask by the requested millimeter offset, and writes SVG
cut files plus PNG previews.
"""

from __future__ import annotations

import argparse
import math
from collections import defaultdict, deque
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

A4_W_MM = 210.0
A4_H_MM = 297.0
A3_W_MM = 297.0
A3_H_MM = 420.0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("image", type=Path, help="Photo of tool on A4 paper")
    parser.add_argument("--outdir", type=Path, default=Path("outputs"))
    parser.add_argument("--name", default=None)
    parser.add_argument("--offset-mm", type=float, default=2.0)
    parser.add_argument("--finger-pull-mm", type=float, default=14.0)
    parser.add_argument("--paper-size", choices=("a4", "a3"), default="a4")
    parser.add_argument("--metal-repair-mm", type=float, default=7.0)
    parser.add_argument("--px-per-mm", type=float, default=8.0)
    parser.add_argument("--min-object-mm2", type=float, default=150.0)
    parser.add_argument("--simplify-mm", type=float, default=0.45)
    parser.add_argument("--min-radius-mm", type=float, default=0.5)
    parser.add_argument("--smooth-iterations", type=int, default=4)
    parser.add_argument("--curve-spacing-mm", type=float, default=2.5)
    parser.add_argument("--smooth-sigma-mm", type=float, default=3.0)
    return parser.parse_args()


def largest_component(mask: np.ndarray, min_area: int = 1) -> np.ndarray:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    best: list[tuple[int, int]] = []
    for y in range(h):
        xs = np.flatnonzero(mask[y] & ~seen[y])
        for x0 in xs:
            if seen[y, x0] or not mask[y, x0]:
                continue
            q = deque([(int(x0), y)])
            seen[y, x0] = True
            pts: list[tuple[int, int]] = []
            while q:
                x, yy = q.popleft()
                pts.append((x, yy))
                for nx, ny in ((x + 1, yy), (x - 1, yy), (x, yy + 1), (x, yy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if len(pts) > len(best):
                best = pts
    out = np.zeros_like(mask, dtype=bool)
    if len(best) >= min_area:
        yy = [p[1] for p in best]
        xx = [p[0] for p in best]
        out[yy, xx] = True
    return out


def fill_interior_holes(mask: np.ndarray) -> np.ndarray:
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and not mask[y, x] and not seen[y, x]:
            seen[y, x] = True
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    return mask | (~mask & ~seen)


def square_dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask.copy()
    padded = np.pad(mask.astype(np.uint8), radius, mode="constant", constant_values=0)
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(0).cumsum(1)
    k = radius * 2 + 1
    sums = integral[k:, k:] - integral[:-k, k:] - integral[k:, :-k] + integral[:-k, :-k]
    return sums > 0


def square_erode(mask: np.ndarray, radius: int) -> np.ndarray:
    if radius <= 0:
        return mask.copy()
    return ~square_dilate(~mask, radius)


def bbox_from_mask(mask: np.ndarray, pad: int = 0) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        raise RuntimeError("Could not detect a page/object mask.")
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(mask.shape[1], int(xs.max()) + 1 + pad)
    y1 = min(mask.shape[0], int(ys.max()) + 1 + pad)
    return x0, y0, x1, y1


def paper_dimensions(paper_size: str) -> tuple[float, float]:
    if paper_size.lower() == "a3":
        return A3_W_MM, A3_H_MM
    return A4_W_MM, A4_H_MM


def detect_and_warp_a4(img: Image.Image, px_per_mm: float, paper_size: str) -> Image.Image:
    rgb = img.convert("RGB")
    small = rgb.copy()
    small.thumbnail((1200, 1200))
    arr = np.asarray(small).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    bright = (r + g + b) / 3
    color_range = np.maximum.reduce([r, g, b]) - np.minimum.reduce([r, g, b])
    paper = (bright > 125) & (color_range < 75)
    paper = largest_component(paper, min_area=5000)
    x0, y0, x1, y1 = bbox_from_mask(paper, pad=6)
    sx = rgb.width / small.width
    sy = rgb.height / small.height
    crop_box = (int(x0 * sx), int(y0 * sy), int(x1 * sx), int(y1 * sy))
    crop = rgb.crop(crop_box)
    landscape = crop.width > crop.height
    paper_w_mm, paper_h_mm = paper_dimensions(paper_size)
    out_size = (
        int(round((paper_h_mm if landscape else paper_w_mm) * px_per_mm)),
        int(round((paper_w_mm if landscape else paper_h_mm) * px_per_mm)),
    )
    return ImageOps.fit(crop, out_size, method=Image.Resampling.LANCZOS)


def make_tool_mask(
    page: Image.Image, min_object_area: int, px_per_mm: float, metal_repair_mm: float
) -> Image.Image:
    arr = np.asarray(page.convert("RGB")).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum.reduce([r, g, b])
    mn = np.minimum.reduce([r, g, b])
    bright = (r + g + b) / 3
    sat = mx - mn
    gray = bright.astype(np.int16)
    edge = np.zeros_like(gray)
    edge[:, 1:] = np.maximum(edge[:, 1:], np.abs(gray[:, 1:] - gray[:, :-1]))
    edge[1:, :] = np.maximum(edge[1:, :], np.abs(gray[1:, :] - gray[:-1, :]))
    bg = (
        Image.fromarray(np.clip(bright, 0, 255).astype(np.uint8), "L")
        .filter(ImageFilter.BoxBlur(max(3, int(round(18.0 * px_per_mm)))))
    )
    local_bg = np.asarray(bg).astype(np.int16)
    local_drop = local_bg - bright
    # Soft shadows are slow brightness changes on the paper, while tools tend
    # to have color, true dark material, crisp edges, or local contrast.
    mask = (
        (sat > 34)
        | (bright < 112)
        | ((edge > 24) & (bright < 235))
        | ((local_drop > 28) & (edge > 9) & (bright < 230))
    )
    # Photos of white paper often have dark edge shadows. Exclude the outer
    # margin after A4 correction so the paper perimeter cannot become the tool.
    border = max(8, int(round(12.0 * px_per_mm)))
    mask[:border, :] = False
    mask[-border:, :] = False
    mask[:, :border] = False
    mask[:, -border:] = False
    img = Image.fromarray((mask * 255).astype(np.uint8), "L")
    img = img.filter(ImageFilter.MedianFilter(3))
    img = img.filter(ImageFilter.MaxFilter(13)).filter(ImageFilter.MinFilter(7))
    mask = np.asarray(img) > 0
    mask = largest_component(mask, min_area=min_object_area)
    img = Image.fromarray((mask * 255).astype(np.uint8), "L")
    bridge = max(0, int(round(metal_repair_mm * px_per_mm)))
    if bridge > 0:
        mask = square_dilate(np.asarray(img) > 0, bridge)
        mask = fill_interior_holes(mask)
        mask = square_erode(mask, bridge)
        mask = fill_interior_holes(mask)
        img = Image.fromarray((mask * 255).astype(np.uint8), "L")
    # Smooth out threshold speckles without materially changing the silhouette.
    img = img.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    mask = fill_interior_holes(np.asarray(img) > 0)
    return Image.fromarray((mask * 255).astype(np.uint8), "L")


def dilate(mask: Image.Image, radius_px: int) -> Image.Image:
    img = mask
    for _ in range(max(0, radius_px)):
        img = img.filter(ImageFilter.MaxFilter(3))
    return img


def add_finger_pull(mask: Image.Image, radius_mm: float, px_per_mm: float) -> Image.Image:
    if radius_mm <= 0:
        return mask
    arr = np.asarray(mask) > 0
    x0, y0, x1, y1 = bbox_from_mask(arr, pad=0)
    radius = int(round(radius_mm * px_per_mm))
    overlap = int(round(radius * 0.45))
    center_y = int(round(y0 + (y1 - y0) * 0.72))
    right_center_x = x1 + radius - overlap
    left_center_x = x0 - radius + overlap
    if right_center_x + radius < mask.width - int(5 * px_per_mm):
        center_x = right_center_x
    elif left_center_x - radius > int(5 * px_per_mm):
        center_x = left_center_x
    else:
        center_x = int(round((x0 + x1) / 2))
        center_y = min(mask.height - radius - 1, y1 + radius - overlap)
    out = mask.copy()
    draw = ImageDraw.Draw(out)
    draw.ellipse(
        (center_x - radius, center_y - radius, center_x + radius, center_y + radius),
        fill=255,
    )
    return out


SEGMENTS = {
    1: [("L", "T")],
    2: [("T", "R")],
    3: [("L", "R")],
    4: [("R", "B")],
    5: [("T", "R"), ("L", "B")],
    6: [("T", "B")],
    7: [("L", "B")],
    8: [("B", "L")],
    9: [("T", "B")],
    10: [("L", "T"), ("R", "B")],
    11: [("R", "B")],
    12: [("L", "R")],
    13: [("T", "R")],
    14: [("L", "T")],
}


def edge_point(x: int, y: int, edge: str) -> tuple[int, int]:
    if edge == "T":
        return (2 * x + 1, 2 * y)
    if edge == "R":
        return (2 * x + 2, 2 * y + 1)
    if edge == "B":
        return (2 * x + 1, 2 * y + 2)
    if edge == "L":
        return (2 * x, 2 * y + 1)
    raise ValueError(edge)


def marching_squares(mask: Image.Image) -> list[tuple[float, float]]:
    arr = (np.asarray(mask) > 0).astype(np.uint8)
    arr = np.pad(arr, 1)
    h, w = arr.shape
    graph: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    for y in range(h - 1):
        for x in range(w - 1):
            tl, tr, br, bl = arr[y, x], arr[y, x + 1], arr[y + 1, x + 1], arr[y + 1, x]
            idx = int(tl) | (int(tr) << 1) | (int(br) << 2) | (int(bl) << 3)
            for a, b in SEGMENTS.get(idx, []):
                p1 = edge_point(x - 1, y - 1, a)
                p2 = edge_point(x - 1, y - 1, b)
                graph[p1].append(p2)
                graph[p2].append(p1)

    loops: list[list[tuple[int, int]]] = []
    used_edges: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    for start, nbrs in graph.items():
        for nxt in nbrs:
            edge = tuple(sorted((start, nxt)))
            if edge in used_edges:
                continue
            path = [start]
            prev, cur = start, nxt
            while True:
                used_edges.add(tuple(sorted((prev, cur))))
                path.append(cur)
                candidates = [p for p in graph[cur] if p != prev]
                if not candidates:
                    break
                next_pt = candidates[0]
                if len(candidates) > 1:
                    unused = [p for p in candidates if tuple(sorted((cur, p))) not in used_edges]
                    next_pt = unused[0] if unused else candidates[0]
                prev, cur = cur, next_pt
                if cur == start:
                    path.append(cur)
                    break
            if len(path) > 8:
                loops.append(path)

    if not loops:
        raise RuntimeError("Could not trace an outline.")
    loop = max(loops, key=lambda pts: polygon_area([(x / 2, y / 2) for x, y in pts]))
    return [(x / 2.0, y / 2.0) for x, y in loop]


def polygon_area(points: Iterable[tuple[float, float]]) -> float:
    pts = list(points)
    area = 0.0
    for i, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2.0


def perpendicular_distance(p, a, b) -> float:
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return ((px - ax) ** 2 + (py - ay) ** 2) ** 0.5
    return abs(dy * px - dx * py + bx * ay - by * ax) / ((dx * dx + dy * dy) ** 0.5)


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    closed = points[0] == points[-1]
    pts = points[:-1] if closed else points

    def rdp(seq):
        if len(seq) <= 2:
            return seq
        a, b = seq[0], seq[-1]
        distances = [perpendicular_distance(p, a, b) for p in seq[1:-1]]
        if not distances:
            return seq
        i = int(np.argmax(distances)) + 1
        if distances[i - 1] <= tolerance:
            return [a, b]
        return rdp(seq[: i + 1])[:-1] + rdp(seq[i:])

    out = rdp(pts)
    if closed and out[0] != out[-1]:
        out.append(out[0])
    return out


def chaikin_smooth(points: list[tuple[float, float]], iterations: int) -> list[tuple[float, float]]:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    for _ in range(max(0, iterations)):
        smoothed: list[tuple[float, float]] = []
        for i, p0 in enumerate(pts):
            p1 = pts[(i + 1) % len(pts)]
            q = (0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1])
            r = (0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1])
            smoothed.extend([q, r])
        pts = smoothed
    if pts and pts[0] != pts[-1]:
        pts.append(pts[0])
    return pts


def resample_closed_polyline(
    points: list[tuple[float, float]], spacing_px: float
) -> list[tuple[float, float]]:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    if len(pts) < 2:
        return points
    spacing_px = max(1.0, spacing_px)
    edges = []
    perimeter = 0.0
    for i, p0 in enumerate(pts):
        p1 = pts[(i + 1) % len(pts)]
        length = distance(p0, p1)
        edges.append((p0, p1, length))
        perimeter += length
    count = max(12, int(round(perimeter / spacing_px)))
    out: list[tuple[float, float]] = []
    edge_i = 0
    edge_start = 0.0
    for k in range(count):
        target = k * perimeter / count
        while edge_i < len(edges) - 1 and edge_start + edges[edge_i][2] < target:
            edge_start += edges[edge_i][2]
            edge_i += 1
        p0, p1, length = edges[edge_i]
        t = 0.0 if length == 0 else (target - edge_start) / length
        out.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
    out.append(out[0])
    return out


def gaussian_smooth_closed(
    points: list[tuple[float, float]], sigma_px: float, spacing_px: float
) -> list[tuple[float, float]]:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    if len(pts) < 5 or sigma_px <= 0:
        return points
    sigma_samples = max(0.1, sigma_px / max(1.0, spacing_px))
    radius = max(2, int(math.ceil(sigma_samples * 3.0)))
    weights = [math.exp(-(i * i) / (2.0 * sigma_samples * sigma_samples)) for i in range(-radius, radius + 1)]
    total = sum(weights)
    weights = [w / total for w in weights]
    n = len(pts)
    out: list[tuple[float, float]] = []
    for i in range(n):
        sx = 0.0
        sy = 0.0
        for offset, weight in zip(range(-radius, radius + 1), weights):
            p = pts[(i + offset) % n]
            sx += p[0] * weight
            sy += p[1] * weight
        out.append((sx, sy))
    out.append(out[0])
    return out


def lowpass_smooth_outline(
    points: list[tuple[float, float]], px_per_mm: float, spacing_mm: float, sigma_mm: float
) -> list[tuple[float, float]]:
    spacing_px = max(1.0, spacing_mm * px_per_mm)
    sigma_px = max(0.0, sigma_mm * px_per_mm)
    resampled = resample_closed_polyline(points, spacing_px)
    return gaussian_smooth_closed(resampled, sigma_px, spacing_px)


def points_to_svg_path(points: list[tuple[float, float]], px_per_mm: float) -> str:
    coords = [(x / px_per_mm, y / px_per_mm) for x, y in points]
    first = coords[0]
    parts = [f"M {first[0]:.3f} {first[1]:.3f}"]
    for x, y in coords[1:]:
        parts.append(f"L {x:.3f} {y:.3f}")
    parts.append("Z")
    return " ".join(parts)


def points_to_bspline_svg_path(points: list[tuple[float, float]], px_per_mm: float) -> str:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    if len(pts) < 4:
        return points_to_svg_path(points, px_per_mm)
    coords = [(x / px_per_mm, y / px_per_mm) for x, y in pts]
    n = len(coords)

    def b_point(i: int) -> tuple[float, float]:
        p0 = coords[(i - 1) % n]
        p1 = coords[i % n]
        p2 = coords[(i + 1) % n]
        return (
            (p0[0] + 4 * p1[0] + p2[0]) / 6.0,
            (p0[1] + 4 * p1[1] + p2[1]) / 6.0,
        )

    start = b_point(0)
    parts = [f"M {start[0]:.3f} {start[1]:.3f}"]
    for i in range(n):
        p1 = coords[i % n]
        p2 = coords[(i + 1) % n]
        c1 = ((2 * p1[0] + p2[0]) / 3.0, (2 * p1[1] + p2[1]) / 3.0)
        c2 = ((p1[0] + 2 * p2[0]) / 3.0, (p1[1] + 2 * p2[1]) / 3.0)
        end = b_point((i + 1) % n)
        parts.append(
            f"C {c1[0]:.3f} {c1[1]:.3f} {c2[0]:.3f} {c2[1]:.3f} {end[0]:.3f} {end[1]:.3f}"
        )
    parts.append("Z")
    return " ".join(parts)


def bspline_preview_points(
    points: list[tuple[float, float]], px_per_mm: float, samples_per_segment: int = 10
) -> list[tuple[float, float]]:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    if len(pts) < 4:
        return points
    coords = [(x / px_per_mm, y / px_per_mm) for x, y in pts]
    n = len(coords)

    def b_point(i: int) -> tuple[float, float]:
        p0 = coords[(i - 1) % n]
        p1 = coords[i % n]
        p2 = coords[(i + 1) % n]
        return (
            (p0[0] + 4 * p1[0] + p2[0]) / 6.0,
            (p0[1] + 4 * p1[1] + p2[1]) / 6.0,
        )

    preview: list[tuple[float, float]] = []
    for i in range(n):
        start = b_point(i)
        p1 = coords[i % n]
        p2 = coords[(i + 1) % n]
        c1 = ((2 * p1[0] + p2[0]) / 3.0, (2 * p1[1] + p2[1]) / 3.0)
        c2 = ((p1[0] + 2 * p2[0]) / 3.0, (p1[1] + 2 * p2[1]) / 3.0)
        end = b_point((i + 1) % n)
        for step in range(samples_per_segment):
            t = step / samples_per_segment
            x = (
                (1 - t) ** 3 * start[0]
                + 3 * (1 - t) ** 2 * t * c1[0]
                + 3 * (1 - t) * t**2 * c2[0]
                + t**3 * end[0]
            )
            y = (
                (1 - t) ** 3 * start[1]
                + 3 * (1 - t) ** 2 * t * c1[1]
                + 3 * (1 - t) * t**2 * c2[1]
                + t**3 * end[1]
            )
            preview.append((x * px_per_mm, y * px_per_mm))
    if preview:
        preview.append(preview[0])
    return preview


def distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def rounded_corner_data(
    points: list[tuple[float, float]], px_per_mm: float, radius_mm: float
) -> list[tuple[tuple[float, float], tuple[float, float], tuple[float, float]]]:
    pts = points[:-1] if points and points[0] == points[-1] else points[:]
    coords = [(x / px_per_mm, y / px_per_mm) for x, y in pts]
    out = []
    for i, p in enumerate(coords):
        prev_pt = coords[i - 1]
        next_pt = coords[(i + 1) % len(coords)]
        len_prev = distance(p, prev_pt)
        len_next = distance(p, next_pt)
        if len_prev < 0.001 or len_next < 0.001 or radius_mm <= 0:
            out.append((p, p, p))
            continue
        v1 = ((prev_pt[0] - p[0]) / len_prev, (prev_pt[1] - p[1]) / len_prev)
        v2 = ((next_pt[0] - p[0]) / len_next, (next_pt[1] - p[1]) / len_next)
        dot = max(-1.0, min(1.0, v1[0] * v2[0] + v1[1] * v2[1]))
        theta = math.acos(dot)
        if theta < math.radians(8) or abs(math.pi - theta) < math.radians(4):
            out.append((p, p, p))
            continue
        tangent = radius_mm / max(0.05, math.tan(theta / 2.0))
        tangent = min(tangent, len_prev * 0.45, len_next * 0.45)
        if tangent < 0.05:
            out.append((p, p, p))
            continue
        start = (p[0] + v1[0] * tangent, p[1] + v1[1] * tangent)
        end = (p[0] + v2[0] * tangent, p[1] + v2[1] * tangent)
        out.append((start, p, end))
    return out


def points_to_rounded_svg_path(points: list[tuple[float, float]], px_per_mm: float, radius_mm: float) -> str:
    corners = rounded_corner_data(points, px_per_mm, radius_mm)
    if not corners:
        return ""
    start = corners[0][2]
    parts = [f"M {start[0]:.3f} {start[1]:.3f}"]
    for start_pt, control, end_pt in corners[1:] + corners[:1]:
        parts.append(f"L {start_pt[0]:.3f} {start_pt[1]:.3f}")
        if start_pt == control == end_pt:
            parts.append(f"L {end_pt[0]:.3f} {end_pt[1]:.3f}")
        else:
            parts.append(f"Q {control[0]:.3f} {control[1]:.3f} {end_pt[0]:.3f} {end_pt[1]:.3f}")
    parts.append("Z")
    return " ".join(parts)


def rounded_preview_points(
    points: list[tuple[float, float]], px_per_mm: float, radius_mm: float
) -> list[tuple[float, float]]:
    corners = rounded_corner_data(points, px_per_mm, radius_mm)
    if not corners:
        return points
    preview: list[tuple[float, float]] = []
    start = corners[0][2]
    preview.append((start[0] * px_per_mm, start[1] * px_per_mm))
    for start_pt, control, end_pt in corners[1:] + corners[:1]:
        preview.append((start_pt[0] * px_per_mm, start_pt[1] * px_per_mm))
        if start_pt == control == end_pt:
            preview.append((end_pt[0] * px_per_mm, end_pt[1] * px_per_mm))
            continue
        for step in range(1, 9):
            t = step / 8.0
            x = (1 - t) ** 2 * start_pt[0] + 2 * (1 - t) * t * control[0] + t**2 * end_pt[0]
            y = (1 - t) ** 2 * start_pt[1] + 2 * (1 - t) * t * control[1] + t**2 * end_pt[1]
            preview.append((x * px_per_mm, y * px_per_mm))
    return preview


def write_svg(path: Path, svg_path: str, page_w_mm: float, page_h_mm: float, stroke: str = "#d00000") -> None:
    path.write_text(
        "\n".join(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{page_w_mm:.3f}mm" height="{page_h_mm:.3f}mm" viewBox="0 0 {page_w_mm:.3f} {page_h_mm:.3f}">',
                f'<rect x="0" y="0" width="{page_w_mm:.3f}" height="{page_h_mm:.3f}" fill="white"/>',
                f'<path d="{svg_path}" fill="none" stroke="{stroke}" stroke-width="0.25" vector-effect="non-scaling-stroke"/>',
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )


def overlay_preview(page: Image.Image, outline: list[tuple[float, float]], out: Path) -> None:
    preview = page.convert("RGB")
    draw = ImageDraw.Draw(preview)
    draw.line(outline, fill=(220, 0, 0), width=5, joint="curve")
    preview.save(out)


def main() -> None:
    args = parse_args()
    args.outdir.mkdir(parents=True, exist_ok=True)
    stem = args.name or args.image.stem.replace(" ", "_")
    img = Image.open(args.image)
    page = detect_and_warp_a4(img, args.px_per_mm, args.paper_size)
    min_area = int(args.min_object_mm2 * args.px_per_mm * args.px_per_mm)
    tool_mask = make_tool_mask(page, min_area, args.px_per_mm, args.metal_repair_mm)
    offset_px = int(round(args.offset_mm * args.px_per_mm))
    cut_mask = dilate(tool_mask, offset_px)
    cut_mask = add_finger_pull(cut_mask, args.finger_pull_mm, args.px_per_mm)
    outline = marching_squares(cut_mask)
    outline = simplify(outline, args.simplify_mm * args.px_per_mm)
    if outline[0] != outline[-1]:
        outline.append(outline[0])
    smooth_outline = lowpass_smooth_outline(
        outline,
        args.px_per_mm,
        args.curve_spacing_mm,
        args.smooth_sigma_mm,
    )
    if args.smooth_iterations > 0:
        smooth_outline = chaikin_smooth(smooth_outline, max(0, args.smooth_iterations - 1))
    svg_path = points_to_bspline_svg_path(smooth_outline, args.px_per_mm)
    preview_outline = bspline_preview_points(smooth_outline, args.px_per_mm)

    page.save(args.outdir / f"{stem}_a4_corrected.png")
    tool_mask.save(args.outdir / f"{stem}_tool_mask.png")
    cut_mask.save(args.outdir / f"{stem}_offset_mask_2mm.png")
    overlay_preview(page, preview_outline, args.outdir / f"{stem}_preview_2mm.png")
    write_svg(
        args.outdir / f"{stem}_cutline_2mm.svg",
        svg_path,
        page.width / args.px_per_mm,
        page.height / args.px_per_mm,
    )
    print(f"Wrote {args.outdir / f'{stem}_cutline_2mm.svg'}")
    print(f"Outline points: {len(outline)}")
    print(f"Smooth curve points: {len(smooth_outline)}")
    print(f"Curve spacing: {args.curve_spacing_mm} mm")
    print(f"Gaussian smoothing sigma: {args.smooth_sigma_mm} mm")


if __name__ == "__main__":
    main()
