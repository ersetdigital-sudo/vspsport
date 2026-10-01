/**
 * Cloudinary — upload gambar dari sisi browser memakai UNSIGNED upload preset
 * (env: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME + NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
 * keduanya memang aman dipublikasikan).
 *
 * Berkas ini di-import komponen client, jadi JANGAN pernah menaruh API key/secret
 * di sini. Operasi yang butuh tanda tangan (hapus aset) ada di
 * lib/cloudinary-server.ts.
 */

import {
  beginUpload,
  failUpload,
  finishUpload,
  markUploadReady,
  setUploadPercent,
} from "@/lib/upload-progress";

/*
 * ── Perkecil foto di browser sebelum dikirim ───────────────────────────────
 *
 * Upload dulu mengirim berkas apa adanya, jadi foto kamera HP 4-6 MB ikut
 * dikirim utuh — lambat di jaringan seluler, dan yang tersimpan di Cloudinary
 * juga versi besar itu. Dashboard paling besar cuma menampilkan foto selebar
 * 1600px, jadi piksel di atas itu tidak pernah terlihat siapa pun.
 *
 * Aturannya sengaja "pessimistis": kalau ragu, KIRIM BERKAS ASLINYA. Gagal
 * memperkecil tidak boleh bikin admin tidak bisa upload.
 */

/** Sisi terpanjang gambar yang perlu disimpan ke Cloudinary. */
const MAX_UPLOAD_DIMENSION = 1600;

/** Kualitas saat foto di-encode ulang (dipakai JPEG & WebP). */
const JPEG_QUALITY = 0.82;

/**
 * Ambang "sudah cukup ringan": berkas di bawah ini dikirim apa adanya tanpa
 * didekode dulu.
 *
 * Patokannya ukuran BERKAS, bukan cuma dimensi. PNG 1024px bisa berat 900 KB
 * walau dimensinya sudah "kecil" — justru itu yang bikin upload terasa lambat.
 */
const SKIP_REENCODE_BYTES = 300 * 1024;

/**
 * Ukuran gambar tanpa mendekode seluruh pikselnya (browser cuma baca header).
 * `null` = tidak terbaca → pemanggil kembali ke jalur dekode penuh.
 */
function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (size: { width: number; height: number } | null) => {
      URL.revokeObjectURL(url);
      resolve(size);
    };
    img.onload = () =>
      done(
        img.naturalWidth && img.naturalHeight
          ? { width: img.naturalWidth, height: img.naturalHeight }
          : null
      );
    img.onerror = () => done(null);
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Encode canvas ke format paling ringan yang didukung browser.
 *
 * WebP dicoba lebih dulu: hasilnya paling kecil untuk gambar seperti mockup
 * desain jersey, dan ia mendukung transparansi sehingga PNG tidak perlu diubah
 * jadi JPEG (yang akan menghitamkan area transparannya).
 *
 * Browser tanpa dukungan WebP (Safari < 14) TIDAK mengembalikan null, tapi
 * diam-diam menyerahkan PNG — karena itu hasilnya diperiksa dari `blob.type`.
 */
async function encodeCanvas(
  canvas: HTMLCanvasElement,
  sourceIsPng: boolean
): Promise<{ blob: Blob | null; ext: string }> {
  const webp = await canvasToBlob(canvas, "image/webp", JPEG_QUALITY);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };

  const fallbackType = sourceIsPng ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, fallbackType, JPEG_QUALITY);
  return { blob, ext: sourceIsPng ? "png" : "jpg" };
}

