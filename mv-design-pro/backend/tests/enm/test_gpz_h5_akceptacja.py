"""Test odbiorowy GPZ H5 110/15 kV (karta GPZ-H5, ENEA Operator Zeszyt 1 §11.1, §26.10).

Jeden przypadek H5 (`tests/reference_networks/gpz_h5.py`, **przykładowe dane przypadku
testowego**) liczony ścieżką biegu (`create_run` → `execute_run` — ta sama, którą woła
`POST /api/execution/study-cases/{id}/runs`) w wariantach ruchowych jako scenariusze
jednego modelu (`OperatingScenario`), a KAŻDA wartość porównana z rachunkiem
NIEZALEŻNYM IEC 60909-0:2016 napisanym w tym pliku (bez importu solvera):

* SC-01 praca normalna (dwie wyspy) — 3F MAX sekcji A tylko z toru L1–TR1, sekcji B tylko
  z toru L2–TR2; `branch_contributions` zwarcia na sekcji A wyłącznie przez TR1;
  rozpływ porównany z rachunkiem dwuwęzłowym (impedancja szeregowa TR, przesunięcie 30°);
* SC-02 utrata L1 — sekcja 110 kV 1 i sekcja SN A „bez napięcia” (wiersz bez liczby
  z przyczyną), sekcja B liczona; bez źródła w CAŁYM modelu — odmowa;
* SC-02b utrata L1 i zamknięty ŁS-110 — obie sekcje z L2 (jedno źródło), liczone;
* SC-03 / SC-05a utrata TR1 albo TR2 i zamknięty ŁS-SN — obie sekcje SN z jednego toru;
* SC-04 zamknięty ŁS-110 i SC-05b zamknięty ŁS-SN przy obu TR — odmowa E067 rozpływu
  i zwarć (łączy niezależne równoważniki), 3F i 1F; akcja: wariant ze wspólnym punktem
  zasilania (model B);
* SC-06 wkład per źródło sieciowe — pole wyniku z karty rdzenia R8 wątku prowadzącego
  (wpis 7 koordynacji pkt 2); tu brak zastępczej wielkości, wiersz czeka na tamto scalenie;
* SC-07 MAX/MIN (c_max/c_min, S″k max/min per tor) — 3F wszystkich szyn;
* SC-08 doziemne — bez Z0 torów odmowa całego biegu 1F; z Z0: szyny 110 kV liczone,
  szyny SN odmowa per węzeł (brak drogi prądu zerowego — Yd11 bez punktu neutralnego,
  zespół uziemiający w polu sekcji bez elementu w danych, ENEA §16: dana projektu).

Dalej: role łączników × stany (rola z JEDNEJ funkcji `role_lacznikow`, niezależna od
położenia; E067 z tej samej funkcji), tryb rezerwy ukryty/jawny (W063, W064), kasowanie
elementów H5 × obie drogi kasowania, gotowość HTTP czytająca migawkę scenariusza, bieg HTTP
ze scenariuszem i szablony H5.

Iniekcje (karta §D pkt 7), każda czerwieni test w tym pliku: wspólna szyna 110 kV
(`test_struktura_h5_dwa_tory_dwie_szyny_wn`), łącznik otwarty w modelu, a zwarty
w obliczeniu (`test_sc01_*`), sumowanie niezależnych równoważników bez odmowy
(`test_sc04_sc05b_*`), bieg na modelu bazowym zamiast migawki scenariusza (`test_sc02_*`,
`test_bieg_http_ze_scenariuszem_*`).
"""

from __future__ import annotations

import cmath
import copy
import math
import uuid
from typing import Any
from uuid import UUID

import pytest
from domain.result_contract_v1 import ZNACZNIK_BEZ_DROGI_ZEROWEJ
from enm.canonical_analysis import (
    POWOD_WEZEL_BEZ_DROGI_ZEROWEJ,
    POWOD_WEZEL_BEZ_ODNIESIENIA,
    ZNACZNIK_SZYNY_BEZ_NAPIECIA,
    CanonicalRun,
    build_bus_results,
    build_short_circuit_results,
    build_short_circuit_rozplyw,
    create_run,
    execute_run,
)
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel
from enm.pola import punkt_przylaczenia_pola
from enm.scenariusze import OperatingScenario, RodzajScenariusza, apply_scenario
from enm.sklad_pola import indeks_modelu_pola, sklad_pola
from enm.store import set_enm
from enm.topology import (
    ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
    ROLA_LACZNIK_SZYN_SN,
    ROLA_LACZNIK_SZYN_WN,
    ROLA_PUNKT_PODZIALU,
    SekcjaSnTransformatoraGpz,
    polaczenia_niezaleznych_zrodel,
    role_lacznikow,
    sekcje_sn_transformatorow_gpz,
    transformatory_zasilajace_gpz,
)
from enm.topology_ops import usun_galaz, usun_urzadzenie, usun_wezel
from enm.validator import ENMValidator
from network_model.catalog.gniazda_pol_enea import szablon_pola_standardu
from network_model.odmowa_danych import OdmowaNazwana

from tests.reference_networks.gpz_h5 import (
    ODBIOR_A,
    ODBIOR_B,
    OPIS_DANYCH,
    RX_110,
    TOR_L1,
    TOR_L2,
    Z0_Z1_110,
    RefyH5,
    ladunek_h5,
    pusty_model,
    refy,
    zbuduj_h5,
)

# ---------------------------------------------------------------------------
# Rachunek NIEZALEŻNY IEC 60909-0:2016 (bez importu solvera — dane z katalogu i przypadku)
# ---------------------------------------------------------------------------

#: Katalog `tr-wn-sn-110-15-25mva-yd11` (`mv_transformer_catalog.py`): S_rT, U_rHV, U_rLV,
#: u_k, P_k — przepisane tu jawnie, żeby rachunek nie czytał tego, co sprawdza.
S_RT_VA = 25e6
U_RT_WN_V = 110e3
U_RT_SN_V = 15e3
UK = 0.11
PK_W = 120e3
#: Napięcia znamionowe sieci (IEC 60909-0 §2.3.2: U_n).
UN_WN_V = 110e3
UN_SN_V = 15e3
C_MAX = 1.1
C_MIN = 1.0
#: Zamknięty łącznik w rozpływie Newtona–Raphsona (rdzeń FROZEN
#: `network_model/solvers/power_flow_newton_internal.py`, `Y_CLOSED_SWITCH`): admitancja
#: 1/(R + jX) przy R = X = 0,0001 Ω na poziomie napięcia węzła — nie fuzja węzłów. Prąd
#: transformatora płynie przez wyłącznik pola SN (gniazdo „W”, zał. Z.7), więc rachunek
#: niezależny dodaje tę impedancję jawnie (zwarcia IEC 60909 łączą węzły łącznika bez niej).
Z_ZAMKNIETEGO_LACZNIKA_ROZPLYWU_OHM = complex(1e-4, 1e-4)


def _z_q(sk_mva: float, c: float, rx: float, un_v: float) -> complex:
    """Z_Q = c·U_nQ²/S″kQ (IEC 60909-0 wzór 4), X_Q = Z_Q/√(1+(R/X)²), R_Q = (R/X)·X_Q."""
    z = c * un_v**2 / (sk_mva * 1e6)
    x = z / math.sqrt(1.0 + rx**2)
    return complex(rx * x, x)


def _z_tk_sn() -> complex:
    """Z_TK = K_T·Z_T po stronie SN; K_T = 0,95·c_max/(1 + 0,6·x_T) (wzór 12a) — K_T
    z c_max także w obliczeniu MIN (norma: K_T jest korekcją impedancji, nie c)."""
    z_t = UK * U_RT_SN_V**2 / S_RT_VA
    r_t = PK_W * U_RT_SN_V**2 / S_RT_VA**2
    x_t = math.sqrt(z_t**2 - r_t**2)
    x_t_pu = x_t / (U_RT_SN_V**2 / S_RT_VA)
    k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t_pu)
    return k_t * complex(r_t, x_t)


def _ik3(z: complex, c: float, un_v: float) -> float:
    """I″k3 = c·U_n/(√3·|Z_k|) (wzór 29)."""
    return c * un_v / (math.sqrt(3.0) * abs(z))


def ik3_wn(tor: tuple[str, str, float, float], *, maks: bool = True) -> float:
    """Zwarcie 3F na szynie 110 kV zasilanej torem `tor`."""
    _linia, _stacja, sk_max, sk_min = tor
    c = C_MAX if maks else C_MIN
    return _ik3(_z_q(sk_max if maks else sk_min, c, RX_110, UN_WN_V), c, UN_WN_V)


def ik3_sn(tor: tuple[str, str, float, float], *, maks: bool = True) -> float:
    """Zwarcie 3F na szynie SN zasilanej torem `tor` przez JEDEN transformator 110/15 kV:
    Z_k = Z_Q/t_r² + Z_TK (Z_Q sprowadzone na stronę SN przekładnią znamionową)."""
    _linia, _stacja, sk_max, sk_min = tor
    c = C_MAX if maks else C_MIN
    t_r = U_RT_WN_V / U_RT_SN_V
    z = _z_q(sk_max if maks else sk_min, c, RX_110, UN_WN_V) / t_r**2 + _z_tk_sn()
    return _ik3(z, c, UN_SN_V)


def ik1_wn(tor: tuple[str, str, float, float], *, maks: bool = True) -> float:
    """Zwarcie 1F na szynie 110 kV: I″k1 = √3·c·U_n/|Z1 + Z2 + Z0| (wzór 52), Z2 = Z1,
    Z0 = (Z0/Z1)·Z1 toru; transformator Yd11 bez wyprowadzonego punktu neutralnego nie daje
    drogi składowej zerowej (uzwojenie Y bez uziemienia)."""
    _linia, _stacja, sk_max, sk_min = tor
    c = C_MAX if maks else C_MIN
    z1 = _z_q(sk_max if maks else sk_min, c, RX_110, UN_WN_V)
    return math.sqrt(3.0) * c * UN_WN_V / abs(2.0 * z1 + Z0_Z1_110 * z1)


def rozplyw_dwuwezlowy(p_mw: float, q_mvar: float) -> tuple[float, float, float, float]:
    """Rozpływ: szyna 110 kV = węzeł bilansujący |U| = 1 pu, kąt 0; odbiór S na szynie SN
    za impedancją szeregową TR (u_k, P_k; gałąź poprzeczna transformatora poza modelem
    rozpływu — ograniczenie rdzenia, V12K-162), zamkniętym wyłącznikiem pola SN
    (`Z_ZAMKNIETEGO_LACZNIKA_ROZPLYWU_OHM`) i przesunięciem fazowym Yd11 (+30°).
    Iteracja prosta U2 = U1·e^{j30°} − Z·conj(S/U2) w jednostkach względnych S_rT.
    Zwraca (|U2| pu, kąt U2 [°], P źródła [MW], Q źródła [Mvar])."""
    z_pu = complex(PK_W / S_RT_VA, math.sqrt(UK**2 - (PK_W / S_RT_VA) ** 2))
    z_pu += Z_ZAMKNIETEGO_LACZNIKA_ROZPLYWU_OHM / (U_RT_SN_V**2 / S_RT_VA)
    s_pu = complex(p_mw, q_mvar) / (S_RT_VA / 1e6)
    u1 = cmath.rect(1.0, math.radians(30.0))
    u2 = u1
    for _ in range(200):
        u2 = u1 - z_pu * (s_pu / u2).conjugate()
    prad = (s_pu / u2).conjugate()
    s_zrodla = (u2 * prad.conjugate() + z_pu * abs(prad) ** 2) * (S_RT_VA / 1e6)
    return abs(u2), math.degrees(cmath.phase(u2)), s_zrodla.real, s_zrodla.imag


# ---------------------------------------------------------------------------
# Ścieżka biegu
# ---------------------------------------------------------------------------

