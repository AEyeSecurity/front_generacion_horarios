"use client";

import { useEffect, useState } from "react";
// Usamos el alias oficial para asegurarnos de que Next.js encuentre el archivo
import RecentProjects from "@/components/dashboard/RecentProjects";

interface ClientRecentProjectsProps {
  meId: any; // Cambiado a any para evitar que explote si es un número
}

export default function ClientRecentProjects({ meId }: ClientRecentProjectsProps) {
  const [grids, setGrids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/grids", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: any) => {
        const normalized = Array.isArray(data) ? data : (data.results ?? []);
        setGrids(normalized);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-8 text-gray-500">Cargando proyectos recientes...</div>;
  }

  if (error) {
    return <div className="max-w-6xl mx-auto px-6 py-8 text-red-500">Error al cargar proyectos (Código: {error})</div>;
  }

  return <RecentProjects meId={meId} initialItems={grids} />;
}
