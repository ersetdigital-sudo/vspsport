import { NextResponse, type NextRequest } from "next/server";

/**
 * Root middleware — sengaja SELF-CONTAINED (tanpa import alias `@/...`).
 *
 * Kenapa: middleware di-deploy sebagai berkas tersendiri, dan pada build
 * production berkas itu bisa di-emit mentah. Kalau dia mengimpor `@/lib/...`
 * (alias tsconfig), Node tidak bisa me-resolve-nya dan semua request gagal
 * dengan MIDDLEWARE_INVOCATION_FAILED. Karena itu hanya paket npm biasa
 * (`next/server`) yang diimpor di sini.
 *
 * Isinya sekarang cuma SATU hal: menitipkan pathname ke header `x-pathname`,
 * yang dipakai app/pesanan/layout.tsx untuk tahu halaman mana yang sedang dibuka
 * (`/pesanan/login` tidak boleh kena cek cookie).
 *
 * DULU berkas ini juga menyegarkan sesi Supabase lewat `supabase.auth.getUser()`
 * untuk SETIAP request. Dua alasan kenapa itu dihapus:
 *   1. Aplikasi ini tidak punya Supabase Auth sama sekali — login dashboard
 *      memakai shared password + cookie `pesanan_auth` (app/api/pesanan/auth),
 *      dan tidak ada halaman /admin. Jadi panggilan itu hasilnya tidak pernah
 *      dipakai, tapi biayanya nyata: satu round trip HTTP ke Supabase sebelum
 *      request dilanjutkan. Itu yang bikin halaman publik seperti /status dan
 *      /track terasa lambat.
 *   2. `matcher` di bawah juga dipersempit ke rute dashboard, jadi halaman
 *      publik & endpoint API tidak lagi melewati middleware sama sekali.
 *
 * Penjagaan dashboard yang sebenarnya ada di app/pesanan/layout.tsx (cookie
 * `pesanan_auth`) dan lib/admin-auth.ts untuk route handler.
 */

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  /*
   * HANYA rute dashboard. Halaman publik (/status, /track, /status/maklon) dan
   * seluruh /api/* tidak perlu header ini, jadi jangan dibebani middleware.
   */
  matcher: ["/pesanan/:path*"],
};
