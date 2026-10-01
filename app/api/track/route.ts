import { NextRequest, NextResponse } from "next/server";
import { getOrderByTracking } from "@/lib/queries-orders";
import { signToken, buildSetCookie } from "@/lib/verify-token";

/**
 * POST /api/track
 * Verify order number + phone and return order data + history.
 * Returns a signed token in the response body for client-side session persistence.
 * (Set-Cookie is also sent but may be lost due to middleware creating a new response.)
 *
 * Status yang dibalas:
 *   400 nomor pesanan / nomor HP kosong
 *   403 nomor pesanan ADA tapi nomor HP-nya tidak cocok
 *   404 nomor pesanannya tidak ada
 *   500 gangguan server (mis. database)
 *
 * Pemisahan 403 vs 404 itu penting: sebelumnya keduanya 404, jadi halaman
 * tracking selalu bilang "nomor pesanan tidak ditemukan" walau yang salah
 * sebenarnya nomor HP — pesan itu yang bikin laporan "ga bisa di-track" susah
 * ditelusuri.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNumber, phone } = body;

    if (!orderNumber || !phone) {
      return NextResponse.json(
        { error: "Nomor pesanan dan nomor HP wajib diisi", code: "missing_input" },
        { status: 400 }
      );
    }

    const result = await getOrderByTracking(orderNumber, phone);

    if (result.status === "not_found") {
      // Hanya nomor pesanan yang dicatat — nomor HP pelanggan tidak perlu masuk log.
      console.warn(
        "[track] nomor pesanan tidak ditemukan:",
        String(orderNumber).trim().toUpperCase()
      );
      return NextResponse.json(
        { error: "Pesanan tidak ditemukan", code: "order_not_found" },
        { status: 404 }
      );
    }

    if (result.status === "phone_mismatch") {
      return NextResponse.json(
        { error: "Nomor HP tidak cocok dengan pesanan ini", code: "phone_mismatch" },
        { status: 403 }
      );
    }

    // Token ditandatangani dari nomor pesanan YANG ADA DI DATABASE, bukan dari
    // input customer — nilainya sama, tapi tidak bergantung pada format ketikan.
    const token = signToken(result.order.order_number);
    const response = NextResponse.json({
      order: result.order,
      history: result.history,
      token,
    });
    response.headers.append("Set-Cookie", buildSetCookie(result.order.order_number));
    return response;
  } catch (e) {
    console.error("[track] gagal memverifikasi pesanan:", e);
    return NextResponse.json(
      { error: "Terjadi kesalahan server", code: "server_error" },
      { status: 500 }
    );
  }
}
