"use client";

import { forwardRef } from "react";
import { Trash2 } from "lucide-react";
import GlassSurface from "@/components/ui/GlassSurface";

type DeleteDropBubbleProps = {
  active: boolean;
  visible: boolean;
  title: string;
  dataAttribute?: string;
  className?: string;
};

const DeleteDropBubble = forwardRef<HTMLDivElement, DeleteDropBubbleProps>(function DeleteDropBubble(
  { active, visible, title, dataAttribute = "data-left-delete-drop", className = "" },
  ref,
) {
  if (!visible) return null;

  const dataProps = dataAttribute ? ({ [dataAttribute]: "true" } as Record<string, string>) : {};

  return (
    <div className={`relative h-12 w-12 ${className}`}>
      <div
        className={`absolute left-[-96px] top-[-86px] pointer-events-none transition-all duration-200 -z-10 ${
          active ? "opacity-100 scale-100" : "opacity-0 scale-95"
        }`}
      >
        <div className="absolute left-0 top-0 h-[220px] w-[220px] rounded-full bg-red-500/35 shadow-[0_12px_30px_rgba(239,68,68,0.35)]" />
        <GlassSurface
          width={220}
          height={220}
          borderRadius={999}
          backgroundOpacity={0.14}
          brightness={50}
          opacity={0.95}
          blur={14}
          displace={0.65}
          distortionScale={-210}
          redOffset={30}
          greenOffset={0}
          blueOffset={0}
          saturation={1.8}
          mixBlendMode="screen"
          className="pointer-events-none absolute left-0 top-0"
          style={{ background: "rgba(255, 255, 255, 0.26)" }}
        />
      </div>

      <div
        ref={ref}
        {...dataProps}
        className={`relative isolate w-12 h-12 rounded-full border border-gray-200 shadow-md pointer-events-auto transition-all duration-150 flex items-center justify-center scale-75 opacity-90 ${
          active ? "bg-white ring-2 ring-red-400" : "bg-white"
        }`}
        title={title}
      >
        <Trash2 className="w-5 h-5 text-red-600" />
      </div>
    </div>
  );
});

export default DeleteDropBubble;