OPCJE_3F_MAX = {"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0}
OPCJE_3F_MIN = {"fault_type": "3F", "scenario": "min", "thermal_time_seconds": 1.0}
OPCJE_1F_MAX = {"fault_type": "1F", "scenario": "max", "thermal_time_seconds": 1.0}
OPCJE_1F_MIN = {"fault_type": "1F", "scenario": "min", "thermal_time_seconds": 1.0}


def _scenariusz(
    nazwa: str,
    *,
    stany: dict[str, str] | None = None,
    wylaczone: tuple[str, ...] = (),
) -> OperatingScenario:
    return OperatingScenario(
        scenario_id=f"h5-{nazwa}",
        name=nazwa,
        kind=RodzajScenariusza.CUSTOM,
        switch_states=dict(stany or {}),
        out_of_service=wylaczone,
    )


def _klucz(snapshot: dict[str, Any]) -> str:
    klucz = f"gpz-h5:{uuid.uuid4().hex}"
    set_enm(klucz, EnergyNetworkModel.model_validate(snapshot))
    return klucz


def _bieg(
    snapshot: dict[str, Any],
    analiza: str,
    opcje: dict[str, Any] | None = None,
    scenariusz: OperatingScenario | None = None,
) -> CanonicalRun:
    run = create_run(
        case_id=f"przypadek-{uuid.uuid4().hex[:8]}",
        klucz_twin=_klucz(snapshot),
        analysis_type=analiza,
        options=opcje,
        scenariusz=scenariusz,
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik


def _wezly_enm(run: CanonicalRun) -> dict[str, str]:
    """Węzeł grafu wyniku (`fault_node_id`) → `ref_id` szyny ENM (wiersze wyniku)."""
    return {
        str(w["target_id"]): str(w["element_id"]) for w in build_short_circuit_results(run)["rows"]
    }


def _ikss(run: CanonicalRun) -> dict[str, float | None]:
    """Szyna ENM → I″k [A] (None = wiersz bez liczby) z surowego wyniku zwarcia biegu."""
    assert run.raw_result is not None
    wezly = _wezly_enm(run)
    return {wezly[str(w["fault_node_id"])]: w.get("ikss_a") for w in run.raw_result["results"]}


def _wiersze_zwarcia(run: CanonicalRun) -> dict[str, dict[str, Any]]:
    return {str(w["element_id"]): w for w in build_short_circuit_results(run)["rows"]}


def _wiersze_szyn(run: CanonicalRun) -> dict[str, dict[str, Any]]:
    return {str(w["element_id"]): w for w in build_bus_results(run)["rows"]}


def _przyczyny(run: CanonicalRun) -> dict[str, str | None]:
    assert run.raw_result is not None
    wezly = _wezly_enm(run)
    return {
        wezly[str(w["fault_node_id"])]: w.get("non_physical_reason")
        for w in run.raw_result["results"]
    }


@pytest.fixture(scope="module")
def h5() -> dict[str, Any]:
    return zbuduj_h5()


@pytest.fixture(scope="module")
def r(h5: dict[str, Any]) -> RefyH5:
    return refy(h5)


def _galaz(enm: dict[str, Any], ref: str) -> dict[str, Any]:
    return next(g for g in enm["branches"] if g["ref_id"] == ref)


#: Kabel SN z katalogu dla odcinka magistrali (ten sam, co scen zajętości pól).
KABEL_SN = "cable-tfk-yakxs-3x120"


def _element(enm: dict[str, Any], kolekcja: str, ref: str) -> dict[str, Any]:
    return next(e for e in enm[kolekcja] if e["ref_id"] == ref)


# ---------------------------------------------------------------------------
# Struktura H5 (R1–R4, ustalenia koordynatora 1, 2, 4, 6, 7)
# ---------------------------------------------------------------------------


def test_struktura_h5_dwa_tory_dwie_szyny_wn(h5: dict[str, Any], r: RefyH5) -> None:
    """R1/R3 (ustalenie 1: H5 podstawowy, jedna linia 110 kV niedopuszczalna): dwa tory
    na DWÓCH różnych szynach 110 kV, każdy z własną tożsamością (linia, stacja zasilająca)
    i danymi zasilania; TR1 sekcja 110 kV 1 → sekcja SN A, TR2 sekcja 2 → sekcja B."""
    assert r.szyna_wn_1 != r.szyna_wn_2
    assert len({r.szyna_wn_1, r.szyna_wn_2, r.szyna_sn_a, r.szyna_sn_b}) == 4
    for ref, tor in ((r.zrodlo_l1, TOR_L1), (r.zrodlo_l2, TOR_L2)):
        zrodlo = _element(h5, "sources", ref)
        linia, stacja, sk_max, sk_min = tor
        assert zrodlo["supply_line_name"] == linia
        assert zrodlo["supplying_station_name"] == stacja
        assert OPIS_DANYCH in zrodlo["supplying_station_name"]
        assert zrodlo["sk3_mva"] == pytest.approx(sk_max)
        assert zrodlo["sk3_min_mva"] == pytest.approx(sk_min)
        assert zrodlo["z0_z1_ratio"] == pytest.approx(Z0_Z1_110)
    # Pole zasilające 110 kV = granica zasilania sieci SN (decyzja właściciela 2026-10-22):
    # równoważnik toru stoi na zacisku pola, a łącznik pola (gałąź modelu, bez katalogu,
    # bez typu) łączy zacisk z szyną sekcji — jego stan wchodzi do obliczeń.
    for zrodlo, zacisk, wylacznik, szyna_wn in (
        (r.zrodlo_l1, r.zacisk_l1, r.wylacznik_l1, r.szyna_wn_1),
        (r.zrodlo_l2, r.zacisk_l2, r.wylacznik_l2, r.szyna_wn_2),
    ):
        assert _element(h5, "sources", zrodlo)["bus_ref"] == zacisk
        galaz = _galaz(h5, wylacznik)
        assert galaz["type"] == "breaker"
        assert (galaz["from_bus_ref"], galaz["to_bus_ref"]) == (szyna_wn, zacisk)
        assert (galaz["status"], galaz["normal_state"]) == ("closed", "closed")
        assert galaz["catalog_ref"] is None
        assert _element(h5, "buses", zacisk)["voltage_kv"] == pytest.approx(110.0)
        (pole_linii,) = (
            p for p in h5["bays"] if p["bus_ref"] == szyna_wn and p["bay_role"] == "IN"
        )
        assert pole_linii["equipment_refs"] == [wylacznik]
        assert pole_linii["terminal_bus_ref"] == zacisk
        assert pole_linii.get("szablon_standardu_ref") is None
        assert pole_linii.get("primary_devices") in (None, [])
    tr1 = _element(h5, "transformers", r.tr1)
    tr2 = _element(h5, "transformers", r.tr2)
    # Strona dolna każdego transformatora leży na zacisku pola SN, za wyłącznikiem pola
    # (gniazdo „W” zał. Z.7) — gałęzią łączeniową modelu, która łączy zacisk z szyną sekcji.
    for tr, wylacznik, szyna_wn, szyna_sn in (
        (tr1, r.wylacznik_tr1, r.szyna_wn_1, r.szyna_sn_a),
        (tr2, r.wylacznik_tr2, r.szyna_wn_2, r.szyna_sn_b),
    ):
        galaz = _galaz(h5, wylacznik)
        assert tr["hv_bus_ref"] == szyna_wn
        assert galaz["type"] == "breaker"
        assert (galaz["from_bus_ref"], galaz["to_bus_ref"]) == (szyna_sn, tr["lv_bus_ref"])
        assert (galaz["status"], galaz["normal_state"]) == ("closed", "closed")
    assert "transformer_count" not in ladunek_h5()
    # Ustalenie 7: znacznik danych przykładowych w danych modelu.
    assert OPIS_DANYCH in h5["header"]["name"]


def test_lacznik_110_stan_normalny_jest_dana(h5: dict[str, Any], r: RefyH5) -> None:
    """Ustalenie 2: stan normalny ŁS-110 jest daną (przypadek odbiorowy: otwarty); brak
    stanu przy dwóch sekcjach 110 kV = odmowa nazwana, nie domyślny „zamknięty”."""
    lacznik = _galaz(h5, r.lacznik_wn)
    assert (lacznik["normal_state"], lacznik["status"]) == ("open", "open")
    ladunek = ladunek_h5()
    del ladunek["hv_coupler"]
    wynik = execute_domain_operation(
        enm_dict=pusty_model(), op_name="add_grid_source_sn", payload=ladunek
    )
    assert wynik["error_code"] == "source.gpz_coupler_state_required"


def test_jedna_linia_110_kv_w_szablonie_h5_odmowa() -> None:
    """Ustalenie 1 (ENEA §11.1): szablon H5 bez dwóch torów zasilania — odmowa nazwana."""
    from application.station_templates import get_template
    from application.station_templates.apply import TemplateApplyError, apply_template_to_case

    for tpl_id in ("tpl_gpz_h5_110_15_2x25mva", "tpl_gpz_h5_110_20_2x25mva"):
        szablon = get_template(tpl_id)
        assert szablon is not None
        klucz = _klucz(pusty_model())
        with pytest.raises(TemplateApplyError) as blad:
            apply_template_to_case(
                template=szablon,
                klucz_twin=klucz,
                target_segment_id=None,
                params_override={"hv_sections": [ladunek_h5()["hv_sections"][0]]},
            )
        assert blad.value.code == "template.gpz_h5_supply_tracks_required"


def test_pola_funkcyjne_bez_aparatow_i_cele_lacznika(h5: dict[str, Any], r: RefyH5) -> None:
    """Ustalenie 4 (§13, zał. Z.2): pola ZU/BKR/POMIAR na każdej sekcji SN bez elementu;
    łącznik szyn SN w dwóch celach — gałąź łącznika należy do celi wyłącznikowej (cela 2),
    cela sprzęgła (cela 1) jej nie wskazuje; karta GPZ-H5-APARATURA: każde pole ma szablon
    pola standardu ENEA i gniazda w kolejności szablonu, a kolejność pól w modelu jest
    kolejnością rozdzielni (zał. Z.1 i Z.2)."""
    stacja = _element(h5, "substations", r.stacja)
    pola = [p for p in h5["bays"] if p.get("substation_ref") == r.stacja]
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        funkcyjne = sorted(
            p["bay_role"]
            for p in pola
            if p.get("bus_ref") == szyna
            and p["bay_role"] in {"EARTHING", "CAPACITOR", "MEASUREMENT"}
        )
        assert funkcyjne == ["CAPACITOR", "EARTHING", "MEASUREMENT"]
        for pole in pola:
            if pole.get("bus_ref") == szyna and pole["bay_role"] in {"EARTHING", "CAPACITOR"}:
                assert pole.get("equipment_refs") in (None, [])
    cele = {
        p["meta"]["gpz_coupler_cell"]: (p["szablon_standardu_ref"], p["equipment_refs"])
        for p in pola
        if p["bay_role"] == "COUPLER" and p.get("bus_ref") in {r.szyna_sn_a, r.szyna_sn_b}
    }
    assert cele == {
        1: ("ENEA_SN_LS_CELA_SPRZEGLA", []),
        2: ("ENEA_SN_LS_CELA_WYLACZNIKOWA", [r.lacznik_sn]),
    }
    szyny_wn = {r.szyna_wn_1, r.szyna_wn_2}
    pola_wn = [p for p in pola if p.get("bus_ref") in szyny_wn]
    # Zał. Z.1: sekcja A (linia, transformator), łącznik szyn, sekcja B (linia, transformator).
    # Strona 110 kV = granica zasilania sieci SN (decyzja właściciela 2026-10-22): pola bez
    # szablonu standardu i bez gniazd; każde pole wskazuje wyłącznie element, któremu służy.
    assert [
        (p["bay_role"], p.get("szablon_standardu_ref"), p["equipment_refs"]) for p in pola_wn
    ] == [
        ("IN", None, [r.wylacznik_l1]),
        ("TR", None, [r.tr1]),
        ("COUPLER", None, [r.lacznik_wn]),
        ("IN", None, [r.wylacznik_l2]),
        ("TR", None, [r.tr2]),
    ]
    # Skład pola 110 kV: łącznik pola z gałęzią modelu ze stanem „brak typu” (bez braku do
    # uzupełnienia, bez gniazd WYMAGANE_STANDARDEM_BRAK); transformator — element modelu
    # z własnym katalogiem.
    model = EnergyNetworkModel.model_validate(h5)
    indeks = indeks_modelu_pola(model)
    for pole in pola_wn:
        bay = next(b for b in model.bays if b.ref_id == pole["ref_id"])
        wiersze = sklad_pola(indeks, bay)
        assert len(wiersze) == 1, [w.rodzaj for w in wiersze]
        (wiersz,) = wiersze
        assert wiersz.linked_ref == pole["equipment_refs"][0]
        if pole["bay_role"] == "TR":
            assert (wiersz.rodzaj, wiersz.status) == ("TRANSFORMER_DEVICE", "ZAPROJEKTOWANE")
        else:
            assert (wiersz.rodzaj, wiersz.status) == ("CB", "BRAK_TYPU_GRANICA_WN")
            assert wiersz.catalog_ref is None and "brak typu" in wiersz.opis_pl
            assert "?" not in wiersz.opis_pl
    # Zał. Z.2, dla każdej sekcji SN: łącznik szyn, BKR, ZU, transformator, pomiar, linie.
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        assert [p["szablon_standardu_ref"] for p in pola if p.get("bus_ref") == szyna] == [
            "ENEA_SN_LS_CELA_SPRZEGLA" if szyna == r.szyna_sn_a else "ENEA_SN_LS_CELA_WYLACZNIKOWA",
            "ENEA_SN_BKR",
            "ENEA_SN_ZU_REZYSTOR",
            "ENEA_SN_TR",
            "ENEA_SN_POMIAR",
            "ENEA_SN_LINIA",
        ]
    for pole in pola:
        if pole.get("bus_ref") in szyny_wn:
            continue
        szablon = szablon_pola_standardu(pole["szablon_standardu_ref"])
        assert szablon is not None
        assert [d["gniazdo_ref"] for d in pole["primary_devices"]] == [
            g.id for g in szablon.gniazda
        ]
    laczniki_wn = [
        g for g in h5["branches"] if g["from_bus_ref"] in szyny_wn or g["to_bus_ref"] in szyny_wn
    ]
    assert sorted(g["ref_id"] for g in laczniki_wn) == sorted(
        [r.lacznik_wn, r.wylacznik_l1, r.wylacznik_l2]
    )
    assert stacja["gpz_reserve_mode"] == "hidden"


# ---------------------------------------------------------------------------
# SC-01 praca normalna (R3) — dwie wyspy, rachunek niezależny
# ---------------------------------------------------------------------------


def test_sc01_zwarcie_3f_max_kazda_sekcja_tylko_z_wlasnego_toru(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Iniekcja „łącznik otwarty w modelu, zwarty w obliczeniu”: suma torów dałaby na
    sekcji A prąd z L1 ∥ L2 (> wartości jednego toru) — test czerwony."""
    ik = _ikss(_bieg(h5, "short_circuit_sn", OPCJE_3F_MAX))
    assert ik[r.szyna_sn_a] == pytest.approx(ik3_sn(TOR_L1), rel=1e-6)
    assert ik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)
    assert ik[r.szyna_wn_1] == pytest.approx(ik3_wn(TOR_L1), rel=1e-6)
    assert ik[r.szyna_wn_2] == pytest.approx(ik3_wn(TOR_L2), rel=1e-6)


def test_sc01_wklad_zwarcia_na_sekcji_a_wylacznie_przez_tr1(h5: dict[str, Any], r: RefyH5) -> None:
    """SC-01: ISTNIEJĄCY przepływ gałęziowy zwarcia na sekcji A (`branch_contributions`) —
    jedyna gałąź wkładu to TR1, prąd = I″k sekcji A; TR2 i ŁS-SN bez wkładu (izolacja wysp).

    To NIE jest wiersz SC-06: wkład per źródło sieciowe (I_Q,k) daje karta rdzenia R8 wątku
    prowadzącego (zgoda B-01, wpis 7 koordynacji pkt 2); zastępczej wielkości „wkład przez
    gałąź transformatora” się nie buduje — wiersz SC-06 czeka na scalenie tamtej karty."""
    run = _bieg(h5, "short_circuit_sn", OPCJE_3F_MAX)
    wiersz = _wiersze_zwarcia(run)[r.szyna_sn_a]
    wklady = build_short_circuit_rozplyw(run, wiersz["target_id"])["branch_contributions"]
    assert [w["branch_id"] for w in wklady] == [r.tr1]
    assert wklady[0]["i_ka"] * 1e3 == pytest.approx(ik3_sn(TOR_L1), rel=1e-6)


def test_sc01_rozplyw_zgodny_z_rachunkiem_dwuwezlowym(h5: dict[str, Any], r: RefyH5) -> None:
    run = _bieg(h5, "PF")
    assert run.raw_result is not None
    wezly = {w["bus_id"]: w["element_id"] for w in build_bus_results(run)["rows"]}
    szyny = {wezly[b["bus_id"]]: b for b in run.raw_result["result_v1"]["bus_results"]}
    for szyna_sn, szyna_wn, zacisk, (_nazwa, p, q) in (
        (r.szyna_sn_a, r.szyna_wn_1, r.zacisk_l1, ODBIOR_A),
        (r.szyna_sn_b, r.szyna_wn_2, r.zacisk_l2, ODBIOR_B),
    ):
        u, kat, p_zr, q_zr = rozplyw_dwuwezlowy(p, q)
        assert szyny[szyna_sn]["v_pu"] == pytest.approx(u, abs=1e-6)
        assert szyny[szyna_sn]["angle_deg"] == pytest.approx(kat, abs=1e-4)
        # Węzeł bilansujący = zacisk pola liniowego 110 kV (równoważnik toru stoi na
        # zacisku, za łącznikiem pola). Zamknięty łącznik pola rozpływ NR odwzorowuje gałęzią
        # R = X = 1e-4 Ω (rdzeń FROZEN, admitancja łącznika zamkniętego), więc szyna sekcji
        # różni się od zacisku o spadek rzędu 1e-7 p.u. — poniżej dokładności porównania.
        assert szyny[zacisk]["v_pu"] == pytest.approx(1.0, abs=1e-12)
        assert szyny[szyna_wn]["v_pu"] == pytest.approx(1.0, abs=1e-6)
        assert szyny[zacisk]["p_injected_mw"] == pytest.approx(p_zr, abs=1e-5)
        assert szyny[zacisk]["q_injected_mvar"] == pytest.approx(q_zr, abs=1e-5)


# ---------------------------------------------------------------------------
# SC-02 utrata L1 (R7) — „bez napięcia” zamiast odmowy całego biegu
# ---------------------------------------------------------------------------


def test_sc02_utrata_l1_sekcja_a_bez_napiecia_sekcja_b_liczona(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Iniekcja „bieg na modelu bazowym zamiast migawki scenariusza”: sekcja A miałaby
    liczbę z L1 — test czerwony."""
    sc = _scenariusz("SC-02", wylaczone=(r.zrodlo_l1,))
    zwarcie = _bieg(h5, "short_circuit_sn", OPCJE_3F_MAX, sc)
    ik = _ikss(zwarcie)
    assert ik[r.szyna_sn_a] is None and ik[r.szyna_wn_1] is None
    assert ik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)
    assert ik[r.szyna_wn_2] == pytest.approx(ik3_wn(TOR_L2), rel=1e-6)
    przyczyny = _przyczyny(zwarcie)
    wiersze = _wiersze_zwarcia(zwarcie)
    for szyna in (r.szyna_sn_a, r.szyna_wn_1):
        assert przyczyny[szyna] == POWOD_WEZEL_BEZ_ODNIESIENIA
        assert wiersze[szyna]["flags"] == [ZNACZNIK_SZYNY_BEZ_NAPIECIA]
    assert wiersze[r.szyna_sn_b]["flags"] == []

    rozplyw = _bieg(h5, "PF", None, sc)
    szyny = _wiersze_szyn(rozplyw)
    for szyna in (r.szyna_sn_a, r.szyna_wn_1):
        assert szyny[szyna]["u_pu"] is None
        assert ZNACZNIK_SZYNY_BEZ_NAPIECIA in szyny[szyna]["flags"]
    u_b, _kat, _p, _q = rozplyw_dwuwezlowy(ODBIOR_B[1], ODBIOR_B[2])
    assert szyny[r.szyna_sn_b]["u_pu"] == pytest.approx(u_b, abs=1e-6)
    assert ZNACZNIK_SZYNY_BEZ_NAPIECIA not in szyny[r.szyna_sn_b]["flags"]


def test_brak_zrodla_w_calym_modelu_odmowa(h5: dict[str, Any], r: RefyH5) -> None:
    """R7: odmowa wyłącznie, gdy ŻADNA część modelu nie ma źródła (oba tory wyłączone)."""
    sc = _scenariusz("bez-zrodel", wylaczone=(r.zrodlo_l1, r.zrodlo_l2))
    for analiza, opcje in (("PF", None), ("short_circuit_sn", OPCJE_3F_MAX)):
        with pytest.raises(OdmowaNazwana):
            create_run(
                case_id="bez-zrodel",
                klucz_twin=_klucz(h5),
                analysis_type=analiza,
                options=opcje,
                scenariusz=sc,
            )


def test_sc02b_utrata_l1_i_zamkniety_ls110_oba_tory_z_l2(h5: dict[str, Any], r: RefyH5) -> None:
    """Zamknięty ŁS-110 przy JEDNYM źródle nie łączy niezależnych równoważników — liczone."""
    sc = _scenariusz("SC-02b", stany={r.lacznik_wn: "closed"}, wylaczone=(r.zrodlo_l1,))
    ik = _ikss(_bieg(h5, "short_circuit_sn", OPCJE_3F_MAX, sc))
    for szyna in (r.szyna_wn_1, r.szyna_wn_2):
        assert ik[szyna] == pytest.approx(ik3_wn(TOR_L2), rel=1e-6)
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        assert ik[szyna] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)


@pytest.mark.parametrize("ls110", ["open", "closed"], ids=["LS110-otwarty", "LS110-zamkniety"])
def test_otwarty_wylacznik_pola_l1_w_scenariuszu_rowny_utracie_toru_l1(
    h5: dict[str, Any], r: RefyH5, ls110: str
) -> None:
    """Pole zasilające 110 kV = przyłącze z łącznikiem, którego stan wchodzi do obliczeń
    (decyzja właściciela 2026-10-22). Iloczyn: przyczyna utraty toru L1 {otwarty wyłącznik
    pola w scenariuszu łączeniowym, tor wyłączony z pracy} × stan ŁS-110 {otwarty, zamknięty}
    → ten sam wynik na szynach sekcji (SC-02 / SC-02b); zacisk pola jest szyną pomocniczą
    bez wiersza wyniku zwarcia.
    Iniekcja „scenariusz gubi stan łącznika pola 110 kV” — sekcja A ma liczbę z L1."""
    sekcje = (r.szyna_wn_1, r.szyna_wn_2, r.szyna_sn_a, r.szyna_sn_b)
    stan_ls = {r.lacznik_wn: ls110} if ls110 == "closed" else {}
    przez_wylacznik = _ikss(
        _bieg(
            h5,
            "short_circuit_sn",
            OPCJE_3F_MAX,
            _scenariusz("L1-wylacznik", stany={r.wylacznik_l1: "open", **stan_ls}),
        )
    )
    przez_wylaczenie = _ikss(
        _bieg(
            h5,
            "short_circuit_sn",
            OPCJE_3F_MAX,
            _scenariusz("L1-wylaczenie", stany=stan_ls, wylaczone=(r.zrodlo_l1,)),
        )
    )
    assert {s: przez_wylacznik[s] for s in sekcje} == {s: przez_wylaczenie[s] for s in sekcje}
    if ls110 == "open":
        assert przez_wylacznik[r.szyna_sn_a] is None and przez_wylacznik[r.szyna_wn_1] is None
        assert przez_wylacznik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)
    else:
        for szyna in (r.szyna_sn_a, r.szyna_sn_b):
            assert przez_wylacznik[szyna] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)


