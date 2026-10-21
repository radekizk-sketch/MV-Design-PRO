"""Karty WSPOLCZYNNIK-C-JEDEN-NOSNIK i TOLERANCJA-NN-WARTOSC-ROBOCZA — tolerancja sieci nN.

Tabela 1 IEC 60909-0 ma DWA wiersze nN: sieć o tolerancji +6 % (c_max 1,05; c_min 0,95)
i +10 % (c_max 1,10; c_min 0,90). Przed kartą produkt brał wiersz +6 % po cichu, więc dla
sieci +10 % zaniżał I″k,max (zdolność wyłączania) i zawyżał I_k,min pętli (samoczynne
wyłączenie) — obie pomyłki po stronie niebezpiecznej. Tolerancja jest daną SIECI nN
(wyspy galwanicznej szyn nN) i ma dwóch nośników: transformator zasilający
(``Transformer.lv_voltage_tolerance``) i źródło sieciowe wprost na szynie nN
(``Source.lv_voltage_tolerance``); jeden predykat: ``enm.tolerancja_nn``.

Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (zasada nr 4, V12K-351): brak deklaracji, deklaracje
sprzeczne i wyspa bez elementu zasilającego NIE blokują obliczeń — wyspa dostaje wartość
roboczą rejestru (klasa +10 %, c 1,10/0,90), podstawa c węzła mówi „wartość robocza", wiersz
wyniku niesie znacznik ``tolerancja_nn_robocza``, a bieg — założenie
``fault.c_tolerancja_nn_robocza`` z elementem i polem zmiany. Dawna odmowa
``fault.c_tolerancja_nn_brak`` skasowana bez warstwy zgodności.

Test jest ILOCZYNEM CECH (reguła KLASA, NIE INSTANCJA §2), przez realne ścieżki użytkownika
(bieg kanoniczny ``short_circuit_sn``, widoki pętli/SWZ z modelu, ``POST /api/fault-loop/
compute``, operacje domenowe, bramka gotowości):

    deklaracja {PLUS_6, PLUS_10, brak → robocza, sprzeczna → robocza, wyspa nN zasilana
                źródłem (z deklaracją i bez)}
      × wielkość {I″k szyny nN, I″k szyny SN tej samej sieci, I_k,min pętli/SWZ, K_T, K_G}
      × scenariusz {MAX, MIN}
      × tryb c {AUTO z tabeli, nadpisanie z uzasadnieniem}.

Wymiar „tryb c" dotyczy wyłącznie zwarć IEC 60909 (kanał ``nadpisanie_c`` scenariusza);
pętla zwarcia IEC 60364 i SWZ nie mają kanału nadpisania c (c_min/c_max wyłącznie z tabeli),
co przypina ``test_petla_nie_ma_kanalu_nadpisania_c``. Wyspa nN zasilana źródłem nie ma
transformatora, więc widoki pętli i SWZ (liczone od transformatora stacji) jej nie dotyczą —
pętla takiej sieci idzie ścieżką bez modelu (``/api/fault-loop/compute`` z tolerancją
w żądaniu), przypiętą w ``test_api_petli_*``.

Wartości c w tym pliku są wpisane RĘCZNIE (wyrocznia niezależna od ``voltage_factor.py``).
"""

from __future__ import annotations

import math
from typing import Any
from uuid import UUID

import pytest
from api.main import app
from application.analyses.fault_loop import service as serwis_petli
from application.analyses.fault_loop.service import (
    build_fault_loop_view_at_point,
    build_station_fault_loop_view,
)
from application.analyses.swz.service import build_swz_view
from application.eligibility_service import EligibilityService
from domain.fault_scenario import (
    FaultLocation,
    FaultType,
    ShortCircuitConfig,
    new_fault_scenario,
)
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.domain_operations import execute_domain_operation
from enm.hash import (
    compute_enm_hash,
    compute_input_hash,
    compute_semantic_hash,
    hash_migawki_enm,
)
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Source,
    Transformer,
)
from enm.scenariusze import OperatingScenario, RodzajScenariusza, opcje_biegu_ze_scenariusza
from enm.store import reset_enm_store, set_enm
from enm.tolerancja_nn import (
    KOD_TOLERANCJA_NN_ROBOCZA,
    tolerancje_wezlow_nn,
    wyspy_nn,
    wyspy_wezlow_nn,
)
from fastapi.testclient import TestClient
from network_model.core.branch import TransformerBranch
from network_model.solvers.fault_loop_iec60364 import (
    FaultLoopInput,
    LoopImpedanceComponent,
    compute_fault_loop,
)

from tests.application.analyses.fault_loop.test_etykiety_skladowych_petli import _enm as _enm_petli
from tests.catalog_test_helpers import gpz_source_record
from tests.enm.test_canonical_sc_c_per_pasmo import (
    _TR_PK_KW,
    _TR_SR_MVA,
    _TR_UK_PERCENT,
    N1,
    N2,
    N3,
    _build_mv_lv_enm,
)
from tests.test_eligibility_matrix import _validate_and_readiness

_CASE = UUID("00000000-0000-0000-0000-0000000070c0")
_UZASADNIENIE = "Uzgodnienie z OSD (pismo nr 12/2026): c·Un ≤ Um dla rozdzielnicy 17,5 kV"

#: Tabela 1 IEC 60909-0 wpisana RĘCZNIE: (pasmo, tolerancja, scenariusz) → c.
_C = {
    ("nN", "PLUS_6", "MAX"): 1.05,
    ("nN", "PLUS_6", "MIN"): 0.95,
    ("nN", "PLUS_10", "MAX"): 1.10,
    ("nN", "PLUS_10", "MIN"): 0.90,
    ("SN", None, "MAX"): 1.10,
    ("SN", None, "MIN"): 1.00,
}
_ETYKIETA = {"PLUS_6": "+6 %", "PLUS_10": "+10 %"}

