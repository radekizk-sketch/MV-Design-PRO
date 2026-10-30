"""Generator fixtur rekordów „ocena niewykonana" dla testów ekranów frontu.

Ekrany FRT, dynamiki czasowej, SSCI, LoM i analiz specjalistycznych pokazują rekord kontraktu
werdyktu (``werdykt.OcenaKryterium`` o statusie ``NIE_OCENIONO``) przez kartę werdyktu.
Testy frontu nie mogą składać takiego rekordu ręcznie — pola wyprowadzane regułą (status,
etykieta, zdanie, braki, zastrzeżenia, kompletność) muszą być DOKŁADNIE tym, co zwraca
backend. Ten generator buduje rekordy TYMI SAMYMI funkcjami, których używają końcówki,
na danych wejściowych fixtur frontu, i zapisuje je do ``__tests__/rekordyOceny.json``
każdego ekranu. Ta sama zasada obejmuje widoki ekranu ochrony LoM z rekordami porównań, pól i sieci
(``ui2/oze/lom/__tests__/widokiOchronyLom.json`` = wynik ``build_ochrona_lom_view``, funkcji
końcówki ``GET /api/oze-analysis/lom-protection``).
Parytet plików z backendem pilnuje ``test_fixtury_ocen_fe.py``.

Uruchomienie (z katalogu ``backend/``):
    PYTHONPATH=src:. python tests/uczciwosc/generuj_fixtury_ocen_fe.py
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from analysis.energy_validation.builder import _pozycja as _pozycja_walidacji
from analysis.energy_validation.models import EnergyCheckType
from analysis.energy_validation.serializer import item_to_dict
from analysis.grid_strength.builder import GridStrengthBuilder
from analysis.grid_strength.models import BusSourceModule, BusStrengthInput, GridStrengthContext
from analysis.normative.models import NormativeConfig
from analysis.reactive_adequacy import (
    BusVoltageInput,
    LoadReactiveInput,
    ReactiveAdequacyBuilder,
    ReactiveAdequacyContext,
    SourceReactiveInput,
)
from analysis.sensitivity.builder import SensitivityBuilder
from analysis.ssci_stability.models import ocena_ssci_niewykonana
from analysis.voltage_profile.builder import wiersz_profilu
from analysis.voltage_profile.models import VoltageProfileSummary, VoltageProfileView
from application.analyses.der_sn_track import DerSnTrack, extract_der_sn_track
from application.analyses.frt_sekwencja import build_frt_sekwencja_view
from application.analyses.frt_trajektorie import build_frt_trajectories_view
from application.analyses.ochrona_lom import (
    _liczniki_statusow,
    _ocena_sieci,
    _pole_widoku,
    build_ochrona_lom_view,
)
from application.analyses.raport_zgodnosci import build_compliance_report_from_track
from application.analyses.werdykt_projektowy import (
    ZRODLO_MODEL,
    ZRODLO_PF,
    WerdyktProjektowy,
    ZrodloWerdyktu,
    _pozycja_der_sn,
    _pozycje_walidacji_energetycznej,
)
from application.dynamika.opis_wyniku import oceny_biegu_dynamiki
from application.ocena_niewykonana import rekord_json
from application.proof_engine.packs.audit2_validation import (
    BrakDanychDowodu,
    SpecDowoduEksportuStacji,
    SpecDowoduPlanuZaczepow,
    SpecDowoduTrybowBess,
    SpecDowoduUziemieniaPrzekladnika,
    SpecDowoduWytrzymalosciAparatu,
    generate_bess_modes_proof,
    generate_device_withstand_proof,
    generate_hosting_capacity_export_proof,
    generate_station_audit2_proof_pack,
    generate_tap_changer_plan_proof,
    generate_vt_grounding_validation_proof,
    liczby_statusow_projektu,
)
from application.v126_artifacts import ocena_jakosci_energii_niewykonana
from catalog.profiles.nc_rfg.loader import load_nc_rfg_profile
from enm.models import (
    Bay,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    ProtectionAssignment,
    ProtectionSetting,
)
from network_model.catalog.repository import get_default_mv_catalog
from werdykt import OcenaKryterium

from tests.golden.zapis_fikstur import json_fikstury

_FRONTEND_SRC = Path(__file__).resolve().parents[3] / "frontend" / "src"

#: Moduł DER i operator fixtur okna FRT (`ui2/oze/frt/__tests__/fixtures.ts`).
_FRT_DER = "conv-pv-1mw-15kv"
_FRT_OPERATOR = "pse"
#: Sekwencje zapadów fixtur okna FRT (głębokość p.u., czas s).
_SEKWENCJA_BEZ_KONTEKSTU = [(0.05, 0.15), (0.3, 0.2)]
_SEKWENCJA_Z_KONTEKSTEM = [(0.05, 0.15), (0.02, 0.5)]


def _frt() -> dict[str, Any]:
    converter = get_default_mv_catalog().get_converter_type(_FRT_DER)
    assert converter is not None, _FRT_DER
    profile = load_nc_rfg_profile(_FRT_OPERATOR)
    wynik: dict[str, Any] = {}
    for rodzaj in ("lvrt", "hvrt"):
        widok = build_frt_trajectories_view(converter, profile, rodzaj)
        wynik[f"trajektoria_{rodzaj}"] = {
            "widok": widok["ocena"],
            "scenariusze": [sc["ocena"] for sc in widok["scenariusze"]],
        }
    # Kontekst siły sieci sekwencji: wiersz widoku SCR z buildera siły sieci (ten sam, którym
    # końcówka sekwencji FRT go dostaje) — węzeł słaby SCR = 45 / 20 = 2,25 < 3.
    wiersz_sily = (
        GridStrengthBuilder()
        .build(
            [
                BusStrengthInput(
                    bus_ref="bus-oze-1",
                    nominal_kv=15.0,
                    s_sc_mva=45.0,
                    s_installed_mva=20.0,
                    modules=(
                        BusSourceModule(ref="gen-oze-1", name="Farma wiatrowa 1", sn_mva=20.0),
                    ),
                    nazwa_pl="Szyna SN farmy wiatrowej",
                )
            ]
        )
        .to_dict()["entries"][0]
    )
    for nazwa, zapady, kontekst in (
        ("sekwencja_bez_kontekstu", _SEKWENCJA_BEZ_KONTEKSTU, None),
        ("sekwencja_z_kontekstem", _SEKWENCJA_Z_KONTEKSTEM, wiersz_sily),
    ):
        widok = build_frt_sekwencja_view(converter, profile, zapady, grid_strength_row=kontekst)
        wynik[nazwa] = {
            "widok": widok["ocena"],
            "zapady": [zapad["ocena"] for zapad in widok["zapady"]],
            "kontekst_sily_sieci": widok["kontekst_sily_sieci"],
        }
    return wynik


def _dynamika() -> dict[str, Any]:
    """Rekordy biegu fixtur ekranu dynamiki (`ui2/wyniki/dynamika/__tests__`) — ta sama
    funkcja, którą składa odpowiedź `GET /api/analysis-runs/{id}/results/dynamika`."""
    migawka = {
        "generators": [
            {
                "ref_id": "gen-pv-1",
                "name": "Farma PV Zachód",
                "gen_type": "pv_inverter",
                "dynamika": {
                    "rodzina": "przeksztaltnik_gfl",
                    "proweniencja": {
                        "zrodlo": "profil_typowy_normy",
                        "odniesienie": "EN 50549-2:2019",
                    },
                },
            }
        ]
    }
    return {
        "bieg_1": oceny_biegu_dynamiki(
            "bieg-1", "Sieć testowa dynamiki", migawka, tryb_scenariusza="siec"
        )
    }


#: Nazwy elementów modelu przedmiotu oceny SSCI (w ścieżce API indeks z migawki biegu).
_NAZWY_SSCI = {"INV1": "Falownik PV 1", "CONV": "Szyna SN farmy PV"}


def _ssci() -> dict[str, Any]:
    return {
        "komplet_tablic": ocena_ssci_niewykonana(
            converter_ref="INV1", bus_ref="CONV", nazwy=_NAZWY_SSCI, tablice_obecne=True
        ),
        "brak_danych": ocena_ssci_niewykonana(
            converter_ref=None,
            bus_ref=None,
            nazwy=_NAZWY_SSCI,
            tablice_obecne=False,
            braki_danych=["converter"],
        ),
    }


def _bay_lom(ref: str, nazwa: str, stacja: str, szyna: str, zabezpieczenie: str | None) -> Bay:
    return Bay(
        ref_id=ref,
        name=nazwa,
        bay_role="OZE",
        substation_ref=stacja,
        bus_ref=szyna,
        protection_ref=zabezpieczenie,
    )


def _zabezpieczenie_lom(ref: str, nastawy: list[ProtectionSetting]) -> ProtectionAssignment:
    return ProtectionAssignment(
        ref_id=ref,
        name=f"Zabezpieczenie LoM {ref}",
        breaker_ref=f"cb-{ref}",
        device_type="custom",
        settings=nastawy,
    )


def _enm_lom_trzy_pola() -> EnergyNetworkModel:
    """Sieć fixtur ekranu LoM (`ui2/oze/lom/__tests__/fixtures.ts`): pole PV bez funkcji LoM,
    pole BESS z nastawą 81R poniżej okna i zwłoką 0,3 s, pole FW z progiem 81U na krawędzi
    okna oraz moduł PV bez pola przyłączeniowego."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Sieć testowa OZE", hash_sha256="enm-hash-123"),
        buses=[
            Bus(ref_id=f"bus-oze-{i}", name=f"Szyna OZE {i}", voltage_kv=15.0) for i in (1, 2, 3, 4)
        ],
        generators=[
            Generator(
                ref_id="gen-pv-1",
                name="PV 1",
                bus_ref="bus-oze-1",
                p_mw=1.0,
                gen_type="pv_inverter",
            ),
            Generator(
                ref_id="gen-bess-1", name="BESS 1", bus_ref="bus-oze-2", p_mw=2.0, gen_type="bess"
            ),
            Generator(
                ref_id="gen-fw-1", name="FW 1", bus_ref="bus-oze-3", p_mw=3.0, gen_type="fw_pmsg"
            ),
            Generator(
                ref_id="gen-fw-2", name="FW 2", bus_ref="bus-oze-3", p_mw=3.0, gen_type="fw_pmsg"
            ),
            Generator(
                ref_id="gen-pv-orphan",
                name="PV bez pola",
                bus_ref="bus-oze-4",
                p_mw=0.5,
                gen_type="pv_inverter",
            ),
        ],
        bays=[
            _bay_lom("bay-pv-a", "Pole PV A", "gpz-1", "bus-oze-1", None),
            _bay_lom("bay-bess-b", "Pole BESS B", "gpz-1", "bus-oze-2", "prot-bess"),
            _bay_lom("bay-fw-c", "Pole FW C", "gpz-2", "bus-oze-3", "prot-fw"),
        ],
        protection_assignments=[
            _zabezpieczenie_lom(
                "prot-bess",
                [
                    ProtectionSetting(
                        function_type="rocof_81R", threshold_hz_s=1.0, time_delay_s=0.3
                    )
                ],
            ),
            _zabezpieczenie_lom(
                "prot-fw",
                [ProtectionSetting(function_type="underfrequency_81U", threshold_hz=47.5)],
            ),
        ],
    )


