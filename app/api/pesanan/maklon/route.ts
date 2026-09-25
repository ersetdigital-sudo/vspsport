import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import {
  MAKLON_FINAL_STEP,
  clampMaklonStep,
  isMaklonCompleted,
  maklonProgress,
} from "@/lib/maklon-status";
import { MAKLON_NUMBER_PREFIX, generateOrderNumber } from "@/lib/order-number";

function mapOrder(row: any) {
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

  return NextResponse.json({ orders: (data || []).map(mapOrder) });
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

  return NextResponse.json({ order: mapOrder(data) }, { status: 201 });
}