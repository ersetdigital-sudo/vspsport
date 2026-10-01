/**
 * Kerangka dashboard admin — dipakai `app/pesanan/orders/loading.tsx` dan
 * `app/pesanan/maklon/loading.tsx`.
 *
 * Kenapa ada: kedua halaman itu membaca order di server (lib/pesanan-server.ts,
 * lib/maklon-server.ts). Selama pembacaan itu berjalan, Next.js menampilkan isi
 * `loading.tsx` sebagai Suspense fallback — kalau berkasnya tidak ada, yang
 * tampil adalah layar kosong ("blank dulu, datanya muncul belakangan").
 *
 * Kelas `.pas-*` yang sama dengan halaman aslinya dipakai supaya lebar sidebar,
 * tinggi topbar, dan jarak kartunya identik — isi aslinya tidak "melompat" saat
 * muncul. Di layar kecil sidebar-nya ikut hilang sendiri, karena aturan
 * `@media (max-width: 900px) { .pas-side { display: none } }`.
 */
export default function AdminSkeleton() {
  return (
    <div className="pas-shell" aria-busy="true" aria-live="polite">
      <aside className="pas-side">
        <span className="pas-brand">
          <span className="pas-brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-vsp.png" alt="" aria-hidden="true" />
          </span>
          <span className="block text-center">
            <span className="pas-brand-name">VSP Sport</span>
            <span className="pas-brand-sub">Admin Panel</span>
          </span>
        </span>

        <p className="pas-navsec">Operasional</p>
        <nav className="flex flex-col gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-11 rounded-[10px] bg-white/[.06] animate-pulse"
            />
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="pas-topbar">
          <div className="px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="pas-kicker block">Memuat data</span>
              <span className="block h-6 w-40 rounded-lg bg-[rgba(40,25,18,.08)] animate-pulse mt-1.5" />
            </div>
          </div>
        </header>

        <main className="px-5 sm:px-8 py-7 sm:py-9 w-full">
          {/* KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pas-card h-[112px] animate-pulse" />
            ))}
          </div>

          {/* Tabel */}
          <section className="pas-card mt-6 p-2 sm:p-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded-xl bg-[rgba(40,25,18,.06)] animate-pulse mb-2"
              />
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
