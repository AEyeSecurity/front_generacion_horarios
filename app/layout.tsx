import "@/styles/globals.css";
import NavBar from "@/components/NavBar";
import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        {/* Async Server Component */}
        <NavBar />
        <main className="max-w-5xl mx-auto p-4">{children}</main>

        {/* Sonner */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
