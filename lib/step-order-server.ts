/**
 * Pembacaan urutan tahap produksi dari database (server-only).
 *
 * Dipisah dari lib/step-order.ts karena file itu diimpor komponen client —
 * modul ini memakai service-role client yang tidak boleh masuk bundle browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";
import { CANONICAL_STEP_ORDER, resolveStepOrder, type StepOrder } from "@/lib/step-order";

export type { StepOrder };

/**
 * Baca urutan efektif dari tabel `production_steps`.
 * Pakai client yang sudah ada kalau diberikan (mis. dari route handler), supaya
 * tidak membuat koneksi baru tiap kali. Gagal baca = urutan bawaan.
 */
export async function loadStepOrder(supabase?: SupabaseClient): Promise<StepOrder> {
  const client = supabase ?? createServiceClient();
  const { data, error } = await client
    .from("production_steps")
    .select("name, position")
    .order("position", { ascending: true });

  if (error) return CANONICAL_STEP_ORDER;
  return resolveStepOrder(data as { name: string; position: number }[] | null);
}
