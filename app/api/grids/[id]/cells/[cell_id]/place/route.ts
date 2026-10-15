import { apiErrorPayload } from "@/lib/api-error-contract";
import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrlNormalized } from "@/lib/api-base";
import { getAccessToken } from "@/lib/cookies";

const B = getApiBaseUrlNormalized();

type SplitPlacementRequest = {
  mode?: string;
  schedule_id?: number | string;
  bundle_id?: number | string | null;
  duration_slots?: number;
  split_segment?: boolean;
  day_index?: number;
  start_slot?: number;
  selected_participant_ids?: Array<number | string>;
  auto_select_participants?: boolean;
  [key: string]: unknown;
};

const jsonHeaders = (access: string, cookie: string) => ({
  Authorization: `Bearer ${access}`,
  "content-type": "application/json",
  cookie,
});

async function forwardResponse(res: Response) {
  const txt = await res.text().catch(() => "");
  return new NextResponse(txt, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

async function placeSplitSegment(args: {
  gridId: string;
  cellId: string;
  access: string;
  cookie: string;
  payload: SplitPlacementRequest;
}) {
  const { gridId, cellId, access, cookie, payload } = args;
  const scheduleId = payload.schedule_id;
  const durationSlots = Math.max(1, Math.round(Number(payload.duration_slots)) || 1);
  const dayIndex = Number(payload.day_index);
  const startSlot = Number(payload.start_slot);
  if (scheduleId == null || !Number.isInteger(dayIndex) || !Number.isInteger(startSlot)) {
    return NextResponse.json(apiErrorPayload({ code: "INVALID_SPLIT_PLACEMENT_REQUEST", detail: "Invalid split placement request.", params: {} }, 400), { status: 400 });
  }
  const endSlot = startSlot + durationSlots;
  const selectedIds = Array.isArray(payload.selected_participant_ids)
    ? payload.selected_participant_ids
    : undefined;
  const optionsPayload = {
    schedule_id: scheduleId,
    source_cell_id: Number(cellId),
    bundle_id: payload.bundle_id ?? null,
    day_index: dayIndex,
    start_slot: startSlot,
    end_slot: endSlot,
    ...(selectedIds ? { assigned_participants: selectedIds } : {}),
  };
  const optionsRes = await fetch(
    `${B}/api/grids/${encodeURIComponent(gridId)}/schedule/placement-options/`,
    {
      method: "POST",
      headers: jsonHeaders(access, cookie),
      body: JSON.stringify(optionsPayload),
      cache: "no-store",
    },
  );
  const optionsData = await optionsRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!optionsRes.ok) {
    return NextResponse.json(optionsData ?? { detail: "Placement validation failed." }, { status: optionsRes.status });
  }
  if (optionsData?.is_valid === false) {
    return NextResponse.json(
      apiErrorPayload({ code: "PLACEMENT_INVALID", params: {}, non_field_errors: Array.isArray(optionsData.errors) ? optionsData.errors : ["Placement is not valid."] }, 400),
      { status: 400 },
    );
  }

  let assignedParticipants = selectedIds;
  if (!assignedParticipants && payload.auto_select_participants) {
    const options = optionsData?.options && typeof optionsData.options === "object"
      ? optionsData.options as Record<string, unknown>
      : {};
    const headcount = options.headcount == null ? null : Number(options.headcount);
    const validAssignments = Array.isArray(options.valid_assignments)
      ? options.valid_assignments.filter(Array.isArray) as Array<Array<number | string>>
      : [];
    if (headcount != null && headcount > 0 && validAssignments.length === 0) {
      return NextResponse.json(
        apiErrorPayload({ code: "PLACEMENT_AUTO_SELECTION_FAILED", detail: "No valid participant assignment is available for this placement.", params: {} }, 400),
        { status: 400 },
      );
    }
    assignedParticipants = validAssignments[0] ?? [];
  }

  const createRes = await fetch(`${B}/api/schedule-placements/`, {
    method: "POST",
    headers: jsonHeaders(access, cookie),
    body: JSON.stringify({
      schedule: scheduleId,
      source_cell: Number(cellId),
      bundle: payload.bundle_id ?? null,
      day_index: dayIndex,
      start_slot: startSlot,
      end_slot: endSlot,
      assigned_participants: assignedParticipants ?? [],
    }),
    cache: "no-store",
  });
  const placement = await createRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!createRes.ok) {
    return NextResponse.json(placement ?? { detail: "Placement is not valid." }, { status: createRes.status });
  }
  return NextResponse.json({
    cell_id: Number(cellId),
    mode: "PLACE_UNASSIGNED_CELL",
    schedule_id: scheduleId,
    schedule_revision: "unknown",
    placement,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cell_id: string }> },
) {
  const { id, cell_id } = await params;
  const access = await getAccessToken();
  if (!access) return NextResponse.json(apiErrorPayload({ error: "unauthenticated" }, 401), { status: 401 });

  const body = await req.text();
  const parsed = (() => {
    try {
      return JSON.parse(body) as SplitPlacementRequest;
    } catch {
      return null;
    }
  })();
  if (parsed?.mode === "PLACE_UNASSIGNED_CELL" && parsed.split_segment && parsed.duration_slots != null) {
    return placeSplitSegment({
      gridId: id,
      cellId: cell_id,
      access,
      cookie: req.headers.get("cookie") || "",
      payload: parsed,
    });
  }
  if (parsed) delete parsed.split_segment;
  const res = await fetch(
    `${B}/api/grids/${encodeURIComponent(id)}/cells/${encodeURIComponent(cell_id)}/place/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "content-type": req.headers.get("content-type") || "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: parsed ? JSON.stringify(parsed) : body,
      cache: "no-store",
    },
  );

  return forwardResponse(res);
}