def _z_stanami_normalnymi(tryb: str, stany: dict[str, str]) -> tuple[dict[str, Any], RefyH5]:
    enm = copy.deepcopy(zbuduj_h5(reserve_mode=tryb))
    rr = refy(enm)
    for atrybut, stan in stany.items():
        galaz = _galaz(enm, getattr(rr, atrybut))
        galaz["normal_state"] = stan
        galaz["status"] = stan
    return enm, rr


@pytest.mark.parametrize("ls110", ["open", "closed"])
@pytest.mark.parametrize("tryb", ["hidden", "explicit"])
def test_wylacznik_pola_l1_normalnie_otwarty_w063_e065_z_przyczyna(tryb: str, ls110: str) -> None:
    """Iloczyn: tryb rezerwy {ukryty, jawny} × stan normalny ŁS-110 {otwarty, zamknięty} przy
    NORMALNIE OTWARTYM wyłączniku pola L1. ŁS-110 otwarty: sekcja 110 kV 1 nie ma toru pod
    napięciem — W063 nazywa przyczynę (łącznik pola liniowego 110 kV), E065 wskazuje
    łącznik do zamknięcia (w tym wyłącznik pola L1), I001 opisuje rolę (tor odstawiony, nie
    punkt podziału). ŁS-110 zamknięty: obie sekcje 110 kV z L2 — bez W063, E065 i E067.
    Iniekcja „W063 nie czyta stanu wyłącznika pola 110 kV” — brak W063 (czerwony)."""
    enm, rr = _z_stanami_normalnymi(tryb, {"wylacznik_l1": "open", "lacznik_wn": ls110})
    zgloszenia = ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
    kody = {z.code for z in zgloszenia}
    (i001,) = (
        z for z in zgloszenia if z.code == "I001" and rr.wylacznik_l1 in (z.element_refs or [])
    )
    assert "łącznikiem pola liniowego 110 kV" in i001.message_pl
    assert "to nie jest punkt podziału sieci" in i001.message_pl
    if ls110 == "closed":
        assert not kody & {"W063", "E065", "E067"}, kody
        return
    (w063,) = (z for z in zgloszenia if z.code == "W063")
    assert "Sekcja 110 kV 1" in w063.message_pl
    assert "łącznik pola liniowego 110 kV normalnie otwarty" in w063.message_pl
    (e065,) = (z for z in zgloszenia if z.code == "E065")
    assert {rr.wylacznik_l1, rr.lacznik_wn} <= set(e065.element_refs or [])
    assert "łącznik pola liniowego 110 kV" in e065.message_pl
    assert "Zamknij łącznik wskazany w zgłoszeniu" in (e065.suggested_fix or "")
    assert rr.szyna_sn_a in (e065.element_refs or [])


