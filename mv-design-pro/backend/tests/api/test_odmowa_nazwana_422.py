"""Odmowa nazwana: kod maszynowy w polu odpowiedzi 422, nie w zdaniu (karty W10-2a, OD-17a).

Iloczyn: {odmowa bez kodu, odmowa nazwana z danymi, odmowa braku cennika} × {treść odpowiedzi}.
Odmowa bez kodu nie dostaje pól `kod`/`dane` (kontrakt addytywny — dawne ciało bez zmian).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.exception_handlers import register_exception_handlers
from application.koszty.wycena import OdmowaBrakuCennika, PozycjaDoWyceny, braki_cennika
from fastapi import FastAPI
from fastapi.testclient import TestClient
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana


def _odpowiedz(wyjatek: Exception) -> Any:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/sonda")
    def _sonda() -> None:
        raise wyjatek

    return TestClient(app, raise_server_exceptions=False).get("/sonda")


def test_odmowa_bez_kodu_bez_pol_kod_i_dane() -> None:
    cialo = _odpowiedz(OdmowaDanychError("Zdanie dla projektanta.")).json()
    assert cialo["detail"] == "Zdanie dla projektanta."
    assert "kod" not in cialo and "dane" not in cialo


def test_odmowa_nazwana_niesie_kod_i_dane_w_polach() -> None:
    odpowiedz = _odpowiedz(
        OdmowaNazwana("Brak danych elementu.", kod="PROBA:x", dane={"lista": ("a", "b")})
    )
    assert odpowiedz.status_code == 422
    cialo = odpowiedz.json()
    assert cialo["detail"] == "Brak danych elementu."
    assert cialo["kod"] == "PROBA:x"
    assert cialo["dane"] == {"lista": ["a", "b"]}


def test_odmowa_braku_cennika_przez_api() -> None:
    pozycja = PozycjaDoWyceny(
        "Transformator blokowy", "bench_iec60909example_tr110_33", 1.0, "szt."
    )
    odpowiedz = _odpowiedz(OdmowaBrakuCennika(braki_cennika([pozycja], None, "BOM")))
    assert odpowiedz.status_code == 422
    cialo = odpowiedz.json()
    assert cialo["kod"] == "BRAK_CENNIKA"
    assert cialo["dane"]["type_ids"] == ["bench_iec60909example_tr110_33"]
    assert "BRAK_CENNIKA" not in cialo["detail"]
    assert "Transformator blokowy" in cialo["detail"]


@pytest.mark.parametrize("kod", ["", "   "])
def test_odmowa_nazwana_wymaga_kodu(kod: str) -> None:
    with pytest.raises(ValueError):
        OdmowaNazwana("Zdanie.", kod=kod)


def test_kod_w_tresci_zdania_odrzucony() -> None:
    with pytest.raises(ValueError):
        OdmowaNazwana("Odmowa BRAK_CENNIKA dla typu.", kod="BRAK_CENNIKA")


def test_dane_odmowy_niemutowalne() -> None:
    odmowa = OdmowaNazwana("Zdanie.", kod="K", dane={"a": 1})
    with pytest.raises(TypeError):
        odmowa.dane["a"] = 2  # type: ignore[index]
