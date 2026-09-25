import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminDb } from "@/lib/admin-auth";
import { stepFromStatus } from "@/lib/order-status";
import {
  CANONICAL_STEP_ORDER,
  isSameStepNames,
  resolveStepOrder,
  type StepOrder,
} from "@/lib/step-order";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** GET — fetch all steps ordered by position */
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("production_steps")
    .select("*")
    .order("position", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ steps: data });
}

/**
 * Satu tahap produksi punya SATU identitas (slug), sementara NOMOR-nya mengikuti
 * urutan yang berlaku. Jadi begitu urutan diubah, SEMUA angka yang tersimpan
 * harus digeser bersamaan — kalau tidak, angka lama menunjuk tahap yang berbeda
 * dari yang sebenarnya dimaksud.
 *
 * Yang digeser:
 *
 *   * `orders.current_stage` — dihitung ulang dari `current_status` (nama tahap).
 *     Tanpa ini, pesanan yang sedang jalan akan ditempeli nama tahap yang salah.
 *   * `orders.last_notified_stage` — nomor lama → nomor baru untuk tahap yang SAMA.
 *   * `stage_notification_logs.stage` — memori anti-duplikat WA (status
 *     `success`/`failed`/`pending` di tabel itu), nomor lama → nomor baru untuk
 *     tahap yang SAMA. Tanpa ini, menurunkan lalu menaikkan tahap pesanan bisa
 *     mengirim WA ulang untuk progress yang sudah pernah dikirim — sistem
 *     mengira tahap itu belum pernah dinotifikasi.
 *
 * Menggeser angka yang tersimpan butuh URUTAN SEBELUMNYA juga, bukan cuma yang
 * baru: angka di database artinya "posisi ke-N pada urutan yang berlaku waktu
 * angka itu ditulis".
 */
async function remapStagesToOrder(
  supabase: SupabaseClient,
  oldOrder: StepOrder,
  newOrder: StepOrder
): Promise<{ orders: number; notif_logs: number }> {
  /** Nomor pada urutan LAMA → nomor pada urutan BARU, untuk tahap yang sama. */
  const toNewNumber = (oldNumber: unknown): number | null => {
    const n = Number(oldNumber);
    if (!Number.isInteger(n) || n < 1 || n > oldOrder.length) return null;
    const index = newOrder.indexOf(oldOrder[n - 1]);
    return index < 0 ? null : index + 1;
  };

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, current_status, current_stage, last_notified_stage");
  if (error) return { orders: 0, notif_logs: 0 };

  let orderUpdates = 0;
  let logUpdates = 0;

  for (const row of orders ?? []) {
    const patch: Record<string, number> = {};

    const step = stepFromStatus(row.current_status, newOrder);
    if (step !== row.current_stage) patch.current_stage = step;

    if (row.last_notified_stage != null) {
      const moved = toNewNumber(row.last_notified_stage);
      if (moved !== null && moved !== row.last_notified_stage) {
        patch.last_notified_stage = moved;
      }
    }

    if (Object.keys(patch).length > 0) {
      const { error: updErr } = await supabase.from("orders").update(patch).eq("id", row.id);
      if (!updErr) orderUpdates += 1;
    }

    // Memori anti-duplikat WA (`stage_notification_logs`).
    //
    // Tabelnya punya `unique (order_id, stage)` DAN `check (stage between 1 and
    // 11)` sekaligus, jadi tidak ada angka "titipan" di luar rentang untuk
    // menukar nomor (2 ⇄ 3 tidak punya ruang bebas untuk bernapas). Karena itu
    // barisnya ditulis ulang — salin dengan nomor baru, hapus yang lama, insert
    // ulang — bukan di-update satu per satu.
    const { data: logs } = await supabase
      .from("stage_notification_logs")
      .select("stage, sent_at, status, response_payload")
      .eq("order_id", row.id);

    const logRows = logs ?? [];
    const changedRows = logRows.filter((log) => {
      const next = toNewNumber(log.stage);
      return next !== null && next !== log.stage;
    });
    if (changedRows.length === 0) continue;

    const { error: delErr } = await supabase
      .from("stage_notification_logs")
      .delete()
      .eq("order_id", row.id);
    if (delErr) continue;

    const { error: insLogErr } = await supabase.from("stage_notification_logs").insert(
      logRows.map((log) => ({
        order_id: row.id,
        stage: toNewNumber(log.stage) ?? Number(log.stage),
        sent_at: log.sent_at,
        status: log.status,
        response_payload: log.response_payload,
      }))
    );

    if (insLogErr) {
      // Tulis ulang gagal → kembalikan apa adanya. Memori anti-duplikat lebih
      // penting daripada nomornya rapi: tanpa ini, semua tahap bisa terkirim
      // ulang.
      await supabase.from("stage_notification_logs").insert(
        logRows.map((log) => ({
          order_id: row.id,
          stage: Number(log.stage),
          sent_at: log.sent_at,
          status: log.status,
          response_payload: log.response_payload,
        }))
      );
      continue;
    }

    logUpdates += changedRows.length;
  }

  return { orders: orderUpdates, notif_logs: logUpdates };
}

/**
 * PUT — simpan URUTAN tahap produksi.
 *
 * Sengaja hanya menerima perubahan urutan:
 *   * jumlah tahap dikunci (11) — halaman customer menulis "x dari 11 tahap",
 *     dan nomor tahap pesanan mengikuti posisi di daftar ini;
 *   * NAMA tahap tidak bisa diubah dari dashboard. Nama adalah satu-satunya
 *     penanda identitas tahap (lihat lib/step-order.ts: nama → slug), jadi
 *     mengganti teksnya akan membuat seluruh riwayat & notifikasi kehilangan
 *     tahapnya. Untuk mengubah teks, hubungi support.
 */
export async function PUT(req: Request) {
  // Tulis ulang daftar tahap produksi = aksi admin, bukan publik.
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { steps } = (await req.json()) as {
    steps: { name: string; position: number }[];
  };

  if (!Array.isArray(steps) || steps.length !== CANONICAL_STEP_ORDER.length) {
    return NextResponse.json(
      {
        error: `Jumlah tahap produksi dikunci di ${CANONICAL_STEP_ORDER.length}. Hubungi support untuk menambah atau menghapus tahap.`,
      },
      { status: 400 }
    );
  }

  // Nama tahap harus tetap sama persis — yang boleh berubah cuma urutannya.
  const { data: currentRows, error: curErr } = await supabase
    .from("production_steps")
    .select("name, position")
    .order("position", { ascending: true });
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });

  if (!isSameStepNames(currentRows, steps)) {
    return NextResponse.json(
      {
        error:
          "Nama tahap tidak bisa diubah dari dashboard. Hubungi support untuk mengubah teks tahap produksi.",
      },
      { status: 400 }
    );
  }

  const rows = steps.map((step, index) => ({
    name: String(step?.name ?? "").trim(),
    position: index + 1,
  }));

  // Urutan SEBELUM perubahan — dipakai untuk menerjemahkan angka yang tersimpan.
  const oldOrder = resolveStepOrder(currentRows as { name: string; position: number }[]);

  const { error: delErr } = await supabase
    .from("production_steps")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("production_steps").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const remapped = await remapStagesToOrder(supabase, oldOrder, resolveStepOrder(rows));

  return NextResponse.json({ ok: true, remapped });
}
