import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
import { CalendarDays, Users, Clock } from "lucide-react";
import RotatingText from "@/components/animations/RotatingText";
import Squares from "@/components/animations/Squares";
import { t as translate, type I18nKey } from "@/lib/i18n";
import { normalizePreferredLanguage, type PreferredLanguage } from "@/lib/language";

const sourceSerif = localFont({
  src: [
    { path: "../../app/fonts/source-serif/SourceSerif4-Regular.ttf", weight: "400", style: "normal" },
    { path: "../../app/fonts/source-serif/SourceSerif4-SemiBold.ttf", weight: "600", style: "normal" },
    { path: "../../app/fonts/source-serif/SourceSerif4-Bold.ttf", weight: "700", style: "normal" },
  ],
  display: "swap",
});

type LandingPageProps = {
  language?: PreferredLanguage;
};

export default function LandingPage({ language = "en-US" }: LandingPageProps) {
  const locale = normalizePreferredLanguage(language);
  const t = (key: I18nKey, params?: Record<string, string | number>) => translate(locale, key, params);
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

      <main className="flex-1 relative z-10">
        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20 text-center">
          <h1 className={`${sourceSerif.className} text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight`}>
            <span>{t("landing.manage_your")} </span>
            <RotatingText
              texts={[t("landing.schedules"), t("landing.teams"), t("landing.classes"), t("landing.projects")]}
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
            <span className="block">{t("landing.like_a_pro")}</span>
          </h1>

          <p className="mt-6 text-lg text-gray-700">
            {t("landing.hero_description")}
          </p>

          <div className="mt-10">
            <Link
              href="/register"
              className="inline-flex items-center px-6 py-3 rounded bg-black text-white text-base"
            >
              {t("landing.start_now")}
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">{t("landing.flexible_grids")}</h3>
              <p className="text-gray-700">
                {t("landing.flexible_grids_description")}
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <Users className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">{t("landing.team_management")}</h3>
              <p className="text-gray-700">
                {t("landing.team_management_description")}
              </p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" aria-hidden />
              </div>
              <h3 className="font-semibold text-lg">{t("landing.availability_rules")}</h3>
              <p className="text-gray-700">
                {t("landing.availability_rules_description")}
              </p>
            </div>
          </div>
        </section>
      </main>

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
              alt="Universidad Catolica de Cordoba"
              width={50}
              height={36}
              priority
            />
          </div>
          <p className="mt-6 text-center text-sm">
            {t("landing.footer_text", { year: new Date().getFullYear() })}
          </p>
        </div>
      </footer>
    </div>
  );
}
