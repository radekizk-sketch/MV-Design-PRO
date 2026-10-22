"""Parametry zwarciowe maszyn wirujących jako wartości robocze (karta PODSTAWA-Q, rozstrz. 3).

DLACZEGO. IEC 60909-0:2016 liczy udział maszyny wirującej z danych tabliczki: generator
synchroniczny — x″d i cos φ_rG (pkt 6.3), maszyna asynchroniczna — I_LR/I_rM, cos φ_rM, η_rM
(pkt 6.7) i liczba par biegunów p, z której moc na parę biegunów m = P_rM/p wybiera krzywą
zaniku q (pkt 9.1.2) i wiersz R_M/X_M (pkt 6.7). Dawniej mapowanie ENM nie przenosiło p
(maszyna dostawała domyślne p = 1 bez śladu), a pozostałe parametry miały ciche domyślki
w konstruktorze. Zasada nr 4: brak danej nie blokuje obliczenia — mapowanie rozstrzyga
pierwszeństwo (projektant ``Generator.overrides`` > tabliczka ``materialized_params`` >
propozycja rejestru ``wartosci_robocze``), wartość robocza idzie do wiersza wyniku jako wpis,
a KAŻDY werdykt oparty na prądzie punktu, od którego wpis zależy, niesie daną przyjętą
(``ESTIMATED``, stan danych ``UNVALIDATED_INPUT``, kompletność ``NIEPELNY``).

ILOCZYN CECH (wyrocznia zapisana niezależnie od rejestru solvera):
  rodzaj maszyny {synchroniczna, asynchroniczna klatkowa, DFIG}
  × dane {pełna tabliczka, wartości projektanta, brak tabliczki (propozycja),
          tabliczka odrzucona przez bramę}
  × moc na parę biegunów {maszyna SN ≥ 1 MW — p może zmienić wiersz R_M/X_M (wpis p dotyczy
     wszystkich prądów), maszyna SN < 1 MW i maszyna nN — p wyłącznie w krzywej q (tylko I_b)}
  × rodzaj zwarcia {3F, 1F — I_b = I″k, wpis „tylko I_b” znika}
  × liczba jednostek grupy {1, 4 — m liczone dla JEDNEJ maszyny}
  × konsument wiersza wyniku (wniosek do OSD, nastawy z biegów, reguły generatorów pola,
     autorytet biegu i dowód aparatury, łuk elektryczny, wytrzymałość cieplna, wytrzymałość
     aparatury pól × kryterium, ocena nadprądowa, dowód SC3F, wkłady punktu (HTTP), raport,
     pętla zwarcia nN × widok, kotwica domeny nN, arkusz obwodów nN)
  × punkt {w wyspie maszyny, poza nią}.
Do tego brama operacji domenowej (wartość, rodzina, zmiana rodzaju generatora, przejścia
``parameter_source``), tor CGMES (eksport/import atrybutów maszyny), brama cos φ agregatu,
brama wartości projektanta aparatu SN z pliku, rejestr dla formularza (HTTP), kod gotowości,
predykaty parami (rodzina rejestru = zbiory topologii = klucze mapowania) i determinizm.
Sonda identyczności liczb: tabliczka równa propozycjom daje TE SAME liczby co brak tabliczki —
karta nie zmienia żadnej wartości dla sieci, w której propozycja = dawna domyślka.
"""

from __future__ import annotations

import copy
import dataclasses
import json
import math
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from api.analysis_run_exports import _sc_row_bilans_linie
from api.generators import _prady_zwarciowe_szyny
from api.main import app
from application.analyses.aparaty_pol import wartosci_projektanta as wartosci_projektanta_aparatu
from application.analyses.arc_flash_view import build_arc_flash_view
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_station_fault_loop_view,
)
from application.analyses.lv_domain.upstream_equivalent import build_upstream_equivalent_snapshot
from application.analyses.nn_circuit_sheet import _ik_z_biegu_zwarciowego, build_nn_circuit_sheet
from application.analyses.protection.coordination.analyzer import _dopisek_danych_przyjetych
from application.analyses.swz.service import build_swz_view
from application.analyses.wniosek_osd import _zwarcia_sekcja
from application.analyses.wytrzymalosc_cieplna_przewodow import build_wytrzymalosc_cieplna_view
from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu
from application.cgmes.service import export_cgmes, import_cgmes
from application.equipment_proof.generator import EquipmentProofGenerator
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from application.protection_settings.batch_run import _dane_przyjete_punktow
from domain.canonical_operations import READINESS_CODES
from domain.readiness_bridge import ODWZOROWANIE_WALIDATOR_NA_KANON
from enm.canonical_analysis import (
    CanonicalRun,
    reset_canonical_runs,
    wykonaj_bieg_w_pamieci,
)
from enm.domain_operations import execute_domain_operation
from enm.mapping import _ASYNC_GEN_TYPES, map_enm_to_network_graph, ref_to_graph_id
from enm.maszyny_robocze import parametry_robocze_maszyn_punktu
from enm.models import EnergyNetworkModel, Generator, ParameterOverride, Substation
from enm.store import reset_enm_store
from enm.topology import TYPY_MASZYN_ASYNCHRONICZNYCH, TYPY_MASZYN_SYNCHRONICZNYCH
from enm.topology_ops import create_branch, create_device, update_branch, update_device
from enm.validator import ENMValidator
from fastapi.testclient import TestClient
from infrastructure.cgmes.cgmes_exporter import GENERATOR_UTRATA_TORU_OBCEGO, build_eq_tp_trees
from infrastructure.cgmes.profiles import NS_CIM
from network_model.catalog.wartosci_robocze import (
    KOD_PARAMETRY_MASZYNY_ROBOCZE,
    PARAMETRY_MASZYNY,
    RODZINA_MASZYNA_ASYNCHRONICZNA,
    RODZINA_MASZYNA_SYNCHRONICZNA,
    RODZINA_MASZYNY_WG_GEN_TYPE,
    WIELKOSCI_ZWARCIOWE,
    blad_wartosci_maszyny,
    dane_przyjete_maszyn,
    rejestr_maszyn_do_formularza,
    scal_wpisy_maszyn,
)
from network_model.odmowa_danych import OdmowaNazwana
from network_model.solvers.short_circuit_core import ShortCircuitType
from werdykt.decyzja import kompletnosc_dowodu

from tests.application.analyses.fault_loop.test_etykiety_skladowych_petli import _enm as _enm_petli
from tests.application.analyses.protection.test_ocena_nadpradowa import (
    B2,
    B3,
    B4,
    Q2,
    WIERSZE,
    _model,
    _ocen,
    _przypisanie,
    _stopien_51,
)
from tests.application.analyses.test_nn_circuit_sheet import _siec_referencyjna
from tests.application.equipment_proof.test_equipment_proof import _base_input
from tests.enm.test_canonical_sc_c_per_pasmo import N1, N2, _bieg_zwarciowy, _build_mv_lv_enm
from tests.network_model.solvers.test_zalozenia_zaniku_werdykt import (
    _migawka_ze_stacja,
    _oceny_pola,
)

# =============================================================================
# Wyrocznia i budowa sieci
# =============================================================================

#: Rodzaj maszyny w testach → (gen_type, rodzina rejestru).
MASZYNY: dict[str, tuple[str, str]] = {
    "synchroniczna": ("synchronous", RODZINA_MASZYNA_SYNCHRONICZNA),
    "asynchroniczna": ("fw_scig", RODZINA_MASZYNA_ASYNCHRONICZNA),
    "dfig": ("fw_dfig", RODZINA_MASZYNA_ASYNCHRONICZNA),
}
DANE = ("tabliczka", "projektant", "propozycja", "odrzucona")

#: Pełna tabliczka maszyny (wartości dopuszczalne, różne od propozycji rejestru).
TABLICZKA: dict[str, dict[str, float]] = {
    RODZINA_MASZYNA_SYNCHRONICZNA: {"xd_subtransient_pu": 0.18, "cos_phi": 0.85},
    RODZINA_MASZYNA_ASYNCHRONICZNA: {
        "pole_pairs": 2,
        "i_lr_ratio": 6.0,
        "cos_phi": 0.88,
        "efficiency": 0.96,
    },
}
#: Wartości projektanta (różne od tabliczki i od propozycji).
PROJEKTANT: dict[str, dict[str, float]] = {
    RODZINA_MASZYNA_SYNCHRONICZNA: {"xd_subtransient_pu": 0.2, "cos_phi": 0.9},
    RODZINA_MASZYNA_ASYNCHRONICZNA: {
        "pole_pairs": 3,
        "i_lr_ratio": 6.5,
        "cos_phi": 0.9,
        "efficiency": 0.97,
    },
}
POWOD_PROJEKTANTA = "tabliczka znamionowa z oględzin"
#: Parametr mocy znamionowej rodziny: S_rG (pkt 6.3) i P_rM (pkt 6.7) JEDNEJ maszyny.
PARAMETR_MOCY: dict[str, str] = {
    RODZINA_MASZYNA_SYNCHRONICZNA: "sn_mva",
    RODZINA_MASZYNA_ASYNCHRONICZNA: "pr_mw",
}
#: Wartość projektanta mocy znamionowej = moc tabliczki × 1,25 (inna niż tabliczka i punkt
#: pracy, liczba dokładna w zapisie dwójkowym dla mocy sieci testowych).
MNOZNIK_MOCY_PROJEKTANTA = 1.25


