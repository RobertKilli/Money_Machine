export interface BasisPoints {
  readonly value: bigint;
}

export const BASIS_POINTS_PER_WHOLE = 10_000n;

export function basisPoints(value: bigint): BasisPoints {
  if (value < 0n || value > BASIS_POINTS_PER_WHOLE) {
    throw new Error("Basis points must be between 0 and 10000");
  }
  return Object.freeze({ value });
}
