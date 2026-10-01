/**
 * Server-side data access for the order tracking system.
 *
 * Public functions verify customer_phone before returning data.
 * Admin functions require authenticated Supabase client.
 *
 * Semua query di berkas ini memakai SERVICE ROLE client, karena `orders` /
 * `order_status_history` tidak lagi membuka policy ke anon (lihat migrasi
 * 0001_baseline_schema.sql).
 * Otorisasi ada di pemanggilnya: halaman tracking memverifikasi nomor HP,
 * sedangkan endpoint dashboard memakai getAdminDb().
 *
 * Pembuatan nomor pesanan ada di lib/order-number.ts — itu bukan query, dan
 * dipakai bersama oleh pesanan jersey dan maklon.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { samePhoneNumber } from "@/lib/wa";
import type { Order, OrderStatus, OrderStatusHistory } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public — Customer tracking
// ---------------------------------------------------------------------------

/**
 * Hasil verifikasi halaman tracking.
 *
 * Sengaja dibedakan "nomor pesanan tidak ada" dan "nomor HP tidak cocok":
 * dulu keduanya sama-sama `null`, dan pemanggilnya membalas 404 dengan pesan
 * "nomor pesanan tidak ditemukan" — jadi saat yang salah justru nomor HP-nya,
 * pemakainya disuruh memeriksa nomor pesanan. Sekarang kode HTTP-nya beda
 * (404 vs 403) supaya pesan di layar bisa menunjuk penyebab yang sebenarnya.
 */
export type TrackingLookup =
  | { status: "ok"; order: Order; history: OrderStatusHistory[] }
  | { status: "not_found" }
  | { status: "phone_mismatch" };

/**
 * Verify and fetch an order by order_number + customer_phone.
 *
 * Nomor HP dicocokkan lewat `samePhoneNumber` (lib/wa.ts), bukan perbandingan
 * digit mentah, supaya `0856…` tetap cocok dengan pesanan yang nomornya
 * tersimpan sebagai `62856…` atau `+62 856…`.
 *
 * Kegagalan database DILEMPAR (bukan diubah jadi "tidak ditemukan") — pemanggil
 * membalasnya sebagai 500, jadi gangguan server tidak menyamar sebagai pesanan
 * yang salah ketik.
 */
export async function getOrderByTracking(
  orderNumber: string,
  phone: string
): Promise<TrackingLookup> {
  const supabase = createServiceClient();
  const key = String(orderNumber ?? "").trim().toUpperCase();

  // Riwayat diambil SEKALIAN lewat relasi (embed PostgREST) — lihat penjelasan
  // di lib/status-server.ts. Jadi memverifikasi + mengambil data cukup satu
  // round trip ke database, bukan dua yang berurutan.
  const { data: row, error } = await supabase
    .from("orders")
    .select("*, order_status_history(*)")
    .eq("order_number", key)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca pesanan: ${error.message}`);
  if (!row) return { status: "not_found" };

  if (!samePhoneNumber(row.customer_phone, phone)) {
    return { status: "phone_mismatch" };
  }

  const { order_status_history: historyRows, wo_photos: _wo, ...safeOrder } = row as any;

  const history = ((historyRows ?? []) as OrderStatusHistory[])
    .slice()
    .sort((a, b) =>
      String(a.created_at).localeCompare(String(b.created_at))
    );

  return {
    status: "ok",
    order: safeOrder as Order,
    history,
  };
}

// ---------------------------------------------------------------------------
// Helpers: strip admin-only fields before exposing to customer
// ---------------------------------------------------------------------------

export function stripWoPhoto(order: any): any {
  if (!order || typeof order !== "object") return order;
  const { wo_photos, ...rest } = order;
  return rest;
}

// ---------------------------------------------------------------------------
// Admin — Order management
// ---------------------------------------------------------------------------

/** Fetch all orders (admin only). */
export async function getAllOrders(): Promise<Order[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Order[];
}

/** Fetch a single order by ID (admin only). */
export async function getOrderById(
  id: string
): Promise<{ order: Order; history: OrderStatusHistory[] } | null> {
  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !order) return null;

  const { data: history } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  return {
    order: order as Order,
    history: (history ?? []) as OrderStatusHistory[],
  };
}
