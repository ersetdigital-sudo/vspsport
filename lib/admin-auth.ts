import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Cek akses admin untuk route handler & pembacaan data di server.
 *
 * SATU sumber auth: cookie `pesanan_auth=true`, yang di-set oleh
 * `/api/pesanan/auth` setelah password bersama diverifikasi. Cookie ini hanya
 * bisa di-set server, dan nilainya harus persis "true" — nilai lain (mis.
 * "asdf") ditolak, sama seperti cek di app/pesanan/layout.tsx.
 *
 * DULU fungsi ini punya jalur kedua: "user Supabase authenticated" (warisan
 * repo referensi, untuk halaman /admin yang sudah tidak ada). Jalur itu dihapus
 * bersama penyegaran sesi di middleware.ts — tidak ada satu pun
 * `signInWithPassword` di aplikasi ini, jadi jalur tersebut tidak pernah
 * terpakai dan cuma membuat kode ini seolah punya dua cara autentikasi.
 */
export async function hasAdminAccess(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("pesanan_auth")?.value === "true";
}

/**
 * Guard standar untuk route handler dashboard.
 *
 * Mengembalikan service-role client bila request terautentikasi, atau `null`
 * bila tidak — pemanggil tinggal membalas 401.
 *
 * Kenapa service role: policy anon pada tabel operasional (orders,
 * order_status_history, maklon_orders, maklon_status_history) sudah ditutup
 * di migrasi 0027, jadi satu-satunya jalur ke tabel itu adalah service role.
 * Otorisasi TIDAK boleh lagi diandalkan dari RLS — karena itu cek admin
 * dilakukan di sini, sekali, sebelum query apa pun dijalankan.
 *
 *   const db = await getAdminDb();
 *   if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 */
export async function getAdminDb(): Promise<SupabaseClient | null> {
  if (!(await hasAdminAccess())) return null;
  return createServiceClient();
}