def _tabliczka(rodzina: str, moc: float) -> dict[str, float]:
    return {PARAMETR_MOCY[rodzina]: moc, **TABLICZKA[rodzina]}


def _projektant(rodzina: str, moc: float) -> dict[str, float]:
    """Wartości projektanta w kolejności rejestru (moc znamionowa pierwsza)."""
    return {PARAMETR_MOCY[rodzina]: moc * MNOZNIK_MOCY_PROJEKTANTA, **PROJEKTANT[rodzina]}


#: Dana tabliczki spoza bramy (cos φ < 0,5) — obliczenie przyjmuje propozycję z powodem.
COS_PHI_ODRZUCONY = 0.3


def _wyrocznia(rodzina: str, dane: str) -> set[tuple[str, str]]:
    """(parametr, pochodzenie) wpisów wartości roboczych maszyny dla wariantu danych."""
    parametry = PARAMETRY_MASZYNY[rodzina]  # type: ignore[index]
    if dane == "tabliczka":
        return set()
    if dane == "projektant":
        return {(p, "PROJEKTANT") for p in parametry}
    if dane == "propozycja":
        return {(p, "PROPOZYCJA") for p in parametry}
    assert dane == "odrzucona"
    return {("cos_phi", "PROPOZYCJA")}


def _dane_maszyny(rodzina: str, dane: str, baza: dict[str, float], *, moc: float) -> dict[str, Any]:
    """Pola generatora (tabliczka, wartości projektanta, pochodzenie parametrów) dla wariantu;
    ``moc`` — moc znamionowa JEDNEJ maszyny na tabliczce (S_rG albo P_rM)."""
    if dane == "tabliczka":
        return {"materialized_params": {**baza, **_tabliczka(rodzina, moc)}}
    if dane == "odrzucona":
        return {
            "materialized_params": {
                **baza,
                **_tabliczka(rodzina, moc),
                "cos_phi": COS_PHI_ODRZUCONY,
            }
        }
    if dane == "propozycja":
        return {"materialized_params": dict(baza)}
    assert dane == "projektant"
    return {
        "materialized_params": dict(baza),
        "overrides": [
            {"key": k, "value": v, "reason": POWOD_PROJEKTANTA}
            for k, v in _projektant(rodzina, moc).items()
        ],
        "parameter_source": "OVERRIDE",
    }


def _znacznik(nazwa_maszyny: str) -> str:
    """Wspólny fragment nazwy danej przyjętej maszyny (``dana_przyjeta_parametru_maszyny``)."""
    return f"maszyny „{nazwa_maszyny}”"


def _ile(obiekt: Any, nazwa_maszyny: str) -> int:
    def _domyslna(o: Any) -> Any:
        if hasattr(o, "model_dump"):
            return o.model_dump(mode="json")
        if dataclasses.is_dataclass(o) and not isinstance(o, type):
            return dataclasses.asdict(o)
        return str(o)

    return json.dumps(obiekt, ensure_ascii=False, default=_domyslna).count(_znacznik(nazwa_maszyny))


#: Nazwa danej przyjętej parametru maszyny → parametr rejestru (odwrotność ``nazwa_pl``).
_PARAMETR_WG_NAZWY = {
    f"{opis['nazwa_pl']} {opis['symbol']}": opis["parametr"]
    for rodzina in rejestr_maszyn_do_formularza()["rodziny"].values()
    for opis in rodzina
}


def _parametry_danych_przyjetych(ocena: dict[str, Any], nazwa_maszyny: str) -> set[str]:
    """Parametry maszyny wśród danych przyjętych dowodu oceny (``status_danych``)."""
    wynik: set[str] = set()
    for dana in ocena["dowod"]["status_danych"]["dane_przyjete"]:
        if _znacznik(nazwa_maszyny) not in dana["nazwa_pl"]:
            continue
        wynik.add(_PARAMETR_WG_NAZWY[dana["nazwa_pl"].split(" maszyny „")[0]])
    return wynik


def _liczba_danych_przyjetych(ocena: dict[str, Any], nazwa_maszyny: str) -> int:
    return sum(
        _znacznik(nazwa_maszyny) in dana["nazwa_pl"]
        for dana in ocena["dowod"]["status_danych"]["dane_przyjete"]
    )


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


# --- Sieć A: maszyna SN 33 kV z polem stacji (bieg w pamięci jak `test_zalozenia_zaniku`) ---


def _migawka_a(
    maszyna: str,
    dane: str,
    *,
    p_mw: float = 2.0,
    jednostki: int | None = None,
    moc: float | None = None,
) -> tuple[dict[str, Any], str, str]:
    """(migawka, węzeł grafu szyny maszyny, nazwa maszyny). Moc znamionowa tabliczki jednej
    maszyny domyślnie: S_rG 5 MVA, P_rM równa punktowi pracy (maszyna w punkcie znamionowym)."""
    migawka, wezel = _migawka_ze_stacja(maszyna)
    (gen,) = migawka["generators"]
    gen_type, rodzina = MASZYNY[maszyna]
    baza: dict[str, float] = {"un_kv": 33.0}
    if moc is None:
        moc = 5.0 if rodzina == RODZINA_MASZYNA_SYNCHRONICZNA else p_mw
    gen.update(p_mw=p_mw, gen_type=gen_type, **_dane_maszyny(rodzina, dane, baza, moc=moc))
    if jednostki is not None:
        gen["quantity"] = jednostki
    EnergyNetworkModel.model_validate(migawka)
    return migawka, wezel, str(gen["name"])


def _bieg_a(migawka: dict[str, Any], *, rodzaj: str = "SC_3F", tb_s: float = 0.1) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid.uuid4(),
        case_id="przypadek-maszyn",
        project_id="projekt-maszyn",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-maszyn",
        input_hash="in-maszyn",
        snapshot=migawka,
        validation={},
        readiness={},
        options={
            "fault_type": rodzaj,
            "scenario": "max",
            "thermal_time_seconds": 1.0,
            "breaking_time_seconds": tb_s,
        },
    )
    run.finished_at = run.created_at
    wykonaj_bieg_w_pamieci(run)
    return run


def _wiersz(run: CanonicalRun, wezel: str) -> dict[str, Any]:
    return next(r for r in run.raw_result["results"] if r["fault_node_id"] == wezel)


# --- Sieć B: maszyna nN za transformatorem stacji (realna ścieżka: bramy gotowości + bieg) ---

NAZWA_B = "Maszyna M1"


def _siec_b(maszyna: str, dane: str) -> EnergyNetworkModel:
    """GPZ → kabel SN → TR 15/0,4 kV → szyna nN z maszyną 0,2 MW (`nn_side`, stacja `stn`)."""
    enm = _build_mv_lv_enm("Sieć z maszyną")
    gen_type, rodzina = MASZYNY[maszyna]
    baza: dict[str, float] = {"un_kv": 0.4}
    moc = 0.25 if rodzina == RODZINA_MASZYNA_SYNCHRONICZNA else 0.2
    pola = _dane_maszyny(rodzina, dane, baza, moc=moc)
    return enm.model_copy(
        update={
            "transformers": [
                t.model_copy(update={"lv_earthing_system": "TN-C-S"}) for t in enm.transformers
            ],
            "substations": [
                Substation(
                    ref_id="stn",
                    name="Stacja",
                    station_type="mv_lv",
                    bus_refs=[N1, N2],
                    transformer_refs=["TR1"],
                )
            ],
            "generators": [
                Generator(
                    ref_id="gm",
                    name=NAZWA_B,
                    bus_ref=N2,
                    p_mw=0.2,
                    gen_type=gen_type,  # type: ignore[arg-type]
                    connection_variant="nn_side",
                    station_ref="stn",
                    materialized_params=pola["materialized_params"],
                    overrides=[ParameterOverride(**w) for w in pola.get("overrides", [])],
                    parameter_source=pola.get("parameter_source"),
                )
            ],
        }
    )


# =============================================================================
# 0. Rejestr, predykaty parami, brama wartości, scalanie i filtr wielkości
# =============================================================================


def test_rodziny_rejestru_rowne_zbiorom_topologii_i_kluczom_mapowania() -> None:
    """Jeden podział rodzajów generatora na rodziny maszyn: rejestr parametrów, model maszyny
    w mapowaniu (`_ASYNC_GEN_TYPES`) i zbiory odniesienia wysp (`enm.topology`)."""
    asynchroniczne = {
        k for k, v in RODZINA_MASZYNY_WG_GEN_TYPE.items() if v == RODZINA_MASZYNA_ASYNCHRONICZNA
    }
    synchroniczne = {
        k for k, v in RODZINA_MASZYNY_WG_GEN_TYPE.items() if v == RODZINA_MASZYNA_SYNCHRONICZNA
    }
    assert asynchroniczne == set(_ASYNC_GEN_TYPES) == set(TYPY_MASZYN_ASYNCHRONICZNYCH)
    assert synchroniczne == set(TYPY_MASZYN_SYNCHRONICZNYCH) == {"synchronous"}
    assert {gen_type for gen_type, _ in MASZYNY.values()} == set(RODZINA_MASZYNY_WG_GEN_TYPE)


