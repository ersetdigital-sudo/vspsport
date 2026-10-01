import { Suspense } from "react";
import type { Metadata } from "next";
import { loadStatusInitial } from "@/lib/status-server";
import StatusClient from "./StatusClient";

export const metadata: Metadata = {
  title: "Status Pesanan",
  description: "Pantau progres produksi pesanan jersey custom VSP Sport.",
};

// Selalu dirender ulang per request: token sesi di URL dan progres pesanannya
// tidak boleh di-cache bersama.
export const dynamic = "force-dynamic";

/**
 * Data order dibaca di server kalau URL membawa token sesi yang sah (lihat
 * lib/status-server.ts), supaya progres pesanan sudah ada di HTML pertama.
 * Tanpa token, `initial` = null dan halaman jalan lewat verifikasi HP seperti
 * sebelumnya.
 */
export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; token?: string }>;
}) {
  const sp = await searchParams;
  const orderNumber = (sp.order || "").toUpperCase();

  const initial = await loadStatusInitial(orderNumber, sp.token || null);

  return (
    <Suspense fallback={null}>
      <StatusClient initial={initial} />
    </Suspense>
  );
}
