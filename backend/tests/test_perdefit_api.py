"""End-to-end backend tests for PerdeFIT API (iteration 2)."""
import base64
import io
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "PERDEFIT_BASE_URL",
    "https://perdefit-app.preview.emergentagent.com",
).rstrip("/")


# -------- Fixtures --------
@pytest.fixture(scope="session")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def room_image_b64():
    """Download a public interior room photo and return its base64."""
    urls = [
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=80&fm=jpg",
        "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800&q=80&fm=jpg",
        "https://images.unsplash.com/photo-1754611362309-71297e9f42fd?w=800&q=80&fm=jpg",
    ]
    for u in urls:
        try:
            r = requests.get(u, timeout=20)
            if r.status_code == 200 and len(r.content) > 10000:
                return base64.b64encode(r.content).decode("ascii")
        except Exception:
            continue
    try:
        from PIL import Image
        img = Image.new("RGB", (800, 600), color=(200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        pytest.skip("Could not obtain a test image")


@pytest.fixture(scope="session")
def tiny_png_b64():
    """Create a tiny valid PNG (10x10) as base64, cheap stand-in for images."""
    try:
        from PIL import Image
        img = Image.new("RGB", (10, 10), color=(123, 200, 150))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception:
        # 1x1 red png fallback
        return (
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
            "+M8AAAICAQCA2WkMAAAAAElFTkSuQmCC"
        )


# -------- Root / Health --------
class TestRoot:
    def test_root(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("status") == "ok"


# -------- Curtain catalog --------
class TestCurtains:
    def test_list_curtains(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/curtains", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 24, f"Expected >=24 curtains, got {len(data)}"
        required = {"id", "type", "name", "color", "thumbnail_url", "description"}
        for c in data:
            missing = required - set(c.keys())
            assert not missing, f"Curtain missing fields: {missing} in {c}"

    def test_catalog_types_and_names(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/curtains", timeout=20)
        data = r.json()
        types = {c["type"] for c in data}
        assert "Rustik" in types, f"Rustik missing. Types: {types}"
        assert "Ahsap Jaluzi" in types, f"Ahsap Jaluzi missing. Types: {types}"
        names = {c["name"] for c in data}
        for required in [
            "Yandan Brocalli Blackout",
            "Tavandan Brocalli Blackout",
            "Yandan Brocalli Rustik",
            "Tavandan Brocalli Rustik",
        ]:
            assert required in names, f"Missing curtain name: {required}"

    def test_static_thumbnail_served(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/static/brocal-yan.jpg", timeout=20)
        assert r.status_code == 200, f"Static image failed: {r.status_code}"
        ctype = r.headers.get("content-type", "")
        assert "image" in ctype, f"Unexpected content-type: {ctype}"
        assert len(r.content) > 500

    def test_relative_thumbnail_urls_present(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/curtains", timeout=20)
        data = r.json()
        rel_items = [c for c in data if c["thumbnail_url"].startswith("/api/static/")]
        assert rel_items, "No curtains with relative /api/static/ thumbnails found"
        # Hit each unique rel url once
        checked = set()
        for c in rel_items:
            u = c["thumbnail_url"]
            if u in checked:
                continue
            checked.add(u)
            full = f"{BASE_URL}{u}"
            rr = requests.get(full, timeout=20)
            assert rr.status_code == 200, f"{full} -> {rr.status_code}"


# -------- Measurements (costs credits, run at most once) --------
class TestMeasurements:
    def test_analyze_measurements_bboxes(self, api_client, room_image_b64):
        payload = {"image_base64": room_image_b64, "reference_width_cm": 150}
        r = api_client.post(
            f"{BASE_URL}/api/analyze-measurements", json=payload, timeout=120
        )
        assert r.status_code == 200, f"Status {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "detected" in data and isinstance(data["detected"], bool)
        for f in ["window_width_cm", "window_height_cm", "wall_width_cm", "wall_height_cm"]:
            assert isinstance(data.get(f), (int, float)) and data[f] > 0, (
                f"{f} invalid: {data.get(f)}"
            )
        # If detected, bboxes must be valid 0..1 ranges with x1<x2, y1<y2
        if data["detected"]:
            for key in ("window_bbox_pct", "wall_bbox_pct"):
                b = data.get(key)
                if b is None:
                    continue  # wall may be absent; window should be present
                for k in ("x1", "y1", "x2", "y2"):
                    assert 0.0 <= float(b[k]) <= 1.0, f"{key}.{k} out of range: {b[k]}"
                assert b["x2"] > b["x1"] and b["y2"] > b["y1"], f"{key} invalid: {b}"
            # When detected, window_bbox_pct should exist
            assert data.get("window_bbox_pct"), "detected=true but no window_bbox_pct"


# -------- Render error path (no real render — avoid credits) --------
class TestRenderErrorPath:
    def test_render_curtain_invalid_image_no_leak(self, api_client):
        # Send malformed base64 that will cause the model/provider to error.
        payload = {
            "image_base64": "not-base64-data!!!",
            "curtain_type": "Fon Perde",
            "curtain_name": "Keten Dokulu",
            "curtain_color": "Bej",
        }
        r = api_client.post(f"{BASE_URL}/api/render-curtain", json=payload, timeout=60)
        # Should be a non-200 (500/503/502) but must NOT leak raw exception text
        assert r.status_code in (400, 500, 502, 503), f"Unexpected status: {r.status_code}"
        detail = ""
        try:
            detail = (r.json().get("detail") or "")
        except Exception:
            detail = r.text
        low = detail.lower()
        forbidden = ["traceback", "exception", "typeerror", "valueerror", "<class ", "  file \""]
        for tok in forbidden:
            assert tok not in low, f"Leaked exception text ({tok}): {detail}"


# -------- Projects + Quotes flow --------
class TestProjectsQuotes:
    created_project_id = None
    created_quote_id = None
    created_quote_ref = None

    def test_01_create_project(self, api_client, tiny_png_b64):
        payload = {
            "name": "TEST_Project_Quote",
            "original_image_base64": tiny_png_b64,
            "rendered_image_base64": tiny_png_b64,
            "curtain_id": "fon-keten-dokulu",
            "curtain_name": "Keten Dokulu",
            "curtain_type": "Fon Perde",
            "curtain_color": "Bej",
            "window_width_cm": 150,
            "window_height_cm": 180,
            "wall_width_cm": 320,
            "wall_height_cm": 260,
            "layers": ["Inci Tul", "Keten Dokulu"],
        }
        r = api_client.post(f"{BASE_URL}/api/projects", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] and data["name"] == "TEST_Project_Quote"
        assert data.get("quote_id") in (None, "")
        assert "_id" not in data
        TestProjectsQuotes.created_project_id = data["id"]

    def test_02_create_quote_validation_short_name(self, api_client):
        pid = TestProjectsQuotes.created_project_id
        payload = {
            "project_id": pid,
            "customer_name": "A",  # too short
            "phone": "05551234567",
            "city": "Istanbul",
            "quantity": 1,
            "installation": False,
        }
        r = api_client.post(f"{BASE_URL}/api/quotes", json=payload, timeout=30)
        assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"

    def test_03_create_quote_validation_missing_name(self, api_client):
        pid = TestProjectsQuotes.created_project_id
        payload = {
            "project_id": pid,
            "phone": "05551234567",
            "city": "Istanbul",
        }
        r = api_client.post(f"{BASE_URL}/api/quotes", json=payload, timeout=30)
        assert r.status_code == 422

    def test_04_create_quote_unknown_project_404(self, api_client):
        payload = {
            "project_id": "non-existent-" + os.urandom(4).hex(),
            "customer_name": "Ahmet Yilmaz",
            "phone": "05551234567",
            "city": "Istanbul",
        }
        r = api_client.post(f"{BASE_URL}/api/quotes", json=payload, timeout=30)
        assert r.status_code == 404

    def test_05_create_quote_success(self, api_client):
        pid = TestProjectsQuotes.created_project_id
        payload = {
            "project_id": pid,
            "customer_name": "Ahmet Yilmaz",
            "phone": "05551234567",
            "email": "ahmet@example.com",
            "city": "Istanbul",
            "address": "Kadikoy Mah. 123 sok",
            "notes": "Montaj hafta sonu olsun",
            "quantity": 2,
            "installation": True,
        }
        r = api_client.post(f"{BASE_URL}/api/quotes", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"]
        assert data["reference"].startswith("PF-"), f"ref: {data['reference']}"
        assert data["status"] == "pending"
        assert data["customer_name"] == "Ahmet Yilmaz"
        assert data["quantity"] == 2
        assert data["installation"] is True
        # layers copied from project
        assert data["layers"] == ["Inci Tul", "Keten Dokulu"]
        assert data["window_width_cm"] == 150
        assert "_id" not in data
        TestProjectsQuotes.created_quote_id = data["id"]
        TestProjectsQuotes.created_quote_ref = data["reference"]

    def test_06_get_quote(self, api_client):
        qid = TestProjectsQuotes.created_quote_id
        r = api_client.get(f"{BASE_URL}/api/quotes/{qid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == qid
        assert data["reference"] == TestProjectsQuotes.created_quote_ref
        assert "_id" not in data

    def test_07_project_now_has_quote_id(self, api_client):
        pid = TestProjectsQuotes.created_project_id
        r = api_client.get(f"{BASE_URL}/api/projects/{pid}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["quote_id"] == TestProjectsQuotes.created_quote_id

    def test_08_get_quote_404(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/quotes/does-not-exist-xyz", timeout=30)
        assert r.status_code == 404

    def test_99_cleanup_project(self, api_client):
        pid = TestProjectsQuotes.created_project_id
        if pid:
            api_client.delete(f"{BASE_URL}/api/projects/{pid}", timeout=30)
