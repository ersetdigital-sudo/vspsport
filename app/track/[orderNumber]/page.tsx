import type { Metadata } from "next";
import { getBrand } from "@/lib/queries";
import { TrackDetailClient } from "./TrackDetailClient";

export const metadata: Metadata = {
  title: "Lacak Pesanan",
  description: "Lacak progres pesanan jersey custom VSP Sport",
};

interface TrackDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

// Nomor WhatsApp dibaca per request supaya tombol "Hubungi CS" di halaman ini
// selalu mengikuti menu Pengaturan admin, bukan nomor yang tertulis di kode.
export const dynamic = "force-dynamic";

export default async function TrackDetailPage({ params }: TrackDetailPageProps) {
  const { orderNumber } = await params;
  const brand = await getBrand();

  return (
    <TrackDetailClient
      orderNumber={orderNumber}
      brand={{ name: brand.name, whatsapp_number: brand.whatsappNumber }}
    />
  );
}
