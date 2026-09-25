/**
 * Satu sumber kebenaran untuk "current_status → tahap produksi".
 *
 * Kenapa file ini ada: `current_status` punya 12 nilai, tapi daftar tahap
 * produksi cuma 11 (`ORDER_STATUS_LIST`). `"selesai"` sengaja TIDAK ada di
 * daftar tahap — dia status AKHIR dari keseluruhan order, bukan tahap ke-12.
 *
 * Sebelum ini, aturan "selesai = tahap terakhir / 100%" ditulis ulang di
 * 4 tempat berbeda (dashboard API, halaman /status, halaman /track/[order],
 * endpoint ensure-history) dan tiap tempat lupa meng-guard-nya sendiri-sendiri.
 * Sekarang semua konsumen memanggil fungsi di sini — satu bug, satu perbaikan.
 */
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_LIST,
  STEP_PROGRESS,
  type OrderStatus,
} from "@/lib/types";

/** Nilai `current_status` untuk order yang sudah tuntas. */
export const DONE_STATUS = "selesai";

/** Jumlah tahap produksi (11). */
export const TOTAL_STAGES = ORDER_STATUS_LIST.length;

/** Nomor tahap terakhir (11). */
export const FINAL_STAGE = TOTAL_STAGES;

/** Slug tahap lama (9 tahap) → slug 11 tahap yang sekarang dipakai. */
const LEGACY_STATUS_MAP: Record<string, string> = {
  print: "cetak_print",
  pres: "press_transfer",
  potong: "potong_pola",
};

/**
 * Rapikan status dari DB/history (lowercase + alias tahap lama).
 * Dipakai semua konsumen supaya baris lama tetap terbaca sebagai tahap yang benar.
 */
export function normalizeOrderStatus(raw: string | null | undefined): string {
  const slug = String(raw ?? "").trim().toLowerCase();
  return LEGACY_STATUS_MAP[slug] || slug;
}

/** true kalau order sudah tuntas (`"selesai"`). */
export function isOrderCompleted(status: string | null | undefined): boolean {
  return normalizeOrderStatus(status) === DONE_STATUS;
}

/**
 * Nomor tahap (1-11) dari `current_status`.
 * `"selesai"` = tahap terakhir. Status tak dikenal = tahap 1 (perilaku lama).
 */
export function stepFromStatus(
  status: string | null | undefined,
  order: OrderStatus[] = ORDER_STATUS_LIST
): number {
  if (isOrderCompleted(status)) return order.length;
  const idx = order.indexOf(normalizeOrderStatus(status) as OrderStatus);
  return idx >= 0 ? idx + 1 : 1;
}

/** Persentase progres (0-100) dari `current_status`. */
export function progressPercentFromStatus(
  status: string | null | undefined,
  hasTracking = false,
  order: OrderStatus[] = ORDER_STATUS_LIST
): number {
  const step = stepFromStatus(status, order);
  if (step === FINAL_STAGE && hasTracking) return 100;
  return STEP_PROGRESS[step] ?? 0;
}

/**
 * Label tahap berikutnya, atau null kalau tidak ada
 * (order sudah selesai / status tak dikenal / sudah di tahap akhir).
 */
export function nextStageLabel(
  status: string | null | undefined,
  order: OrderStatus[] = ORDER_STATUS_LIST
): string | null {
  if (isOrderCompleted(status)) return null;
  const idx = order.indexOf(normalizeOrderStatus(status) as OrderStatus);
  if (idx < 0 || idx >= order.length - 1) return null;
  const next = order[idx + 1];
  return ORDER_STATUS_LABELS[next] || next;
}

/** Slug tahap ke-`step` (1-11), fallback tahap pertama. */
export function statusFromStep(
  step: number,
  order: OrderStatus[] = ORDER_STATUS_LIST
): string {
  const clamped = Math.min(Math.max(Math.round(step) || 1, 1), TOTAL_STAGES);
  return order[clamped - 1] || order[0];
}

/**
 * Map slug status → nomor tahap (1-11).
 * Slug lama (`print`, `pres`, `potong`) ikut dipetakan, jadi pemanggil tidak
 * perlu menormalkan dulu untuk baris warisan di database.
 */
export function statusToStepMap(
  order: OrderStatus[] = ORDER_STATUS_LIST
): Record<string, number> {
  const map: Record<string, number> = {};
  order.forEach((status, index) => {
    map[status] = index + 1;
  });
  for (const [legacy, current] of Object.entries(LEGACY_STATUS_MAP)) {
    if (map[current]) map[legacy] = map[current];
  }
  return map;
}

export const STATUS_TO_STAGE: Record<string, number> = statusToStepMap();

/**
 * Nama tahap untuk pesan WhatsApp dan UI (mis. tahap 4 → "Cetak / Print").
 * Labelnya sama persis dengan `ORDER_STATUS_LABELS`, jadi template pesan tidak
 * punya daftar nama sendiri yang bisa basi.
 */
export function stageLabel(
  step: number,
  order: OrderStatus[] = ORDER_STATUS_LIST
): string {
  const slug = statusFromStep(step, order);
  return ORDER_STATUS_LABELS[slug as OrderStatus] || `Tahap ${step}`;
}

/**
 * Catatan default untuk baris history yang di-backfill endpoint
 * /api/track/ensure-history (key = slug tahap).
 */
export const STAGE_BACKFILL_NOTES: Record<string, string> = {
  desain: "Desain sedang dikerjakan",
  layout: "Layout sedang disusun",
  profing_warna: "Proses profing warna",
  cetak_print: "Proses printing/sublimasi",
  press_transfer: "Proses pres transfer",
  potong_pola: "Bahan sedang dipotong",
  jahit: "Proses penjahitan",
  finishing: "Quality control & finishing",
  quality_control: "Quality control & finishing",
  packing: "Pesanan sedang dikemas",
  kirim: "Proses pengiriman",
};
