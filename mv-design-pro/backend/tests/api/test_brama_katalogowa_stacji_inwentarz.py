"""Brama katalogowa operacji stacyjnych — PEŁNY INWENTARZ referencji (defekt F).

Defekt (przegląd fali audytu 2026-08-01, klaster F; znaleziska P11 i N4): karta A
ogłosiła „bramę katalogową stacji", ale `extract_catalog_binding` dla operacji
stacyjnych czytał WYŁĄCZNIE referencję transformatora. Elementy powstające w TEJ
SAMEJ funkcji domenowej były poza bramą:

* źródło OZE nN (`nn_block.source_converter_catalog_ref`) — generator dostawał
  `parameter_source: CATALOG` / `source_mode: KATALOG` przy tabliczce sklejonej
  z payloadu, a jego `p_mw` wchodziło WPROST do bilansu rozpływu (zmierzone:
  9,9 MW generacji na szynie nN 0,4 kV za transformatorem 630 kVA);
* aparat pola SN (`sn_fields[].apparatus_catalog_ref` /
  `field_apparatus_catalog_ref`) — model zapisywał jako FAKT zdanie „aparat
  z pozycji katalogu APARAT_SN: X" dla pozycji, której w katalogu NIE MA;
* urządzenie zabezpieczeniowe źródła nN
  (`nn_block.source_protection.device_catalog_ref`) — martwa referencja
  w `protection_assignments`.

Pilnowane własności:
(a) PARYTET DLA KAŻDEJ referencji z inwentarza: literówka → 422
    `catalog.item_not_found` w torze payloadu (brama API) ORAZ ten sam kod
    w torze domenowym (operacja wołana z pominięciem bramy API);
(b) FIZYKA Z KATALOGU: po udanej materializacji tabliczka źródła nN pochodzi
    z pozycji katalogowej, a nie z payloadu (wartość katalogowa wygrywa);
(c) KLASA: skan obu operacji stacyjnych — żadna referencja katalogowa czytana
    z payloadu nie omija inwentarza bramy (asercja na LIŚCIE kluczy, nie na
    pojedynczym przypadku).
"""

from __future__ import annotations

import ast
import copy
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest
from api.domain_ops_policy import (
    STATION_CATALOG_BINDING_KEYS,
    STATION_CATALOG_REF_INVENTORY,
    STATION_CATALOG_REF_PAYLOAD_KEYS,
    validate_and_materialize_catalog_binding,
)
from api.main import app
from enm import domain_operations
from enm.domain_operations import execute_domain_operation
from enm.dziennik_zmian import wyczysc_dziennik
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store
from fastapi.testclient import TestClient
from network_model.catalog.types import CatalogNamespace

REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"
REF_TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
REF_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
REF_CT = "ct_400_5_5p20_15va_abb"
REF_VT = "vt_15kv_100v_3p_abb"
REF_PRZEKAZNIK = "ACME_REX100_v1"
REF_ZABEZPIECZENIE_ZRODLA = "EM_ETANGO_400_V0"
# Falownik PV nN: 0,4 kV, Pmax 500 kW, Sn 550 kVA (rzeczywista pozycja katalogu).
REF_FALOWNIK_PV = "conv-pv-nn-0p5mw-0p4kv"
FALOWNIK_PV_PMAX_MW = 0.5
FALOWNIK_PV_SN_MVA = 0.55

LITEROWKA = "-literowka-ktorej-nie-ma"

OPERACJE_STACYJNE = ("append_station_on_endpoint", "insert_station_on_segment_sn")


# ---------------------------------------------------------------------------
# Budowa modelu i payloadów
# ---------------------------------------------------------------------------


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="brama_inwentarz", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _wykonaj(snapshot: dict[str, Any], nazwa: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(snapshot, nazwa, payload)
    assert not wynik.get("error"), f"{nazwa}: {wynik.get('error')} ({wynik.get('error_code')})"
    return wynik["snapshot"]


def _ciag_sn() -> tuple[dict[str, Any], str, str]:
    """GPZ + odcinek kablowy 500 m. Zwraca (migawka, ref_szyny_koncowej, ref_odcinka)."""
    snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
    )
    snapshot = _wykonaj(
        snapshot,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}},
    )
    odcinek = snapshot["branches"][-1]
    return snapshot, str(odcinek["to_bus_ref"]), str(odcinek["ref_id"])


