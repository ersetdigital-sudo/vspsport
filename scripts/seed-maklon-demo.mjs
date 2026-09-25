/**
 * Seed data DEMO untuk halaman admin Maklon (buat ngetes tampilan mobile).
 *
 * Pakai:
 *   node --env-file=.env.local scripts/seed-maklon-demo.mjs           # isi data demo
 *   node --env-file=.env.local scripts/seed-maklon-demo.mjs --clean   # hapus data demo
 *
 * Baris demo dikenali dari customer_name yang diawali "Demo " dan catatan
 * "[DEMO]" — jadi --clean tidak akan menyentuh data asli.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum terbaca dari .env.local");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const TABLE = "maklon_orders";
const DEMO_PREFIX = "Demo ";

if (process.argv.includes("--clean")) {
  const { data, error } = await db
    .from(TABLE)
    .delete()
    .like("customer_name", `${DEMO_PREFIX}%`)
    .select("order_number");
  if (error) {
    console.error("Gagal hapus data demo:", error.message);
    process.exit(1);
  }
  console.log(`Berhasil hapus ${data.length} data demo.`);
  process.exit(0);
}

// Jalankan ulang = replace, jadi tidak pernah dobel.
const { error: delError } = await db
  .from(TABLE)
  .delete()
  .like("customer_name", `${DEMO_PREFIX}%`);
if (delError) {
  console.error("Gagal membersihkan data demo lama:", delError.message);
  process.exit(1);
}

const dayOffset = (days) => {
  const t = new Date();
  t.setDate(t.getDate() + days);
  return t.toISOString();
};

// Nomor order mengikuti format asli: MKL + YYMMDD (Jakarta) + 4 karakter.
const datePart = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
})
  .format(new Date())
  .replace(/\D/g, "");
const CODES = ["DEMO", "KURA", "PREP", "QCOK", "HYPE"];
let codeIdx = 0;
const nextNumber = () => `MKL${datePart}${CODES[codeIdx++] ?? "DEMO"}`;

const photo = (seed) => `https://picsum.photos/seed/${seed}/480/480`;
const items = (name, qty) => [{ name, sizes: [{ size: "ALL", qty }] }];

const rows = [
  {
    order_number: nextNumber(),
    customer_name: `${DEMO_PREFIX}Rina Argata`,
    customer_phone: "081234567801",
    product_type: "Kaos Polo Custom",
    material: "Dryfit Serena",
    quantity: 50,
    sizes: "M(20), L(20), XL(10)",
    design_notes: "[DEMO] Layout baru dikirim ke customer, masih tunggu revisi warna.",
    current_status: "layout",
    current_stage: 1,
    design_photos: [photo("maklon-demo-a"), photo("maklon-demo-b")],
    wo_photos: [],
    products: items("Kaos Polo Custom", 50),
    courier: "",
    tracking_number: "",
    deadline: dayOffset(7),
    created_at: dayOffset(-2),
    updated_at: dayOffset(-1),
  },
  {
    order_number: nextNumber(),
    customer_name: `${DEMO_PREFIX}Budi Santoso`,
    customer_phone: "081234567802",
    product_type: "Jersey Futsal Anak",
    material: "Dryfit Micro",
    quantity: 36,
    sizes: "S(12), M(14), L(10)",
    design_notes: "[DEMO] Bahan sudah dipotong, tinggal masuk tahap press.",
    current_status: "cutting_bahan",
    current_stage: 3,
    design_photos: [photo("maklon-demo-c")],
    wo_photos: [photo("maklon-demo-w1")],
    products: items("Jersey Futsal Anak", 36),
    courier: "",
    tracking_number: "",
    deadline: dayOffset(10),
    created_at: dayOffset(-5),
    updated_at: dayOffset(-1),
  },
  {
    order_number: nextNumber(),
    customer_name: `${DEMO_PREFIX}Siti Amalia`,
    customer_phone: "081234567803",
    product_type: "Hoodie Zipper Polos",
    material: "Fleece Cotton 320gsm",
    quantity: 24,
    sizes: "M(10), L(9), XL(5)",
    design_notes: "[DEMO] Deadline mepet — QC harus tuntas hari ini.",
    current_status: "qc",
    current_stage: 5,
    design_photos: [photo("maklon-demo-d"), photo("maklon-demo-e")],
    wo_photos: [photo("maklon-demo-w2")],
    products: items("Hoodie Zipper Polos", 24),
    courier: "",
    tracking_number: "",
    deadline: dayOffset(2),
    created_at: dayOffset(-9),
    updated_at: dayOffset(0),
  },
  {
    order_number: nextNumber(),
    customer_name: `${DEMO_PREFIX}Toko Hypebeast`,
    customer_phone: "081234567804",
    product_type: "Totebag Kanvas Sablon",
    material: "Kanvas 12oz",
    quantity: 100,
    sizes: "ALL(100)",
    design_notes: "[DEMO] Tahap press sublime, antrian mesin 2 hari.",
    current_status: "press_sublime",
    current_stage: 4,
    design_photos: [photo("maklon-demo-f")],
    wo_photos: [],
    products: items("Totebag Kanvas Sablon", 100),
    courier: "",
    tracking_number: "",
    deadline: dayOffset(5),
    created_at: dayOffset(-4),
    updated_at: dayOffset(-1),
  },
  {
    order_number: nextNumber(),
    customer_name: `${DEMO_PREFIX}Komunitas Lari Sleman`,
    customer_phone: "081234567805",
    product_type: "Running Shirt Lengan Pendek",
    material: "Dryfit Serena",
    quantity: 75,
    sizes: "S(20), M(30), L(25)",
    design_notes: "[DEMO] Sudah dikirim ke customer pakai JNE.",
    current_status: "selesai",
    current_stage: 6,
    design_photos: [photo("maklon-demo-g")],
    wo_photos: [photo("maklon-demo-w3")],
    products: items("Running Shirt Lengan Pendek", 75),
    courier: "JNE - REG",
    tracking_number: "JNE00123456789",
    deadline: dayOffset(-1),
    created_at: dayOffset(-14),
    updated_at: dayOffset(-1),
  },
];

const { error } = await db.from(TABLE).insert(rows);
if (error) {
  console.error("Gagal insert data demo:", error.message);
  process.exit(1);
}

const { data } = await db
  .from(TABLE)
  .select("order_number, customer_name, current_stage, current_status, deadline")
  .like("customer_name", `${DEMO_PREFIX}%`)
  .order("created_at", { ascending: false });

console.log(`Berhasil insert ${rows.length} data demo maklon.\n`);
console.table(data);
console.log("Bersihkan lagi dengan: node --env-file=.env.local scripts/seed-maklon-demo.mjs --clean");
