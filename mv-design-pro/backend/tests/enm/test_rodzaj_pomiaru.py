"""Pomiar pola POMIAROWEGO — karta POMIAR-RODZAJ (V12K-335 pkt 2 + korekta
właściciela V12K-336).

Kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §5:

- FUNKCJA pola (rozróżnienie klasowe, V12K-336 pkt 4): układ pomiarowy ENERGII
  ([E-UP] pkt 3) vs pomiar NAPIĘCIA SZYN rozdzielni (przekładniki napięciowe
  sekcji — nie jest układem pomiarowym energii);
- RODZAJ układu pomiarowego energii — lista ZAMKNIĘTA ze standardu [E-UP]
  pkt 3 (IRiESD): PODSTAWOWY, REZERWOWY, ROWNOWAZNY, KONTROLNY;
- BRAMA tranzytu odmawia KAŻDEGO układu pomiarowego energii (wszystkie cztery
  rodzaje) w torze tranzytu — TĄ SAMĄ funkcją źródłową
  (`blad_pomiaru_w_torze_tranzytu`) na KAŻDEJ drodze wejścia; pomiar napięcia
  szyn wolny wszędzie.

Testy są ILOCZYNEM CECH (reguła KLASA, NIE INSTANCJA), nie przykładem z karty:

      {pomiar: układ energii × {PODSTAWOWY, REZERWOWY, ROWNOWAZNY, KONTROLNY},
       pomiar napięcia szyn, bez deklaracji}
    × {droga: wcięcie w odcinek, add_sn_bay (nowe pole i rekonfiguracja),
       stacja na końcu ciągu, szablony klas B/C}
    × {topologia: tor tranzytu (wcięcie / stacja przelotowa / pętla OSD),
       koniec gałęzi, szyna GPZ}

plus piny reguł domyślnych obu dróg, pin niezmienności prefiksów pomiarów
i pin koherencji pary predykatów (klasa przyłączenia ↔ brama tranzytu).
Walidacja normatywna 5 MW (V12K-336 pkt 2) —
`tests/reference_engine/test_metering_control_5mw.py`.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from enm.domain_operations import (
    FUNKCJA_POMIARU_DOMYSLNA_BUDOWY_STACJI,
    FUNKCJA_POMIARU_DOMYSLNA_POLA_DOKLADANEGO,
    RODZAJ_UKLADU_DOMYSLNY,
    RODZAJE_UKLADU_POMIAROWEGO,
    blad_pomiaru_w_torze_tranzytu,
    execute_domain_operation,
    klasa_przylaczenia_sn,
    rozstrzygnij_pomiar_pola,
    szyna_prowadzi_tranzyt_sn,
)
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
TRAFO_630 = "tr-sn-nn-15-04-630kva-dyn11"
RODZAJE = ("PODSTAWOWY", "REZERWOWY", "ROWNOWAZNY", "KONTROLNY")


def _binding(namespace: str, item_id: str) -> dict[str, Any]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": "2024.1",
    }


def _wykonaj(enm: dict[str, Any], op_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    assert not wynik.get("error"), f"{op_name}: {wynik.get('error_code')} {wynik.get('error')}"
    return wynik


def _pusty_enm() -> dict[str, Any]:
    return EnergyNetworkModel(
        header=ENMHeader(name="POMIAR-RODZAJ", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")


def _magistrala(liczba_odcinkow: int = 3) -> tuple[dict[str, Any], list[str]]:
    """GPZ + N odcinków magistrali kablowej. Zwraca (ENM, refy odcinków)."""
    enm = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", "src-gpz-15kv-250mva-rx010"),
        },
    )["snapshot"]
    odcinki: list[str] = []
    for i in range(liczba_odcinkow):
        enm = _wykonaj(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500 + 50 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding("KABEL_SN", "cable-tfk-yakxs-3x120"),
                }
            },
        )["snapshot"]
        odcinki.append(enm["corridors"][0]["ordered_segment_refs"][-1])
    return enm, odcinki


def _payload_wciecia(
    segment_ref: str,
    sn_fields: list[dict[str, Any]],
    *,
    nazwa: str = "Stacja testowa",
    transformer: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "segment_id": segment_ref,
        "insert_at": {"mode": "RATIO", "value": 0.5},
        "station": {
            "station_type": "inline",
            "station_name": nazwa,
            "sn_voltage_kv": 15.0,
            "nn_voltage_kv": 0.4,
        },
        "field_apparatus_catalog_ref": APARAT_SN,
        "sn_fields": sn_fields,
        "transformer": (
            transformer if transformer is not None else {"transformer_catalog_ref": TRAFO_630}
        ),
        "nn_block": {"outgoing_feeders_nn_count": 1},
    }


def _stacja_z_wyboru(wynik: dict[str, Any]) -> dict[str, Any]:
    hint = wynik.get("selection_hint") or {}
    ref = hint.get("element_id")
    assert isinstance(ref, str) and ref
    stacja = next(s for s in wynik["snapshot"]["substations"] if s["ref_id"] == ref)
    return stacja


def _specyfikacje_pol(stacja: dict[str, Any]) -> list[dict[str, Any]]:
    return list((stacja.get("meta") or {}).get("field_specs") or [])


def _szyna_sn(stacja: dict[str, Any], snapshot: dict[str, Any]) -> str:
    for bus_ref in stacja["bus_refs"]:
        bus = next(b for b in snapshot["buses"] if b["ref_id"] == bus_ref)
        if float(bus.get("voltage_kv") or 0) > 1.0:
            return str(bus_ref)
    raise AssertionError("Stacja bez szyny SN")


def _stacja_przelotowa(enm: dict[str, Any], segment_ref: str) -> tuple[dict[str, Any], str, str]:
    """Stacja klasy A wcięta w magistralę (IN, OUT, TR). Zwraca (ENM, ref, szyna SN)."""
    wynik = _wykonaj(
        enm,
        "insert_station_on_segment_sn",
        _payload_wciecia(
            segment_ref,
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            nazwa="Stacja przelotowa OSD",
        ),
    )
    stacja = _stacja_z_wyboru(wynik)
    return wynik["snapshot"], stacja["ref_id"], _szyna_sn(stacja, wynik["snapshot"])


# ---------------------------------------------------------------------------
# Rozstrzygnięcie pomiaru — jedno źródło (rozstrzygnij_pomiar_pola)
# ---------------------------------------------------------------------------


def test_taksonomia_ukladow_pomiarowych_jest_zamknieta_wg_standardu() -> None:
    """Lista rodzajów układów pomiarowych energii wprost z [E-UP] pkt 3
    (IRiESD): podstawowy, rezerwowy, równoważny, kontrolny — ŻADNYCH innych."""
    assert RODZAJE_UKLADU_POMIAROWEGO == frozenset(RODZAJE)
    assert RODZAJ_UKLADU_DOMYSLNY == "PODSTAWOWY"
    assert FUNKCJA_POMIARU_DOMYSLNA_BUDOWY_STACJI == "UKLAD_ENERGII"
    assert FUNKCJA_POMIARU_DOMYSLNA_POLA_DOKLADANEGO == "NAPIECIA_SZYN"


def test_rozstrzygniecie_pomiaru_pola_jedno_zrodlo() -> None:
    """Reguły źródłowe: domyślna DROGI dla braku deklaracji; rodzaj implikuje
    układ energii; układ bez rodzaju = PODSTAWOWY (reguła standardu); rodzaj
    przy pomiarze napięcia szyn = błąd; literówki i deklaracje poza polem
    pomiarowym = błędy jawnie kodowane."""
    # Brak deklaracji — domyślna drogi budowy stacji (układ energii/PODSTAWOWY).
    assert rozstrzygnij_pomiar_pola(
        None, None, rola_kanoniczna="POMIAROWE", domyslna_funkcja="UKLAD_ENERGII"
    ) == ("UKLAD_ENERGII", "PODSTAWOWY", None)
    # Brak deklaracji — domyślna drogi dokładania pola (pomiar napięcia szyn).
    assert rozstrzygnij_pomiar_pola(
        None, None, rola_kanoniczna="POMIAROWE", domyslna_funkcja="NAPIECIA_SZYN"
    ) == ("NAPIECIA_SZYN", None, None)
    # Rodzaj implikuje układ energii; aliasy wielkości liter kanonizowane.
    assert rozstrzygnij_pomiar_pola(
        None, "kontrolny", rola_kanoniczna="POMIAROWE", domyslna_funkcja="NAPIECIA_SZYN"
    ) == ("UKLAD_ENERGII", "KONTROLNY", None)
    # Jawna funkcja układu bez rodzaju = PODSTAWOWY (obowiązkowy układ punktu
    # rozliczeniowego, [E-UP] pkt 3) — jedna reguła obu dróg.
    assert rozstrzygnij_pomiar_pola(
        "UKLAD_ENERGII", None, rola_kanoniczna="POMIAROWE", domyslna_funkcja="NAPIECIA_SZYN"
    ) == ("UKLAD_ENERGII", "PODSTAWOWY", None)
    # Rodzaj przy pomiarze napięcia szyn — błąd.
    _, _, blad = rozstrzygnij_pomiar_pola(
        "NAPIECIA_SZYN",
        "PODSTAWOWY",
        rola_kanoniczna="POMIAROWE",
        domyslna_funkcja="NAPIECIA_SZYN",
    )
    assert blad is not None and blad["error_code"] == "sn.rodzaj_pomiaru_poza_ukladem_energii"
    # Literówki.
    _, _, blad = rozstrzygnij_pomiar_pola(
        "UKLAD", None, rola_kanoniczna="POMIAROWE", domyslna_funkcja="NAPIECIA_SZYN"
    )
    assert blad is not None and blad["error_code"] == "sn.funkcja_pomiaru_nieznana"
    _, _, blad = rozstrzygnij_pomiar_pola(
        None, "ROZLICZENIOWY", rola_kanoniczna="POMIAROWE", domyslna_funkcja="NAPIECIA_SZYN"
    )
    assert blad is not None and blad["error_code"] == "sn.rodzaj_pomiaru_nieznany"
    # Deklaracja poza polem pomiarowym.
    _, _, blad = rozstrzygnij_pomiar_pola(
        None, "PODSTAWOWY", rola_kanoniczna="LINIA_IN", domyslna_funkcja="UKLAD_ENERGII"
    )
    assert blad is not None and blad["error_code"] == "sn.pomiar_poza_polem_pomiarowym"
    # Pole niepomiarowe bez deklaracji — nic.
    assert rozstrzygnij_pomiar_pola(
        None, None, rola_kanoniczna="LINIA_IN", domyslna_funkcja="UKLAD_ENERGII"
    ) == (None, None, None)


def test_tranzyt_rozdzielnicy_wynika_z_pary_tranzytowej_rol() -> None:
    """Źródło prawdy o tranzycie dla dróg na istniejącej szynie: para dopływ +
    odpływ. GPZ (bez pola dopływowego SN) i stacja końcowa NIE prowadzą
    tranzytu; aliasy `bay_role` przechodzą przez wspólny słownik ról."""
    assert szyna_prowadzi_tranzyt_sn(["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"])
    assert szyna_prowadzi_tranzyt_sn(["IN", "OUT"])
    assert not szyna_prowadzi_tranzyt_sn(["LINIA_IN", "TRANSFORMATOROWE"])
    assert not szyna_prowadzi_tranzyt_sn(["OUT", "OUT", "TRANSFORMATOROWE"])
    assert not szyna_prowadzi_tranzyt_sn([])


def test_brama_zrodlowa_regula_pozycyjna() -> None:
    """Reguła bramy na parach (rola, funkcja): układ pomiarowy energii legalny
    wyłącznie za CZYSTĄ pętlą OSD; pomiar napięcia szyn i wpisy bez funkcji —
    nieoceniane."""
    # Klasa B (prefiks bez odpływu) — odmowa.
    assert (
        blad_pomiaru_w_torze_tranzytu(
            [("LINIA_IN", None), ("POMIAROWE", "UKLAD_ENERGII"), ("TRANSFORMATOROWE", None)],
            szyna_prowadzi_tranzyt=True,
            kod_bledu="x",
        )
        is not None
    )
    # Klasa C (czysta pętla przed pomiarem) — wolne.
    assert (
        blad_pomiaru_w_torze_tranzytu(
            [("LINIA_IN", None), ("LINIA_OUT", None), ("POMIAROWE", "UKLAD_ENERGII")],
            szyna_prowadzi_tranzyt=True,
            kod_bledu="x",
        )
        is None
    )
    # Prefiks brudny (TR przed pomiarem mimo odpływu) — odmowa.
    assert (
        blad_pomiaru_w_torze_tranzytu(
            [
                ("LINIA_IN", None),
                ("TRANSFORMATOROWE", None),
                ("LINIA_OUT", None),
                ("POMIAROWE", "UKLAD_ENERGII"),
            ],
            szyna_prowadzi_tranzyt=True,
            kod_bledu="x",
        )
        is not None
    )
    # Pomiar napięcia szyn — wolny w każdej pozycji.
    assert (
        blad_pomiaru_w_torze_tranzytu(
            [("LINIA_IN", None), ("POMIAROWE", "NAPIECIA_SZYN"), ("TRANSFORMATOROWE", None)],
            szyna_prowadzi_tranzyt=True,
            kod_bledu="x",
        )
        is None
    )
    # Bez tranzytu — brama nie ogranicza.
    assert (
        blad_pomiaru_w_torze_tranzytu(
            [("LINIA_IN", None), ("POMIAROWE", "UKLAD_ENERGII"), ("TRANSFORMATOROWE", None)],
            szyna_prowadzi_tranzyt=False,
            kod_bledu="x",
        )
        is None
    )


# ---------------------------------------------------------------------------
# Droga: wcięcie w odcinek (tranzyt z semantyki operacji)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_wciecie_odmawia_ukladu_energii_kazdego_rodzaju_w_ukladzie_klasy_b(
    rodzaj: str,
) -> None:
    """V12K-336 pkt 3: KAŻDY układ pomiarowy energii (kontrolny też — towarzyszy
    rozliczeniowemu w gałęzi klienta przy granicy stron) jest zakazany w torze
    tranzytu — nie tylko rozliczeniowy."""
    enm, odcinki = _magistrala(3)
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": rodzaj},
                {"field_role": "TRANSFORMATOROWE"},
            ],
        ),
    )
    assert wynik.get("error_code") == "station.insert.pomiar_w_torze_tranzytu"
    assert wynik.get("snapshot") is None


def test_wciecie_bez_deklaracji_pomiaru_odmawia_jak_dotychczas() -> None:
    """Pin reguły domyślnej drogi budowy stacji (kontrakt §5): pole POMIAROWE
    bez deklaracji jest układem pomiarowym energii (PODSTAWOWYM), więc
    zachowanie bramy sprzed atrybutów (POMIAR-ODG) pozostaje BEZ ZMIAN —
    zero cichego poluzowania."""
    enm, odcinki = _magistrala(3)
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [{"field_role": "LINIA_IN"}, {"field_role": "POMIAROWE"}],
        ),
    )
    assert wynik.get("error_code") == "station.insert.pomiar_w_torze_tranzytu"


def test_wciecie_przyjmuje_pomiar_napiecia_szyn_w_stacji_przelotowej() -> None:
    """V12K-336 pkt 4: pole pomiaru napięcia szyn (przekładniki napięciowe
    sekcji) NIE jest układem pomiarowym energii — wolne także we wcięciu."""
    enm, odcinki = _magistrala(3)
    wynik = _wykonaj(
        enm,
        "insert_station_on_segment_sn",
        _payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "POMIAROWE", "funkcja_pomiaru": "NAPIECIA_SZYN"},
                {"field_role": "TRANSFORMATOROWE"},
                {"field_role": "LINIA_OUT"},
            ],
            nazwa="Stacja OSD z pomiarem napięcia szyn",
        ),
    )
    stacja = _stacja_z_wyboru(wynik)
    pomiar = next(
        spec for spec in _specyfikacje_pol(stacja) if spec.get("bay_role") == "MEASUREMENT"
    )
    assert pomiar["funkcja_pomiaru"] == "NAPIECIA_SZYN"
    assert "rodzaj_pomiaru" not in pomiar
    # Pola pozostałych ról NIE niosą atrybutów (addytywność — bajtowa zgodność
    # istniejących migawek bez pomiaru).
    for spec in _specyfikacje_pol(stacja):
        if spec.get("bay_role") != "MEASUREMENT":
            assert "funkcja_pomiaru" not in spec
            assert "rodzaj_pomiaru" not in spec


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_wciecie_przyjmuje_uklad_energii_za_czysta_petla_osd(rodzaj: str) -> None:
    """Klasa C: pętla OSD przed pomiarem — wcięcie legalne dla każdego rodzaju
    układu; funkcja i rodzaj utrwalone w specyfikacji pola."""
    enm, odcinki = _magistrala(3)
    wynik = _wykonaj(
        enm,
        "insert_station_on_segment_sn",
        _payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": rodzaj},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            nazwa="Złącze ZK-SN z pomiarem",
        ),
    )
    stacja = _stacja_z_wyboru(wynik)
    pomiar = next(
        spec for spec in _specyfikacje_pol(stacja) if spec.get("bay_role") == "MEASUREMENT"
    )
    assert pomiar["funkcja_pomiaru"] == "UKLAD_ENERGII"
    assert pomiar["rodzaj_pomiaru"] == rodzaj


def test_wciecie_odmawia_ukladu_energii_za_brudnym_prefiksem() -> None:
    """Reguły twarde §3: przed układem pomiarowym energii wolno stać wyłącznie
    dopływowi (B) albo czystej pętli IN/OUT (C). Pole TR przed pomiarem =
    pomiar nie mierzy całego poboru za sobą — odmowa, choć zbiorowy test
    „jest odpływ przed pomiarem" uznałby układ za pętlę OSD.

    Ten test wykrywa też KOPIĘ WARUNKU: dawna brama (klasa == B) przepuszczała
    ten układ, więc podmiana funkcji źródłowej na lokalną kopię starego warunku
    czerwieni ten pin."""
    enm, odcinki = _magistrala(3)
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "TRANSFORMATOROWE"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": "PODSTAWOWY"},
            ],
        ),
    )
    assert wynik.get("error_code") == "station.insert.pomiar_w_torze_tranzytu"


def test_wciecie_odmawia_bledow_deklaracji_pomiaru() -> None:
    enm, odcinki = _magistrala(3)
    # Nieznany rodzaj układu (stare pojęcie ROZLICZENIOWY też jest już błędem —
    # lista zamknięta z [E-UP] pkt 3).
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": "ROZLICZENIOWY"},
            ],
        ),
    )
    assert wynik.get("error_code") == "sn.rodzaj_pomiaru_nieznany"
    # Nieznana funkcja pomiaru.
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "POMIAROWE", "funkcja_pomiaru": "TARYFOWA"},
            ],
        ),
    )
    assert wynik.get("error_code") == "sn.funkcja_pomiaru_nieznana"
    # Rodzaj układu przy pomiarze napięcia szyn.
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {
                    "field_role": "POMIAROWE",
                    "funkcja_pomiaru": "NAPIECIA_SZYN",
                    "rodzaj_pomiaru": "PODSTAWOWY",
                },
            ],
        ),
    )
    assert wynik.get("error_code") == "sn.rodzaj_pomiaru_poza_ukladem_energii"
    # Deklaracja na polu niepomiarowym.
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="insert_station_on_segment_sn",
        payload=_payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN", "rodzaj_pomiaru": "PODSTAWOWY"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
        ),
    )
    assert wynik.get("error_code") == "sn.pomiar_poza_polem_pomiarowym"


# ---------------------------------------------------------------------------
# Droga: add_sn_bay (istniejąca szyna — tranzyt z pary tranzytowej ról)
# ---------------------------------------------------------------------------


def _dodaj_pole_pomiarowe(
    enm: dict[str, Any],
    *,
    bus_ref: str,
    station_ref: str,
    rodzaj: str | None = None,
    funkcja: str | None = None,
    bay_role: str = "MEASUREMENT",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "bus_ref": bus_ref,
        "station_ref": station_ref,
        "bay_role": bay_role,
        "apparatus_kind": "MEASUREMENT",
    }
    if rodzaj is not None:
        payload["rodzaj_pomiaru"] = rodzaj
    if funkcja is not None:
        payload["funkcja_pomiaru"] = funkcja
    return execute_domain_operation(enm_dict=enm, op_name="add_sn_bay", payload=payload)


@pytest.mark.parametrize("rodzaj", RODZAJE)
def test_add_sn_bay_odmawia_ukladu_energii_na_stacji_przelotowej(rodzaj: str) -> None:
    """Karta pkt 3b + V12K-336 pkt 3: dołożenie układu pomiarowego energii
    (każdego rodzaju) na szynę z tranzytem — odmowa TĄ SAMĄ funkcją źródłową,
    co brama wcięcia."""
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    wynik = _dodaj_pole_pomiarowe(enm, bus_ref=szyna_sn, station_ref=station_ref, rodzaj=rodzaj)
    assert wynik.get("error_code") == "sn.pomiar_w_torze_tranzytu", rodzaj
    assert wynik.get("snapshot") is None


def test_add_sn_bay_przyjmuje_pomiar_napiecia_szyn_na_stacji_przelotowej() -> None:
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    wynik = _dodaj_pole_pomiarowe(
        enm, bus_ref=szyna_sn, station_ref=station_ref, funkcja="NAPIECIA_SZYN"
    )
    assert not wynik.get("error"), wynik.get("error")
    stacja = next(s for s in wynik["snapshot"]["substations"] if s["ref_id"] == station_ref)
    pomiar = _specyfikacje_pol(stacja)[-1]
    assert pomiar["bay_role"] == "MEASUREMENT"
    assert pomiar["funkcja_pomiaru"] == "NAPIECIA_SZYN"
    assert "rodzaj_pomiaru" not in pomiar


def test_add_sn_bay_bez_deklaracji_jest_pomiarem_napiecia_szyn() -> None:
    """Pin reguły domyślnej drogi dokładania pola (kontrakt §5, V12K-336
    pkt 4): pole pomiarowe dokładane do istniejącej rozdzielni to
    konstrukcyjnie pole pomiaru napięcia szyn (przekładniki napięciowe
    sekcji) — status układu pomiarowego ENERGII wymaga deklaracji JAWNEJ."""
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    wynik = _dodaj_pole_pomiarowe(enm, bus_ref=szyna_sn, station_ref=station_ref)
    assert not wynik.get("error"), wynik.get("error")
    stacja = next(s for s in wynik["snapshot"]["substations"] if s["ref_id"] == station_ref)
    spec = _specyfikacje_pol(stacja)[-1]
    assert spec["funkcja_pomiaru"] == "NAPIECIA_SZYN"
    assert "rodzaj_pomiaru" not in spec


def test_add_sn_bay_pin_gpz_pomiar_napiecia_szyn_wolny() -> None:
    """PIN GPZ (rozróżnienie klasowe zamiast wyjątku, V12K-336 pkt 4): pole
    pomiarowe na szynie rozdzielni GPZ to pomiar napięcia szyn — legalne bez
    deklaracji; rozdzielnia GPZ nie ma pary tranzytowej, więc także jawny
    układ pomiarowy energii (przyłącze z rozdzielni OSD, kontrakt §2)
    pozostaje wolny."""
    gpz_snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": "src-gpz-15kv-250mva-rx010"},
    )["snapshot"]
    substation = gpz_snapshot["substations"][0]
    # Bez deklaracji — pomiar napięcia szyn.
    wynik = _dodaj_pole_pomiarowe(
        copy.deepcopy(gpz_snapshot),
        bus_ref=substation["bus_refs"][0],
        station_ref=substation["ref_id"],
    )
    assert not wynik.get("error"), wynik.get("error")
    stacja = next(
        s for s in wynik["snapshot"]["substations"] if s["ref_id"] == substation["ref_id"]
    )
    assert _specyfikacje_pol(stacja)[-1]["funkcja_pomiaru"] == "NAPIECIA_SZYN"
    # Jawny układ energii (podstawowy) — wolny na GPZ (brak pary tranzytowej).
    wynik = _dodaj_pole_pomiarowe(
        copy.deepcopy(gpz_snapshot),
        bus_ref=substation["bus_refs"][0],
        station_ref=substation["ref_id"],
        rodzaj="PODSTAWOWY",
    )
    assert not wynik.get("error"), wynik.get("error")
    stacja = next(
        s for s in wynik["snapshot"]["substations"] if s["ref_id"] == substation["ref_id"]
    )
    spec = _specyfikacje_pol(stacja)[-1]
    assert spec["funkcja_pomiaru"] == "UKLAD_ENERGII"
    assert spec["rodzaj_pomiaru"] == "PODSTAWOWY"


def test_add_sn_bay_przyjmuje_uklad_energii_na_stacji_koncowej() -> None:
    """Koniec gałęzi: stacja końcowa nie prowadzi tranzytu — układ pomiarowy
    energii dokładany do jej rozdzielnicy jest wolny."""
    enm, _odcinki = _magistrala(2)
    koniec = enm["branches"][-1]["to_bus_ref"]
    wynik_stacji = _wykonaj(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"name": "Stacja końcowa", "station_type": "terminal"},
            "transformer": {"transformer_catalog_ref": TRAFO_630},
            "sn_fields": [{"field_role": "LINIA_IN"}, {"field_role": "TRANSFORMATOROWE"}],
            "nn_voltage_kv": 0.4,
        },
    )
    stacja = _stacja_z_wyboru(wynik_stacji)
    wynik = _dodaj_pole_pomiarowe(
        wynik_stacji["snapshot"],
        bus_ref=_szyna_sn(stacja, wynik_stacji["snapshot"]),
        station_ref=stacja["ref_id"],
        rodzaj="PODSTAWOWY",
    )
    assert not wynik.get("error"), wynik.get("error")


def test_add_sn_bay_przyjmuje_uklad_energii_za_czysta_petla_osd() -> None:
    """Przyrostowa budowa złącza klasy C: rozdzielnica [dopływ, odpływ pętli]
    prowadzi tranzyt, ale układ pomiarowy energii dołożony ZA pętlą jest polem
    odpływowym gałęzi klienta — ta sama reguła pozycyjna, co przy wcięciu."""
    enm, odcinki = _magistrala(3)
    wynik_zlacza = _wykonaj(
        enm,
        "insert_station_on_segment_sn",
        _payload_wciecia(
            odcinki[1],
            [{"field_role": "LINIA_IN"}, {"field_role": "LINIA_OUT"}],
            nazwa="Złącze pętlowe",
            transformer={"create": False},
        ),
    )
    stacja = _stacja_z_wyboru(wynik_zlacza)
    wynik = _dodaj_pole_pomiarowe(
        wynik_zlacza["snapshot"],
        bus_ref=_szyna_sn(stacja, wynik_zlacza["snapshot"]),
        station_ref=stacja["ref_id"],
        rodzaj="PODSTAWOWY",
    )
    assert not wynik.get("error"), wynik.get("error")
    stacja_po = next(s for s in wynik["snapshot"]["substations"] if s["ref_id"] == stacja["ref_id"])
    spec = _specyfikacje_pol(stacja_po)[-1]
    assert spec["funkcja_pomiaru"] == "UKLAD_ENERGII"
    assert spec["rodzaj_pomiaru"] == "PODSTAWOWY"


def test_add_sn_bay_pole_za_pomiarem_nie_rusza_istniejacego_pomiaru() -> None:
    """Pin deklaracji o niezmienności prefiksów: dołożenie pola NA KOŃCU
    sekwencji nie zmienia prefiksu żadnego istniejącego pomiaru, więc legalne
    złącze klasy C przyjmuje kolejne pole rezerwowe bez odmowy."""
    enm, odcinki = _magistrala(3)
    wynik_zlacza = _wykonaj(
        enm,
        "insert_station_on_segment_sn",
        _payload_wciecia(
            odcinki[1],
            [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": "PODSTAWOWY"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            nazwa="Złącze ZK-SN",
        ),
    )
    stacja = _stacja_z_wyboru(wynik_zlacza)
    wynik = execute_domain_operation(
        enm_dict=wynik_zlacza["snapshot"],
        op_name="add_sn_bay",
        payload={
            "bus_ref": _szyna_sn(stacja, wynik_zlacza["snapshot"]),
            "station_ref": stacja["ref_id"],
            "bay_role": "OUT",
            "apparatus_kind": "BREAKER",
        },
    )
    assert not wynik.get("error"), wynik.get("error")


def test_add_sn_bay_rekonfiguracja_pola_na_uklad_energii_podlega_bramie() -> None:
    """Rekonfiguracja ISTNIEJĄCEGO pola (existing_field_ref) na układ pomiarowy
    energii ocenia pole na JEGO pozycji — na stacji przelotowej prefiks
    zawiera pola spoza pętli, więc brama odmawia tak samo jak przy nowym polu."""
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    wynik_pola = _wykonaj(
        enm,
        "add_sn_bay",
        {
            "bus_ref": szyna_sn,
            "station_ref": station_ref,
            "bay_role": "FEEDER",
            "apparatus_kind": "BREAKER",
        },
    )
    stacja = next(s for s in wynik_pola["snapshot"]["substations"] if s["ref_id"] == station_ref)
    field_ref = _specyfikacje_pol(stacja)[-1]["field_ref"]
    wynik = execute_domain_operation(
        enm_dict=wynik_pola["snapshot"],
        op_name="add_sn_bay",
        payload={
            "existing_field_ref": field_ref,
            "bus_ref": szyna_sn,
            "station_ref": station_ref,
            "bay_role": "MEASUREMENT",
            "apparatus_kind": "MEASUREMENT",
            "rodzaj_pomiaru": "KONTROLNY",
        },
    )
    assert wynik.get("error_code") == "sn.pomiar_w_torze_tranzytu"


def test_add_sn_bay_rekonfiguracja_pomiaru_na_inna_role_usuwa_atrybuty() -> None:
    """Atrybuty nie mogą kłamać o roli: pole rekonfigurowane z pomiaru na
    odgałęzienie traci `funkcja_pomiaru` i `rodzaj_pomiaru`."""
    gpz_snapshot = _wykonaj(
        _pusty_enm(),
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": "src-gpz-15kv-250mva-rx010"},
    )["snapshot"]
    substation = gpz_snapshot["substations"][0]
    wynik_pomiaru = _wykonaj(
        gpz_snapshot,
        "add_sn_bay",
        {
            "bus_ref": substation["bus_refs"][0],
            "station_ref": substation["ref_id"],
            "bay_role": "MEASUREMENT",
            "apparatus_kind": "MEASUREMENT",
            "rodzaj_pomiaru": "PODSTAWOWY",
        },
    )
    stacja = next(
        s for s in wynik_pomiaru["snapshot"]["substations"] if s["ref_id"] == substation["ref_id"]
    )
    spec_pomiaru = _specyfikacje_pol(stacja)[-1]
    assert spec_pomiaru["funkcja_pomiaru"] == "UKLAD_ENERGII"
    assert spec_pomiaru["rodzaj_pomiaru"] == "PODSTAWOWY"
    wynik = _wykonaj(
        wynik_pomiaru["snapshot"],
        "add_sn_bay",
        {
            "existing_field_ref": spec_pomiaru["field_ref"],
            "bus_ref": substation["bus_refs"][0],
            "station_ref": substation["ref_id"],
            "bay_role": "FEEDER",
            "apparatus_kind": "BREAKER",
        },
    )
    stacja_po = next(
        s for s in wynik["snapshot"]["substations"] if s["ref_id"] == substation["ref_id"]
    )
    spec_po = next(
        spec
        for spec in _specyfikacje_pol(stacja_po)
        if spec.get("field_ref") == spec_pomiaru["field_ref"]
    )
    assert spec_po["bay_role"] == "FEEDER"
    assert "funkcja_pomiaru" not in spec_po
    assert "rodzaj_pomiaru" not in spec_po


def test_add_sn_bay_odmawia_bledow_deklaracji() -> None:
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    wynik = _dodaj_pole_pomiarowe(
        enm, bus_ref=szyna_sn, station_ref=station_ref, rodzaj="ROZLICZENIOWY"
    )
    assert wynik.get("error_code") == "sn.rodzaj_pomiaru_nieznany"
    wynik = _dodaj_pole_pomiarowe(
        enm, bus_ref=szyna_sn, station_ref=station_ref, funkcja="TARYFOWA"
    )
    assert wynik.get("error_code") == "sn.funkcja_pomiaru_nieznana"
    wynik = _dodaj_pole_pomiarowe(
        enm,
        bus_ref=szyna_sn,
        station_ref=station_ref,
        funkcja="NAPIECIA_SZYN",
        rodzaj="PODSTAWOWY",
    )
    assert wynik.get("error_code") == "sn.rodzaj_pomiaru_poza_ukladem_energii"
    wynik = _dodaj_pole_pomiarowe(
        enm, bus_ref=szyna_sn, station_ref=station_ref, rodzaj="KONTROLNY", bay_role="OUT"
    )
    assert wynik.get("error_code") == "sn.pomiar_poza_polem_pomiarowym"


def test_add_sn_bay_pomiar_jest_deterministyczny() -> None:
    """Ten sam model + ten sam payload ⇒ identyczna migawka (hash ENM)."""
    enm, odcinki = _magistrala(3)
    enm, station_ref, szyna_sn = _stacja_przelotowa(enm, odcinki[1])
    pierwszy = _dodaj_pole_pomiarowe(
        copy.deepcopy(enm), bus_ref=szyna_sn, station_ref=station_ref, funkcja="NAPIECIA_SZYN"
    )
    drugi = _dodaj_pole_pomiarowe(
        copy.deepcopy(enm), bus_ref=szyna_sn, station_ref=station_ref, funkcja="NAPIECIA_SZYN"
    )
    assert compute_enm_hash(
        EnergyNetworkModel.model_validate(pierwszy["snapshot"])
    ) == compute_enm_hash(EnergyNetworkModel.model_validate(drugi["snapshot"]))
    assert json.dumps(pierwszy["snapshot"], sort_keys=True) == json.dumps(
        drugi["snapshot"], sort_keys=True
    )


# ---------------------------------------------------------------------------
# Droga: stacja na końcu ciągu (budowa stacji — domyślnie układ energii)
# ---------------------------------------------------------------------------


def test_stacja_koncowa_bez_deklaracji_utrwala_uklad_podstawowy() -> None:
    """Droga budowy stacji deklaruje przyłącze (kontrakt §3 reguła 1), więc
    pole POMIAROWE bez deklaracji dostaje jawny zapis układu pomiarowego
    energii o rodzaju PODSTAWOWYM."""
    enm, _odcinki = _magistrala(2)
    koniec = enm["branches"][-1]["to_bus_ref"]
    wynik = _wykonaj(
        enm,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": koniec,
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"name": "Stacja abonencka", "station_type": "terminal"},
            "transformer": {"transformer_catalog_ref": TRAFO_630},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "POMIAROWE"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "nn_voltage_kv": 0.4,
        },
    )
    stacja = _stacja_z_wyboru(wynik)
    pomiar = next(
        spec for spec in _specyfikacje_pol(stacja) if spec.get("bay_role") == "MEASUREMENT"
    )
    assert pomiar["funkcja_pomiaru"] == "UKLAD_ENERGII"
    assert pomiar["rodzaj_pomiaru"] == "PODSTAWOWY"


def test_stacja_koncowa_odmawia_nieznanego_rodzaju() -> None:
    enm, _odcinki = _magistrala(2)
    koniec = enm["branches"][-1]["to_bus_ref"]
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="append_station_on_endpoint",
        payload={
            "endpoint_bus_ref": koniec,
            "field_apparatus_catalog_ref": APARAT_SN,
            "station": {"name": "Stacja abonencka", "station_type": "terminal"},
            "transformer": {"transformer_catalog_ref": TRAFO_630},
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "POMIAROWE", "rodzaj_pomiaru": "TARYFOWY"},
            ],
            "nn_voltage_kv": 0.4,
        },
    )
    assert wynik.get("error_code") == "sn.rodzaj_pomiaru_nieznany"


# ---------------------------------------------------------------------------
# Koherencja pary predykatów: klasa przyłączenia ↔ brama tranzytu
# ---------------------------------------------------------------------------


def test_klasa_i_brama_sa_koherentne_na_ksztaltach_kontraktu() -> None:
    """Para predykatów z jednego kontraktu (§3): klasa B (droga odgałęzienia)
    ⇔ brama wcięcia odmawia; klasa C (wcięcie z pętlą) ⇔ brama przepuszcza.
    Rozjazd którejkolwiek strony = dwie prawdy o tym samym układzie."""
    ksztalty = [
        ["LINIA_IN", "POMIAROWE", "TRANSFORMATOROWE"],
        ["LINIA_IN", "POMIAROWE", "TRANSFORMATOROWE", "LINIA_OUT"],
        ["LINIA_IN", "LINIA_OUT", "POMIAROWE", "TRANSFORMATOROWE"],
        ["LINIA_IN", "LINIA_OUT", "POMIAROWE", "TRANSFORMATOROWE", "TRANSFORMATOROWE"],
        ["LINIA_IN", "LINIA_OUT", "TRANSFORMATOROWE"],
    ]
    for role in ksztalty:
        klasa = klasa_przylaczenia_sn(role)
        blad = blad_pomiaru_w_torze_tranzytu(
            [(rola, "UKLAD_ENERGII" if rola == "POMIAROWE" else None) for rola in role],
            szyna_prowadzi_tranzyt=True,
            kod_bledu="x",
        )
        if klasa == "B":
            assert blad is not None, role
        elif klasa == "C":
            assert blad is None, role
        else:
            assert blad is None, role
