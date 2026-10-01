import AdminSkeleton from "@/components/admin/AdminSkeleton";

/**
 * Suspense fallback rute `/pesanan/maklon`.
 *
 * Pindah dari menu Pesanan ke Maklon adalah navigasi antar-halaman (bukan
 * ganti tab), jadi datanya dibaca server lebih dulu — lihat catatan yang sama
 * di app/pesanan/orders/loading.tsx.
 */
export default function PesananMaklonLoading() {
  return <AdminSkeleton />;
}