#: Kontrakt rejestru dla formularza (lustro `ParametrMaszynyRejestru` we frontendzie).
KLUCZE_PARAMETRU_FORMULARZA = {
    "parametr",
    "nazwa_pl",
    "symbol",
    "jednostka",
    "dopuszczalne_od",
    "dopuszczalne_do",
    "calkowita",
    "propozycja",
    "wyznaczenie_z_tabliczki",
}


def test_rejestr_dla_formularza_przez_http_i_ksztalt_kontraktu() -> None:
    with TestClient(app) as klient:
        odpowiedz = klient.get("/api/catalog/maszyny-wirujace/wartosci-robocze")
    assert odpowiedz.status_code == 200, odpowiedz.text
    rejestr = odpowiedz.json()
    assert rejestr == json.loads(json.dumps(rejestr_maszyn_do_formularza()))
    assert rejestr["rodzaj_generatora"] == dict(RODZINA_MASZYNY_WG_GEN_TYPE)
    for rodzina, parametry in rejestr["rodziny"].items():
        assert [p["parametr"] for p in parametry] == list(PARAMETRY_MASZYNY[rodzina])
        for opis in parametry:
            assert set(opis) == KLUCZE_PARAMETRU_FORMULARZA
            # Propozycja rejestru sama przechodzi bramę wartości (inaczej obliczenie
            # przyjęłoby wartość, której projektant nie mógłby nadać). Moc znamionowa nie ma
            # liczby w rejestrze — propozycja zależy od punktu pracy elementu.
            if opis["parametr"] == PARAMETR_MOCY[rodzina]:
                assert opis["propozycja"]["wartosc"] is None
                assert "punktu pracy" in opis["propozycja"]["uzasadnienie_pl"]
            else:
                assert (
                    blad_wartosci_maszyny(rodzina, opis["parametr"], opis["propozycja"]["wartosc"])
                    is None
                )
            assert (opis["wyznaczenie_z_tabliczki"] is not None) is (opis["parametr"] == "pr_mw")
            assert opis["propozycja"]["rodzaj_zrodla"] == "ZALOZENIE_INZYNIERSKIE"
            assert opis["propozycja"]["odniesienie"].strip()


#: Fikstura frontu (`KreatorEdycjiParametrow` i testy wartości maszyny) — TA SAMA odpowiedź
#: rejestru, co endpoint. Regeneracja (z katalogu `backend/`):
#:     PYTHONPATH=$PWD:$PWD/src python tests/application/test_parametry_robocze_maszyn.py
FIKSTURA_FRONTU = (
    Path(__file__).resolve().parents[3]
    / "frontend/src/ui2/kreatory/edycja-parametrow/__tests__/fixtures/rejestr_maszyn_wirujacych.json"
)


def _fikstura_frontu() -> str:
    return (
        json.dumps(rejestr_maszyn_do_formularza(), ensure_ascii=False, indent=2, sort_keys=True)
        + "\n"
    )


def test_fikstura_rejestru_maszyn_frontu_rowna_backendowi() -> None:
    """Fikstura bez strażnika dryfuje po cichu (testy frontu zielone na rejestrze, którego
    backend już nie ma) — musi być równa odpowiedzi rejestru."""
    assert FIKSTURA_FRONTU.read_text(encoding="utf-8") == _fikstura_frontu()


_BRAMA = [
    (RODZINA_MASZYNA_SYNCHRONICZNA, "xd_subtransient_pu", 0.15, True),
    (RODZINA_MASZYNA_SYNCHRONICZNA, "xd_subtransient_pu", 0.04, False),
    (RODZINA_MASZYNA_SYNCHRONICZNA, "xd_subtransient_pu", 0.6, False),
    (RODZINA_MASZYNA_SYNCHRONICZNA, "cos_phi", 0.5, True),
    (RODZINA_MASZYNA_SYNCHRONICZNA, "cos_phi", 0.4, False),
    (RODZINA_MASZYNA_SYNCHRONICZNA, "pole_pairs", 2, False),  # parametr innej rodziny
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "pole_pairs", 50, True),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "pole_pairs", 2.5, False),  # liczba całkowita
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "pole_pairs", 0, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "pole_pairs", 51, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "i_lr_ratio", 10.0, True),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "i_lr_ratio", 1.5, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "efficiency", 1.0, True),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "efficiency", 1.01, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "xd_subtransient_pu", 0.15, False),  # innej rodziny
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "cos_phi", "0,9", False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "cos_phi", True, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "cos_phi", math.nan, False),
    (RODZINA_MASZYNA_ASYNCHRONICZNA, "cos_phi", math.inf, False),
]


@pytest.mark.parametrize(("rodzina", "parametr", "wartosc", "dopuszczalna"), _BRAMA)
def test_brama_wartosci_maszyny(
    rodzina: str, parametr: str, wartosc: Any, dopuszczalna: bool
) -> None:
    blad = blad_wartosci_maszyny(rodzina, parametr, wartosc)  # type: ignore[arg-type]
    assert (blad is None) is dopuszczalna, blad


def test_scalanie_wpisow_punktow_sumuje_wielkosci_i_zachowuje_kolejnosc() -> None:
    wpis = {"source_id": "g", "source_name": "G", "parametr": "pole_pairs"}
    scalone = scal_wpisy_maszyn(
        [
            [{**wpis, "wielkosci": ["ib"]}],
            None,
            [
                {**wpis, "wielkosci": ["ikss", "ip"]},
                {**wpis, "parametr": "cos_phi", "wielkosci": ["ith"]},
            ],
        ]
    )
    assert [(w["parametr"], w["wielkosci"]) for w in scalone] == [
        ("pole_pairs", ["ikss", "ip", "ib"]),
        ("cos_phi", ["ith"]),
    ]


def test_filtr_wielkosci_danych_przyjetych() -> None:
    wpisy = [
        {
            "source_name": "G",
            "nazwa_pl": "liczba par biegunów",
            "symbol": "p",
            "wartosc": 1.0,
            "jednostka": "1",
            "opis_zrodla_pl": "x",
            "wielkosci": ["ib"],
        },
        {
            "source_name": "G",
            "nazwa_pl": "sprawność",
            "symbol": "η",
            "wartosc": 0.95,
            "jednostka": "1",
            "opis_zrodla_pl": "x",
            "wielkosci": list(WIELKOSCI_ZWARCIOWE),
        },
    ]
    assert len(dane_przyjete_maszyn(wpisy, wielkosc="ikss")) == 1
    assert len(dane_przyjete_maszyn(wpisy, wielkosc="ib")) == 2
    assert len(dane_przyjete_maszyn(wpisy, wielkosc=("ip", "ith"))) == 1
    assert dane_przyjete_maszyn(None, wielkosc="ikss") == ()
    for dana in dane_przyjete_maszyn(wpisy, wielkosc="ib"):
        assert dana.jakosc.value == "ESTIMATED"
    with pytest.raises(AssertionError):
        dane_przyjete_maszyn(wpisy, wielkosc="sk")


def test_kod_gotowosci_zalozenia_maszyn_prowadzi_do_wartosci_projektanta() -> None:
    spec = READINESS_CODES[KOD_PARAMETRY_MASZYNY_ROBOCZE]
    assert spec.fix_navigation == {"panel": "inspector", "tab": "parametry", "focus": "overrides"}


def _zdania_wartosci_roboczych_rejestru() -> list[tuple[str, str]]:
    """Każde zdanie źródła wartości roboczej, jakie rejestr składa: maszyny {rodzina ×
    parametr × {propozycja, projektant z powodem i bez}}, aparat SN {karta pusta, karta
    z prądem krótkotrwałym} × parametr, tolerancja nN {deklaracja, propozycja × powód}."""
    from dataclasses import dataclass as _dc

    from network_model.catalog import wartosci_robocze as wr

    zdania: list[tuple[str, str]] = []
    for rodzina, parametry in PARAMETRY_MASZYNY.items():
        propozycje = wr.rozstrzygnij_parametry_maszyny(
            rodzina,
            tabliczka={},
            wartosci_projektanta={},
            moc_czynna_punktu_pracy_mw=2.0,
            liczba_jednostek=1,
        )
        for parametr in parametry:
            zdania.append(
                (f"{rodzina}/{parametr}/propozycja", propozycje[parametr].opis_zrodla_pl())
            )
            for powod in (None, "pomiar na obiekcie."):
                projektant = dataclasses.replace(
                    propozycje[parametr], pochodzenie="PROJEKTANT", powod_projektanta_pl=powod
                )
                zdania.append(
                    (f"{rodzina}/{parametr}/projektant/{powod}", projektant.opis_zrodla_pl())
                )

    z_mocy_pozornej = wr.rozstrzygnij_parametry_maszyny(
        RODZINA_MASZYNA_ASYNCHRONICZNA,
        tabliczka={"sn_mva": 2.5},
        moc_czynna_punktu_pracy_mw=2.0,
        liczba_jednostek=1,
    )["pr_mw"]
    zdania.append(("asynchroniczna/pr_mw/z_mocy_pozornej", z_mocy_pozornej.opis_zrodla_pl()))

    @_dc(frozen=True)
    class _Karta:
        device_kind: str = "CIRCUIT_BREAKER"
        manufacturer: str | None = None
        breaking_capacity_ka: float | None = None
        i_th_ka: float | None = None
        i_th_duration_s: float | None = None
        i_dyn_ka: float | None = None
        break_time_s: float | None = None

    for opis_karty, karta in (("pusta", _Karta()), ("z_ith", _Karta(i_th_ka=20.0))):
        for parametr, wartosc in wr.rozstrzygnij_parametry_aparatu_sn(karta).items():
            zdania.append((f"aparat/{opis_karty}/{parametr}", wartosc.opis_zrodla_pl()))
    zdania.append(
        ("nn/deklaracja", wr.TolerancjaNnRozstrzygnieta("PLUS_10", "DEKLARACJA").opis_zrodla_pl())
    )
    for powod in (None, *wr._POWOD_PROPOZYCJI_TOLERANCJI_PL):
        tolerancja = wr.TolerancjaNnRozstrzygnieta(
            wr.TOLERANCJA_NN_ROBOCZA, "PROPOZYCJA", powod_propozycji=powod
        )
        zdania.append((f"nn/propozycja/{powod}", tolerancja.opis_zrodla_pl()))
    return zdania


