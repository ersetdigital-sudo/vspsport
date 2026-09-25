import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import { generateOrderNumber } from "@/lib/order-number";
import {
  DONE_STATUS,
  isOrderCompleted,
  progressPercentFromStatus,
  stepFromStatus,
} from "@/lib/order-status";

/**
 * Waktu tuntas tiap order diambil dari `order_status_history`, bukan kolom baru.
 *
 * Baris history berstatus "selesai" sudah ditulis setiap kali tahap terakhir
 * disimpan (lihat route status), jadi tidak perlu migrasi kolom tambahan dan
 * order yang tuntas sebelum fitur ini ada pun ikut terhitung. Baris diurut
 * menurun supaya pengambilan pertama per order = kejadian paling akhir (penting
 * untuk order yang pernah dibuka ulang lalu dituntaskan lagi).
 */
async function fetchDoneAt(supabase: any, orderIds: string[]) {
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

function mapOrder(row: any, doneAt: string | null = null) {
  const hasTracking = !!(row.tracking_number && row.courier);
  const step = stepFromStatus(row.current_status);
  const pct = progressPercentFromStatus(row.current_status, hasTracking);
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

export async function GET() {
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const doneAtByUuid = await fetchDoneAt(
    supabase,
    rows.map((row: any) => row.id)
  );

  return NextResponse.json({
    orders: rows.map((row: any) => mapOrder(row, doneAtByUuid.get(row.id) || null)),
  });
}

export async function POST(request: Request) {
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    id,
    customer_name,
    customer_phone,
    product_name,
    quantity,
    material,
    sizes,
    deadline,
    created_at,
    design_photos,
    wo_photos,
    products,
  } = body;

  if (!customer_name || !customer_phone) {
    return NextResponse.json(
      { error: "Nama customer dan HP wajib diisi" },
      { status: 400 }
    );
  }

  // Auto-generate order number if not provided
  let orderNumber = id ? String(id).trim().toUpperCase() : "";
  if (!orderNumber) {
    try {
      orderNumber = await generateOrderNumber(supabase);
    } catch {
      return NextResponse.json(
        { error: "Gagal generate nomor order, coba lagi" },
        { status: 500 }
      );
    }
  }

  const qtyNum = parseInt(quantity, 10);

  const insertData: Record<string, any> = {
    order_number: orderNumber,
    customer_name,
    customer_phone,
    product_type: product_name || "",
    quantity: isNaN(qtyNum) ? 1 : qtyNum,
    sizes: sizes || "",
    current_status: "desain",
    current_stage: 1,
    design_photos: design_photos || [],
    wo_photos: Array.isArray(wo_photos) ? wo_photos : [],
    products: Array.isArray(products) ? products : [],
  };
  if (material) insertData.material = material;
  if (deadline) insertData.deadline = deadline;
  if (created_at) insertData.created_at = created_at;

  const { data, error } = await supabase
    .from("orders")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ order: mapOrder(data) }, { status: 201 });
}