def _widoki_lom() -> dict[str, Any]:
    """Widoki ekranu LoM: `build_ochrona_lom_view` (TA SAMA funkcja co końcówka) na sieci
    fixtur i na sieci bez modułów wytwórczych; widok z polem BEZ porównań (stan obronny
    `_pole_widoku` — builder zawsze dokłada porównanie obecności) złożony tymi samymi
    funkcjami rekordu pola, liczników i wymagania sieci."""
    trzy_pola = build_ochrona_lom_view(_enm_lom_trzy_pola())
    pusty = build_ochrona_lom_view(
        EnergyNetworkModel(header=ENMHeader(name="Sieć bez OZE", hash_sha256="enm-hash-empty"))
    )
    pole_bez, skladowe_bez = _pole_widoku(
        Bay(
            ref_id="bay-oze-x",
            name="Pole OZE X",
            bay_role="OZE",
            substation_ref="gpz-1",
            bus_ref="bus-oze-9",
        ),
        [],
        [],
        [],
    )
    pole_fw = next(p for p in trzy_pola["fields"] if p["bay_ref"] == "bay-fw-c")
    skladowe_fw = [OcenaKryterium.model_validate(c["ocena"]) for c in pole_fw["checks"]]
    pola = [pole_bez, pole_fw]
    pole_bez_sprawdzen = {
        **trzy_pola,
        "fields": pola,
        "modules_without_field": [],
        "summary": {
            "fields_total": len(pola),
            "generating_modules_total": len(pole_fw["generating_module_refs"]),
            "statusy": _liczniki_statusow(pola),
            "ocena": rekord_json(_ocena_sieci([*skladowe_bez, *skladowe_fw])),
        },
    }
    return {"trzy_pola": trzy_pola, "pusty": pusty, "pole_bez_sprawdzen": pole_bez_sprawdzen}


