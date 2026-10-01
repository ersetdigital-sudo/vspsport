/**
 * Pemetaan baris tabel `orders` (pesanan jersey) → bentuk yang dikirim ke dashboard.
 *
 * Dipindah ke sini karena sekarang dipakai DUA tempat: endpoint
 * `/api/pesanan/orders` dan pembacaan awal di server (`lib/pesanan-server.ts`).
 * Dulu fungsinya cuma ada di dalam route, jadi render server tidak bisa memakai
 * pemetaan yang sama tanpa menyalinnya — dan salinan seperti itu pasti
 * menyimpang suatu saat.
 *
 * Isi pemetaannya tidak diubah sama sekali dari versi aslinya.
 */
import { DONE_STATUS, isOrderCompleted, progressPercentFromStatus, stepFromStatus } from "@/lib/order-status";
import type { StepOrder } from "@/lib/step-order-server";

/**
 * Waktu tuntas tiap order diambil dari `order_status_history`, bukan kolom baru.
 *
 * Baris history berstatus "selesai" sudah ditulis setiap kali tahap terakhir
 * disimpan (lihat route status), jadi tidak perlu migrasi kolom tambahan dan
 * order yang tuntas sebelum fitur ini ada pun ikut terhitung. Baris diurut
 * menurun supaya pengambilan pertama per order = kejadian paling akhir (penting
 * untuk order yang pernah dibuka ulang lalu dituntaskan lagi).
 */
export async function fetchDoneAt(supabase: any, orderIds: string[]) {
  const latest = new Map<string, string>();
  if (orderIds.length === 0) return latest;

  const { data, error } = await supabase
    .from("order_status_history")
    .select("order_id, created_at")
    .eq("status", DONE_STATUS)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) {
    // Badge "bulan ini" cukup tampil 0 kalau riwayat tidak terbaca — jangan
    // sampai kegagalan di sini bikin seluruh daftar pesanan gagal dimuat.
    console.error("Gagal membaca riwayat selesai:", error.message);
    return latest;
  }

  for (const row of data || []) {
    if (!latest.has(row.order_id)) latest.set(row.order_id, row.created_at);
  }
  return latest;
}

export function mapOrderRow(
  row: any,
  doneAt: string | null = null,
  stepOrder?: StepOrder
) {
  const hasTracking = !!(row.tracking_number && row.courier);
  const step = stepFromStatus(row.current_status, stepOrder);
  // Persentase dihitung dari NOMOR tahap pada urutan yang berlaku, supaya sama
  // dengan angka "Tahap x dari 11" di halaman customer.
  const pct = progressPercentFromStatus(row.current_status, hasTracking, stepOrder);
  return {
    id: row.order_number,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone,
    product_name: row.product_type || "",
    quantity: row.quantity ? `${row.quantity} pcs` : "-",
    material: row.material || "",
    sizes: row.sizes || "",
    design_photos: Array.isArray(row.design_photos) ? row.design_photos.map((p: any) =>
      typeof p === "string" ? p : p.url || ""
    ).filter(Boolean) : [],
    wo_photos: Array.isArray(row.wo_photos) ? row.wo_photos.map((p: any) => typeof p === "string" ? p : p.url || "").filter(Boolean) : [],
    products: Array.isArray(row.products) ? row.products : [],
    current_step: step,
    note: row.design_notes || "",
    note_time: row.updated_at || "",
    courier: row.courier || "",
    tracking_number: row.tracking_number || "",
    is_done: isOrderCompleted(row.current_status) || (step === 11 && hasTracking),
    deadline: row.deadline || null,
    created_at: row.created_at,
    done_at: doneAt,
    pct,
  };
}