def test_zdania_wartosci_roboczych_bez_podwojonej_kropki() -> None:
    """KLASA: zdanie źródła wartości roboczej składa się z odniesienia, uzasadnienia i wpływu;
    część kończąca się skrótem („przyjęto x″d 0,15 p.u.”) dawała „p.u..” w raporcie, dowodzie
    i wierszu wyniku. Iloczyn po każdym zdaniu rejestru, nie po jednym parametrze."""
    zdania = _zdania_wartosci_roboczych_rejestru()
    assert len(zdania) > 30
    for nazwa, zdanie in zdania:
        assert ".." not in zdanie, (nazwa, zdanie)
        assert ". ." not in zdanie and "  " not in zdanie, (nazwa, zdanie)


# =============================================================================
# 1. Wiersz wyniku biegu — wyrocznia {maszyna × dane}, liczba par biegunów, sonda liczb
# =============================================================================

KOMORKI = [(m, d) for m in MASZYNY for d in DANE]


@pytest.mark.parametrize(("maszyna", "dane"), KOMORKI)
def test_wiersz_biegu_wg_wyroczni(maszyna: str, dane: str) -> None:
    migawka, wezel, nazwa = _migawka_a(maszyna, dane)
    run = _bieg_a(migawka)
    wiersz = _wiersz(run, wezel)
    rodzina = MASZYNY[maszyna][1]
    wpisy = wiersz.get("parametry_robocze_maszyn", [])
    assert {(w["parametr"], w["pochodzenie"]) for w in wpisy} == _wyrocznia(rodzina, dane)
    # Maszyna SN 2 MW: p ∈ [1, 50] przestawia wiersz R_M/X_M (m ≥ 1 MW ↔ m < 1 MW), więc wpis
    # p dotyczy wszystkich prądów punktu — jak każdy inny parametr maszyny.
    assert all(w["wielkosci"] == list(WIELKOSCI_ZWARCIOWE) for w in wpisy)
    assert all(w["source_name"] == nazwa for w in wpisy)
    if dane == "projektant":
        assert all(POWOD_PROJEKTANTA in w["opis_zrodla_pl"] for w in wpisy)
        assert {w["parametr"]: w["wartosc"] for w in wpisy} == _projektant(
            rodzina, 2.0 if rodzina == RODZINA_MASZYNA_ASYNCHRONICZNA else 5.0
        )
    if dane == "odrzucona":
        (wpis,) = wpisy
        assert "dana tabliczki odrzucona" in wpis["opis_zrodla_pl"]
    zalozenia = [
        z for z in run.raw_result.get("zalozenia", []) if z["code"] == KOD_PARAMETRY_MASZYNY_ROBOCZE
    ]
    assert len(zalozenia) == (1 if wpisy else 0)
    if wpisy:
        (zalozenie,) = zalozenia
        assert zalozenie["element_ref"] == migawka["generators"][0]["ref_id"]
        assert zalozenie["parametr"] == wpisy[0]["parametr"]


@pytest.mark.parametrize("maszyna", ["asynchroniczna", "dfig"])
@pytest.mark.parametrize(
    ("dane", "oczekiwane_p"),
    [("tabliczka", 2), ("projektant", 3), ("propozycja", 1), ("odrzucona", 2)],
)
@pytest.mark.parametrize("jednostki", [1, 4])
def test_liczba_par_biegunow_i_liczba_jednostek_trafiaja_do_m(
    maszyna: str, dane: str, oczekiwane_p: int, jednostki: int
) -> None:
    """m = P_rM/p JEDNEJ maszyny grupy: p z rozstrzygnięcia pierwszeństwa, P_rM jednostki =
    moc znamionowa jednej maszyny z tabliczki albo od projektanta; bez nich — propozycja
    z punktu pracy elementu podzielonego na liczbę jednostek (IEC 60909-0:2016 pkt 9.1.2
    i tabela R_M/X_M pkt 6.7)."""
    migawka, _, _ = _migawka_a(maszyna, dane, jednostki=jednostki)
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    (maszyna_grafu,) = graf.asynchronous_machine_sources.values()
    assert maszyna_grafu.pole_pairs == oczekiwane_p
    assert maszyna_grafu.liczba_jednostek == jednostki
    moc_jednostki = {
        "tabliczka": 2.0,
        "odrzucona": 2.0,
        "projektant": 2.0 * MNOZNIK_MOCY_PROJEKTANTA,
        "propozycja": 2.0 / jednostki,
    }[dane]
    assert maszyna_grafu.moc_jednostki_mw == pytest.approx(moc_jednostki)
    assert maszyna_grafu.p_per_pole_mw == pytest.approx(moc_jednostki / oczekiwane_p)
    m = moc_jednostki / oczekiwane_p
    assert maszyna_grafu.r_over_x_ratio == (0.10 if m >= 1.0 else 0.15)


@pytest.mark.parametrize("maszyna", list(MASZYNY))
def test_sonda_identycznosci_liczb_tabliczka_rowna_propozycjom(maszyna: str) -> None:
    """Tabliczka z wartościami równymi propozycjom rejestru (dawne domyślki konstruktora,
    moc znamionowa z punktu pracy) daje bit w bit te same prądy co brak tabliczki; różnią się
    WYŁĄCZNIE wpisy wartości roboczych."""
    bez, wezel, _ = _migawka_a(maszyna, "propozycja")
    w_bez = _wiersz(_bieg_a(bez), wezel)
    propozycje = {w["parametr"]: w["wartosc"] for w in w_bez["parametry_robocze_maszyn"]}
    assert set(propozycje) == set(PARAMETRY_MASZYNY[MASZYNY[maszyna][1]])  # type: ignore[index]
    z_tabliczka = copy.deepcopy(bez)
    z_tabliczka["generators"][0]["materialized_params"].update(propozycje)
    w_tab = _wiersz(_bieg_a(z_tabliczka), wezel)
    assert w_bez["parametry_robocze_maszyn"]
    assert "parametry_robocze_maszyn" not in w_tab
    for klucz in ("ikss_a", "ip_a", "ib_a", "ith_a", "sk_mva"):
        assert w_bez[klucz] == w_tab[klucz], klucz


@pytest.mark.parametrize("maszyna", ["asynchroniczna", "dfig"])
def test_p_maszyny_ponizej_1_mw_zmienia_tylko_ib(maszyna: str) -> None:
    """Maszyna SN 0,5 MW: m < 1 MW dla każdego p — wiersz R_M/X_M stały, p działa wyłącznie
    w krzywej q (I_b). Wpis p nazywa tylko I_b; I″k, i_p, I_th — identyczne dla p = 1 i p = 4."""
    wiersze = {}
    for p in (1, 4):
        migawka, wezel, _ = _migawka_a(maszyna, "tabliczka", p_mw=0.5)
        migawka["generators"][0]["materialized_params"]["pole_pairs"] = p
        wiersze[p] = _wiersz(_bieg_a(migawka), wezel)
    for klucz in ("ikss_a", "ip_a", "ith_a"):
        assert wiersze[1][klucz] == wiersze[4][klucz], klucz
    assert wiersze[4]["ib_a"] < wiersze[1]["ib_a"]  # mniejsze m → silniejszy zanik q
    migawka, wezel, _ = _migawka_a(maszyna, "tabliczka", p_mw=0.5)
    del migawka["generators"][0]["materialized_params"]["pole_pairs"]
    (wpis,) = _wiersz(_bieg_a(migawka), wezel)["parametry_robocze_maszyn"]
    assert (wpis["parametr"], wpis["wielkosci"]) == ("pole_pairs", ["ib"])


