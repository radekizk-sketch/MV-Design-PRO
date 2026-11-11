"""Algorytm 67N: sześć warunków działania w JEDNEJ liście i odporność na usunięcie reguły
(wymaganie właściciela 1 przy przekazaniu karty EKRANY-EAZ-ZIEMNOZWARCIOWE).

Warunki (``ocena_ziemnozwarciowa.warunki_dzialania``, kolejność algorytmu przekaźnika):
U0 ≥ U0> · moduł |3I0| ≥ I0> (pobudzenie) · decyzja kierunkowa s·3I0·cos(φ0 − φ_ch) ≥ 0 ·
położenie w sektorze φ_ch ± Δφ · kryterium trybu rzutu s·3I0·cos(φ0 − φ_ch) ≥ I0> · czas
zadziałania ≤ czas trwania pobudzenia.

ILOCZYN CECH:
* warunek niespełniony {U0, PROG, KIERUNEK, SEKTOR, TRYB, CZAS} (każdy SAM, pozostałe
  spełnione) × kierunek nastawy {do linii, do szyn} — werdykt „nie działa” z tym warunkiem jako
  rozstrzygającym, a przy tym samym wskazie bez naruszenia — „działa”;
* mutacja koniunkcji: wyłączenie każdej z sześciu reguł z listy (podmiana ``warunki_dzialania``
  w module) — przypadek tej reguły przestaje być „nie działa”, czyli test go wykrywa;
* czas przy wymuszeniu AWSC (``dzialanie_w_punkcie``): pobudzenie odpada po wymuszeniu ×
  zwłoka {krótsza, dłuższa niż t_W} — warunek CZAS na realnej ścieżce oceny punktu.

Liczby wskazów dobrane ręcznie (komentarz przy każdym przypadku): próg I0> = 2 A, U0> = 15 %,
φ_ch = 90° (sin φ), Δφ = ±80°, charakterystyka niezależna 0,5 s.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import replace

import pytest
from application.analyses.protection import ocena_ziemnozwarciowa as oz
from application.analyses.protection.ocena_nadpradowa import StopienNastaw
from application.analyses.protection.ocena_ziemnozwarciowa import (
    KOLEJNOSC_WARUNKOW,
    FunkcjaZiemnozwarciowa,
    dzialanie_w_punkcie,
    rusza,
    warunek_rozstrzygajacy,
    warunki_dzialania,
)
from network_model.solvers.doziemienie_sn import (
    STAN_PO_AWSC,
    STAN_PRZED,
    WielkosciPola,
    WynikPunktuDoziemienia,
)

PROG_A = 2.0
ZWLOKA_S = 0.5


def _f67(tryb: str, kierunek: str, *, zwloka: float = ZWLOKA_S) -> FunkcjaZiemnozwarciowa:
    stopien = StopienNastaw(
        funkcja="67N",
        krzywa="DT",
        wartosc_progu=PROG_A,
        jednostka_progu="A_PIERWOTNY",
        prog_wtorny_a=PROG_A,
        prog_pierwotny_a=PROG_A,
        tms=None,
        zwloka_s=zwloka,
        slad={},
    )
    return FunkcjaZiemnozwarciowa(
        urzadzenie_ref="r",
        nazwa_urzadzenia_pl="r",
        funkcja_ref="f",
        kod="67N",
        nastawy={
            "prog": PROG_A,
            "jednostka_progu": "A_PIERWOTNY",
            "krzywa": "DT",
            "zwloka_s": zwloka,
            "kierunek": kierunek,
            "kat_charakterystyczny_deg": 90.0,
            "tryb_kryterium": tryb,
            "polowa_sektora_deg": 80.0,
            "prog_u0_proc": 15.0,
        },
        breaker_ref="b",
        strefa=None,
        wezel_pomiaru="w",
        stopien=stopien,
        przekladnia_3i0=None,
        braki=(),
    )


def _pole(modul: float, kat_wzgl_osi_deg: float, u0: float, kierunek: str) -> WielkosciPola:
    """Wskaz 3I0 o module ``modul`` i kącie ``kat_wzgl_osi_deg`` względem OSI DZIAŁANIA
    (φ_ch = 90° do linii, 270° do szyn); U0 w % U0n."""
    os_deg = 90.0 + (180.0 if kierunek == "DO_SZYN" else 0.0)
    kat = (os_deg + kat_wzgl_osi_deg + 180.0) % 360.0 - 180.0
    return WielkosciPola(
        strefa_ref="r/f",
        zwarcie_w_strefie=True,
        prad_3i0_a=cmath.rect(modul, math.radians(kat)),
        u0_v=complex(-1000.0, 0.0),
        u0_proc=u0,
        admitancja_y0_s=None,
        moc_p0_w=0.0,
        kat_phi0_deg=kat,
    )


#: Warunek → (tryb, moduł [A], kąt względem osi działania [°], U0 [%], czas pobudzenia [s])
#: przypadku, w którym TYLKO ten warunek jest niespełniony, oraz wskaz bazowy (wszystkie
#: spełnione) różniący się wyłącznie wielkością naruszaną.
PRZYPADKI: dict[str, tuple[tuple[str, float, float, float, float | None], tuple]] = {
    # U0 = 10 % < 15 %; |3I0| = 10 A, 20° od osi: rzut 9,40 A ≥ 2 A, sektor 20° ≤ 80°.
    "U0": (("RZUT", 10.0, 20.0, 10.0, None), ("RZUT", 10.0, 20.0, 90.0, None)),
    # Tryb sektorowy, |3I0| = 1,5 A < 2 A (pobudzenie); kąt 20° — kierunek i sektor spełnione.
    "PROG": (("SEKTOR", 1.5, 20.0, 90.0, None), ("SEKTOR", 2.5, 20.0, 90.0, None)),
    # Tryb sektorowy, 160° od osi działania: od prostej charakterystyki 20° ≤ 80° (sektor
    # spełniony), ale rzut na φ_ch ze znakiem kierunku 10·cos 160° = −9,40 A < 0 (za plecami).
    "KIERUNEK": (("SEKTOR", 10.0, 160.0, 90.0, None), ("SEKTOR", 10.0, 20.0, 90.0, None)),
    # Tryb sektorowy, 85° od osi: odległość od prostej 85° > 80°; rzut 10·cos 85° = 0,87 A ≥ 0.
    "SEKTOR": (("SEKTOR", 10.0, 85.0, 90.0, None), ("SEKTOR", 10.0, 75.0, 90.0, None)),
    # Tryb rzutu (sin φ), |3I0| = 3 A, 60° od osi: rzut 3·cos 60° = 1,5 A < 2 A; moduł 3 A ≥ 2 A,
    # sektor 60° ≤ 80°, kierunek 1,5 A ≥ 0.
    "TRYB": (("RZUT", 3.0, 60.0, 90.0, None), ("RZUT", 3.0, 40.0, 90.0, None)),
    # Wszystkie wielkości spełnione, ale pobudzenie trwa 0,3 s < zwłoka 0,5 s.
    "CZAS": (("RZUT", 10.0, 20.0, 90.0, 0.3), ("RZUT", 10.0, 20.0, 90.0, 0.6)),
}


def test_lista_ma_szesc_warunkow_w_jednym_miejscu() -> None:
    """Tryb rzutu: sześć warunków w kolejności algorytmu; tryb sektorowy: kryterium trybu jest
    koniunkcją progu i sektora — bez dublowanego predykatu (pięć wpisów)."""
    pole = _pole(10.0, 20.0, 90.0, "DO_LINII")
    assert [w.klucz for w in warunki_dzialania(_f67("RZUT", "DO_LINII"), pole)] == list(
        KOLEJNOSC_WARUNKOW
    )
    assert [w.klucz for w in warunki_dzialania(_f67("SEKTOR", "DO_LINII"), pole)] == [
        "U0",
        "PROG",
        "KIERUNEK",
        "SEKTOR",
        "CZAS",
    ]


def _ocena(klucz: str, kierunek: str, wariant: int) -> tuple[FunkcjaZiemnozwarciowa, tuple]:
    tryb, modul, kat, u0, t_pob = PRZYPADKI[klucz][wariant]
    return _f67(tryb, kierunek), (_pole(modul, kat, u0, kierunek), t_pob)


@pytest.mark.parametrize("kierunek", ["DO_LINII", "DO_SZYN"])
@pytest.mark.parametrize("klucz", list(PRZYPADKI))
def test_kazdy_warunek_sam_rozstrzyga(klucz: str, kierunek: str) -> None:
    f, (pole, t_pob) = _ocena(klucz, kierunek, 0)
    warunki = warunki_dzialania(f, pole, t_pob)
    niespelnione = [w.klucz for w in warunki if not w.spelniony]
    assert niespelnione == [klucz], (klucz, [w.to_dict() for w in warunki])
    assert rusza(f, pole, t_pob) is False
    assert warunek_rozstrzygajacy(warunki).klucz == klucz
    # Ten sam wskaz bez naruszenia — działa (warunek nie jest artefaktem przypadku).
    f2, (pole2, t_pob2) = _ocena(klucz, kierunek, 1)
    assert all(w.spelniony for w in warunki_dzialania(f2, pole2, t_pob2))
    assert rusza(f2, pole2, t_pob2) is True


@pytest.mark.parametrize("wylaczony", list(KOLEJNOSC_WARUNKOW))
def test_wylaczenie_reguly_jest_wykrywane(wylaczony: str, monkeypatch) -> None:
    """Mutacja: koniunkcja bez jednej reguły. Przypadek tej reguły przestaje być „nie działa”
    — test ``test_kazdy_warunek_sam_rozstrzyga`` zaczerwieniłby się dla każdej z sześciu."""
    oryginal = oz.warunki_dzialania

    def bez_reguly(f, pole, czas_pobudzenia_s=None):  # noqa: ANN001, ANN202
        return tuple(w for w in oryginal(f, pole, czas_pobudzenia_s) if w.klucz != wylaczony)

    monkeypatch.setattr(oz, "warunki_dzialania", bez_reguly)
    for kierunek in ("DO_LINII", "DO_SZYN"):
        f, (pole, t_pob) = _ocena(wylaczony, kierunek, 0)
        assert oz.rusza(f, pole, t_pob) is True, (wylaczony, kierunek)


def _punkt(stan: str, pole: WielkosciPola) -> WynikPunktuDoziemienia:
    return WynikPunktuDoziemienia(
        punkt_ref="k",
        nazwa_pl="k",
        stan=stan,  # type: ignore[arg-type]
        skladowa=0,
        prad_doziemny_a=0j,
        u0_punktu_v=0j,
        u0_punktu_proc=0.0,
        pola=(pole,),
        prady_punktow_neutralnych_a=(),
    )


@pytest.mark.parametrize("zwloka, oczekiwany", [(0.2, 0.2), (0.5, None)])
def test_czas_przy_wymuszeniu_awsc_z_listy(zwloka: float, oczekiwany: float | None) -> None:
    """Pobudzenie przed wymuszeniem (|3I0| = 10 A w osi), po wymuszeniu AWSC odpada (U0 = 5 %
    < 15 %). Wymuszenie po t_W = 0,3 s: zwłoka 0,2 s ≤ 0,3 s — działa po 0,2 s; zwłoka 0,5 s
    > 0,3 s — pobudzenie zanika przed upływem zwłoki, funkcja nie działa (warunek CZAS)."""
    f = _f67("RZUT", "DO_LINII", zwloka=zwloka)
    przed = _punkt(STAN_PRZED, _pole(10.0, 0.0, 90.0, "DO_LINII"))
    po = _punkt(STAN_PO_AWSC, _pole(10.0, 0.0, 5.0, "DO_LINII"))
    d = dzialanie_w_punkcie(f, przed, po, 0.3)
    assert d.t_zadzialania_s == oczekiwany
    # Pobudzenie trwa po wymuszeniu (U0 = 90 %) — zwłoka 0,5 s działa mimo t_W = 0,3 s.
    po_trwa = _punkt(STAN_PO_AWSC, _pole(10.0, 0.0, 90.0, "DO_LINII"))
    assert dzialanie_w_punkcie(f, przed, po_trwa, 0.3).t_zadzialania_s == zwloka


def test_zero_pradu_rozstrzyga_prog_nie_kat() -> None:
    """Prąd zerowy: kąt nieokreślony — warunki kątowe neutralne, rozstrzyga pobudzenie."""
    f = _f67("RZUT", "DO_LINII")
    pole = replace(_pole(0.0, 0.0, 90.0, "DO_LINII"), prad_3i0_a=0j, kat_phi0_deg=None)
    assert warunek_rozstrzygajacy(warunki_dzialania(f, pole)).klucz == "PROG"
