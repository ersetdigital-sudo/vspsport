/**
 * Cloudinary — upload gambar dari sisi browser memakai UNSIGNED upload preset
 * (env: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME + NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
 * keduanya memang aman dipublikasikan).
 *
 * Berkas ini di-import komponen client, jadi JANGAN pernah menaruh API key/secret
 * di sini. Operasi yang butuh tanda tangan (hapus aset) ada di
 * lib/cloudinary-server.ts.
 */

/** Folder induk semua aset gambar VSP Sport di Cloudinary. */
export const CLOUDINARY_FOLDER = "vsp-sport/desain";

/** Batas ukuran per gambar. Cloudinary gratis dihitung dari kredit, jadi
 *  foto 5 MB dari kamera HP sebaiknya ditolak di sini, bukan setelah terupload. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Format yang diterima. HEIC sengaja tidak ikut — Cloudinary bisa mengonversinya,
 *  tapi browser tidak bisa menampilkan hasilnya sebagai preview lokal. */
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Nilai atribut `accept` untuk input file (harus sama dengan ALLOWED_IMAGE_TYPES). */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

/** True kalau env Cloudinary tersedia (keduanya env publik). */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  );
}

/**
 * Periksa berkas sebelum diunggah.
 * Mengembalikan pesan kesalahan siap-tampil, atau null kalau berkas lolos.
 */
export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return `Format ${file.type || "berkas ini"} tidak didukung. Pakai JPG, PNG, atau WebP.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `Ukuran ${mb} MB melebihi batas 2 MB. Kecilkan dulu gambarnya.`;
  }
  return null;
}

/**
 * Upload satu gambar ke Cloudinary (unsigned).
 *
 * `folder` opsional — defaultnya CLOUDINARY_FOLDER. Preset `modigi` mengizinkan
 * parameter folder (sudah diuji), jadi tiap upload bisa dikelompokkan.
 */
export async function uploadToCloudinary(
  file: File,
  params: { folder?: string } = {}
): Promise<{ url: string; public_id: string }> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary belum dikonfigurasi");
  }

  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", params.folder || CLOUDINARY_FOLDER);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message || "Upload gagal");
  }
  const data = await res.json();
  return { url: data.secure_url, public_id: data.public_id };
}

const UPLOAD_MARK = "/upload/";

/**
 * Sisipkan transformasi penghematan kredit ke URL Cloudinary.
 *
 * - `f_auto`  → format paling ringan yang didukung browser (WebP/AVIF)
 * - `q_auto`  → kualitas otomatis, sekecil mungkin tanpa terlihat jelek
 * - `w_<n>`   → jangan kirim gambar 4000px untuk thumbnail
 *
 * Aman dipanggil berulang dan bisa "menaikkan" URL yang sudah punya transformasi:
 * `/upload/f_auto,q_auto/…` + `w=320` → `/upload/f_auto,q_auto,w_320/…`.
 *
 * Sengaja TIDAK memakai `c_fill`: tanpa `h_` crop-nya tidak terjadi, dan dengan
 * `h_` ia memotong isi gambar pada titik tengah — untuk foto desain jersey itu
 * berisiko memotong bagian penting. Pemotongan persegi ditangani CSS
 * (`object-cover`) di elemennya, sesuai ukuran kotak yang sebenarnya.
 */
export function optimizeImageUrl(url: string, width?: number): string {
  if (typeof url !== "string" || !url.includes(UPLOAD_MARK)) return url;

  const at = url.indexOf(UPLOAD_MARK);
  const before = url.slice(0, at);
  const segments = url.slice(at + UPLOAD_MARK.length).split("/");

  // Segmen transformasi selalu memakai koma (`f_auto,q_auto`). Cloudinary juga
  // menerima penulisan tanpa koma, tapi kode ini hanya menghasilkan yang berkoma.
  const transformAt = segments.findIndex((s) => s.includes(","));
  const tokens: string[] =
    transformAt === -1 ? [] : segments[transformAt].split(",").filter(Boolean);
  if (transformAt !== -1) segments.splice(transformAt, 1);

  const put = (token: string) => {
    const key = token.split("_")[0];
    const at = tokens.findIndex((t) => t.split("_")[0] === key);
    if (at === -1) tokens.push(token);
    else tokens[at] = token;
  };
  put("f_auto");
  put("q_auto");
  if (width) put(`w_${width}`);

  const rest = segments.filter(Boolean).join("/");
  return `${before}${UPLOAD_MARK}${tokens.join(",")}/${rest}`;
}

/**
 * Ambil public_id Cloudinary dari URL yang disimpan database.
 *
 * Dipakai untuk menghapus aset tanpa perlu kolom tambahan di tabel: URL hasil
 * upload selalu berbentuk `…/upload/[transformasi/][v1234567/]<public_id>.<ext>`.
 * Segmen transformasi dikenali dari komanya (lihat optimizeImageUrl), segmen
 * versi dari pola `v<angka>`.
 */
export function cloudinaryPublicId(url: string): string | null {
  if (typeof url !== "string" || !url.includes(UPLOAD_MARK)) return null;

  const segments = url.split(UPLOAD_MARK)[1]?.split("/").filter(Boolean) ?? [];
  const start = segments.findIndex(
    (s) => !s.includes(",") && !/^v\d+$/.test(s)
  );
  if (start === -1) return null;

  const path = segments.slice(start).join("/");
  const withoutExt = path.replace(/\.[A-Za-z0-9]+$/, "");
  return withoutExt || null;
}

/**
 * URL yang ADA di `before` tapi TIDAK ada di `after` — yaitu foto yang benar-benar
 * dibuang operator, bukan yang cuma dioptimasi ulang.
 *
 * Dibandingkan lewat public_id, bukan string URL: URL yang tersimpan bisa berisi
 * transformasi berbeda untuk foto yang sama.
 */
export function removedCloudinaryUrls(
  before: unknown,
  after: unknown
): string[] {
  const toList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const kept = new Set(
    toList(after)
      .map(cloudinaryPublicId)
      .filter((id): id is string => Boolean(id))
  );

  return toList(before).filter((url) => {
    const id = cloudinaryPublicId(url);
    return Boolean(id) && !kept.has(id as string);
  });
}
