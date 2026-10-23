"""Składowa zerowa linii i kabli SN z założenia katalogu jest wartością roboczą (ESTIMATED).

DLACZEGO. Karta LINIA-110 (rozstrzygnięcie architekta, pkt 2; zasada nr 4; kontrakt werdyktu
§3): żadna pozycja katalogu linii napowietrznych i kabli SN nie ma R′0/X′0 z karty producenta
— katalog wyprowadzał je regułą ``R′0 = 3·R′1``, ``X′0 = 3·X′1`` albo ``R′0 = R′1 + R′ żyły
powrotnej`` bez podstawy, a wynik zwarcia doziemnego wyglądał jak pełny dowód. Teraz pozycja
niesie mapę ``wartosci_robocze`` (pole → założenie), gałąź dostaje ją przy materializacji, bieg
zwarcia doziemnego ma założenie ``branch.z0_wartosc_robocza``, a werdykty na prądach punktu —
daną przyjętą ``ESTIMATED`` (kompletność ``NIEPELNY``). Projektant zmienia R′0/X′0 w
parametrach odcinka — wartość projektanta nie jest daną przyjętą i przeżywa uzupełnienie
katalogu (jeden predykat ``wartosc_projektanta`` po obu stronach granicy).

ILOCZYN CECH: {Z0 z katalogu, R′0 projektanta (X′0 nadal z katalogu), oba pola projektanta}
× {zwarcie doziemne 1F, zwarcie trójfazowe} × {punkt SN (sieć zerowa kabla), punkt nN za
transformatorem Dyn11 (sieć zerowa rozdzielona)}; rozpływ niesymetryczny: {odbiór faza–N na
SN (realny I0 w kablu), odbiór na nN (I0 zamyka się w Dyn11)}.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from api.generators import _prady_zwarciowe_szyny
from application.analyses.lv_domain.upstream_equivalent import build_upstream_equivalent_snapshot
from application.analyses.wniosek_osd import _zwarcia_sekcja
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.protection_settings.batch_run import _dane_przyjete_punktow
from domain.fault_scenario import FaultLocation, FaultType, ShortCircuitConfig, new_fault_scenario
from enm.canonical_analysis import (
    _wykonaj_analize_biegu,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.catalog_completion import complete_branch_catalog_materialization
from enm.dane_przyjete_galezi import KLUCZ_WIERSZA_DANE_GALEZI, KOD_Z0_ROBOCZE
from enm.domain_operations import execute_domain_operation
from enm.mapping import ref_to_graph_id
from enm.models import EnergyNetworkModel, Substation
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from network_model.catalog.repository import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import (
    ZALOZENIE_R0_TRZY_R1,
    ZALOZENIE_R0_ZYLA_POWROTNA,
    ZALOZENIE_X0_TRZY_X1,
)

from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _build_mv_lv_enm
from tests.enm.test_rozplyw_niesymetryczny_bieg import bieg as bieg_niesymetryczny
from tests.enm.test_rozplyw_niesymetryczny_bieg import siec as siec_niesymetryczna

#: Kabel SN z żyłą powrotną w oznaczeniu (R′0 = R′1 + R′ żyły powrotnej, X′0 = 3·X′1).
KABEL_SN = "cable-tfk-yakxs-3x120"

#: Wariant parametrów odcinka: pola, które zmienia projektant (wartości różne od katalogowych).
WARIANTY = {
    "katalog": {},
    "r0_projektanta": {"r0_ohm_per_km": 0.9},
    "projektant": {"r0_ohm_per_km": 0.9, "x0_ohm_per_km": 0.35},
}


@pytest.fixture(autouse=True)
def _czysty_magazyn():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _ok(wynik: dict[str, Any]) -> dict[str, Any]:
    assert wynik.get("error") is None, wynik.get("error")
    return wynik["snapshot"]


def _migawka(wariant: str) -> dict[str, Any]:
    """Sieć SN+nN (GPZ → kabel SN → Dyn11 → nN) z kablem SN przypiętym do pozycji katalogu
    ścieżką użytkownika (przypisanie katalogu, potem ewentualna zmiana R′0/X′0 projektanta)."""
    migawka = _build_mv_lv_enm("z0-robocze").model_dump(mode="json")
    migawka = _ok(
        execute_domain_operation(
            migawka,
            "assign_catalog_to_element",
            {
                "element_ref": "C_SN",
                "catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": KABEL_SN,
                    "catalog_item_version": "2024.1",
                },
                "source_mode": "KATALOG",
            },
        )
    )
    if WARIANTY[wariant]:
        migawka = _ok(
            execute_domain_operation(
                migawka,
                "update_element_parameters",
                {"element_ref": "C_SN", "parameters": dict(WARIANTY[wariant])},
            )
        )
    return migawka


def _kabel(migawka: dict[str, Any]) -> dict[str, Any]:
    return next(b for b in migawka["branches"] if b["ref_id"] == "C_SN")


def _opcje(szyna: str, rodzaj: FaultType) -> dict[str, Any]:
    spec = new_fault_scenario(
        study_case_id="z0",
        name="Zwarcie",
        fault_type=rodzaj,
        location=FaultLocation(element_ref=szyna, location_type="BUS"),
        config=ShortCircuitConfig.from_dict({"scenariusz": "MAX", "thermal_time_seconds": 0.5}),
    )
    return opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id=f"scn-{szyna}-{rodzaj.value}",
            name="t",
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=spec,
        )
    )


def _bieg(migawka: dict[str, Any], szyna: str, rodzaj: FaultType) -> Any:
    set_enm("z0", EnergyNetworkModel.model_validate(migawka))
    run = create_run(
        case_id="z0",
        klucz_twin="z0",
        analysis_type="short_circuit_sn",
        options=_opcje(szyna, rodzaj),
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik


def _pola_robocze(wariant: str) -> list[str]:
    return [p for p in ("r0_ohm_per_km", "x0_ohm_per_km") if p not in WARIANTY[wariant]]


# ---------------------------------------------------------------------------
# Katalog: każda wyprowadzona składowa zerowa ma założenie
# ---------------------------------------------------------------------------


def test_kazda_pozycja_sn_ze_skladowa_zerowa_niesie_zalozenie() -> None:
    """Inwentarz klasy (pomiar 2026-10-22): 25 linii i 62 kable SN z R′0/X′0, 0 z karty
    producenta — każda pozycja ma oba pola w ``wartosci_robocze`` z założeniem z rejestru."""
    katalog = get_default_mv_catalog()
    zalozenia_r0 = {ZALOZENIE_R0_TRZY_R1, ZALOZENIE_R0_ZYLA_POWROTNA}
    liczba = 0
    for grupa in (katalog.line_types, katalog.cable_types):
        for identyfikator, typ in grupa.items():
            if typ.r0_ohm_per_km is None:
                continue
            liczba += 1
            robocze = dict(typ.wartosci_robocze)
            assert robocze.get("r0_ohm_per_km") in zalozenia_r0, identyfikator
            assert robocze.get("x0_ohm_per_km") == ZALOZENIE_X0_TRZY_X1, identyfikator
            if robocze["r0_ohm_per_km"] == ZALOZENIE_R0_TRZY_R1:
                assert typ.r0_ohm_per_km == pytest.approx(3.0 * typ.r_ohm_per_km, abs=1e-6)
            assert typ.x0_ohm_per_km == pytest.approx(3.0 * typ.x_ohm_per_km, abs=1e-6)
    assert liczba == 87


# ---------------------------------------------------------------------------
# Materializacja i wartość projektanta
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wariant", sorted(WARIANTY))
def test_wartosc_projektanta_przezywa_uzupelnienie_katalogu(wariant: str) -> None:
    migawka = _migawka(wariant)
    kabel = _kabel(migawka)
    robocze = (kabel["materialized_params"] or {}).get("wartosci_robocze") or {}
    assert {"r0_ohm_per_km", "x0_ohm_per_km"} <= set(robocze)
    for pole, wartosc in WARIANTY[wariant].items():
        assert kabel[pole] == wartosc
    enm, _ = complete_branch_catalog_materialization(EnergyNetworkModel.model_validate(migawka))
    po = next(b for b in enm.branches if b.ref_id == "C_SN")
    for pole in ("r0_ohm_per_km", "x0_ohm_per_km"):
        assert getattr(po, pole) == kabel[pole], pole


# ---------------------------------------------------------------------------
# Bieg zwarciowy: iloczyn wariant × rodzaj zwarcia × punkt
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("szyna", [N1, N2])
@pytest.mark.parametrize("rodzaj", [FaultType.SC_1F, FaultType.SC_3F])
@pytest.mark.parametrize("wariant", sorted(WARIANTY))
def test_zalozenie_i_dane_przyjete_z0_tylko_w_sieci_zerowej_kabla(
    wariant: str, rodzaj: FaultType, szyna: str
) -> None:
    bieg = _bieg(_migawka(wariant), szyna, rodzaj)
    pola = _pola_robocze(wariant)
    doziemne = rodzaj is FaultType.SC_1F
    zalozenia = [
        z for z in (bieg.raw_result or {}).get("zalozenia") or [] if z.get("code") == KOD_Z0_ROBOCZE
    ]
    # Założenie biegu: każde zwarcie doziemne liczy Z0 całej sieci (macierz Y0), więc kabel
    # z wartością roboczą jest nazwany niezależnie od punktu.
    assert [z["element_ref"] for z in zalozenia] == (["C_SN"] if doziemne and pola else [])
    if zalozenia:
        assert zalozenia[0]["parametr"] == pola[0]
    [wiersz] = (bieg.raw_result or {})["results"]
    dane = list(wiersz.get(KLUCZ_WIERSZA_DANE_GALEZI) or [])
    # Dana przyjęta wiersza: wyłącznie punkt w składowej sieci zerowej kabla (SN); punkt nN za
    # Dyn11 ma własną sieć zerową — Z0 kabla SN nie wchodzi do jego prądu.
    if doziemne and pola and szyna == N1:
        assert [d["nazwa_pl"].split()[0] for d in dane] == [
            {"r0_ohm_per_km": "R′0", "x0_ohm_per_km": "X′0"}[p] for p in sorted(pola)
        ]
        assert {d["jakosc"] for d in dane} == {"ESTIMATED"}
    else:
        assert KLUCZ_WIERSZA_DANE_GALEZI not in wiersz


# ---------------------------------------------------------------------------
# Równoważnik sieci SN dla domeny nN (Z1 i Z0 wprost z modelu)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wariant", sorted(WARIANTY))
def test_rownowaznik_sn_niesie_dane_przyjete_z0(wariant: str) -> None:
    enm = EnergyNetworkModel.model_validate(_migawka(wariant))
    enm.substations.append(
        Substation(
            ref_id="ST",
            name="Stacja",
            station_type="mv_lv",
            bus_refs=[N1, N2],
            transformer_refs=["TR1"],
        )
    )
    rownowaznik = build_upstream_equivalent_snapshot(enm, "z0", "ST")
    assert rownowaznik["status"] == "OK", rownowaznik
    assert rownowaznik["z0_ohm"] is not None
    if _pola_robocze(wariant):
        assert rownowaznik["status_danych"] == "UNVALIDATED_INPUT"
        assert {d["jakosc"] for d in rownowaznik["dane_przyjete"]} == {"ESTIMATED"}
    else:
        assert "dane_przyjete" not in rownowaznik
        assert "status_danych" not in rownowaznik


# ---------------------------------------------------------------------------
# Rozpływ niesymetryczny: założenie tylko dla gałęzi z realnym I0
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("szyna_odbioru", ["b_sn", "b_nn"])
@pytest.mark.parametrize("robocza", [True, False])
def test_rozplyw_niesymetryczny_zalozenie_z0_galezi_z_realnym_i0(
    szyna_odbioru: str, robocza: bool
) -> None:
    """Kabel z mapą ``wartosci_robocze`` taką jak w pozycji katalogu (wartości gałęzi = wartości
    tabliczki). I0 płynie kablem wyłącznie przy odbiorze faza–N na SN; odbiór nN zamyka I0 w
    Dyn11 — Z0 kabla nie wchodzi wtedy do równań i nie jest założeniem."""
    enm = siec_niesymetryczna(fazy="A", szyna_odbioru=szyna_odbioru)
    kabel = next(b for b in enm.branches if b.ref_id == "cab1")
    if robocza:
        kabel.materialized_params = {
            "r0_ohm_per_km": kabel.r0_ohm_per_km,
            "x0_ohm_per_km": kabel.x0_ohm_per_km,
            "wartosci_robocze": {
                "r0_ohm_per_km": ZALOZENIE_R0_TRZY_R1,
                "x0_ohm_per_km": ZALOZENIE_X0_TRZY_X1,
            },
        }
    run = bieg_niesymetryczny(enm)
    _wykonaj_analize_biegu(run)
    kody = {z["kod"]: z["elementy"] for z in run.raw_result["zalozenia"]}
    if robocza and szyna_odbioru == "b_sn":
        assert kody[KOD_Z0_ROBOCZE] == ["cab1"]
    else:
        assert KOD_Z0_ROBOCZE not in kody


# ---------------------------------------------------------------------------
# Konsumenci prądów punktu: ten sam znacznik wiersza co przy tolerancji sieci nN
# ---------------------------------------------------------------------------

#: Znacznik danej przyjętej Z0 w zserializowanym wyniku konsumenta (``dana_przyjeta_z0``).
ZNACZNIK_Z0 = "z katalogu ("


def _ile_z0(obiekt: Any) -> int:
    return json.dumps(obiekt, ensure_ascii=False, default=str).count(ZNACZNIK_Z0)


@pytest.mark.parametrize("wariant", ["katalog", "projektant"])
def test_konsumenci_pradow_punktu_doziemnego_niosa_dane_przyjete_z0(wariant: str) -> None:
    """Zwarcie doziemne w punkcie SN: wniosek do OSD (sekcja zwarć), nastawy z biegów
    i wytrzymałość cieplna czytają dane przyjęte z TEGO SAMEGO wiersza co prąd
    (``dane_przyjete_galezi_wiersza``) — R′0 i X′0 kabla z katalogu. Reguły generatorów pola
    czytają wyłącznie wiersz 3F — bez danej Z0."""
    robocza = wariant == "katalog"
    oczekiwane = 2 if robocza else 0  # R′0 i X′0
    migawka = _migawka(wariant)
    bieg = _bieg(migawka, N1, FaultType.SC_1F)

    sekcja = _zwarcia_sekcja(bieg, N1)
    assert _ile_z0(sekcja.get("dane_przyjete", [])) == oczekiwane

    # Reguły generatorów pola liczą WYŁĄCZNIE prądem zwarcia trójfazowego — Z0 nie wchodzi
    # do niego, więc wiersz 3F tej samej sieci nie niesie danej przyjętej Z0 (predykat parą).
    _bieg(migawka, N1, FaultType.SC_3F)
    ik, _ip, _run_id, _tolerancja, dane_galezi, _maszyny = _prady_zwarciowe_szyny("z0", N1)
    assert ik is not None
    assert dane_galezi == ()

    dane_nastaw = _dane_przyjete_punktow(
        EnergyNetworkModel.model_validate(migawka),
        [(bieg.raw_result, ref_to_graph_id(N1), N1)],
    )
    assert _ile_z0([d.model_dump(mode="json") for d in dane_nastaw]) == oczekiwane

    widok_cieplny = build_wytrzymalosc_cieplna_view(bieg)
    assert ("dane_przyjete" in widok_cieplny) is robocza
    assert _ile_z0(widok_cieplny.get("dane_przyjete", [])) == oczekiwane


# ---------------------------------------------------------------------------
# Widok sekcji modelu: typ i element tą samą regułą jakości
# ---------------------------------------------------------------------------


def _jakosci_skladowej_zerowej(oceny: Any) -> dict[str, Any]:
    sekcja = next(o for o in oceny if o.sekcja == "short_circuit")
    skladnik = next(s for s in sekcja.skladniki if s.nazwa == "skladowa_zerowa")
    return {dana.nazwa_pl: dana.jakosc for dana in skladnik.dane_przyjete}


@pytest.mark.parametrize(
    ("przestrzen", "typ_id"),
    [("KABEL_SN", KABEL_SN), ("LINIA_SN", None)],
)
def test_widok_sekcji_typu_i_elementu_oznacza_z0_robocze_estimated(
    przestrzen: str, typ_id: str | None
) -> None:
    """Pole z mapy ``wartosci_robocze`` ma w widoku sekcji jakość ``ESTIMATED`` (nie
    „niezadeklarowaną") — dla typu katalogowego (krotka par) i dla elementu zmaterializowanego
    z tego typu (słownik w ``materialized_params``): JEDNA reguła ``jakosci_wartosci_roboczych``,
    parytet typ ↔ element."""
    from application.model_urzadzenia.sekcje_elementu import sekcje_elementu
    from network_model.catalog.sekcje_modelu import sekcje_typu
    from werdykt.proweniencja import FieldQuality

    katalog = get_default_mv_catalog()
    if typ_id is None:
        typ_id = next(t.id for t in katalog.list_line_types() if t.wartosci_robocze)
    typ = katalog.get_line_type(typ_id) if przestrzen == "LINIA_SN" else None
    typ = typ or katalog.get_cable_type(typ_id)
    oznaczone = dict(typ.wartosci_robocze)
    assert {"r0_ohm_per_km", "x0_ohm_per_km"} <= set(oznaczone)

    jakosci_typu = _jakosci_skladowej_zerowej(sekcje_typu(katalog, przestrzen, typ_id))
    assert jakosci_typu == {
        "r0_ohm_per_km": FieldQuality.ESTIMATED,
        "x0_ohm_per_km": FieldQuality.ESTIMATED,
    }

    if przestrzen == "KABEL_SN":
        migawka = _migawka("katalog")
        assert _jakosci_skladowej_zerowej(sekcje_elementu(migawka, "C_SN")) == jakosci_typu
