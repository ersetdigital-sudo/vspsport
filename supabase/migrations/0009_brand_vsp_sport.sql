-- ============================================================================
-- VSP Sport — 0009 rebrand identitas toko
-- ============================================================================
-- Baris `brand` (id = 1) dibaca langsung oleh halaman publik — beranda, `/track`,
-- `/status`, `/status/maklon` (lewat `lib/queries.ts` → `getBrand()`) — untuk
-- nama toko, monogram, tagline, deskripsi, dan logo. Selama isinya masih MENARA,
-- seluruh halaman customer tetap memakai identitas lama walau kode sudah di-rebrand.
--
-- Migrasi ini SENGAJA tidak mengubah `whatsapp_number`, `tagline`, dan
-- `app_settings`. Tagline tidak memuat nama brand, dan nomor WhatsApp tetap
-- dikelola dari menu Pengaturan admin (`/api/admin/profil-toko`) — mengubahnya
-- di sini akan menimpa nomor yang sudah disetel operator.
--
-- Kenapa tidak mengedit 0003/0007: migrasi yang sudah dijalankan tidak boleh
-- diubah isinya — Supabase melacak migrasi per versi, jadi perubahan pada berkas
-- lama tidak akan ikut jalan di database yang sudah dimigrasi. Database baru
-- tetap berakhir benar: 0003 menanam nilai MENARA, lalu migrasi ini menimpanya.
--
-- Aman dijalankan berulang.
-- ============================================================================

update public.brand
set name        = 'VSP Sport',
    monogram    = 'VSP',
    -- Ganti nama di deskripsi SEO tanpa menulis ulang kalimatnya.
    description = replace(description, 'MENARA', 'VSP Sport'),
    logo_path   = '/logo-vsp.png',
    updated_at  = now()
where id = 1;

-- Kalau baris `brand` belum ada sama sekali (database yang belum menjalankan 0003),
-- buat barisnya supaya halaman publik tidak jatuh ke nilai cadangan di lib/data.ts.
insert into public.brand (id, name, monogram, tagline, description, whatsapp_number, logo_path)
values (
  1,
  'VSP Sport',
  'VSP',
  E'Tempat Bikin Jersey Futsal Custom.\nDesain bebas, harga pabrik, kirim se-Indonesia.',
  'VSP Sport — tempat bikin jersey futsal custom full printing. Desain bebas, harga mulai 85rb, kirim se-Indonesia. Konsultasi gratis via WhatsApp.',
  '628115491117',
  '/logo-vsp.png'
)
on conflict (id) do nothing;
