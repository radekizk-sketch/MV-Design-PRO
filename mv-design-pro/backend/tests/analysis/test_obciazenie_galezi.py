"""Jedna definicja obciążenia gałęzi (decyzje O-46, O-51) — `analysis/obciazenie_galezi.py`.

ε = 100 % · max(I_od / I_r,od ; I_do / I_r,do); prąd znamionowy zacisku transformatora
I_r = S_n / (√3 · U_n,strona) wyłącznie przez `network_model/pochodne`. Iloczyn cech
i zmierzone różnice prądów zacisków — patrz `przypadki_obciazenia_galezi.py`.
"""

from __future__ import annotations

import math

import pytest
from analysis.obciazenie_galezi import (
    POWOD_BRAK_GALEZI_PL,
    POWOD_BRAK_MOCY_ZNAMIONOWEJ_PL,
    POWOD_BRAK_NAPIECIA_DN_PL,
    POWOD_BRAK_NAPIECIA_GN_PL,
    POWOD_BRAK_PRADU_DO_PL,
    POWOD_BRAK_PRADU_OD_PL,
    POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL,
    TOLERANCJA_WZGLEDNA_ROWNOSCI_STOSUNKOW,
    PradyZnamionoweZaciskow,
    obciazenie_galezi,
    obciazenie_z_pradow_zaciskow,
    prad_zacisku_do_a,
    prad_zacisku_od_a,
    prady_znamionowe_zaciskow,
)

from tests.analysis.przypadki_obciazenia_galezi import (
    Przypadek,
    galaz,
    prad_znamionowy_wyrocznia_a,
    wszystkie_przypadki,
)

PRZYPADKI = wszystkie_przypadki()


@pytest.mark.parametrize("p", PRZYPADKI, ids=[p.nazwa for p in PRZYPADKI])
def test_iloczyn_cech_obciazenie_z_wiekszego_ilorazu(p: Przypadek) -> None:
    wynik = obciazenie_galezi(galaz(p.rodzaj), prad_od_a=p.prad_od_a, prad_do_a=p.prad_do_a)
    assert wynik.powod_braku_pl is None
    assert wynik.zacisk_decydujacy == p.decyduje
    assert wynik.obciazenie_pct == pytest.approx(p.obciazenie_pct, rel=1e-12)
    assert wynik.prad_znamionowy_od_a == pytest.approx(p.prad_znamionowy_od_a, rel=1e-12)
    assert wynik.prad_znamionowy_do_a == pytest.approx(p.prad_znamionowy_do_a, rel=1e-12)
    if p.dokladnie_na_progu:
        # Granica bez błędu zaokrąglenia: iloraz I/I dokładnie 1,0.
        assert wynik.obciazenie_pct == 100.0


@pytest.mark.parametrize("p", PRZYPADKI, ids=[p.nazwa for p in PRZYPADKI])
def test_prad_zacisku_do_z_mocy_i_napiecia_strony_to(p: Przypadek) -> None:
    """I_do = |S_do| / (√3 · U_do) — wyrocznia: prąd, z którego zbudowano S_do."""
    assert prad_zacisku_do_a(p.moc_do_mva, p.napiecie_do_kv) == pytest.approx(
        p.prad_do_a, rel=1e-12
    )


def test_prad_znamionowy_transformatora_z_mocy_i_napiecia_strony() -> None:
    """Zacisk `od` = strona GN, zacisk `do` = strona DN; stosunek = przekładnia 110/15."""
    znamionowe = prady_znamionowe_zaciskow(galaz("transformator"))
    assert isinstance(znamionowe, PradyZnamionoweZaciskow)
    assert znamionowe.od_a == pytest.approx(prad_znamionowy_wyrocznia_a(25.0, 110.0), rel=1e-12)
    assert znamionowe.do_a == pytest.approx(prad_znamionowy_wyrocznia_a(25.0, 15.0), rel=1e-12)
    assert znamionowe.do_a / znamionowe.od_a == pytest.approx(110.0 / 15.0, rel=1e-12)


def test_rownosc_ilorazow_rozstrzyga_zacisk_od() -> None:
    wynik = obciazenie_z_pradow_zaciskow(
        PradyZnamionoweZaciskow(od_a=200.0, do_a=400.0),
        prad_od_a=100.0,
        prad_do_a=200.0,
    )
    assert wynik.zacisk_decydujacy == "od"
    assert wynik.obciazenie_pct == 50.0


@pytest.mark.parametrize(
    ("przesuniecie_do", "decyduje"),
    [
        # Szum arytmetyki (1 ulp w obie strony, 10⁻¹² względnie) — to NIE jest różnica
        # fizyczna, więc rozstrzyga reguła równości: zacisk `od`, niezależnie od znaku.
        (math.ulp(1.0), "od"),
        (-math.ulp(1.0), "od"),
        (1e-12, "od"),
        (-1e-12, "od"),
        # Różnica fizyczna (prąd ładowania kabla ~10⁻⁵ względnie) — decyduje większy.
        (1e-6, "do"),
        (-1e-6, "od"),
        (1e-5, "do"),
    ],
)
def test_rownosc_w_granicy_szumu_rozstrzyga_zacisk_od_na_kazdej_platformie(
    przesuniecie_do: float, decyduje: str
) -> None:
    """Remis w arytmetyce zmiennoprzecinkowej nie jest dokładny — reguła musi to znieść.

    Defekt zmierzony w CI (2026-09-24): transformator sceny walidacji ma stosunki
    I/I_r równe z definicji (gałąź szeregowa z przekładnią), obliczone różniły się o
    2,45·10⁻¹⁶ względnie, a znak tej różnicy zależał od maszyny — fikstura raz niosła
    „decyduje zacisk od”, raz „do”. Iloczyn cech: {szum, różnica fizyczna} × {znak}.
    """
    wynik = obciazenie_z_pradow_zaciskow(
        PradyZnamionoweZaciskow(od_a=24.248711305964285, do_a=909.3266739736606),
        prad_od_a=175.78280789129798,
        prad_do_a=909.3266739736606
        * (175.78280789129798 / 24.248711305964285)
        * (1.0 + przesuniecie_do),
    )
    assert wynik.zacisk_decydujacy == decyduje
    assert wynik.obciazenie_pct == pytest.approx(724.9160818210654, rel=1e-4)


