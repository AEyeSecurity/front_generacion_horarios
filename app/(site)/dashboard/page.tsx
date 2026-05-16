import Link from "next/link";
import { requireUserOrRedirect } from "@/lib/auth";
import { getTranslation } from "@/lib/i18n";
import ClientRecentProjects from "@/components/dashboard/ClientRecentProjects";

export default async function DashboardPage() {
  // Mantenemos la seguridad y la traducción en el servidor (esto ya funcionaba)
  const me = await requireUserOrRedirect("/dashboard");
  const t = (key: Parameters<typeof getTranslation>[1]) => getTranslation(me.preferred_language, key);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Create section */}
      <section className="bg-gray-100">
        <div className="max-w-6xl mx-auto px-6 pt-4 pb-8">
          <h2 className="text-lg font-semibold mb-8">{t("dashboard.create_project")}</h2>
          <Link
            href="/grid/new"
            className="block w-[9rem] h-[10.5rem] bg-white rounded-xl border shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <div className="text-3xl text-gray-400 leading-none">+</div>
              <div className="text-xs text-gray-700">{t("dashboard.blank_project")}</div>
            </div>
          </Link>
        </div>
      </section>

      {/* Recent projects cargados desde el cliente para saltear el bache de red */}
      <section className="max-w-6xl mx-auto px-6 py-8">
        <ClientRecentProjects meId={me.id} />
      </section>
    </div>
  );
}
