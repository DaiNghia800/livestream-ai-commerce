import { WARDS_BY_PROVINCE, type CurrentWard } from "./ward-catalog.js";

export function listCurrentWards(provinceName: string): CurrentWard[] {
  return WARDS_BY_PROVINCE[provinceName] ?? [];
}

export function findCurrentWard(
  provinceName: string,
  wardCode: string
): CurrentWard | undefined {
  return listCurrentWards(provinceName).find((ward) => ward.code === wardCode);
}
