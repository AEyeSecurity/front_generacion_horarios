export type Role = 'viewer' | 'editor' | 'supervisor';

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
};

export interface GridMembership {
  grid: number;      // grid id
  role: Role;
}

export type Grid = {
  id: number;
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

export type ApiList<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};
