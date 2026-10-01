/**
 * Tanggal "target selesai" untuk halaman customer.
 *
 * Kenapa jamnya dibuang: kolom `deadline` bertipe timestamptz, tapi admin
 * mengisinya dari `<input type="date">` sehingga nilainya tersimpan sebagai
 * tengah malam UTC. Kalau jamnya ikut ditampilkan dalam WIB, hasilnya jadi
 * "07.00" — angka yang tidak pernah dipilih siapa pun dan bikin customer
 * bertanya-tanya. Yang benar-benar dipakai sistem cuma TANGGAL-nya, jadi
 * perbandingan pun dilakukan antar tanggal WIB.
 *
 * Zona waktunya diambil dari lib/format-date.ts supaya cuma ada satu definisi
 * "WIB" di seluruh aplikasi.
 */
import { APP_TIME_ZONE } from "@/lib/format-date";

type DateInput = string | number | Date | null | undefined;

/** `2026-10-12` menurut WIB, atau "" kalau kosong/tidak valid. */
function dateKey(value: DateInput): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * `12 Okt 2026` — tanggal target tanpa jam.
 * Mengembalikan "" untuk nilai kosong/tidak valid, supaya UI tidak pernah
 * menampilkan "Invalid Date".
 */
export function formatTargetDate(value: DateInput): string {
  if (value === null || value === undefined || value === "") return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * Jarak hari menuju tanggal target, dihitung per tanggal WIB (jam diabaikan).
 * `null` untuk nilai kosong/tidak valid.
 */
export function daysUntilDeadline(value: DateInput): number | null {
  const key = dateKey(value);
  if (!key) return null;
  const target = Date.parse(`${key}T00:00:00Z`);
  const today = Date.parse(`${dateKey(new Date())}T00:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

/**
 * Keterangan singkat jarak ke tanggal target, mis. `hari ini`, `3 hari lagi`,
 * `lewat 2 hari`. Dipakai sebagai penjelas label "Target Selesai" supaya
 * customer langsung paham tanggal itu artinya apa.
 */
export function formatDeadlineNote(value: DateInput): string {
  const diff = daysUntilDeadline(value);
  if (diff === null) return "";
  if (diff === 0) return "hari ini";
  return diff > 0 ? `${diff} hari lagi` : `lewat ${Math.abs(diff)} hari`;
}