def _werdykt_dobory_bez_danych() -> dict[str, Any]:
    """Odpowiedź `GET /api/quality/design-verdict` (`WerdyktProjektowy.to_dict`) z pozycją
    doborów toru DER-SN, w której raport zgodności nie ma danych kaskady prądowej (kabel SN
    bez obciążalności, pole SN bez aparatu z katalogiem) — rekordy tych kontroli to „ocena
    niewykonana" (brak danych ≠ spełnia, kontrakt werdyktu §2.1), wynik elementów
    BRAK_PODSTAW, werdykt całościowy NIESPRAWDZONE.

    Złożona TYMI SAMYMI funkcjami co końcówka: raport doborów `build_compliance_report_from_
    track` na torze DER-SN, wiersz walidacji energetycznej z buildera i serializera dostawcy,
    pozycje `_pozycje_walidacji_energetycznej` i `_pozycja_der_sn` oraz kontrakt
    `WerdyktProjektowy.to_dict`. Rejestr ograniczony do tych dwóch dostawców — ekran oceny
    renderuje pozycje z odpowiedzi, więc kryteria zwarciowe i warunki przyłączenia nie
    wnoszą nic do sprawdzanej ścieżki (rekord w wierszu, liczniki etykiet i ocena
    całościowa)."""
    tor = DerSnTrack(
        generator={
            "ref_id": "gen-pv-1",
            "name": "Instalacja PV 1",
            "p_mw": 1.935,
            "materialized_params": {"cosphi": 0.95},
        },
        producer_bus={"ref_id": "bus-nn-pv-1", "voltage_kv": 0.8},
        block_hv_bus={"ref_id": "bus-blok-sn-1", "voltage_kv": 15.0},
        block_transformer={
            "ref_id": "tr-blok-1",
            "ulv_kv": 0.8,
            "uhv_kv": 15.0,
            "sn_mva": 2.5,
            "vector_group": "Dyn11",
        },
        mv_cable={"ref_id": "kab-sn-1", "rating": {}},
        pole=None,
        apparatus=None,
        mv_bus={"ref_id": "bus-sn-1", "voltage_kv": 15.0},
        transformatory_grupy=(),
        pozostale_zrodla_grupy=(),
    )
    rozplyw = {
        "items": [
            item_to_dict(
                _pozycja_walidacji(
                    check_type=EnergyCheckType.VOLTAGE_DEVIATION,
                    target_id="bus-sn-1",
                    target_name="Szyna SN 1",
                    observed_value=1.2,
                    unit="%",
                    limit_warn=5.0,
                    limit_fail=10.0,
                    margin_pct=8.8,
                    why_pl="Odchylenie napiecia 1.20 % ponizej limitu 5.0 %.",
                )
            )
        ]
    }
    pozycje = (
        *_pozycje_walidacji_energetycznej(rozplyw, run_id="run-pf-bez-danych"),
        _pozycja_der_sn(build_compliance_report_from_track(tor)),
    )
    return WerdyktProjektowy(
        case_id="case-bez-danych",
        model_hash="enm-hash-bez-danych",
        pozycje=pozycje,
        zrodla=(
            ZrodloWerdyktu(
                rodzaj=ZRODLO_PF,
                run_id="run-pf-bez-danych",
                wykonano="2026-09-23T10:00:00+00:00",
                snapshot_hash="enm-hash-bez-danych",
                aktualny=True,
                dostepny=True,
            ),
            ZrodloWerdyktu(
                rodzaj=ZRODLO_MODEL,
                run_id=None,
                wykonano=None,
                snapshot_hash="enm-hash-bez-danych",
                aktualny=True,
                dostepny=True,
            ),
        ),
    ).to_dict()


