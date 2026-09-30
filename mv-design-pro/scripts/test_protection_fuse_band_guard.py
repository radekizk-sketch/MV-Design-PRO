"""Samotest guarda `protection_fuse_band_guard` — iniekcja każdej klasy defektu w każdej warstwie.

Iloczyn cech: warstwa {tekst, struktura, zachowanie} × defekt {cichy zastępnik normy
(`CurveCurveStandard`, „IEC_…”, „DT”, rozłamany przez formatowanie), etykieta `FUSE_…`,
bezpiecznik jako aparat wyłączający, punkty krzywej bezpiecznika, próg/mnożnik bezpiecznika,
podstawa inna niż brak pasma, brak powodu, bezpiecznik w sprawdzeniu z liczbą, bezpiecznik
zniknął z wyniku, wyjątek analizy} oraz komentarz opisujący defekt (nie jest defektem) i stan
repozytorium (kod 0).
"""

from __future__ import annotations

import sys
from typing import Any

import protection_fuse_band_guard as guard
import pytest

sys.path.insert(0, str(guard.BACKEND_SRC))


@pytest.mark.parametrize(
    "kod",
    [
        "s = mapa.get(u.standard, CurveCurveStandard.IEC)\n",
        "s = mapa.get(\n    u.standard,\n    CurveCurveStandard.IEC,\n)\n",
        "k = nastawa.get('curve_type', 'IEC_SI')\n",
        'k = nastawa.get("curve_type", "DT")\n',
        "etykieta = f'FUSE_{wariant}'\n",
        "etykieta = 'FUSE_SI'\n",
    ],
)
def test_tekst_lapie_zastepnik_i_etykiete(kod: str) -> None:
    assert guard.sprawdz_tekst({"plik.py": kod})


def test_tekst_pomija_komentarz_i_kod_czysty() -> None:
    kod = (
        "# dawniej: mapa.get(x, CurveCurveStandard.IEC) i etykieta 'FUSE_SI'\n"
        "if FUSE_LICZBA:\n    y = KOD_FUSE_X\n"
    )
    assert guard.sprawdz_tekst({"plik.py": kod}) == []


def test_struktura_lapie_bezpiecznik_jako_aparat_wylaczajacy() -> None:
    from network_model.core.switch import SwitchType

    assert guard.sprawdz_strukture(frozenset({SwitchType.BREAKER}), SwitchType.FUSE) == []
    assert guard.sprawdz_strukture(
        frozenset({SwitchType.BREAKER, SwitchType.FUSE}), SwitchType.FUSE
    )


def _analiza_z_iniekcja(zmien: Any):
    prawdziwa = guard._analizator_domyslny()

    def analizuj(wejscie: Any) -> dict[str, Any]:
        wynik = prawdziwa(wejscie)
        zmien(wynik)
        return wynik

    return analizuj


def _punkty(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["points"] = [{"current_a": 100.0, "current_multiple": 1.5, "time_s": 1.0}]


def _prog(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["pickup_current_a"] = 63.0


def _mnoznik(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["time_multiplier"] = 0.1


def _podstawa(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["podstawa_kod"] = "KRZYWA_PRZEKAZNIKOWA"


def _etykieta(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["curve_type"] = "FUSE_SI"


def _bez_powodu(wynik: dict[str, Any]) -> None:
    for k in wynik["tcc_curves"]:
        k["powod_pl"] = None


def _w_sprawdzeniu(wynik: dict[str, Any]) -> None:
    wynik["sensitivity_checks"] = [
        {"device_id": k["device_id"], "ratio": 2.0} for k in wynik["tcc_curves"]
    ]


def _w_parze(wynik: dict[str, Any]) -> None:
    wynik["selectivity_checks"] = [
        {"upstream_device_id": k["device_id"], "downstream_device_id": "X", "margin_s": 0.3}
        for k in wynik["tcc_curves"]
    ]


def _zniknal(wynik: dict[str, Any]) -> None:
    wynik["tcc_curves"] = []


def _wyjatek(_wynik: dict[str, Any]) -> None:
    raise ValueError("analiza bezpiecznika wywrocona")


@pytest.mark.parametrize(
    "iniekcja",
    [
        _punkty,
        _prog,
        _mnoznik,
        _podstawa,
        _etykieta,
        _bez_powodu,
        _w_sprawdzeniu,
        _w_parze,
        _zniknal,
        _wyjatek,
    ],
)
def test_zachowanie_lapie_kazda_fabrykacje(iniekcja: Any) -> None:
    assert guard.sprawdz_zachowanie(_analiza_z_iniekcja(iniekcja))


def test_zachowanie_prawdziwego_analizatora_czyste() -> None:
    assert guard.sprawdz_zachowanie() == []


def test_repozytorium_czyste() -> None:
    assert guard.main() == 0