@pytest.mark.parametrize("maszyna", ["asynchroniczna", "dfig"])
def test_p_maszyny_sn_2_mw_zmienia_r_x_i_wszystkie_pradow(maszyna: str) -> None:
    wiersze = {}
    for p in (1, 4):
        migawka, wezel, _ = _migawka_a(maszyna, "tabliczka")
        migawka["generators"][0]["materialized_params"]["pole_pairs"] = p
        wiersze[p] = _wiersz(_bieg_a(migawka), wezel)
    assert wiersze[1]["ip_a"] != wiersze[4]["ip_a"]  # R_M/X_M 0,10 → 0,15 (m = 2 → 0,5 MW)


@pytest.mark.parametrize("maszyna", list(MASZYNY))
def test_zwarcie_jednofazowe_bez_wpisow_tylko_ib(maszyna: str) -> None:
    migawka, wezel, _ = _migawka_a(maszyna, "propozycja", p_mw=0.5)
    wpisy_3f = _wiersz(_bieg_a(migawka), wezel)["parametry_robocze_maszyn"]
    wpisy_1f = _wiersz(_bieg_a(migawka, rodzaj="SC_1F"), wezel)["parametry_robocze_maszyn"]
    assert [w for w in wpisy_3f if w["wielkosci"] != ["ib"]] == wpisy_1f
    if MASZYNY[maszyna][1] == RODZINA_MASZYNA_ASYNCHRONICZNA:
        assert len(wpisy_3f) == len(wpisy_1f) + 1  # p — tylko krzywa q


def test_wyspa_punktu_i_maszyna_wylaczona() -> None:
    """Punkt poza wyspą maszyny nie dostaje jej wpisów; maszyna poza pracą — żaden punkt."""
    migawka, wezel, _ = _migawka_a("asynchroniczna", "propozycja")
    migawka["buses"].append({"ref_id": "wyspa", "name": "Szyna odcięta", "voltage_kv": 33.0})
    graf = map_enm_to_network_graph(EnergyNetworkModel.model_validate(migawka))
    trzy = ShortCircuitType.THREE_PHASE
    assert parametry_robocze_maszyn_punktu(graf, wezel, trzy)
    assert parametry_robocze_maszyn_punktu(graf, ref_to_graph_id("wyspa"), trzy) == []
    (id_maszyny,) = graf.asynchronous_machine_sources
    graf.asynchronous_machine_sources[id_maszyny] = dataclasses.replace(
        graf.asynchronous_machine_sources[id_maszyny], in_service=False
    )
    assert parametry_robocze_maszyn_punktu(graf, wezel, trzy) == []


def test_determinizm_dwa_biegi_te_same_wpisy_i_zalozenia() -> None:
    migawka, wezel, _ = _migawka_a("dfig", "odrzucona")
    biegi = [_bieg_a(copy.deepcopy(migawka)) for _ in range(2)]
    wiersze = [_wiersz(b, wezel) for b in biegi]
    assert json.dumps(wiersze[0]["parametry_robocze_maszyn"], sort_keys=True) == json.dumps(
        wiersze[1]["parametry_robocze_maszyn"], sort_keys=True
    )
    assert json.dumps(biegi[0].raw_result["zalozenia"], sort_keys=True) == json.dumps(
        biegi[1].raw_result["zalozenia"], sort_keys=True
    )


# =============================================================================
# 2. Konsumenci wiersza wyniku — sieć A (SN, pole stacji) i sieć B (nN, realna ścieżka)
# =============================================================================


@pytest.mark.parametrize(("maszyna", "dane"), KOMORKI)
def test_dowod_sc3f_raport_wklady_i_wytrzymalosc_aparatury(maszyna: str, dane: str) -> None:
    migawka, wezel, nazwa = _migawka_a(maszyna, dane)
    run = _bieg_a(migawka)
    wiersz = _wiersz(run, wezel)
    n = len(_wyrocznia(MASZYNY[maszyna][1], dane))

    # Dowód SC3F (ten sam rachunek z migawki): ostrzeżenie na każdy wpis (t_b podane — I_b też).
    pakiet = SC3FProofPack.generate(
        SC3FPackInput(
            project_name="Projekt",
            case_name="Przypadek",
            snapshot=migawka,
            fault_node_id=wezel,
            run_timestamp=datetime(2026, 1, 1),
            solver_version="test",
            scenariusz="MAX",
            nadpisanie_c=None,
            tk_s=1.0,
            tb_s=0.1,
        )
    )
    ostrzezenia = [
        w
        for w in pakiet.proof_sc3f.summary.warnings
        if w.startswith("Wynik liczony z wartością roboczą parametru")
    ]
    assert len(ostrzezenia) == n
    assert all(f"maszyna „{nazwa}”" in w for w in ostrzezenia)

    # Raport (PDF/DOCX): linia bilansu „Wartość robocza” na każdy wpis wiersza.
    linie = [
        linia for linia in _sc_row_bilans_linie(wiersz) if linia.startswith("Wartość robocza:")
    ]
    assert len(linie) == n

    # Wkłady punktu przez HTTP (ekran wkładów): wpisy, dane przyjęte i stan danych.
    with TestClient(app) as klient:
        odpowiedz = klient.post(
            "/api/proof/sc3f/contributions",
            json={"snapshot": migawka, "fault_node_id": wezel, "scenariusz": "MAX", "t_min_s": 0.1},
        )
    assert odpowiedz.status_code == 200, odpowiedz.text
    wklady = odpowiedz.json()
    assert len(wklady.get("parametry_robocze_maszyn", [])) == n
    assert len(wklady.get("dane_przyjete", [])) == n
    assert (wklady.get("status_danych") == "UNVALIDATED_INPUT") is (n > 0)

    # Wytrzymałość aparatury pola stacji: każde kryterium (dynamiczne i_p, cieplne I_th,
    # wyłączalność I_b) stoi na prądach zależnych od każdego wpisu (maszyna SN 2 MW).
    for ocena in _oceny_pola(run, migawka).values():
        assert _liczba_danych_przyjetych(ocena, nazwa) == n, ocena["kryterium_id"]


@pytest.mark.parametrize("maszyna", ["asynchroniczna", "dfig"])
@pytest.mark.parametrize(("p_mw", "p_tylko_ib"), [(0.5, True), (2.0, False)])
def test_wytrzymalosc_aparatury_wpis_p_wg_wielkosci_kryterium(
    maszyna: str, p_mw: float, p_tylko_ib: bool
) -> None:
    """Wpis p maszyny poniżej progu R_M/X_M (m < 1 MW dla każdego p) wpływa wyłącznie na I_b —
    jest daną przyjętą WYŁĄCZNIE kryterium wyłączalności I_b ≤ I_cu, nie dynamicznego (i_p)
    ani cieplnego (I_th). Maszyna 2 MW: p przestawia R_M/X_M, więc wpis we wszystkich."""
    migawka, _, nazwa = _migawka_a(maszyna, "propozycja", p_mw=p_mw)
    run = _bieg_a(migawka)
    oceny = {o["kryterium_id"].rsplit(".", 1)[-1]: o for o in _oceny_pola(run, migawka).values()}
    assert set(oceny) == {"dynamiczna", "cieplna", "wylaczanie"}
    for kryterium, ocena in oceny.items():
        parametry = _parametry_danych_przyjetych(ocena, nazwa)
        z_p = kryterium == "wylaczanie" or not p_tylko_ib
        assert ("pole_pairs" in parametry) is z_p, (kryterium, parametry)
        assert {"i_lr_ratio", "cos_phi", "efficiency"} <= parametry, kryterium


DANE_B = ("tabliczka", "projektant", "propozycja")
KOMORKI_B = [(m, d) for m in MASZYNY for d in DANE_B]


def _liczba_wpisow_b(maszyna: str, dane: str, wielkosc: str | tuple[str, ...]) -> int:
    """Wyrocznia sieci B (maszyna nN: p wyłącznie w krzywej q)."""
    rodzina = MASZYNY[maszyna][1]
    wielkosci = (wielkosc,) if isinstance(wielkosc, str) else wielkosc
    wpisy = _wyrocznia(rodzina, dane)
    return sum(1 for parametr, _ in wpisy if parametr != "pole_pairs" or "ib" in wielkosci)


