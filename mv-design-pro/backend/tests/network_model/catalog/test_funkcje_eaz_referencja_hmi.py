"""Zestaw funkcji EAZ pola liniowego wobec referencji HMI właściciela 2026-10-29 (rozszerzenie 5
karty UX-04/POLE-LINIOWE-WZORZEC, sygnalizacja pola P6: U>, U<, I>, I>>, U0>, G0>, f<, df/dt,
P>, A_L, A_W, RNSN).

Rozstrzygnięcia przypięte testem (podstawa w `bay_templates` i `funkcje_eaz`):

* blokada od napięcia zwrotnego (NZ) należy do zestawu rysunku Z.11.1/Z.11 — Zeszyt 1
  §26.9.3 wymienia ją wprost w liście funkcji pola linii z jednostkami wytwórczymi;
* P> (32) — wymóg „na żądanie operatora" w klasach z generacją (IRiESD II.4.5.5.4), nie
  w zestawie rysunku (rysunek go nie ma);
* U0> (59N), Yo>, Go> — kryteria zabezpieczenia ziemnozwarciowego DOPUSZCZALNE w każdej
  klasie z podstawą „praktyka eksploatacyjna, referencja właściciela 2026-10-29";
* SCO i SPZ po SCO nie zostają w zestawie pola z generacją (IRiESD II.4.5.4.7.1 pkt 1).
"""

from __future__ import annotations

import pytest
from network_model.catalog.bay_templates import (
    KLASY_POLA_LINIOWEGO,
    KLASY_POLA_Z_GENERACJA,
    WYMAGANIA_EAZ_KLASY_POLA,
    funkcje_eaz_pola_liniowego,
)
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ

PRAKTYKA = "praktyka eksploatacyjna, referencja właściciela 2026-10-29"


def _wymogi(klasa: str) -> dict[str, tuple[str, str]]:
    return {kod: (wymog, podstawa) for kod, wymog, podstawa in WYMAGANIA_EAZ_KLASY_POLA[klasa]}


@pytest.mark.parametrize("wykonanie", ["Z11_1", "Z11"])
@pytest.mark.parametrize("klasa", [None, *KLASY_POLA_LINIOWEGO])
def test_nz_w_zestawie_pola_z_pomiarem_napiecia_zwrotnego(wykonanie: str, klasa: str | None):
    zestaw = funkcje_eaz_pola_liniowego(wykonanie, klasa)
    assert "NZ" in zestaw
    # NZ stoi za wyłączeniem od zabezpieczeń transformatora — kolejność listy §26.9.3.
    assert zestaw.index("NZ") == zestaw.index("OWG") + 1
    assert "§26.9.3" in FUNKCJE_EAZ["NZ"].podstawa


def test_nz_nie_w_zestawie_pola_odplywowego_z10():
    """Z.10 (§26.9.2) to pole bez pomiaru napięcia zwrotnego — blokada nie ma wejścia."""
    assert "NZ" not in funkcje_eaz_pola_liniowego("Z10", None)


@pytest.mark.parametrize("klasa", KLASY_POLA_LINIOWEGO)
def test_moc_zwrotna_na_zadanie_operatora_tylko_z_generacja(klasa: str):
    wymogi = _wymogi(klasa)
    if klasa in KLASY_POLA_Z_GENERACJA:
        wymog, podstawa = wymogi["32"]
        assert wymog == "NA_ZADANIE_OSD"
        assert "II.4.5.5.4" in podstawa
    else:
        assert "32" not in wymogi
    for wykonanie in ("Z10", "Z11_1", "Z11"):
        assert "32" not in funkcje_eaz_pola_liniowego(wykonanie, klasa)


@pytest.mark.parametrize("klasa", KLASY_POLA_LINIOWEGO)
@pytest.mark.parametrize("kod", ["59N", "Yo>", "Go>"])
def test_kryteria_ziemnozwarciowe_praktyki_dopuszczalne(klasa: str, kod: str):
    wymog, podstawa = _wymogi(klasa)[kod]
    assert wymog == "DOPUSZCZALNA"
    assert PRAKTYKA in podstawa
    assert "II.4.5.4.2" in podstawa
    assert kod in FUNKCJE_EAZ


@pytest.mark.parametrize("wykonanie", ["Z11_1", "Z11"])
@pytest.mark.parametrize("klasa", sorted(KLASY_POLA_Z_GENERACJA))
def test_sco_wykluczone_z_generacja(wykonanie: str, klasa: str):
    """Z.10 nie jest dopuszczone w klasie z generacją (`WYKONANIA_POLA_KLASY`). Iniekcja:
    usunięcie wpisu SCO „ZAKAZANA" z klasy mieszanej zostawia SCO w zestawie Z.11.1 (rysunek
    go niesie) — test czerwony."""
    zestaw = funkcje_eaz_pola_liniowego(wykonanie, klasa)
    assert "SCO" not in zestaw
    assert _wymogi(klasa)["SCO"][0] == "ZAKAZANA"
