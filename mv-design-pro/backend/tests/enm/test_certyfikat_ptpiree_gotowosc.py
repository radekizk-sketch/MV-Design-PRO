"""Certyfikat PTPiREE przetwornicy DER w torze GOTOWOŚCI (karta P2).

CO TO PRZYPINA. Projektant przyłączeń OZE dostaje OSTRZEŻENIE, gdy źródło DER
używa przetwornicy bez powiązanego wpisu w wykazie PTPiREE (realne ryzyko
odrzucenia wniosku przez OSD), oraz gdy wpis JEST, ale niesie notę o warunkach
(rekordy WOŚ 2018 w okresie przejściowym). Nie jest to blokada: manifest
katalogu PTPiREE mówi wprost, że „ostateczna akceptacja przyłączeniowa pozostaje
po stronie właściwego OSD".

REGUŁA KLASA, NIE INSTANCJA. Testy chodzą ILOCZYNEM CECH, a nie jednym
przykładem z karty:

  status tabliczki × nota tabliczki × rodzaj generatora

  * POWIĄZANY bez noty          -> ZERO nowych kodów,
  * POWIĄZANY z notą            -> `conditional`, komunikat CYTUJE notę,
  * NIEPOWIĄZANY                -> `unlinked`,
  * brak tabliczki w ogóle      -> `unlinked` (prawda dzisiejszych danych),
  * generator NIEprzekształtnikowy (maszyna synchroniczna) -> ZERO,
  * KAŻDY z sześciu rodzajów przekształtnikowych           -> emisja.

Ostatnia pozycja jest istotą reguły KLASA: sąsiedni tor tego samego pliku
(brama transformatora OZE) rozpoznaje przetwornicę dopasowaniem PODCIĄGU
(`"pv" in gen_type or "bess" in ... or "inverter" in ...`), przez co farmy
wiatrowe `fw_pmsg`/`fw_dfig`/`fw_scig` do niego NIE wchodzą. Certyfikacji
PTPiREE podlegają one tak samo jak PV, więc emisja karty P2 używa zbioru
kanonicznego, a ten test pilnuje, że żaden z sześciu rodzajów nie wypadnie.

STAN OSIĄGANY DANYMI, NIE WYMUSZENIEM MAGAZYNU: każdy wariant przechodzi
PRODUKCYJNĄ drogą `execute_domain_operation` (ta sama, którą wywołuje
`POST /enm/domain-ops`), a stan bierze się z parametrów DER w migawce.

ZABEZPIECZENIE PRZED ZIELENIĄ NA PUSTO (lekcja W4/V12K-318): `_build_readiness`
łapie każdy wyjątek i oddaje PUSTĄ gotowość, więc migawka odrzucona przez
walidację modelu dawałaby „zero kodów" nieodróżnialne od poprawnego wyniku.
Dlatego wariant oczekujący ZERA sprawdza dodatkowo KONTROLĘ DODATNIĄ na tej
samej migawce (przestawienie statusu na NIEPOWIĄZANY musi kod zapalić) — bez
niej test przechodziłby także wtedy, gdyby tor gotowości w ogóle nie działał.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from domain.canonical_operations import READINESS_CODES, ReadinessLevel
from enm.domain_operations import execute_domain_operation

from tests.enm.test_domain_operations import (
    _build_gpz_plus_segments,
    _get_first_segment_ref,
)

KOD_NIEPOWIAZANY = "der.inverter_certificate_unlinked"
KOD_WARUNKOWY = "der.inverter_certificate_conditional"

#: Nota rekordu WOŚ 2018 w brzmieniu, w jakim niesie ją snapshot wykazu
#: (`network_model/catalog/mv_ptpiree_catalog.py`). Test CYTUJE ją tak samo, jak
#: ma ją cytować komunikat — reguł ważności certyfikatów nikt tu nie wymyśla.
NOTA_WOS_2018 = (
    "WOS 2018 w okresie przejsciowym; wymaga sprawdzenia daty akceptacji "
    "i warunkow WiPWC dla konkretnego projektu."
)

#: Wszystkie rodzaje generatorów podlegające certyfikacji PTPiREE.
RODZAJE_PRZEKSZTALTNIKOWE = (
    "pv_inverter",
    "wind_inverter",
    "fw_pmsg",
    "fw_dfig",
    "fw_scig",
    "bess",
)


@pytest.fixture(scope="module")
def migawka_ze_stacja() -> dict[str, Any]:
    """GPZ + magistrala + stacja SN/nN — realna migawka z produkcyjnych operacji."""
    _, snapshot = _build_gpz_plus_segments(2)
    wynik = execute_domain_operation(
        enm_dict=snapshot,
        op_name="insert_station_on_segment_sn",
        payload={
            "segment_ref": _get_first_segment_ref(snapshot),
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    assert wynik.get("snapshot") is not None, f"Blad budowy stacji: {wynik.get('error')}"
    return wynik["snapshot"]


def _szyna_stacji(snapshot: dict[str, Any]) -> str:
    refy_zrodel = {src.get("bus_ref") for src in snapshot.get("sources", [])}
    for bus in snapshot.get("buses", []):
        if bus.get("ref_id") not in refy_zrodel:
            return str(bus["ref_id"])
    raise AssertionError("Migawka nie ma szyny innej niz szyna zrodla")


def _gotowosc_z_der(
    snapshot: dict[str, Any],
    *,
    gen_type: str = "pv_inverter",
    tabliczka: dict[str, Any] | None,
) -> dict[str, Any]:
    """Odpowiedź operacji domenowej dla migawki z JEDNYM źródłem DER.

    Droga produkcyjna: dopisany generator + `update_element_parameters` na
    dowolnej szynie, czyli dokładnie ta sama ścieżka, którą chodzi kreator.
    """
    kopia = copy.deepcopy(snapshot)
    generator: dict[str, Any] = {
        "ref_id": "gen_der_ptpiree",
        "name": "Falownik testowy",
        "bus_ref": _szyna_stacji(kopia),
        "p_mw": 0.5,
        "q_mvar": 0.0,
        "gen_type": gen_type,
    }
    if tabliczka is not None:
        generator["materialized_params"] = tabliczka
    kopia.setdefault("generators", []).append(generator)

    dowolna_szyna = kopia["buses"][0]
    wynik = execute_domain_operation(
        enm_dict=kopia,
        op_name="update_element_parameters",
        payload={
            "element_ref": dowolna_szyna["ref_id"],
            "parameters": {"name": dowolna_szyna.get("name", "test")},
        },
    )
    assert wynik.get("snapshot") is not None, f"Operacja nie oddala migawki: {wynik.get('error')}"
    # Bezpiecznik: DER musi FAKTYCZNIE byc w migawce, z ktorej liczono gotowosc.
    refy = {g.get("ref_id") for g in wynik["snapshot"].get("generators", [])}
    assert "gen_der_ptpiree" in refy, "DER wypadl z migawki — test mierzylby nie to, co trzeba"
    return wynik


def _kody_ostrzezen(wynik: dict[str, Any]) -> list[str]:
    return [o.get("code", "") for o in wynik.get("readiness", {}).get("warnings", [])]


def _ostrzezenie(wynik: dict[str, Any], kod: str) -> dict[str, Any]:
    trafienia = [o for o in wynik["readiness"]["warnings"] if o.get("code") == kod]
    assert len(trafienia) == 1, f"Oczekiwano dokladnie jednego ostrzezenia {kod}, mam {trafienia}"
    return trafienia[0]


def _akcja_naprawcza(wynik: dict[str, Any], kod: str) -> dict[str, Any]:
    trafienia = [a for a in wynik.get("fix_actions", []) if a.get("code") == kod]
    assert len(trafienia) == 1, f"Oczekiwano jednej akcji naprawczej {kod}, mam {trafienia}"
    return trafienia[0]


def _kontrola_dodatnia(snapshot: dict[str, Any], *, gen_type: str) -> None:
    """Dowód, że tor gotowości na TEJ migawce w ogóle działa (anty-pusto)."""
    wynik = _gotowosc_z_der(
        snapshot,
        gen_type=gen_type,
        tabliczka={"ptpiree_status": "NIEPOWIAZANY"},
    )
    assert KOD_NIEPOWIAZANY in _kody_ostrzezen(wynik), (
        "Kontrola dodatnia nie zapalila kodu — tor gotowosci na tej migawce nie "
        "dziala, wiec 'zero kodow' w wariancie obok nic nie dowodzi"
    )


# ---------------------------------------------------------------------------
# Iloczyn cech: status × nota
# ---------------------------------------------------------------------------


def test_powiazany_bez_noty_nie_daje_zadnego_ostrzezenia(migawka_ze_stacja: dict) -> None:
    """Urządzenie z czystym wpisem w wykazie nie zaśmieca toru gotowości."""
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        tabliczka={
            "ptpiree_status": "POWIAZANY",
            "ptpiree_document_number": "DOC-PV-900",
            "ptpiree_wos_version": "WOS 2021",
        },
    )
    kody = _kody_ostrzezen(wynik)
    assert KOD_NIEPOWIAZANY not in kody
    assert KOD_WARUNKOWY not in kody
    _kontrola_dodatnia(migawka_ze_stacja, gen_type="pv_inverter")


def test_powiazany_z_nota_daje_ostrzezenie_warunkowe_cytujace_note(
    migawka_ze_stacja: dict,
) -> None:
    """Nota rekordu jest CYTOWANA — system nie wyprowadza własnych reguł ważności."""
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        tabliczka={
            "ptpiree_status": "POWIAZANY",
            "ptpiree_note": NOTA_WOS_2018,
        },
    )
    kody = _kody_ostrzezen(wynik)
    assert KOD_WARUNKOWY in kody
    assert KOD_NIEPOWIAZANY not in kody

    ostrzezenie = _ostrzezenie(wynik, KOD_WARUNKOWY)
    assert ostrzezenie["severity"] == "OSTRZEZENIE"
    assert ostrzezenie["element_ref"] == "gen_der_ptpiree"
    assert NOTA_WOS_2018 in ostrzezenie["message_pl"], "komunikat nie cytuje noty rekordu"
    assert "Falownik testowy" in ostrzezenie["message_pl"], "komunikat nie nazywa urzadzenia"


def test_niepowiazany_daje_ostrzezenie_o_braku_certyfikatu(migawka_ze_stacja: dict) -> None:
    wynik = _gotowosc_z_der(migawka_ze_stacja, tabliczka={"ptpiree_status": "NIEPOWIAZANY"})
    kody = _kody_ostrzezen(wynik)
    assert KOD_NIEPOWIAZANY in kody
    assert KOD_WARUNKOWY not in kody

    ostrzezenie = _ostrzezenie(wynik, KOD_NIEPOWIAZANY)
    assert ostrzezenie["severity"] == "OSTRZEZENIE"
    assert "certyfikatu PTPiREE" in ostrzezenie["message_pl"]
    assert "OSD" in ostrzezenie["message_pl"], (
        "komunikat musi mowic, ze ostateczna akceptacja jest po stronie OSD — "
        "inaczej ostrzezenie czyta sie jak blokada systemu"
    )


def test_brak_tabliczki_czyta_sie_jak_brak_powiazania(migawka_ze_stacja: dict) -> None:
    """DER bez tabliczki: status nieznany = niepowiązany, bez zgadywania na plus."""
    wynik = _gotowosc_z_der(migawka_ze_stacja, tabliczka=None)
    assert KOD_NIEPOWIAZANY in _kody_ostrzezen(wynik)


def test_nota_bez_powiazania_nie_podszywa_sie_pod_warunkowy(migawka_ze_stacja: dict) -> None:
    """Rekord niedopasowany też niesie notę — to wciąż BRAK powiązania, nie warunek.

    Predykat wejścia i wyjścia z jednego źródła: rozstrzyga WYŁĄCZNIE status,
    nota rozstrzyga dopiero WEWNĄTRZ powiązania.
    """
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        tabliczka={
            "ptpiree_status": "NIEPOWIAZANY",
            "ptpiree_note": "Brak dopasowania do lokalnego snapshotu PTPiREE.",
        },
    )
    kody = _kody_ostrzezen(wynik)
    assert KOD_NIEPOWIAZANY in kody
    assert KOD_WARUNKOWY not in kody


def test_pusta_nota_nie_robi_z_powiazania_warunku(migawka_ze_stacja: dict) -> None:
    """Nota złożona z samych spacji to BRAK noty, nie warunek do potwierdzenia."""
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        tabliczka={"ptpiree_status": "POWIAZANY", "ptpiree_note": "   "},
    )
    kody = _kody_ostrzezen(wynik)
    assert KOD_WARUNKOWY not in kody
    assert KOD_NIEPOWIAZANY not in kody
    _kontrola_dodatnia(migawka_ze_stacja, gen_type="pv_inverter")


# ---------------------------------------------------------------------------
# Iloczyn cech: rodzaj generatora
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("gen_type", RODZAJE_PRZEKSZTALTNIKOWE)
def test_kazdy_rodzaj_przeksztaltnikowy_podlega_sygnalowi(
    migawka_ze_stacja: dict, gen_type: str
) -> None:
    """Sześć rodzajów, nie tylko PV — farmy wiatrowe certyfikuje się tak samo."""
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        gen_type=gen_type,
        tabliczka={"ptpiree_status": "NIEPOWIAZANY"},
    )
    assert KOD_NIEPOWIAZANY in _kody_ostrzezen(
        wynik
    ), f"rodzaj '{gen_type}' wypadl z sygnalu certyfikacji PTPiREE"


def test_maszyna_synchroniczna_nie_dostaje_sygnalu_o_przetwornicy(
    migawka_ze_stacja: dict,
) -> None:
    """Generator bez przetwornicy nie podlega certyfikacji PTPiREE."""
    wynik = _gotowosc_z_der(
        migawka_ze_stacja,
        gen_type="synchronous",
        tabliczka={"ptpiree_status": "NIEPOWIAZANY"},
    )
    kody = _kody_ostrzezen(wynik)
    assert KOD_NIEPOWIAZANY not in kody
    assert KOD_WARUNKOWY not in kody
    _kontrola_dodatnia(migawka_ze_stacja, gen_type="pv_inverter")


# ---------------------------------------------------------------------------
# Nawigacja naprawcza (sygnał bez drogi naprawy zostawia projektanta z kodem)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("tabliczka", "kod"),
    [
        ({"ptpiree_status": "NIEPOWIAZANY"}, KOD_NIEPOWIAZANY),
        ({"ptpiree_status": "POWIAZANY", "ptpiree_note": NOTA_WOS_2018}, KOD_WARUNKOWY),
    ],
)
def test_oba_kody_prowadza_do_konfiguracji_urzadzenia(
    migawka_ze_stacja: dict, tabliczka: dict, kod: str
) -> None:
    wynik = _gotowosc_z_der(migawka_ze_stacja, tabliczka=tabliczka)
    akcja = _akcja_naprawcza(wynik, kod)
    assert akcja["action_type"] == "SELECT_CATALOG"
    assert akcja["panel"] == "catalog"
    assert akcja["element_ref"] == "gen_der_ptpiree"
    assert akcja["message_pl"].strip(), "akcja naprawcza bez zdania po polsku"


# ---------------------------------------------------------------------------
# Treść kanoniczna obu kodów
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kod", [KOD_NIEPOWIAZANY, KOD_WARUNKOWY])
def test_kod_jest_ostrzezeniem_z_trescia_i_nawigacja(kod: str) -> None:
    """Ostrzeżenie, nie blokada — akceptacja przyłączeniowa należy do OSD."""
    spec = READINESS_CODES[kod]
    assert spec.level is ReadinessLevel.WARNING
    assert len(spec.message_pl) > 20
    assert spec.fix_navigation and spec.fix_navigation.get("panel")