#: Deklaracje: (klasa, z którą liczy bieg, czy jest wartością roboczą rejestru). Wartość
#: robocza wpisana RĘCZNIE (+10 %, karta TOLERANCJA-NN-WARTOSC-ROBOCZA) — wyrocznia niezależna
#: od ``wartosci_robocze.py``.
_DEKLARACJE: dict[str, tuple[str, bool]] = {
    "PLUS_6": ("PLUS_6", False),
    "PLUS_10": ("PLUS_10", False),
    "brak": ("PLUS_10", True),
    "sprzeczna": ("PLUS_10", True),
    "wyspa_zrodlo_nn": ("PLUS_10", False),
    "wyspa_zrodlo_nn_brak": ("PLUS_10", True),
}

#: Wyspa nN zasilana źródłem sieciowym wprost na szynie 0,4 kV (bez transformatora).
_NN_Q, _NN_K = "Q_NN", "K_NN"
_SK_NN_MVA = 10.0


@pytest.fixture(autouse=True)
def _stan() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _enm_wyspy_zrodla_nn(tolerancja: str | None) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Wyspa nN zasilana źródłem"),
        buses=[
            Bus(ref_id=_NN_Q, name="Szyna nN przyłącza", voltage_kv=0.4),
            Bus(ref_id=_NN_K, name="Koniec obwodu nN", voltage_kv=0.4),
        ],
        branches=[
            Cable(
                ref_id="C_NN",
                name="Kabel nN YAKY 4x120",
                from_bus_ref=_NN_Q,
                to_bus_ref=_NN_K,
                length_km=0.06,
                r_ohm_per_km=0.253,
                x_ohm_per_km=0.069,
                short_circuit_temperature_c=160.0,
                catalog_ref="cable-nn-yaky-4x120",
                catalog_namespace="KABEL_NN",
                parameter_source="CATALOG",
            )
        ],
        sources=[
            Source(
                **gpz_source_record(
                    ref_id="Q_SIEC_NN",
                    name="Sieć zasilająca nN",
                    bus_ref=_NN_Q,
                    voltage_kv=0.4,
                    sk3_mva=_SK_NN_MVA,
                    rx_ratio=0.1,
                    extra={"lv_voltage_tolerance": tolerancja},
                )
            )
        ],
    )


def _siec(deklaracja: str) -> EnergyNetworkModel:
    if deklaracja in ("PLUS_6", "PLUS_10"):
        return _build_mv_lv_enm("Sieć SN+nN", tolerancja=deklaracja)  # type: ignore[arg-type]
    if deklaracja == "brak":
        return _build_mv_lv_enm("Sieć SN+nN", tolerancja=None)
    if deklaracja == "sprzeczna":
        # Drugi transformator tej samej szyny nN deklaruje +10 %, pierwszy +6 %: jedna sieć nN
        # ma jedną tolerancję — sprzeczność daje wartość roboczą, nie wybór „pierwszej".
        enm = _build_mv_lv_enm("Sieć SN+nN", tolerancja="PLUS_6")
        drugi = enm.transformers[0].model_copy(
            update={"ref_id": "TR2", "name": "TR2", "lv_voltage_tolerance": "PLUS_10"}
        )
        return enm.model_copy(update={"transformers": [*enm.transformers, drugi]})
    if deklaracja == "wyspa_zrodlo_nn_brak":
        return _enm_wyspy_zrodla_nn(None)
    assert deklaracja == "wyspa_zrodlo_nn"
    return _enm_wyspy_zrodla_nn("PLUS_10")


def _wezly(deklaracja: str) -> dict[str, str]:
    """Węzły biegu: pasmo → ref szyny."""
    if deklaracja.startswith("wyspa_zrodlo_nn"):
        return {"nN": _NN_K}
    return {"nN": N3, "SN": N1}


def _opcje(scenariusz: str, lokalizacja: str, nadpisanie: dict | None) -> dict:
    config = ShortCircuitConfig.from_dict(
        {"scenariusz": scenariusz, "nadpisanie_c": nadpisanie, "thermal_time_seconds": 0.5}
    )
    spec = new_fault_scenario(
        study_case_id=_CASE,
        name="Zwarcie testowe",
        fault_type=FaultType.SC_3F,
        location=FaultLocation(element_ref=lokalizacja, location_type="BUS"),
        config=config,
    )
    return opcje_biegu_ze_scenariusza(
        OperatingScenario(
            scenario_id="scn-tol", name="t", kind=RodzajScenariusza.FAULT_STUDY, fault_spec=spec
        )
    )


def _bieg(enm: EnergyNetworkModel, opcje: dict, *, typ: str = "short_circuit_sn"):
    set_enm("tolerancja-nn", enm)
    run = create_run(
        case_id="tolerancja-nn", klucz_twin="tolerancja-nn", analysis_type=typ, options=opcje
    )
    return execute_run(run.id)


def _wiersz(enm: EnergyNetworkModel, scenariusz: str, ref: str, nadpisanie: dict | None):
    wynik = _bieg(enm, _opcje(scenariusz, ref, nadpisanie))
    reset_canonical_runs()
    return wynik


# ---------------------------------------------------------------------------
# I″k szyny nN i szyny SN × deklaracja × scenariusz × tryb c
# ---------------------------------------------------------------------------


#: Iloczyn {deklaracja} × {pasmo szyny zwarcia} — komórki istniejące w sieci (wyspa nN
#: zasilana źródłem wprost nie ma szyny SN, więc tej komórki nie ma w iloczynie, a nie jest
#: pomijana w biegu).
_DEKLARACJA_X_PASMO = [(d, p) for d in sorted(_DEKLARACJE) for p in sorted(_wezly(d))]