def test_zmierzony_przypadek_transformatora_sceny_walidacji_decyduje_od() -> None:
    """Liczby wprost z biegu sceny walidacji (transformator 15/0,4 kV przeciążony ×7,25)."""
    wynik = obciazenie_z_pradow_zaciskow(
        PradyZnamionoweZaciskow(od_a=24.248711305964285, do_a=909.3266739736606),
        prad_od_a=175.78280789129798,
        prad_do_a=6591.855295923676,
    )
    assert wynik.zacisk_decydujacy == "od"
    assert TOLERANCJA_WZGLEDNA_ROWNOSCI_STOSUNKOW == 1e-9


@pytest.mark.parametrize(
    ("pole", "wartosc", "powod"),
    [
        ("rated_power_mva", 0.0, POWOD_BRAK_MOCY_ZNAMIONOWEJ_PL),
        ("rated_power_mva", float("nan"), POWOD_BRAK_MOCY_ZNAMIONOWEJ_PL),
        ("voltage_hv_kv", 0.0, POWOD_BRAK_NAPIECIA_GN_PL),
        ("voltage_lv_kv", -15.0, POWOD_BRAK_NAPIECIA_DN_PL),
    ],
)
def test_brak_danej_znamionowej_transformatora_to_nazwany_brak(
    pole: str, wartosc: float, powod: str
) -> None:
    transformator = galaz("transformator")
    setattr(transformator, pole, wartosc)
    wynik = obciazenie_galezi(transformator, prad_od_a=100.0, prad_do_a=700.0)
    assert wynik.obciazenie_pct is None
    assert wynik.zacisk_decydujacy is None
    assert wynik.powod_braku_pl == powod


def test_linia_bez_obciazalnosci_i_galaz_spoza_modelu_to_nazwany_brak() -> None:
    linia = galaz("linia")
    linia.rated_current_a = 0.0
    assert obciazenie_galezi(linia, prad_od_a=1.0, prad_do_a=1.0).powod_braku_pl == (
        POWOD_BRAK_PRADU_ZNAMIONOWEGO_PL
    )
    assert obciazenie_galezi(None, prad_od_a=1.0, prad_do_a=1.0).powod_braku_pl == (
        POWOD_BRAK_GALEZI_PL
    )


@pytest.mark.parametrize(
    ("prad_od", "prad_do", "powod"),
    [
        (None, 10.0, POWOD_BRAK_PRADU_OD_PL),
        (float("nan"), 10.0, POWOD_BRAK_PRADU_OD_PL),
        (10.0, None, POWOD_BRAK_PRADU_DO_PL),
        (10.0, float("inf"), POWOD_BRAK_PRADU_DO_PL),
    ],
)
def test_brak_pradu_zacisku_to_nazwany_brak_nie_zero(
    prad_od: float | None, prad_do: float | None, powod: str
) -> None:
    wynik = obciazenie_galezi(galaz("kabel"), prad_od_a=prad_od, prad_do_a=prad_do)
    assert wynik.obciazenie_pct is None
    assert wynik.powod_braku_pl == powod
    # Znane dane pozostają w wyniku (do wyświetlenia), brak nie staje się zerem.
    assert wynik.prad_znamionowy_od_a == 256.0


@pytest.mark.parametrize("napiecie", [None, 0.0, -1.0, float("nan"), float("inf")])
def test_prad_zacisku_do_bez_napiecia_to_brak(napiecie: float | None) -> None:
    assert prad_zacisku_do_a(complex(1.0, 0.5), napiecie) is None


def test_prad_zacisku_do_bez_mocy_i_prad_od_nieskonczony_to_brak() -> None:
    assert prad_zacisku_do_a(None, 15.0) is None
    assert prad_zacisku_do_a(complex(float("nan"), 0.0), 15.0) is None
    assert prad_zacisku_od_a(None) is None
    assert prad_zacisku_od_a(float("nan")) is None
    assert prad_zacisku_od_a(0.25) == 250.0


def test_wzor_pradu_znamionowego_nie_zyje_poza_pochodnymi() -> None:
    """Zastrzeżenie zarządcy (O-51): wzór I_r = S_n/(√3·U_n) żyje WYŁĄCZNIE w
    `network_model/pochodne` — moduł obciążenia go woła, nie liczy sam."""
    import inspect

    import analysis.obciazenie_galezi as modul

    zrodlo = inspect.getsource(modul)
    assert "prad_znamionowy_a(" in zrodlo
    assert "math.sqrt(3" not in zrodlo and "SQRT3" not in zrodlo
    assert math.isfinite(prad_znamionowy_wyrocznia_a(25.0, 110.0))
