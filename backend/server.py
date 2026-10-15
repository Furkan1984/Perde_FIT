import asyncio
import base64
import io
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

try:
    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    LLM_AVAILABLE = True
except ImportError:  # local dev / tests without the Emergent package
    ImageContent = LlmChat = UserMessage = None
    LLM_AVAILABLE = False

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

# --- Storage: MongoDB when configured, in-memory fallback otherwise ---
# Without MONGO_URL the API still runs (projects/quotes live in process
# memory) so local dev, CI and smoke tests work out of the box.


class _MemoryCollection:
    """Minimal async collection mimicking the motor calls this app uses."""

    def __init__(self):
        self._docs = []

    async def insert_one(self, doc):
        self._docs.append(dict(doc))
        return type("R", (), {"inserted_id": doc.get("id")})()

    async def find_one(self, query, projection=None):
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    def find(self, query, projection=None):
        docs = [dict(d) for d in self._docs if all(d.get(k) == v for k, v in query.items())]
        coll = self

        class _Cursor:
            def sort(self, key, direction):
                docs.sort(key=lambda d: d.get(key, ""), reverse=direction < 0)
                return self

            async def to_list(self, n):
                return docs[:n]

        return _Cursor()

    async def count_documents(self, query):
        return sum(1 for d in self._docs if all(d.get(k) == v for k, v in query.items()))

    async def delete_one(self, query):
        for i, d in enumerate(self._docs):
            if all(d.get(k) == v for k, v in query.items()):
                self._docs.pop(i)
                return type("R", (), {"deleted_count": 1})()
        return type("R", (), {"deleted_count": 0})()

    async def update_one(self, query, update):
        for d in self._docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))
                return type("R", (), {"modified_count": 1})()
        return type("R", (), {"modified_count": 0})()


class _MemoryDB(dict):
    def __getitem__(self, name):
        if name not in self:
            self[name] = _MemoryCollection()
        return dict.__getitem__(self, name)

    def __getattr__(self, name):
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name)


mongo_url = os.environ.get("MONGO_URL")
client = None
if mongo_url:
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get("DB_NAME", "perdefit")]
else:
    db = _MemoryDB()

app = FastAPI(title="PerdeFIT API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("perdefit")


# -----------------------------
# Models
# -----------------------------
MAX_IMAGE_B64_CHARS = 12_000_000  # ~9 MB decoded; guards the paid LLM endpoints


class BBoxPct(BaseModel):
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    x2: float = Field(ge=0, le=1)
    y2: float = Field(ge=0, le=1)


class MeasurementRequest(BaseModel):
    image_base64: str = Field(max_length=MAX_IMAGE_B64_CHARS)
    reference_width_cm: Optional[float] = None


class MeasurementResponse(BaseModel):
    detected: bool
    window_width_cm: Optional[float] = None
    window_height_cm: Optional[float] = None
    wall_width_cm: Optional[float] = None
    wall_height_cm: Optional[float] = None
    window_bbox_pct: Optional[dict] = None  # {x1, y1, x2, y2} normalised 0..1
    wall_bbox_pct: Optional[dict] = None  # {x1, y1, x2, y2} normalised 0..1
    notes: Optional[str] = None


class RenderRequest(BaseModel):
    image_base64: str = Field(max_length=MAX_IMAGE_B64_CHARS)
    curtain_type: str = Field(max_length=40)
    curtain_name: str = Field(max_length=60)
    curtain_color: str = Field(max_length=40)
    window_width_cm: Optional[float] = None
    window_height_cm: Optional[float] = None
    texture_image_base64: Optional[str] = Field(default=None, max_length=MAX_IMAGE_B64_CHARS)
    layer_over_existing: Optional[bool] = False
    window_bbox_pct: Optional[BBoxPct] = None


class RenderResponse(BaseModel):
    rendered_image_base64: str


class Curtain(BaseModel):
    id: str
    type: str
    name: str
    color: str
    thumbnail_url: str
    description: str
    render_style: Optional[str] = None  # overrides the type-level style text in the render prompt


class ProjectCreate(BaseModel):
    name: str
    original_image_base64: str
    rendered_image_base64: str
    curtain_id: str
    curtain_name: str
    curtain_type: str
    curtain_color: str
    window_width_cm: float
    window_height_cm: float
    wall_width_cm: Optional[float] = None
    wall_height_cm: Optional[float] = None
    layers: List[str] = []


class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    original_image_base64: str
    rendered_image_base64: str
    curtain_id: str
    curtain_name: str
    curtain_type: str
    curtain_color: str
    window_width_cm: float
    window_height_cm: float
    wall_width_cm: Optional[float] = None
    wall_height_cm: Optional[float] = None
    layers: List[str] = []
    quote_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class QuoteCreate(BaseModel):
    project_id: str
    customer_name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=7, max_length=24)
    email: Optional[str] = Field(default=None, max_length=120)
    city: str = Field(min_length=2, max_length=60)
    address: Optional[str] = Field(default=None, max_length=300)
    notes: Optional[str] = Field(default=None, max_length=500)
    quantity: int = Field(default=1, ge=1, le=50)
    installation: bool = False


