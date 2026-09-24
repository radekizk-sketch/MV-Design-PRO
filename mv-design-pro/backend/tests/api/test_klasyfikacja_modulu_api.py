"""`GET /api/ncrfg-tests/modul?p_max_kw=&napiecie_kv=` — klasyfikacja modułu wyłącznie z
backendu, w kW (karta AB-1a Pakiet C pkt 11, plan AB O-34).

Intencja zachowana ze skasowanego `tests/compliance/test_nc_rfg_modul.py`: jedno źródło progów
i predykaty parami — odpowiedź API, klasyfikacja solvera PTPiREE (wynik modułu) i walidacja
generatora czytają TĘ SAMĄ funkcję ``klasyfikacja_modulu`` (progi warstwy WOS; parytet
wartości progów z decyzją WOS przypina `tests/catalog`). Iloczyn cech: każdy próg (istotności,
B, C, D mocy, D napięcia) × strona granicy (próg − ε, próg, próg + ε) × napięcie (nN, SN,
≥ progu D) + dziedzina wejścia (NaN, ∞, ujemne, brak parametru, dawny parametr MW).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from catalog.profiles.nc_rfg import klasyfikacja_modulu
from fastapi.testclient import TestClient
from network_model.solvers.ncrfg_ptpiree import NcRfgPtpireeRunRequest, NcRfgPtpireeSolver

from tests import ncrfg_fabryki as f

_EPS = 0.001


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'klasyfikacja.db'}")
    from api.main import app

    with TestClient(app) as test_client:
        yield test_client


def _progi() -> list[float]:
    wzor = klasyfikacja_modulu(1.0, 15.0)
    return [wzor.prog_min_kw, *wzor.progi_kw.values()]


def _modul(client: TestClient, p_max_kw: object, napiecie_kv: object):
    return client.get(
        "/api/ncrfg-tests/modul", params={"p_max_kw": p_max_kw, "napiecie_kv": napiecie_kv}
    )


@pytest.mark.parametrize("napiecie_kv", [0.4, 15.0])
@pytest.mark.parametrize("przesuniecie", [-_EPS, 0.0, _EPS], ids=["-eps", "=prog", "+eps"])
def test_progi_mocy_api_rowne_klasyfikacji_backendu(
    client: TestClient, przesuniecie: float, napiecie_kv: float
) -> None:
    for prog in _progi():
        moc = prog + przesuniecie
        odpowiedz = _modul(client, moc, napiecie_kv)
        assert odpowiedz.status_code == 200, odpowiedz.text
        assert odpowiedz.json() == klasyfikacja_modulu(moc, napiecie_kv).model_dump(mode="json")


def test_ksztalt_odpowiedzi_z_progami_podstawa_i_powodem(client: TestClient) -> None:
    """Sonda (9): odpowiedź niesie typ, progi, próg napięciowy, podstawę WOS ze stanem
    ``NIEUSTALONE`` i powód klasyfikacji."""
    cialo = _modul(client, 2000, 15).json()
    assert set(cialo) == {
        "modul",
        "prog_min_kw",
        "progi_kw",
        "napiecie_d_kv",
        "podstawa",
        "powod_pl",
    }
    assert cialo["modul"] == "B"
    assert cialo["podstawa"]["rodzaj"] == "WOS"
    assert cialo["podstawa"]["status"] == "NIEUSTALONE"
    assert "→ typ B" in cialo["powod_pl"]


def test_ponizej_progu_istotnosci_typ_none_z_powodem(client: TestClient) -> None:
    prog = klasyfikacja_modulu(1.0, 0.4).prog_min_kw
    cialo = _modul(client, prog - _EPS, 0.4).json()
    assert cialo["modul"] is None
    assert "poniżej progu istotności" in cialo["powod_pl"]
    assert "art. 5 ust. 2 lit. a" in cialo["powod_pl"]


@pytest.mark.parametrize("moc_kw", [1.0, 2000.0, 20000.0])
def test_napiecie_od_progu_d_daje_typ_d_niezaleznie_od_mocy(
    client: TestClient, moc_kw: float
) -> None:
    prog_u = klasyfikacja_modulu(1.0, 15.0).napiecie_d_kv
    assert _modul(client, moc_kw, prog_u).json()["modul"] == "D"
    assert _modul(client, moc_kw, prog_u + _EPS).json()["modul"] == "D"
    assert _modul(client, moc_kw, prog_u - _EPS).json()["modul"] != "D"


@pytest.mark.parametrize(
    "p_max_kw, napiecie_kv",
    [("nan", 15), (2000, "nan"), ("inf", 15), (2000, "-inf"), (-1, 15), (2000, -0.4)],
)
def test_wartosci_spoza_dziedziny_to_422_nie_500(
    client: TestClient, p_max_kw: object, napiecie_kv: object
) -> None:
    """Sonda (12): NaN/∞/ujemne → 422 z komunikatem klasyfikacji."""
    odpowiedz = _modul(client, p_max_kw, napiecie_kv)
    assert odpowiedz.status_code == 422, odpowiedz.text
    assert "wymagana liczba skończona" in odpowiedz.json()["detail"]


def test_dawny_parametr_w_mw_nie_istnieje(client: TestClient) -> None:
    odpowiedz = client.get("/api/ncrfg-tests/modul", params={"p_max_mw": 1.2, "napiecie_kv": 15})
    assert odpowiedz.status_code == 422


@pytest.mark.parametrize("typ", sorted(f.TYPY_MOCY))
def test_klasyfikacja_api_rowna_klasyfikacji_w_wyniku_solvera(client: TestClient, typ: str) -> None:
    """Predykaty parami: ta sama moc i napięcie → ta sama klasyfikacja w API i w wyniku
    modułu solvera PTPiREE."""
    p_max_kw, napiecie_kv = f.TYPY_MOCY[typ]
    wynik = NcRfgPtpireeSolver().run(
        NcRfgPtpireeRunRequest(modules=[f.modul_typu(typ)]), zrodlo_danych="ZATWIERDZONY_MODEL"
    )
    assert _modul(client, p_max_kw, napiecie_kv).json() == (
        wynik.modules[0].klasyfikacja.model_dump(mode="json")
    )