def _blok_stacji() -> dict[str, Any]:
    """Wspólna część payloadu obu operacji stacyjnych — KOMPLET referencji katalogowych."""
    return {
        "sn_fields": [
            {
                "field_role": "LINIA_IN",
                "apparatus_catalog_ref": REF_APARAT_SN,
                "equipment": {
                    "ct": {
                        "catalog_ref": REF_CT,
                        "ratio_primary_a": 400.0,
                        "ratio_secondary_a": 5.0,
                    },
                    "vt": {
                        "catalog_ref": REF_VT,
                        "ratio_primary_v": 15000.0,
                        "ratio_secondary_v": 100.0,
                    },
                    "relay": {"catalog_ref": REF_PRZEKAZNIK, "relay_type": "NADPRADOWY"},
                },
            },
            {"field_role": "TRANSFORMATOROWE", "apparatus_catalog_ref": REF_APARAT_SN},
        ],
        "field_apparatus_catalog_ref": REF_APARAT_SN,
        "transformer": {"create": True, "transformer_catalog_ref": REF_TRAFO},
        "nn_block": {
            "nn_configuration": "PV_INVERTER",
            "source_converter_catalog_ref": REF_FALOWNIK_PV,
            "source_converter_name": "Falownik PV stacji",
            "source_converter_kind": "PV",
            # Tabliczka w payloadzie CELOWO sprzeczna z katalogiem (0,5 MW / 0,55 MVA):
            # po naprawie wygrywa katalog, payload nie może wstrzyknąć mocy do rozpływu.
            "source_converter_un_kv": 0.4,
            "source_converter_sn_mva": 9.9,
            "source_converter_pmax_mw": 9.9,
            "outgoing_feeders_nn_count": 1,
            "source_protection": {
                "device_catalog_ref": REF_ZABEZPIECZENIE_ZRODLA,
                "device_label": "Elektrometal e2TANGO-400",
                "protected_object": "falownik PV i kabel nN",
                "analysis_scope": "nadprądowe",
            },
        },
    }


def _payload(operacja: str, *, endpoint_bus_ref: str, segment_ref: str) -> dict[str, Any]:
    wspolne = _blok_stacji()
    if operacja == "append_station_on_endpoint":
        return {
            "endpoint_bus_ref": endpoint_bus_ref,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            **wspolne,
        }
    return {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": "Stacja w odcinku",
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        **wspolne,
    }


# ---------------------------------------------------------------------------
# Inwentarz iniekcji: JEDNA pozycja = JEDNA referencja katalogowa z bramy
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PozycjaInwentarza:
    """Referencja z inwentarza bramy + sposób wstrzyknięcia w nią literówki."""

    sciezka: str
    zepsuj: Callable[[dict[str, Any]], None]
    operacje: tuple[str, ...] = OPERACJE_STACYJNE


def _zepsuj_transformer_catalog_ref(payload: dict[str, Any]) -> None:
    payload["transformer"]["transformer_catalog_ref"] = REF_TRAFO + LITEROWKA


def _zepsuj_transformer_catalog_ref_alias(payload: dict[str, Any]) -> None:
    # Wariant `catalog_ref` czyta WYŁĄCZNIE `append_station_on_endpoint`
    # (`insert_station_on_segment_sn` wymaga `transformer_catalog_ref`) — brama
    # jest lustrem tej asymetrii, więc pozycja obowiązuje tylko w torze append.
    payload["transformer"].pop("transformer_catalog_ref", None)
    payload["transformer"]["catalog_ref"] = REF_TRAFO + LITEROWKA


def _zepsuj_aparat_pola(payload: dict[str, Any]) -> None:
    # Referencja POLA wygrywa nad wspólną — wspólna zostaje poprawna, żeby test
    # dowodził bramkowania właśnie referencji per pole.
    payload["sn_fields"][0]["apparatus_catalog_ref"] = REF_APARAT_SN + LITEROWKA


def _zepsuj_aparat_wspolny(payload: dict[str, Any]) -> None:
    for pole in payload["sn_fields"]:
        pole.pop("apparatus_catalog_ref", None)
    payload["field_apparatus_catalog_ref"] = REF_APARAT_SN + LITEROWKA


def _zepsuj_ct(payload: dict[str, Any]) -> None:
    payload["sn_fields"][0]["equipment"]["ct"]["catalog_ref"] = REF_CT + LITEROWKA


