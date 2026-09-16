import { darken, lighten, withAlpha } from "../color";
import { circle, linear, polygon, radial, TAU } from "./common";

export const METEOR_FIRE = "#f97316";
export const FROST_ICE = "#bae6fd";

/**
 * A burning rock with its rock centred on the origin and the flame trail
 * streaming up and to the right, the way it falls onto the board. `s` is the
 * rock's scale: the rock is 0.32 s across and the trail reaches 0.6 s.
 */
export function paintMeteor(ctx: CanvasRenderingContext2D, s: number): void {
  const tail = s * 0.62;
  const trail = (width: number, length: number, stops: readonly [string, string]): void => {
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -width);
    ctx.quadraticCurveTo(length * 0.5, -width * 0.8, length, 0);
    ctx.quadraticCurveTo(length * 0.5, width * 0.8, 0, width);
    ctx.arc(0, 0, width, Math.PI / 2, -Math.PI / 2);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, length, 0, [
      [0, stops[0]],
      [1, withAlpha(stops[1], 0)],
    ]);
    ctx.fill();
    ctx.restore();
  };
  trail(s * 0.22, tail, [withAlpha(METEOR_FIRE, 0.9), "#b91c1c"]);
  trail(s * 0.14, tail * 0.75, ["#fde047", METEOR_FIRE]);

  const rock = s * 0.16;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * TAU;
    const reach = rock * (i % 3 === 0 ? 0.82 : 1);
    ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fillStyle = radial(
    ctx,
    0,
    0,
    rock * 1.1,
    [
      [0, "#fef3c7"],
      [0.35, "#fb923c"],
      [0.7, "#7c2d12"],
      [1, "#292524"],
    ],
    -rock * 0.45,
    rock * 0.45,
  );
  ctx.fill();
  ctx.strokeStyle = "#1c1917";
  ctx.lineWidth = Math.max(1, s * 0.012);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-rock * 0.2, -rock * 0.5);
  ctx.lineTo(rock * 0.1, -rock * 0.05);
  ctx.lineTo(rock * 0.5, rock * 0.1);
  ctx.strokeStyle = withAlpha("#fde68a", 0.8);
  ctx.stroke();
}

/** A six-armed ice crystal centred on the origin, `s` across. */
export function paintSnowflake(ctx: CanvasRenderingContext2D, s: number, color = FROST_ICE): void {
  const reach = s * 0.44;
  circle(ctx, 0, 0, reach * 1.05);
  ctx.fillStyle = radial(ctx, 0, 0, reach * 1.05, [
    [0, withAlpha(color, 0.45)],
    [1, withAlpha(color, 0)],
  ]);
  ctx.fill();

  ctx.lineCap = "round";
  const strokeArms = (width: number, style: string): void => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * TAU - Math.PI / 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.moveTo(0, 0);
      ctx.lineTo(dx * reach, dy * reach);
      for (const [at, length] of [
        [0.5, 0.2],
        [0.78, 0.13],
      ] as const) {
        const bx = dx * reach * at;
        const by = dy * reach * at;
        for (const turn of [-0.8, 0.8]) {
          ctx.moveTo(bx, by);
          ctx.lineTo(
            bx + Math.cos(angle + turn) * reach * length,
            by + Math.sin(angle + turn) * reach * length,
          );
        }
      }
    }
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  strokeArms(Math.max(2, s * 0.11), darken(color, 0.55));
  strokeArms(Math.max(1, s * 0.055), lighten(color, 0.6));

  polygon(ctx, 6, s * 0.1, 0);
  ctx.fillStyle = radial(ctx, 0, 0, s * 0.1, [
    [0, "#ffffff"],
    [1, color],
  ]);
  ctx.fill();
}
