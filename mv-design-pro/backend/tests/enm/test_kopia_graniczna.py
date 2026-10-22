"""Kopia graniczna ENM — równoważność z `copy.deepcopy` i izolacja (karta S9-9).

DŁUG, KTÓRY TO ZAMYKA. Kontrakt TOPO-COPY (V12K-323) nazwał pojęcie „kopia na
GRANICY operacji domenowej", ale implementacji nie miało: granica była rozsiana
po 50 miejscach jako gołe `copy.deepcopy(enm)`. Karta S9-9 zmierzyła, że ta kopia
to ~30 % kosztu `POST /station-templates/{id}/apply` na sieci 100 stacji, i dała
pojęciu JEDNĄ implementację (`enm/kopia_graniczna.py`), tańszą dla dokumentu
JSON-owego.

DEKLARACJA BEZ TESTU = FAŁSZYWA PEWNOŚĆ (reguła KLASA §4). Moduł deklaruje trzy
mocne zdania i każde z nich jest tu przypięte:

1. `TestRownowaznoscZDeepcopy` — wynik jest RÓWNY wynikowi `copy.deepcopy`.
   Sprawdzane na ILOCZYNIE CECH kształtów dokumentu (zagnieżdżenie × typ liścia ×
   pusty/niepusty × wartość spoza JSON), nie na jednym przykładzie, ORAZ na
   REALNYM modelu ENM zbudowanym operacjami domenowymi.
2. `TestIzolacjaKopii` — kopia jest niezależna w OBIE strony: mutacja kopii nie
   sięga oryginału i mutacja oryginału nie sięga kopii; żaden słownik ani lista
   nie są współdzielone (sprawdzane tożsamością obiektów w głąb).
3. `TestKandydatRewizjiWMagazynie` — kandydat hasza z kopii SAMEGO NAGŁÓWKA nie
   zostawia śladu na modelu wołającego, sprawdzone PRZEZ `set_enm` (właściwa
   ścieżka), oraz `TestKandydatRewizji` — ten sam hasz co przy kopii głębokiej.
   Kolejność jest wnioskiem z iniekcji: sprawdzenie na samym wyrażeniu NIE
   wykrywało współdzielenia nagłówka, dopiero sprawdzenie na `set_enm` je łapie.
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from enm.hash import compute_enm_hash
from enm.kopia_graniczna import kopia_graniczna_enm
from enm.models import EnergyNetworkModel

# ---------------------------------------------------------------------------
# ILOCZYN CECH: kształt dokumentu × typ liścia × pusty/niepusty
#
# Kształty są WARTOŚCIAMI wewnątrz dokumentu (kopia graniczna przyjmuje DOKUMENT,
# czyli słownik — tak wygląda każde z 50 wywołań), więc do sprawdzenia wchodzą
# opakowane w `{"korzen": ...}`. Rekurencja i tak przechodzi przez każdy kształt.
# ---------------------------------------------------------------------------

_KSZTALTY: list[tuple[str, Any]] = [
    ("pusty słownik", {}),
    ("pusta lista", []),
    ("liść tekstowy", {"a": "x"}),
    ("liść całkowity", {"a": 1}),
    ("liść zmiennoprzecinkowy", {"a": 1.5}),
    ("liść logiczny", {"a": True}),
    ("liść pusty", {"a": None}),
    ("lista liści", {"a": [1, "x", None, False, 2.5]}),
    ("zagnieżdżenie 3 poziomy", {"a": {"b": {"c": [1, {"d": "x"}]}}}),
    ("lista list", {"a": [[1, 2], [], [{"b": 3}]]}),
    ("słownik w liście w słowniku", {"a": [{"b": [{"c": {}}]}]}),
    ("klucz niebędący identyfikatorem", {"a b": {"1": [None]}}),
    # Wartości SPOZA dokumentu JSON — droga awaryjna przez `copy.deepcopy`.
    ("wartość spoza JSON: datetime", {"a": datetime(2026, 8, 6, tzinfo=UTC)}),
    ("wartość spoza JSON: Decimal", {"a": Decimal("1.25")}),
    ("wartość spoza JSON: krotka", {"a": (1, 2)}),
    ("wartość spoza JSON: zbiór", {"a": {1, 2}}),
    ("wartość spoza JSON zagnieżdżona", {"a": [{"b": Decimal("0.1")}]}),
]


def _wspoldzielone_pojemniki(a: Any, b: Any, sciezka: str = "") -> list[str]:
    """Ścieżki, na których `a` i `b` wskazują TEN SAM słownik/listę."""
    znalezione: list[str] = []
    if isinstance(a, dict) and isinstance(b, dict):
        if a is b:
            znalezione.append(sciezka or "<korzeń>")
            return znalezione
        for klucz in a:
            znalezione += _wspoldzielone_pojemniki(a[klucz], b[klucz], f"{sciezka}.{klucz}")
    elif isinstance(a, list) and isinstance(b, list):
        if a is b:
            znalezione.append(sciezka or "<korzeń>")
            return znalezione
        for i, (x, y) in enumerate(zip(a, b, strict=True)):
            znalezione += _wspoldzielone_pojemniki(x, y, f"{sciezka}[{i}]")
    return znalezione


def _realny_enm() -> dict[str, Any]:
    """Realny model ENM (GPZ + magistrala + stacja) zbudowany operacjami domenowymi."""
    from enm.domain_operations import execute_domain_operation

    from tests.reference_networks.sld_substrate_52s import (
        _CABLE_REF,
        _GPZ_SOURCE_REF,
        _TRAFO_STANDARD,
        _empty_enm,
    )

    def op(enm: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
        wynik = execute_domain_operation(enm, nazwa, payload)
        assert wynik.get("error") is None, wynik.get("error")
        return wynik["snapshot"]

    enm = op(
        _empty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ pomiarowy",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _GPZ_SOURCE_REF,
        },
    )
    enm = op(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 250,
                "name": "Magistrala 1",
                "catalog_ref": _CABLE_REF,
            }
        },
    )
    segment = next(
        b["ref_id"] for b in enm["branches"] if b.get("type") in ("cable", "line_overhead")
    )
    return op(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment,
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "B",
                "station_name": "Stacja pomiarowa",
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {"create": True, "transformer_catalog_ref": _TRAFO_STANDARD},
            "nn_block": {"outgoing_feeders_nn_count": 2},
        },
    )


class TestRownowaznoscZDeepcopy:
    """Deklaracja 1: wynik jest RÓWNY wynikowi `copy.deepcopy`."""

    @pytest.mark.parametrize(("nazwa", "wartosc"), _KSZTALTY, ids=[k[0] for k in _KSZTALTY])
    def test_rownosc_na_iloczynie_ksztaltow(self, nazwa: str, wartosc: Any) -> None:
        dokument = {"korzen": wartosc}
        assert kopia_graniczna_enm(dokument) == copy.deepcopy(dokument), nazwa

    def test_rownosc_na_realnym_modelu(self) -> None:
        enm = _realny_enm()
        assert kopia_graniczna_enm(enm) == copy.deepcopy(enm)

    def test_rownosc_z_oryginalem(self) -> None:
        """Kopia jest równa wejściu — kopiowanie nie jest transformacją."""
        enm = _realny_enm()
        assert kopia_graniczna_enm(enm) == enm

    def test_powtorzona_kopia_jest_identyczna(self) -> None:
        """Determinizm: dwie kopie tego samego wejścia są równe."""
        enm = _realny_enm()
        assert kopia_graniczna_enm(enm) == kopia_graniczna_enm(enm)


class TestIzolacjaKopii:
    """Deklaracja 2: kopia niezależna w OBIE strony, zero współdzielonych pojemników."""

    def test_zaden_pojemnik_nie_jest_wspoldzielony(self) -> None:
        enm = _realny_enm()
        wspolne = _wspoldzielone_pojemniki(enm, kopia_graniczna_enm(enm))
        assert wspolne == [], f"Współdzielone pojemniki: {wspolne[:5]}"

    def test_mutacja_kopii_nie_siega_oryginalu(self) -> None:
        enm = _realny_enm()
        kopia = kopia_graniczna_enm(enm)
        liczba_szyn = len(enm["buses"])
        kopia["buses"].append({"ref_id": "wstrzyknieta"})
        kopia["buses"][0]["voltage_kv"] = 999.0
        kopia["header"]["revision"] = 4242
        assert len(enm["buses"]) == liczba_szyn
        assert enm["buses"][0].get("voltage_kv") != 999.0
        assert enm["header"]["revision"] != 4242

    def test_mutacja_oryginalu_nie_siega_kopii(self) -> None:
        enm = _realny_enm()
        kopia = kopia_graniczna_enm(enm)
        liczba_szyn = len(kopia["buses"])
        enm["buses"].append({"ref_id": "wstrzyknieta"})
        enm["buses"][0]["voltage_kv"] = 999.0
        assert len(kopia["buses"]) == liczba_szyn
        assert kopia["buses"][0].get("voltage_kv") != 999.0

    @pytest.mark.parametrize(("nazwa", "wartosc"), _KSZTALTY, ids=[k[0] for k in _KSZTALTY])
    def test_izolacja_na_iloczynie_ksztaltow(self, nazwa: str, wartosc: Any) -> None:
        """Ten sam warunek izolacji, co dla `copy.deepcopy`, na każdym kształcie."""
        dokument = {"korzen": wartosc}
        kopia = kopia_graniczna_enm(dokument)
        wzorzec = copy.deepcopy(dokument)
        assert _wspoldzielone_pojemniki(dokument, kopia) == _wspoldzielone_pojemniki(
            dokument, wzorzec
        ), nazwa


class TestKandydatRewizjiWMagazynie:
    """Deklaracja 3 NA WŁAŚCIWEJ ŚCIEŻCE — przez `set_enm`, nie na wyrażeniu.

    DLACZEGO OSOBNA KLASA. Pierwsza wersja tego pliku pinowała samo WYRAŻENIE
    kopii nagłówka (`TestKandydatRewizji` niżej). Iniekcja „kandydat współdzieli
    nagłówek z modelem wołającego" NIE ZAŚWIECIŁA na czerwono całego katalogu
    `tests/enm/` — bo test sprawdzał kod, który sam sobie napisał, a nie punkt,
    w którym magazyn go używa. Test pilnujący konstrukcji zamiast zachowania to
    fałszywa pewność (reguła KLASA §4), więc kontrolę przeniesiono na `set_enm`.

    ŚCIEŻKA, KTÓRA NIESIE SKUTEK: gdy zapisywana treść jest IDENTYCZNA z zapisaną,
    `_set_enm_pod_blokada` porównuje hasze i wychodzi wcześniej (`return existing`).
    Gdy kandydat współdzieli nagłówek z modelem wołającego, ustawienie rewizji
    kandydata przepisuje rewizję TEGO modelu — i tej zmiany nic już nie nadpisuje,
    bo funkcja kończy się przed podniesieniem rewizji. Wołający dostaje po cichu
    zmodyfikowany obiekt.
    """

    @pytest.fixture(autouse=True)
    def _magazyn_tymczasowy(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> Any:
        from enm.store import reset_enm_store

        monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path / "enm_store"))
        reset_enm_store()
        yield
        reset_enm_store()

    def test_zapis_identycznej_tresci_nie_rusza_modelu_wolajacego(self) -> None:
        from enm.store import get_enm, set_enm

        case_id = "s99-kandydat-rewizji"
        set_enm(case_id, EnergyNetworkModel.model_validate(_realny_enm()))
        zapisany = get_enm(case_id)

        # Ta sama TREŚĆ, inna deklarowana rewizja — wołający trzyma swój obiekt.
        wejscie = zapisany.model_copy(deep=True)
        wejscie.header.revision = 4242

        wynik = set_enm(case_id, wejscie)

        # Ścieżka „treść bez zmian": magazyn oddaje model ZAPISANY, a model
        # wołającego zostaje NIETKNIĘTY — łącznie z jego rewizją.
        assert wynik.header.hash_sha256 == zapisany.header.hash_sha256
        assert wejscie.header.revision == 4242


class TestKandydatRewizji:
    """Deklaracja 3 (`enm/store.py`) na poziomie samego wyrażenia kopii."""

    def test_hasz_kandydata_jak_przy_kopii_glebokiej(self) -> None:
        model = EnergyNetworkModel.model_validate(_realny_enm())

        gleboki = model.model_copy(deep=True)
        gleboki.header.revision = 7
        plytki = model.model_copy(update={"header": model.header.model_copy(deep=True)})
        plytki.header.revision = 7

        assert compute_enm_hash(plytki) == compute_enm_hash(gleboki)

    def test_kandydat_nie_zostawia_sladu_na_modelu(self) -> None:
        model = EnergyNetworkModel.model_validate(_realny_enm())
        rewizja_przed = model.header.revision

        kandydat = model.model_copy(update={"header": model.header.model_copy(deep=True)})
        kandydat.header.revision = rewizja_przed + 100

        assert model.header.revision == rewizja_przed
