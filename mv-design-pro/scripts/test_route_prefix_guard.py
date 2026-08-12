"""Testy guardu kanonu prefiksu tras (karta PREFIKSY, dlug V12K-325; karta
KLIENT-BEZ-RODZINY, 2026-08-12).

Testy sa IZOLOWANE od repozytorium: podmieniaja zrodla, z ktorych guard czyta
(tablice tras, katalog frontu, plik vite), zeby sprawdzac SAMA REGULE, a nie
biezacy stan kodu. Dzieki temu przypadek „front wola trase, ktorej nie ma"
jest przecwiczony nawet wtedy, gdy w repozytorium takiej sytuacji nie ma.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Guard i jego test leza w `scripts/`, ktory nie jest pakietem. Przy uruchomieniu
# RAZEM z suita backendu pytest nie dokladа tego katalogu do `sys.path`, wiec
# import bez tej linii wywracal sie na `ModuleNotFoundError` — test byl zielony
# tylko przy jednym ze sposobow uruchomienia.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import route_prefix_guard as guard  # noqa: E402


def _route(method: str, path: str, source: str = "backend/src/api/x.py:1"):
    return guard.discover_all_routes_with_problems.__globals__["RouteContract"](
        method=method, path=path, source=source
    )


def _stub_backend(monkeypatch, routes, problems=()) -> None:
    monkeypatch.setattr(
        guard, "discover_all_routes_with_problems", lambda: (list(routes), list(problems))
    )


def _stub_frontend(monkeypatch, tmp_path: Path, files: dict[str, str]) -> None:
    src = tmp_path / "frontend" / "src"
    src.mkdir(parents=True)
    for name, content in files.items():
        target = src / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    monkeypatch.setattr(guard, "FRONTEND_SRC", src)
    monkeypatch.setattr(guard, "ROOT", tmp_path)


def _stub_vite(monkeypatch, tmp_path: Path, prefixes: tuple[str, ...] = ("/api",)) -> None:
    body = ",\n".join(f"        '{p}': {{ target: url }}" for p in prefixes)
    config = tmp_path / "vite.config.ts"
    config.write_text(
        "export default {\n  server: {\n    proxy: {\n" + body + "\n    },\n  },\n};\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(guard, "VITE_CONFIG", config)


def _no_debt(monkeypatch) -> None:
    monkeypatch.setattr(guard, "FRONTEND_DEAD_CLIENT_DEBT", {})


# ---------------------------------------------------------------------------
# REGULA 1 — kanon prefiksu po stronie backendu
# ---------------------------------------------------------------------------


def test_router_poza_api_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("POST", "/projects/import")])
    _stub_frontend(monkeypatch, tmp_path, {})
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(guard, "BACKEND_PREFIX_EXCEPTIONS", {})

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-poza-kanonem]" in v for v in violations)


def test_router_poza_api_na_liscie_wyjatkow_przechodzi(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("POST", "/projects/import")])
    _stub_frontend(monkeypatch, tmp_path, {})
    _stub_vite(monkeypatch, tmp_path, ("/api", "/projects"))
    monkeypatch.setattr(
        guard, "BACKEND_PREFIX_EXCEPTIONS", {"/projects/import": "uzasadnienie testowe"}
    )

    violations = guard.check_route_prefixes()

    assert not any("[route-prefix-poza-kanonem]" in v for v in violations)


def test_nierozwiazany_router_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    """Fail-closed: router, ktorego nie da sie odczytac, nie jest cicho pomijany."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [], problems=["brak modulu api/foo.py"])
    _stub_frontend(monkeypatch, tmp_path, {})
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-unresolved-router]" in v for v in violations)


# ---------------------------------------------------------------------------
# REGULA 2 — front wola trase, ktorej backend nie serwuje (MARTWA)
# ---------------------------------------------------------------------------


def test_front_wolajacy_nieistniejaca_trase_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/power-flow-runs/{run_id}")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/pf/api.ts": "const r = await fetch(`/api/power-flow-runs/${id}/wyniki`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v for v in violations)


