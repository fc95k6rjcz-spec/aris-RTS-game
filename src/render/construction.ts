import source from "../assets/anim/townhall-construction.png";
import { spriteImage } from "./sprites";

let prepared: HTMLCanvasElement | null = null;

/** Import the contact sheet once, keying its neutral preview backdrop. */
export function constructionSheet(): HTMLCanvasElement | null {
  if (prepared) return prepared;
  const img = spriteImage(source);
  if (!img) return null;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  const count = canvas.width * canvas.height;
  const seen = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const visit = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    const k = i * 4;
    const hi = Math.max(d[k]!, d[k + 1]!, d[k + 2]!);
    const lo = Math.min(d[k]!, d[k + 1]!, d[k + 2]!);
    if (hi - lo > 22 || lo < 85) return;
    d[k + 3] = 0;
    queue[tail++] = i;
  };
  // Seed borders and cell gutters; enclosed neutral armour remains intact.
  for (let y = 0; y < canvas.height; y++) {
    for (let col = 0; col <= 4; col++) visit(y * canvas.width + Math.min(canvas.width - 1, Math.floor(col * canvas.width / 4)));
  }
  for (let x = 0; x < canvas.width; x++) {
    visit(x); visit((canvas.height - 1) * canvas.width + x);
    visit(Math.floor(canvas.height / 2) * canvas.width + x);
  }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % canvas.width;
    if (x > 0) visit(i - 1);
    if (x < canvas.width - 1) visit(i + 1);
    if (i >= canvas.width) visit(i - canvas.width);
    if (i < count - canvas.width) visit(i + canvas.width);
  }
  ctx.putImageData(pixels, 0, 0);
  prepared = canvas;
  return canvas;
}

/** A fixed footprint and eased crossfades keep construction from jumping. */
export function drawFoundingHall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, progress: number, tick = 0): boolean {
  const sheet = constructionSheet();
  if (!sheet) return false;
  const frame = Math.max(0, Math.min(7, progress * 7));
  const first = Math.floor(frame);
  const fraction = frame - first;
  const mix = fraction * fraction * (3 - 2 * fraction);
  const sw = sheet.width / 4, sh = sheet.height / 2;
  const size = w * 1.08;
  const draw = (i: number, opacity: number) => {
    ctx.globalAlpha = opacity;
    ctx.drawImage(sheet, (i % 4) * sw, Math.floor(i / 4) * sh, sw, sh,
      x - w * 0.04, y + w * 1.07 - size, size, size);
  };
  ctx.save();
  draw(first, 1 - mix);
  if (first < 7) draw(first + 1, mix);
  if (tick > 0 && progress < .97) {
    const anchors = [[.31,.59],[.53,.49],[.59,.48],[.79,.58],[.22,.68],[.33,.64],[.42,.70],[.29,.69]];
    const hand = anchors[Math.round(frame)]!;
    const hx = x + w * hand[0]!, hy = y + w * hand[1]!;
    ctx.globalAlpha = .95; ctx.translate(hx,hy);
    ctx.rotate(-.5 + Math.sin(tick * .3) * .65);
    ctx.strokeStyle = "#b78b51"; ctx.lineWidth = Math.max(1.5,w*.012);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-w*.075); ctx.stroke();
    ctx.fillStyle="#b9bbc0"; ctx.fillRect(-w*.022,-w*.083,w*.044,w*.02);
  }
  ctx.restore();
  return true;
}

