/**
 * Pembacaan data awal halaman /status langsung di server.
 *
 * Kenapa ada: `/status` cuma mengirim kerangka HTML, jadi customer melihat
 * layar kosong dulu sampai JS jalan → verifikasi → fetch `/api/track/session`
 * → fetch ulang `/api/track/ensure-history`. Di jaringan seluler itu terasa
 * sebagai "halaman status-nya lama sekali".
 *
 * Sekarang, kalau URL membawa token sesi yang SAH (`?token=…`, dari link
 * notifikasi WA) dan cocok dengan nomor pesanan di URL, order + riwayat + tahap
 * dibaca di server dan dikirim sebagai prop `initial` — jadi HTML pertama sudah
 * berisi progres pesanan.
 *
 * Otorisasinya SAMA dengan `/api/track/session`: token HMAC bertanda tangan
 * (lib/verify-token.ts). Itulah sebabnya service role boleh dipakai di sini —
 * policy anon pada `orders` sudah ditutup (migrasi 0027). Tidak ada token,
 * token kedaluwarsa, atau nominal pesanan tidak cocok → `null`, dan halaman
 * jatuh ke alur verifikasi HP seperti sebelumnya.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/verify-token";

export type StatusStep = { name: string; position: number };

export type StatusInitial = {
  order: any;
  history: any[];
  steps: StatusStep[];
};

/** `null` = tidak ada token sah → halaman jalan lewat alur client. */
export async function loadStatusInitial(
  orderNumber: string,
  token: string | null
): Promise<StatusInitial | null> {
  if (!orderNumber || !token) return null;

  const session = verifyToken(token);
  if (!session || session.orderId !== orderNumber) return null;

  try {
    const supabase = createServiceClient();

    // SATU round trip untuk data pesanannya: riwayat ikut dikirim PostgREST
    // lewat relasi FK `order_status_history.order_id → orders.id` (migrasi
    // 0001, jadi embed-nya sah), dan daftar tahap diambil bersamaan karena tidak
    // bergantung pada order-nya.
    //
    // Dulu urutannya tiga query: baca order → baru baca riwayat + tahap. Tiap
    // round trip ke database (dan tiap baris kode yang menunggunya) terasa
    // langsung sebagai halaman status yang lambat.
    const [orderRes, stepsRes] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_status_history(*)")
        .eq("order_number", session.orderId)
        .maybeSingle(),
      supabase
        .from("production_steps")
        .select("*")
        .order("position", { ascending: true }),
    ]);

    if (orderRes.error || !orderRes.data) return null;

    // `wo_photos` sengaja dibuang, persis seperti /api/track/session — foto WO
    // adalah dokumen internal, bukan untuk halaman customer.
    const {
      order_status_history: historyRows,
      wo_photos: _wo,
      ...safeOrder
    } = orderRes.data as any;

    // Urutan riwayat dirapikan di sini, bukan lewat `.order(...)` pada resource
    // bersarang, supaya tidak bergantung pada detail sintaks PostgREST. Jumlah
    // barisnya kecil (maksimal sebanyak tahap produksi).
    const history = ((historyRows ?? []) as any[])
      .slice()
      .sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at))
      );

    return {
      order: safeOrder,
      history,
      steps: (stepsRes.data ?? []) as StatusStep[],
    };
  } catch (e) {
    console.error("[status] gagal memuat data awal di server:", e);
    return null;
  }
}