@pytest.mark.parametrize(("maszyna", "dane"), KOMORKI_B)
def test_konsumenci_zapisanego_biegu_siec_nn(maszyna: str, dane: str) -> None:
    case = f"maszyny-{maszyna}-{dane}"
    enm = _siec_b(maszyna, dane)
    run = _bieg_zwarciowy(case, enm)
    n_ikss = _liczba_wpisow_b(maszyna, dane, "ikss")
    n_wszystkie = _liczba_wpisow_b(maszyna, dane, WIELKOSCI_ZWARCIOWE)

    # Wiersze biegu: każdy punkt wyspy (SN i nN) niesie wpisy maszyny.
    for szyna in (N1, N2):
        wiersz = _wiersz(run, ref_to_graph_id(szyna))
        assert len(wiersz.get("parametry_robocze_maszyn", [])) == n_wszystkie

    # Arkusz obwodów nN — Ik″max z biegu: wpisy wiersza punktu.
    assert len(_ik_z_biegu_zwarciowego(run, N2)[4]) == n_wszystkie

    # Reguły generatorów pola: wpisy z TEGO SAMEGO wiersza co Ik''/ip.
    ik, ip, run_id, _, _galezie, wpisy = _prady_zwarciowe_szyny(case, N2)
    assert ik is not None and run_id == str(run.id)
    assert len(wpisy) == n_wszystkie

    # Wniosek do OSD: I″k, S″k, i_p, I_th — dane przyjęte wpisów wpływających na nie.
    sekcja = _zwarcia_sekcja(run, N2)
    assert len(sekcja.get("dane_przyjete", [])) == n_ikss
    assert _ile(sekcja, NAZWA_B) == n_ikss

    # Nastawy z biegów: punkty zestawu — każdy (maszyna, parametr) raz.
    raw = run.raw_result
    dane_nastaw = _dane_przyjete_punktow(
        enm,
        [
            (raw, ref_to_graph_id(N2), N2),
            (raw, ref_to_graph_id(N1), N1),
            (raw, ref_to_graph_id(N2), N2),
        ],
    )
    assert len(dane_nastaw) == n_ikss

    # Autorytet biegu → dowód aparatury: dane przyjęte wg wielkości porównań dowodu (I_b też).
    wejscie = wejscie_zwarciowe_z_biegu(run_id=str(run.id), punkt_zwarcia=ref_to_graph_id(N2))
    assert len(wejscie.parametry_robocze_maszyn) == n_wszystkie
    wejscie_dowodu = dataclasses.replace(
        _base_input(), parametry_robocze_maszyn=wejscie.parametry_robocze_maszyn
    )
    paczka = EquipmentProofGenerator.generate(wejscie_dowodu)
    assert len(paczka.result.dane_przyjete) == n_wszystkie
    assert (paczka.result.to_dict().get("status_danych") == "UNVALIDATED_INPUT") is (
        n_wszystkie > 0
    )

    # Łuk elektryczny: I_bf = I″k punktu — dane przyjęte wpisów wpływających na I″k.
    luk = build_arc_flash_view(
        run, working_distance_mm=455.0, conductor_gap_mm=25.0, arc_time_s=0.2
    )
    wynik_nn = [w for w in luk["results"] if str(w["bus_ref"]) == ref_to_graph_id(N2)]
    assert wynik_nn
    assert all(len(w.get("dane_przyjete", [])) == n_ikss for w in wynik_nn)

    # Wytrzymałość cieplna (pierwszy wiersz biegu = punkt nN): I_th.
    wiersze = run.raw_result["results"]
    pierwszy = _wiersz(run, ref_to_graph_id(N2))
    run_nn = dataclasses.replace(
        run,
        raw_result={**raw, "results": [pierwszy, *(w for w in wiersze if w is not pierwszy)]},
    )
    widok = build_wytrzymalosc_cieplna_view(run_nn)
    assert _ile(widok.get("dane_przyjete", []), NAZWA_B) == n_ikss
    assert (widok.get("status_danych") == "UNVALIDATED_INPUT") is (n_ikss > 0)


@pytest.mark.parametrize("oznaczony", ["zaden", B2, B3, B4, "wszystkie"])
def test_ocena_nadpradowa_dana_przyjeta_punktu_oceny(oznaczony: str) -> None:
    """Q2 ocenia się w punkcie B4: dana przyjęta maszyny wyłącznie, gdy wpisy niesie wiersz B4
    (ten, z którego ocena bierze prąd); wpis „tylko I_b” nigdy (ocena stoi na I″k)."""
    wpisy = [
        {
            "source_id": "gm",
            "source_name": "Agregat",
            "parametr": parametr,
            "nazwa_pl": parametr,
            "symbol": parametr,
            "wartosc": 1.0,
            "jednostka": "1",
            "pochodzenie": "PROPOZYCJA",
            "opis_zrodla_pl": "wartość robocza",
            "wielkosci": wielkosci,
        }
        for parametr, wielkosci in (("cos_phi", list(WIELKOSCI_ZWARCIOWE)), ("pole_pairs", ["ib"]))
    ]
    wiersze = [
        (
            {**w, "parametry_robocze_maszyn": wpisy}
            if oznaczony in ("wszystkie", w["fault_node_id"])
            else w
        )
        for w in WIERSZE
    ]
    (ocena,) = _ocen(_model(_przypisanie(Q2, [_stopien_51()])), wiersze=wiersze).oceny
    assert ocena.punkt_ref == B4
    robocza = oznaczony in (B4, "wszystkie")
    status = ocena.ocena.dowod.status_danych
    assert (status.stan == "UNVALIDATED_INPUT") is robocza
    assert [d.nazwa_pl for d in status.dane_przyjete] == (
        ["cos_phi cos_phi maszyny „Agregat”"] if robocza else []
    )
    kompletnosc, powody = kompletnosc_dowodu(ocena.ocena.dowod, ())
    assert (any(_znacznik("Agregat") in p for p in powody)) is robocza, powody
    if robocza:
        assert kompletnosc == "NIEPELNY"
    assert (_znacznik("Agregat") in _dopisek_danych_przyjetych(ocena)) is robocza


# =============================================================================
# 3. Pętla zwarcia nN, SWZ, kotwica domeny nN i arkusz obwodów — maszyna SN wyspy
# =============================================================================

_WIDOKI_PETLI = {
    "petla_u_zrodla": lambda enm: build_station_fault_loop_view(enm, "stn"),
    "petla_w_punkcie": lambda enm: build_fault_loop_view_at_point(enm, "stn", "b1"),
    "swz": lambda enm: build_swz_view(enm, "stn", "b1", "ap1")["swz"],
}


def _enm_petli_z_maszyna(maszyna: str, dane: str) -> EnergyNetworkModel:
    enm = _enm_petli("TR-7", 15.0, 0.4)
    gen_type, rodzina = MASZYNY[maszyna]
    baza: dict[str, float] = {"un_kv": 15.0}
    moc = 2.5 if rodzina == RODZINA_MASZYNA_SYNCHRONICZNA else 2.0
    pola = _dane_maszyny(rodzina, dane, baza, moc=moc)
    gen = Generator(
        ref_id="gm",
        name=NAZWA_B,
        bus_ref="gn",
        p_mw=2.0,
        gen_type=gen_type,  # type: ignore[arg-type]
        materialized_params=pola["materialized_params"],
        overrides=[ParameterOverride(**w) for w in pola.get("overrides", [])],
        parameter_source=pola.get("parameter_source"),
    )
    return enm.model_copy(update={"generators": [gen]})


@pytest.mark.parametrize("widok", sorted(_WIDOKI_PETLI))
@pytest.mark.parametrize(("maszyna", "dane"), KOMORKI_B)
def test_petla_i_swz_niosa_dane_przyjete_maszyny_sieci_zasilajacej(
    maszyna: str, dane: str, widok: str
) -> None:
    """Z_Q pętli nN = Thevenin SN z maszyną jako admitancją bocznikową (macierz Y) — każdy
    wpis maszyny, który zmienia Z_M (wszystkie poza wpisem „tylko I_b”), jest daną przyjętą
    I_k pętli; maszyna SN 2 MW: p zmienia wiersz R_M/X_M, więc też."""
    enm = _enm_petli_z_maszyna(maszyna, dane)
    wynik = _WIDOKI_PETLI[widok](enm)
    n = len(_wyrocznia(MASZYNY[maszyna][1], dane))
    if widok == "swz":
        assert _ile(wynik.get("dane_przyjete", []), NAZWA_B) == n
        assert (wynik.get("status_danych") == "UNVALIDATED_INPUT") is (n > 0)
    else:
        wpisy = wynik["fault_loop"].get("parametry_robocze_maszyn", [])
        assert {(w["parametr"], w["pochodzenie"]) for w in wpisy} == _wyrocznia(
            MASZYNY[maszyna][1], dane
        )
        assert all(w["source_name"] == NAZWA_B for w in wpisy)


@pytest.mark.parametrize(("maszyna", "dane"), KOMORKI_B)
def test_kotwica_domeny_nn_niesie_wpisy_maszyn(maszyna: str, dane: str) -> None:
    enm = _enm_petli_z_maszyna(maszyna, dane)
    kotwica = build_upstream_equivalent_snapshot(enm, "przypadek", "stn")
    n = len(_wyrocznia(MASZYNY[maszyna][1], dane))
    assert len(kotwica.get("parametry_robocze_maszyn", [])) == n
    assert _ile(kotwica.get("dane_przyjete", []), NAZWA_B) == n


@pytest.mark.parametrize("dane", DANE_B)
def test_arkusz_obwodow_nn_z_maszyna_sn(dane: str) -> None:
    enm = _siec_referencyjna()
    pola = _dane_maszyny(RODZINA_MASZYNA_SYNCHRONICZNA, dane, {"un_kv": 15.0}, moc=2.5)
    enm = enm.model_copy(
        update={
            "generators": [
                Generator(
                    ref_id="gm",
                    name=NAZWA_B,
                    bus_ref="sn",
                    p_mw=2.0,
                    gen_type="synchronous",
                    materialized_params=pola["materialized_params"],
                    overrides=[ParameterOverride(**w) for w in pola.get("overrides", [])],
                    parameter_source=pola.get("parameter_source"),
                )
            ]
        }
    )
    robocza = dane != "tabliczka"
    arkusz = build_nn_circuit_sheet(enm=enm, station_ref="stn")
    assert arkusz["wiersze"]
    for wiersz in arkusz["wiersze"]:
        if wiersz["ik_min"]["status"] == "OK":
            assert (_ile(wiersz["ik_min"], NAZWA_B) > 0) is robocza, wiersz[
                "feeder_root_branch_ref"
            ]


