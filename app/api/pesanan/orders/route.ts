import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/admin-auth";
import { generateOrderNumber } from "@/lib/order-number";
import { fetchDoneAt, mapOrderRow } from "@/lib/order-map";
import { loadStepOrder } from "@/lib/step-order-server";

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

  const stepOrder = await loadStepOrder(supabase);
  const rows = data || [];
  const doneAtByUuid = await fetchDoneAt(
    supabase,
    rows.map((row: any) => row.id)
  );

  return NextResponse.json({
    orders: rows.map((row: any) => mapOrderRow(row, doneAtByUuid.get(row.id) || null, stepOrder)),
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

  // Tahap awal pesanan baru = tahap pertama pada urutan produksi yang berlaku.
  const stepOrder = await loadStepOrder(supabase);

  const qtyNum = parseInt(quantity, 10);

  const insertData: Record<string, any> = {
    order_number: orderNumber,
    customer_name,
    customer_phone,
    product_type: product_name || "",
    quantity: isNaN(qtyNum) ? 1 : qtyNum,
    sizes: sizes || "",
    current_status: stepOrder[0],
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

  return NextResponse.json({ order: mapOrderRow(data, null, stepOrder) }, { status: 201 });
}
