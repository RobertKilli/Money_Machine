export interface M5DatasetPinValue {
  readonly providerId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
}

const PREFIX = "m5-pin/v1:";

const valid = (value: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("M5_DATASET_PIN_INVALID");
  return value.trim();
};

const key = (pin: M5DatasetPinValue): string => JSON.stringify([pin.providerId, pin.datasetId, pin.datasetVersion]);
const compare = (left: M5DatasetPinValue, right: M5DatasetPinValue): number => {
  for (const field of ["providerId", "datasetId", "datasetVersion"] as const) {
    if (left[field] < right[field]) return -1;
    if (left[field] > right[field]) return 1;
  }
  return 0;
};

export function normalizeM5DatasetPinValues(values: readonly M5DatasetPinValue[]): readonly M5DatasetPinValue[] {
  const pins = new Map<string, M5DatasetPinValue>();
  const versions = new Map<string, string>();
  for (const value of values) {
    const pin = { providerId: valid(value.providerId), datasetId: valid(value.datasetId), datasetVersion: valid(value.datasetVersion) };
    const providerDataset = JSON.stringify([pin.providerId, pin.datasetId]);
    const previous = versions.get(providerDataset);
    if (previous && previous !== pin.datasetVersion) throw new Error("M5_DATASET_PIN_CONFLICT");
    versions.set(providerDataset, pin.datasetVersion);
    pins.set(key(pin), Object.freeze(pin));
  }
  if (!pins.size) throw new Error("M5_DATASET_PIN_INVALID");
  return Object.freeze([...pins.values()].sort(compare));
}

export function encodeM5DatasetPin(pin: M5DatasetPinValue): string {
  const value = [valid(pin.providerId), valid(pin.datasetId), valid(pin.datasetVersion)] as const;
  return `${PREFIX}${Buffer.from(JSON.stringify(value), "utf8").toString("base64url")}`;
}

export function decodeM5DatasetPin(encoded: string): M5DatasetPinValue {
  if (!encoded.startsWith(PREFIX)) throw new Error("M5_DATASET_PIN_VERSION_INVALID");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded.slice(PREFIX.length), "base64url").toString("utf8")); } catch { throw new Error("M5_DATASET_PIN_INVALID"); }
  if (!Array.isArray(value) || value.length !== 3 || value.some(item => typeof item !== "string" || !item.trim())) throw new Error("M5_DATASET_PIN_INVALID");
  return { providerId: valid(value[0] as string), datasetId: valid(value[1] as string), datasetVersion: valid(value[2] as string) };
}

/** Canonical stored form: decoded, normalized triples re-encoded in tuple order. */
export function normalizeM5DatasetPins(encoded: readonly string[]): readonly string[] {
  return Object.freeze(normalizeM5DatasetPinValues(encoded.map(decodeM5DatasetPin)).map(encodeM5DatasetPin));
}

export const M5_DATASET_PIN_ENCODING_VERSION = "m5-pin/v1";
