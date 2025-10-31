import "@/styles/globals.css";
import { Toaster } from "@/components/ui/sonner";

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        <main className="w-full">{children}</main>

        {/* Sonner */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