# =============================================================================
# 4. Operacja domenowa: brama wartości projektanta na STANIE KOŃCOWYM
# =============================================================================


def _enm_generatora(gen_type: str, **pola: Any) -> dict[str, Any]:
    migawka, _, _ = _migawka_a("synchroniczna", "tabliczka")
    migawka["generators"][0].update(gen_type=gen_type, **pola)
    return migawka


def _zmien(enm: dict[str, Any], parametry: dict[str, Any]) -> dict[str, Any]:
    return execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": enm["generators"][0]["ref_id"], "parameters": parametry},
    )


def _generator_po(wynik: dict[str, Any]) -> dict[str, Any]:
    assert not wynik.get("error"), wynik.get("error")
    return wynik["snapshot"]["generators"][0]


@pytest.mark.parametrize("gen_type", ["synchronous", "fw_scig", "fw_dfig"])
def test_operacja_przyjmuje_wartosci_rodziny_w_kolejnosci_rejestru(gen_type: str) -> None:
    rodzina = RODZINA_MASZYNY_WG_GEN_TYPE[gen_type]
    wpisy = [
        {"key": k, "value": v, "reason": POWOD_PROJEKTANTA}
        for k, v in reversed(list(_projektant(rodzina, 2.0).items()))
    ]
    gen = _generator_po(_zmien(_enm_generatora(gen_type), {"overrides": wpisy}))
    assert [w["key"] for w in gen["overrides"]] == list(PARAMETRY_MASZYNY[rodzina])  # type: ignore[index]
    assert gen["parameter_source"] == "OVERRIDE"


_ODMOWY = [
    ("synchronous", [{"key": "cos_phi", "value": 1.2, "reason": None}]),
    ("synchronous", [{"key": "pole_pairs", "value": 2, "reason": None}]),
    ("fw_scig", [{"key": "pole_pairs", "value": 2.5, "reason": None}]),
    ("fw_scig", [{"key": "xd_subtransient_pu", "value": 0.2, "reason": None}]),
    ("fw_dfig", [{"key": "efficiency", "value": "0,9", "reason": None}]),
    (
        "fw_dfig",
        [
            {"key": "i_lr_ratio", "value": 6, "reason": None},
            {"key": "i_lr_ratio", "value": 7, "reason": None},
        ],
    ),
    ("pv_inverter", [{"key": "cos_phi", "value": 0.9, "reason": None}]),
    ("bess", [{"key": "cos_phi", "value": 0.9, "reason": None}]),
]


@pytest.mark.parametrize(("gen_type", "wpisy"), _ODMOWY)
def test_operacja_odmawia_wartosci_spoza_bramy_rodziny(gen_type: str, wpisy: list[Any]) -> None:
    wynik = _zmien(_enm_generatora(gen_type), {"overrides": wpisy})
    assert wynik.get("error_code") == "params.override_invalid", wynik
    assert wynik.get("snapshot") is None


@pytest.mark.parametrize(
    ("zrodlo_przed", "catalog_ref", "zrodlo_po"),
    [
        ("OVERRIDE", "katalog-agregatu", "CATALOG"),
        ("OVERRIDE", None, None),
        ("CATALOG", "k", "CATALOG"),
        (None, None, None),
    ],
)
def test_wyczyszczenie_wartosci_projektanta_wraca_do_pochodzenia(
    zrodlo_przed: str | None, catalog_ref: str | None, zrodlo_po: str | None
) -> None:
    enm = _enm_generatora(
        "fw_scig",
        overrides=(
            [{"key": "pole_pairs", "value": 2, "reason": None}]
            if zrodlo_przed == "OVERRIDE"
            else []
        ),
        parameter_source=zrodlo_przed,
        catalog_ref=catalog_ref,
    )
    gen = _generator_po(_zmien(enm, {"overrides": []}))
    assert gen["overrides"] == []
    assert gen.get("parameter_source") == zrodlo_po


def test_operacja_parametrow_nie_zmienia_rodzaju_generatora() -> None:
    """Rodzaju generatora nie zmienia aktualizacja parametrów — zapisane wartości projektanta
    nie mogą zostać przy rodzinie, do której nie należą (stan końcowy = rodzaj bieżący)."""
    enm = _enm_generatora(
        "synchronous",
        overrides=[{"key": "xd_subtransient_pu", "value": 0.2, "reason": None}],
        parameter_source="OVERRIDE",
    )
    wynik = _zmien(enm, {"gen_type": "fw_scig"})
    assert wynik.get("error_code") == "params.key_not_allowed", wynik


# --- Operacje topologii (create/update) — ta sama brama na stanie końcowym ---


def _generator_topologii(enm: dict[str, Any]) -> dict[str, Any]:
    return enm["generators"][0]


def test_topologia_zmiana_rodzaju_sprawdza_wartosci_wzgledem_nowej_rodziny() -> None:
    enm = _enm_generatora(
        "synchronous",
        overrides=[{"key": "xd_subtransient_pu", "value": 0.2, "reason": None}],
        parameter_source="OVERRIDE",
    )
    ref = enm["generators"][0]["ref_id"]
    przed = copy.deepcopy(enm)
    for rodzaj in ("fw_scig", "fw_dfig", "pv_inverter"):
        wynik = update_device(
            copy.deepcopy(enm), {"device_type": "generator", "ref_id": ref, "gen_type": rodzaj}
        )
        assert not wynik.success, rodzaj
        assert [i.code for i in wynik.issues] == ["OP_OVERRIDE_INVALID"], rodzaj
    assert enm == przed
    # Zmiana rodzaju z wyczyszczeniem wartości w tej samej operacji — przyjęta.
    wynik = update_device(
        copy.deepcopy(enm),
        {"device_type": "generator", "ref_id": ref, "gen_type": "fw_scig", "overrides": []},
    )
    assert wynik.success and _generator_topologii(wynik.enm)["gen_type"] == "fw_scig"
    # Zmiana rodzaju z wartością nowej rodziny — przyjęta.
    wynik = update_device(
        copy.deepcopy(enm),
        {
            "device_type": "generator",
            "ref_id": ref,
            "gen_type": "fw_dfig",
            "overrides": [{"key": "pole_pairs", "value": 4, "reason": None}],
        },
    )
    assert wynik.success


@pytest.mark.parametrize(("gen_type", "wpisy"), _ODMOWY)
def test_topologia_tworzenie_i_zmiana_generatora_odmawia_wartosci_spoza_bramy(
    gen_type: str, wpisy: list[Any]
) -> None:
    enm = _enm_generatora(gen_type)
    ref = enm["generators"][0]["ref_id"]
    zmiana = update_device(
        copy.deepcopy(enm), {"device_type": "generator", "ref_id": ref, "overrides": wpisy}
    )
    assert [i.code for i in zmiana.issues] == ["OP_OVERRIDE_INVALID"]
    nowy = create_device(
        copy.deepcopy(enm),
        {
            "device_type": "generator",
            "ref_id": "nowy",
            "name": "Nowe źródło",
            "bus_ref": enm["generators"][0]["bus_ref"],
            "gen_type": gen_type,
            "overrides": wpisy,
        },
    )
    assert not nowy.success
    assert [i.code for i in nowy.issues] == ["OP_OVERRIDE_INVALID"]


_APARAT_ODMOWY = [
    [{"key": "i_th_ka", "value": -5.0, "reason": None}],
    [{"key": "cos_phi", "value": 0.9, "reason": None}],
    [{"key": "break_time_s", "value": "0,05", "reason": None}],
]


@pytest.mark.parametrize("wpisy", _APARAT_ODMOWY)
def test_topologia_galaz_aparatu_sn_odmawia_wartosci_spoza_bramy(wpisy: list[Any]) -> None:
    enm = _enm_generatora("synchronous")
    szyna = enm["generators"][0]["bus_ref"]
    enm["buses"].append({"ref_id": "zacisk", "name": "Zacisk", "voltage_kv": 33.0})
    aparat = {
        "ref_id": "aparat",
        "name": "Wyłącznik pola",
        "type": "breaker",
        "from_bus_ref": szyna,
        "to_bus_ref": "zacisk",
        "catalog_namespace": "APARAT_SN",
    }
    nowy = create_branch(copy.deepcopy(enm), {**aparat, "overrides": wpisy})
    assert [i.code for i in nowy.issues] == ["OP_OVERRIDE_INVALID"]
    utworzony = create_branch(copy.deepcopy(enm), aparat)
    assert utworzony.success
    zmiana = update_branch(utworzony.enm, {"ref_id": "aparat", "overrides": wpisy})
    assert [i.code for i in zmiana.issues] == ["OP_OVERRIDE_INVALID"]
    # Gałąź bez wiązania aparatu: `overrides` należą do innego mechanizmu — bez bramy rodziny.
    zwykla = create_branch(
        copy.deepcopy(enm), {**aparat, "catalog_namespace": None, "overrides": wpisy}
    )
    assert zwykla.success