def test_zly_prefiks_klienta_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    """Wlasnie ten ksztalt zyl w repo: backend `/x`, klient `/api/x`."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/power-flow-runs/{run_id}")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/pf/api.ts": "const r = await fetch(`/api/power-flow-runs/${id}`);"},
    )
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(guard, "BACKEND_PREFIX_EXCEPTIONS", {"/power-flow-runs/{run_id}": "test"})

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v for v in violations)


def test_zgodny_klient_przechodzi(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/power-flow-runs/{run_id}/results")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/pf/api.ts": "const r = await fetch(`/api/power-flow-runs/${id}/results`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


def test_parametr_formatu_w_ostatnim_segmencie_nie_jest_falszywym_alarmem(
    monkeypatch, tmp_path
) -> None:
    """`/export/${format}` wobec `/export/docx` to poprawne wolanie, nie rozjazd."""
    _no_debt(monkeypatch)
    _stub_backend(
        monkeypatch,
        [
            _route("GET", "/api/runs/{run_id}/export/docx"),
            _route("GET", "/api/runs/{run_id}/export/pdf"),
        ],
    )
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/e/api.ts": "const r = await fetch(`/api/runs/${id}/export/${format}`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


def test_literal_frontu_wobec_parametru_trasy_nie_jest_falszywym_alarmem(
    monkeypatch, tmp_path
) -> None:
    """`/v126/ssci_impedance` wobec `/v126/{analysis_type}` to poprawne wolanie."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/cases/{case_id}/runs/v126/{analysis_type}")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/v/api.ts": "const r = await fetch(`/api/cases/${id}/runs/v126/ssci_impedance`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


def test_dwa_luzy_naraz_nie_uznaja_trasy_za_istniejaca(monkeypatch, tmp_path) -> None:
    """Dopasowanie „przejezdzajace" po strukturze trasy MUSI byc odrzucone.

    `/api/study-cases/${caseId}/runs` nie istnieje, ale bez tej reguly zgadzalo
    sie z `/api/study-cases/project/{project_id}`: znacznik brano za slowo
    `project`, a slowo `runs` za parametr.
    """
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/study-cases/project/{project_id}")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/c/api.ts": "const r = await fetch(`/api/study-cases/${caseId}/runs`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v for v in violations)


def test_sciezka_w_komentarzu_nie_liczy_sie_jako_wolanie(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/runs/{run_id}")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {
            "ui/k/api.ts": (
                "// dawny adres: /api/runs/${id}/legacy-nieistniejacy\n"
                "const r = await fetch(`/api/runs/${id}`);"
            )
        },
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


# ---------------------------------------------------------------------------
# REGULA 2b — rodzina, ktorej backend NIE SERWUJE W OGOLE (dawny slepy punkt
# guardu, karta KLIENT-BEZ-RODZINY). Iloczyn cech: {rodzina serwowana /
# nieserwowana} x {klient istnieje / nie} x {sciezka statyczna / szablonowa}.
# ---------------------------------------------------------------------------


def test_rodzina_nieserwowana_klient_istnieje_sciezka_statyczna_jest_naruszeniem(
    monkeypatch, tmp_path
) -> None:
    """Dokladnie ksztalt wyspy `designer/` (commit `d0419a1a`): backend nie ma
    ANI JEDNEJ trasy pod `/snapshots`, front wola ja literalem statycznym.
    Dawniej pierwszy segment `snapshots` byl spoza `backend_first_segments`
    (zbior wyprowadzony z DRUGIEJ strony porownania) i literal wypadal ze skanu
    Z KONSTRUKCJI — zero alarmu. Musi zostac zgloszony PO NAZWIE."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"designer/api.ts": "const r = await fetch('/snapshots/latest');"},
    )
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v and "/snapshots/latest" in v for v in violations)


def test_rodzina_nieserwowana_klient_istnieje_sciezka_szablonowa_jest_naruszeniem(
    monkeypatch, tmp_path
) -> None:
    """Ten sam ksztalt co wyzej, ale sciezka budowana szablonem (`${id}`) —
    znacznik frontu nie moze przypadkiem „uratowac" rodziny, ktorej backend
    nie serwuje ani jednej trasy."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"designer/api.ts": "const r = await fetch(`/snapshots/${id}/latest`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v and "/snapshots/{p}/latest" in v for v in violations)


def test_rodzina_nieserwowana_bez_klienta_nie_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    """Zerowy klient (nikt nie wola rodziny `/snapshots`) NIE MOZE stac sie
    falszywym alarmem — kontrast z dwoma testami powyzej: to WOLANIE KLIENTA
    tworzy naruszenie, nie samo istnienie/nieistnienie rodziny w backendzie."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch, tmp_path, {"ui/inny/api.ts": "const r = await fetch('/api/health');"}
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


def test_rodzina_serwowana_klient_istnieje_sciezka_szablonowa_przechodzi(
    monkeypatch, tmp_path
) -> None:
    """Kontrast z pierwszymi dwoma testami tej sekcji: gdy backend rodzine
    SERWUJE, ten sam ksztalt wolania (szablon) MUSI przejsc bez naruszenia —
    naprawa filtra nie moze zamienic sie w nadmierna czujnosc na kazdy szablon."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/snapshots/{id}/latest")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"ui/ok/api.ts": "const r = await fetch(`/api/snapshots/${id}/latest`);"},
    )
    _stub_vite(monkeypatch, tmp_path)

    assert guard.check_route_prefixes() == []