class Quote(QuoteCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reference: str = ""
    project_name: str = ""
    curtain_name: str = ""
    curtain_type: str = ""
    curtain_color: str = ""
    layers: List[str] = []
    window_width_cm: float = 0
    window_height_cm: float = 0
    wall_width_cm: Optional[float] = None
    wall_height_cm: Optional[float] = None
    status: str = "pending"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# -----------------------------
# Preset curtain catalog
# -----------------------------
_TUL = "https://images.unsplash.com/photo-1615799998603-7c6270a45196?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwxfHxzaGVlciUyMHdoaXRlJTIwY3VydGFpbiUyMHRleHR1cmV8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85"
_FON = "https://images.unsplash.com/photo-1675784332655-675d1a1ddcf6?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3JleSUyMGJsYWNrb3V0JTIwY3VydGFpbiUyMGZhYnJpYyUyMHRleHR1cmV8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85"
_STOR = "https://images.unsplash.com/photo-1643313262988-cdc5f50c6019?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODF8MHwxfHNlYXJjaHwxfHxyb2xsZXIlMjBibGluZCUyMGZhYnJpYyUyMHRleHR1cmV8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85"
_PLISE = "https://images.unsplash.com/photo-1762012591530-8a5774095ebe?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTN8MHwxfHNlYXJjaHwxfHxwbGVhdGVkJTIwd2luZG93JTIwYmxpbmR8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85"
_LUX = "https://images.unsplash.com/photo-1754611362309-71297e9f42fd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzOTB8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBsaXZpbmclMjByb29tJTIwd2luZG93JTIwY3VydGFpbnN8ZW58MHx8fHwxNzg2NTQ5MDc3fDA&ixlib=rb-4.1.0&q=85"
_ST = "/api/static/"  # relative; frontend prefixes with its backend base URL

CURTAIN_CATALOG: List[Curtain] = [
    Curtain(id="fon-keten-dokulu", type="Fon Perde", name="Keten Dokulu", color="Bej", thumbnail_url=_FON, description="Dogal keten dokulu, sicak bej tonlarinda fon perde"),
    Curtain(id="fon-sefit-krem", type="Fon Perde", name="Sefit Krem", color="Krem", thumbnail_url=_LUX, description="Yumusak, akici krem renkli fon perde"),
    Curtain(id="fon-antrasit", type="Fon Perde", name="Antrasit", color="Antrasit Gri", thumbnail_url=_FON, description="Modern, koyu antrasit tonlarinda karartma fon perde"),
    Curtain(id="fon-lacivert", type="Fon Perde", name="Lacivert Kadife", color="Lacivert", thumbnail_url=_FON, description="Zengin lacivert kadife fon perde"),
    Curtain(
        id="fon-brocal-yan", type="Fon Perde", name="Yandan Brocalli Blackout", color="Hardal",
        thumbnail_url=_ST + "brocal-yan.jpg",
        description="Yandan brocalli blackout fon perde; sag ve sol iki panel, her biri duvar brosu (holdback) ile kendi tarafina toplanmis",
        render_style=(
            "kalin, mat, halkali (grommet) askili blackout fon perde; MUTLAKA IKI PARCA: pencerenin SOL ve SAG "
            "kosesinde birer panel, her panel bel hizasinda duvara monte METAL BIR BROS/HOLDBACK ile kendi tarafina "
            "(disa dogru) cekilerek toplanmis, ortadan bele dogru hafif kavis yapar; pencerenin ortasi acik kalir; "
            "ALT KENAR YERDEN 2 CM YUKARIDA bitecek, zemine temas etmeyecek"
        ),
    ),
    Curtain(
        id="fon-brocal-tavan", type="Fon Perde", name="Tavandan Brocalli Blackout", color="Siyah",
        thumbnail_url=_ST + "brocal-tavan.jpg",
        description="Tavandan brocalli (tavan kosesinden sarkan puskullu ipli tieback ile capraz toplanan) iki parca blackout",
        render_style=(
            "kalin, parlak-mat saten dokulu blackout fon perde; IKI PARCA: sol ve sag panel, her biri tavan "
            "kosesinden inen uzun GUMUS RENKLI IPLI PUSKULLU BROCAL (tieback) ile capraz olarak disa dogru "
            "cekilip toplanmis, puskuller bel hizasinda sarkiyor; iki panel arasinda ortada mevcut tul/pencere "
            "gorunur; ALT KENAR YERDEN 2 CM YUKARIDA bitecek, zemine temas etmeyecek"
        ),
    ),
    Curtain(
        id="rustik-keten-hardal", type="Rustik", name="Rustik Keten", color="Hardal",
        thumbnail_url=_ST + "rustik-keten.jpg",
        description="Dogal ham keten dokulu, halkali askili rustik fon perde",
    ),
    Curtain(
        id="rustik-keten-bej", type="Rustik", name="Rustik Bej Keten", color="Bej",
        thumbnail_url=_LUX,
        description="Acik bej, kaba dokulu ham keten rustik fon perde",
    ),
    Curtain(
        id="rustik-brocal-yan", type="Rustik", name="Yandan Brocalli Rustik", color="Hardal",
        thumbnail_url=_ST + "brocal-yan.jpg",
        description="Yandan brocalli rustik keten fon perde; sag ve sol iki panel, her biri duvar brosu ile kendi tarafina toplanmis",
        render_style=(
            "dogal ham keten dokulu, halkali (grommet) askili rustik fon perde; MUTLAKA IKI PARCA: pencerenin SOL ve "
            "SAG kosesinde birer panel, her panel bel hizasinda duvara monte METAL BIR BROS/HOLDBACK ile kendi tarafina "
            "(disa dogru) cekilerek toplanmis, ortadan bele dogru hafif kavis yapar; pencerenin ortasi acik kalir; "
            "ALT KENAR YERDEN 2 CM YUKARIDA bitecek, zemine temas etmeyecek"
        ),
    ),
    Curtain(
        id="rustik-brocal-tavan", type="Rustik", name="Tavandan Brocalli Rustik", color="Bej",
        thumbnail_url=_ST + "brocal-tavan.jpg",
        description="Tavandan brocalli rustik keten fon perde; sag ve sol iki panel, tavan kosesinden sarkan puskullu ipli tieback ile capraz toplanmis",
        render_style=(
            "dogal ham keten dokulu, halkali (grommet) askili rustik fon perde; MUTLAKA IKI PARCA: pencerenin SOL ve "
            "SAG kosesinde birer panel, her biri tavan kosesinden inen uzun IPLI PUSKULLU BROCAL (tieback) ile capraz "
            "olarak disa dogru cekilip toplanmis, puskuller bel hizasinda sarkiyor; pencerenin ortasi acik kalir; "
            "ALT KENAR YERDEN 2 CM YUKARIDA bitecek, zemine temas etmeyecek"
        ),
    ),
    Curtain(
        id="jaluzi-ceviz", type="Ahsap Jaluzi", name="Ceviz Ahsap Jaluzi", color="Ceviz",
        thumbnail_url=_ST + "ahsap-jaluzi.jpg",
        description="Koyu ceviz renkli, 50 mm yatay lamelli ahsap jaluzi",
    ),
    Curtain(
        id="jaluzi-mese", type="Ahsap Jaluzi", name="Acik Mese Jaluzi", color="Acik Mese",
        thumbnail_url=_ST + "ahsap-jaluzi.jpg",
        description="Acik mese renkli, 50 mm yatay lamelli ahsap jaluzi",
    ),
    Curtain(
        id="jaluzi-beyaz", type="Ahsap Jaluzi", name="Beyaz Ahsap Jaluzi", color="Beyaz",
        thumbnail_url=_ST + "ahsap-jaluzi.jpg",
        description="Beyaz boyali, 50 mm yatay lamelli ahsap jaluzi",
    ),
    Curtain(id="tul-inci", type="Tul Perde", name="Inci Tul", color="Beyaz", thumbnail_url=_TUL, description="Ince, isik geciren beyaz inci tul"),
    Curtain(id="tul-bej-keten", type="Tul Perde", name="Bej Keten Tul", color="Bej", thumbnail_url=_TUL, description="Keten gorunumlu, bej tonlu tul perde"),
    Curtain(id="stor-gri", type="Stor", name="Gri Stor", color="Gri", thumbnail_url=_STOR, description="Sade, duz gri stor perde"),
    Curtain(id="stor-beyaz", type="Stor", name="Beyaz Stor", color="Beyaz", thumbnail_url=_STOR, description="Modern, sade beyaz stor perde"),
    Curtain(id="plise-gri", type="Plise", name="Gri Pileli", color="Acik Gri", thumbnail_url=_PLISE, description="Zarif, gri pileli plise perde"),
    Curtain(id="plise-beyaz", type="Plise", name="Beyaz Plise", color="Beyaz", thumbnail_url=_PLISE, description="Modern beyaz plise perde"),
    Curtain(id="zebra-siyah-beyaz", type="Zebra", name="Klasik Zebra", color="Siyah-Beyaz", thumbnail_url=_STOR, description="Seritli, klasik siyah-beyaz zebra perde"),
    Curtain(id="zebra-bej", type="Zebra", name="Bej Zebra", color="Bej", thumbnail_url=_STOR, description="Sicak bej tonlarinda zebra perde"),
    Curtain(id="gunes-rustik-krem", type="Gunesilik", name="Rustik Guneslik", color="Krem", thumbnail_url=_FON, description="Dogal rustik dokulu krem gunes perdesi"),
    Curtain(id="gunes-rustik-kahve", type="Gunesilik", name="Rustik Kahve Guneslik", color="Kahve", thumbnail_url=_FON, description="Rustik, kahve tonlarinda yogun ipli gunes perdesi"),
    Curtain(id="gunes-keten-bej", type="Gunesilik", name="Keten Guneslik", color="Bej", thumbnail_url=_LUX, description="Keten dokulu, hafif bej gunes perdesi"),
    Curtain(id="gunes-bambu", type="Gunesilik", name="Bambu Guneslik", color="Dogal", thumbnail_url=_PLISE, description="Dogal bambu ipli, pencere ici gunes perdesi"),
]


def _strip_data_url(b64: str) -> str:
    if b64.startswith("data:"):
        _, _, tail = b64.partition(",")
        return tail
    return b64


@api_router.get("/")
async def root():
    return {"message": "PerdeFIT API", "status": "ok"}


@api_router.get("/curtains", response_model=List[Curtain])
async def list_curtains():
    return CURTAIN_CATALOG


def _clamp01(v) -> float:
    return max(0.0, min(1.0, float(v)))


def _valid_bbox(b: dict) -> Optional[dict]:
    return b if b["x2"] > b["x1"] and b["y2"] > b["y1"] else None


def _box2d_to_pct(box) -> Optional[dict]:
    """Gemini native box_2d [ymin, xmin, ymax, xmax] on a 0-1000 scale -> {x1,y1,x2,y2} in 0..1."""
    if not isinstance(box, (list, tuple)) or len(box) != 4:
        return None
    try:
        ymin, xmin, ymax, xmax = (float(v) for v in box)
    except (TypeError, ValueError):
        return None
    scale = 1000.0 if max(ymin, xmin, ymax, xmax) > 1.0 else 1.0
    return _valid_bbox(
        {
            "x1": _clamp01(xmin / scale),
            "y1": _clamp01(ymin / scale),
            "x2": _clamp01(xmax / scale),
            "y2": _clamp01(ymax / scale),
        }
    )


def _require_llm():
    if not LLM_AVAILABLE or not EMERGENT_LLM_KEY:
        raise HTTPException(
            status_code=503,
            detail="Yapay zeka servisi yapılandırılmamış (EMERGENT_LLM_KEY); ölçüleri elle gir",
        )


DETECT_MODEL = "gemini-3-flash-preview"

DETECT_PROMPT = (
    "Detect the main window of this room (if a balcony/terrace door is directly adjacent to the window, "
    "treat window + door as ONE object) and the wall surface that contains it. "
    "The \"window\" box must be tight on the outer edge of the window frame/joinery (glass + frame only; "
    "no surrounding wall, no radiator, no curtains). "
    "The \"wall\" box is the full visible plane of that wall: top edge on the ceiling-wall line, bottom edge on "
    "the floor-wall line (baseboard included), left/right edges at the corners with adjacent walls or the image "
    "border; exclude ceiling and floor. "
    "Output a JSON list where each entry contains the 2D bounding box in \"box_2d\" as [ymin, xmin, ymax, xmax] "
    "(0-1000 scale) and a text label in \"label\" (\"window\" or \"wall\"). If there is no window, return an empty list."
)


def _json_block(text: str, opener: str, closer: str):
    cleaned = re.sub(r"^```(?:json)?", "", text.strip()).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    m = re.search(re.escape(opener) + r".*" + re.escape(closer), cleaned, re.DOTALL)
    return json.loads(m.group(0)) if m else None


async def _detect_boxes(image_b64: str) -> dict:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"detect-{uuid.uuid4()}",
        system_message="You are a precise visual detection assistant. Output JSON only.",
    ).with_model("gemini", DETECT_MODEL)
    text = await chat.send_message(UserMessage(text=DETECT_PROMPT, file_contents=[ImageContent(image_b64)]))
    items = _json_block(text, "[", "]") or []
    out: dict = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        label = str(it.get("label", "")).lower()
        box = _box2d_to_pct(it.get("box_2d"))
        if box and "window" in label and "window" not in out:
            out["window"] = box
        elif box and "wall" in label and "wall" not in out:
            out["wall"] = box
    return out