def _raporty_zgodnosci_der_sn() -> dict[str, Any]:
    """Odpowiedzi `GET /api/der-sn/{case_id}/compliance-report` dla panelu podsumowania
    kreatora OZE — cztery stany raportu na TYM SAMYM torze zmaterializowanym operacją
    `add_converter_source` (ta sama ścieżka co zapis kreatora):

    * ``zgodny`` — komplet kontroli D1, kaskady i biegu spełniony;
    * ``z_uwagami`` — jak wyżej plus odstępstwo D2 (pozycja informacyjna bez rekordu);
    * ``niezgodny`` — grupa transformatorów o mocy 0,1 MVA i bieg nieudany (dwa rekordy
      naruszone, komunikat krytyczny kanonu);
    * ``bez_danych`` — kabel SN bez obciążalności: ogniwo kaskady to „ocena niewykonana"
      (brak danych ≠ spełnia), raport nierozstrzygnięty.

    Złożone funkcją końcówki `build_compliance_report_from_track`; zmiana kontraktu raportu
    bez regeneracji fixtury czerwieni `test_fixtury_ocen_fe.py`."""
    from tests.application.analyses.test_der_sn_documents import _materialized_snapshot

    tor = extract_der_sn_track(_materialized_snapshot())
    assert tor is not None and tor.mv_cable is not None
    mala_grupa = tuple(
        {
            **transformator,
            "sn_mva": 0.1,
            "materialized_params": {
                **transformator.get("materialized_params", {}),
                "rated_power_mva": 0.1,
            },
        }
        for transformator in tor.transformatory_grupy
    )
    bieg_ok: dict[str, Any] = {"run_status": "DONE", "readiness_codes": ["READY"]}
    return {
        "zgodny": build_compliance_report_from_track(tor, **bieg_ok),
        "z_uwagami": build_compliance_report_from_track(
            tor,
            **bieg_ok,
            d2_deviations=[
                {
                    "parametr": "cosphi",
                    "zastosowano": 0.9,
                    "propozycja": 0.95,
                    "odstepstwo": True,
                }
            ],
        ),
        "niezgodny": build_compliance_report_from_track(
            replace(tor, transformatory_grupy=mala_grupa), run_status="FAILED"
        ),
        "bez_danych": build_compliance_report_from_track(
            replace(tor, mv_cable={**tor.mv_cable, "rating": {}})
        ),
    }