@pytest.mark.parametrize("tryb", ["auto", "nadpisanie"])
@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
@pytest.mark.parametrize(("deklaracja", "pasmo"), _DEKLARACJA_X_PASMO)
def test_zwarcie_szyny_c_i_podstawa(deklaracja: str, pasmo: str, scenariusz: str, tryb: str):
    wezly = _wezly(deklaracja)
    tolerancja, robocza = _DEKLARACJE[deklaracja]
    nadpisanie = {"wartosc": 1.08, "uzasadnienie": _UZASADNIENIE} if tryb == "nadpisanie" else None
    wynik = _wiersz(_siec(deklaracja), scenariusz, wezly[pasmo], nadpisanie)

    # Zasada nr 4: brak/sprzeczność deklaracji NIE blokuje zwarcia (dawniej odmowa całej sieci,
    # bo K_T każdego transformatora wchodzi do macierzy Z-bus) — bieg liczy na wartości roboczej.
    assert wynik.status == "FINISHED", wynik.error_message
    (wiersz,) = wynik.raw_result["results"]
    assert wiersz["fault_node_id"] == ref_to_graph_id(wezly[pasmo])
    # Założenie biegu: jedno na wyspę z wartością roboczą, niezależnie od pasma punktu i trybu c
    # (K_T/K_G tej wyspy wchodzą do każdego zwarcia w sieci); wyspa z deklaracją — żadnego.
    zalozenia = [
        z for z in wynik.raw_result.get("zalozenia", []) if z["code"] == KOD_TOLERANCJA_NN_ROBOCZA
    ]
    assert len(zalozenia) == (1 if robocza else 0), zalozenia
    # Znacznik wiersza: wyłącznie węzeł nN wyspy z wartością roboczą (klucz addytywny — wiersz
    # sieci zadeklarowanej i wiersz SN bez klucza, bajt w bajt jak przed kartą).
    assert ("tolerancja_nn_robocza" in wiersz) is (robocza and pasmo == "nN")
    if tryb == "nadpisanie":
        assert wiersz["c_factor"] == pytest.approx(1.08)
        assert wiersz["c_zrodlo"] == f"nadpisanie ręczne: {_UZASADNIENIE}"
        return
    if pasmo == "nN":
        dopisek = " (wartość robocza)" if robocza else ""
        assert wiersz["c_factor"] == pytest.approx(_C[("nN", tolerancja, scenariusz)])
        assert wiersz["c_zrodlo"] == (
            f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {_ETYKIETA[tolerancja]}{dopisek}, "
            f"{scenariusz}"
        )
    else:
        assert wiersz["c_factor"] == pytest.approx(_C[("SN", None, scenariusz)])
        assert wiersz["c_zrodlo"] == f"IEC 60909-0 tab. 1, pasmo SN, {scenariusz}"


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
@pytest.mark.parametrize("deklaracja", sorted(_DEKLARACJE))
def test_iloraz_ikss_nn_auto_do_nadpisania_rowny_ilorazowi_c(deklaracja: str, scenariusz: str):
    """Ta sama sieć (ten sam K_T, ten sam Z_Q): I″k(tabela) / I″k(c = 1,08) = c_tab / 1,08."""
    tolerancja, _ = _DEKLARACJE[deklaracja]
    ref = _wezly(deklaracja)["nN"]
    auto = _wiersz(_siec(deklaracja), scenariusz, ref, None).raw_result["results"][0]
    reczne = _wiersz(
        _siec(deklaracja), scenariusz, ref, {"wartosc": 1.08, "uzasadnienie": "porównanie"}
    ).raw_result["results"][0]
    assert auto["ikss_a"] / reczne["ikss_a"] == pytest.approx(
        _C[("nN", tolerancja, scenariusz)] / 1.08, rel=1e-9
    )


@pytest.mark.parametrize("tryb", ["auto", "nadpisanie"])
@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_szyna_sn_nie_zalezy_od_tolerancji_sieci_nn(scenariusz: str, tryb: str) -> None:
    """Szyna SN tej samej sieci: c z wiersza SN i ten sam I″k dla sieci nN +6 % i +10 %
    (transformator SN/nN bez źródła po stronie nN nie zasila zwarcia po stronie SN)."""
    nadpisanie = {"wartosc": 1.08, "uzasadnienie": _UZASADNIENIE} if tryb == "nadpisanie" else None
    w6 = _wiersz(_siec("PLUS_6"), scenariusz, N1, nadpisanie).raw_result["results"][0]
    w10 = _wiersz(_siec("PLUS_10"), scenariusz, N1, nadpisanie).raw_result["results"][0]
    assert w6["c_factor"] == w10["c_factor"]
    assert w6["c_zrodlo"] == w10["c_zrodlo"]
    assert w6["ikss_a"] == pytest.approx(w10["ikss_a"], rel=1e-12)


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_wyspa_zrodla_nn_odtwarza_moc_zwarciowa_przylacza(scenariusz: str) -> None:
    """Z_Q = c_max·U_n²/S″k (IEC 60909-0 eq. 6; źródło deklaruje tylko dane MAX, więc Z_Q
    w obu scenariuszach z S″k i c_max) z c tej samej wyspy nN: na szynie przyłącza
    I″k = c·U_n/(√3·Z_Q) = (c/c_max)·S″k/(√3·U_n). W MAX c się skraca (I″k = S″k/(√3·U_n)
    niezależnie od wiersza), w MIN iloraz c_min/c_max jest ilorazem JEDNEGO wiersza
    (+6 %: 0,95/1,05; +10 %: 0,90/1,10) — dowód, że Z_Q i c węzła czytają jedną deklarację."""
    s_przez_u_a = _SK_NN_MVA / (math.sqrt(3.0) * 0.4) * 1000.0
    # Deklaracja None = wartość robocza +10 % (wpisana ręcznie): Z_Q i c węzła czytają ją
    # z TEJ SAMEJ wyspy — iloraz jednego wiersza także na wartości roboczej.
    for deklaracja, tolerancja in (("PLUS_6", "PLUS_6"), ("PLUS_10", "PLUS_10"), (None, "PLUS_10")):
        wynik = _wiersz(_enm_wyspy_zrodla_nn(deklaracja), scenariusz, _NN_Q, None)
        assert wynik.status == "FINISHED", wynik.error_message
        wiersz = wynik.raw_result["results"][0]
        assert ("tolerancja_nn_robocza" in wiersz) is (deklaracja is None)
        c = _C[("nN", tolerancja, scenariusz)]
        assert wiersz["c_factor"] == pytest.approx(c)
        oczekiwany_a = c / _C[("nN", tolerancja, "MAX")] * s_przez_u_a
        assert wiersz["ikss_a"] == pytest.approx(oczekiwany_a, rel=1e-6)


