// Krumhansl major profile. Rotated across the twelve candidate tonics.
export const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
]
// Krumhansl minor profile (natural/harmonic blend).
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
export function correlation(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / 12,
    mb = b.reduce((x, y) => x + y, 0) / 12
  let numerator = 0,
    va = 0,
    vb = 0
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma,
      y = b[i] - mb
    numerator += x * y
    va += x * x
    vb += y * y
  }
  return va && vb ? numerator / Math.sqrt(va * vb) : 0
}
