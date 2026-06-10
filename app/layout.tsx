import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";
import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { normalizePreferredLanguage } from "@/lib/language";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shift Scheduler",
  icons: {
    icon: "/shift.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const googleSans = localFont({
  src: [
    { path: "./fonts/google-sans/GoogleSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/google-sans/GoogleSans-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/google-sans/GoogleSans-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "./fonts/google-sans/GoogleSans-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-google-sans",
  display: "swap",
});

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const language = normalizePreferredLanguage(h.get("accept-language"));

  return (
    <html lang={language}>
      <body className={`${googleSans.variable} min-h-dvh bg-gray-50 text-gray-900 font-sans`}>
        <main className="w-full">{children}</main>

        {/* Sonner */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