# ---------------------------------------------------------------------------
# SC-03 / SC-05a — przełączenie rezerwowe SN przy jednym TR
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wylaczony", "tor"),
    [("tr1", TOR_L2), ("tr2", TOR_L1)],
    ids=["SC-03-bez-TR1", "SC-05a-bez-TR2"],
)
def test_sc03_sc05a_jeden_tr_i_zamkniety_ls_sn_zasila_obie_sekcje(
    h5: dict[str, Any], r: RefyH5, wylaczony: str, tor: tuple[str, str, float, float]
) -> None:
    sc = _scenariusz(
        f"rezerwa-{wylaczony}", stany={r.lacznik_sn: "closed"}, wylaczone=(getattr(r, wylaczony),)
    )
    ik = _ikss(_bieg(h5, "short_circuit_sn", OPCJE_3F_MAX, sc))
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        assert ik[szyna] == pytest.approx(ik3_sn(tor), rel=1e-6)
    rozplyw = _wiersze_szyn(_bieg(h5, "PF", None, sc))
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        assert rozplyw[szyna]["u_pu"] is not None


# ---------------------------------------------------------------------------
# Utrata transformatora jako stan łączeniowy: wyłącznik pola SN (gniazdo „W”, zał. Z.7)
# ---------------------------------------------------------------------------
#
# Iloczyn cech: {sposób utraty: otwarty wyłącznik pola SN, wyłączenie z eksploatacji} ×
# {TR1, TR2} × {ŁS-SN zamknięty, otwarty} × {zwarcie 3F, rozpływ}. Para dowodowa: oba sposoby
# utraty dają TE SAME wyniki strony SN (wyłącznik w torze transformatora jest jedynym
# połączeniem transformatora z szyną sekcji).


def _utrata_tr(r: RefyH5, tr: str, sposob: str, ls_sn: str) -> OperatingScenario:
    stany = {r.lacznik_sn: ls_sn}
    if sposob == "wylacznik":
        stany[getattr(r, f"wylacznik_{tr}")] = "open"
        return _scenariusz(f"utrata-{tr}-wylacznik-{ls_sn}", stany=stany)
    return _scenariusz(f"utrata-{tr}-wylaczenie-{ls_sn}", stany=stany, wylaczone=(getattr(r, tr),))


@pytest.mark.parametrize("tryb", ["hidden", "explicit"])
def test_wylacznik_pola_sn_kazdego_tr_w_gniezdzie_w_i_sekcja_z_jednej_funkcji(tryb: str) -> None:
    """Wyłącznik pola SN każdego transformatora jest gałęzią modelu wskazaną przez gniazdo
    „W” pola transformatorowego SN (skład pola, jedna prawda `primary_devices`), a sekcję,
    którą transformator zasila, wyprowadza jedna funkcja (`sekcje_sn_transformatorow_gpz`) —
    ta sama, którą czyta walidator trybu rezerwy (W063) i przynależność do GPZ (E066)."""
    from enm.sklad_pola import indeks_modelu_pola, sklad_pola

    enm = zbuduj_h5(reserve_mode=tryb)
    rr = refy(enm)
    model = EnergyNetworkModel.model_validate(enm)
    indeks = indeks_modelu_pola(model)
    sekcje = sekcje_sn_transformatorow_gpz(enm)
    rezerwowy = next(s for s in enm["substations"] if s.get("gpz_hv_sections")).get(
        "gpz_reserve_transformer_ref"
    )
    for tr, wylacznik, szyna in (
        (rr.tr1, rr.wylacznik_tr1, rr.szyna_sn_a),
        (rr.tr2, rr.wylacznik_tr2, rr.szyna_sn_b),
    ):
        assert sekcje[tr] == SekcjaSnTransformatoraGpz(szyna, wylacznik)
        assert transformatory_zasilajace_gpz(enm) >= {tr}
        (pole_tr,) = (
            b
            for b in model.bays
            if b.bay_role == "TR" and b.bus_ref == szyna and tr in b.equipment_refs
        )
        assert pole_tr.terminal_bus_ref == _element(enm, "transformers", tr)["lv_bus_ref"]
        assert wylacznik in pole_tr.equipment_refs
        (wiersz_w,) = (w for w in sklad_pola(indeks, pole_tr) if w.gniazdo_ref == "W")
        assert wiersz_w.linked_ref == wylacznik
        galaz = _galaz(enm, wylacznik)
        if tr == rezerwowy:
            assert (galaz["normal_state"], wiersz_w.status) == ("open", "ZAPROJEKTOWANE")
            assert wiersz_w.catalog_ref == galaz["catalog_ref"] is not None
        else:
            # Pozycji wyłącznika transformatora pracującego standard nie wyraża jedną pozycją
            # (prąd wg mocy transformatora, tabele 3/4) — gniazdo czeka na dobór, bieg nie.
            assert galaz["catalog_ref"] is None and galaz["normal_state"] == "closed"
            assert wiersz_w.status == "WYMAGANE_STANDARDEM_BRAK"


def test_dobor_aparatu_wylacznika_pola_sn_tr_z_katalogu_obsadza_gniazdo_w(r: RefyH5) -> None:
    """Pozycję wyłącznika pola SN transformatora pracującego nadaje się na GAŁĘZI modelu
    (`assign_catalog_to_element`) — gniazdo „W” czyta ją przez `linked_ref`."""
    from enm.sklad_pola import indeks_modelu_pola, sklad_pola

    enm = zbuduj_h5()
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="assign_catalog_to_element",
        payload={
            "element_ref": r.wylacznik_tr1,
            "catalog_item_id": "sw-cb-abb-vd4-17kv-630a",
            "catalog_namespace": "APARAT_SN",
        },
    )
    assert wynik.get("error") is None, wynik.get("error")
    po = EnergyNetworkModel.model_validate(wynik["snapshot"])
    (pole_tr,) = (b for b in po.bays if b.bay_role == "TR" and r.wylacznik_tr1 in b.equipment_refs)
    (wiersz_w,) = (w for w in sklad_pola(indeks_modelu_pola(po), pole_tr) if w.gniazdo_ref == "W")
    assert (wiersz_w.status, wiersz_w.catalog_ref) == ("ZAPROJEKTOWANE", "sw-cb-abb-vd4-17kv-630a")


@pytest.mark.parametrize("sposob", ["wylacznik", "wylaczenie"])
@pytest.mark.parametrize(
    ("tr", "tor_pozostaly", "sekcja_tr", "sekcja_pozostala"),
    [("tr1", TOR_L2, "szyna_sn_a", "szyna_sn_b"), ("tr2", TOR_L1, "szyna_sn_b", "szyna_sn_a")],
    ids=["TR1", "TR2"],
)
@pytest.mark.parametrize("ls_sn", ["closed", "open"], ids=["LS-SN-zamkniety", "LS-SN-otwarty"])
def test_utrata_tr_wylacznikiem_albo_wylaczeniem_ta_sama_strona_sn(
    h5: dict[str, Any],
    r: RefyH5,
    sposob: str,
    tr: str,
    tor_pozostaly: tuple[str, str, float, float],
    sekcja_tr: str,
    sekcja_pozostala: str,
    ls_sn: str,
) -> None:
    """SC-03 (utrata TR i zamknięty ŁS-SN): obie sekcje z toru drugiego transformatora;
    przy otwartym ŁS-SN sekcja utraconego transformatora „bez napięcia” — oba sposoby
    utraty (otwarcie wyłącznika pola SN, wyłączenie transformatora z eksploatacji)."""
    sc = _utrata_tr(r, tr, sposob, ls_sn)
    zwarcie = _bieg(h5, "short_circuit_sn", OPCJE_3F_MAX, sc)
    ik = _ikss(zwarcie)
    rozplyw = _wiersze_szyn(_bieg(h5, "PF", None, sc))
    pozostala, utracona = getattr(r, sekcja_pozostala), getattr(r, sekcja_tr)
    assert ik[pozostala] == pytest.approx(ik3_sn(tor_pozostaly), rel=1e-6)
    assert rozplyw[pozostala]["u_pu"] is not None
    if ls_sn == "closed":
        assert ik[utracona] == pytest.approx(ik3_sn(tor_pozostaly), rel=1e-6)
        assert rozplyw[utracona]["u_pu"] is not None
    else:
        assert ik[utracona] is None
        assert _wiersze_zwarcia(zwarcie)[utracona]["flags"] == [ZNACZNIK_SZYNY_BEZ_NAPIECIA]
        assert rozplyw[utracona]["u_pu"] is None
        assert ZNACZNIK_SZYNY_BEZ_NAPIECIA in rozplyw[utracona]["flags"]


@pytest.mark.parametrize("tryb", ["hidden", "explicit"])
def test_wylacznik_pracujacego_tr_normalnie_otwarty_w063_nazywa_sekcje(tryb: str) -> None:
    """Predykaty parami: sekcja zasilana w stanie normalnym = sekcja transformatora
    (`sekcje_sn_transformatorow_gpz`) przez łącznik pola NORMALNIE zamknięty. Wyłącznik
    pola SN transformatora pracującego normalnie otwarty = sekcja bez transformatora pod
    napięciem (W063 z nazwą sekcji); rezerwa jawna — obie sekcje (łącznik szyn SN zamknięty)."""
    enm = copy.deepcopy(zbuduj_h5(reserve_mode=tryb))
    rr = refy(enm)
    galaz = _galaz(enm, rr.wylacznik_tr1)
    galaz["normal_state"] = galaz["status"] = "open"
    (w063,) = (
        i
        for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues
        if i.code == "W063"
    )
    oczekiwane = {rr.szyna_sn_a} if tryb == "hidden" else {rr.szyna_sn_a, rr.szyna_sn_b}
    assert oczekiwane <= set(w063.element_refs)
    assert "nie ma w stanie normalnym transformatora 110/SN pod napięciem" in w063.message_pl


