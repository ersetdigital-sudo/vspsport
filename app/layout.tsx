import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { getAppUrl } from "@/lib/app-url";
import { getBrand } from "@/lib/queries";
import "./globals.css";

/**
 * Font — Geist (satu keluarga untuk semuanya, sesuai mockup VSP Sport).
 * --font-display dan --font-mono di globals.css mengikuti --font-sans.
 */
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

/**
 * Metadata dinamis — nama, tagline, dan deskripsi dibaca dari tabel `brand`
 * di Supabase, jadi admin bisa mengubahnya tanpa deploy ulang.
 */
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  const taglineFirstLine = brand.tagline.split("\n")[0];

  return {
    // Canonical = domain aplikasi ini sendiri, dibaca dari env Vercel.
    // Sebelumnya memakai `brand.url` (domain situs katalog), dan nilainya
    // ternyata sudah mati — jadi canonical/OG mengarah ke halaman 404.
    metadataBase: new URL(getAppUrl()),
    title: {
      default: `${brand.name} — Admin Panel`,
      template: `%s · ${brand.name}`,
    },
    description: brand.description,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "id_ID",
      url: getAppUrl(),
      siteName: brand.name,
      title: `${brand.name} — ${taglineFirstLine}`,
      description: brand.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${brand.name} — ${taglineFirstLine}`,
      description: brand.description,
    },
    // Panel operasional + halaman tracking customer: jangan diindeks.
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
    category: "business",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F6F4" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning className={geist.variable}>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
