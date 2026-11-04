"""Dane znamionowe rozdzielnicy sekcji GPZ (`GPZSection.rozdzielnica`) — karta GPZ-DANE-ANALIZ.

DLACZEGO. Sekcja szyn GPZ nie niosła żadnych danych znamionowych: wytrzymałość szyn zbiorczych
liczyła się wyłącznie z ręcznie wskazanej pozycji katalogu, klasyfikacji łukowej IAC nie było
gdzie wpisać, a łuk elektryczny brał geometrię jednym parametrem żądania dla WSZYSTKICH węzłów.
Blok `rozdzielnica` jest jednym nośnikiem tych danych, pisanym jedną operacją
(`update_gpz_section`) przez jedną bramę (`enm.rozdzielnica_gpz.waliduj_rozdzielnice`), z jednym
opisem pól (zakresy z podstawą), który czyta też model pydantic.

PRZYPIĘTE DEKLARACJE:
- `None` poza odciskiem: sekcje sprzed karty haszują jak przed nią (trzy hashe pełne +
  semantyczny i hash migawki), blok podany zmienia odcisk wejścia.
- Operacja scala z blokiem zastanym; `None` usuwa daną, `rozdzielnica: None` usuwa blok.
- Spójność I_p ≥ √2·I_k sprawdzana na bloku PO scaleniu (zmiana jednej liczby nie omija bramy).
- Opis pól (klucze, zakresy) = pola modelu pydantic = schemat OpenAPI (jedno źródło).
- Obie strony sekcji (SN i 110 kV) mają ten sam pisarz.
"""

from __future__ import annotations

import copy
import json
import math
from pathlib import Path
from typing import Any

import pytest
from analysis.arc_flash import ElectrodeConfig
from enm.domain_operations import POLA_EDYCJI_SEKCJI_GPZ, update_gpz_section
from enm.hash import (
    _POLA_ADDYTYWNE_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE,
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    GPZSection,
    RozdzielnicaSekcjiGpz,
    Substation,
)
from enm.rozdzielnica_gpz import (
    KLUCZE_ROZDZIELNICY,
    KOD_BLEDU_ROZDZIELNICY,
    KONFIGURACJE_ELEKTROD,
    KONSUMENCI_POL_ROZDZIELNICY,
    OPISY_POL_ROZDZIELNICY,
    eksport_parytetu_rozdzielnicy,
    waliduj_rozdzielnice,
)
from pydantic import ValidationError

_TABLICA_PARYTETU = (
    Path(__file__).resolve().parents[2] / "schemas" / "rozdzielnica_gpz_parytet_v1.json"
)

PELNY_BLOK: dict[str, Any] = {
    "u_r_kv": 17.5,
    "i_r_a": 1250.0,
    "i_k_ka": 25.0,
    "t_k_s": 1.0,
    "i_p_ka": 63.0,
    "iac_dostepnosc": "A",
    "iac_strony": "FLR",
    "iac_i_a_ka": 25.0,
    "iac_t_a_s": 1.0,
    "konfiguracja_elektrod": "VCB",
    "odstep_elektrod_mm": 152.0,
    "odleglosc_robocza_mm": 914.4,
    "szerokosc_obudowy_mm": 1143.0,
    "wysokosc_obudowy_mm": 762.0,
    "glebokosc_obudowy_mm": 762.0,
    "dokument_zrodlowy": "DTR rozdzielnicy RX-17,5",
}


def _enm(
    rozdzielnica_sn: RozdzielnicaSekcjiGpz | None = None,
    rozdzielnica_wn: RozdzielnicaSekcjiGpz | None = None,
) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="rozdzielnica-gpz"),
        buses=[
            Bus(ref_id="sn", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="wn", name="Szyna 110 kV", voltage_kv=110.0),
        ],
        substations=[
            Substation(
                ref_id="GPZ",
                name="GPZ",
                station_type="gpz",
                bus_refs=["sn", "wn"],
                gpz_sections=[
                    GPZSection(section_id="S1", order=1, bus_ref="sn", rozdzielnica=rozdzielnica_sn)
                ],
                gpz_hv_sections=[
                    GPZSection(section_id="W1", order=1, bus_ref="wn", rozdzielnica=rozdzielnica_wn)
                ],
            )
        ],
    )


