export interface Report {
  id: string;
  date: string; // ISO string YYYY-MM-DD
  content: string;
  lastUpdated: number;
  images?: string[];
}

export interface StudentProfile {
  name: string;
}