def _wrazliwosc_ogolna() -> dict[str, Any]:
    """Sekcja ogólna widoku wrażliwości (``analysis/sensitivity/serializer.view_to_dict`` —
    ta sama funkcja co końcówka ``GET /api/insights/sensitivity``, pole ``ogolna``) dla profilu
    napięć zbudowanego ``wiersz_profilu`` (funkcja buildera profilu): odchyłka |ΔU| {1,1 %,
    7 %, 10 % (równość z progiem przekroczenia), 12 %, 5,1 % (perturbacja zmienia
    rozstrzygnięcie: wariant bazowy narusza, wariant plus spełnia)} oraz szyna bez napięcia
    znamionowego."""
    config = NormativeConfig()
    wiersze = tuple(
        wiersz_profilu(
            bus_id=bus_id,
            bus_name=nazwa,
            u_nom_kv=u_nom,
            u_kv=u_kv,
            u_pu=None,
            config=config,
        )
        for bus_id, nazwa, u_nom, u_kv in (
            ("wezel-a", "Szyna SN", 15.0, 15.0 * (1 - 0.011)),
            ("wezel-b", "Szyna SN odbiorcza", 15.0, 15.0 * 0.93),
            ("wezel-c", "Szyna SN końcowa", 15.0, 15.0 * 0.90),
            ("wezel-d", "Szyna SN daleka", 15.0, 15.0 * 0.88),
            ("wezel-f", "Szyna SN przy progu", 15.0, 15.0 * 0.949),
            ("wezel-e", None, None, 14.7),
        )
    )
    widok_profilu = VoltageProfileView(
        context=None,
        thresholds={
            "voltage_warn_pct": config.voltage_warn_pct,
            "voltage_fail_pct": config.voltage_fail_pct,
        },
        rows=wiersze,
        summary=VoltageProfileSummary(
            worst_bus_id=None,
            worst_delta_pct_abs=None,
            pass_count=0,
            warning_count=0,
            fail_count=0,
            not_computed_count=0,
        ),
    )
    return (
        SensitivityBuilder(delta_pct=5.0)
        .build(
            proofs=[],
            normative_report=None,
            voltage_profile=widok_profilu,
            protection_insight=None,
            protection_curves_it=None,
        )
        .to_dict()
    )


def _akademickie() -> dict[str, Any]:
    return {
        "jakosc_energii": ocena_jakosci_energii_niewykonana(),
        "ssci_impedance": ocena_ssci_niewykonana(
            converter_ref="INV1", bus_ref=None, nazwy=_NAZWY_SSCI, tablice_obecne=True
        ),
    }


def _sila_sieci() -> dict[str, Any]:
    """Widok siły sieci (``analysis/grid_strength/serializer.view_to_dict`` — TEN SAM builder co
    końcówka ``GET /api/oze-analysis/grid-strength``) dla pulpitu OZE: węzeł mocny, węzeł
    bardzo słaby (SCR 1,5 < 2), węzeł bez mocy zwarciowej; WSCR z dwóch węzłów kompletnych."""
    wejscia = [
        BusStrengthInput(
            bus_ref="bus-pcc-1",
            nominal_kv=15.0,
            s_sc_mva=120.0,
            s_installed_mva=20.0,
            modules=(BusSourceModule(ref="src-1", name="Blok PV A", sn_mva=20.0),),
            nazwa_pl="Szyna SN przyłączenia A",
        ),
        BusStrengthInput(
            bus_ref="bus-pcc-2",
            nominal_kv=15.0,
            s_sc_mva=30.0,
            s_installed_mva=20.0,
            modules=(BusSourceModule(ref="src-2", name="Magazyn energii 1", sn_mva=20.0),),
            nazwa_pl="Szyna SN przyłączenia B",
        ),
        BusStrengthInput(
            bus_ref="bus-pcc-3",
            nominal_kv=None,
            s_sc_mva=None,
            s_installed_mva=20.0,
            modules=(BusSourceModule(ref="src-3", name=None, sn_mva=20.0),),
            nazwa_pl="Szyna SN przyłączenia C",
        ),
    ]
    kontekst = GridStrengthContext(
        project_name="Projekt A",
        case_name="Scenariusz 1",
        case_id="case-1",
        run_timestamp=datetime(2026, 7, 16, 10, 0, tzinfo=UTC),
        snapshot_hash="snap-1",
        run_id="run-sc-1",
    )
    return GridStrengthBuilder().build(wejscia, context=kontekst).to_dict()


