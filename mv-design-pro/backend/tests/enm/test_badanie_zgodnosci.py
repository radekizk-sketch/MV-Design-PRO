"""Kontrakt `BadanieZgodnosci` i rodzaj badania biegu `dynamika_rms` (karta AB-1a D4).

Iloczyn cech, nie przyklad z karty: {trzy rodzaje bodzca} x {poprawny / kazde
naruszenie spojnosci} x {rodzaj badania: brak pola / jawny sieciowy / jawny
zgodnosci / nieznany} x {klucz scenariusza obecny / nieobecny} x {klucz badania
obecny / nieobecny}. Plus piny bit w bit: hashe trzech istniejacych scenariuszy z
fikstur i `input_hash` opcji biegow sprzed karty.
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

import pytest
from enm.adapter_dynamiki import (
    KOD_BODZIEC_RDZEN_NIEOBSLUGIWANY,
    KODY_ODMOW_ADAPTERA,
    OdmowaWejsciaDynamiki,
    rodzaj_badania_biegu,
)
from enm.badanie_zgodnosci import (
    KODY_OPCJI_BADANIA,
    RODZAJ_BADANIE_ZGODNOSCI,
    RODZAJ_SCENARIUSZ_SIECIOWY,
    BadanieZgodnosci,
    BadanieZgodnosciNiepoprawneError,
    ImpedancjaZastepcza,
    RodzajBadaniaSprzecznyError,
    rodzaj_badania_z_opcji,
    waliduj_opcje_badania,
)
from enm.canonical_analysis import _compute_input_hash
from enm.scenariusze import ScenariuszDynamiczny
from pydantic import ValidationError

from tests.e2e.test_so1a_scenariusz_odniesienia import NASTAWY_SOLVERA as NASTAWY_SO1A
from tests.e2e.test_so1a_scenariusz_odniesienia import SCENARIUSZ_SO1A
from tests.enm.test_adapter_dynamiki import NASTAWY as NASTAWY_ADAPTERA
from tests.enm.test_adapter_dynamiki import SCENARIUSZ as SCENARIUSZ_ADAPTERA
from tests.test_dynamika_rms_run import NASTAWY_SOLVERA as NASTAWY_BIEGU
from tests.test_dynamika_rms_run import SCENARIUSZ_CZASOWY

_PROWENIENCJA = {"zrodlo": "karta_producenta", "odniesienie": "karta-testowa-1"}
_PASMO = {"f_min_hz": 47.0, "f_max_hz": 52.0, "proweniencja": _PROWENIENCJA}
_IMPEDANCJA_OHM = {
    "jednostka": "ohm",
    "r": 0.05,
    "x": 0.5,
    "u_bazowe_kv": 15.0,
    "s_bazowa_mva": None,
    "proweniencja": _PROWENIENCJA,
}

BODZCE: dict[str, dict[str, Any]] = {
    "profil_napiecia_zaciskow": {
        "rodzaj": "profil_napiecia_zaciskow",
        "punkty": [
            {"t_s": 0.0, "u_pu": 1.0},
            {"t_s": 0.1, "u_pu": 0.05},
            {"t_s": 0.25, "u_pu": 0.05},
            {"t_s": 1.0, "u_pu": 0.9},
        ],
    },
    "rampa_czestotliwosci": {
        "rodzaj": "rampa_czestotliwosci",
        "t_start_s": 0.1,
        "t_koniec_s": 0.6,
        "f_poczatkowa_hz": 50.0,
        "df_dt_hz_s": 2.0,
        "pasmo_waznosci_modelu_hz": _PASMO,
    },
    "skok_czestotliwosci": {
        "rodzaj": "skok_czestotliwosci",
        "t_s": 0.2,
        "f_przed_hz": 50.0,
        "f_do_hz": 49.0,
        "pasmo_waznosci_modelu_hz": _PASMO,
    },
}


def _badanie(bodziec: str = "skok_czestotliwosci", **nadpisania: Any) -> dict[str, Any]:
    dane: dict[str, Any] = {
        "urzadzenie_ref": "gen-pv",
        "bodziec": copy.deepcopy(BODZCE[bodziec]),
        "impedancja_zastepcza_sieci": copy.deepcopy(_IMPEDANCJA_OHM),
        "horyzont_s": 2.0,
        "krok_wyjscia_s": 0.02,
    }
    dane.update(nadpisania)
    return dane


# --------------------------------------------------------------------------- #
# Kontrakt: poprawne warianty, round-trip JSON, hash wlasny
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bodziec", sorted(BODZCE))
def test_kazdy_rodzaj_bodzca_round_trip_json_i_hash(bodziec: str) -> None:
    badanie = BadanieZgodnosci.model_validate(_badanie(bodziec))
    assert badanie.bodziec.rodzaj == bodziec
    ponownie = BadanieZgodnosci.model_validate_json(badanie.model_dump_json())
    assert ponownie == badanie
    assert ponownie.tresc() == badanie.tresc()
    oczekiwany = hashlib.sha256(
        json.dumps(
            badanie.tresc(), sort_keys=True, ensure_ascii=False, separators=(",", ":")
        ).encode("utf-8")
    ).hexdigest()
    assert badanie.hash() == oczekiwany
    assert BadanieZgodnosci.model_validate(_badanie(bodziec)).hash() == badanie.hash()


def test_rozne_bodzce_rozne_hashe() -> None:
    hashe = {BadanieZgodnosci.model_validate(_badanie(b)).hash() for b in BODZCE}
    assert len(hashe) == len(BODZCE)


@pytest.mark.parametrize(
    "brakujace",
    ["urzadzenie_ref", "bodziec", "impedancja_zastepcza_sieci", "horyzont_s", "krok_wyjscia_s"],
)
def test_zadne_pole_badania_nie_ma_wartosci_domyslnej(brakujace: str) -> None:
    dane = _badanie()
    del dane[brakujace]
    with pytest.raises(ValidationError):
        BadanieZgodnosci.model_validate(dane)


@pytest.mark.parametrize(
    "pole", ["jednostka", "r", "x", "u_bazowe_kv", "s_bazowa_mva", "proweniencja"]
)
def test_impedancja_zastepcza_bez_wartosci_domyslnej(pole: str) -> None:
    dane = copy.deepcopy(_IMPEDANCJA_OHM)
    del dane[pole]
    with pytest.raises(ValidationError):
        ImpedancjaZastepcza.model_validate(dane)


@pytest.mark.parametrize("bodziec", sorted(BODZCE))
def test_dyskryminator_bodzca_nie_ma_wartosci_domyslnej(bodziec: str) -> None:
    dane = _badanie(bodziec)
    del dane["bodziec"]["rodzaj"]
    with pytest.raises(ValidationError):
        BadanieZgodnosci.model_validate(dane)


def test_pole_nadmiarowe_odrzucone() -> None:
    with pytest.raises(ValidationError):
        BadanieZgodnosci.model_validate({**_badanie(), "zdarzenia": []})


# --------------------------------------------------------------------------- #
# Spojnosc: kazde naruszenie osobno
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    ("bodziec", "zmiana", "fragment"),
    [
        (
            "profil_napiecia_zaciskow",
            {"punkty": [{"t_s": 0.0, "u_pu": 1.0}, {"t_s": 0.0, "u_pu": 0.5}]},
            "scisle rosnace",
        ),
        (
            "profil_napiecia_zaciskow",
            {"punkty": [{"t_s": 0.5, "u_pu": 1.0}, {"t_s": 0.1, "u_pu": 0.5}]},
            "scisle rosnace",
        ),
        ("rampa_czestotliwosci", {"df_dt_hz_s": 0.0}, "nie jest rampa"),
        ("rampa_czestotliwosci", {"t_koniec_s": 0.1}, "pozniej niz"),
        ("rampa_czestotliwosci", {"df_dt_hz_s": 10.0}, "poza pasmem"),
        ("rampa_czestotliwosci", {"f_poczatkowa_hz": 46.0}, "poza pasmem"),
        ("skok_czestotliwosci", {"f_do_hz": 53.0}, "poza pasmem"),
        ("skok_czestotliwosci", {"f_przed_hz": 60.0, "f_do_hz": 50.0}, "poza pasmem"),
        ("skok_czestotliwosci", {"f_do_hz": 50.0}, "nie jest skokiem"),
    ],
)
def test_naruszenia_spojnosci_bodzca(bodziec: str, zmiana: dict[str, Any], fragment: str) -> None:
    dane = _badanie(bodziec)
    dane["bodziec"].update(zmiana)
    with pytest.raises(ValidationError, match=fragment):
        BadanieZgodnosci.model_validate(dane)


def test_pasmo_waznosci_puste_odrzucone() -> None:
    dane = _badanie("skok_czestotliwosci")
    dane["bodziec"]["pasmo_waznosci_modelu_hz"] = {**_PASMO, "f_min_hz": 52.0, "f_max_hz": 47.0}
    with pytest.raises(ValidationError, match="mniejsze niz"):
        BadanieZgodnosci.model_validate(dane)


@pytest.mark.parametrize(
    ("zmiana", "fragment"),
    [
        ({"r": 0.0, "x": 0.0}, "R = X = 0"),
        ({"jednostka": "pu", "s_bazowa_mva": None}, "wymaga jawnej bazy"),
        ({"jednostka": "ohm", "s_bazowa_mva": 10.0}, "nie przyjmuje bazy"),
    ],
)
def test_impedancja_zastepcza_spojnosc_bazy(zmiana: dict[str, Any], fragment: str) -> None:
    with pytest.raises(ValidationError, match=fragment):
        ImpedancjaZastepcza.model_validate({**_IMPEDANCJA_OHM, **zmiana})


def test_impedancja_w_pu_z_jawna_baza_przyjeta() -> None:
    imp = ImpedancjaZastepcza.model_validate(
        {**_IMPEDANCJA_OHM, "jednostka": "pu", "r": 0.01, "x": 0.1, "s_bazowa_mva": 10.0}
    )
    assert imp.s_bazowa_mva == 10.0


@pytest.mark.parametrize("bodziec", sorted(BODZCE))
def test_bodziec_poza_horyzontem_odrzucony(bodziec: str) -> None:
    with pytest.raises(ValidationError, match="poza horyzont_s"):
        BadanieZgodnosci.model_validate(_badanie(bodziec, horyzont_s=0.15, krok_wyjscia_s=0.01))


def test_krok_wyjscia_wiekszy_niz_horyzont_odrzucony() -> None:
    with pytest.raises(ValidationError, match="krok_wyjscia_s"):
        BadanieZgodnosci.model_validate(_badanie(horyzont_s=1.0, krok_wyjscia_s=2.0))


# --------------------------------------------------------------------------- #
# Rodzaj badania z opcji: iloczyn {rodzaj} x {klucz scenariusza} x {klucz badania}
# --------------------------------------------------------------------------- #
_BRAK = object()


@pytest.mark.parametrize(
    "rodzaj", [_BRAK, RODZAJ_SCENARIUSZ_SIECIOWY, RODZAJ_BADANIE_ZGODNOSCI, "inny"]
)
@pytest.mark.parametrize("ma_scenariusz", [False, True])
@pytest.mark.parametrize("ma_badanie", [False, True])
def test_rodzaj_badania_iloczyn_cech(rodzaj: object, ma_scenariusz: bool, ma_badanie: bool) -> None:
    opcje: dict[str, Any] = {}
    if rodzaj is not _BRAK:
        opcje["rodzaj_badania"] = rodzaj
    if ma_scenariusz:
        opcje["dynamika"] = copy.deepcopy(SCENARIUSZ_CZASOWY)
    if ma_badanie:
        opcje["badanie_zgodnosci"] = _badanie()
    przed = copy.deepcopy(opcje)

    efektywny = RODZAJ_SCENARIUSZ_SIECIOWY if rodzaj is _BRAK else rodzaj
    poprawne = (
        not (ma_scenariusz and ma_badanie)
        and efektywny in (RODZAJ_SCENARIUSZ_SIECIOWY, RODZAJ_BADANIE_ZGODNOSCI)
        and not (efektywny == RODZAJ_SCENARIUSZ_SIECIOWY and ma_badanie)
        and not (efektywny == RODZAJ_BADANIE_ZGODNOSCI and (ma_scenariusz or not ma_badanie))
    )
    if poprawne:
        assert rodzaj_badania_z_opcji(opcje) == efektywny
        assert waliduj_opcje_badania(opcje) == efektywny
    else:
        with pytest.raises(RodzajBadaniaSprzecznyError) as exc:
            rodzaj_badania_z_opcji(opcje)
        assert exc.value.kod == "dynamika.rodzaj_badania_sprzeczny"
    # ODCZYT bez zapisu: opcje nietkniete niezaleznie od wyniku.
    assert opcje == przed


def test_badanie_zgodnosci_spoza_kontraktu_odmowa_nazwana_z_lista_naruszen() -> None:
    zle = _badanie()
    zle["bodziec"]["f_do_hz"] = 60.0
    opcje = {"rodzaj_badania": RODZAJ_BADANIE_ZGODNOSCI, "badanie_zgodnosci": zle}
    with pytest.raises(BadanieZgodnosciNiepoprawneError) as exc:
        waliduj_opcje_badania(opcje)
    assert exc.value.kod == "dynamika.badanie_zgodnosci_niepoprawne"
    assert "bodziec" in exc.value.komunikat


def test_kody_opcji_badania_zamkniete() -> None:
    assert KODY_OPCJI_BADANIA == (
        "dynamika.badanie_zgodnosci_niepoprawne",
        "dynamika.rodzaj_badania_sprzeczny",
    )
    assert {RodzajBadaniaSprzecznyError.kod, BadanieZgodnosciNiepoprawneError.kod} == set(
        KODY_OPCJI_BADANIA
    )


# --------------------------------------------------------------------------- #
# Odmowa adaptera: `bodziec.rdzen_nieobslugiwany` z pelnym kontekstem
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("bodziec", sorted(BODZCE))
def test_adapter_odmawia_badania_zgodnosci_z_pelnym_kontekstem(bodziec: str) -> None:
    opcje = {"rodzaj_badania": RODZAJ_BADANIE_ZGODNOSCI, "badanie_zgodnosci": _badanie(bodziec)}
    with pytest.raises(OdmowaWejsciaDynamiki) as exc:
        rodzaj_badania_biegu(opcje)
    odmowa = exc.value
    assert odmowa.kod == KOD_BODZIEC_RDZEN_NIEOBSLUGIWANY == "bodziec.rdzen_nieobslugiwany"
    assert KOD_BODZIEC_RDZEN_NIEOBSLUGIWANY in KODY_ODMOW_ADAPTERA
    assert odmowa.elementy == ("gen-pv", bodziec)
    komunikat = str(odmowa)
    assert "gen-pv" in komunikat
    assert "AB-3R" in komunikat
    assert "szyny o zadanym przebiegu" in komunikat


def test_adapter_przepuszcza_scenariusz_sieciowy_bez_pola_rodzaju() -> None:
    opcje = {"dynamika": copy.deepcopy(SCENARIUSZ_CZASOWY)}
    assert rodzaj_badania_biegu(opcje) == RODZAJ_SCENARIUSZ_SIECIOWY
    assert "rodzaj_badania" not in opcje


# --------------------------------------------------------------------------- #
# PINY bit w bit (karta AB-1a D4): hashe istniejacych scenariuszy i opcji biegow
# --------------------------------------------------------------------------- #
#: POMIAR 2026-09-23 na drzewie karty: `enm/scenariusze.py` i
#: `canonical_analysis._compute_input_hash` NIE sa zmienione przez karte (git diff),
#: wiec to sa wartosci HEAD sprzed karty. Zmiana ktorejkolwiek = zmiana tresci
#: scenariusza sieciowego albo zapis domyslki `rodzaj_badania` do opcji — oba
#: zakazane przez §0 R-4.
HASHE_SCENARIUSZY: dict[str, str] = {
    "so1a": "c5a42d7899b37b5ccdfae73ded8e422dc463c2b92eb32c449dd9cd1eebc4f2bb",
    "bieg_czasowy": "2a044580ff44afb72a58f0ba5b044799b9c81f66834cf6f7b17e1f19ea205f1a",
    "adapter": "fea2e6696c05a08f094f31c11ec66b36df9e9202fa29a27fce1cd747e40c5088",
}
HASHE_OPCJI_BIEGU: dict[str, str] = {
    "so1a": "a8da0e929a16d08d0d2cf4273408b82d336b7b97a1663e781689fbd33cb27f34",
    "bieg_czasowy": "d8cd37c0ebb6089529906a2a733a41ca274274299d6b77d1aab7a1ccd05f4a9b",
    "adapter": "240911cda967ad2b619578e47988fa0913c7dec2d89679a5fa85c53452199659",
}
FIKSTURY: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {
    "so1a": (SCENARIUSZ_SO1A, NASTAWY_SO1A),
    "bieg_czasowy": (SCENARIUSZ_CZASOWY, NASTAWY_BIEGU),
    "adapter": (SCENARIUSZ_ADAPTERA, NASTAWY_ADAPTERA),
}


@pytest.mark.parametrize("nazwa", sorted(FIKSTURY))
def test_hash_istniejacego_scenariusza_bit_w_bit(nazwa: str) -> None:
    scenariusz, _ = FIKSTURY[nazwa]
    tresc = ScenariuszDynamiczny.model_validate(scenariusz).tresc()
    tekst = json.dumps(tresc, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    assert hashlib.sha256(tekst.encode("utf-8")).hexdigest() == HASHE_SCENARIUSZY[nazwa]
    assert set(tresc) == {"horyzont_s", "krok_wyjscia_s", "zdarzenia"}


@pytest.mark.parametrize("nazwa", sorted(FIKSTURY))
def test_hash_opcji_biegu_sprzed_karty_bez_zmian_po_odczycie_rodzaju(nazwa: str) -> None:
    scenariusz, nastawy = FIKSTURY[nazwa]
    opcje = {
        "pf_run_id": "00000000-0000-0000-0000-000000000001",
        "dynamika": copy.deepcopy(scenariusz),
        "nastawy_solvera": dict(nastawy),
    }
    assert waliduj_opcje_badania(opcje) == RODZAJ_SCENARIUSZ_SIECIOWY
    assert rodzaj_badania_biegu(opcje) == RODZAJ_SCENARIUSZ_SIECIOWY
    odcisk = _compute_input_hash(
        case_id="case-pin", analysis_type="dynamika_rms", enm_hash="sha256:pin", options=opcje
    )
    assert odcisk == HASHE_OPCJI_BIEGU[nazwa]