async def _estimate_cm(image_b64: str, ref_text: str) -> dict:
    prompt = (
        "Estimate real-world sizes in this room photo in centimeters: the main window (including an adjacent "
        "balcony door if present, outer frame edges) and the wall that contains it (wall_height_cm = ceiling-to-floor "
        "distance, wall_width_cm = visible wall width). Use typical Turkish homes as prior (window width 80-300, "
        "height 100-260, wall width 200-500, ceiling height 240-320). "
        "Return ONLY valid JSON: {\"detected\": bool, \"window_width_cm\": number, \"window_height_cm\": number, "
        "\"wall_width_cm\": number, \"wall_height_cm\": number, \"notes\": string (short, in Turkish)}" + ref_text
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"measure-{uuid.uuid4()}",
        system_message="You are an interior measurement assistant. Output JSON only.",
    ).with_model("gemini", DETECT_MODEL)
    text = await chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(image_b64)]))
    return _json_block(text, "{", "}") or {}


@api_router.post("/analyze-measurements", response_model=MeasurementResponse)
async def analyze_measurements(payload: MeasurementRequest):
    _require_llm()
    try:
        image_b64 = _strip_data_url(payload.image_base64)

        ref_text = ""
        if payload.reference_width_cm and payload.reference_width_cm > 0:
            ref_text = f"\nThe user says the window width is {payload.reference_width_cm} cm; use it as reference."

        boxes, data = await asyncio.gather(_detect_boxes(image_b64), _estimate_cm(image_b64, ref_text))
        window_bbox = boxes.get("window")
        detected = bool(window_bbox) and bool(data.get("detected", True))
        return MeasurementResponse(
            detected=detected,
            window_width_cm=float(data.get("window_width_cm") or 140.0),
            window_height_cm=float(data.get("window_height_cm") or 160.0),
            wall_width_cm=float(data.get("wall_width_cm") or 340.0),
            wall_height_cm=float(data.get("wall_height_cm") or 260.0),
            window_bbox_pct=window_bbox,
            wall_bbox_pct=boxes.get("wall"),
            notes=data.get("notes") or ("Olculer otomatik tespit edildi" if detected else "Pencere bulunamadi"),
        )
    except Exception as e:
        logger.exception("analyze_measurements failed")
        err = str(e).lower()
        if "budget" in err or "429" in err:
            note = "Yapay zeka bakiyesi doldu; olculeri elle gir."
        else:
            note = "Otomatik analiz yapilamadi; olculeri elle gir."
        return MeasurementResponse(
            detected=False,
            window_width_cm=140.0,
            window_height_cm=160.0,
            wall_width_cm=340.0,
            wall_height_cm=260.0,
            notes=note,
        )