def _adekwatnosc_q() -> dict[str, Any]:
    """Widok adekwatności mocy biernej (``analysis/reactive_adequacy`` — TEN SAM builder co
    końcówka ``GET /api/oze-analysis/reactive-adequacy``) dla pulpitu OZE: źródło w zakresie
    regulacji, źródło nasycone przy Q_max, węzeł z napięciem powyżej pasma; granice z karty
    producenta (bez danych przyjętych)."""
    from solver_input.provenance import FieldQuality

    kontekst = ReactiveAdequacyContext(
        project_name="Projekt A",
        case_name="Scenariusz 1",
        case_id="case-1",
        run_timestamp=datetime(2026, 7, 16, 10, 5, tzinfo=UTC),
        snapshot_hash="snap-1",
        run_id="run-pf-2",
    )
    return (
        ReactiveAdequacyBuilder()
        .build(
            [
                BusVoltageInput("bus-pcc-1", 1.0, 0.95, 1.05),
                BusVoltageInput("bus-pcc-2", 1.07, 0.95, 1.05),
            ],
            [
                SourceReactiveInput(
                    "src-1",
                    "bus-pcc-1",
                    q_actual_mvar=1.2,
                    q_min_mvar=-3.6,
                    q_max_mvar=3.6,
                    limits_field_quality=FieldQuality.DATASHEET,
                ),
                SourceReactiveInput(
                    "src-2",
                    "bus-pcc-2",
                    q_actual_mvar=3.6,
                    q_min_mvar=-3.6,
                    q_max_mvar=3.6,
                    limits_field_quality=FieldQuality.DATASHEET,
                ),
            ],
            [LoadReactiveInput("load-1", 2.0)],
            context=kontekst,
            nazwy={
                "bus-pcc-1": "Szyna SN przyłączenia A",
                "bus-pcc-2": "Szyna SN przyłączenia B",
                "src-1": "Blok PV A",
                "src-2": "Magazyn energii 1",
            },
        )
        .to_dict()
    )


def _audyt2() -> dict[str, Any]:
    """Rekordy walidacji rozszerzeń stacji dla ekranów frontu (karta WERDYKT-MIGRACJA-190):
    pakiet projektu (kształt końcówki ``_validate-all``: TE SAME generatory dowodów i TO SAMO
    zestawienie ``liczby_statusow_projektu``) — stacja z pięcioma dowodami o pięciu różnych
    statusach rekordu W i stacja z samymi brakami danych — oraz odpowiedzi walidatorów VT
    i wytrzymałości aparatu (te same funkcje końcówek ``/catalog/audit2/validate-*``)."""
    from api.audit2_catalogs import (
        DeviceWithstandValidationRequest,
        VtGroundingValidationRequest,
        validate_device_withstand_endpoint,
        validate_vt_grounding,
    )

    dowody = [
        generate_bess_modes_proof(
            SpecDowoduTrybowBess(
                der_id="gen/bess-1",
                der_nazwa="Magazyn Łąkowa",
                pcs_four_quadrant=True,
                pcs_grid_forming=True,
                selected_mode_refs=["mode_fcr_n", "mode_voltage_support"],
            )
        ),
        generate_device_withstand_proof(
            SpecDowoduWytrzymalosciAparatu(
                bay_designation="Pole 02",
                device_id="wstd_breaker_vacuum_15_25",
                i_peak_calculated_ka=70.0,
                i_thermal_calculated_ka=20.0,
                t_clearing_s=1.0,
            )
        ),
        generate_hosting_capacity_export_proof(
            SpecDowoduEksportuStacji(
                station_id="stn/1",
                station_nazwa="Stacja Łąkowa",
                p_export_kw=600.0,
                p_import_kw=500.0,
            )
        ),
        generate_tap_changer_plan_proof(
            SpecDowoduPlanuZaczepow(
                transformer_id="tr/1",
                transformer_nazwa="Transformator T1 Łąkowa",
                transformer_type="transformer_15_04",
                tap_changer_ref="tc_detc_snnn_5_25",
                requires_avr=False,
            )
        ),
        generate_vt_grounding_validation_proof(
            SpecDowoduUziemieniaPrzekladnika(
                bay_designation="Pole 01", vt_voltage_factor=None, grounding_type="isolated"
            )
        ),
    ]
    pakiety = [
        generate_station_audit2_proof_pack(
            station_id="stn/1", station_nazwa="Stacja Łąkowa", proofs=dowody
        ),
        generate_station_audit2_proof_pack(
            station_id="stn/2",
            station_nazwa="Stacja Polna",
            proofs=[],
            braki_danych=[
                BrakDanychDowodu(
                    "AUDIT2_HOSTING_CAPACITY_EXPORT",
                    "Źródło PV Polna nie ma mocy znamionowej z katalogu — bilans eksportu "
                    "byłby zaniżony.",
                ),
                BrakDanychDowodu(
                    "AUDIT2_TAP_CHANGER_PLAN",
                    "Konfiguracja stacji nie przypisuje przełącznika zaczepów żadnemu "
                    "transformatorowi.",
                ),
            ],
        ),
    ]
    return {
        "pakiet_projektu": {
            "project_id": "proj-1",
            "liczby_statusow": liczby_statusow_projektu(pakiety),
            "station_count": len(pakiety),
            "per_station": [p.to_dict() for p in pakiety],
        },
        "vt": {
            klucz: validate_vt_grounding(
                VtGroundingValidationRequest(voltage_factor=wsp, grounding_type=uziemienie)
            )
            for klucz, wsp, uziemienie in (
                ("spelnia", 1.9, "petersen_coil"),
                ("nie_spelnia", 1.5, "isolated"),
                ("brak_wspolczynnika", None, "resistor_grounded"),
            )
        },
        "wytrzymalosc": {
            klucz: validate_device_withstand_endpoint(
                DeviceWithstandValidationRequest(
                    device_id="wstd_breaker_vacuum_15_25",
                    i_peak_calculated_ka=ip,
                    i_thermal_calculated_ka=20.0,
                    t_clearing_s=1.0,
                )
            )
            for klucz, ip in (("w_granicach", 50.0), ("przekroczona", 70.0))
        },
    }


