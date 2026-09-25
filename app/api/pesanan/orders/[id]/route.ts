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

  // Kolom foto ikut dibaca: setelah pesanan hilang, tidak ada lagi yang
  // merujuk gambar-gambarnya, jadi asetnya harus dibuang dari Cloudinary juga.
  const { data: existing, error: fetchErr } = await supabase
    .from("orders")
    .select("id, design_photos, wo_photos")
    .eq("order_number", id)
    .maybeSingle();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  const { error: orderErr } = await supabase
    .from("orders")
    .delete()
    .eq("order_number", id);

  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  // Dijalankan SETELAH baris terhapus: kalau penghapusan database gagal, foto
  // lama masih dipakai pesanan yang masih ada. Kegagalan Cloudinary diabaikan
  // supaya operator tidak melihat error padahal datanya sudah terhapus.
  const photos = [
    ...(Array.isArray(existing.design_photos) ? existing.design_photos : []),
    ...(Array.isArray(existing.wo_photos) ? existing.wo_photos : []),
  ].filter((u): u is string => typeof u === "string");
  if (photos.length > 0) await destroyCloudinaryAssets(photos);

  return NextResponse.json({ ok: true });
}
