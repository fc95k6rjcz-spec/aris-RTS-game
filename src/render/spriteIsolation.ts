/** Keep the main connected silhouette, excluding fragments from adjacent poses. */
export function isolateSilhouette(data: Uint8ClampedArray, width: number, height: number): void {
  const labels = new Int32Array(width * height);
  const queue = new Int32Array(labels.length);
  let label = 0, largest = 0, largestSize = 0;
  for (let pixel = 0; pixel < labels.length; pixel++) {
    if (labels[pixel] || data[pixel * 4 + 3]! < 32) continue;
    label++;
    let head = 0, tail = 1;
    queue[0] = pixel; labels[pixel] = label;
    while (head < tail) {
      const at = queue[head++]!, x = at % width, y = Math.floor(at / width);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (!labels[next] && data[next * 4 + 3]! >= 32) {
          labels[next] = label; queue[tail++] = next;
        }
      }
    }
    if (tail > largestSize) { largestSize = tail; largest = label; }
  }
  for (let i = 0; i < labels.length; i++) if (labels[i] !== largest) data[i * 4 + 3] = 0;
}
