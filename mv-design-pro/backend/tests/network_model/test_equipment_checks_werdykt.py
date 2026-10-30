"""Kryteria wyposażenia stacji jako werdykt wyjaśnialny — iloczyn cech (karta WERDYKT-MIGRACJA-190).

Cechy iloczynu:
* rodzaj oceny: bilans CT (obciążenie, nasycenie), bilans VT (obciążenie, zmiana napięcia),
  starzenie izolacji kabla;
* stan: spełnia / nie spełnia / brak danych / wartość robocza (``ESTIMATED``);
* tekst rekordu: brak surowego kodu statusu, brak ``None``/``True``, liczby po polsku.

Każdy kod zastany (``status*``) musi być PROJEKCJĄ statusu maszynowego rekordu — test
sprawdza parę (kod, status) dla każdej kombinacji, więc druga kopia warunku liczbowego
w solverze (rozjazd kodu i rekordu) jest wykrywana.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from typing import Any

import pytest
from network_model.solvers.equipment_checks.cable_thermal_aging import (
    CableThermalAgingInput,
    check_cable_thermal_aging,
)
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    CtBurdenInput,
    CtDeviceBurden,
    check_ct_burden_saturation,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    KATEGORIA_ZABEZPIECZENIOWA,
    VtBurdenInput,
    VtDeviceBurden,
    check_vt_burden_voltage_drop,
)

_KOD: dict[str, str] = {"SPELNIA": "PASS", "NIE_SPELNIA": "FAIL"}
_SUROWE = (
    "SPELNIA",
    "NIE_SPELNIA",
    "NIE_OCENIONO",
    "BRAK_DOWODU",
    "BRAK_PODSTAWY",
    "NIEPELNY",
    "ESTIMATED",
    "PASS",
    "FAIL",
    "UNAVAILABLE",
    "UPROSZCZONY_BEZ_RCT",
    "None",
    "True",
    "False",
)
_LICZBA_Z_KROPKA = re.compile(r"\d\.\d+\s?(VA|A|V|%|°C|Ω|m|mm²)\b")


def _kod(status: str) -> str:
    return _KOD.get(status, "UNAVAILABLE")


def _teksty(rekord: dict[str, Any]) -> Iterator[str]:
    wyjasnienie = rekord["wyjasnienie"]
    yield wyjasnienie["zdanie_pl"]
    if wyjasnienie.get("przyczyna_pl"):
        yield wyjasnienie["przyczyna_pl"]
    yield from wyjasnienie.get("czego_brakuje", ())
    yield from wyjasnienie.get("zastrzezenia", ())
    yield rekord["etykieta"]["etykieta_pl"]
    for skladowa in rekord.get("oceny_skladowe", ()):
        yield from _teksty(skladowa)


def _sprawdz_tekst(rekord: dict[str, Any]) -> None:
    for tekst in _teksty(rekord):
        for surowy in _SUROWE:
            assert not re.search(rf"\b{surowy}\b", tekst), (surowy, tekst)
        assert not _LICZBA_Z_KROPKA.search(tekst), tekst


def _ct(
    *,
    sn_va: float | None = 10.0,
    dlugosc: float | None = 20.0,
    alf: float | None = 10.0,
    alf_wymagany: float | None = 8.0,
    rct: float | None = 0.3,
) -> CtBurdenInput:
    return CtBurdenInput(
        i2n_a=5.0,
        sn_va=sn_va,
        alf=alf,
        dlugosc_przewodu_m=dlugosc,
        przekroj_przewodu_mm2=4.0,
        obciazenia_aparatow=(CtDeviceBurden(nazwa="przekaźnik", moc_va=1.0),),
        rct_ohm=rct,
        alf_wymagany=alf_wymagany,
        nazwa_pl="przekładnik prądowy pola 1",
    )


#: (opis, wejście, status obciążenia, status nasycenia, czy wartość robocza R_ct)
_SCENY_CT = [
    ("spelnia", _ct(), "SPELNIA", "SPELNIA", False),
    ("obciazenie_przekroczone", _ct(sn_va=2.5, dlugosc=200.0), "NIE_SPELNIA", "NIE_SPELNIA", False),
    ("nasycenie_niespelnione", _ct(alf_wymagany=500.0), "SPELNIA", "NIE_SPELNIA", False),
    ("brak_obwodu", _ct(dlugosc=None), None, None, False),
    ("brak_alf_wymaganego", _ct(alf_wymagany=None), "SPELNIA", None, False),
    ("wartosc_robocza_rct", _ct(rct=None), "SPELNIA", "SPELNIA", True),
]


@pytest.mark.parametrize(
    ("opis", "wejscie", "st_obc", "st_nas", "robocza"),
    _SCENY_CT,
    ids=[s[0] for s in _SCENY_CT],
)
def test_ct_kod_jest_projekcja_rekordu_iloczyn(
    opis: str,
    wejscie: CtBurdenInput,
    st_obc: str | None,
    st_nas: str | None,
    robocza: bool,
) -> None:
    wynik = check_ct_burden_saturation(wejscie)
    rekord = wynik.ocena.model_dump(mode="json")
    obciazenie, nasycenie = rekord["oceny_skladowe"]
    if st_obc is not None:
        assert obciazenie["status_maszynowy"] == st_obc, opis
    else:
        assert obciazenie["status_maszynowy"] not in ("SPELNIA", "NIE_SPELNIA"), opis
        assert obciazenie["wyjasnienie"]["czego_brakuje"], opis
    if st_nas is not None:
        assert nasycenie["status_maszynowy"] == st_nas, opis
    else:
        # Brak danych nigdy nie jest „spełnia" (kontrakt §3).
        assert nasycenie["status_maszynowy"] not in ("SPELNIA", "NIE_SPELNIA"), opis
        assert nasycenie["wyjasnienie"]["czego_brakuje"], opis
    # Para (kod zastany, status rekordu) — jedno źródło rozstrzygnięcia.
    assert wynik.status_obciazenia == _kod(obciazenie["status_maszynowy"])
    assert wynik.status_nasycenia == _kod(nasycenie["status_maszynowy"])
    przyjete = nasycenie["dowod"]["status_danych"]["dane_przyjete"]
    if robocza:
        assert any(d["jakosc"] == "ESTIMATED" for d in przyjete), opis
        assert nasycenie["kompletnosc_dowodu"] == "NIEPELNY", opis
    else:
        assert not any("R_ct" in d["nazwa_pl"] for d in przyjete), opis
    assert wynik.wyjasnienie == wynik.ocena.wyjasnienie
    _sprawdz_tekst(rekord)


def _vt(
    *,
    sn_va: float | None = 30.0,
    dlugosc: float | None = 30.0,
    kategoria: str | None = KATEGORIA_ZABEZPIECZENIOWA,
    przekroj: float = 2.5,
    moc: float = 5.0,
) -> VtBurdenInput:
    return VtBurdenInput(
        u2n_v=100.0,
        sn_va=sn_va,
        kategoria_uzwojenia=kategoria,
        dlugosc_przewodu_m=dlugosc,
        przekroj_przewodu_mm2=przekroj,
        obciazenia_aparatow=(VtDeviceBurden(nazwa="przekaźnik", moc_va=moc),),
        nazwa_pl="przekładnik napięciowy pola 1",
    )


_SCENY_VT = [
    ("spelnia", _vt(), "SPELNIA", "SPELNIA"),
    ("obciazenie_przekroczone", _vt(sn_va=2.0), "NIE_SPELNIA", "SPELNIA"),
    ("spadek_przekroczony", _vt(dlugosc=400.0, przekroj=1.5, moc=25.0), "SPELNIA", "NIE_SPELNIA"),
    ("kategoria_nierozpoznana", _vt(kategoria=None), "SPELNIA", None),
    ("brak_obwodu", _vt(dlugosc=None), None, None),
]


@pytest.mark.parametrize(
    ("opis", "wejscie", "st_obc", "st_spadku"), _SCENY_VT, ids=[s[0] for s in _SCENY_VT]
)
def test_vt_kod_jest_projekcja_rekordu_iloczyn(
    opis: str, wejscie: VtBurdenInput, st_obc: str | None, st_spadku: str | None
) -> None:
    wynik = check_vt_burden_voltage_drop(wejscie)
    rekord = wynik.ocena.model_dump(mode="json")
    obciazenie, spadek = rekord["oceny_skladowe"]
    if st_obc is not None:
        assert obciazenie["status_maszynowy"] == st_obc, opis
    if st_spadku is not None:
        assert spadek["status_maszynowy"] == st_spadku, opis
    if wejscie.dlugosc_przewodu_m is None or wejscie.kategoria_uzwojenia is None:
        assert spadek["status_maszynowy"] not in ("SPELNIA", "NIE_SPELNIA"), opis
        assert spadek["wyjasnienie"]["czego_brakuje"], opis
    else:
        # Limit ΔU jest założeniem programu — wartość robocza ESTIMATED, dowód niepełny.
        przyjete = spadek["dowod"]["status_danych"]["dane_przyjete"]
        assert any(d["jakosc"] == "ESTIMATED" for d in przyjete), opis
        assert spadek["kompletnosc_dowodu"] == "NIEPELNY", opis
    assert wynik.status_obciazenia == _kod(obciazenie["status_maszynowy"])
    assert wynik.status_spadku == _kod(spadek["status_maszynowy"])
    _sprawdz_tekst(rekord)


_SCENY_KABEL = [
    ("spelnia", CableThermalAgingInput(70.0, 90.0, "XLPE", nazwa_pl="kabel L1"), "SPELNIA"),
    (
        "nie_spelnia",
        CableThermalAgingInput(105.0, 90.0, "XLPE", nazwa_pl="kabel L1"),
        "NIE_SPELNIA",
    ),
    ("brak_temperatury", CableThermalAgingInput(None, 90.0, "XLPE", nazwa_pl="kabel L1"), None),
    ("brak_izolacji", CableThermalAgingInput(70.0, None, None, nazwa_pl="kabel L1"), None),
]


@pytest.mark.parametrize(
    ("opis", "wejscie", "status"), _SCENY_KABEL, ids=[s[0] for s in _SCENY_KABEL]
)
def test_kabel_kod_jest_projekcja_rekordu_iloczyn(
    opis: str, wejscie: CableThermalAgingInput, status: str | None
) -> None:
    wynik = check_cable_thermal_aging(wejscie)
    rekord = wynik.ocena.model_dump(mode="json")
    if status is None:
        assert rekord["status_maszynowy"] not in ("SPELNIA", "NIE_SPELNIA"), opis
        assert rekord["wyjasnienie"]["czego_brakuje"], opis
    else:
        assert rekord["status_maszynowy"] == status, opis
        # Temperatura pracy podana w polu kryterium — wartość robocza, dowód niepełny.
        assert rekord["kompletnosc_dowodu"] == "NIEPELNY", opis
    assert wynik.status == _kod(rekord["status_maszynowy"])
    _sprawdz_tekst(rekord)


def test_rekordy_deterministyczne() -> None:
    """To samo wejście → identyczny rekord (determinizm)."""
    for _, wejscie, *_ in _SCENY_CT:
        a = check_ct_burden_saturation(wejscie).ocena.model_dump(mode="json")
        b = check_ct_burden_saturation(wejscie).ocena.model_dump(mode="json")
        assert a == b
