import type { SpriteSurface } from "./sprite-cache";

/** Browser adapter for offscreen drawing: a detached canvas element. */
export function canvasSurface(width: number, height: number): SpriteSurface {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not supported in this browser.");
  return { image: canvas, context };
}
