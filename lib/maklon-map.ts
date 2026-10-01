/**
 * Pemetaan baris tabel `maklon_orders` → bentuk yang dikirim ke dashboard Maklon.
 *
 * Dipindah ke sini karena sekarang dipakai DUA tempat: endpoint
 * `/api/pesanan/maklon` dan pembacaan awal di server (`lib/maklon-server.ts`).
 * Isi pemetaannya tidak diubah sama sekali dari versi aslinya.
 */
import {
  MAKLON_FINAL_STEP,
  clampMaklonStep,
  isMaklonCompleted,
  maklonProgress,
} from "@/lib/maklon-status";

export function mapMaklonRow(row: any) {
  const hasTracking = !!(row.tracking_number && row.courier);
  const step = clampMaklonStep(row.current_stage || 1);
  const pct = maklonProgress(step, hasTracking);
  return {
    id: row.order_number,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    product_name: row.product_type || "",
    quantity: row.quantity ? `${row.quantity} pcs` : "-",
    material: row.material || "",
    sizes: row.sizes || "",
    design_photos: Array.isArray(row.design_photos)
      ? row.design_photos.map((p: any) => (typeof p === "string" ? p : p.url || "")).filter(Boolean)
      : [],
    wo_photos: Array.isArray(row.wo_photos)
      ? row.wo_photos.map((p: any) => (typeof p === "string" ? p : p.url || "")).filter(Boolean)
      : [],
    products: Array.isArray(row.products) ? row.products : [],
    current_step: step,
    note: row.design_notes || "",
    note_time: row.updated_at || "",
    courier: row.courier || "",
    tracking_number: row.tracking_number || "",
    is_done: isMaklonCompleted(row.current_status) || (step === MAKLON_FINAL_STEP && hasTracking),
    deadline: row.deadline || null,
    created_at: row.created_at,
    pct,
  };
}
