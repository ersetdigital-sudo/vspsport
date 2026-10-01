import MaklonDashboard from "@/components/admin/MaklonDashboard";
import { loadMaklonDashboardInitial } from "@/lib/maklon-server";

export const metadata = {
  // Lihat catatan di app/pesanan/orders/page.tsx soal title absolute.
  title: { absolute: "Maklon · VSP Sport" },
  description: "Dashboard admin kelola pesanan maklon",
};

// Lihat catatan di app/pesanan/orders/page.tsx: cookie login membuat halaman ini
// selalu dynamic, jadi ditulis eksplisit supaya build tidak mencoba
// mem-prerender-nya lebih dulu.
export const dynamic = "force-dynamic";

export default async function MaklonPage() {
  const initial = await loadMaklonDashboardInitial();
  return <MaklonDashboard initial={initial} />;
}