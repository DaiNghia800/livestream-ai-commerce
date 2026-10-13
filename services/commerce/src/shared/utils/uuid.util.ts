const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val: string): boolean {
  return UUID_REGEX.test(val);
}

export function isValidProductId(val: string): boolean {
  if (typeof val !== "string") return false;
  if (isValidUuid(val)) return true;
  // Support numeric catalog product IDs (BIGINT represented as positive integer)
  return /^[1-9]\d*$/.test(val.trim());
}

export function isValidVariantId(val: string): boolean {
  if (typeof val !== "string") return false;
  if (isValidUuid(val)) return true;
  return /^[1-9]\d*$/.test(val.trim());
}
