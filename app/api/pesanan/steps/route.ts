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
 * Setelah urutan tahap berubah, nomor tahap tiap pesanan dihitung ulang dari
 * `current_status` (slug) yang tersimpan. Jadi pesanan yang sedang jalan tetap
 * berada di tahap dengan NAMA yang sama — yang bergeser cuma nomornya, bukan
 * posisi produksinya. Tanpa ini, dashboard akan menempelkan nama tahap yang
 * salah ke pesanan yang sedang dikerjakan.
 */
async function remapOrderStages(
  supabase: SupabaseClient,
  order: StepOrder
): Promise<number> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, current_status, current_stage");
  if (error) return 0;

  let changed = 0;
  for (const row of orders ?? []) {
    const step = stepFromStatus(row.current_status, order);
    if (step === row.current_stage) continue;
    const { error: updErr } = await supabase
      .from("orders")
      .update({ current_stage: step })
      .eq("id", row.id);
    if (!updErr) changed += 1;
  }
  return changed;
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

  const { error: delErr } = await supabase
    .from("production_steps")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  const { error: insErr } = await supabase.from("production_steps").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  // Urutan baru dipakai untuk menghitung ulang nomor tahap pesanan yang jalan.
  const remapped = await remapOrderStages(supabase, resolveStepOrder(rows));

  return NextResponse.json({ ok: true, remapped });
}