def _migawka_sprzed_karty(enm: EnergyNetworkModel) -> dict[str, Any]:
    """Zrzut bez klucza `rozdzielnica` w sekcjach — postać zapisanych migawek sprzed karty."""
    dane = enm.model_dump(mode="json")
    for stacja in dane["substations"]:
        for lista, pola in _POLA_ADDYTYWNE_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE["substations"].items():
            for sekcja in stacja[lista]:
                for pole in pola:
                    sekcja.pop(pole, None)
    return dane


def _slownik(enm: EnergyNetworkModel) -> dict[str, Any]:
    return enm.model_dump(mode="json")


def _aktualizuj(
    enm: dict[str, Any], updates: dict[str, Any], *, side: str = "lv"
) -> dict[str, Any]:
    return update_gpz_section(
        enm,
        {
            "substation_ref": "GPZ",
            "section_id": "S1" if side == "lv" else "W1",
            "side": side,
            "updates": updates,
        },
    )


def _blok(odpowiedz: dict[str, Any], *, side: str = "lv") -> dict[str, Any] | None:
    lista = "gpz_sections" if side == "lv" else "gpz_hv_sections"
    (sekcja,) = odpowiedz["snapshot"]["substations"][0][lista]
    return sekcja.get("rozdzielnica")


# ---------------------------------------------------------------------------
# Odcisk modelu
# ---------------------------------------------------------------------------


def test_rejestr_zagniezdzony_nazywa_obie_strony_sekcji() -> None:
    assert _POLA_ADDYTYWNE_ZAGNIEZDZONE_POZA_HASHEM_GDY_NONE == {
        "substations": {"gpz_sections": ("rozdzielnica",), "gpz_hv_sections": ("rozdzielnica",)}
    }


def test_sekcja_bez_rozdzielnicy_haszuje_jak_przed_karta() -> None:
    enm = _enm()
    przed = _migawka_sprzed_karty(enm)
    assert compute_enm_hash(enm) == hash_migawki_enm(przed)
    assert hash_migawki_enm(enm.model_dump(mode="json")) == hash_migawki_enm(przed)
    odtworzony = EnergyNetworkModel.model_validate(przed)
    assert compute_input_hash(enm) == compute_input_hash(odtworzony)
    assert compute_semantic_hash(enm) == compute_semantic_hash(odtworzony)


@pytest.mark.parametrize("strona", ["SN", "WN"])
def test_podany_blok_zmienia_odcisk_wejscia(strona: str) -> None:
    blok = RozdzielnicaSekcjiGpz(u_r_kv=17.5 if strona == "SN" else 123.0, i_r_a=1250.0)
    bez = _enm()
    z_blokiem = _enm(**({"rozdzielnica_sn": blok} if strona == "SN" else {"rozdzielnica_wn": blok}))
    assert compute_input_hash(bez) != compute_input_hash(z_blokiem)
    assert compute_enm_hash(bez) != compute_enm_hash(z_blokiem)
    assert hash_migawki_enm(_slownik(bez)) != hash_migawki_enm(_slownik(z_blokiem))
    # Hash migawki pracuje na kopii — zrzut wołającego nietknięty (klucz `null` zostaje).
    migawka = _slownik(bez)
    hash_migawki_enm(migawka)
    assert "rozdzielnica" in migawka["substations"][0]["gpz_sections"][0]


def test_odcisk_deterministyczny_dla_tego_samego_bloku() -> None:
    a = _enm(rozdzielnica_sn=RozdzielnicaSekcjiGpz(**PELNY_BLOK))
    b = _enm(rozdzielnica_sn=RozdzielnicaSekcjiGpz(**dict(reversed(list(PELNY_BLOK.items())))))
    assert compute_enm_hash(a) == compute_enm_hash(b)
    assert compute_input_hash(a) == compute_input_hash(b)


# ---------------------------------------------------------------------------
# Jeden opis pól = model = OpenAPI
# ---------------------------------------------------------------------------


def test_klucze_opisu_sa_polami_modelu() -> None:
    assert set(KLUCZE_ROZDZIELNICY) == set(RozdzielnicaSekcjiGpz.model_fields)
    assert len(KLUCZE_ROZDZIELNICY) == len(set(KLUCZE_ROZDZIELNICY))


def test_konfiguracje_elektrod_sa_konfiguracjami_ieee_1584() -> None:
    assert set(KONFIGURACJE_ELEKTROD) == {c.value for c in ElectrodeConfig}