def _zepsuj_vt(payload: dict[str, Any]) -> None:
    payload["sn_fields"][0]["equipment"]["vt"]["catalog_ref"] = REF_VT + LITEROWKA


def _zepsuj_przekaznik(payload: dict[str, Any]) -> None:
    payload["sn_fields"][0]["equipment"]["relay"]["catalog_ref"] = REF_PRZEKAZNIK + LITEROWKA


def _zepsuj_falownik(payload: dict[str, Any]) -> None:
    payload["nn_block"]["source_converter_catalog_ref"] = REF_FALOWNIK_PV + LITEROWKA


def _zepsuj_zabezpieczenie_zrodla(payload: dict[str, Any]) -> None:
    payload["nn_block"]["source_protection"]["device_catalog_ref"] = (
        REF_ZABEZPIECZENIE_ZRODLA + LITEROWKA
    )


INIEKCJE: tuple[PozycjaInwentarza, ...] = (
    PozycjaInwentarza("transformer.transformer_catalog_ref", _zepsuj_transformer_catalog_ref),
    PozycjaInwentarza(
        "transformer.catalog_ref",
        _zepsuj_transformer_catalog_ref_alias,
        ("append_station_on_endpoint",),
    ),
    PozycjaInwentarza("sn_fields[].apparatus_catalog_ref", _zepsuj_aparat_pola),
    PozycjaInwentarza("field_apparatus_catalog_ref", _zepsuj_aparat_wspolny),
    PozycjaInwentarza("sn_fields[].equipment.ct", _zepsuj_ct),
    PozycjaInwentarza("sn_fields[].equipment.vt", _zepsuj_vt),
    PozycjaInwentarza("sn_fields[].equipment.relay", _zepsuj_przekaznik),
    PozycjaInwentarza("nn_block.source_converter_catalog_ref", _zepsuj_falownik),
    PozycjaInwentarza(
        "nn_block.source_protection.device_catalog_ref", _zepsuj_zabezpieczenie_zrodla
    ),
)

PRZYPADKI = [
    pytest.param(pozycja, operacja, id=f"{pozycja.sciezka}|{operacja}")
    for pozycja in INIEKCJE
    for operacja in pozycja.operacje
]


@pytest.fixture()
def klient(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    yield TestClient(app)
    reset_enm_store()
    wyczysc_dziennik()


# ---------------------------------------------------------------------------
# (c) KLASA — inwentarz jest kompletny i w całości bramkowany
# ---------------------------------------------------------------------------


def test_iniekcje_pokrywaja_caly_inwentarz_bramy() -> None:
    """Asercja NA LIŚCIE: każda pozycja inwentarza ma swój przypadek iniekcji."""
    z_inwentarza = {sciezka for sciezka, _ in STATION_CATALOG_REF_INVENTORY}
    z_testu = {pozycja.sciezka for pozycja in INIEKCJE}
    assert z_testu == z_inwentarza, (
        "Inwentarz bramy stacyjnej i przypadki testowe rozjechały się — "
        f"bez pokrycia: {sorted(z_inwentarza - z_testu)}; "
        f"nadmiarowe: {sorted(z_testu - z_inwentarza)}"
    )


def test_operacje_stacyjne_nie_czytaja_referencji_spoza_inwentarza() -> None:
    """Skan klasy: żadna referencja katalogowa operacji stacyjnych nie omija bramy.

    Skanujemy DRZEWO SKŁADNIOWE obu operacji stacyjnych i współdzielonych przez nie
    materializatorów. Każdy literał kończący się na `catalog_ref` jest kluczem
    payloadu albo polem zapisywanym do migawki — musi być w inwentarzu bramy.
    Dopisanie operacji stacyjnej czytającej NOWĄ referencję (np. ogranicznik
    przepięć pola) zapali ten test, zanim referencja trafi do modelu bez kontroli.
    """
    zrodlo = Path(inspect.getfile(domain_operations)).read_text(encoding="utf-8")
    drzewo = ast.parse(zrodlo)

    skanowane = {
        "insert_station_on_segment_sn",
        "append_station_on_endpoint",
        "_materialize_nn_source",
        "_materialize_sn_field_apparatus_catalog",
        "_sn_field_apparatus_catalog_ref",
        "_payload_field_apparatus_catalog_ref",
        "_build_nn_field_specs",
        "_materialize_station_auxiliary_load",
    }
    wezly = [
        wezel
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.FunctionDef) and wezel.name in skanowane
    ]
    znalezione_funkcje = {wezel.name for wezel in wezly}
    assert znalezione_funkcje == skanowane, (
        "Skan klasy stracił kotwicę — brak funkcji: " f"{sorted(skanowane - znalezione_funkcje)}"
    )

    referencje: set[str] = set()
    wiazania: set[str] = set()
    for wezel in wezly:
        for potomek in ast.walk(wezel):
            if isinstance(potomek, ast.Constant) and isinstance(potomek.value, str):
                if potomek.value.endswith("catalog_ref"):
                    referencje.add(potomek.value)
                elif potomek.value.startswith("catalog_binding") or potomek.value in {
                    "catalog_item_id"
                }:
                    wiazania.add(potomek.value)

    # Wiązanie katalogowe to DRUGA droga wskazania pozycji — bez tej połowy skanu
    # dałoby się obejść bramę, podając `catalog_binding` zamiast `catalog_ref`.
    wiazania_poza = wiazania - STATION_CATALOG_BINDING_KEYS
    assert not wiazania_poza, (
        "Operacja stacyjna czyta wiązanie katalogowe spoza dopuszczonego zbioru: "
        f"{sorted(wiazania_poza)}."
    )

    poza_inwentarzem = referencje - STATION_CATALOG_REF_PAYLOAD_KEYS
    assert not poza_inwentarzem, (
        "Operacja stacyjna czyta/zapisuje referencję katalogową spoza inwentarza "
        f"bramy: {sorted(poza_inwentarzem)}. Dopisz ją do "
        "STATION_CATALOG_REF_INVENTORY i obejmij bramą."
    )
    # Kontrola żywotności skanu: inwentarz nie może być martwą literą.
    assert "source_converter_catalog_ref" in referencje
    assert "apparatus_catalog_ref" in referencje


