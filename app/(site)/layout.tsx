import NavBar from "@/components/NavBar";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="w-full">{children}</main>
    </>
  );
}

