import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import { ORDER_STATUS_LIST, type OrderStatus } from "@/lib/types";
import { statusToStepMap } from "@/lib/order-status";
import { loadStepOrder } from "@/lib/step-order-server";
import {
  triggerStageNotification,
  type NotificationTriggerStatus,
} from "@/lib/fonnte";
import { checkRateLimit } from "@/lib/rate-limit";

/** Hasil notifikasi untuk response API (tidak pernah berisi token). */
interface NotificationResult {
  stage: number | null;
  status:
    | "none" // tidak ada perubahan stage
    | "skipped_same_stage" // stage sama dengan sebelumnya → tanpa notifikasi
    | NotificationTriggerStatus;
}

/**
 * PATCH /api/admin/orders/[id]/status — update status/tahap produksi (admin only).
 *
 * Alur notifikasi WA (Fonnte):
 * 1. Ambil order → previous_stage = current_stage (dari DB) SEBELUM update.
 * 2. Update order.current_stage = new_stage (stage baru dari request).
 * 3. Jika new_stage == previous_stage → tanpa notifikasi, langsung sukses.
 * 4. Jika berbeda → klaim slot di stage_notification_logs (unique (order_id, stage)):
 *    - gagal karena unique constraint → skip kirim (anti-duplikat, aman dari race condition)
 *    - berhasil → build pesan → kirim Fonnte → update log (success/failed) →
 *      update last_notified_stage HANYA jika sukses.
 * 5. Kegagalan kirim WA TIDAK menggagalkan/rollback update status order.
 *    (Logika pengiriman ada di lib/fonnte.ts triggerStageNotification.)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      note,
      photoUrl,
      trackingNumber,
      courier,
      delayReason,
      delayEstimatedDate,
    } = body;

    if (!status || !ORDER_STATUS_LIST.includes(status as OrderStatus)) {
      return NextResponse.json(
        { error: "Status tidak valid" },
        { status: 400 }
      );
    }

    // Rate limit dasar — cegah spam trigger notifikasi (10 request/menit per admin per order).
    if (!checkRateLimit(`stage-update:${id}`, 10, 60_000)) {
      return NextResponse.json(
        { error: "Terlalu banyak permintaan, coba lagi nanti" },
        { status: 429 }
      );
    }

    // 1. Ambil order dulu — previous_stage dibaca dari DB sebelum update.
    const { data: existing, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "Pesanan tidak ditemukan" },
        { status: 404 }
      );
    }

    // Nomor tahap mengikuti URUTAN di tabel `production_steps` (lihat
    // lib/step-order.ts) — bukan urutan bawaan di kode — supaya dashboard,
    // halaman customer, dan pesan WhatsApp menunjuk tahap yang sama.
    const stageMap = statusToStepMap(await loadStepOrder(supabase));
    const newStage = stageMap[status] ?? null;
    const previousStage =
      existing.current_stage ??
      stageMap[existing.current_status] ??
      null;

    // 2. Update order — tersimpan apa pun hasil kirim WA (tanpa rollback).
    const updateData: Record<string, unknown> = {
      current_status: status,
      current_stage: newStage,
      updated_at: new Date().toISOString(),
    };

    if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;
    if (courier !== undefined) updateData.courier = courier;
    if (delayReason !== undefined) updateData.delay_reason = delayReason;
    if (delayEstimatedDate !== undefined) updateData.delay_estimated_date = delayEstimatedDate;

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Insert status history (perilaku lama tetap dipertahankan)
    const historyData: Record<string, unknown> = {
      order_id: id,
      status,
      note: note || "",
    };
    if (photoUrl) historyData.photo_url = photoUrl;

    const { error: historyError } = await supabase
      .from("order_status_history")
      .insert(historyData);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 });
    }

    // 3-4. Notifikasi WhatsApp — hanya bila tahap BENAR-BENAR berubah.
    const notification: NotificationResult = { stage: newStage, status: "none" };

    if (newStage !== null && newStage !== previousStage) {
      notification.status = await triggerStageNotification(
        supabase,
        id,
        existing,
        newStage
      );
    } else if (newStage !== null) {
      notification.status = "skipped_same_stage";
    }

    return NextResponse.json({ success: true, notification });
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}