@api_router.post("/render-curtain", response_model=RenderResponse)
async def render_curtain(payload: RenderRequest):
    _require_llm()
    try:
        image_b64 = _strip_data_url(payload.image_base64)

        size_hint = ""
        if payload.window_width_cm and payload.window_height_cm:
            size_hint = (
                f" Pencere olcusu yaklasik {int(payload.window_width_cm)}cm genislik x "
                f"{int(payload.window_height_cm)}cm yukseklik; perdenin kumas dokumu bu orana uygun olsun."
            )

        style_map = {
            "Fon Perde": "kalin, uzun, yerden tavana kadar dokumlu, yumusak pili olan modern fon perde (blackout); MUTLAKA IKI PARCA: pencerenin SOL ve SAG tarafinda simetrik iki ayri panel, ortada tul/pencere gorunur kalacak sekilde aralanmis; ALT KENAR YERDEN 2 CM YUKARIDA bitecek sekilde, zemine KESINLIKLE temas etmemeli",
            "Tul Perde": "ince, hafif, transparan, isigi suzen zarif tul perde (sheer); MUTLAKA TEK PARCA: pencerenin tum genisligini ortada bolunme/ayrim OLMADAN tek bir kesintisiz panel olarak kaplasin, iki parcaya BOLME; ALT KENAR YERDEN 2 CM YUKARIDA bitecek sekilde, tulun alt ucu zemine KESINLIKLE temas etmemeli; uzun ve akici dokum",
            "Tül Perde": "ince, hafif, transparan, isigi suzen zarif tul perde (sheer); MUTLAKA TEK PARCA: pencerenin tum genisligini ortada bolunme/ayrim OLMADAN tek bir kesintisiz panel olarak kaplasin, iki parcaya BOLME; ALT KENAR YERDEN 2 CM YUKARIDA bitecek sekilde, tulun alt ucu zemine KESINLIKLE temas etmemeli; uzun ve akici dokum",
            "Stor": "pencereye tam oturan, duz, yukaridan asagi inen modern stor perde (roller blind)",
            "Plise": "ince pileli plise perde (pleated blind); ALT KENAR YERDEN 2 CM YUKARIDA bitecek sekilde, zemine KESINLIKLE temas etmemeli",
            "Zebra": "yatay seritli, acik-kapali kombinasyonu olan zebra perde",
            "Gunesilik": "pencereye TAM OTURAN, pencere ici gunes perdesi/guneslik (sun shade); dogal, rustik ya da ketendokulu kumas",
            "Güneşlik": "pencereye TAM OTURAN, pencere ici gunes perdesi/guneslik (sun shade); dogal, rustik ya da ketendokulu kumas",
            "Rustik": "dogal ham keten/pamuk dokulu, kalin, mat, hafif kaba dokulu rustik fon perde; halkali (grommet) aski ile kornise asili, yumusak dikey dokumlu; ALT KENAR YERDEN 2 CM YUKARIDA bitecek sekilde, zemine KESINLIKLE temas etmemeli",
            "Ahsap Jaluzi": "pencere kasasinin ICINE TAM OTURAN, yatay 50 mm ahsap lamelli ahsap jaluzi (wooden venetian blind); lameller hafif acik ve isigi suzuyor, ust kutu (headrail) pencere ustunde; duvara TASMAZ, pencere disina cikmaz",
        }
        style = style_map.get(payload.curtain_type, payload.curtain_type)
        is_behind_layer = payload.curtain_type in ("Gunesilik", "Güneşlik", "Guneslik", "Ahsap Jaluzi")
        catalog_item = next((c for c in CURTAIN_CATALOG if c.name == payload.curtain_name), None)
        if catalog_item and catalog_item.render_style:
            style = catalog_item.render_style
        desc_hint = f" Kumas/desen aciklamasi: {catalog_item.description}." if catalog_item else ""

        location_hint = ""
        wb = payload.window_bbox_pct
        if wb and wb.x2 > wb.x1 and wb.y2 > wb.y1:
            location_hint = (
                f" PENCERENIN KONUMU (gorsel genisligi/yuksekligi yuzdesi): sol kenar %{round(wb.x1 * 100)}, "
                f"sag kenar %{round(wb.x2 * 100)}, ust kenar %{round(wb.y1 * 100)}, alt kenar %{round(wb.y2 * 100)}. "
                f"Perde paneli/panelleri TAM BU BOLGEYE, pencere kasasinin hemen ustundeki kornisten sarkacak sekilde yerlestir; "
                f"sol panel pencerenin sol kenarini, sag panel pencerenin sag kenarini ortecek sekilde dursun. "
                f"Perdeyi bu bolgenin disinda, baska bir duvara veya bos alana KOYMA."
            )

        prompt = (
            f"Bu oda fotografini duzenle. YALNIZCA pencere/pencereler bolgesine "
            f"'{payload.curtain_name}' isimli, {payload.curtain_color} renkli {style} yerlestir.{desc_hint}{location_hint} "
            f"COK ONEMLI: Odadaki mobilyalara, duvarlara, yere, tavana, aksesuarlara, isiklandirmaya ve "
            f"kompozisyona KESINLIKLE dokunma. Ayni perspektif ve ayni kamera acisi korunmali. "
            f"Sadece pencere onundeki perde eklensin/degistirilsin. Fotogercekci, dogal kumas dokumu ve golgeler.{size_hint}"
        )

        if payload.layer_over_existing:
            if is_behind_layer:
                prompt += (
                    " DIKKAT: Fotografta pencerede zaten bir perde (ornegin tul) var. "
                    "Yeni eklenen bu elemani (guneslik/jaluzi) mevcut perdenin ARKASINA, pencere kasasina tam oturacak sekilde yerlestir. "
                    "Mevcut tul/perde ON TARAFTA olmaya devam etsin; yeni eleman arkasindan belli belirsiz gorunsun. "
                    "Tul/perdeyi SILME ve KAPATMA; her iki eleman birlikte dogal gorunur kalsin."
                )
            else:
                prompt += (
                    " DIKKAT: Fotografta pencerede zaten mevcut bir eleman (tul perde, ahsap jaluzi veya guneslik) var. "
                    "Yeni eklenen bu perdeyi mevcut elemanin HEMEN ONUNE (birkac cm odaya dogru), AYNI PENCERENIN uzerine, "
                    "pencere kasasinin hemen ustundeki kornise asili olarak yerlestir; paneller pencerenin sol ve sag kenarlarini "
                    "ortsun ve mevcut jaluzi/tul ile ayni duzlemde ust uste binsin. Mevcut tul/jaluzi/guneslik ARKADA, panellerin "
                    "arasindan gorunur kalsin; SILME ve KAPATMA. Perdeyi pencereden uzaga, baska duvara veya bos alana KOYMA."
                )

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"render-{uuid.uuid4()}",
            system_message="Sen yuksek kaliteli ic mekan gorsel duzenleme asistanisin.",
        ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])

        file_contents = [ImageContent(image_b64)]
        if payload.texture_image_base64:
            file_contents.append(ImageContent(_strip_data_url(payload.texture_image_base64)))
            prompt += " Ikinci gorsel perde kumas dokusudur; bu dokuyu pencereye uygulanan perdede referans al."

        msg = UserMessage(text=prompt, file_contents=file_contents)
        _text_resp, images = await chat.send_message_multimodal_response(msg)

        if not images:
            raise HTTPException(status_code=502, detail="Render basarisiz: model gorsel dondurmedi")

        return RenderResponse(rendered_image_base64=images[0]["data"])
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("render_curtain failed")
        err = str(e).lower()
        if "budget" in err or "429" in err:
            raise HTTPException(status_code=503, detail="Yapay zeka bakiyesi doldu; lutfen daha sonra tekrar dene")
        raise HTTPException(status_code=500, detail="Render hatasi; lutfen tekrar dene")


