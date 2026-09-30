"""API-DOCX-501 (decyzja D-11, czesc DOCX): eksport PDF/DOCX bez martwych galezi.

Do 2026-09-30 kod eksportu nosil kod obronny na scenariusz niemozliwy przy
poprawnym wydaniu: `try: from docx ... except ImportError: HTTP 501/503`
(rozplyw, porownanie, wzorce odniesienia, biegi analiz, koordynacja
zabezpieczen), flagi `_DOCX_AVAILABLE` / `_PDF_AVAILABLE` (certyfikat NC RfG,
studium, wniosek OSD, raporty koordynacji) i — najgrozniej — ciche podmiany:
raport audytu 2 i raport luku elektrycznego oddawaly TEKST jako bajty „PDF"/
„DOCX", gdy biblioteki brakowalo. Martwa galaz udaje „funkcje niedostepna"
albo, co gorsza, podsuwa inny format pod ta sama nazwa.

KLASA, NIE INSTANCJA — test przypina trzy rzeczy:

1. `python-docx` i `reportlab` sa zaleznosciami GLOWNYMI (`pyproject.toml`),
   nie dev — bez tego kasacja galezi bylaby klamstwem o srodowisku produkcji.
2. W CALYM `backend/src` zaden `try` importujacy modul zaleznosci glownej nie
   lapie `ImportError` / `ModuleNotFoundError`. Zbior zaleznosci glownych
   czytany jest z `pyproject.toml` (jedno zrodlo prawdy), mapa dystrybucja ->
   modul z `importlib.metadata.packages_distributions()`. Zaleznosci
   opcjonalne (np. `boto3`, `google-cloud-storage` w `cloud_backup.py`) nie
   sa w zaleznosciach glownych, wiec ich leniwe importy z czytelnym bledem
   konfiguracji zostaja poza klasa — z definicji, nie z listy wyjatkow.
3. Kazdy formatter PDF/DOCX objety kasacja oddaje PRAWDZIWY format
   (`%PDF` / ZIP `PK`) — takze te, ktore nie mialy testu magii formatu
   (PDF rozplywu i porownania przez HTTP, PDF audytu 2 i luku elektrycznego).
"""

from __future__ import annotations

import ast
import importlib.metadata
import tomllib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.api.test_docx_determinism_resztka import _FakeComparisonService
from tests.test_canonical_analysis_api import (
    _nowy_przypadek,
    _reset_backend_state,
    _seed_power_flow_enm,
)

BACKEND = Path(__file__).resolve().parents[2]
SRC = BACKEND / "src"
PYPROJECT = BACKEND / "pyproject.toml"

_WYJATKI_BRAKU_MODULU = frozenset({"ImportError", "ModuleNotFoundError"})


def _zaleznosci_glowne() -> set[str]:
    dane = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    deps = dane["tool"]["poetry"]["dependencies"]
    return {nazwa.lower() for nazwa in deps if nazwa.lower() != "python"}


def _moduly_zaleznosci_glownych() -> set[str]:
    glowne = _zaleznosci_glowne()
    moduly: set[str] = set()
    for modul, dystrybucje in importlib.metadata.packages_distributions().items():
        if any(d.lower().replace("_", "-") in glowne for d in dystrybucje):
            moduly.add(modul)
    return moduly


def _importowane_moduly(wezly: list[ast.stmt]) -> set[str]:
    wynik: set[str] = set()
    for wezel in wezly:
        for pod in ast.walk(wezel):
            if isinstance(pod, ast.Import):
                wynik.update(alias.name.split(".")[0] for alias in pod.names)
            elif isinstance(pod, ast.ImportFrom) and pod.module and pod.level == 0:
                wynik.add(pod.module.split(".")[0])
    return wynik


def _lapane_nazwy(handler: ast.ExceptHandler) -> set[str]:
    if handler.type is None:
        return set()
    typy = handler.type.elts if isinstance(handler.type, ast.Tuple) else [handler.type]
    return {t.id for t in typy if isinstance(t, ast.Name)}


def _naruszenia_klasy(moduly_glowne: set[str], korzen: Path) -> list[str]:
    naruszenia: list[tuple[Path, int, list[str]]] = []
    for plik in sorted(korzen.rglob("*.py")):
        drzewo = ast.parse(plik.read_text(encoding="utf-8"), filename=str(plik))
        for wezel in ast.walk(drzewo):
            if not isinstance(wezel, ast.Try):
                continue
            lapie_brak_modulu = any(
                _lapane_nazwy(h) & _WYJATKI_BRAKU_MODULU for h in wezel.handlers
            )
            if not lapie_brak_modulu:
                continue
            twarde = _importowane_moduly(wezel.body) & moduly_glowne
            if twarde:
                naruszenia.append((plik, wezel.lineno, sorted(twarde)))
    return [f"{p.relative_to(korzen)}:{linia} {moduly}" for p, linia, moduly in sorted(naruszenia)]


def test_python_docx_i_reportlab_sa_zaleznosciami_glownymi() -> None:
    dane = tomllib.loads(PYPROJECT.read_text(encoding="utf-8"))
    glowne = dane["tool"]["poetry"]["dependencies"]
    dev = dane["tool"]["poetry"]["group"]["dev"]["dependencies"]
    for nazwa in ("python-docx", "reportlab"):
        assert nazwa in glowne, f"{nazwa} musi byc zaleznoscia glowna (eksport na produkcji)"
        assert nazwa not in dev, f"{nazwa} zdublowana w grupie dev"


