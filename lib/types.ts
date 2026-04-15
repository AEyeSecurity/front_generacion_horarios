export type Role = 'viewer' | 'editor' | 'supervisor';

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  preferred_language?: string | null;
  email_verified?: boolean | null;
  // Optional avatar fields (backend may expose any of these)
  avatar_url?: string | null;
  avatar?: string | null;
  image?: string | null;
};

export interface GridMembership {
  grid: number;      // grid id
  role: Role;
}

export type Grid = {
  id: number;
  grid_code?: string | null;
  name: string;
  description: string;
  day_start: string;         // "08:00:00"
  day_end: string;           // "20:00:00"
  days_enabled: number[];    // 0..6 (0=Lun)
  timezone: string | null;
  cell_size_min: number;     // minutos
  creator: number | null;
  created_at: string;        // ISO
};

export type Participant = {
  id: number;
  grid: number;
  name: string;
  surname?: string;
  tier?: "PRIMARY" | "SECONDARY" | "TERTIARY" | null;
  user_id?: number | null;
  user?: User | null;
  hours_week_mode?: "default" | "custom" | "not_available" | null;
  min_hours_week_override?: number | null;
  max_hours_week_override?: number | null;
};

export type ApiList<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type SchedulePlacement = {
  id: number;
  schedule: number;
  source_cell: number | null;
  bundle: number | null;
  day_index: number;
  start_slot: number;
  end_slot: number;
  assigned_participants: number[];
  locked: boolean;
  created_at: string;
  updated_at: string;
};

export type GridSchedule = {
  id: number;
  grid: number;
  status: string;
  source_run: number | null;
  source_candidate_index: number | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  placements: SchedulePlacement[];
};