def test_wyspa_zrodla_nn_bez_deklaracji_liczy_z_zalozeniem_na_zrodle() -> None:
    """Wyspa zasilana źródłem bez deklaracji: bieg liczy, założenie wskazuje źródło (tam
    projektant zmienia wartość) i pole ``lv_voltage_tolerance``, zdanie nazywa źródło i szyny
    z modelu — nigdy identyfikatorem."""
    wynik = _wiersz(_enm_wyspy_zrodla_nn(None), "MAX", _NN_K, None)
    assert wynik.status == "FINISHED", wynik.error_message
    (zalozenie,) = (
        z for z in wynik.raw_result["zalozenia"] if z["code"] == KOD_TOLERANCJA_NN_ROBOCZA
    )
    assert zalozenie["element_ref"] == "Q_SIEC_NN"
    assert zalozenie["element_type"] == "Source"
    assert zalozenie["parametr"] == "lv_voltage_tolerance"
    assert zalozenie["scenariusz"] == "MAX"
    tresc = zalozenie["message_pl"]
    for fragment in ("Sieć zasilająca nN", "Szyna nN przyłącza", "Koniec obwodu nN", "+10 %"):
        assert fragment in tresc, tresc
    for identyfikator in ("Q_SIEC_NN", _NN_Q, _NN_K):
        assert identyfikator not in tresc, tresc


# ---------------------------------------------------------------------------
# K_T (IEC 60909-0 eq. 12a) i K_G (eq. 18)
# ---------------------------------------------------------------------------


def _x_t() -> float:
    u_r = _TR_PK_KW / (_TR_SR_MVA * 1000.0)
    return math.sqrt((_TR_UK_PERCENT / 100.0) ** 2 - u_r**2)


def _galezie_transformatorow(enm: EnergyNetworkModel) -> list[TransformerBranch]:
    graf = map_enm_to_network_graph(enm)
    return sorted(
        (g for g in graf.branches.values() if isinstance(g, TransformerBranch)),
        key=lambda g: g.id,
    )


@pytest.mark.parametrize("deklaracja", ["PLUS_6", "PLUS_10", "brak", "sprzeczna"])
def test_k_t_czyta_c_max_tolerancji_strony_dolnej(deklaracja: str) -> None:
    """K_T (eq. 12a) czyta c_max klasy WYSPY strony dolnej — także wartości roboczej (brak i
    sprzeczność: +10 %, c_max 1,10 dla OBU transformatorów sieci sprzecznej, nigdy deklaracja
    „pierwszego")."""
    galezie = _galezie_transformatorow(_siec(deklaracja))
    tolerancja, _robocza = _DEKLARACJE[deklaracja]
    assert galezie
    for galaz in galezie:
        oczekiwane = 0.95 * _C[("nN", tolerancja, "MAX")] / (1.0 + 0.6 * _x_t())
        assert galaz.get_kt_correction_factor() == pytest.approx(oczekiwane, rel=1e-9)


def _enm_z_agregatem(tolerancja: str | None, szyna: str) -> EnergyNetworkModel:
    enm = _build_mv_lv_enm("Sieć z agregatem", tolerancja=tolerancja)  # type: ignore[arg-type]
    napiecie = 0.4 if szyna == N3 else 15.0
    agregat = Generator(
        ref_id="GEN",
        name="Agregat",
        bus_ref=szyna,
        p_mw=0.2,
        gen_type="synchronous",
        materialized_params={"un_kv": napiecie, "sn_mva": 0.25, "cos_phi": 0.8},
    )
    return enm.model_copy(update={"generators": [agregat]})


@pytest.mark.parametrize("tolerancja", ["PLUS_6", "PLUS_10", None])
@pytest.mark.parametrize("szyna", [N3, N1])
def test_k_g_czyta_c_max_sieci_maszyny(tolerancja: str | None, szyna: str) -> None:
    graf = map_enm_to_network_graph(_enm_z_agregatem(tolerancja, szyna))
    (maszyna,) = graf.get_synchronous_machine_sources()
    sin_phi = math.sqrt(1.0 - maszyna.cos_phi_r**2)
    if szyna == N1:
        # Maszyna na szynie SN: wiersz SN, tolerancja sieci nN nie ma wpływu.
        c_max, podstawa = 1.10, "IEC 60909-0 tab. 1, pasmo SN, MAX"
    elif tolerancja is None:
        # Wartość robocza wyspy (+10 %, wpisana ręcznie) — nazwana w podstawie K_G.
        c_max = _C[("nN", "PLUS_10", "MAX")]
        podstawa = "IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 % (wartość robocza), MAX"
    else:
        c_max = _C[("nN", tolerancja, "MAX")]
        podstawa = f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {_ETYKIETA[tolerancja]}, MAX"
    assert maszyna.c_max == pytest.approx(c_max)
    assert maszyna.c_max_zrodlo == podstawa
    assert maszyna.k_g == pytest.approx(c_max / (1.0 + maszyna.xd_subtransient_pu * sin_phi))
    assert maszyna.white_box()["c_max_zrodlo"] == podstawa


# ---------------------------------------------------------------------------
# Brak deklaracji nie blokuje: ani mapowania, ani gotowości, ani biegu
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deklaracja", ["brak", "sprzeczna", "wyspa_zrodlo_nn_brak", "PLUS_6", "PLUS_10"]
)
def test_gotowosc_nie_ma_blokera_tolerancji(deklaracja: str) -> None:
    """Dawny bloker gotowości ``ELIG_SC_NN_VOLTAGE_TOLERANCE_MISSING`` skasowany: macierz
    dopuszczalności analiz nie zna żadnego kodu tolerancji nN, a powód wartości roboczej
    stoi w wyspie (jedno źródło dla założenia biegu)."""
    enm = _siec(deklaracja)
    macierz = EligibilityService().compute_matrix(
        enm=enm, readiness=_validate_and_readiness(enm), case_id="tol"
    )
    kody = {b.code for wynik in macierz.matrix for b in (*wynik.blockers, *wynik.warnings)}
    assert not {k for k in kody if "TOLERANCE" in k or "tolerancja" in k}, kody
    _tolerancja, robocza = _DEKLARACJE[deklaracja]
    powody = [w.powod for w in wyspy_nn(enm)]
    if not robocza:
        assert powody == [None]
    elif deklaracja == "sprzeczna":
        assert powody == ["DEKLARACJE_SPRZECZNE"]
    else:
        assert powody == ["BRAK_DEKLARACJI"]