def test_mapa_konfiguracji_zrodla_nn_bramy_jest_lustrem_mapy_domenowej() -> None:
    """Brama API i operacja domenowa muszą znać TE SAME technologie źródła nN.

    Brama nie może importować mapy domenowej (warstwy), więc trzyma własną —
    ten test pilnuje, żeby obie nie rozjechały się w ciszy. Rozjazd oznaczałby
    technologię przyjmowaną przez domenę, a niebramkowaną przez API (albo
    odwrotnie: bramę odrzucającą coś, czego domena i tak nie tworzy).
    """
    from api.domain_ops_policy import _NN_SOURCE_TECHNOLOGY, _converter_namespace
    from enm.domain_operations import _NN_SOURCE_KIND_MAP

    assert set(_NN_SOURCE_TECHNOLOGY) == set(_NN_SOURCE_KIND_MAP), (
        "Konfiguracje bloku nN rozjechały się: brama "
        f"{sorted(_NN_SOURCE_TECHNOLOGY)}, domena {sorted(_NN_SOURCE_KIND_MAP)}"
    )
    for konfiguracja, technologia in _NN_SOURCE_TECHNOLOGY.items():
        przestrzen_bramy = _converter_namespace({"source_technology": technologia})
        przestrzen_domeny = _NN_SOURCE_KIND_MAP[konfiguracja][2]
        assert przestrzen_bramy == przestrzen_domeny, (
            f"{konfiguracja}: brama sprawdza katalog {przestrzen_bramy}, "
            f"a domena materializuje z {przestrzen_domeny}"
        )
        # Przestrzeń musi istnieć w kanonie — inaczej materializacja jest fikcją.
        assert przestrzen_domeny in {ns.value for ns in CatalogNamespace}


