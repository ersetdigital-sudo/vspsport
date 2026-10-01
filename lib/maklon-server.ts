/**
 * Pembacaan data awal Dashboard Maklon langsung di server.
 *
 * Sama seperti lib/pesanan-server.ts: halaman `/pesanan/maklon` cuma merender
 * komponen client, jadi daftar maklon baru muncul setelah JS memanggil
 * `/api/pesanan/maklon`. Sekarang order + tahap dibaca di server dan dikirim
 * sebagai prop `initial`.
 *
 * Client yang dipakai SAMA dengan endpoint-nya (lib/admin-auth.ts): service
 * role, tapi hanya setelah cookie login `pesanan_auth` / user Supabase
 * terverifikasi — hak bacanya tidak berubah. Belum login → `null`, dashboard
 * jalan lewat alur client seperti sebelumnya.
 */
import { getAdminDb } from "@/lib/admin-auth";
import { mapMaklonRow } from "@/lib/maklon-map";

export type MaklonStep = { id: string; name: string; position: number };

export type MaklonDashboardInitial = {
  orders: ReturnType<typeof mapMaklonRow>[];
  steps: MaklonStep[];
};

/** `null` = belum login / gagal baca → dashboard jalan seperti sebelumnya. */
export async function loadMaklonDashboardInitial(): Promise<MaklonDashboardInitial | null> {
  try {
    const supabase = await getAdminDb();
    if (!supabase) return null;

    const [ordersRes, stepsRes] = await Promise.all([
      supabase.from("maklon_orders").select("*").order("created_at", { ascending: false }),
      supabase.from("maklon_steps").select("*").order("position", { ascending: true }),
    ]);

    if (ordersRes.error || !ordersRes.data) return null;

    return {
      orders: ordersRes.data.map(mapMaklonRow),
      steps: (stepsRes.data ?? []) as MaklonStep[],
    };
  } catch (e) {
    console.error("[maklon] gagal memuat data awal di server:", e);
    return null;
  }
}
