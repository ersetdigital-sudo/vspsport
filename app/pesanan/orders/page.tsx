import PesananDashboard from "@/components/admin/PesananDashboard";
import { loadPesananDashboardInitial } from "@/lib/pesanan-server";

export const metadata = {
  // absolute: judul template root mengikuti nama brand di database, sesuai
  // keputusan pemilik toko. Panel admin di-override penuh supaya namanya tidak
  // ikut berubah kalau baris brand diedit dari menu Pengaturan.
  title: { absolute: "Kelola Pesanan · VSP Sport" },
  description: "Dashboard admin kelola pesanan jersey custom",
};

/**
 * Data order dibaca di server (lihat lib/pesanan-server.ts) supaya daftar
 * pesanan sudah ada di HTML pertama. Dulu halaman ini cuma merender komponen
 * client, jadi tabelnya kosong dulu sampai JS selesai memanggil
 * /api/pesanan/orders.
 */
export default async function PesananPage() {
  const initial = await loadPesananDashboardInitial();
  return <PesananDashboard initial={initial} />;
}
