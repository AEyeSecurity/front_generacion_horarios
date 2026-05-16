"use client";

import { useEffect, useState } from "react";
import RecentProjects from "./RecentProjects";

interface ClientRecentProjectsProps {
  meId: string;
}

export default function ClientRecentProjects({ meId }: ClientRecentProjectsProps) {
  const [grids, setGrids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // El navegador le pega a la ruta relativa de forma directa y automática
    fetch("/api/grids", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data) => {
        // La misma lógica de normalización que tenías en el server
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
