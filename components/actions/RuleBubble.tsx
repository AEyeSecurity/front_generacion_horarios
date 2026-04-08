"use client";

export default function RuleBubble({
  title,
  subtitle,
  colors,
  canEdit = false,
  onEdit,
}: {
  title: string;
  subtitle: string;
  colors: { bg: string; text: string; bar: string; topBorder?: string; border?: string };
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div
      className={`h-full w-full ${colors.bg} border ${colors.border ?? "border-gray-200"} rounded-md shadow-sm flex flex-col justify-center ${colors.topBorder ?? ""} border-t-4`}
      onDoubleClick={() => {
        if (!canEdit) return;
        onEdit?.();
      }}
    >
      <div className="flex h-full items-center justify-center px-2 py-2 text-center">
        <div className="leading-tight">
          <div className={`text-sm font-medium ${colors.text}`}>{title}</div>
          <div className={`text-xs ${colors.text}`}>{subtitle}</div>
        </div>
      </div>
    </div>
  );
}