@pytest.mark.parametrize("opis", OPISY_POL_ROZDZIELNICY, ids=lambda o: o.klucz)
def test_zakres_modelu_jest_zakresem_opisu(opis: Any) -> None:
    """Granice domknięte: wartość graniczna przyjęta, tuż poza — odmowa modelu i bramy."""
    for wartosc in (opis.od, opis.do):
        RozdzielnicaSekcjiGpz(**{opis.klucz: wartosc})
        assert waliduj_rozdzielnice({opis.klucz: wartosc})[1] is None
    for wartosc in (opis.od * 0.999, opis.do * 1.001):
        with pytest.raises(ValidationError):
            RozdzielnicaSekcjiGpz(**{opis.klucz: wartosc})
        blok, blad = waliduj_rozdzielnice({opis.klucz: wartosc})
        assert blok is None and blad is not None
        assert opis.podstawa_zakresu_pl in blad


def test_tablica_parytetu_jest_eksportem_opisu() -> None:
    """Lustro frontendu (`ui/workspace/gpz/poleGpzDefinicje.ts`) czyta ten plik — plik musi być
    eksportem JEDNEGO opisu pól (regeneracja: `scripts/eksport_parytetu_rozdzielnicy_gpz.py`)."""
    assert json.loads(_TABLICA_PARYTETU.read_text(encoding="utf-8")) == (
        eksport_parytetu_rozdzielnicy()
    )


def test_tablica_parytetu_nazywa_klucze_modelu_i_pisarza() -> None:
    tablica = eksport_parytetu_rozdzielnicy()
    assert [p["klucz"] for p in tablica["pola"]] == list(KLUCZE_ROZDZIELNICY)
    assert set(KONSUMENCI_POL_ROZDZIELNICY) == set(KLUCZE_ROZDZIELNICY)
    assert all(KONSUMENCI_POL_ROZDZIELNICY[k] for k in KLUCZE_ROZDZIELNICY)
    # Pisarz z tablicy jest realną operacją z realnym polem edycji.
    assert tablica["operacja"] == update_gpz_section.__name__
    assert tablica["sciezka"] == "updates.rozdzielnica"
    assert "rozdzielnica" in GPZSection.model_fields
    assert tablica["kod_bledu"] == KOD_BLEDU_ROZDZIELNICY
    for pole in tablica["pola"]:
        if pole["rodzaj"] == "liczba":
            # Granice tablicy = granice pydantic (ten sam opis buduje `Field(ge, le)`).
            metadane = RozdzielnicaSekcjiGpz.model_fields[pole["klucz"]].metadata
            ge = next(m.ge for m in metadane if hasattr(m, "ge"))
            le = next(m.le for m in metadane if hasattr(m, "le"))
            assert (ge, le) == (pole["od"], pole["do"]), pole["klucz"]


# ---------------------------------------------------------------------------
# Brama: model i walidator
# ---------------------------------------------------------------------------


def test_model_odmawia_sprzecznych_pradow_szczytowego_i_krotkotrwalego() -> None:
    with pytest.raises(ValidationError, match="IEC 62271-1:2017 p. 5.7"):
        RozdzielnicaSekcjiGpz(i_k_ka=25.0, i_p_ka=25.0 * math.sqrt(2.0) * 0.99)
    RozdzielnicaSekcjiGpz(i_k_ka=25.0, i_p_ka=25.0 * math.sqrt(2.0) * 1.0001)


@pytest.mark.parametrize(
    ("klucz", "wartosc"),
    [
        ("konfiguracja_elektrod", "XYZ"),
        ("iac_dostepnosc", "D"),
        ("iac_strony", "RF"),
        ("iac_strony", ""),
        ("dokument_zrodlowy", "   "),
        ("u_r_kv", "17,5"),
        ("u_r_kv", True),
        ("u_r_kv", float("nan")),
        ("nieznany_klucz", 1.0),
    ],
)
def test_brama_odmawia_wartosci_spoza_slownika(klucz: str, wartosc: object) -> None:
    blok, blad = waliduj_rozdzielnice({klucz: wartosc})
    assert blok is None
    assert blad is not None and blad.strip()


