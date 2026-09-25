/**
 * Urutan tahap produksi yang EFEKTIF — sumbernya tabel `production_steps`.
 *
 * Kenapa file ini ada: dulu nomor tahap (1-11) selalu diterjemahkan lewat
 * `ORDER_STATUS_LIST` yang ditulis mati di kode, sementara nama tahap yang
 * tampil di dashboard & halaman customer diambil dari tabel ini BERDASARKAN
 * POSISI. Begitu admin menggeser urutan di menu Pengaturan, dua hal itu jadi
 * bertentangan: dashboard menampilkan "Profing Warna" untuk tahap 2, sementara
 * notifikasi WhatsApp tetap menyebut "Layout" (dan sebaliknya).
 *
 * Sekarang urutan tabel dipakai untuk SEMUA terjemahan nomor ⇄ tahap, jadi
 * menggeser urutan di menu Pengaturan berlaku serentak di dashboard, halaman
 * customer, dan pesan WhatsApp.
 *
 * File ini SENGAJA hanya berisi fungsi murni (tanpa akses database) supaya aman
 * diimpor komponen client. Pembacaan tabel ada di lib/step-order-server.ts.
 *
 * Catatan penting: nama tahap di tabel TIDAK boleh diubah dari dashboard (lihat
 * PUT /api/pesanan/steps). Kalau namanya bukan lagi nama kanonik, slug tidak
 * bisa ditentukan dan fungsi di sini menolak urutan itu — dipakai urutan bawaan
 * supaya nomor tahap tidak pernah salah tafsir.
 */
import { ORDER_STATUS_LABELS, ORDER_STATUS_LIST, type OrderStatus } from "@/lib/types";

/** Daftar slug tahap, urut sesuai alur produksi yang berlaku. */
export type StepOrder = OrderStatus[];

/** Urutan bawaan dari kode — dipakai kalau tabel kosong/rusak. */
export const CANONICAL_STEP_ORDER: StepOrder = ORDER_STATUS_LIST;

/** Label kanonik (huruf kecil) → slug. */
const LABEL_TO_SLUG = new Map<string, OrderStatus>(
  (Object.entries(ORDER_STATUS_LABELS) as [OrderStatus, string][]).map(
    ([slug, label]) => [label.trim().toLowerCase(), slug]
  )
);

/** Nama tahap (teks apa pun dari DB/UI) → slug kanonik. null kalau tidak dikenal. */
export function slugFromStepName(name: string | null | undefined): OrderStatus | null {
  return LABEL_TO_SLUG.get(String(name ?? "").trim().toLowerCase()) ?? null;
}

/**
 * Label kanonik untuk sebuah slug (kebalikan `slugFromStepName`).
 * Dipakai untuk menampilkan nama tahap tanpa bergantung pada urutan.
 */
export function labelFromSlug(slug: OrderStatus): string {
  return ORDER_STATUS_LABELS[slug] ?? String(slug);
}

/**
 * Baris `production_steps` → daftar slug berurutan.
 *
 * Kembali ke urutan kanonik kalau isinya tidak bisa dipercaya: jumlahnya bukan
 * 11, ada nama yang tidak dikenal, atau ada nama kembar. Lebih baik memakai
 * urutan bawaan daripada salah menerjemahkan nomor tahap pesanan.
 */
export function resolveStepOrder(
  rows: { name: string; position: number }[] | null | undefined
): StepOrder {
  const sorted = [...(rows ?? [])].sort((a, b) => a.position - b.position);
  if (sorted.length !== CANONICAL_STEP_ORDER.length) return CANONICAL_STEP_ORDER;

  const slugs = sorted.map((row) => slugFromStepName(row.name));
  if (slugs.some((slug) => !slug)) return CANONICAL_STEP_ORDER;
  if (new Set(slugs).size !== CANONICAL_STEP_ORDER.length) return CANONICAL_STEP_ORDER;

  return slugs as StepOrder;
}

/** true kalau daftar baris yang dikirim masih memuat nama tahap yang sama persis. */
export function isSameStepNames(
  current: { name: string }[] | null | undefined,
  next: { name: string }[] | null | undefined
): boolean {
  const a = (current ?? []).map((r) => r.name.trim().toLowerCase()).sort();
  const b = (next ?? []).map((r) => String(r?.name ?? "").trim().toLowerCase()).sort();
  return a.length === b.length && a.every((name, i) => name === b[i]);
}
