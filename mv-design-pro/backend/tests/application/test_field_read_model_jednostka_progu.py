"""Karta pola: jednostka progu prądowego nastawy niesie stronę przekładnika (PZ-09).

Karta BIEG-ZABEZPIECZEN-Z-MODELU: nastawa ``threshold_a`` jest zapisywana z jawną stroną
przekładnika (``threshold_unit``). Karta pola pokazywała „A" bez strony — 1,5 A wtórne
i 1,5 A pierwotne wyglądały tak samo. Iloczyn cech: {strona: wtórna, pierwotna,
niezadeklarowana} × {funkcja: I> (51), I>> (50)}; etykiety z jednego źródła
(``enm.nastawy_zabezpieczen``), tego samego co słownik edytora nastaw.
"""

from __future__ import annotations

import pytest
from application.analyses.protection.ocena_nadpradowa import slownik_nastaw
from application.field_read_model import _setting_to_function_state
from enm.models import ProtectionSetting
from enm.nastawy_zabezpieczen import (
    ETYKIETY_JEDNOSTEK_PROGU_PL,
    JEDNOSTKA_PROGU_NIEUSTALONA_PL,
)


@pytest.mark.parametrize("funkcja", ["overcurrent_51", "overcurrent_50"])
@pytest.mark.parametrize(
    ("strona", "oczekiwana"),
    [
        ("A_WTORNY", "A (strona wtórna przekładnika)"),
        ("A_PIERWOTNY", "A (strona pierwotna przekładnika)"),
        (None, JEDNOSTKA_PROGU_NIEUSTALONA_PL),
    ],
)
def test_prog_karty_pola_niesie_strone_przekladnika(
    funkcja: str, strona: str | None, oczekiwana: str
) -> None:
    nastawa = ProtectionSetting(function_type=funkcja, threshold_a=1.5, threshold_unit=strona)
    stan = _setting_to_function_state(nastawa, "wylacznik-1")
    (prog,) = (s for s in stan.settings if s.key == "prog")
    assert prog.value == 1.5
    assert prog.unit == oczekiwana
    assert prog.unit != "A"


def test_slownik_edytora_i_karta_pola_z_jednego_zrodla_etykiet() -> None:
    assert {j["kod"]: j["etykieta_pl"] for j in slownik_nastaw()["jednostki_progu"]} == (
        ETYKIETY_JEDNOSTEK_PROGU_PL
    )