@pytest.mark.parametrize("deklaracja", sorted(_DEKLARACJE))
def test_tolerancje_wezlow_jeden_predykat(deklaracja: str) -> None:
    tolerancja, robocza = _DEKLARACJE[deklaracja]
    mapa = tolerancje_wezlow_nn(_siec(deklaracja))
    oczekiwane_wezly = {_NN_Q, _NN_K} if deklaracja.startswith("wyspa_zrodlo_nn") else {N2, N3}
    assert set(mapa) == oczekiwane_wezly  # szyny SN nie występują
    assert set(mapa.values()) == {tolerancja}
    graf = map_enm_to_network_graph(_siec(deklaracja))
    for ref in oczekiwane_wezly:
        assert graf.nodes[ref_to_graph_id(ref)].tolerancja_nn == tolerancja
        # Klasa i jej pochodzenie z JEDNEJ wyspy (predykaty parami).
        assert graf.nodes[ref_to_graph_id(ref)].tolerancja_nn_robocza is robocza


# ---------------------------------------------------------------------------
# Pętla zwarcia IEC 60364 i SWZ — I_k,min = c_min·U_0/|Z_s|
# ---------------------------------------------------------------------------


def _enm_petli_z(deklaracja: str) -> EnergyNetworkModel:
    enm = _enm_petli("TR-7 Kowalskiego", 15.0, 0.4)
    trafo = enm.transformers[0]
    if deklaracja in ("PLUS_6", "PLUS_10"):
        return enm.model_copy(
            update={"transformers": [trafo.model_copy(update={"lv_voltage_tolerance": deklaracja})]}
        )
    if deklaracja == "brak":
        return enm.model_copy(
            update={"transformers": [trafo.model_copy(update={"lv_voltage_tolerance": None})]}
        )
    assert deklaracja == "sprzeczna"
    # Źródło sieciowe na szynie odpływu tej samej sieci nN deklaruje inną tolerancję.
    zrodlo_nn = Source(
        ref_id="src_nn",
        name="Zasilanie rezerwowe nN",
        bus_ref="b2",
        model="thevenin",
        r_ohm=0.01,
        x_ohm=0.02,
        lv_voltage_tolerance="PLUS_10",
    )
    return enm.model_copy(
        update={
            "transformers": [trafo.model_copy(update={"lv_voltage_tolerance": "PLUS_6"})],
            "sources": [*enm.sources, zrodlo_nn],
        }
    )


_WIDOKI_PETLI = {
    "petla_u_zrodla": lambda enm: build_station_fault_loop_view(enm, "stn"),
    "petla_w_punkcie": lambda enm: build_fault_loop_view_at_point(enm, "stn", "b1"),
    "swz": lambda enm: build_swz_view(enm, "stn", "b1", "ap1"),
}


@pytest.mark.parametrize("widok", sorted(_WIDOKI_PETLI))
@pytest.mark.parametrize("deklaracja", ["PLUS_6", "PLUS_10", "brak", "sprzeczna"])
def test_petla_i_swz_c_z_tolerancji_sieci_nn(
    monkeypatch: pytest.MonkeyPatch, deklaracja: str, widok: str
) -> None:
    wejscia: list[FaultLoopInput] = []
    wyniki: list[Any] = []
    oryginal = serwis_petli.compute_fault_loop

    def _szpieg(dane: FaultLoopInput) -> Any:
        wejscia.append(dane)
        wynik = oryginal(dane)
        wyniki.append(wynik)
        return wynik

    monkeypatch.setattr(serwis_petli, "compute_fault_loop", _szpieg)
    tolerancja, robocza = _DEKLARACJE[deklaracja]
    widok_wynik = _WIDOKI_PETLI[widok](_enm_petli_z(deklaracja))
    # Zasada nr 4: brak/sprzeczność deklaracji NIE odmawia pętli ani SWZ — wartość robocza.
    assert "kod_odmowy" not in widok_wynik or widok_wynik["kod_odmowy"] is None, widok_wynik
    assert wejscia, widok_wynik
    dopisek = " (wartość robocza)" if robocza else ""
    for dane, wynik in zip(wejscia, wyniki, strict=True):
        assert dane.tolerancja_nn == tolerancja
        assert dane.tolerancja_nn_robocza is robocza
        assert wynik.c_min == pytest.approx(_C[("nN", tolerancja, "MIN")])
        assert wynik.c_max == pytest.approx(_C[("nN", tolerancja, "MAX")])
        assert wynik.c_zrodlo_min == (
            f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {_ETYKIETA[tolerancja]}{dopisek}, MIN"
        )
        z_s = abs(wynik.z_loop_ohm)
        assert wynik.ik_min_a == pytest.approx(wynik.c_min * dane.u_nom_v / z_s, rel=1e-12)
        assert wynik.ik_max_a == pytest.approx(wynik.c_max * dane.u_nom_v / z_s, rel=1e-12)


@pytest.mark.parametrize("widok", sorted(_WIDOKI_PETLI))
def test_petla_sieci_plus_10_ma_ik_min_mniejszy_o_iloraz_c_min(
    monkeypatch: pytest.MonkeyPatch, widok: str
) -> None:
    """Ta sama pętla, ta sama |Z_s|: I_k,min(+10 %) / I_k,min(+6 %) = 0,90 / 0,95."""
    wyniki: dict[str, list[Any]] = {"PLUS_6": [], "PLUS_10": []}
    oryginal = serwis_petli.compute_fault_loop
    for tolerancja, lista in wyniki.items():

        def _szpieg(dane: FaultLoopInput, lista: list[Any] = lista) -> Any:
            wynik = oryginal(dane)
            lista.append(wynik)
            return wynik

        monkeypatch.setattr(serwis_petli, "compute_fault_loop", _szpieg)
        _WIDOKI_PETLI[widok](_enm_petli_z(tolerancja))
    for w6, w10 in zip(wyniki["PLUS_6"], wyniki["PLUS_10"], strict=True):
        assert w10.z_loop_ohm == w6.z_loop_ohm
        assert w10.ik_min_a / w6.ik_min_a == pytest.approx(0.90 / 0.95, rel=1e-12)
        assert w10.ik_max_a / w6.ik_max_a == pytest.approx(1.10 / 1.05, rel=1e-12)


