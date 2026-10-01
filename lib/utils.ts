import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Label jumlah pcs siap tampil.
 *
 * `quantity` dari API sudah berbentuk string berisi satuan ("12 pcs"), sementara
 * di layar ditulis `{quantity} pcs` — hasilnya "12 pcs pcs". Helper ini menambah
 * satuan HANYA kalau belum ada, dan menjaga nilai kosong/"-" tetap "-"
 * (bukan "- pcs").
 */
export function pcsLabel(quantity: string | number | null | undefined): string {
  const raw = String(quantity ?? "").trim();
  if (!raw || raw === "-") return "-";
  return /(^|\s)pcs$/i.test(raw) ? raw : `${raw} pcs`;
}