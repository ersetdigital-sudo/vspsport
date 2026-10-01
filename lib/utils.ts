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

/**
 * Kalimat error halaman tracking untuk tiap status balasan `/api/track`.
 *
 * Dulu `/track` menulis "Nomor pesanan tidak ditemukan" dan `/status` menulis
 * "Nomor HP tidak cocok" untuk SEMUA respons gagal — termasuk saat yang salah
 * justru satunya lagi, atau saat servernya yang error (500). Pemetaannya
 * ditaruh di sini supaya kedua halaman menyebut hal yang sama untuk kode yang
 * sama; 403 vs 404 sendiri dipisah di app/api/track/route.ts.
 */
export function trackErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Nomor pesanan dan nomor HP wajib diisi.";
    case 403:
      return "Nomor HP tidak cocok dengan pesanan ini. Gunakan nomor HP yang dipakai saat order.";
    case 404:
      return "Nomor pesanan tidak ditemukan. Cek lagi formatnya (contoh: VSP260907K4XQ) atau hubungi admin.";
    default:
      return "Server sedang bermasalah. Coba lagi sebentar lagi atau hubungi admin.";
  }
}