def _wejscie_reczne(tolerancja: str | None) -> FaultLoopInput:
    """U_0 = 230 V, |Z_s| = 0,35 Ω (0,21 Ω + 0,14 Ω, czysto rezystancyjnie)."""
    return FaultLoopInput(
        fault_node_id="nn",
        u_nom_v=230.0,
        phase_conductor=LoopImpedanceComponent(label="L", r_ohm=0.21, x_ohm=0.0),
        return_conductor=LoopImpedanceComponent(label="PE", r_ohm=0.14, x_ohm=0.0),
        transformer_impedance=LoopImpedanceComponent(label="TR", r_ohm=0.0, x_ohm=0.0),
        tolerancja_nn=tolerancja,  # type: ignore[arg-type]
    )


#: Liczby ręczne karty: I_k,min = c_min·230/0,35; I_k,max = c_max·230/0,35 [A].
_RECZNE = {
    "PLUS_6": (624.285714, 690.0),
    "PLUS_10": (591.428571, 722.857143),
}


@pytest.mark.parametrize("tolerancja", sorted(_RECZNE))
def test_petla_liczby_reczne(tolerancja: str) -> None:
    wynik = compute_fault_loop(_wejscie_reczne(tolerancja))
    ik_min, ik_max = _RECZNE[tolerancja]
    assert wynik.ik_min_a == pytest.approx(ik_min, abs=1e-6)
    assert wynik.ik_max_a == pytest.approx(ik_max, abs=1e-6)


def test_petla_bez_rozstrzygnietej_tolerancji_to_blad_programu() -> None:
    """Solver pętli nie wybiera klasy (rozstrzyga wołający) — brak klasy = błąd programu."""
    with pytest.raises(ValueError):
        compute_fault_loop(_wejscie_reczne(None))


def test_petla_nie_ma_kanalu_nadpisania_c() -> None:
    """Pętla IEC 60364 bierze c wyłącznie z tabeli — wejście nie ma pola nadpisania c."""
    pola = set(FaultLoopInput.__dataclass_fields__)
    assert not {p for p in pola if "nadpis" in p or p in {"c_min", "c_max", "c_factor"}}


def _zadanie_api(tolerancja: str | None) -> dict[str, Any]:
    zadanie: dict[str, Any] = {
        "fault_node_id": "nn",
        "u_nom_v": 230.0,
        "phase_conductor": {"label": "L", "r_ohm": 0.21, "x_ohm": 0.0},
        "return_conductor": {"label": "PE", "r_ohm": 0.14, "x_ohm": 0.0},
        "transformer_impedance": {"label": "TR", "r_ohm": 0.0, "x_ohm": 0.0},
    }
    if tolerancja is not None:
        zadanie["lv_voltage_tolerance"] = tolerancja
    return zadanie


@pytest.mark.parametrize("tolerancja", sorted(_RECZNE))
def test_api_petli_liczy_z_tolerancja_z_zadania(tolerancja: str) -> None:
    odpowiedz = TestClient(app).post("/api/fault-loop/compute", json=_zadanie_api(tolerancja))
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    ik_min, ik_max = _RECZNE[tolerancja]
    assert dane["ik_min_a"] == pytest.approx(ik_min, abs=1e-6)
    assert dane["ik_max_a"] == pytest.approx(ik_max, abs=1e-6)
    assert dane["c_min"] == pytest.approx(_C[("nN", tolerancja, "MIN")])
    assert dane["c_max"] == pytest.approx(_C[("nN", tolerancja, "MAX")])
    etykieta = _ETYKIETA[tolerancja]
    assert dane["c_zrodlo_min"] == f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {etykieta}, MIN"
    assert dane["c_zrodlo_max"] == f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {etykieta}, MAX"
    assert dane["tolerancja_nn"]["pochodzenie"] == "DEKLARACJA"
    assert dane["tolerancja_nn"]["wartosc_robocza"] is False


def test_api_petli_bez_tolerancji_liczy_na_wartosci_roboczej() -> None:
    """Żądanie bez tolerancji: ta sama reguła pierwszeństwa co bieg — wartość robocza +10 %
    (liczby ręczne +10 %), nazwana w podstawie c i w znaczniku odpowiedzi."""
    odpowiedz = TestClient(app).post("/api/fault-loop/compute", json=_zadanie_api(None))
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    ik_min, ik_max = _RECZNE["PLUS_10"]
    assert dane["ik_min_a"] == pytest.approx(ik_min, abs=1e-6)
    assert dane["ik_max_a"] == pytest.approx(ik_max, abs=1e-6)
    assert dane["tolerancja_nn"]["wartosc"] == "PLUS_10"
    assert dane["tolerancja_nn"]["pochodzenie"] == "PROPOZYCJA"
    assert dane["tolerancja_nn"]["wartosc_robocza"] is True
    assert dane["c_zrodlo_min"] == (
        "IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 % (wartość robocza), MIN"
    )


def test_api_petli_z_niepoprawna_tolerancja_odmawia() -> None:
    odpowiedz = TestClient(app).post("/api/fault-loop/compute", json=_zadanie_api("PLUS_8"))
    assert odpowiedz.status_code == 422


# ---------------------------------------------------------------------------
# Kanał zapisu: operacje domenowe
# ---------------------------------------------------------------------------


def _migawka(enm: EnergyNetworkModel) -> dict[str, Any]:
    return enm.model_dump(mode="json")