# ---------------------------------------------------------------------------
# (a) PARYTET — literówka odrzucona w OBU torach
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("pozycja", "operacja"), PRZYPADKI)
def test_literowka_odrzucona_w_torze_payloadu(
    klient: TestClient,
    pozycja: PozycjaInwentarza,
    operacja: str,
) -> None:
    """Tor payloadu (brama API): 422 `catalog.item_not_found` dla KAŻDEJ referencji."""
    snapshot, endpoint_bus_ref, segment_ref = _ciag_sn()
    case_id = f"tor-payload-{abs(hash((pozycja.sciezka, operacja)))}"
    klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_grid_source_sn",
                "payload": {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
            }
        },
    )
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "continue_trunk_segment_sn",
                "payload": {
                    "segment": {
                        "rodzaj": "KABEL",
                        "dlugosc_m": 500.0,
                        "catalog_ref": REF_KABEL,
                    }
                },
            }
        },
    )
    assert odp.status_code == 200, odp.text
    odcinek = odp.json()["snapshot"]["branches"][-1]

    payload = _payload(
        operacja,
        endpoint_bus_ref=str(odcinek["to_bus_ref"]),
        segment_ref=str(odcinek["ref_id"]),
    )
    pozycja.zepsuj(payload)

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": operacja, "payload": payload}},
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    szczegol = odpowiedz.json()["detail"]
    assert szczegol["code"] == "catalog.item_not_found", szczegol
    assert "Nie znaleziono rekordu katalogu" in szczegol["message_pl"]
    # Model NIE został zmieniony — brama stoi PRZED wykonaniem operacji.
    migawka = klient.get(f"/api/cases/{case_id}/enm").json()
    assert migawka["substations"] == [] or all(
        stacja.get("station_type") == "gpz" for stacja in migawka["substations"]
    )
    assert snapshot is not None  # migawka referencyjna zbudowana bez bramy — kontrola spójności


@pytest.mark.parametrize(("pozycja", "operacja"), PRZYPADKI)
def test_literowka_odrzucona_w_torze_domenowym(
    pozycja: PozycjaInwentarza,
    operacja: str,
) -> None:
    """Tor domenowy (operacja wołana z pominięciem bramy API): ten sam kod błędu.

    Bez tej połowy parytetu brama API byłaby jedyną linią obrony, a operacja
    domenowa nadal wpisywałaby do modelu nieistniejącą pozycję katalogową.
    """
    snapshot, endpoint_bus_ref, segment_ref = _ciag_sn()
    payload = _payload(operacja, endpoint_bus_ref=endpoint_bus_ref, segment_ref=segment_ref)
    pozycja.zepsuj(payload)

    wynik = execute_domain_operation(copy.deepcopy(snapshot), operacja, payload)

    assert wynik.get("error"), f"{pozycja.sciezka}: operacja przyjęła nieistniejącą pozycję"
    assert wynik.get("error_code") == "catalog.item_not_found", wynik.get("error")
    assert wynik.get("snapshot") is None