# ---------------------------------------------------------------------------
# SC-04 / SC-05b — odmowa E067 (R6): łącznik łączy niezależne równoważniki
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("lacznik", ["lacznik_wn", "lacznik_sn"], ids=["SC-04", "SC-05b"])
@pytest.mark.parametrize(
    ("analiza", "opcje"),
    [("PF", None), ("short_circuit_sn", OPCJE_3F_MAX), ("short_circuit_sn", OPCJE_1F_MAX)],
    ids=["rozplyw", "zwarcie-3F", "zwarcie-1F"],
)
def test_sc04_sc05b_zamkniety_lacznik_szyn_laczy_niezalezne_rownowazniki_odmowa(
    h5: dict[str, Any], r: RefyH5, lacznik: str, analiza: str, opcje: dict[str, Any] | None
) -> None:
    """Iniekcja „zwarcie sumuje niezależne równoważniki bez odmowy”: bieg przeszedłby —
    test czerwony. Odmowa nazwana z przyczyną: łącznik i oba tory w zdaniu i w elementach."""
    ref = getattr(r, lacznik)
    sc = _scenariusz(f"zamkniety-{lacznik}", stany={ref: "closed"})
    with pytest.raises(OdmowaNazwana) as odmowa:
        create_run(
            case_id="e067",
            klucz_twin=_klucz(h5),
            analysis_type=analiza,
            options=opcje,
            scenariusz=sc,
        )
    assert odmowa.value.kod == "enm.model_nie_przeszedl_walidacji"
    assert "łączy w jedną wyspę niezależne równoważniki sieci" in str(odmowa.value)
    assert {ref, r.zrodlo_l1, r.zrodlo_l2} <= set(odmowa.value.dane["elementy"])
    efektywna = EnergyNetworkModel.model_validate(
        apply_scenario(EnergyNetworkModel.model_validate(h5), sc).snapshot
    )
    zgloszenia = {i.code: i for i in ENMValidator().validate(efektywna).issues}
    assert zgloszenia["E067"].severity == "BLOCKER"
    # Wpis 7 koordynacji (pkt 3): odmowa nazywa przyczynę I akcję — wariant ze wspólnym
    # punktem zasilania (model B) — w zdaniu biegu, w zgłoszeniu i w podpowiedzi naprawy.
    akcja = "zbuduj wariant ze wspólnym punktem zasilania (model B)"
    assert akcja in str(odmowa.value)
    assert akcja in zgloszenia["E067"].message_pl
    assert "wspólnym punktem zasilania (model B)" in (zgloszenia["E067"].suggested_fix or "")
    # Nazwa łącznika w zdaniu z roli: ŁS-110 → „łącznik szyn 110 kV”, ŁS-SN → „łącznik szyn SN”.
    poziom = "110 kV" if lacznik == "lacznik_wn" else "SN"
    assert f"łącznik szyn {poziom}" in zgloszenia["E067"].message_pl


# ---------------------------------------------------------------------------
# SC-07 MAX/MIN
# ---------------------------------------------------------------------------


def test_sc07_max_min_wszystkie_szyny(h5: dict[str, Any], r: RefyH5) -> None:
    for opcje, maks in ((OPCJE_3F_MAX, True), (OPCJE_3F_MIN, False)):
        ik = _ikss(_bieg(h5, "short_circuit_sn", opcje))
        assert ik[r.szyna_wn_1] == pytest.approx(ik3_wn(TOR_L1, maks=maks), rel=1e-6)
        assert ik[r.szyna_wn_2] == pytest.approx(ik3_wn(TOR_L2, maks=maks), rel=1e-6)
        assert ik[r.szyna_sn_a] == pytest.approx(ik3_sn(TOR_L1, maks=maks), rel=1e-6)
        assert ik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2, maks=maks), rel=1e-6)
    assert ik3_sn(TOR_L1, maks=False) < ik3_sn(TOR_L1, maks=True)


# ---------------------------------------------------------------------------
# SC-08 doziemne (R9, ustalenie 5)
# ---------------------------------------------------------------------------


def test_sc08_bez_z0_torow_odmowa_1f() -> None:
    """Ustalenie 5: brak Z0 torów 110 kV = jawny brak — odmowa z kodem, nie wartość."""
    bez_z0 = zbuduj_h5(z0=False)
    for zrodlo in bez_z0["sources"]:
        assert zrodlo.get("z0_z1_ratio") is None
    with pytest.raises(OdmowaNazwana) as odmowa:
        create_run(
            case_id="sc08",
            klucz_twin=_klucz(bez_z0),
            analysis_type="short_circuit_sn",
            options=OPCJE_1F_MAX,
        )
    assert odmowa.value.kod == "sc.model_bez_skladowej_zerowej"


