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

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("order_number", session.orderId)
      .single();

    if (orderErr || !order) return null;

    const [historyRes, stepsRes] = await Promise.all([
      supabase
        .from("order_status_history")
        .select("*")
        .eq("order_id", order.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("production_steps")
        .select("*")
        .order("position", { ascending: true }),
    ]);

    // `wo_photos` sengaja dibuang, persis seperti /api/track/session — foto WO
    // adalah dokumen internal, bukan untuk halaman customer.
    const { wo_photos: _wo, ...safeOrder } = order as any;

    return {
      order: safeOrder,
      history: historyRes.data || [],
      steps: (stepsRes.data ?? []) as StatusStep[],
    };
  } catch (e) {
    console.error("[status] gagal memuat data awal di server:", e);
    return null;
  }
}
