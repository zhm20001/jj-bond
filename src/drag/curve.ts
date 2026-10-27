// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Phantiverse
export interface Point { x: number; y: number; }
export interface Curve { start: Point; c1: Point; c2: Point; end: Point; }

export function targetAnchor(rect: { left: number; top: number; bottom: number }, from: Point): Point {
    // stop outside the row so the arrowhead never covers its change id
    return { x: rect.left + 6, y: from.y >= (rect.top + rect.bottom) / 2 ? rect.bottom + 5 : rect.top - 5 };
}

export function dragCurve(start: Point, end: Point): Curve {
    let dy = end.y - start.y;
    let direction = Math.sign(dy);
    let handle = Math.min(72, Math.abs(dy) * .3);
    let horizontal = Math.max(handle, Math.abs(end.x - start.x) * .25);
    return {
        start,
        c1: { x: start.x + horizontal, y: start.y + direction * handle },
        // equal offsets give the arrow a 45-degree terminal tangent
        c2: { x: end.x + handle, y: end.y - direction * handle },
        end,
    };
}

export function smoothCurve(previous: Curve, next: Curve, amount: number): Curve {
    let lerp = (a: Point, b: Point) => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount });
    return { start: lerp(previous.start, next.start), c1: lerp(previous.c1, next.c1), c2: lerp(previous.c2, next.c2), end: lerp(previous.end, next.end) };
}

export function curvePath(curve: Curve): string {
    let { start, c1, c2, end } = curve;
    return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
