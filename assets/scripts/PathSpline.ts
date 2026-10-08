import { Vec3 } from 'cc';

/**
 * Catmull-Rom 采样：把少量控制点变成一条平滑曲线上的密集点。
 * PathMover（敌人沿曲线走）和 BrushPath（沿曲线铺笔触）共用同一份采样，
 * 保证"看到的路径"和"走的路径"完全一致。
 */
export function sampleSpline(controls: Vec3[], samplesPerSegment = 10): Vec3[] {
    if (controls.length < 2) {
        return controls.map((p) => p.clone());
    }

    const count = controls.length;
    const result: Vec3[] = [];

    for (let i = 0; i < count - 1; i += 1) {
        const p0 = controls[i > 0 ? i - 1 : i];
        const p1 = controls[i];
        const p2 = controls[i + 1];
        const p3 = controls[i + 2 < count ? i + 2 : i + 1];

        for (let s = 0; s < samplesPerSegment; s += 1) {
            result.push(catmullRom(p0, p1, p2, p3, s / samplesPerSegment));
        }
    }

    result.push(controls[count - 1].clone());
    return result;
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
    const t2 = t * t;
    const t3 = t2 * t;
    const x = 0.5 * (
        2 * p1.x
        + (-p0.x + p2.x) * t
        + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2
        + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    const y = 0.5 * (
        2 * p1.y
        + (-p0.y + p2.y) * t
        + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2
        + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    return new Vec3(x, y, 0);
}
