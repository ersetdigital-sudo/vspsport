import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import { triggerStageNotification } from "@/lib/fonnte";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/pesanan/orders/[id]/notify — kirim ULANG notifikasi WhatsApp tahap.
 *
 * Dipakai tombol "Kirim ulang WA" di sheet detail pesanan. Endpoint status
 * (/status) hanya memicu notifikasi saat tahapnya BERUBAH, jadi notifikasi yang
 * gagal (token bermasalah, device Fonnte putus, ditolak Fonnte) tidak punya
 * jalan untuk dicoba lagi selama admin tidak memindahkan tahap bolak-balik.
 *
 * Anti-duplikat tetap berlaku lewat claim_stage_notification: baris `success`
 * atau `pending` tidak akan dikirim ulang (balasan `skipped_duplicate`), hanya
 * baris `failed` yang boleh diklaim ulang — lihat migrasi
 * 0008_ulang_kirim_notif_gagal.sql.
 *
 * Endpoint ini TIDAK mengubah data order sama sekali.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Memicu pesan WA ke customer — wajib admin.
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit dasar per order — cegah spam trigger notifikasi.
  if (!checkRateLimit(`stage-notify:${id}`, 10, 60_000)) {
    return NextResponse.json(
      { error: "Terlalu banyak permintaan, coba lagi nanti" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, order_number, customer_name, customer_phone, current_stage")
    .eq("order_number", id)
    .maybeSingle();

  if (error || !order) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  // Default: tahap yang sedang berjalan. Bisa dioverride untuk kirim ulang
  // tahap lain tanpa menyentuh status order.
  const stage = Math.min(Math.max(Number(body.stage ?? order.current_stage) || 1, 1), 11);

  const status = await triggerStageNotification(supabase, order.id, order, stage);

  return NextResponse.json({
    ok: status === "sent",
    notification: { stage, status },
  });
}
