const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

export type Curtain = {
  id: string;
  type: string;
  name: string;
  color: string;
  thumbnail_url: string;
  description: string;
  render_style?: string | null;
};

/** Display label for a backend curtain type key. */
export const typeLabel = (t: string) =>
  t === "Tul Perde" ? "Tül Perde" : t === "Gunesilik" ? "Güneşlik" : t === "Ahsap Jaluzi" ? "Ahşap Jaluzi" : t;

export const CURTAIN_FILTERS = [
  "Tümü",
  "Fon Perde",
  "Tul Perde",
  "Rustik",
  "Ahsap Jaluzi",
  "Stor",
  "Plise",
  "Zebra",
  "Gunesilik",
];

export type BBox = { x1: number; y1: number; x2: number; y2: number };

export type Measurement = {
  detected: boolean;
  window_width_cm: number;
  window_height_cm: number;
  wall_width_cm: number;
  wall_height_cm: number;
  window_bbox_pct?: BBox | null;
  wall_bbox_pct?: BBox | null;
  notes: string;
};

export type Project = {
  id: string;
  name: string;
  original_image_base64: string;
  rendered_image_base64: string;
  curtain_id: string;
  curtain_name: string;
  curtain_type: string;
  curtain_color: string;
  window_width_cm: number;
  window_height_cm: number;
  wall_width_cm?: number | null;
  wall_height_cm?: number | null;
  layers?: string[];
  quote_id?: string | null;
  created_at: string;
};

export type QuoteCreate = {
  project_id: string;
  customer_name: string;
  phone: string;
  email?: string;
  city: string;
  address?: string;
  notes?: string;
  quantity: number;
  installation: boolean;
};

export type Quote = QuoteCreate & {
  id: string;
  reference: string;
  project_name: string;
  curtain_name: string;
  curtain_type: string;
  curtain_color: string;
  layers: string[];
  window_width_cm: number;
  window_height_cm: number;
  wall_width_cm?: number | null;
  wall_height_cm?: number | null;
  status: string;
  created_at: string;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t}`);
  }
  return res.json();
}

export const api = {
  listCurtains: () =>
    req<Curtain[]>("/curtains").then((list) =>
      list.map((c) =>
        c.thumbnail_url.startsWith("/") ? { ...c, thumbnail_url: `${BASE}${c.thumbnail_url}` } : c,
      ),
    ),
  analyze: (image_base64: string, reference_width_cm?: number) =>
    req<Measurement>("/analyze-measurements", {
      method: "POST",
      body: JSON.stringify({ image_base64, reference_width_cm }),
    }),
  render: (params: {
    image_base64: string;
    curtain_type: string;
    curtain_name: string;
    curtain_color: string;
    window_width_cm?: number;
    window_height_cm?: number;
    texture_image_base64?: string;
    layer_over_existing?: boolean;
    window_bbox_pct?: BBox;
  }) =>
    req<{ rendered_image_base64: string }>("/render-curtain", {
      method: "POST",
      body: JSON.stringify(params),
    }),
  createProject: (p: Omit<Project, "id" | "created_at" | "quote_id">) =>
    req<Project>("/projects", { method: "POST", body: JSON.stringify(p) }),
  listProjects: () => req<Project[]>("/projects"),
  getProject: (id: string) => req<Project>(`/projects/${id}`),
  deleteProject: (id: string) => req<{ success: boolean }>(`/projects/${id}`, { method: "DELETE" }),
  createQuote: (q: QuoteCreate) =>
    req<Quote>("/quotes", { method: "POST", body: JSON.stringify(q) }),
  getQuote: (id: string) => req<Quote>(`/quotes/${id}`),
};
