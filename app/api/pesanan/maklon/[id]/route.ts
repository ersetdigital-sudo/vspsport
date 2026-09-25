import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { destroyCloudinaryAssets } from "@/lib/cloudinary-server";
import { cookies } from "next/headers";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const jar = await cookies();
  if (jar.get("pesanan_auth")?.value !== "true") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Sama seperti pesanan jersey — lihat catatan di app/api/pesanan/orders/[id]/route.ts.
  const { data: existing, error: fetchErr } = await supabase
    .from("maklon_orders")
    .select("id, design_photos, wo_photos")
    .eq("order_number", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Pesanan maklon tidak ditemukan" }, { status: 404 });
  }

  const { error: orderErr } = await supabase
    .from("maklon_orders")
    .delete()
    .eq("order_number", id);

  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  const photos = [
    ...(Array.isArray(existing.design_photos) ? existing.design_photos : []),
    ...(Array.isArray(existing.wo_photos) ? existing.wo_photos : []),
  ].filter((u): u is string => typeof u === "string");
  if (photos.length > 0) await destroyCloudinaryAssets(photos);

  return NextResponse.json({ ok: true });
}