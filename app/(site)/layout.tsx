import { NavBar } from "@/components/navigation";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="w-full">{children}</main>
    </>
  );
}
