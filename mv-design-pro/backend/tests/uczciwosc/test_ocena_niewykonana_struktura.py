"""Fabryka „ocena niewykonana" buduje PEŁNY rekord kontraktu werdyktu (``werdykt``).

Kontrakt werdyktu wyjaśnialnego: typy z pakietu ``werdykt`` są JEDYNYMI typami rekordu
w produkcie. ``application.ocena_niewykonana`` nie ma własnego typu, etykiety ani tekstu —
składa pola kontraktu i woła regułę K (``ocen_kryterium``) z ``wynik=None`` i dowodem
``BRAK_METODY``: status ``NIE_OCENIONO``, etykieta z jedynego słownika, zdanie z jedynego
generatora, a braki powierzchni idą PO brakach nazwanych przez regułę. Rekord bez
konkretnego braku powierzchni jest błędem konstrukcji.
"""

from __future__ import annotations

import pytest
from application.ocena_niewykonana import ocena_niewykonana, rekord_json
from werdykt import (
    ClaimKind,
    EvidenceTier,
    PodstawaWymagania,
    Przedmiot,
    ZakresWaznosci,
)

from tests.uczciwosc.pomocnicze import sprawdz_ocene_niewykonana

_BRAK_POWIERZCHNI = "bieg dynamiki na silniku kanonicznym zweryfikowany wyrocznią"


def _rekord(czego_brakuje: list[str]) -> dict[str, object]:
    return rekord_json(
        ocena_niewykonana(
            kryterium_id="test.kryterium",
            przedmiot=Przedmiot(
                element_ref="el-1", nazwa_pl="Element 1", opis_pl="Przedmiot testu"
            ),
            opis_kryterium_pl="Kryterium testowe",
            podstawa=PodstawaWymagania(
                rodzaj="NIEUSTALONA",
                dokument="Źródło testowe",
                status="NIEUSTALONE",
                uwagi_pl="brak dokumentu źródłowego",
            ),
            powod_stosowalnosci_pl="kryterium dotyczy przedmiotu testu",
            rodzaj_twierdzenia=ClaimKind.DYNAMIC_PERFORMANCE,
            poziom=EvidenceTier.UNVALIDATED_MODEL,
            status_modelu="NIE_DOTYCZY",
            zakres_waznosci=ZakresWaznosci(opis_pl="zakres testowy"),
            powod_braku_niepewnosci_pl="brak wyniku — niepewność nie dotyczy",
            czego_brakuje=czego_brakuje,
        )
    )


def test_rekord_jest_pelnym_rekordem_kontraktu_z_brakiem_powierzchni_po_brakach_reguly() -> None:
    rekord = _rekord([_BRAK_POWIERZCHNI])
    sprawdz_ocene_niewykonana(rekord)
    braki = rekord["wyjasnienie"]["czego_brakuje"]  # type: ignore[index]
    assert braki[-1] == _BRAK_POWIERZCHNI
    # Reguła nazwała najpierw własne braki (metoda dowodu, wynik, podstawa kryterium).
    assert len(braki) > 1
    assert rekord["kompletnosc_dowodu"] == "NIEPELNY"


@pytest.mark.parametrize("braki", [[], [""], ["   "]])
def test_rekord_bez_konkretnego_braku_powierzchni_jest_bledem_konstrukcji(braki: list[str]) -> None:
    with pytest.raises(ValueError):
        _rekord(braki)
