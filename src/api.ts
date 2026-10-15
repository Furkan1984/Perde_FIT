const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

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
  if (!BASE) throw new Error("Backend adresi tanımlı değil (EXPO_PUBLIC_BACKEND_URL)");
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

// Offline/preview fallback: a small local copy of the catalog so the picker
// screen stays usable when the backend is unreachable. Thumbnails mirror the
// backend's public Unsplash/static URLs.
const FALLBACK_CURTAINS: Curtain[] = [
  { id: "fon-keten-dokulu", type: "Fon Perde", name: "Keten Dokulu", color: "Bej", thumbnail_url: "https://images.unsplash.com/photo-1675784332655-675d1a1ddcf6?q=85&w=400", description: "Doğal keten dokulu fon perde" },
  { id: "fon-antrasit", type: "Fon Perde", name: "Antrasit", color: "Antrasit Gri", thumbnail_url: "https://images.unsplash.com/photo-1675784332655-675d1a1ddcf6?q=85&w=400", description: "Karartma fon perde" },
  { id: "rustik-keten-hardal", type: "Rustik", name: "Rustik Keten", color: "Hardal", thumbnail_url: "https://images.unsplash.com/photo-1754611362309-71297e9f42fd?q=85&w=400", description: "Ham keten rustik" },
  { id: "jaluzi-ceviz", type: "Ahsap Jaluzi", name: "Ceviz Ahsap Jaluzi", color: "Ceviz", thumbnail_url: "https://images.unsplash.com/photo-1643313262988-cdc5f50c6019?q=85&w=400", description: "50 mm ahşap jaluzi" },
  { id: "tul-inci", type: "Tul Perde", name: "İnci Tül", color: "Beyaz", thumbnail_url: "https://images.unsplash.com/photo-1615799998603-7c6270a45196?q=85&w=400", description: "İnce beyaz tül" },
  { id: "stor-gri", type: "Stor", name: "Gri Stor", color: "Gri", thumbnail_url: "https://images.unsplash.com/photo-1643313262988-cdc5f50c6019?q=85&w=400", description: "Düz gri stor" },
  { id: "plise-gri", type: "Plise", name: "Gri Pileli", color: "Açık Gri", thumbnail_url: "https://images.unsplash.com/photo-1762012591530-8a5774095ebe?q=85&w=400", description: "Pileli plise" },
  { id: "zebra-siyah-beyaz", type: "Zebra", name: "Klasik Zebra", color: "Siyah-Beyaz", thumbnail_url: "https://images.unsplash.com/photo-1643313262988-cdc5f50c6019?q=85&w=400", description: "Klasik zebra" },
  { id: "gunes-rustik-krem", type: "Gunesilik", name: "Rustik Güneşlik", color: "Krem", thumbnail_url: "https://images.unsplash.com/photo-1675784332655-675d1a1ddcf6?q=85&w=400", description: "Rustik güneş perdesi" },
];

export const api = {
  listCurtains: () =>
    req<Curtain[]>("/curtains")
      .then((list) =>
        list.map((c) =>
          c.thumbnail_url.startsWith("/") ? { ...c, thumbnail_url: `${BASE}${c.thumbnail_url}` } : c,
        ),
      )
      .catch(() => FALLBACK_CURTAINS),
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