@pytest.mark.parametrize("wartosc", ["PLUS_6", "PLUS_10", None])
@pytest.mark.parametrize("element", ["transformer", "source_nn"])
def test_zapis_tolerancji_przez_update_element_parameters(element: str, wartosc: str | None):
    if element == "transformer":
        enm, ref, kolekcja = _build_mv_lv_enm("Z", tolerancja="PLUS_6"), "TR1", "transformers"
    else:
        enm, ref, kolekcja = _enm_wyspy_zrodla_nn("PLUS_6"), "Q_SIEC_NN", "sources"
    wynik = execute_domain_operation(
        _migawka(enm),
        "update_element_parameters",
        {"element_ref": ref, "parameters": {"lv_voltage_tolerance": wartosc}},
    )
    assert wynik.get("error_code") is None, wynik
    (zapisany,) = (e for e in wynik["snapshot"][kolekcja] if e["ref_id"] == ref)
    assert zapisany["lv_voltage_tolerance"] == wartosc


@pytest.mark.parametrize(
    ("element", "wartosc"),
    [
        ("transformer", "PLUS_8"),
        ("source_nn", "PLUS_8"),
        ("source_sn", "PLUS_6"),  # źródło na szynie SN nie zasila sieci nN
    ],
)
def test_zapis_tolerancji_niepoprawnej_odmawia_bez_skutku(element: str, wartosc: str) -> None:
    if element == "transformer":
        enm, ref, kod = _build_mv_lv_enm("Z"), "TR1", "transformer.invalid_lv_voltage_tolerance"
    elif element == "source_nn":
        enm, ref, kod = _enm_wyspy_zrodla_nn("PLUS_6"), "Q_SIEC_NN", "source"
    else:
        enm, ref, kod = _build_mv_lv_enm("Z"), "GRID_Q", "source"
    if kod == "source":
        kod = "source.invalid_lv_voltage_tolerance"
    przed = compute_enm_hash(enm)
    wynik = execute_domain_operation(
        _migawka(enm),
        "update_element_parameters",
        {"element_ref": ref, "parameters": {"lv_voltage_tolerance": wartosc}},
    )
    assert wynik.get("error_code") == kod, wynik
    assert wynik.get("snapshot") is None
    assert compute_enm_hash(enm) == przed


def _dodaj_transformator(**pola: Any) -> dict[str, Any]:
    """Kreator stacji: nowy transformator SN/nN z katalogu na szynie SN stacji ``N1``, nowa
    szyna nN — operacja ``add_transformer_sn_nn`` (zgłoszenie z frontu: kreator wysyła
    ``lv_voltage_tolerance`` w tej operacji)."""
    return execute_domain_operation(
        _migawka(_build_mv_lv_enm("Z", tolerancja="PLUS_6")),
        "add_transformer_sn_nn",
        {"transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11", **pola},
    )


@pytest.mark.parametrize("wartosc", ["PLUS_6", "PLUS_10", None])
def test_zapis_tolerancji_przy_tworzeniu_transformatora_trafia_do_enm(wartosc: str | None):
    pola: dict[str, Any] = {"hv_bus_ref": N1, "lv_voltage_kv": 0.4}
    if wartosc is not None:
        pola["lv_voltage_tolerance"] = wartosc
    wynik = _dodaj_transformator(**pola)
    assert wynik.get("error_code") is None, wynik
    nowy_ref = wynik["selection_hint"]["element_id"]
    (nowy,) = (t for t in wynik["snapshot"]["transformers"] if t["ref_id"] == nowy_ref)
    assert nowy.get("lv_voltage_tolerance") == wartosc
    # Deklaracja jest tolerancją wyspy nN nowej szyny — ten sam predykat co c węzła i K_T;
    # bez deklaracji wyspa dostaje wartość roboczą +10 % (oznaczoną, nie zapisaną w modelu).
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    wyspa = wyspy_wezlow_nn(model)[nowy["lv_bus_ref"]]
    assert wyspa.tolerancja == (wartosc or "PLUS_10")
    assert wyspa.robocza is (wartosc is None)


@pytest.mark.parametrize(
    ("pola", "kod"),
    [
        ({"hv_bus_ref": N1, "lv_voltage_kv": 0.4, "lv_voltage_tolerance": "PLUS_8"}, "slownik"),
        ({"hv_bus_ref": N1, "lv_voltage_kv": 0.4, "lv_voltage_tolerance": "+6 %"}, "slownik"),
        # Transformator WN/SN pod szyną SN stacji: strona dolna 15 kV nie zasila sieci nN.
        (
            {
                "hv_voltage_kv": 110.0,
                "lv_bus_ref": N1,
                "transformer_catalog_ref": "tr-wn-sn-110-15-10mva-yd11",
                "lv_voltage_tolerance": "PLUS_6",
            },
            "pasmo",
        ),
    ],
)
def test_zapis_tolerancji_niepoprawnej_przy_tworzeniu_transformatora_odmawia(
    pola: dict[str, Any], kod: str
) -> None:
    wynik = _dodaj_transformator(**pola)
    assert wynik.get("error_code") == "transformer.invalid_lv_voltage_tolerance", wynik
    assert wynik.get("snapshot") is None
    if kod == "pasmo":
        assert "paśmie nN" in wynik["error"]


def _dodaj_zrodlo(napiecie_kv: float, **pola: Any) -> dict[str, Any]:
    """Nowe źródło sieciowe operacją ``add_grid_source_sn`` (ręczny ekwiwalent wprost na
    własnym napięciu, ``skip_hv_transformer``) — drugi nośnik tolerancji sieci nN, gdy szyna
    źródła leży w paśmie nN."""
    return execute_domain_operation(
        _migawka(EnergyNetworkModel(header=ENMHeader(name="Źródło"))),
        "add_grid_source_sn",
        {
            "voltage_kv": napiecie_kv,
            "manual_equivalent": {
                "sn_voltage_kv": napiecie_kv,
                "sk3_mva": _SK_NN_MVA,
                "rx_ratio": 0.1,
                "skip_hv_transformer": True,
            },
            "line_fields_count": 1,
            "source_name": "Sieć zasilająca",
            **pola,
        },
    )


