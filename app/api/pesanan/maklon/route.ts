import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import { triggerMaklonStageNotification } from "@/lib/fonnte";
import { mapMaklonRow } from "@/lib/maklon-map";
import { MAKLON_NUMBER_PREFIX, generateOrderNumber } from "@/lib/order-number";

export async function GET() {
  const supabase = await getAdminDb();
  if (!supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("maklon_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ orders: (data || []).map(mapMaklonRow) });
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

  let orderNumber = id ? String(id).trim().toUpperCase() : "";
  if (!orderNumber) {
    try {
      orderNumber = await generateOrderNumber(supabase, {
        table: "maklon_orders",
        prefix: MAKLON_NUMBER_PREFIX,
      });
    } catch {
      return NextResponse.json(
        { error: "Gagal generate nomor maklon, coba lagi" },
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
    current_status: "layout",
    current_stage: 1,
    design_photos: design_photos || [],
    wo_photos: Array.isArray(wo_photos) ? wo_photos : [],
    products: Array.isArray(products) ? products : [],
  };
  if (material) insertData.material = material;
  if (deadline) insertData.deadline = deadline;
  if (created_at) insertData.created_at = created_at;

  const { data, error } = await supabase
    .from("maklon_orders")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sama seperti tambah pesanan jersey: notifikasi WA tahap 1 (Layout) dikirim
  // saat maklon dicatat, bukan menunggu tahapnya dipindah admin. Butir
  // anti-duplikat & kegagalan kirim ditangani di dalam trigger-nya.
  const notification = await triggerMaklonStageNotification(supabase, data.id, data, 1);

  return NextResponse.json(
    { order: mapMaklonRow(data), notification },
    { status: 201 }
  );
}