def test_brama_normalizuje_blok() -> None:
    blok, blad = waliduj_rozdzielnice(
        {"u_r_kv": 24, "dokument_zrodlowy": "  DTR  ", "i_r_a": None, "iac_strony": "FL"}
    )
    assert blad is None
    assert blok == {"dokument_zrodlowy": "DTR", "iac_strony": "FL", "u_r_kv": 24.0}
    assert list(blok) == sorted(blok)
    assert waliduj_rozdzielnice({"u_r_kv": None}) == (None, None)
    assert waliduj_rozdzielnice(None) == (None, None)
    assert waliduj_rozdzielnice([1, 2])[1] is not None


# ---------------------------------------------------------------------------
# Operacja `update_gpz_section`
# ---------------------------------------------------------------------------


def test_pole_rozdzielnica_jest_polem_edycji_sekcji() -> None:
    assert "rozdzielnica" in POLA_EDYCJI_SEKCJI_GPZ


@pytest.mark.parametrize("side", ["lv", "hv"])
def test_operacja_zapisuje_pelny_blok_po_obu_stronach(side: str) -> None:
    blok = dict(PELNY_BLOK)
    if side == "hv":
        blok["u_r_kv"] = 123.0
    odpowiedz = _aktualizuj(_slownik(_enm()), {"rozdzielnica": blok}, side=side)
    assert odpowiedz.get("error") is None, odpowiedz.get("error")
    assert _blok(odpowiedz, side=side) == {k: blok[k] for k in sorted(blok)}
    # Wynik operacji jest poprawnym modelem (ta sama brama pydantic czyta blok).
    EnergyNetworkModel.model_validate(odpowiedz["snapshot"])


def test_operacja_scala_z_blokiem_zastanym_i_usuwa_dane_none() -> None:
    pierwsza = _aktualizuj(
        _slownik(_enm()), {"rozdzielnica": {"u_r_kv": 17.5, "i_k_ka": 20.0, "i_p_ka": 50.0}}
    )
    druga = _aktualizuj(pierwsza["snapshot"], {"rozdzielnica": {"i_r_a": 630, "i_p_ka": None}})
    assert druga.get("error") is None
    assert _blok(druga) == {"i_k_ka": 20.0, "i_r_a": 630.0, "u_r_kv": 17.5}
    # Usunięcie WSZYSTKICH danych = brak bloku (nie pusty słownik).
    trzecia = _aktualizuj(
        druga["snapshot"], {"rozdzielnica": {"i_k_ka": None, "i_r_a": None, "u_r_kv": None}}
    )
    assert _blok(trzecia) is None
    assert "rozdzielnica" not in trzecia["snapshot"]["substations"][0]["gpz_sections"][0]


def test_operacja_usuwa_blok_wartoscia_none() -> None:
    pierwsza = _aktualizuj(_slownik(_enm()), {"rozdzielnica": {"u_r_kv": 17.5}})
    druga = _aktualizuj(pierwsza["snapshot"], {"rozdzielnica": None})
    assert druga.get("error") is None
    assert _blok(druga) is None
    # Po usunięciu bloku odcisk wraca do odcisku sekcji bez danych (sprzed karty).
    assert hash_migawki_enm(druga["snapshot"]) == hash_migawki_enm(_slownik(_enm()))


def test_spojnosc_sprawdzana_na_bloku_po_scaleniu() -> None:
    """Zmiana samej I_k, która z zastaną I_p daje sprzeczność, nie przechodzi bramy."""
    pierwsza = _aktualizuj(_slownik(_enm()), {"rozdzielnica": {"i_k_ka": 20.0, "i_p_ka": 50.0}})
    druga = _aktualizuj(pierwsza["snapshot"], {"rozdzielnica": {"i_k_ka": 40.0}})
    assert druga.get("error_code") == KOD_BLEDU_ROZDZIELNICY
    assert "IEC 62271-1:2017 p. 5.7" in str(druga.get("error"))


@pytest.mark.parametrize(
    "zmiana",
    [
        {"u_r_kv": 0.5},
        {"konfiguracja_elektrod": "XYZ"},
        {"klucz_spoza_bloku": 1.0},
        [17.5],
        "17,5 kV",
    ],
)
def test_operacja_odmawia_bloku_spoza_bramy(zmiana: object) -> None:
    enm = _slownik(_enm())
    przed = copy.deepcopy(enm)
    odpowiedz = _aktualizuj(enm, {"rozdzielnica": zmiana})
    assert odpowiedz.get("error_code") == KOD_BLEDU_ROZDZIELNICY
    # Odmowa nie zostawia skutku: model wejściowy nietknięty.
    assert enm == przed
