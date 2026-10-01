/**
 * Suspense fallback rute `/status`.
 *
 * Halaman status membaca order + riwayat di server lebih dulu (lib/status-server.ts).
 * Selama pembacaan itu, kerangka gelap ini yang tampil — bukan layar kosong.
 * Warnanya sengaja sama dengan halaman aslinya (`.trk-*` / `.dpo-*`) supaya
 * peralihannya tidak terasa berkedip.
 */
export default function StatusLoading() {
  return (
    <div className="trk-bg min-h-screen">
      <div className="trk-aurora" aria-hidden="true" />
      <div className="trk-grid min-h-screen">
        <div className="trk-glow">
          <header className="dpo-topbar sticky top-0 z-30 border-b border-white/[.07] bg-[rgba(10,10,11,.72)] backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-vsp-mark.png"
                alt=""
                aria-hidden="true"
                className="h-8 w-auto shrink-0"
              />
              <div className="leading-tight">
                <p className="trk-display text-[14.5px] font-semibold uppercase tracking-wide sm:text-[15px]">
                  VSP Sport
                </p>
                <p className="text-[10.5px] text-[#7E6F66] sm:text-[11px]">
                  Detail Progres Pesanan
                </p>
              </div>
            </div>
          </header>

          <main
            className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6 pt-7 sm:pt-12"
            aria-busy="true"
            aria-live="polite"
          >
            <div className="dpo-card p-5 sm:p-6 animate-pulse">
              <div className="h-3.5 w-40 rounded-full bg-white/[.08]" />
              <div className="mt-3.5 h-8 w-[min(100%,320px)] rounded-xl bg-white/[.1]" />
              <div className="mt-6 h-2.5 w-full rounded-full bg-white/[.06]" />
              <div className="mt-2.5 flex justify-between">
                <div className="h-3 w-16 rounded-full bg-white/[.06]" />
                <div className="h-3 w-16 rounded-full bg-white/[.06]" />
              </div>
            </div>

            <div className="dpo-card mt-9 p-5 sm:p-6 animate-pulse">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="mb-2.5 h-12 rounded-xl bg-white/[.05] last:mb-0"
                />
              ))}
            </div>

            <p className="mt-6 text-center text-[12.5px] text-[#7E6F66]">
              Memuat progres pesanan…
            </p>
          </main>
        </div>
      </div>
    </div>
  );
}