@api_router.post("/projects", response_model=Project)
async def create_project(payload: ProjectCreate):
    project = Project(**payload.dict())
    await db.projects.insert_one(project.dict())
    return project


@api_router.get("/projects", response_model=List[Project])
async def list_projects():
    docs = await db.projects.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Project(**d) for d in docs]


@api_router.get("/projects/{project_id}", response_model=Project)
async def get_project(project_id: str):
    doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proje bulunamadi")
    return Project(**doc)


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Proje bulunamadi")
    return {"success": True}


# -----------------------------
# Quote (fiyat teklifi) requests
# -----------------------------
@api_router.post("/quotes", response_model=Quote)
async def create_quote(payload: QuoteCreate):
    doc = await db.projects.find_one({"id": payload.project_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Proje bulunamadi")
    project = Project(**doc)
    count = await db.quotes.count_documents({})
    quote = Quote(
        **payload.dict(),
        reference=f"PF-{datetime.now(timezone.utc).strftime('%y%m%d')}-{count + 1:04d}",
        project_name=project.name,
        curtain_name=project.curtain_name,
        curtain_type=project.curtain_type,
        curtain_color=project.curtain_color,
        layers=project.layers or [project.curtain_name],
        window_width_cm=project.window_width_cm,
        window_height_cm=project.window_height_cm,
        wall_width_cm=project.wall_width_cm,
        wall_height_cm=project.wall_height_cm,
    )
    await db.quotes.insert_one(quote.dict())
    await db.projects.update_one({"id": project.id}, {"$set": {"quote_id": quote.id}})
    return quote


@api_router.get("/quotes", response_model=List[Quote])
async def list_quotes():
    docs = await db.quotes.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return [Quote(**d) for d in docs]


@api_router.get("/quotes/{quote_id}", response_model=Quote)
async def get_quote(quote_id: str):
    doc = await db.quotes.find_one({"id": quote_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Teklif bulunamadi")
    return Quote(**doc)



app.include_router(api_router)
app.mount("/api/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    if client is not None:
        client.close()
