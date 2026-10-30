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
from pathlib import Path
from typing import Any

from analysis.energy_validation.builder import _pozycja as _pozycja_walidacji
from analysis.energy_validation.models import EnergyCheckType
from analysis.energy_validation.serializer import item_to_dict
from analysis.ssci_stability.models import ocena_ssci_niewykonana
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
    for nazwa, zapady in (
        ("sekwencja_bez_kontekstu", _SEKWENCJA_BEZ_KONTEKSTU),
        ("sekwencja_z_kontekstem", _SEKWENCJA_Z_KONTEKSTEM),
    ):
        widok = build_frt_sekwencja_view(converter, profile, zapady)
        wynik[nazwa] = {
            "widok": widok["ocena"],
            "zapady": [zapad["ocena"] for zapad in widok["zapady"]],
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


def _akademickie() -> dict[str, Any]:
    return {
        "jakosc_energii": ocena_jakosci_energii_niewykonana(),
        "ssci_impedance": ocena_ssci_niewykonana(
            converter_ref="INV1", bus_ref=None, nazwy=_NAZWY_SSCI, tablice_obecne=True
        ),
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