def _wytrzymalosc_pol() -> dict[str, Any]:
    """Rekordy W wytrzymałości aparatu pola (``audit2_oceny`` — TE SAME funkcje co widok
    ``wytrzymalosc_aparatury_pol``) dla ekranu weryfikacji aparatury: kryteria spełnione na
    liczbach (dowód niepełny), przekroczenie I_dyn i brak czasu wyłączenia."""
    from network_model.catalog.audit2_oceny import (
        oceny_wytrzymalosci_aparatu,
        wymaganie_wytrzymalosci_aparatu,
    )
    from werdykt import Przedmiot

    przedmiot = Przedmiot(
        element_ref="aparat/01", nazwa_pl="Aparat pola SN 1", opis_pl="aparat pola P-1"
    )

    def _w(i_peak: float, t_clearing: float | None) -> dict[str, Any]:
        oceny = oceny_wytrzymalosci_aparatu(
            kryterium_id="aparatura.field/x/in.aparat/01",
            przedmiot=przedmiot,
            etykieta_pl="Aparat pola SN 1",
            i_dyn_ka=50.0,
            i_th_ka=20.0,
            i_th_duration_s=1.0,
            i_peak_calculated_ka=i_peak,
            i_thermal_calculated_ka=12.5,
            t_clearing_s=t_clearing,
            zakres_opis_pl="Pole P-1: prądy zwarcia z biegu MAX w punkcie zabudowy pola.",
        )
        return rekord_json(
            wymaganie_wytrzymalosci_aparatu(
                wymaganie_id="aparatura.field/x/in.aparat/01",
                nazwa_pl="Wytrzymałość zwarciowa i zdolność wyłączania aparatu „Aparat pola SN 1”",
                oceny=oceny,
                # Zakres agregatu = zakres składników (te same wykluczenia).
                zakres=oceny[0].zakres_waznosci,
            )
        )

    return {
        "spelnione_na_liczbach": _w(31.2, 0.5),
        "przekroczenie_dynamiczne": _w(62.0, 0.5),
        "bez_czasu_wylaczenia": _w(31.2, None),
    }


def _nastawy_cieplne() -> dict[str, Any]:
    """Blok ``thermal`` wyniku silnika nastaw I>/I>> (``ProtectionSettingsEngine`` — TA SAMA
    funkcja co odpowiedź końcówki nastaw) dla sekcji nastaw ekranu koordynacji: linia 120 mm² Al
    wytrzymuje I″k,max = 8 kA, linia 10 mm² Al nie wytrzymuje 50 kA."""
    from application.protection_settings.engine import (
        ProtectionSettingsEngine,
        ProtectionSettingsInput,
    )

    def _blok(przekroj: float, ik_max: float) -> dict[str, Any]:
        wejscie = ProtectionSettingsInput(
            line_id="L-001",
            line_name="Linia SN nr 1",
            cross_section_mm2=przekroj,
            conductor_material="AL",
            length_km=5.0,
            i_nominal_a=300.0,
            ik3_max_beginning_a=ik_max,
            ik3_min_beginning_a=5000.0,
            ik3_max_end_a=4000.0,
            ik3_min_end_a=2500.0,
            ik2_min_end_a=2000.0,
            ik_max_next_bus_a=3000.0,
            i_load_max_a=200.0,
        )
        blok: dict[str, Any] = ProtectionSettingsEngine.calculate(wejscie).to_dict()["thermal"]
        return blok

    return {"wytrzymuje": _blok(120.0, 8000.0), "nie_wytrzymuje": _blok(10.0, 50000.0)}


