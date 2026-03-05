import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { CalendarDays, Users, Clock } from "lucide-react";
import RotatingText from "@/components/RotatingText";
import Squares from "@/components/Squares";

const sourceSerif = localFont({
  src: [
    { path: "../fonts/source-serif/SourceSerif4-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/source-serif/SourceSerif4-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../fonts/source-serif/SourceSerif4-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white relative overflow-hidden">
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Squares
          speed={0.5}
          squareSize={40}
          direction="diagonal"
          borderColor="#D7D2E6"
          hoverFillColor="#F4F1FF"
        />
      </div>

     {/* Hero */}
      <main className="flex-1 relative z-10">
        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20 text-center">
          <h1 className={`${sourceSerif.className} text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight`}>
            <span>Manage your </span>
            <RotatingText
              texts={["schedules", "teams", "classes", "projects"]}
              mainClassName="inline-flex px-2 sm:px-2 md:px-3 bg-black text-white overflow-hidden py-0.5 sm:py-1 md:py-2 justify-center rounded-lg align-middle"
              staggerFrom="last"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden pb-0.5 sm:pb-1 md:pb-1"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2000}
            />
            <br className="hidden sm:block" />
            <span className="block">like a pro</span>
          </h1>

          <p className="mt-6 text-lg text-gray-700">
            Create, organize, and share scheduling grids.
            A Google-Docs-like experience for calendar management.
          </p>

          <div className="mt-10">
            <Link
              href="/register"
              className="inline-flex items-center px-6 py-3 rounded bg-black text-white text-base"
            >
              Start Now
            </Link>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Flexible Grids</h3>
              <p className="text-gray-700">
                Build weekly calendars with custom days and time windows.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <Users className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Team Management</h3>
              <p className="text-gray-700">
                Manage people, roles, categories, and assignments in one place.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Availability Rules</h3>
              <p className="text-gray-700">
                Define preferred, flexible, and impossible time ranges with ease.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer with partner logos */}
      <footer className="bg-black text-gray-300 relative z-10">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex items-center justify-center gap-10">
            <Image
              src="/polo52.png"
              alt="Polo 52"
              width={50}
              height={36}
              priority
            />
            <Image
              src="/ucc.png"
              alt="Universidad Católica de Córdoba"
              width={50}
              height={36}
              priority
            />
          </div>
          <p className="mt-6 text-center text-sm">
            © {new Date().getFullYear()} Shift. Hassle-free scheduling in one click.
          </p>
        </div>
      </footer>
    </div>
  );
}