def test_wyjatek_frontu_zawiesza_naruszenie_takze_dla_rodziny_bez_backendu(
    monkeypatch, tmp_path
) -> None:
    """`FRONTEND_PATH_EXCEPTIONS` musi dzialac takze na rodzine spoza tablicy
    tras backendu — jawny wyjatek (nie domyslne wykluczenie po segmencie) jest
    JEDYNYM dopuszczalnym sposobem wyciszenia takiej sciezki."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {"harness/x.ts": "const r = await fetch('/test-fixtures/foo.json');"},
    )
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(
        guard, "FRONTEND_PATH_EXCEPTIONS", {"/test-fixtures/foo.json": "test: zasob statyczny"}
    )

    assert guard.check_route_prefixes() == []


# ---------------------------------------------------------------------------
# Zapadka: skan frontu bez ANI JEDNEGO wyniku jest naruszeniem (fail-closed),
# nie cichym „wszystko OK" — inaczej zepsuty skan (zle rozszerzenie, zly
# katalog, zly wzorzec HTTP_CALL_HINT) przechodzilby niezauwazony.
# ---------------------------------------------------------------------------


def test_pusty_skan_frontu_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(monkeypatch, tmp_path, {"ui/bez_http/plain.ts": "export const x = 1;"})
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-skan-pusty]" in v for v in violations)


def test_pusty_skan_frontu_nie_zapala_sie_gdy_klient_istnieje(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(monkeypatch, tmp_path, {"ui/ok/api.ts": "const r = await fetch('/api/health');"})
    _stub_vite(monkeypatch, tmp_path)

    violations = guard.check_route_prefixes()

    assert not any("[route-prefix-skan-pusty]" in v for v in violations)


# ---------------------------------------------------------------------------
# REGULA 3 — trasa serwowana, ale dev-proxy jej nie przepuszcza (NIEOSIAGALNA)
# ---------------------------------------------------------------------------


def test_trasa_poza_proxy_jest_nieosiagalna(monkeypatch, tmp_path) -> None:
    """Dokladnie defekt archiwum projektu: koncowka istnieje, proxy jej nie widzi."""
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("POST", "/projects/import")])
    _stub_frontend(
        monkeypatch, tmp_path, {"ui/a/api.ts": "const r = await fetch('/projects/import');"}
    )
    _stub_vite(monkeypatch, tmp_path, ("/api",))
    monkeypatch.setattr(guard, "BACKEND_PREFIX_EXCEPTIONS", {"/projects/import": "test"})

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-nieosiagalna]" in v for v in violations)


# ---------------------------------------------------------------------------
# REGULA 4 — regula proxy bez pokrycia w trasach
# ---------------------------------------------------------------------------


def test_martwa_regula_proxy_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    _no_debt(monkeypatch)
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(monkeypatch, tmp_path, {})
    _stub_vite(monkeypatch, tmp_path, ("/api", "/projects"))

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa-regula-proxy]" in v for v in violations)


# ---------------------------------------------------------------------------
# Rejestr dlugu „klient bez dostawcy"
# ---------------------------------------------------------------------------


def test_zarejestrowany_dlug_nie_wywraca_guardu(monkeypatch, tmp_path) -> None:
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch, tmp_path, {"ui/d/api.ts": "const r = await fetch('/api/nie-ma-takiej');"}
    )
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(
        guard,
        "FRONTEND_DEAD_CLIENT_DEBT",
        {"frontend/src/ui/d/api.ts": (("/api/nie-ma-takiej",), "dlug testowy")},
    )

    assert guard.check_route_prefixes() == []


def test_nowa_martwa_sciezka_w_module_z_dlugiem_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    """Wpis dlugu zwalnia SCIEZKE, nie caly plik.

    Rejestr trzymany na poziomie MODULU robil z kazdego wpisanego pliku slepa
    plamke: dowolna NOWA martwa sciezka dopisana do takiego pliku byla cicho
    wchlaniana. Wykryte iniekcja — guard nie zapalal sie na dopisanym wolaniu
    nieistniejacej koncowki w `ui/comparison/api.ts`. Ten test przypina napraw.
    """
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(
        monkeypatch,
        tmp_path,
        {
            "ui/d/api.ts": (
                "const a = await fetch('/api/znany-dlug');\n"
                "const b = await fetch('/api/nowy-defekt');"
            )
        },
    )
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(
        guard,
        "FRONTEND_DEAD_CLIENT_DEBT",
        {"frontend/src/ui/d/api.ts": (("/api/znany-dlug",), "dlug testowy")},
    )

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-martwa]" in v and "/api/nowy-defekt" in v for v in violations)
    assert not any("/api/znany-dlug" in v for v in violations)


def test_nieaktualny_wpis_dlugu_jest_naruszeniem(monkeypatch, tmp_path) -> None:
    """Rejestr dlugu ma MALEC — wpis bez martwych sciezek to ciche wykluczenie."""
    _stub_backend(monkeypatch, [_route("GET", "/api/health")])
    _stub_frontend(monkeypatch, tmp_path, {"ui/d/api.ts": "const r = await fetch('/api/health');"})
    _stub_vite(monkeypatch, tmp_path)
    monkeypatch.setattr(
        guard,
        "FRONTEND_DEAD_CLIENT_DEBT",
        {"frontend/src/ui/d/api.ts": (("/api/juz-naprawiona",), "dlug testowy")},
    )

    violations = guard.check_route_prefixes()

    assert any("[route-prefix-nieaktualny-dlug]" in v for v in violations)


# ---------------------------------------------------------------------------
# Stan repozytorium
# ---------------------------------------------------------------------------


def test_repozytorium_spelnia_kanon_prefiksu() -> None:
    """Guard na zywym repozytorium — bez podmian."""
    assert guard.check_route_prefixes() == []
