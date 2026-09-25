-- ============================================================================
-- MENARA — 0007 nomor WhatsApp resmi
-- ============================================================================
-- Nomor di tabel `brand` dibaca LANGSUNG oleh halaman tracking customer
-- (`/track`, `/status`, `/status/maklon` lewat `/api/brand`) untuk membentuk
-- link `wa.me` tombol "Hubungi CS". Selama isinya placeholder, semua customer
-- diarahkan ke nomor yang tidak ada.
--
-- Nomor ini juga dipakai sebagai nilai cadangan di kode (lib/data.ts →
-- `WA_NUMBER`) saat database tidak terjangkau.
--
-- Mengubah nomor SETELAH migrasi ini TIDAK perlu migrasi baru — cukup menu
-- Pengaturan admin (`/api/admin/profil-toko`), tanpa deploy ulang.
--
-- Aman dijalankan berulang: hanya menimpa baris yang masih kosong atau masih
-- berisi nomor placeholder, jadi nomor yang sudah diubah lewat dashboard
-- tidak akan tertimpa balik.
-- ============================================================================

update public.brand
set whatsapp_number = '628115491117'
where id = 1
  and (
    whatsapp_number is null
    or btrim(whatsapp_number) = ''
    or whatsapp_number = '6281234567890'
  );

-- Kalau baris `brand` belum ada sama sekali (database baru yang belum menjalankan
-- 0003), buat baris minimalnya supaya halaman tracking tidak jatuh ke fallback.
--
-- `tagline` dan `description` NOT NULL tanpa default, jadi keduanya WAJIB ada di
-- daftar kolom — `on conflict (id) do nothing` tidak menyelamatkan: Postgres tetap
-- memeriksa NOT NULL pada baris yang diajukan sebelum konflik id-nya ketemu,
-- sehingga versi lama (tanpa dua kolom ini) selalu gagal 23502 di database mana
-- pun yang baris brand-nya sudah ada.
insert into public.brand (id, name, monogram, tagline, description, whatsapp_number, logo_path)
values (
  1,
  'MENARA',
  'MENARA',
  E'Pabrik Jersey Custom Full Printing.\nDesain bebas, harga pabrik, kirim se-Indonesia.',
  'MENARA — pabrik jersey custom full printing. Desain bebas, harga mulai 85rb, kirim se-Indonesia. Konsultasi gratis via WhatsApp.',
  '628115491117',
  '/logo-menara.png'
)
on conflict (id) do nothing;