@pytest.mark.parametrize("operacja", OPERACJE_STACYJNE)
def test_komplet_poprawnych_referencji_przechodzi_brame(operacja: str) -> None:
    """Kontrola bramy: payload z KOMPLETEM poprawnych referencji przechodzi oba tory."""
    snapshot, endpoint_bus_ref, segment_ref = _ciag_sn()
    payload = _payload(operacja, endpoint_bus_ref=endpoint_bus_ref, segment_ref=segment_ref)

    blad, _ = validate_and_materialize_catalog_binding(operacja, payload)
    assert blad is None, blad

    wynik = execute_domain_operation(copy.deepcopy(snapshot), operacja, payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"


# ---------------------------------------------------------------------------
# (b) FIZYKA Z KATALOGU — tabliczka nie pochodzi z payloadu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("operacja", OPERACJE_STACYJNE)
def test_tabliczka_zrodla_nn_pochodzi_z_katalogu_a_nie_z_payloadu(operacja: str) -> None:
    """Po materializacji moc źródła nN jest KATALOGOWA — payload jej nie wstrzyknie.

    Payload deklaruje 9,9 MW / 9,9 MVA, pozycja katalogowa 0,5 MW / 0,55 MVA.
    `p_mw` generatora wchodzi wprost do bilansu rozpływu, więc różnica jest
    różnicą w WYNIKU inżynierskim, nie kosmetyką migawki.
    """
    snapshot, endpoint_bus_ref, segment_ref = _ciag_sn()
    payload = _payload(operacja, endpoint_bus_ref=endpoint_bus_ref, segment_ref=segment_ref)

    wynik = execute_domain_operation(copy.deepcopy(snapshot), operacja, payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"

    generatory = [
        gen for gen in wynik["snapshot"]["generators"] if gen.get("gen_type") == "pv_inverter"
    ]
    assert len(generatory) == 1
    generator = generatory[0]
    assert generator["p_mw"] == pytest.approx(FALOWNIK_PV_PMAX_MW)
    assert generator["source_mode"] == "KATALOG"
    assert generator["parameter_source"] == "CATALOG"
    tabliczka = generator["materialized_params"]
    assert tabliczka["catalog_item_id"] == REF_FALOWNIK_PV
    assert tabliczka["pmax_mw"] == pytest.approx(FALOWNIK_PV_PMAX_MW)
    assert tabliczka["sn_mva"] == pytest.approx(FALOWNIK_PV_SN_MVA)
    assert tabliczka["un_kv"] == pytest.approx(0.4)


#: Transformator stacji dobrany DO ŹRÓDŁA. Od V12K-317 kontrola mocy
#: transformatora obowiązuje w OBU torach (stacyjnym i atomowym), więc źródło
#: 2,2 MVA pod transformatorem 630 kVA jest — słusznie — odrzucane. Ten test
#: bada rozstrzygalność PRZESTRZENI KATALOGU, więc dobieramy transformator,
#: przy którym dobór jest poprawny, zamiast omijać kontrolę.
REF_TRAFO_2500 = "tr-sn-nn-15-04-2500kva-dyn11"

#: Konfiguracja bloku nN → (ref katalogu, Pmax [MW], Sn [MVA], typ generatora,
#: ref transformatora stacji). Wartości ODCZYTANE z katalogu; payload
#: w `_blok_stacji` deklaruje 9,9/9,9.
WARIANTY_ZRODLA_NN: tuple[tuple[str, str, float, float, str, str], ...] = (
    ("PV_INVERTER", REF_FALOWNIK_PV, 0.5, 0.55, "pv_inverter", REF_TRAFO),
    ("BESS_INVERTER", "conv-bess-nn-2mw-0p4kv", 2.0, 2.2, "bess", REF_TRAFO_2500),
    ("FW_INVERTER", "conv-wind-nn-2mw-0p4kv", 2.0, 2.2, "wind_inverter", REF_TRAFO_2500),
)


@pytest.mark.parametrize(
    ("konfiguracja", "ref_katalogu", "pmax_mw", "sn_mva", "gen_type", "ref_transformatora"),
    WARIANTY_ZRODLA_NN,
)
def test_kazda_technologia_zrodla_nn_materializuje_sie_z_katalogu(
    konfiguracja: str,
    ref_katalogu: str,
    pmax_mw: float,
    sn_mva: float,
    gen_type: str,
    ref_transformatora: str,
) -> None:
    """PV/BESS/FW — każda technologia ma rozstrzygalną przestrzeń katalogu.

    Blokuje regresję do fikcyjnej przestrzeni „ZRODLO_NN_FW" (to nazwa ROLI POLA
    nN, nie kategoria katalogu): falownik wiatrowy stacji siedzi w przestrzeni
    CONVERTER — dokładnie tam, gdzie szuka go tor atomowy `add_converter_source`.
    """
    snapshot, endpoint_bus_ref, _ = _ciag_sn()
    payload = _payload(
        "append_station_on_endpoint", endpoint_bus_ref=endpoint_bus_ref, segment_ref=""
    )
    payload["nn_block"]["nn_configuration"] = konfiguracja
    payload["nn_block"]["source_converter_catalog_ref"] = ref_katalogu
    payload["transformer"]["transformer_catalog_ref"] = ref_transformatora

    blad, _ = validate_and_materialize_catalog_binding("append_station_on_endpoint", payload)
    assert blad is None, blad

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "append_station_on_endpoint", payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"

    generatory = [gen for gen in wynik["snapshot"]["generators"] if gen.get("gen_type") == gen_type]
    assert len(generatory) == 1, f"Brak generatora {gen_type} dla {konfiguracja}"
    generator = generatory[0]
    assert generator["p_mw"] == pytest.approx(pmax_mw)
    assert generator["materialized_params"]["sn_mva"] == pytest.approx(sn_mva)
    assert generator["materialized_params"]["un_kv"] == pytest.approx(0.4)
    # Przestrzeń katalogu w migawce musi istnieć w kanonie `CatalogNamespace`.
    assert generator["catalog_namespace"] in {ns.value for ns in CatalogNamespace}


@pytest.mark.parametrize("operacja", OPERACJE_STACYJNE)
def test_aparat_pola_sn_ma_tabliczke_z_katalogu(operacja: str) -> None:
    """Aparat pola SN po bramie ma materializację, a nie samą deklarację o katalogu."""
    snapshot, endpoint_bus_ref, segment_ref = _ciag_sn()
    payload = _payload(operacja, endpoint_bus_ref=endpoint_bus_ref, segment_ref=segment_ref)

    wynik = execute_domain_operation(copy.deepcopy(snapshot), operacja, payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"

    aparaty = [
        galaz
        for galaz in wynik["snapshot"]["branches"]
        if galaz.get("catalog_namespace") == "APARAT_SN"
        and "station_field_device" in (galaz.get("tags") or [])
    ]
    assert aparaty, "Operacja stacyjna nie utworzyła aparatu pola SN"
    for aparat in aparaty:
        assert aparat["catalog_ref"] == REF_APARAT_SN
        assert aparat["source_mode"] == "KATALOG"
        assert aparat["parameter_source"] == "CATALOG"
        tabliczka = aparat["materialized_params"]
        assert tabliczka is not None, "Aparat deklaruje katalog bez materializacji"
        assert tabliczka["catalog_item_id"] == REF_APARAT_SN
        assert tabliczka["u_n_kv"] == pytest.approx(17.5)
        assert tabliczka["i_n_a"] == pytest.approx(630.0)


def test_aparat_wskazany_na_polu_dociera_do_stacji_na_koncu_ciagu() -> None:
    """`append_station_on_endpoint` czyta aparat WSKAZANY NA POLU (nie tylko wspólny).

    Kreator stacji ui2 wysyła `sn_fields[].apparatus_catalog_ref` i NIE wysyła
    wspólnego `field_apparatus_catalog_ref` — przed naprawą specyfikacja pola
    gubiła ten klucz i produkcyjna ścieżka „stacja na końcu ciągu" kończyła się
    błędem „pole bez wskazanego aparatu".
    """
    snapshot, endpoint_bus_ref, _ = _ciag_sn()
    payload = _payload(
        "append_station_on_endpoint",
        endpoint_bus_ref=endpoint_bus_ref,
        segment_ref="",
    )
    payload.pop("field_apparatus_catalog_ref")

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "append_station_on_endpoint", payload)

    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"
    aparaty = [
        galaz
        for galaz in wynik["snapshot"]["branches"]
        if galaz.get("catalog_namespace") == "APARAT_SN"
        and "station_field_device" in (galaz.get("tags") or [])
    ]
    assert aparaty, "Aparat wskazany na polu nie dotarł do migawki"
    assert all(aparat["catalog_ref"] == REF_APARAT_SN for aparat in aparaty)


def test_stacja_bez_zrodla_nn_nie_wymaga_pozycji_falownika() -> None:
    """Brak referencji przy elemencie, którego operacja NIE tworzy, nie jest błędem.

    Lustro warunku domenowego (`_NN_SOURCE_KIND_MAP` + obecność referencji), a nie
    furtka: przy konfiguracji odbiorczej źródło nN w ogóle nie powstaje. Wariant
    dosadny: nawet CELOWO zepsuta referencja zabezpieczenia źródła nie może
    zablokować stacji odbiorczej, bo operacja domenowa tego bloku nie czyta.
    """
    snapshot, endpoint_bus_ref, _ = _ciag_sn()
    payload = _payload(
        "append_station_on_endpoint", endpoint_bus_ref=endpoint_bus_ref, segment_ref=""
    )
    payload["nn_block"] = {
        "nn_configuration": "LOAD_NN",
        "outgoing_feeders_nn_count": 1,
        "source_protection": {"device_catalog_ref": REF_ZABEZPIECZENIE_ZRODLA + LITEROWKA},
    }

    blad, _ = validate_and_materialize_catalog_binding("append_station_on_endpoint", payload)
    assert blad is None, blad

    wynik = execute_domain_operation(copy.deepcopy(snapshot), "append_station_on_endpoint", payload)
    assert not wynik.get("error"), f"{wynik.get('error')} ({wynik.get('error_code')})"
    assert wynik["snapshot"]["generators"] == []
    # Zepsuta referencja NIE trafiła do modelu — blok źródła nie został odczytany
    # (obecne zabezpieczenie pochodzi z wyposażenia pola SN, nie ze źródła nN).
    assert all(
        przypisanie.get("catalog_ref") != REF_ZABEZPIECZENIE_ZRODLA + LITEROWKA
        for przypisanie in wynik["snapshot"]["protection_assignments"]
    )