# --- Walidator ENM: E011 dla modelu z wartością spoza bramy (plik, stan sprzed bramy) ---

_E011_GENERATOR = [
    ("synchronous", [{"key": "xd_subtransient_pu", "value": 0.2, "reason": None}], False),
    ("synchronous", [{"key": "xd_subtransient_pu", "value": 0.9, "reason": None}], True),
    ("synchronous", [{"key": "p_mw", "value": 1.0, "reason": None}], True),
    ("fw_scig", [{"key": "pole_pairs", "value": 2.5, "reason": None}], True),
    ("fw_scig", [{"key": "efficiency", "value": "0,9", "reason": None}], True),
    (
        "fw_dfig",
        [
            {"key": "cos_phi", "value": 0.9, "reason": None},
            {"key": "cos_phi", "value": 0.8, "reason": None},
        ],
        True,
    ),
    ("fw_dfig", [{"key": "i_lr_ratio", "value": 6.0, "reason": None}], False),
    # Generator spoza maszyn wirujących: lista bez konsumenta obliczeń — bez blokady.
    ("pv_inverter", [{"key": "cos_phi", "value": 0.2, "reason": None}], False),
]


@pytest.mark.parametrize(("gen_type", "wpisy", "blokada"), _E011_GENERATOR)
def test_walidator_e011_generatora(gen_type: str, wpisy: list[Any], blokada: bool) -> None:
    enm = EnergyNetworkModel.model_validate(
        _enm_generatora(gen_type, overrides=wpisy, parameter_source="OVERRIDE")
    )
    kody = [i.code for i in ENMValidator().validate(enm).issues]
    assert ("E011" in kody) is blokada, kody
    assert ODWZOROWANIE_WALIDATOR_NA_KANON["E011"] == "catalog.wartosc_projektanta_niedopuszczalna"


@pytest.mark.parametrize("wpisy", _APARAT_ODMOWY)
@pytest.mark.parametrize("przestrzen", ["APARAT_SN", None])
def test_walidator_e011_aparatu_sn(wpisy: list[Any], przestrzen: str | None) -> None:
    surowa = _enm_generatora("synchronous")
    szyna = surowa["generators"][0]["bus_ref"]
    surowa["buses"].append({"ref_id": "zacisk", "name": "Zacisk", "voltage_kv": 33.0})
    surowa["branches"].append(
        {
            "ref_id": "aparat",
            "name": "Wyłącznik pola",
            "type": "breaker",
            "from_bus_ref": szyna,
            "to_bus_ref": "zacisk",
            "catalog_namespace": przestrzen,
            "overrides": wpisy,
            "parameter_source": "OVERRIDE",
        }
    )
    enm = EnergyNetworkModel.model_validate(surowa)
    issues = [i for i in ENMValidator().validate(enm).issues if i.code == "E011"]
    assert bool(issues) is (przestrzen == "APARAT_SN")
    for issue in issues:
        assert issue.element_refs == ["aparat"]
        assert issue.fix_action is not None and issue.fix_action.element_ref == "aparat"


def test_bieg_modelu_z_wartoscia_spoza_bramy_zablokowany_kodem_kanonicznym() -> None:
    """Realna ścieżka: model z pliku z x″d = 0,9 nie liczy się z cichym pominięciem wartości
    projektanta — gotowość blokuje bieg kodem kanonicznym E011 z naprawą w sekcji wartości."""
    enm = _siec_b("synchroniczna", "projektant")
    gen = enm.generators[0].model_copy(
        update={"overrides": [ParameterOverride(key="xd_subtransient_pu", value=0.9)]}
    )
    enm = enm.model_copy(update={"generators": [gen]})
    with pytest.raises(OdmowaNazwana) as blad:
        _bieg_zwarciowy("maszyny-e011", enm)
    assert f"Źródło „{NAZWA_B}” ma wartość projektanta" in str(blad.value)
    assert "0,05–0,5" in str(blad.value)
    assert blad.value.kod == "enm.model_nie_przeszedl_walidacji"
    assert tuple(blad.value.dane["elementy"]) == ("gm",)


# =============================================================================
# 5. CGMES: atrybuty maszyny wirującej — eksport i import toru obcego
# =============================================================================

_CIM = f"{{{NS_CIM}}}"


@pytest.mark.parametrize("jednostki", [1, 3])
@pytest.mark.parametrize("gen_type", ["synchronous", "fw_scig"])
def test_cgmes_niesie_parametry_maszyny_tam_i_z_powrotem(gen_type: str, jednostki: int) -> None:
    """Parametry intensywne (x″d, cos φ, p, I_LR/I_rM, η) przechodzą 1:1; moce znamionowe
    S_rG/S_rM (``ratedS``) i P_rM (``ratedMechanicalPower``) są wielkościami grupy — eksport
    × liczba jednostek, import jedna jednostka o mocy łącznej (ta sama moc całej grupy)."""
    rodzina = RODZINA_MASZYNY_WG_GEN_TYPE[gen_type]
    tabliczka = {
        "sn_mva": 2.5,
        "un_kv": 15.0,
        **_tabliczka(rodzina, 2.5 if gen_type == "synchronous" else 2.0),
    }
    enm = EnergyNetworkModel.model_validate(
        _enm_generatora(gen_type, materialized_params=tabliczka, quantity=jednostki)
    )
    eq, _tp = build_eq_tp_trees(enm)
    klasa = "SynchronousMachine" if gen_type == "synchronous" else "AsynchronousMachine"
    (urzadzenie,) = (e for e in eq if e.tag == f"{_CIM}{klasa}")
    moc_p = urzadzenie.find(f"{_CIM}AsynchronousMachine.ratedMechanicalPower")
    if gen_type == "fw_scig":
        assert urzadzenie.find(f"{_CIM}AsynchronousMachine.polePairNumber").text == "2"
        assert urzadzenie.find(f"{_CIM}AsynchronousMachine.efficiency").text == "96"
        assert moc_p is not None and float(moc_p.text) == pytest.approx(2.0e6 * jednostki)
    else:
        assert moc_p is None
    wynik = import_cgmes(export_cgmes(enm), prefer_side_car=False)
    assert wynik.enm is not None
    (gen,) = wynik.enm.generators
    for klucz, wartosc in TABLICZKA[rodzina].items():
        assert gen.materialized_params[klucz] == pytest.approx(wartosc), klucz
    for klucz in ("sn_mva", "pr_mw"):
        if klucz in tabliczka:
            assert gen.materialized_params[klucz] == pytest.approx(
                tabliczka[klucz] * jednostki
            ), klucz


def test_cgmes_maszyna_asynchroniczna_bez_mocy_mechanicznej_pomija_atrybut() -> None:
    enm = EnergyNetworkModel.model_validate(
        _enm_generatora("fw_scig", materialized_params={"un_kv": 15.0})
    )
    eq, _tp = build_eq_tp_trees(enm)
    (urzadzenie,) = (e for e in eq if e.tag == f"{_CIM}AsynchronousMachine")
    assert urzadzenie.find(f"{_CIM}AsynchronousMachine.ratedMechanicalPower") is None
    wynik = import_cgmes(export_cgmes(enm), prefer_side_car=False)
    assert wynik.enm is not None
    assert "pr_mw" not in (wynik.enm.generators[0].materialized_params or {})


def test_cgmes_utraty_nazywaja_dfig_i_wartosci_projektanta() -> None:
    assert any("maszyny DFIG" in u for u in GENERATOR_UTRATA_TORU_OBCEGO)
    assert any("wartości projektanta" in u for u in GENERATOR_UTRATA_TORU_OBCEGO)


# =============================================================================
# 6. Bramy pokrewne: cos φ agregatu nN i wartości projektanta aparatu SN z pliku
# =============================================================================


@pytest.mark.parametrize(
    ("cos_phi", "przyjety"), [(0.4, False), (0.5, True), (1.0, True), (1.01, False)]
)
def test_cos_phi_agregatu_ta_sama_brama_co_rejestr(cos_phi: float, przyjety: bool) -> None:
    from tests.enm.test_genset_ups_sc import _base_enm, _genset_payload

    payload = _genset_payload()
    payload["genset_spec"]["power_factor"] = cos_phi
    wynik = execute_domain_operation(_base_enm(), "add_genset_nn", payload)
    if przyjety:
        assert not wynik.get("error"), wynik.get("error")
    else:
        assert wynik.get("error_code") == "generator.power_factor_invalid"


@pytest.mark.parametrize(
    ("wartosc", "przyjeta"),
    [(16.0, True), (-5.0, False), (1e9, False), ("16", False), (True, False)],
)
def test_wartosc_projektanta_aparatu_z_pliku_przez_brame_rejestru(
    wartosc: Any, przyjeta: bool
) -> None:
    wynik = wartosci_projektanta_aparatu(
        [ParameterOverride.model_construct(key="i_th_ka", value=wartosc, reason=None)]
    )
    assert (len(wynik) == 1) is przyjeta


if __name__ == "__main__":
    FIKSTURA_FRONTU.parent.mkdir(parents=True, exist_ok=True)
    FIKSTURA_FRONTU.write_text(_fikstura_frontu(), encoding="utf-8")
    print(f"zapisano {FIKSTURA_FRONTU}")
