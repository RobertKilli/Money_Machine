export interface AssetQuantity {
  readonly assetId: string;
  readonly atomicUnits: bigint;
  readonly quantityScale: number;
}

function assertScale(scale: number, label: string): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) {
    throw new Error(`${label} scale must be an integer from 0 through 8`);
  }
}

export function quantity(assetId: string, atomicUnits: bigint, quantityScale: number): AssetQuantity {
  if (!assetId) throw new Error("Asset ID is required");
  assertScale(quantityScale, "Quantity");
  return Object.freeze({ assetId, atomicUnits, quantityScale });
}

export function assertQuantityIncrement(value: AssetQuantity, minimumIncrementAtoms: bigint): void {
  if (minimumIncrementAtoms <= 0n) {
    throw new Error("Minimum quantity increment must be positive");
  }
  if (value.atomicUnits % minimumIncrementAtoms !== 0n) {
    throw new Error("Quantity is not aligned to the asset minimum increment");
  }
}
