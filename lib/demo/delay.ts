/** Random 1–3 s pause so demo loading screens are visible. */
export function demoDelay(minMs = 1000, maxMs = 3000): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