def test_mapa_zaleznosci_obejmuje_biblioteki_eksportu() -> None:
    """Straznik samego testu klasy: gdyby mapa dystrybucja -> modul nie znalazla
    `docx` / `reportlab`, test ponizej bylby zielony z pustego zbioru."""
    moduly = _moduly_zaleznosci_glownych()
    assert {"docx", "reportlab", "openpyxl", "numpy", "fastapi"} <= moduly


def test_zaden_try_nie_lapie_braku_zaleznosci_glownej_w_src() -> None:
    naruszenia = _naruszenia_klasy(_moduly_zaleznosci_glownych(), SRC)
    assert naruszenia == [], (
        "Martwa galaz `except ImportError` wokol importu zaleznosci glownej "
        "(zaleznosc glowna nie moze brakowac na produkcji — import na poziomie "
        "modulu):\n" + "\n".join(naruszenia)
    )


def test_detektor_klasy_lapie_wstrzyknieta_galaz(tmp_path: Path) -> None:
    """Iniekcja: dokladnie ten ksztalt, ktory skasowano w `power_flow_runs.py`,
    oraz wariant flagowy i krotka wyjatkow — detektor musi je zobaczyć,
    a leniwy import zaleznosci opcjonalnej zostawic."""
    (tmp_path / "wstrzykniety.py").write_text(
        "def eksport():\n"
        "    try:\n"
        "        from docx import Document\n"
        "    except ImportError:\n"
        "        raise RuntimeError('501')\n"
        "try:\n"
        "    from reportlab.pdfgen import canvas\n"
        "    _PDF_AVAILABLE = True\n"
        "except (ModuleNotFoundError, OSError):\n"
        "    _PDF_AVAILABLE = False\n"
        "try:\n"
        "    import boto3\n"
        "except ImportError:\n"
        "    boto3 = None\n",
        encoding="utf-8",
    )
    naruszenia = _naruszenia_klasy({"docx", "reportlab"}, tmp_path)
    assert naruszenia == [
        "wstrzykniety.py:2 ['docx']",
        "wstrzykniety.py:6 ['reportlab']",
    ]


# =============================================================================
# Prawdziwy format na wyjsciu kazdego formattera objetego kasacja
# =============================================================================


@pytest.fixture
def canonical_client() -> TestClient:
    from api.main import app

    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _wykonany_bieg_rozplywu(client: TestClient) -> str:
    case_id = _nowy_przypadek(client)
    _seed_power_flow_enm(client, case_id)
    created = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "LOAD_FLOW", "solver_input": {}},
    )
    assert created.status_code == 201, created.text
    run_id = created.json()["id"]
    executed = client.post(f"/api/execution/runs/{run_id}/execute")
    assert executed.status_code == 200, executed.text
    return str(run_id)


@pytest.mark.parametrize(
    ("format_", "magia"),
    [("pdf", b"%PDF"), ("docx", b"PK")],
)
def test_eksport_biegu_rozplywu_oddaje_prawdziwy_format(
    canonical_client: TestClient, format_: str, magia: bytes
) -> None:
    run_id = _wykonany_bieg_rozplywu(canonical_client)
    odpowiedz = canonical_client.get(f"/api/power-flow-runs/{run_id}/export/{format_}")
    assert odpowiedz.status_code == 200, odpowiedz.text
    assert odpowiedz.content.startswith(magia)


@pytest.mark.parametrize(
    ("format_", "magia"),
    [("pdf", b"%PDF"), ("docx", b"PK")],
)
def test_eksport_porownania_rozplywu_oddaje_prawdziwy_format(
    app_client, monkeypatch, format_: str, magia: bytes
) -> None:
    from api import power_flow_comparisons as power_flow_comparisons_api

    monkeypatch.setattr(
        power_flow_comparisons_api,
        "_build_service",
        lambda uow_factory: _FakeComparisonService(),
    )
    odpowiedz = app_client.get(f"/api/power-flow-comparisons/cmp-format/export/{format_}")
    assert odpowiedz.status_code == 200, odpowiedz.text
    assert odpowiedz.content.startswith(magia)


def test_raporty_audytu_2_i_luku_elektrycznego_nie_podmieniaja_formatu() -> None:
    """Dawna cicha podmiana: bez biblioteki raport oddawal tekst UTF-8 jako
    bajty PDF/DOCX. Teraz kazdy renderer oddaje wlasny format."""
    from analysis.reporting.arc_flash_report import (
        render_arc_flash_report_docx,
        render_arc_flash_report_pdf,
    )
    from analysis.reporting.audit2_report import (
        render_audit2_report_docx,
        render_audit2_report_pdf,
    )

    from tests.analysis.reporting.test_arc_flash_report import _make_ctx as ctx_luku
    from tests.analysis.reporting.test_arc_flash_report import _result
    from tests.analysis.reporting.test_audit2_report import _make_ctx as ctx_audytu

    luk = ctx_luku([_result("szyna-1", 4.2, 950.0, "PPE 1")])
    audyt = ctx_audytu([])
    assert render_arc_flash_report_pdf(luk).startswith(b"%PDF")
    assert render_arc_flash_report_docx(luk).startswith(b"PK")
    assert render_audit2_report_pdf(audyt).startswith(b"%PDF")
    assert render_audit2_report_docx(audyt).startswith(b"PK")
