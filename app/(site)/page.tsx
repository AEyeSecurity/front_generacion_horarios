import Image from "next/image";
import Link from "next/link";
import { CalendarDays, Users, Clock } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20 text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight">
            Manage your schedules
            <br className="hidden sm:block" />
            <span className="block">like a pro</span>
          </h1>

          <p className="mt-6 text-lg text-gray-600">
            Create, organize, and share scheduling grids for your team, classes, or projects.
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
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <CalendarDays className="w-6 h-6" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Flexible Grids</h3>
              <p className="text-gray-600">
                Build weekly calendars with custom days and time windows.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Users className="w-6 h-6" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Team Management</h3>
              <p className="text-gray-600">
                Manage people, roles, categories, and assignments in one place.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center">
                <Clock className="w-6 h-6" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">Availability Rules</h3>
              <p className="text-gray-600">
                Define preferred, flexible, and impossible time ranges with ease.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer with partner logos */}
      <footer className="bg-black text-gray-300">
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

