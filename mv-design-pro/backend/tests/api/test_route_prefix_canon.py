"""Kanon prefiksu tras HTTP — test przypinajacy (karta PREFIKSY, dlug V12K-325).

CO TO PRZYPINA
--------------
Adres trasy jest opisany w TRZECH miejscach (montaz routera w backendzie,
literal w kliencie frontu, regula dev-proxy w `vite.config.ts`) i kazde z nich
moze sie rozjechac z pozostalymi, nie psujac zadnego testu jednostkowego.
Dwie takie rozbieznosci zyly w repo miesiacami:

  * router archiwum projektu stal pod `/projects` (poza `/api`), wiec dev-proxy
    go nie przepuszczal — koncowki istnialy, ale byly NIEOSIAGALNE z przegladarki;
  * klient rozplywu wolal `/api/power-flow-runs/...`, a backend serwowal
    `/power-flow-runs/...` — trasa MARTWA, 404 przy kazdym wejsciu w wyniki.

Kanon: KAZDY router HTTP stoi pod `/api`. Jedna granica = jedna regula proxy =
jedno miejsce, ktore moze sie rozjechac (zamiast dwoch).

Test celowo patrzy na TABLICE TRAS ZLOZONEJ APLIKACJI, a nie na tresc plikow —
liczy sie to, co aplikacja realnie wystawia po zlozeniu wszystkich `include_router`.
Statyczny odpowiednik dla CI (razem z frontem i proxy): `scripts/route_prefix_guard.py`.
"""

from __future__ import annotations

from api.main import app

# Koncowki infrastrukturalne aplikacji i FastAPI — NIE przechodza przez
# `include_router`, wiec kanon prefiksu routera ich nie dotyczy.
INFRASTRUCTURE_PATHS = frozenset(
    {
        "/",
        "/health",
        "/ready",
        "/docs",
        "/docs/oauth2-redirect",
        "/redoc",
        "/openapi.json",
    }
)

# Trasy przeniesione pod `/api` karta PREFIKSY. Lista jest JAWNA i ZAMKNIETA:
# gdyby ktoras z nich wrocila poza `/api` albo zniknela, test padnie z nazwiskiem
# konkretnej trasy, a nie ogolnym „cos sie zmienilo".
MIGRATED_ROUTES = (
    # api/power_flow_runs.py
    ("GET", "/api/projects/{project_id}/power-flow-runs"),
    ("POST", "/api/projects/{project_id}/power-flow-runs"),
    ("POST", "/api/power-flow-runs/{run_id}/execute"),
    ("GET", "/api/power-flow-runs/{run_id}"),
    ("GET", "/api/power-flow-runs/{run_id}/results"),
    ("GET", "/api/power-flow-runs/{run_id}/trace"),
    ("GET", "/api/power-flow-runs/{run_id}/interpretation"),
    ("POST", "/api/power-flow-runs/{run_id}/interpretation"),
    ("GET", "/api/power-flow-runs/{run_id}/export/json"),
    ("GET", "/api/power-flow-runs/{run_id}/export/docx"),
    ("GET", "/api/power-flow-runs/{run_id}/export/pdf"),
    ("GET", "/api/power-flow-runs/{run_id}/export/xlsx"),
    ("GET", "/api/power-flow-runs/{run_id}/export/proof/json"),
    ("GET", "/api/power-flow-runs/{run_id}/export/proof/latex"),
    ("GET", "/api/power-flow-runs/{run_id}/export/proof/pdf"),
    # api/power_flow_comparisons.py
    ("POST", "/api/power-flow-comparisons"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}/results"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}/trace"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}/export/json"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}/export/docx"),
    ("GET", "/api/power-flow-comparisons/{comparison_id}/export/pdf"),
    # api/protection_comparisons.py
    ("POST", "/api/protection-comparisons"),
    ("GET", "/api/protection-comparisons/{comparison_id}"),
    ("GET", "/api/protection-comparisons/{comparison_id}/results"),
    ("GET", "/api/protection-comparisons/{comparison_id}/trace"),
    # api/project_archive.py
    ("POST", "/api/projects/{project_id}/export"),
    ("POST", "/api/projects/import"),
    ("POST", "/api/projects/import/preview"),
    # api/sld.py
    ("GET", "/api/projects/{project_id}/sld/{diagram_id}/overlay"),
)


def _route_keys() -> set[str]:
    keys: set[str] = set()
    for route in app.routes:
        path = getattr(route, "path", None)
        if path is None:
            continue
        for method in getattr(route, "methods", set()) or set():
            keys.add(f"{method} {path}")
    return keys


def test_kazdy_router_http_stoi_pod_api() -> None:
    """Kanon: zadna trasa routera nie stoi poza `/api`."""
    poza_kanonem = sorted(
        path
        for route in app.routes
        if (path := getattr(route, "path", None)) is not None
        and path not in INFRASTRUCTURE_PATHS
        and not path.startswith("/api/")
        and path != "/api"
    )
    assert poza_kanonem == [], (
        "Trasy poza kanonem `/api` — kazda z nich wymaga wlasnej reguly dev-proxy "
        f"i jest kandydatem na koncowke nieosiagalna z przegladarki: {poza_kanonem}"
    )


def test_trasy_przeniesione_sa_pod_kanonicznym_adresem() -> None:
    """Kazda przeniesiona trasa istnieje POD `/api` (a nie tylko „gdzies")."""
    keys = _route_keys()
    brakujace = [
        f"{method} {path}" for method, path in MIGRATED_ROUTES if f"{method} {path}" not in keys
    ]
    assert brakujace == [], f"Trasy zniknely z kanonicznego adresu: {brakujace}"


def test_stare_adresy_bez_api_nie_sa_juz_serwowane() -> None:
    """Stary adres MUSI zniknac — inaczej zostaja dwa zrodla prawdy o prefiksie.

    To druga polowa predykatu z `test_trasy_przeniesione_sa_pod_kanonicznym_adresem`:
    sam fakt, ze trasa istnieje pod `/api`, nie dowodzi, ze przeniesienie bylo
    przeniesieniem, a nie zdublowaniem.
    """
    keys = _route_keys()
    pozostale = [
        f"{method} {path.removeprefix('/api')}"
        for method, path in MIGRATED_ROUTES
        if f"{method} {path.removeprefix('/api')}" in keys
    ]
    assert pozostale == [], f"Stare adresy nadal serwowane: {pozostale}"


# `test_adres_wyniku_w_podsumowaniu_biegu_jest_kanoniczny` (dlug V12K-325, karta
# PREFIKSY) inspektowal `application.analysis_dispatch.service` — jedynego
# konsumenta budujacego adres wyniku bez prefiksu `/api`. Karta CV-3.3-A
# (2026-09-05) skasowala `analysis_dispatch` razem z `api/unified_runs.py`
# (E2-widmo, zero konsumenta produkcyjnego), wiec scenariusz, ktory ten test
# pilnowal, nie ma juz zadnego zrodla — usuniety razem z modulem, nie zamaskowany.
