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
from enm.store import set_enm
from enm.topology import (
    ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
    ROLA_LACZNIK_SZYN_SN,
    ROLA_LACZNIK_SZYN_WN,
    ROLA_PUNKT_PODZIALU,
    polaczenia_niezaleznych_zrodel,
    role_lacznikow,
    transformatory_zasilajace_gpz,
)
from enm.topology_ops import usun_galaz, usun_urzadzenie, usun_wezel
from enm.validator import ENMValidator
from network_model.odmowa_danych import OdmowaNazwana

from tests.reference_networks.gpz_h5 import (
    ODBIOR_A,
    ODBIOR_B,
    OPIS_DANYCH,
    PROPOZYCJA_APARATOW_110,
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
    rozpływu — ograniczenie rdzenia, V12K-162) i przesunięciem fazowym Yd11 (+30°).
    Iteracja prosta U2 = U1·e^{j30°} − Z·conj(S/U2) w jednostkach względnych S_rT.
    Zwraca (|U2| pu, kąt U2 [°], P źródła [MW], Q źródła [Mvar])."""
    z_pu = complex(PK_W / S_RT_VA, math.sqrt(UK**2 - (PK_W / S_RT_VA) ** 2))
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
    assert _element(h5, "sources", r.zrodlo_l1)["bus_ref"] == r.szyna_wn_1
    assert _element(h5, "sources", r.zrodlo_l2)["bus_ref"] == r.szyna_wn_2
    tr1 = _element(h5, "transformers", r.tr1)
    tr2 = _element(h5, "transformers", r.tr2)
    assert (tr1["hv_bus_ref"], tr1["lv_bus_ref"]) == (r.szyna_wn_1, r.szyna_sn_a)
    assert (tr2["hv_bus_ref"], tr2["lv_bus_ref"]) == (r.szyna_wn_2, r.szyna_sn_b)
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
    """Ustalenie 4 (§13, zał. Z.2): pola ZU/BKR/POMIAR na każdej sekcji SN bez aparatu
    domyślnego i bez elementu; łącznik szyn SN w dwóch celach; ustalenie 6: propozycja
    aparatów 110 kV zapisana jako PROPOZYCJA szablonu, odróżniona od aparatów w modelu."""
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
    cele = sorted(
        p["meta"]["gpz_coupler_cell"]
        for p in pola
        if p["bay_role"] == "COUPLER" and p.get("equipment_refs") == [r.lacznik_sn]
    )
    assert cele == [1, 2]
    szyny_wn = {r.szyna_wn_1, r.szyna_wn_2}
    pola_wn = [p for p in pola if p.get("bus_ref") in szyny_wn]
    assert sorted(p["bay_role"] for p in pola_wn) == ["COUPLER", "IN", "IN", "TR", "TR"]
    for pole in pola_wn:
        propozycja = pole["meta"]["apparatus_proposal"]
        assert propozycja["modelled"] is False
        assert propozycja["basis"] == PROPOZYCJA_APARATOW_110["basis"]
        rodzaj = {"IN": "line", "TR": "transformer", "COUPLER": "coupler"}[pole["bay_role"]]
        assert propozycja["apparatus"] == PROPOZYCJA_APARATOW_110[rodzaj]
        # Pole 110 kV wskazuje wyłącznie element, któremu służy (TR, łącznik szyn) —
        # aparatów łączeniowych pól 110 kV model nie ma (propozycja ≠ aparat modelu).
        assert set(pole.get("equipment_refs") or []) <= {r.tr1, r.tr2, r.lacznik_wn}
    laczniki_wn = [
        g for g in h5["branches"] if g["from_bus_ref"] in szyny_wn or g["to_bus_ref"] in szyny_wn
    ]
    assert [g["ref_id"] for g in laczniki_wn] == [r.lacznik_wn]
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
    for szyna_sn, szyna_wn, (_nazwa, p, q) in (
        (r.szyna_sn_a, r.szyna_wn_1, ODBIOR_A),
        (r.szyna_sn_b, r.szyna_wn_2, ODBIOR_B),
    ):
        u, kat, p_zr, q_zr = rozplyw_dwuwezlowy(p, q)
        assert szyny[szyna_sn]["v_pu"] == pytest.approx(u, abs=1e-6)
        assert szyny[szyna_sn]["angle_deg"] == pytest.approx(kat, abs=1e-4)
        assert szyny[szyna_wn]["v_pu"] == pytest.approx(1.0, abs=1e-12)
        assert szyny[szyna_wn]["p_injected_mw"] == pytest.approx(p_zr, abs=1e-5)
        assert szyny[szyna_wn]["q_injected_mvar"] == pytest.approx(q_zr, abs=1e-5)


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
        # Węzeł bez drogi zerowej MA napięcie — nie jest „bez napięcia”.
        assert wiersze[r.szyna_sn_a]["flags"] == []


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
    wylacznik = _wylacznik_rezerwy(jawna)
    oczekiwane = {
        "ukryta": (h5, {r.lacznik_wn: ROLA_LACZNIK_SZYN_WN, r.lacznik_sn: ROLA_LACZNIK_SZYN_SN}),
        "jawna": (
            jawna,
            {
                rj.lacznik_wn: ROLA_LACZNIK_SZYN_WN,
                rj.lacznik_sn: ROLA_LACZNIK_SZYN_SN,
                wylacznik: ROLA_LACZNIK_POLA_TRANSFORMATOROWEGO,
            },
        ),
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
@pytest.mark.parametrize("bez_l1", [False, True], ids=["oba-tory", "bez-L1"])
def test_e067_iloczyn_stanow_lacznikow_i_zrodel_ukryta(
    h5: dict[str, Any], r: RefyH5, wn: str, sn: str, bez_l1: bool
) -> None:
    """E067 ⇔ (oba tory w ruchu) ∧ (ŁS-110 zamknięty ∨ ŁS-SN zamknięty)."""
    wylaczone = (r.zrodlo_l1,) if bez_l1 else ()
    oczekiwane = not bez_l1 and "closed" in (wn, sn)
    assert _e067(h5, {r.lacznik_wn: wn, r.lacznik_sn: sn}, wylaczone) is oczekiwane


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
    pierwszy odcinek, to TO SAMO wolne pole liniowe SN — nigdy pole zasilające 110 kV ani
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
    assert wynik.success, [i.message for i in wynik.issues]
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
    """Szyna sekcji 110 kV 2 razem z elementami na niej (źródło L2, TR2, ŁS-110): sekcja
    znika z rejestru, stacja i sekcje SN zostają. Droga topologiczna usuwa szynę dopiero po
    usunięciu przyłączonych elementów (prymityw odmawia szyny w użyciu)."""
    enm = h5
    if droga is _usun_operacja_topologiczna:
        enm = droga(enm, r.zrodlo_l2, "zrodlo")
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


def _zapisz_scenariusz_http(client: Any, case_id: str, nazwa: str, stany: dict[str, str]) -> str:
    odpowiedz = client.post(
        f"/api/scenariusze-laczeniowe/study-cases/{case_id}",
        json={"name": nazwa, "switch_states": stany},
    )
    assert odpowiedz.status_code == 201, odpowiedz.text
    return str(odpowiedz.json()["scenario_id"])


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
            },
        )


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
