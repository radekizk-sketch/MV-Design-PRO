"""Zwarcia na sieci golden przez tor kanoniczny — migracja fizyki z dawnego
testu E3 (`ExecutionEngineService.execute_run_sc`, `tests/test_pr18_sc_integration.py`,
klasy `TestContractShape`/`TestGoldenFixtures`/`TestHardeningInvariants`, kasacja
karta CV-3.3-A). E3 nie miał ANI JEDNEJ trasy HTTP ani konsumenta produkcyjnego —
żył wyłącznie w testach; R1 (`enm.canonical_analysis`) jest jedynym torem
produkcyjnym biegów zwarciowych. Sieć tu odtwarza KONCEPCYJNIE tę samą topologię
co dawna fikstura E3 (`_create_golden_graph`: zasilanie -> transformator ->
szyna SN -> kabel -> szyna dalsza), przełożoną na ENM (dawna fikstura budowała
`NetworkGraph` ręcznie, z węzłem-hakiem GND do odwracalności Y-bus — ENM tego
haka nie potrzebuje, bo `enm.mapping` buduje graf inaczej). Dawna fikstura
niosła też falownik PV (`INV1`) — TA fizyka (wkład falownika do prądu
zwarciowego jest dodatni i podnosi prąd całkowity) jest już DOWIEDZIONA
niezależnie od E3: `tests/enm/test_enm_mapping.py::
test_converter_contributes_to_short_circuit`; dublowanie jej tu wymagałoby
pełnej stacji nN (Substation/Bay + connection_variant/station_ref — DER
energoelektroniczny jest w ENM elementem nN, walidator to egzekwuje) bez
nowej treści dowodowej.

Asercje liczbowe zachowują INTENCJĘ dawnych testów E3 (zbieżność, dodatnie
prądy zwarciowe, 3F > 2F, Z0 wymagane dla 1F, determinizm, kompletność
kontraktu, ślad WHITE BOX niepusty) — nie kopiują bajtowo starej fikstury
(inny szkielet budowy sieci, ta sama fizyka IEC 60909).

Tor: `set_enm` + `create_run(..., klucz_twin=)` + `execute_run`
(`enm.canonical_analysis`) — jedyny tor produkcyjny biegów (R1).
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Source,
    Transformer,
)
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record

N0 = "N0_GPZ_SN"
N1 = "N1_SZYNA_SN"
N2 = "N2_SZYNA_NN"
N3 = "N3_KONIEC_NN"

_SK3_MVA = 250.0
_UN_SN_KV = 15.0
_RX_SOURCE = 0.1

_R_SN_PER_KM = 0.253
_X_SN_PER_KM = 0.100
_LEN_SN_KM = 2.0

_TR_SN_MVA = 0.630
_TR_UK_PERCENT = 6.0
_TR_PK_KW = 8.0

_R_LV_PER_KM = 0.253
_X_LV_PER_KM = 0.069
_LEN_LV_KM = 0.060
_UN_LV_KV = 0.4

# Skladowa zerowa — dane FIXTURE (Z0≈3·Z1, przyblizenie typowe dla kabli),
# wylacznie po to, by test SC_1F mial komplet sieci zerowej; solver liczy z
# tego, co dostanie, bez fabrykacji.
_R0_SN_PER_KM = 3.0 * _R_SN_PER_KM
_X0_SN_PER_KM = 3.0 * _X_SN_PER_KM
_R0_LV_PER_KM = 3.0 * _R_LV_PER_KM
_X0_LV_PER_KM = 3.0 * _X_LV_PER_KM
_R0_SOURCE_OHM = 0.16
_X0_SOURCE_OHM = 1.6


def _build_golden_enm(name: str) -> EnergyNetworkModel:
    """GPZ SN -> kabel SN -> szyna SN -> TR -> szyna nN -> kabel nN -> koniec
    obwodu. Wszystkie galezie/TR/zrodlo maja catalog_ref (E009 CATALOG-FIRST
    jest BLOKEREM w ENMValidator).

    BEZ falownika/DER: wklad falownika do zwarcia (I_k rosnie, wklad > 0,
    ik_total > ik_thevenin) jest juz DOWIEDZIONY niezaleznie —
    `tests/enm/test_enm_mapping.py::test_converter_contributes_to_short_circuit`
    — dublowanie tej fizyki tu wymagaloby pelnej stacji nN (Substation/Bay,
    `connection_variant` + `station_ref`) bez nowej tresci dowodowej."""
    return EnergyNetworkModel(
        header=ENMHeader(name=name),
        buses=[
            Bus(ref_id=N0, name="GPZ 15 kV", voltage_kv=_UN_SN_KV),
            Bus(ref_id=N1, name="Szyna SN stacji", voltage_kv=_UN_SN_KV),
            Bus(ref_id=N2, name="Szyna nN", voltage_kv=_UN_LV_KV),
            Bus(ref_id=N3, name="Koniec obwodu nN", voltage_kv=_UN_LV_KV),
        ],
        branches=[
            Cable(
                ref_id="C_SN",
                name="Kabel SN XLPE Al 3x120mm2",
                from_bus_ref=N0,
                to_bus_ref=N1,
                length_km=_LEN_SN_KM,
                r_ohm_per_km=_R_SN_PER_KM,
                x_ohm_per_km=_X_SN_PER_KM,
                r0_ohm_per_km=_R0_SN_PER_KM,
                x0_ohm_per_km=_X0_SN_PER_KM,
                catalog_ref="cable-sn-xlpe-al-120",
                catalog_namespace="mv_cables",
                parameter_source="CATALOG",
            ),
            Cable(
                ref_id="C_NN",
                name="Kabel nN YAKY 4x120",
                from_bus_ref=N2,
                to_bus_ref=N3,
                length_km=_LEN_LV_KM,
                r_ohm_per_km=_R_LV_PER_KM,
                x_ohm_per_km=_X_LV_PER_KM,
                r0_ohm_per_km=_R0_LV_PER_KM,
                x0_ohm_per_km=_X0_LV_PER_KM,
                catalog_ref="cable-nn-yaky-4x120",
                catalog_namespace="KABEL_NN",
                parameter_source="CATALOG",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="TR1",
                name="TR 15/0,4 kV 630 kVA Dyn11",
                hv_bus_ref=N1,
                lv_bus_ref=N2,
                sn_mva=_TR_SN_MVA,
                uhv_kv=_UN_SN_KV,
                ulv_kv=_UN_LV_KV,
                uk_percent=_TR_UK_PERCENT,
                pk_kw=_TR_PK_KW,
                vector_group="Dyn11",
                catalog_ref="tr-15-04-630kva-dyn11",
                catalog_namespace="mv_transformers",
                parameter_source="CATALOG",
            ),
        ],
        sources=[
            Source(
                **gpz_source_record(
                    ref_id="GRID_Q",
                    name="Siec zasilajaca 15 kV",
                    bus_ref=N0,
                    voltage_kv=_UN_SN_KV,
                    sk3_mva=_SK3_MVA,
                    rx_ratio=_RX_SOURCE,
                    extra={"r0_ohm": _R0_SOURCE_OHM, "x0_ohm": _X0_SOURCE_OHM},
                )
            ),
        ],
    )


def _build_golden_enm_bez_z0(name: str) -> EnergyNetworkModel:
    """Ta sama siec, ale BEZ zadnej danej skladowej zerowej (zaden r0/x0_ohm
    ani r0/x0_ohm_per_km) — dla dowodu, ze SC_1F bez Z0 jest jawna odmowa."""
    return EnergyNetworkModel(
        header=ENMHeader(name=name),
        buses=[
            Bus(ref_id=N0, name="GPZ 15 kV", voltage_kv=_UN_SN_KV),
            Bus(ref_id=N1, name="Szyna SN stacji", voltage_kv=_UN_SN_KV),
        ],
        branches=[
            Cable(
                ref_id="C_SN",
                name="Kabel SN XLPE Al 3x120mm2",
                from_bus_ref=N0,
                to_bus_ref=N1,
                length_km=_LEN_SN_KM,
                r_ohm_per_km=_R_SN_PER_KM,
                x_ohm_per_km=_X_SN_PER_KM,
                catalog_ref="cable-sn-xlpe-al-120",
                catalog_namespace="mv_cables",
                parameter_source="CATALOG",
            ),
        ],
        sources=[
            Source(
                **gpz_source_record(
                    ref_id="GRID_Q",
                    name="Siec zasilajaca 15 kV",
                    bus_ref=N0,
                    voltage_kv=_UN_SN_KV,
                    sk3_mva=_SK3_MVA,
                    rx_ratio=_RX_SOURCE,
                )
            ),
        ],
    )


def _lokalizacja(ref_id: str) -> dict[str, object]:
    return {"location": {"element_ref": ref_id, "location_type": "BUS", "position": None}}


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(
    klucz: str,
    enm: EnergyNetworkModel,
    *,
    fault_type: str = "3F",
    fault_ref: str = N1,
    **extra_options: object,
):
    set_enm(klucz, enm)
    run = create_run(
        case_id=klucz,
        klucz_twin=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": fault_type, **_lokalizacja(fault_ref), **extra_options},
    )
    return execute_run(run.id)


def _wiersz(run) -> dict[str, object]:
    """Jedyny wiersz wyniku (lokalizacja zawezila zbior do jednego punktu)."""
    wiersze = run.raw_result["results"]
    assert len(wiersze) == 1, "lokalizacja BUS musi dac dokladnie jeden wiersz"
    return wiersze[0]


# Pola WYLACZONE z porownan determinizmu/roundtrip nie dlatego, ze fizyka moze
# sie roznic, tylko dlatego, ze niosa TOZSAMOSC BIEGU (run_id), nie fizyke:
# - `proof_ref`/`proof_binding` (zawiera `proof_ref`) — odcisk dowodu WIAZE run_id,
#   wiec dwa fizycznie identyczne biegi maja z definicji rozny `proof_ref`
#   (ten sam wzorzec zastrzega dawny test E3
#   `test_sc3f_run_deterministic_hash_and_results`: "deterministic_signature
#   includes run_id... We verify determinism by comparing global_results").
# - `branch_contributions`/`branch_contributions_available` — K13/K14: pelny
#   rozplyw galeziowy jest INLINE tuz po biegu, a po przeczytaniu z magazynu
#   repozytorium moze go zastapic sama flaga dostepnosci (oszczednosc miejsca
#   dla duzych sieci) — rozdzial artefaktu, nie rozjazd fizyki.
_POLA_TOZSAMOSCI_BIEGU = frozenset(
    {
        "proof_ref",
        "proof_binding",
        "branch_contributions",
        "branch_contributions_available",
        "branch_flow_trace",
    }
)


def _fizyka(wiersz: dict[str, object]) -> dict[str, object]:
    """Podzbior wiersza wyniku bez pol tozsamosci biegu — do porownan
    determinizmu/roundtrip (patrz `_POLA_TOZSAMOSCI_BIEGU`)."""
    return {k: v for k, v in wiersz.items() if k not in _POLA_TOZSAMOSCI_BIEGU}


# ---------------------------------------------------------------------------
# Ksztalt kontraktu (byl `TestContractShape` w E3)
# ---------------------------------------------------------------------------


def test_wynik_ma_oczekiwane_pola_kontraktu() -> None:
    """ResultSet ma wszystkie pola wymagane kontraktem (FROZEN, dzielonym z
    dawnym `ExecutionEngineService` — obie sciezki oddaja `ShortCircuitResult.
    to_dict()`)."""
    run = _bieg("golden-shape", _build_golden_enm("Golden shape"))

    assert run.status == "FINISHED", run.error_message
    wiersz = _wiersz(run)
    expected_keys = {
        "fault_node_id",
        "short_circuit_type",
        "c_factor",
        "un_v",
        "zkk_ohm",
        "tk_s",
        "tb_s",
        "ikss_a",
        "ip_a",
        "ith_a",
        "ib_a",
        "sk_mva",
        "ik_thevenin_a",
        "ik_inverters_a",
        "ik_total_a",
        "kappa",
        "rx_ratio",
        "white_box_trace",
    }
    assert expected_keys.issubset(set(wiersz.keys()))
    assert run.raw_result["short_circuit_type"] == "3F"


def test_wyniki_bez_lokalizacji_sa_posortowane_deterministycznie() -> None:
    """Bez zawezenia lokalizacji `results` niesie KAZDY zgloszalny wezel, w
    kolejnosci posortowanej (determinizm raportu — byl
    `test_element_results_sorted_by_ref`)."""
    klucz = "golden-sorted"
    set_enm(klucz, _build_golden_enm("Golden sorted"))
    run = execute_run(
        create_run(case_id=klucz, klucz_twin=klucz, analysis_type="short_circuit_sn").id
    )
    assert run.status == "FINISHED", run.error_message
    ids = [w["fault_node_id"] for w in run.raw_result["results"]]
    assert ids == sorted(ids)
    assert len(ids) >= 4  # N0..N3 — kazdy wezel jest zgloszalny


def test_wezel_zwarcia_ma_dodatnie_wartosci_zwarciowe() -> None:
    """Wezel zwarcia niesie realne (dodatnie) prady zwarciowe — byl
    `test_fault_node_element_result_has_sc_values`."""
    run = _bieg("golden-values", _build_golden_enm("Golden values"))
    wiersz = _wiersz(run)
    assert wiersz["ikss_a"] > 0
    assert wiersz["ip_a"] > 0
    assert wiersz["ith_a"] > 0
    assert wiersz["sk_mva"] > 0


def test_bieg_persystuje_i_odczytuje_sie_bez_zmiany_wartosci() -> None:
    """Roundtrip persystencji: bieg odczytany z magazynu ma TE SAME wartosci co
    bieg tuz po wykonaniu (byl `test_resultset_to_dict_roundtrip`)."""
    from enm.canonical_analysis import get_run

    run = _bieg("golden-roundtrip", _build_golden_enm("Golden roundtrip"))
    odczytany = get_run(run.id)
    assert odczytany is not None
    assert _fizyka(_wiersz(odczytany)) == _fizyka(_wiersz(run))
    assert odczytany.status == run.status == "FINISHED"


def test_bieg_konczy_sie_stanem_finished() -> None:
    """Status koncowy biegu — byl `test_run_status_is_done_after_execute`."""
    klucz = "golden-status"
    set_enm(klucz, _build_golden_enm("Golden status"))
    run = create_run(
        case_id=klucz,
        klucz_twin=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": "3F", **_lokalizacja(N1)},
    )
    assert run.status == "CREATED"
    done = execute_run(run.id)
    assert done.status == "FINISHED"
    assert done.finished_at is not None


# ---------------------------------------------------------------------------
# Fikstura golden — fizyka (byl `TestGoldenFixtures`)
# ---------------------------------------------------------------------------


def test_golden_sc3f_zbiega_z_dodatnimi_pradami() -> None:
    """SC_3F na sieci golden -> FINISHED + dodatnie prady (byl
    `test_golden_sc_3f_produces_done_with_result`)."""
    run = _bieg("golden-3f", _build_golden_enm("Golden 3F"), fault_type="3F")
    wiersz = _wiersz(run)
    assert run.status == "FINISHED"
    assert wiersz["short_circuit_type"] == "3F"
    assert wiersz["ikss_a"] > 0
    assert wiersz["ip_a"] > 0
    assert wiersz["ith_a"] > 0
    assert wiersz["sk_mva"] > 0


def test_golden_rozne_wezly_daja_rozne_wyniki() -> None:
    """Dwa wezly o innym napieciu znamionowym daja rozny Un i rozny wynik
    (byl `test_golden_sc_3f_different_fault_nodes`)."""
    run_sn = _bieg("golden-diff-sn", _build_golden_enm("Golden diff SN"), fault_ref=N0)
    run_nn = _bieg("golden-diff-nn", _build_golden_enm("Golden diff nN"), fault_ref=N2)

    w_sn = _wiersz(run_sn)
    w_nn = _wiersz(run_nn)
    assert w_sn["un_v"] != w_nn["un_v"]
    assert w_sn["fault_node_id"] != w_nn["fault_node_id"]


def test_golden_sc2f_konczy_sie_finished() -> None:
    """SC_2F na sieci golden -> FINISHED (byl `test_golden_sc_2f_produces_done`)."""
    run = _bieg("golden-2f", _build_golden_enm("Golden 2F"), fault_type="2F")
    wiersz = _wiersz(run)
    assert run.status == "FINISHED"
    assert wiersz["short_circuit_type"] == "2F"
    assert wiersz["ikss_a"] > 0


def test_golden_sc1f_z_kompletna_skladowa_zerowa_konczy_sie_finished() -> None:
    """SC_1F na sieci golden (Z0 kompletne) -> FINISHED (byl
    `test_golden_sc_1f_produces_done_with_z0`)."""
    run = _bieg("golden-1f", _build_golden_enm("Golden 1F"), fault_type="1F")
    wiersz = _wiersz(run)
    assert run.status == "FINISHED"
    assert wiersz["short_circuit_type"] == "1F"
    assert wiersz["ikss_a"] > 0


def test_golden_sc1f_bez_skladowej_zerowej_jest_jawna_odmowa() -> None:
    """SC_1F bez Z0 -> jawny `ValueError` nazywajacy brak (byl
    `test_golden_sc_1f_without_z0_raises` / `test_sc_1f_failure_marks_run_failed`
    z dawnego E3 — tu ODMOWA JEST WCZESNIEJSZA: `create_run` odrzuca bieg
    PRZED wykonaniem, bo `ENMValidator` juz wie, ze zwarcie 1F wymaga Z0)."""
    klucz = "golden-1f-bez-z0"
    set_enm(klucz, _build_golden_enm_bez_z0("Golden 1F bez Z0"))
    with pytest.raises(ValueError, match="Z0|skladowej zerowej"):
        create_run(
            case_id=klucz,
            klucz_twin=klucz,
            analysis_type="short_circuit_sn",
            options={"fault_type": "1F", **_lokalizacja(N1)},
        )


def test_golden_3f_wieksze_niz_2f() -> None:
    """IEC 60909: I_3F > I_2F na tym samym wezle (byl
    `test_golden_3f_lt_2f_ordering`)."""
    run_3f = _bieg("golden-order-3f", _build_golden_enm("Golden order 3F"), fault_type="3F")
    run_2f = _bieg("golden-order-2f", _build_golden_enm("Golden order 2F"), fault_type="2F")

    assert _wiersz(run_3f)["ikss_a"] > _wiersz(run_2f)["ikss_a"]


def test_golden_wklad_sieci_nadrzednej_jest_dodatni() -> None:
    """Wklad sieci nadrzednej (THEVENIN_GRID) do zwarcia jest dodatni, a przy
    braku innych zrodel rownyz calkowitemu pradowi zwarciowemu — byl
    `test_source_contributions_all_positive` (E3). Wklad DODATKOWEGO zrodla
    (falownik DER) jest dodatni i podnosi prad calkowity ponad sam wklad sieci
    — dowiedzione niezaleznie w `tests/enm/test_enm_mapping.py::
    test_converter_contributes_to_short_circuit` (patrz naglowek modulu)."""
    run = _bieg("golden-contrib", _build_golden_enm("Golden contrib"), fault_ref=N2)
    wiersz = _wiersz(run)

    assert wiersz["ik_thevenin_a"] > 0, "wklad sieci nadrzednej musi byc dodatni"
    assert wiersz["ik_total_a"] == pytest.approx(
        wiersz["ik_thevenin_a"], rel=1e-9
    ), "bez dodatkowych zrodel prad calkowity = wklad samej sieci nadrzednej"


def test_golden_slad_white_box_jest_niepusty() -> None:
    """Slad WHITE BOX ma niezerowa liczbe krokow (audytowalnosc) — byl
    `test_white_box_trace_count_nonzero`."""
    run = _bieg("golden-trace", _build_golden_enm("Golden trace"))
    wiersz = _wiersz(run)
    assert len(wiersz["white_box_trace"]) > 0


# ---------------------------------------------------------------------------
# Determinizm (byly `test_sc3f_run_deterministic_hash_and_results`,
# `test_dual_sc3f_runs_produce_identical_results`,
# `test_dual_sc2f_runs_produce_identical_results`)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("fault_type", ["3F", "2F", "1F"])
def test_dwa_biegi_tej_samej_sieci_daja_identyczny_wynik(fault_type: str) -> None:
    """Dwa niezalezne biegi na TEJ SAMEJ tresci sieci daja bit w bit ten sam
    wynik — determinizm kanonu, niezalezny od tego, ile razy dyspozycja
    biegnie."""
    siec = _build_golden_enm(f"Golden det {fault_type}")
    run_a = _bieg(f"golden-det-a-{fault_type}", siec, fault_type=fault_type)
    run_b = _bieg(f"golden-det-b-{fault_type}", siec, fault_type=fault_type)

    assert run_a.status == run_b.status == "FINISHED"
    assert run_a.snapshot_hash == run_b.snapshot_hash
    assert _fizyka(_wiersz(run_a)) == _fizyka(_wiersz(run_b))