@pytest.mark.parametrize("wartosc", ["PLUS_6", "PLUS_10", None])
def test_zapis_tolerancji_przy_tworzeniu_zrodla_nn_trafia_do_enm(wartosc: str | None) -> None:
    pola = {} if wartosc is None else {"lv_voltage_tolerance": wartosc}
    wynik = _dodaj_zrodlo(0.4, **pola)
    assert wynik.get("error_code") is None, wynik
    (zrodlo,) = wynik["snapshot"]["sources"]
    assert zrodlo.get("lv_voltage_tolerance") == wartosc
    model = EnergyNetworkModel.model_validate(wynik["snapshot"])
    wyspa = wyspy_wezlow_nn(model)[zrodlo["bus_ref"]]
    assert wyspa.tolerancja == (wartosc or "PLUS_10")
    assert wyspa.robocza is (wartosc is None)


@pytest.mark.parametrize(
    ("napiecie_kv", "wartosc", "przyczyna"),
    [
        (0.4, "PLUS_8", "spoza słownika"),
        (0.4, "plus_6", "spoza słownika"),
        # Źródło na szynie SN nie zasila sieci nN — deklaracja nie wybierałaby wiersza tabeli.
        (15.0, "PLUS_6", "paśmie nN"),
    ],
)
def test_zapis_tolerancji_niepoprawnej_przy_tworzeniu_zrodla_odmawia(
    napiecie_kv: float, wartosc: str, przyczyna: str
) -> None:
    wynik = _dodaj_zrodlo(napiecie_kv, lv_voltage_tolerance=wartosc)
    assert wynik.get("error_code") == "source.invalid_lv_voltage_tolerance", wynik
    assert wynik.get("snapshot") is None
    assert przyczyna in wynik["error"]


def test_transformator_na_stronie_dolnej_sn_odmawia_tolerancji_nn() -> None:
    enm = _build_mv_lv_enm("Z")
    wynik = execute_domain_operation(
        _migawka(enm),
        "update_element_parameters",
        {"element_ref": "TR1", "parameters": {"ulv_kv": 6.0, "lv_voltage_tolerance": "PLUS_6"}},
    )
    assert wynik.get("error_code") == "transformer.invalid_lv_voltage_tolerance", wynik


# ---------------------------------------------------------------------------
# Odcisk modelu bez deklaracji — bajt w bajt jak przed kartą
# ---------------------------------------------------------------------------

#: Odciski zmierzone na stanie sprzed karty (``bd3a87f4``, kod ``enm/hash.py`` i
#: ``enm/models.py`` z polami ``Source.c_max``/``c_min``) dla tego samego modelu.
_ODCISKI_SPRZED_KARTY = {
    "compute_enm_hash": "6e4d2e034058318e2e3eb568aa1c4e6a8cc3ea2f93b72415999fa80032a6367c",
    "compute_semantic_hash": "a8a6d5805550485c272bccd9bc3425119835a343a20c75be36ea042c82ccaf55",
    "compute_input_hash": "8aca3b0cc81698487a1d3cd26dc7f8e2d7f2f74856afa00b826684f27f363735",
    "hash_migawki_enm": "6e4d2e034058318e2e3eb568aa1c4e6a8cc3ea2f93b72415999fa80032a6367c",
}


def _model_sondy(**tolerancje: str) -> EnergyNetworkModel:
    transformator: dict[str, Any] = {
        "ref_id": "tr",
        "name": "TR",
        "hv_bus_ref": "b_sn",
        "lv_bus_ref": "b_nn",
        "sn_mva": 0.63,
        "uhv_kv": 15.0,
        "ulv_kv": 0.4,
        "uk_percent": 6.0,
        "pk_kw": 8.0,
        "vector_group": "Dyn11",
    }
    if "transformer" in tolerancje:
        transformator["lv_voltage_tolerance"] = tolerancje["transformer"]
    return EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Sonda odcisku",
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            },
            "buses": [
                {"ref_id": "b_sn", "name": "SN", "voltage_kv": 15.0},
                {"ref_id": "b_nn", "name": "nN", "voltage_kv": 0.4},
            ],
            "sources": [gpz_source_record(ref_id="src", bus_ref="b_sn")],
            "transformers": [transformator],
        }
    )


def _odciski(enm: EnergyNetworkModel) -> dict[str, str]:
    return {
        "compute_enm_hash": compute_enm_hash(enm),
        "compute_semantic_hash": compute_semantic_hash(enm),
        "compute_input_hash": compute_input_hash(enm),
        "hash_migawki_enm": hash_migawki_enm(enm.model_dump(mode="json")),
    }


def test_odcisk_modelu_bez_deklaracji_identyczny_jak_przed_karta() -> None:
    assert _odciski(_model_sondy()) == _ODCISKI_SPRZED_KARTY


def test_deklaracja_tolerancji_zmienia_odcisk_wejscia_obliczen() -> None:
    """Tolerancja zmienia c (fizyka zwarć), więc MUSI zmieniać odcisk wejścia obliczeń
    (V12S-010: ``input_hash``, ``compute_enm_hash``, odcisk migawki); odcisk semantyczny
    (topologia, role, pasma, katalog) zostaje — tolerancja nie jest topologią."""
    bez = _odciski(_model_sondy())
    z_6 = _odciski(_model_sondy(transformer="PLUS_6"))
    z_10 = _odciski(_model_sondy(transformer="PLUS_10"))
    for klucz in ("compute_input_hash", "compute_enm_hash", "hash_migawki_enm"):
        assert len({bez[klucz], z_6[klucz], z_10[klucz]}) == 3, klucz
    assert bez["compute_semantic_hash"] == z_6["compute_semantic_hash"]
    assert bez["compute_semantic_hash"] == z_10["compute_semantic_hash"]


def test_skasowane_pola_zrodla_nie_sa_przyjmowane_po_cichu() -> None:
    """Fantom ``Source.c_max``/``c_min`` skasowany bez warstwy zgodności: nie jest polem
    modelu (nie trafia do migawki), a odcisk modelu bez nich jest odciskiem sprzed karty."""
    assert "c_max" not in Source.model_fields
    assert "c_min" not in Source.model_fields
    migawka = _model_sondy().model_dump(mode="json")
    assert "c_max" not in migawka["sources"][0]
    assert "c_min" not in migawka["sources"][0]


def test_transformator_jest_nosnikiem_w_modelu() -> None:
    assert Transformer.model_fields["lv_voltage_tolerance"].default is None
    assert Source.model_fields["lv_voltage_tolerance"].default is None