def test_sc08_z_z0_szyny_110_liczone_szyny_sn_bez_drogi_zerowej(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Z Z0 torów: 1F na szynach 110 kV liczone (MAX i MIN); szyny SN — odmowa PER WĘZEŁ
    (Yd11 bez punktu neutralnego, zespół uziemiający bez elementu — ENEA §16). Dawniej
    bocznik 1e6 pu uziemiał każdy węzeł bez drogi zerowej i dawał I″k1 = 1,5·I″k3."""
    for opcje, maks in ((OPCJE_1F_MAX, True), (OPCJE_1F_MIN, False)):
        run = _bieg(h5, "short_circuit_sn", opcje)
        ik = _ikss(run)
        przyczyny = _przyczyny(run)
        assert ik[r.szyna_wn_1] == pytest.approx(ik1_wn(TOR_L1, maks=maks), rel=1e-6)
        assert ik[r.szyna_wn_2] == pytest.approx(ik1_wn(TOR_L2, maks=maks), rel=1e-6)
        for szyna in (r.szyna_sn_a, r.szyna_sn_b):
            assert ik[szyna] is None
            assert przyczyny[szyna] == POWOD_WEZEL_BEZ_DROGI_ZEROWEJ
        wiersze = _wiersze_zwarcia(run)
        # Węzeł bez drogi zerowej MA napięcie — nie jest „bez napięcia”; karta
        # GPZ-H5-APARATURA (zmiana kanonu): wiersz niesie znacznik przyczyny braku liczby.
        for szyna in (r.szyna_sn_a, r.szyna_sn_b):
            assert wiersze[szyna]["flags"] == [ZNACZNIK_BEZ_DROGI_ZEROWEJ]
            assert ZNACZNIK_SZYNY_BEZ_NAPIECIA not in wiersze[szyna]["flags"]


# ---------------------------------------------------------------------------
# Role łączników × stany (jedno źródło prawdy) i E067 parami
# ---------------------------------------------------------------------------


def _h5_jawna() -> dict[str, Any]:
    return zbuduj_h5(reserve_mode="explicit")


def _wylacznik_rezerwy(enm: dict[str, Any]) -> str:
    (stacja,) = (s for s in enm["substations"] if s.get("gpz_hv_sections"))
    rezerwowy = _element(enm, "transformers", stacja["gpz_reserve_transformer_ref"])
    szyny_sn = {s["bus_ref"] for s in stacja["gpz_sections"]}
    (ref,) = (
        g["ref_id"]
        for g in enm["branches"]
        if g["type"] in {"breaker", "switch", "bus_coupler", "disconnector", "load_switch"}
        and rezerwowy["lv_bus_ref"] in (g["from_bus_ref"], g["to_bus_ref"])
        and {g["from_bus_ref"], g["to_bus_ref"]} & szyny_sn
    )
    return ref


def test_role_lacznikow_h5_niezalezne_od_polozenia(r: RefyH5, h5: dict[str, Any]) -> None:
    """Rola z `role_lacznikow` (walidator E067/W064, scenariusze, API) × KAŻDY stan
    łączników: zamknięcie w scenariuszu nie zmienia, czym łącznik jest."""
    jawna = _h5_jawna()
    rj = refy(jawna)
    assert _wylacznik_rezerwy(jawna) == rj.wylacznik_tr2
    # Wyłącznik pola SN KAŻDEGO transformatora (pracującego i rezerwowego) ma rolę łącznika
    # pola transformatorowego w obu trybach rezerwy.
    oczekiwane = {
        tryb: (
            enm,
            {
                rr.lacznik_wn: ROLA_LACZNIK_SZYN_WN,
                rr.lacznik_sn: ROLA_LACZNIK_SZYN_SN,
                rr.wylacznik_tr1: ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
                rr.wylacznik_tr2: ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
            },
        )
        for tryb, enm, rr in (("ukryta", h5, r), ("jawna", jawna, rj))
    }
    for _tryb, (enm, role_oczekiwane) in oczekiwane.items():
        model = EnergyNetworkModel.model_validate(enm)
        laczniki = sorted(role_oczekiwane)
        for maska in range(2 ** len(laczniki)):
            stany = {
                ref: ("closed" if maska >> i & 1 else "open") for i, ref in enumerate(laczniki)
            }
            efektywna = apply_scenario(model, _scenariusz(f"maska-{maska}", stany=stany))
            role = role_lacznikow(efektywna.snapshot)
            assert {ref: role.get(ref) for ref in laczniki} == role_oczekiwane, stany


def _e067(enm: dict[str, Any], stany: dict[str, str], wylaczone: tuple[str, ...] = ()) -> bool:
    model = EnergyNetworkModel.model_validate(enm)
    efektywna = apply_scenario(model, _scenariusz("e067", stany=stany, wylaczone=wylaczone))
    polaczenia = polaczenia_niezaleznych_zrodel(efektywna.snapshot)
    kody = {
        i.code
        for i in ENMValidator()
        .validate(EnergyNetworkModel.model_validate(efektywna.snapshot))
        .issues
    }
    # Predykaty parami: E067 walidatora i funkcja topologii — jedno źródło prawdy.
    assert bool(polaczenia) == ("E067" in kody)
    return bool(polaczenia)


@pytest.mark.parametrize("wn", ["open", "closed"])
@pytest.mark.parametrize("sn", ["open", "closed"])
@pytest.mark.parametrize("w_tr1", ["open", "closed"], ids=["W-TR1-otwarty", "W-TR1-zamkniety"])
@pytest.mark.parametrize("bez_l1", [False, True], ids=["oba-tory", "bez-L1"])
def test_e067_iloczyn_stanow_lacznikow_i_zrodel_ukryta(
    h5: dict[str, Any], r: RefyH5, wn: str, sn: str, w_tr1: str, bez_l1: bool
) -> None:
    """E067 ⇔ (oba tory w ruchu) ∧ (ŁS-110 zamknięty ∨ (ŁS-SN zamknięty ∧ wyłącznik pola
    SN TR1 zamknięty)) — otwarty wyłącznik TR1 odcina tor L1 od szyn SN."""
    wylaczone = (r.zrodlo_l1,) if bez_l1 else ()
    oczekiwane = not bez_l1 and (wn == "closed" or (sn == "closed" and w_tr1 == "closed"))
    stany = {r.lacznik_wn: wn, r.lacznik_sn: sn, r.wylacznik_tr1: w_tr1}
    assert _e067(h5, stany, wylaczone) is oczekiwane


@pytest.mark.parametrize("wylacznik_stan", ["open", "closed"])
@pytest.mark.parametrize("sn", ["open", "closed"])
@pytest.mark.parametrize("bez_tr1", [False, True], ids=["oba-TR", "bez-TR1"])
def test_e067_iloczyn_rezerwa_jawna(wylacznik_stan: str, sn: str, bez_tr1: bool) -> None:
    """Rezerwa jawna: ŁS-SN normalnie zamknięty, TR2 rezerwowy z wyłącznikiem pola SN
    normalnie otwartym. E067 ⇔ TR1 w ruchu ∧ ŁS-SN zamknięty ∧ wyłącznik TR2 zamknięty."""
    jawna = _h5_jawna()
    rj = refy(jawna)
    wylacznik = _wylacznik_rezerwy(jawna)
    assert (
        _galaz(jawna, rj.lacznik_sn)["normal_state"],
        _galaz(jawna, wylacznik)["normal_state"],
    ) == (
        "closed",
        "open",
    )
    wylaczone = (rj.tr1,) if bez_tr1 else ()
    oczekiwane = not bez_tr1 and sn == "closed" and wylacznik_stan == "closed"
    stany = {rj.lacznik_sn: sn, wylacznik: wylacznik_stan}
    assert _e067(jawna, stany, wylaczone) is oczekiwane


@pytest.mark.parametrize("reserve_mode", ["hidden", "explicit"])
@pytest.mark.parametrize("transformator", ["tr1", "tr2"])
def test_transformator_h5_jest_granica_zasilania_nie_transformatorem_blokowym(
    reserve_mode: str, transformator: str
) -> None:
    """Iloczyn {rezerwa ukryta, jawna} × {TR1, TR2}: każdy transformator 110/SN GPZ H5 —
    także rezerwowy rezerwy jawnej, którego strona dolna to zacisk przed otwartym
    wyłącznikiem pola SN, nie szyna sekcji — jest transformatorem zasilającym GPZ
    (`transformatory_zasilajace_gpz`, jedno źródło predykatu walidatora E066 i operacji
    źródła przekształtnikowego) i operacja odmawia wskazania go jako transformatora
    blokowego."""
    enm = zbuduj_h5(reserve_mode=reserve_mode, odbiory=False)
    r = refy(enm)
    ref = getattr(r, transformator)
    assert ref in transformatory_zasilajace_gpz(enm)
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="add_converter_source",
        payload={
            "source_technology": "BESS",
            "connection_variant": "block_transformer",
            "catalog_ref": "conv-bess-1mw-2mwh-15kv",
            "station_ref": r.stacja,
            "blocking_transformer_ref": ref,
        },
    )
    assert wynik.get("error_code") == "generator.block_transformer_invalid", wynik
    assert "granicą zasilania sieci" in str(wynik.get("error"))


@pytest.mark.parametrize("reserve_mode", ["hidden", "explicit"])
def test_pierwszy_odcinek_bez_wskazania_wychodzi_z_pola_liniowego_sn(reserve_mode: str) -> None:
    """Predykaty parami: pole startu pustej magistrali (zacisk `trunk_out` widoków
    logicznych) i pole, z którego `continue_trunk_segment_sn` BEZ wskazania wyprowadza
    pierwszy odcinek, to TO SAMO wolne pole liniowe SN — nigdy pole liniowe 110 kV ani
    transformatorowe, choć równoważniki H5 stoją na szynach 110 kV (dawniej wybór startu
    dopuszczał rolę IN i operacja odmawiała `trunk.source_field_not_line_bay`)."""
    enm = zbuduj_h5(reserve_mode=reserve_mode, odbiory=False)
    r = refy(enm)
    widoki = execute_domain_operation(enm_dict=enm, op_name="refresh_snapshot", payload={})
    (zacisk,) = (
        t
        for magistrala in widoki["logical_views"]["trunks"]
        for t in magistrala["terminals"]
        if t["port_id"] == "trunk_out"
    )
    pole = _element(enm, "bays", zacisk["element_id"])
    assert pole["bay_role"] in {"OUT", "FEEDER"}
    assert zacisk["bus_ref"] == pole["bus_ref"] in {r.szyna_sn_a, r.szyna_sn_b}
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="continue_trunk_segment_sn",
        payload={"segment": {"rodzaj": "KABEL", "dlugosc_m": 300, "catalog_ref": KABEL_SN}},
    )
    assert wynik.get("error") is None, (wynik.get("error_code"), wynik.get("error"))
    (kabel,) = (g for g in wynik["snapshot"]["branches"] if g.get("type") == "cable")
    assert kabel["from_bus_ref"] == punkt_przylaczenia_pola(pole)


def test_rezerwa_jawna_stan_normalny_tr1_zasila_obie_sekcje() -> None:
    jawna = _h5_jawna()
    rj = refy(jawna)
    ik = _ikss(_bieg(jawna, "short_circuit_sn", OPCJE_3F_MAX))
    for szyna in (rj.szyna_sn_a, rj.szyna_sn_b):
        assert ik[szyna] == pytest.approx(ik3_sn(TOR_L1), rel=1e-6)
    # SZR jawny: utrata TR1, zamknięcie wyłącznika TR2 — obie sekcje z L2.
    sc = _scenariusz("szr-jawny", stany={_wylacznik_rezerwy(jawna): "closed"}, wylaczone=(rj.tr1,))
    ik = _ikss(_bieg(jawna, "short_circuit_sn", OPCJE_3F_MAX, sc))
    for szyna in (rj.szyna_sn_a, rj.szyna_sn_b):
        assert ik[szyna] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)


def test_punkt_podzialu_poza_h5_rola_z_tej_samej_funkcji() -> None:
    """PUNKT_PODZIALU (łącznik poza szynami sekcji, normalnie otwarty) — układ H5 go nie
    ma; rola wyprowadzona tą samą funkcją dla pierścienia z punktem normalnie otwartym."""
    from tests.enm.siec_lacznikowa import pierscien_z_nop

    siec = pierscien_z_nop()
    role = role_lacznikow(siec.enm)
    nop = [ref for ref, rola in role.items() if rola == ROLA_PUNKT_PODZIALU]
    assert nop == [
        g["ref_id"]
        for g in sorted(siec.enm["branches"], key=lambda g: g["ref_id"])
        if g.get("normal_state") == "open"
    ]
    assert not polaczenia_niezaleznych_zrodel(siec.enm)


# ---------------------------------------------------------------------------
# Tryb rezerwy (ustalenie 3): W063, W064
# ---------------------------------------------------------------------------


def _kody(enm: dict[str, Any]) -> set[str]:
    return {i.code for i in ENMValidator().validate(EnergyNetworkModel.model_validate(enm)).issues}


@pytest.mark.parametrize("tryb", ["hidden", "explicit"])
def test_tryb_rezerwy_zgodny_bez_w063(tryb: str) -> None:
    enm = zbuduj_h5(reserve_mode=tryb)
    (stacja,) = (s for s in enm["substations"] if s.get("gpz_hv_sections"))
    assert stacja["gpz_reserve_mode"] == tryb
    assert "W063" not in _kody(enm)
    assert "E067" not in _kody(enm)


@pytest.mark.parametrize("tryb", ["hidden", "explicit"])
def test_stan_normalny_ls_sn_niezgodny_z_trybem_w063(tryb: str) -> None:
    enm = copy.deepcopy(zbuduj_h5(reserve_mode=tryb))
    lacznik = _galaz(enm, refy(enm).lacznik_sn)
    lacznik["normal_state"] = "closed" if tryb == "hidden" else "open"
    lacznik["status"] = lacznik["normal_state"]
    assert "W063" in _kody(enm)


def test_brak_trybu_rezerwy_odmowa_operacji() -> None:
    ladunek = ladunek_h5()
    del ladunek["reserve_mode"]
    wynik = execute_domain_operation(
        enm_dict=pusty_model(), op_name="add_grid_source_sn", payload=ladunek
    )
    assert wynik.get("error") is not None


@pytest.mark.parametrize("generacja", [False, True], ids=["bez-generacji", "z-generacja"])
@pytest.mark.parametrize("sn", ["open", "closed"])
def test_w064_szr_sn_przy_generacji(r: RefyH5, generacja: bool, sn: str) -> None:
    """Ustalenie 3 (§26.10.4): ŁS-SN zamknięty wbrew stanowi normalnemu (SZR SN, rezerwa
    ukryta, przy jednym TR w ruchu — inaczej E067) × źródło wytwórcze na sekcji → W064."""
    enm = copy.deepcopy(zbuduj_h5())
    rr = refy(enm)
    if generacja:
        enm["generators"].append(
            {
                "ref_id": "gen-pv-sekcja-b",
                "name": "Farma PV sekcji B",
                "bus_ref": rr.szyna_sn_b,
                "p_mw": 2.0,
                "gen_type": "pv_inverter",
            }
        )
    sc = _scenariusz("szr-sn", stany={rr.lacznik_sn: sn}, wylaczone=(rr.tr1,))
    efektywna = apply_scenario(EnergyNetworkModel.model_validate(enm), sc)
    kody = _kody(efektywna.snapshot)
    assert ("W064" in kody) is (generacja and sn == "closed")


# ---------------------------------------------------------------------------
# Kasowanie elementów H5 × obie drogi kasowania (klasa: TR, źródło, szyna, łącznik)
# ---------------------------------------------------------------------------


def _usun_operacja_domenowa(enm: dict[str, Any], ref: str, _rodzaj: str) -> dict[str, Any]:
    wynik = execute_domain_operation(
        enm_dict=enm, op_name="delete_element", payload={"element_ref": ref}
    )
    assert wynik.get("error") is None, wynik.get("error")
    return dict(wynik["snapshot"])


def _usun_operacja_topologiczna(enm: dict[str, Any], ref: str, rodzaj: str) -> dict[str, Any]:
    kopia = copy.deepcopy(enm)
    if rodzaj == "szyna":
        wynik = usun_wezel(kopia, ref)
    elif rodzaj == "lacznik":
        wynik = usun_galaz(kopia, ref)
    else:
        wynik = usun_urzadzenie(kopia, {"tr": "transformer", "zrodlo": "source"}[rodzaj], ref)
    assert wynik.success, [i.message_pl for i in wynik.issues]
    return dict(wynik.enm)


def _odwolania_stacji(stacja: dict[str, Any]) -> set[str]:
    refy_stacji = {*stacja.get("bus_refs", []), *stacja.get("transformer_refs", [])}
    for klucz in ("gpz_sections", "gpz_hv_sections"):
        for sekcja in stacja.get(klucz) or []:
            refy_stacji.update(
                v
                for k in ("bus_ref", "incoming_source_ref", "left_coupler_ref", "right_coupler_ref")
                if (v := sekcja.get(k))
            )
    if stacja.get("gpz_reserve_transformer_ref"):
        refy_stacji.add(stacja["gpz_reserve_transformer_ref"])
    return refy_stacji


@pytest.mark.parametrize(
    "droga",
    [_usun_operacja_domenowa, _usun_operacja_topologiczna],
    ids=["delete_element", "enm-ops"],
)
@pytest.mark.parametrize(
    ("element", "rodzaj"),
    [("tr2", "tr"), ("zrodlo_l2", "zrodlo"), ("lacznik_wn", "lacznik"), ("lacznik_sn", "lacznik")],
)
def test_kasowanie_elementu_h5_zostawia_stacje_i_czysci_odwolania(
    h5: dict[str, Any], r: RefyH5, droga: Any, element: str, rodzaj: str
) -> None:
    """Usunięcie TR, źródła toru albo łącznika szyn NIE usuwa stacji (kontener) ani jej
    sekcji i pól; odwołania do usuniętego znikają; struktura niekompletna = W063 (nie
    BLOCKER) — model zostaje policzalny."""
    ref = getattr(r, element)
    po = droga(h5, ref, rodzaj)
    stacja = _element(po, "substations", r.stacja)
    assert ref not in _odwolania_stacji(stacja)
    istniejace = {
        e["ref_id"] for k in ("buses", "branches", "transformers", "sources") for e in po[k]
    }
    assert _odwolania_stacji(stacja) <= istniejace
    assert len(stacja["gpz_sections"]) == 2 and len(stacja["gpz_hv_sections"]) == 2
    pola_przed = {p["ref_id"] for p in h5["bays"] if p.get("substation_ref") == r.stacja}
    pola_po = {p["ref_id"] for p in po["bays"] if p.get("substation_ref") == r.stacja}
    assert pola_po == pola_przed
    for pole in po["bays"]:
        assert ref not in (pole.get("equipment_refs") or [])
    kody = _kody(po)
    assert "W063" in kody
    assert not {k for k in kody if k.startswith("E")} - {"E065"}, kody


@pytest.mark.parametrize(
    "droga",
    [_usun_operacja_domenowa, _usun_operacja_topologiczna],
    ids=["delete_element", "enm-ops"],
)
def test_kasowanie_szyny_sekcji_wn_zostawia_stacje(
    h5: dict[str, Any], r: RefyH5, droga: Any
) -> None:
    """Szyna sekcji 110 kV 2 razem z elementami na niej (łącznik pola L2 z zaciskiem i źródłem
    L2, TR2, ŁS-110): sekcja znika z rejestru, stacja i sekcje SN zostają. Droga topologiczna
    usuwa szynę dopiero po usunięciu przyłączonych elementów (prymityw odmawia szyny
    w użyciu)."""
    enm = h5
    if droga is _usun_operacja_topologiczna:
        enm = droga(enm, r.zrodlo_l2, "zrodlo")
        enm = droga(enm, r.wylacznik_l2, "lacznik")
        enm = droga(enm, r.zacisk_l2, "szyna")
        enm = droga(enm, r.tr2, "tr")
        enm = droga(enm, r.lacznik_wn, "lacznik")
    po = droga(enm, r.szyna_wn_2, "szyna")
    stacja = _element(po, "substations", r.stacja)
    assert [s["bus_ref"] for s in stacja["gpz_hv_sections"]] == [r.szyna_wn_1]
    assert len(stacja["gpz_sections"]) == 2
    assert r.szyna_wn_2 not in stacja["bus_refs"]
    istniejace = {
        e["ref_id"] for k in ("buses", "branches", "transformers", "sources") for e in po[k]
    }
    assert _odwolania_stacji(stacja) <= istniejace


# ---------------------------------------------------------------------------
# HTTP: gotowość czyta migawkę scenariusza; bieg ze scenariuszem
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> Any:
    pytest.importorskip("sqlalchemy")
    from api.main import app
    from fastapi.testclient import TestClient

    from tests.test_dynamika_rms_run import _reset_backend_state

    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _przypadek_h5(client: Any, enm: dict[str, Any]) -> str:
    from application.twin_key import klucz_twin_dla_przypadku

    from tests.test_dynamika_rms_run import _nowy_przypadek

    case_id = _nowy_przypadek(client)
    set_enm(
        klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory),
        EnergyNetworkModel.model_validate(enm),
    )
    return case_id


def _zapisz_scenariusz_http(
    client: Any,
    case_id: str,
    nazwa: str,
    stany: dict[str, str],
    wylaczone: list[str] | None = None,
) -> str:
    zadanie: dict[str, Any] = {"name": nazwa, "switch_states": stany}
    if wylaczone is not None:
        zadanie["out_of_service"] = wylaczone
    odpowiedz = client.post(f"/api/scenariusze-laczeniowe/study-cases/{case_id}", json=zadanie)
    assert odpowiedz.status_code == 201, odpowiedz.text
    return str(odpowiedz.json()["scenario_id"])


def _bieg_zwarcia_http(client: Any, case_id: str, scenario_id: str) -> CanonicalRun:
    from enm.canonical_analysis import get_run

    from tests.utils.biegi import wykonaj_bieg

    bieg = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}, "scenario_id": scenario_id},
    )
    assert bieg.status_code == 201, bieg.text
    koniec = wykonaj_bieg(client, bieg.json()["id"])
    assert koniec.json()["status"] == "DONE", koniec.json()
    assert koniec.json()["scenario_ref"]["scenario_id"] == scenario_id
    run = get_run(UUID(bieg.json()["id"]))
    assert run is not None
    return run


@pytest.mark.parametrize(
    "wariant",
    ["SC-02-utrata-L1", "SC-03-wylacznik-TR1", "SC-03-wylaczenie-TR1"],
)
def test_sc02_sc03_z_interfejsu_scenariusz_http_i_bieg(
    client: Any, h5: dict[str, Any], r: RefyH5, wariant: str
) -> None:
    """SC-02 i SC-03 osiągalne torem użytkownika: zapis scenariusza końcówką scenariuszy
    łączeniowych (wyłączenie z eksploatacji albo stan wyłącznika pola SN) → bieg zwarcia ze
    `scenario_id` → wiersze wyniku. Model bazowy bez zmian."""
    case_id = _przypadek_h5(client, h5)
    if wariant == "SC-02-utrata-L1":
        scenario_id = _zapisz_scenariusz_http(client, case_id, "Utrata L1", {}, [r.zrodlo_l1])
    elif wariant == "SC-03-wylacznik-TR1":
        scenario_id = _zapisz_scenariusz_http(
            client,
            case_id,
            "Utrata TR1 — wyłącznik pola SN otwarty, SZR SN",
            {r.wylacznik_tr1: "open", r.lacznik_sn: "closed"},
        )
    else:
        scenario_id = _zapisz_scenariusz_http(
            client, case_id, "Utrata TR1, SZR SN", {r.lacznik_sn: "closed"}, [r.tr1]
        )
    run = _bieg_zwarcia_http(client, case_id, scenario_id)
    ik = _ikss(run)
    wiersze = _wiersze_zwarcia(run)
    if wariant == "SC-02-utrata-L1":
        assert ik[r.szyna_sn_a] is None
        assert wiersze[r.szyna_sn_a]["flags"] == [ZNACZNIK_SZYNY_BEZ_NAPIECIA]
        assert ik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)
    else:
        for szyna in (r.szyna_sn_a, r.szyna_sn_b):
            assert ik[szyna] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)
            assert wiersze[szyna]["flags"] == []
    model = client.get(f"/api/cases/{case_id}/enm").json()
    assert {z["ref_id"] for z in model["sources"]} == {r.zrodlo_l1, r.zrodlo_l2}
    assert {t["ref_id"] for t in model["transformers"]} == {r.tr1, r.tr2}
    assert _galaz(model, r.wylacznik_tr1)["status"] == "closed"


@pytest.mark.parametrize(
    "koncowka", ["enm/readiness", "engineering-readiness", "analysis-eligibility"]
)
def test_gotowosc_http_czyta_migawke_scenariusza(
    client: Any, h5: dict[str, Any], r: RefyH5, koncowka: str
) -> None:
    """Bramka gotowości ze `scenario_id` = migawka efektywna (ta, którą policzy bieg):
    model bazowy bez E067, scenariusz z zamkniętym ŁS-110 — E067."""
    case_id = _przypadek_h5(client, h5)
    scenario_id = _zapisz_scenariusz_http(
        client, case_id, "ŁS-110 zamknięty", {r.lacznik_wn: "closed"}
    )
    bazowa = client.get(f"/api/cases/{case_id}/{koncowka}")
    ze_scenariuszem = client.get(f"/api/cases/{case_id}/{koncowka}?scenario_id={scenario_id}")
    assert bazowa.status_code == 200, bazowa.text
    assert ze_scenariuszem.status_code == 200, ze_scenariuszem.text
    # Przyczyna (zdanie E067), nie sam status — także w macierzy zdolności (ELIG_NOT_READY).
    przyczyna = "łączy w jedną wyspę niezależne równoważniki sieci"
    assert przyczyna not in bazowa.text
    assert przyczyna in ze_scenariuszem.text
    if koncowka != "analysis-eligibility":
        assert "E067" not in bazowa.text and "E067" in ze_scenariuszem.text
    else:
        statusy = {m["analysis_type"]: m["status"] for m in ze_scenariuszem.json()["matrix"]}
        assert statusy["LOAD_FLOW"] == statusy["SC_3F"] == "INELIGIBLE"
        statusy_bazowe = {m["analysis_type"]: m["status"] for m in bazowa.json()["matrix"]}
        assert statusy_bazowe["LOAD_FLOW"] == statusy_bazowe["SC_3F"] == "ELIGIBLE"
    if koncowka != "analysis-eligibility":
        assert ze_scenariuszem.json()["scenario"]["scenario_id"] == scenario_id
    if koncowka == "enm/readiness":
        assert bazowa.json()["analysis_readiness"]["load_flow"] is True
        gotowosc = ze_scenariuszem.json()["analysis_readiness"]
        assert gotowosc["load_flow"] is False and gotowosc["short_circuit_3f"] is False
    brak = client.get(f"/api/cases/{case_id}/{koncowka}?scenario_id=brak-scenariusza")
    assert brak.status_code == 404


def test_bieg_http_ze_scenariuszem_liczy_migawke_i_odmawia_e067(
    client: Any, h5: dict[str, Any], r: RefyH5
) -> None:
    """Iniekcja „bieg na modelu bazowym”: scenariusz rezerwy SN (TR2 wyłączony przez
    otwarcie — tu: zamknięty ŁS-SN przy obu TR) dałby wynik zamiast odmowy — test czerwony."""
    from enm.canonical_analysis import get_run

    from tests.utils.biegi import wykonaj_bieg

    case_id = _przypadek_h5(client, h5)
    zamkniety_sn = _zapisz_scenariusz_http(
        client, case_id, "ŁS-SN zamknięty", {r.lacznik_sn: "closed"}
    )
    bieg = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}, "scenario_id": zamkniety_sn},
    )
    assert bieg.status_code == 409, bieg.text
    assert bieg.json()["kod"] == "enm.model_nie_przeszedl_walidacji"

    bazowy = client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "SC_3F", "solver_input": {}},
    )
    assert bazowy.status_code == 201, bazowy.text
    koniec = wykonaj_bieg(client, bazowy.json()["id"])
    assert koniec.json()["status"] == "DONE", koniec.json()
    run = get_run(UUID(bazowy.json()["id"]))
    assert run is not None
    ik = _ikss(run)
    assert ik[r.szyna_sn_a] == pytest.approx(ik3_sn(TOR_L1), rel=1e-6)
    assert ik[r.szyna_sn_b] == pytest.approx(ik3_sn(TOR_L2), rel=1e-6)


# ---------------------------------------------------------------------------
# Szablony H5 (110/15 i 110/20 kV) — wzorzec podstawowy
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("tpl_id", "un_sn_kv"),
    [("tpl_gpz_h5_110_15_2x25mva", 15.0), ("tpl_gpz_h5_110_20_2x25mva", 20.0)],
)
def test_szablon_h5_buduje_jawna_strukture_z_danych_projektu(tpl_id: str, un_sn_kv: float) -> None:
    from application.station_templates import get_template
    from application.station_templates.apply import apply_template_to_case
    from enm.store import get_enm

    szablon = get_template(tpl_id)
    assert szablon is not None
    klucz = _klucz(pusty_model())
    wynik = apply_template_to_case(
        template=szablon,
        klucz_twin=klucz,
        target_segment_id=None,
        params_override={
            "hv_sections": ladunek_h5()["hv_sections"],
            "hv_coupler": {"normal_state": "open"},
            "reserve_mode": "hidden",
            # Dane projektu z formularza szablonu (wartości listy wyboru są napisami).
            "line_fields_per_section": "2",
            "earthing_bay_template": "ENEA_SN_ZU_DLAWIK",
        },
    )
    enm = get_enm(klucz).model_dump(mode="json")
    rr = refy(enm)
    stacja = _element(enm, "substations", wynik["station_ref"])
    assert stacja["gpz_reserve_mode"] == "hidden"
    assert _element(enm, "transformers", rr.tr1)["hv_bus_ref"] == rr.szyna_wn_1
    assert _element(enm, "transformers", rr.tr2)["hv_bus_ref"] == rr.szyna_wn_2
    assert {
        b["voltage_kv"] for b in enm["buses"] if b["ref_id"] in {rr.szyna_sn_a, rr.szyna_sn_b}
    } == {un_sn_kv}
    assert (
        _galaz(enm, rr.lacznik_wn)["normal_state"],
        _galaz(enm, rr.lacznik_sn)["normal_state"],
    ) == (
        "open",
        "open",
    )
    kody = _kody(enm)
    assert not kody & {"E067", "W063"}
    # Dane projektu z formularza: dwa pola liniowe na sekcję SN, wariant pola ZU z dławikiem.
    for szyna in (rr.szyna_sn_a, rr.szyna_sn_b):
        pola_sekcji = [p for p in enm["bays"] if p.get("bus_ref") == szyna]
        assert [p["szablon_standardu_ref"] for p in pola_sekcji if p["bay_role"] == "OUT"] == [
            "ENEA_SN_LINIA",
            "ENEA_SN_LINIA",
        ]
        assert [p["szablon_standardu_ref"] for p in pola_sekcji if p["bay_role"] == "EARTHING"] == [
            "ENEA_SN_ZU_DLAWIK"
        ]
    # Bez trybu rezerwy szablon nie zgaduje — odmowa operacji.
    from application.station_templates.apply import TemplateApplyError

    with pytest.raises(TemplateApplyError):
        apply_template_to_case(
            template=szablon,
            klucz_twin=_klucz(pusty_model()),
            target_segment_id=None,
            params_override={
                "hv_sections": ladunek_h5()["hv_sections"],
                "hv_coupler": {"normal_state": "open"},
                "line_fields_per_section": "2",
                "earthing_bay_template": "ENEA_SN_ZU_DLAWIK",
            },
        )
    # Bez liczby pól liniowych (dana projektu, zał. Z.2) i bez wariantu pola ZU (§16) —
    # odmowa operacji przekazana przez szablon, nie wartość domyślna.
    for brak, kod in (
        ("line_fields_per_section", "source.gpz_line_fields_required"),
        ("earthing_bay_template", "source.gpz_bay_standard_invalid"),
    ):
        dane = {
            "hv_sections": ladunek_h5()["hv_sections"],
            "hv_coupler": {"normal_state": "open"},
            "reserve_mode": "hidden",
            "line_fields_per_section": "2",
            "earthing_bay_template": "ENEA_SN_ZU_DLAWIK",
        }
        del dane[brak]
        with pytest.raises(TemplateApplyError) as blad:
            apply_template_to_case(
                template=szablon,
                klucz_twin=_klucz(pusty_model()),
                target_segment_id=None,
                params_override=dane,
            )
        assert blad.value.code == kod, (brak, blad.value.message_pl)


#: Wpis 7 koordynacji pkt 6: stany normalne łączników H5 są polami wejścia z podpowiedzią
#: i podstawą. Iloczyn: dana {stan ŁS-110, tryb rezerwy (→ stan ŁS-SN)} × droga {szablon H5
#: 15 kV, szablon H5 20 kV, operacja domenowa} × {brak danej → odmowa z podpowiedzią
#: i podstawą, dana podana → przekazana bez zmiany}.
_DANE_STANOW_H5 = {
    "hv_coupler.normal_state": (
        "hv_coupler",
        "source.gpz_coupler_state_required",
        {"open", "closed"},
    ),
    "reserve_mode": ("reserve_mode", "source.gpz_reserve_mode_required", {"hidden", "explicit"}),
}
_SZABLONY_H5 = ("tpl_gpz_h5_110_15_2x25mva", "tpl_gpz_h5_110_20_2x25mva")


def _podpowiedz_i_podstawa(klucz: str) -> tuple[str, str]:
    from enm.rezerwa_gpz import (
        PODPOWIEDZ_STANU_LACZNIKA_SZYN_WN_PL,
        PODPOWIEDZ_TRYBU_REZERWY_PL,
        PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL,
        PODSTAWA_TRYBU_REZERWY_PL,
    )

    if klucz == "reserve_mode":
        return PODPOWIEDZ_TRYBU_REZERWY_PL, PODSTAWA_TRYBU_REZERWY_PL
    return PODPOWIEDZ_STANU_LACZNIKA_SZYN_WN_PL, PODSTAWA_STANU_LACZNIKA_SZYN_WN_PL


@pytest.mark.parametrize("tpl_id", _SZABLONY_H5)
@pytest.mark.parametrize("klucz", sorted(_DANE_STANOW_H5))
def test_stan_lacznika_h5_pole_wejscia_z_podpowiedzia_i_podstawa(tpl_id: str, klucz: str) -> None:
    from application.station_templates import get_template
    from enm.slownik_komunikatow import pole

    szablon = get_template(tpl_id)
    assert szablon is not None
    podpowiedz, podstawa = _podpowiedz_i_podstawa(klucz)
    _klucz_ladunku, _kod, wartosci = _DANE_STANOW_H5[klucz]
    dane = {d.klucz: d for d in szablon.schema.dane_projektu}
    assert klucz in dane
    dana = dane[klucz]
    assert (dana.podpowiedz_pl, dana.podstawa_pl) == (podpowiedz, podstawa)
    assert {w for w, _n in dana.wartosci} == wartosci
    assert dana.label_pl == pole(klucz, "add_grid_source_sn")
    # Kontrakt dla formularza: wartości z nazwą, bez wartości domyślnej.
    wpis = next(d for d in szablon.to_dict()["schema"]["dane_projektu"] if d["klucz"] == klucz)
    assert "default" not in wpis
    assert {w["wartosc"] for w in wpis["wartosci"]} == wartosci
    assert (wpis["podpowiedz_pl"], wpis["podstawa_pl"]) == (podpowiedz, podstawa)


@pytest.mark.parametrize("droga", [*_SZABLONY_H5, "operacja"])
@pytest.mark.parametrize("klucz", sorted(_DANE_STANOW_H5))
def test_brak_stanu_lacznika_h5_odmowa_z_podpowiedzia_i_podstawa(droga: str, klucz: str) -> None:
    from application.station_templates import get_template
    from application.station_templates.apply import TemplateApplyError, apply_template_to_case
    from enm.slownik_komunikatow import pole

    klucz_ladunku, kod, _wartosci = _DANE_STANOW_H5[klucz]
    podpowiedz, podstawa = _podpowiedz_i_podstawa(klucz)
    if droga == "operacja":
        ladunek = ladunek_h5()
        del ladunek[klucz_ladunku]
        wynik = execute_domain_operation(
            enm_dict=pusty_model(), op_name="add_grid_source_sn", payload=ladunek
        )
        kod_odmowy, tresc = wynik["error_code"], wynik["error"]
    else:
        szablon = get_template(droga)
        assert szablon is not None
        dane = {
            "hv_sections": ladunek_h5()["hv_sections"],
            "hv_coupler": {"normal_state": "open"},
            "reserve_mode": "hidden",
            "line_fields_per_section": "1",
            "earthing_bay_template": "ENEA_SN_ZU_REZYSTOR",
        }
        del dane[klucz_ladunku]
        with pytest.raises(TemplateApplyError) as blad:
            apply_template_to_case(
                template=szablon,
                klucz_twin=_klucz(pusty_model()),
                target_segment_id=None,
                params_override=dane,
            )
        kod_odmowy, tresc = blad.value.code, blad.value.message_pl
    assert kod_odmowy == kod
    assert pole(klucz, "add_grid_source_sn") in tresc
    assert podpowiedz in tresc
    assert podstawa in tresc


@pytest.mark.parametrize("tpl_id", _SZABLONY_H5)
def test_szablon_h5_przekazuje_wylacznie_zadeklarowane_dane_projektu(tpl_id: str) -> None:
    """Predykaty parami: klucze przekazywane przez szablon do operacji = klucze deklarowane
    w `schema.dane_projektu`; klucz spoza deklaracji nie przechodzi, brak klucza nie jest
    uzupełniany wartością domyślną."""
    from application.station_templates import get_template
    from application.station_templates.apply import (
        _ladunek_gpz_h5,
        rozstrzygnij_parametry_szablonu,
    )

    szablon = get_template(tpl_id)
    assert szablon is not None
    zadeklarowane = {d.klucz_ladunku for d in szablon.schema.dane_projektu}
    dane = {k: {"znacznik": k} for k in zadeklarowane}
    dane["hv_sections"] = ladunek_h5()["hv_sections"]
    dane["klucz_spoza_deklaracji"] = "x"
    parametry = rozstrzygnij_parametry_szablonu(szablon, {}, None)
    ladunek = _ladunek_gpz_h5(szablon, dane, parametry, {"catalog_ref": "a"})
    for k in zadeklarowane - {"hv_sections"}:
        assert ladunek[k] == {"znacznik": k}
    assert "klucz_spoza_deklaracji" not in ladunek
    bez_danych = _ladunek_gpz_h5(
        szablon, {"hv_sections": dane["hv_sections"]}, parametry, {"catalog_ref": "a"}
    )
    assert not (zadeklarowane - {"hv_sections"}) & set(bez_danych)
    assert "normal_state" not in bez_danych["sn_coupler"]


def test_brak_stanu_lacznika_sn_bez_strony_110_odmowa_z_podstawa() -> None:
    """GPZ bez strony 110 kV (sekcje SN z własnymi równoważnikami): brak stanu ŁS-SN —
    odmowa z podpowiedzią i podstawą §26.10.5."""
    from enm.rezerwa_gpz import PODPOWIEDZ_STANU_LACZNIKA_SZYN_SN_PL, PODSTAWA_TRYBU_REZERWY_PL

    sekcja = {
        "supply": {"manual_equivalent": {"sn_voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1}}
    }
    wynik = execute_domain_operation(
        enm_dict=pusty_model(),
        op_name="add_grid_source_sn",
        payload={
            "voltage_kv": 15.0,
            "sections_count": 2,
            "gpz_sections": [dict(sekcja, order=0), dict(sekcja, order=1)],
        },
    )
    assert wynik["error_code"] == "source.gpz_coupler_state_required", wynik.get("error")
    assert PODPOWIEDZ_STANU_LACZNIKA_SZYN_SN_PL in wynik["error"]
    assert PODSTAWA_TRYBU_REZERWY_PL in wynik["error"]


@pytest.mark.parametrize("tpl_id", _SZABLONY_H5)
def test_podglad_szablonu_h5_to_sklad_pol_z_operacji(client: Any, tpl_id: str) -> None:
    """Podgląd kreatora szablonu GPZ = TA SAMA operacja `add_grid_source_sn` na pustym
    modelu (predykaty parami: podgląd i zastosowanie z jednej funkcji ładunku). Iloczyn:
    {dane projektu kompletne → skład pól w kolejności rozdzielni z szablonami pól standardu,
    brak liczby pól liniowych → odmowa 422 z kodem operacji}. Dawniej podgląd liczył role
    szablonu stacji wstawianej w odcinek i nadawał polu pomiaru napięcia szyn semantykę
    układu rozliczeniowego."""
    dane = {
        "hv_sections": ladunek_h5()["hv_sections"],
        "hv_coupler": {"normal_state": "open"},
        "reserve_mode": "hidden",
        "line_fields_per_section": "2",
        "earthing_bay_template": "ENEA_SN_ZU_REZYSTOR",
    }
    odpowiedz = client.post(
        f"/api/station-templates/{tpl_id}/preview", json={"params_override": dane}
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    podglad = odpowiedz.json()
    assert podglad["station_type"] == "gpz"
    pola = podglad["effective_config"]["gpz_bays"]
    assert podglad["effective_config"]["sn_fields"] == []
    # Zastosowanie szablonu z tymi danymi daje te same pola w tej samej kolejności.
    from application.station_templates import get_template
    from application.station_templates.apply import apply_template_to_case
    from enm.store import get_enm

    szablon = get_template(tpl_id)
    assert szablon is not None
    klucz = _klucz(pusty_model())
    wynik = apply_template_to_case(
        template=szablon, klucz_twin=klucz, target_segment_id=None, params_override=dane
    )
    enm = get_enm(klucz).model_dump(mode="json")
    assert [(p["bay_role"], p["szablon_standardu_ref"]) for p in pola] == [
        (p["bay_role"], p["szablon_standardu_ref"]) for p in enm["bays"]
    ]
    assert podglad["estimated_elements_count"] == len(wynik["created_element_refs"])
    role = [p["bay_role"] for p in pola]
    assert role.count("MEASUREMENT") == 2, "pole pomiaru napięcia w każdej sekcji SN (§13)"
    for pole in pola:
        szablon_pola = szablon_pola_standardu(pole["szablon_standardu_ref"])
        if pole["voltage_kv"] >= 110.0:
            # Strona 110 kV — granica zasilania: bez szablonu, skład = łącznik pola („brak
            # typu”) albo transformator (element z własnym katalogiem); ten sam skład co karta.
            assert szablon_pola is None and pole["szablon_standardu_nazwa_pl"] is None
            assert [w["status"] for w in pole["sklad"]] in (
                ["BRAK_TYPU_GRANICA_WN"],
                ["ZAPROJEKTOWANE"],
            )
            continue
        assert szablon_pola is not None
        w_gniazdach = [w for w in pole["sklad"] if w["gniazdo_ref"] is not None]
        assert [w["gniazdo_nazwa_pl"] for w in w_gniazdach] == [
            g.nazwa_pl for g in szablon_pola.gniazda
        ]
        # Poza gniazdami wyłącznie element powiązany z własnym katalogiem: transformator,
        # który pole transformatorowe SN zasila (ta sama gałąź, co w polu TR strony 110 kV).
        poza = [(w["rodzaj"], w["status"]) for w in pole["sklad"] if w["gniazdo_ref"] is None]
        tr = [("TRANSFORMER_DEVICE", "ZAPROJEKTOWANE")]
        assert poza == (tr if pole["bay_role"] == "TR" else [])
    del dane["line_fields_per_section"]
    odmowa = client.post(f"/api/station-templates/{tpl_id}/preview", json={"params_override": dane})
    assert odmowa.status_code == 422, odmowa.text
    assert odmowa.json()["detail"]["code"] == "source.gpz_line_fields_required"
