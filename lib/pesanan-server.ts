/**
 * Pembacaan data awal Dashboard Pesanan langsung di server.
 *
 * Kenapa ada: `/pesanan/orders` cuma merender komponen client, jadi HTML
 * pertamanya kosong dan daftar order baru muncul setelah JS jalan → client
 * memanggil `/api/pesanan/orders`. Di jaringan seluler itu terasa sebagai
 * "dashboard-nya lama".
 *
 * Halaman sekarang membaca order + tahap produksi di server dan mengirimnya
 * sebagai prop `initial`, sehingga HTML pertama sudah berisi daftar order.
 * Sesudah itu dashboard tetap menyegarkan sendiri lewat API seperti biasa.
 *
 * Client yang dipakai SAMA dengan `/api/pesanan/orders` + `/api/pesanan/steps`
 * (lihat lib/admin-auth.ts): service role, tapi hanya setelah cookie login
 * `pesanan_auth` / user Supabase terverifikasi. Jadi hak bacanya tidak berubah
 * sedikit pun — permintaan yang belum login tetap `null` dan dashboard jalan
 * lewat alur client seperti sebelumnya.
 */
import { getAdminDb } from "@/lib/admin-auth";
import { fetchDoneAt, mapOrderRow } from "@/lib/order-map";
import { loadStepOrder } from "@/lib/step-order-server";

export type PesananStep = { id: string; name: string; position: number };

export type PesananDashboardInitial = {
  orders: ReturnType<typeof mapOrderRow>[];
  steps: PesananStep[];
};

/** `null` = belum login / gagal baca → dashboard jalan seperti sebelumnya. */
export async function loadPesananDashboardInitial(): Promise<PesananDashboardInitial | null> {
  try {
    const supabase = await getAdminDb();
    if (!supabase) return null;

    // `loadStepOrder` tidak bergantung pada hasil dua query di atas, jadi ikut
    // dijalankan bersamaan — dulu ia menunggu berurutan, dan tiap round trip ke
    // database terasa sebagai halaman yang "blank dulu".
    const [ordersRes, stepsRes, stepOrder] = await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("production_steps").select("*").order("position", { ascending: true }),
      loadStepOrder(supabase),
    ]);

    if (ordersRes.error || !ordersRes.data) return null;

    const rows = ordersRes.data;
    const doneAtByUuid = await fetchDoneAt(
      supabase,
      rows.map((row: any) => row.id)
    );

    return {
      orders: rows.map((row: any) =>
        mapOrderRow(row, doneAtByUuid.get(row.id) || null, stepOrder)
      ),
      steps: (stepsRes.data ?? []) as PesananStep[],
    };
  } catch (e) {
    // Render server tidak boleh menjatuhkan halaman: apa pun yang gagal di
    // sini bikin halaman jatuh ke alur client seperti sebelumnya.
    console.error("[pesanan] gagal memuat data awal di server:", e);
    return null;
  }
}