def _oceny_kontyngencji() -> dict[str, Any]:
    """Rekordy kategorii dotkliwości kontyngencji N-1 (``build_kontyngencje_n1_view`` — TA SAMA
    funkcja co końcówka) dla fikstury ekranu „Kontyngencje N-1”
    (``ui2/wyniki/kontyngencje/__tests__/fixtures.ts``). Fikstura ekranu składa warianty
    o różnych licznikach z kilku sieci testowych serwisu, więc każdy wariant dostaje rekordy
    z REALNEGO wariantu o tych samych licznikach kategorii:

    - ``bazowy`` — stan N-0 promienia z transformatorem (bez naruszeń),
    - ``z_przeciazeniem`` — pierścień, wyłączenie ``ln_src_a`` (przeciążenie objazdu),
    - ``niezbiezna`` — sieć z biegiem niezbieżnym, wyłączenie ``ka_mocny``,
    - ``wykluczona`` — promień, ``ln_wyl`` wyłączona już w modelu bazowym,
    - ``odbiory_odciete`` — promień, wyłączenie ``tr_sn_nn`` (odbiór nN bez zasilania,
      kryterium prądowe kabla pominięte).
    """
    from application.analyses.kontyngencje_n1 import build_kontyngencje_n1_view
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    from tests.application.analyses.test_kontyngencje_n1_service import (
        _bieg,
        _niezbiezny,
        _pierscien,
        _promien_z_transformatorem,
    )

    def _widok(budowa: Any) -> dict[str, Any]:
        reset_canonical_runs()
        reset_enm_store()
        widok: dict[str, Any] = build_kontyngencje_n1_view(_bieg(budowa()))
        return widok

    def _oceny(widok: dict[str, Any], ref: str) -> Any:
        return next(k["oceny"] for k in widok["kontyngencje"] if k["element_ref"] == ref)

    promien = _widok(_promien_z_transformatorem)
    pierscien = _widok(_pierscien)
    niezbiezny = _widok(_niezbiezny)
    reset_canonical_runs()
    reset_enm_store()
    return {
        "bazowy": promien["przypadek_bazowy"]["oceny"],
        "z_przeciazeniem": _oceny(pierscien, "ln_src_a"),
        "niezbiezna": _oceny(niezbiezny, "ka_mocny"),
        "wykluczona": _oceny(promien, "ln_wyl"),
        "odbiory_odciete": _oceny(promien, "tr_sn_nn"),
    }


#: Plik fixtury frontu → funkcja budująca jego treść.
FIXTURY: dict[Path, Any] = {
    _FRONTEND_SRC / "ui2" / "oze" / "frt" / "__tests__" / "rekordyOceny.json": _frt,
    _FRONTEND_SRC / "ui2" / "wyniki" / "dynamika" / "__tests__" / "rekordyOceny.json": _dynamika,
    _FRONTEND_SRC / "ui2" / "wyniki" / "ssci" / "__tests__" / "rekordyOceny.json": _ssci,
    _FRONTEND_SRC / "ui2" / "oze" / "lom" / "__tests__" / "widokiOchronyLom.json": _widoki_lom,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "akademickie"
    / "__tests__"
    / "rekordyOceny.json": _akademickie,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "ocena"
    / "__tests__"
    / "werdyktDoborowBezDanych.json": _werdykt_dobory_bez_danych,
    _FRONTEND_SRC
    / "ui2"
    / "kreatory"
    / "zrodlo-oze"
    / "__tests__"
    / "raportyZgodnosci.json": _raporty_zgodnosci_der_sn,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "wrazliwosc"
    / "__tests__"
    / "wrazliwoscOgolna.json": _wrazliwosc_ogolna,
    _FRONTEND_SRC / "ui2" / "oze" / "pulpit" / "__tests__" / "widokSilySieci.json": _sila_sieci,
    _FRONTEND_SRC
    / "ui2"
    / "oze"
    / "pulpit"
    / "__tests__"
    / "widokAdekwatnosciQ.json": _adekwatnosc_q,
    _FRONTEND_SRC
    / "ui"
    / "network-build"
    / "station-der"
    / "__tests__"
    / "rekordyAudytu2.json": _audyt2,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "zwarcia"
    / "aparatura"
    / "__tests__"
    / "rekordyWytrzymalosci.json": _wytrzymalosc_pol,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "koordynacja"
    / "__tests__"
    / "nastawyCieplne.json": _nastawy_cieplne,
    _FRONTEND_SRC
    / "ui2"
    / "wyniki"
    / "kontyngencje"
    / "__tests__"
    / "ocenyKontyngencji.json": _oceny_kontyngencji,
}


def tresc(plik: Path) -> str:
    """Kanoniczny zapis JSON fixtury (reguła ``tests/golden/zapis_fikstur``: liczby, klucze
    posortowane, UTF-8, wcięcie 2, nowa linia)."""
    return json_fikstury(FIXTURY[plik]())


def main() -> None:
    for plik in FIXTURY:
        plik.write_text(tresc(plik), encoding="utf-8")
        print(f"zapisano {plik.relative_to(_FRONTEND_SRC.parent)}")


if __name__ == "__main__":
    main()
