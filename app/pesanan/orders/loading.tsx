import AdminSkeleton from "@/components/admin/AdminSkeleton";

/**
 * Suspense fallback rute `/pesanan/orders`.
 *
 * Halaman ini membaca daftar order di server (lib/pesanan-server.ts). Tanpa
 * berkas ini, perpindahan menu / muat ulang menampilkan layar kosong lebih dulu;
 * dengan berkas ini kerangka halamannya muncul seketika.
 */
export default function PesananOrdersLoading() {
  return <AdminSkeleton />;
}