async function downscaleImage(file: File): Promise<{ blob: Blob; filename: string }> {
  const asIs = { blob: file as Blob, filename: file.name || "foto.jpg" };

  // Browser lawas tidak punya createImageBitmap.
  if (typeof createImageBitmap !== "function") return asIs;

  // Jalur cepat: dimensi sudah cukup kecil DAN berkasnya sudah ringan.
  const probed = await readImageSize(file);
  const smallDimension =
    !!probed && Math.max(probed.width, probed.height) <= MAX_UPLOAD_DIMENSION;
  if (smallDimension && file.size <= SKIP_REENCODE_BYTES) return asIs;

  let bitmap: ImageBitmap;
  try {
    // `from-image` menghormati orientasi EXIF — tanpa ini foto HP yang dipotret
    // miring akan tersimpan miring setelah digambar ulang ke canvas.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return asIs;
  }

  try {
    // Dimensi yang sudah cukup kecil TIDAK diperbesar; yang diperbaiki cuma
    // format & kompresinya (mis. PNG 900 KB → WebP ~150 KB).
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > MAX_UPLOAD_DIMENSION ? MAX_UPLOAD_DIMENSION / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return asIs;

    // PNG bisa punya bagian transparan (mockup desain sering begitu). Latar
    // putih hanya dipakai kalau sumbernya memang tidak punya alpha.
    const sourceIsPng = file.type === "image/png";
    if (!sourceIsPng) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const { blob, ext } = await encodeCanvas(canvas, sourceIsPng);

    // Kalau hasilnya tidak lebih kecil (mis. PNG kecil tapi padat), pakai aslinya.
    if (!blob || blob.size >= file.size) return asIs;

    const base = (file.name || "foto").replace(/\.[^.]+$/, "");
    return { blob, filename: base + "." + ext };
  } catch {
    return asIs;
  } finally {
    bitmap.close();
  }
}

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
 *
 * Foto diperkecil dulu di browser (lihat downscaleImage) supaya yang dikirim —
 * dan yang tersimpan permanen — bukan berkas 4-6 MB dari kamera HP.
 *
 * Setiap tahapnya dilaporkan ke lib/upload-progress.ts, sehingga dashboard bisa
 * menampilkan "2,4 MB → 320 KB · 45%" tanpa satu pun pemanggil upload ini perlu
 * menambah parameter.
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

  // Diumumkan ke indikator upload di dashboard; lihat lib/upload-progress.ts.
  const jobId = beginUpload(file.name || "foto", file.size);

  try {
    const upload = await downscaleImage(file);

    // Sejak titik ini ukurannya sudah pasti — inilah angka yang dikirim ke
    // Cloudinary, dan itulah yang ditampilkan ke operator.
    markUploadReady(jobId, upload.blob.size);

    const formData = new FormData();
    formData.append("file", upload.blob, upload.filename);
    formData.append("upload_preset", uploadPreset);
    formData.append("folder", params.folder || CLOUDINARY_FOLDER);

    const data = await postToCloudinary(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      formData,
      jobId
    );
    finishUpload(jobId);
    return { url: data.secure_url, public_id: data.public_id };
  } catch (e) {
    failUpload(jobId);
    throw e;
  }
}

/**
 * Kirim berkas ke Cloudinary sambil melaporkan persentasenya.
 *
 * Memakai XMLHttpRequest, bukan fetch: hanya XHR yang memberi event progres
 * pengiriman (`upload.onprogress`). Dengan `fetch`, satu-satunya kabar yang
 * bisa ditampilkan adalah "sedang mengunggah" tanpa angka — dan untuk foto
 * 300 KB di jaringan seluler, menunggu tanpa angka itulah yang terasa lambat.
 * Pesan kesalahannya sengaja sama dengan versi fetch sebelumnya supaya teks di
 * dashboard tidak berubah.
 */
function postToCloudinary(
  url: string,
  formData: FormData,
  jobId: number
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    // Tanpa batas waktu, koneksi yang macet membuat indikatornya berputar
    // selamanya tanpa kabar apa pun.
    xhr.timeout = 120_000;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadPercent(jobId, e.loaded, e.total);
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve(data);
        return;
      }
      reject(new Error(data?.error?.message || "Upload gagal"));
    };
    xhr.onerror = () => reject(new Error("Koneksi terputus saat upload. Coba lagi."));
    xhr.ontimeout = () => reject(new Error("Upload terlalu lama. Coba lagi."));

    xhr.send(formData);
  });
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
