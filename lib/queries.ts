/**
 * Server-side data access — identitas toko.
 *
 * Aplikasi ini fokus ke dashboard operasional (pesanan, maklon, tracking).
 * Layer data untuk landing page/katalog sudah dibuang bersama tabelnya
 * (lihat migrasi 0029) — satu-satunya konten yang masih dibaca dari Supabase
 * adalah baris `brand`, yang dipakai halaman depan, metadata, dan halaman
 * tracking customer untuk nama toko + nomor WhatsApp CS.
 *
 * Fungsi ini mencoba Supabase dulu, lalu jatuh ke nilai statis di
 * lib/data.ts kalau database tidak terjangkau atau barisnya tidak ada —
 * supaya halaman publik tidak ikut mati saat database bermasalah.
 */
import {
  createClient,
  createServiceClient,
  serviceRoleConfigured,
  supabaseConfigured,
} from "@/lib/supabase/server";
import * as fallback from "@/lib/data";
import type { Brand, DbBrand } from "@/lib/types";

/**
 * Cache pendek di memori proses.
 *
 * Kenapa perlu: `getBrand()` dipanggil metadata root layout pada SETIAP request
 * (app/layout.tsx → generateMetadata), dan `getOperationalHours()` dipanggil
 * halaman /track. Masing-masing satu round trip ke Supabase yang berada di
 * jalur kritis — HTML pertama tidak bisa dikirim sebelum keduanya selesai —
 * padahal isinya hanya berubah saat admin mengedit menu Pengaturan.
 *
 * TTL 60 detik: perubahan dari menu Pengaturan tetap terlihat cepat, tapi
 * request berikutnya tidak lagi membayar round trip yang sama. Cache ini
 * per-instance (serverless tidak berbagi memori antar instance) — cukup, karena
 * tujuannya menghindari pengulangan, bukan konsistensi global.
 */
const IDENTITY_CACHE_TTL_MS = 60_000;

let brandCache: { value: Brand; at: number } | null = null;
let hoursCache: { value: string; at: number } | null = null;

/**
 * Buang cache identitas toko setelah admin menyimpannya dari menu Pengaturan,
 * supaya nama/nomor WhatsApp/jam operasional yang baru langsung dipakai halaman
 * publik — tidak menunggu TTL 60 detik habis. Dipanggil endpoint
 * `/api/admin/profil-toko`.
 */
export function invalidateIdentityCache(): void {
  brandCache = null;
  hoursCache = null;
}

/** Baca baris `brand` dari database; `null` = gagal/tidak ada. */
async function loadBrandFromDb(): Promise<Brand | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brand")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as DbBrand;
  return {
    name: row.name,
    monogram: row.monogram,
    tagline: row.tagline,
    description: row.description,
    whatsappNumber: row.whatsapp_number,
    logoPath: row.logo_path,
  };
}

export async function getBrand(): Promise<Brand> {
  if (brandCache && Date.now() - brandCache.at < IDENTITY_CACHE_TTL_MS) {
    return brandCache.value;
  }

  const fromDb = await loadBrandFromDb();
  if (fromDb) {
    brandCache = { value: fromDb, at: Date.now() };
    return fromDb;
  }

  // Hasil cadangan TIDAK di-cache: kalau database sedang bermasalah, halaman
  // berikutnya harus mencoba lagi, bukan menyajikan nilai cadangan selama 60
  // detik penuh setelah database pulih.
  return fallback.brand;
}

/**
 * Jam operasional toko dari `app_settings` (kunci `jam_operasional`), dengan
 * cadangan lib/data.ts kalau belum diisi atau database tidak terjangkau.
 *
 * Dipakai halaman publik (beranda & tracking) supaya teksnya ikut berubah saat
 * admin mengubahnya di menu Pengaturan — dulu jam ini ditulis langsung di
 * halaman tracking, jadi nilai di database dan yang tampil bisa berbeda.
 *
 * Kenapa service role: policy RLS `app_settings` sengaja tidak dibuka untuk
 * anon — tabel yang sama juga menyimpan token Fonnte (walau terenkripsi),
 * sehingga tabelnya tidak boleh dibaca publik. Yang dibaca di sini cuma satu
 * kunci, dan hasilnya memang untuk ditampilkan.
 */
export async function getOperationalHours(): Promise<string> {
  if (hoursCache && Date.now() - hoursCache.at < IDENTITY_CACHE_TTL_MS) {
    return hoursCache.value;
  }

  if (!serviceRoleConfigured()) return fallback.JAM_OPERASIONAL;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "jam_operasional")
    .maybeSingle();

  // Sama seperti getBrand(): yang di-cache hanya bacaan database yang berhasil.
  if (error || !data?.value?.trim()) return fallback.JAM_OPERASIONAL;

  hoursCache = { value: data.value, at: Date.now() };
  return data.value;
}
