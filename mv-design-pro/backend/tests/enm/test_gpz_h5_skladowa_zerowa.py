"""Karta GPZ-H5-SKLADOWA-ZEROWA — uziemienie punktów neutralnych a zwarcie doziemne w GPZ H5.

Dwie strony transformatora 110/15 kV (decyzja właściciela 2026-10-22):

* 110 kV — granica zasilania sieci SN. Punkt neutralny uzwojenia 110 kV
  (``Transformer.hv_neutral``) wpływa na I″k1 PO STRONIE 110 kV; jeden rachunek ręczny
  dla stanów uziemiony / przez rezystor / izolowany (MAX, MIN). Na sieć SN nie wpływa —
  uzwojenie SN w trójkąt rozdziela składowe zerowe (wymiar „punkt neutralny 110 kV” w
  iloczynie po stronie SN to sprawdza).
* SN — pełny zakres: zespół uziemiający ZU w polu uziemiającym sekcji (ENEA Operator,
  Zeszyt 1 „Stacje 110 kV”, zał. Z.13–Z.15): rezystor, uziemienie bezpośrednie, dławik,
  dławik z rezystorem równolegle, punkt odłączony, brak danych zespołu, dane niepełne.
  Iloczyn cech: {wariant ZU} × {MAX, MIN} × {sekcja A, sekcja B} × {punkt neutralny
  110 kV: trójkąt Yd11 z katalogu, YNd11 uziemiony}. Trzy przyczyny braku wyniku
  rozróżnione jednym źródłem (``enm.przyczyny_zwarcia_doziemnego``): wiersz surowy biegu,
  wiersz wyniku dla UI, odmowa pakietu dowodowego i równoważnik sieci SN dla nN.

Rachunek NIEZALEŻNY IEC 60909-0:2016 (dane z katalogu przepisane jawnie w
``test_gpz_h5_akceptacja``; tu wyłącznie wzory, bez importu solvera):

    I″k1 = √3·c·U_n / |Z1 + Z2 + Z0|,  Z2 = Z1                              (wzór 52)

Strona SN (sekcja zasilana torem przez jeden transformator 110/15 kV):

    Z1 = Z_Q/t_r² + K_T·Z_T            (Z_Q = c·U_nQ²/S″kQ, R/X = 0,1; t_r = 110/15)
    Z0 = Z_0,ZU + 3·Z_N                (transformator sieciowy Yd11: trójkąt SN nie daje
                                        drogi zerowej; zespół uziemiający bez K_T —
                                        nie jest transformatorem sieciowym, §6.3.3)

    np. tor L1 MAX: Z_Q = 1,1·110²/2500 = 5,324 Ω ⇒ X_Q = 5,29757, R_Q = 0,529757 Ω;
    Z_Q/t_r² = 0,009852 + j0,098514 Ω; Z_T = 0,11·15²/25 = 0,99 Ω, R_T = 0,0432 Ω,
    X_T = 0,989057 Ω, x_T = 0,109895, K_T = 1,045/1,065937 = 0,980358 ⇒
    K_T·Z_T = 0,042351 + j0,969630 Ω ⇒ Z1 = 0,052203 + j1,068144 Ω;
    rezystor R_N = 20 Ω, Z_0,ZU = 2 + j6 Ω ⇒ Z0 = 62 + j6 Ω;
    |2·Z1 + Z0| = |62,104406 + j8,136288| = 62,635 Ω ⇒ I″k1 = 28 578,8 V/62,635 Ω ≈ 456,28 A.

Strona 110 kV (szyna sekcji 110 kV, transformator YNd11 z punktem neutralnym 110 kV):

    Z1 = Z_Q;  Z0 = (Z0/Z1·Z_Q) ‖ (K_T·Z_T,WN + 3·Z_N)   (§6.3.3: K_T także dla Z_T0)
    Z_T,WN = 0,11·110²/25 = 53,24 Ω, R_T = 120 kW·110²/25² = 2,3232 Ω, X_T = 53,18929 Ω.
    Punkt izolowany ⇒ gałąź transformatora znika: Z0 = 1,2·Z_Q (``ik1_wn``).
"""

from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pytest
from application.analyses.lv_domain.upstream_equivalent import _hv_zero_sequence_ohm
from application.solvers.short_circuit_binding import wynik_zwarcia_1f_ze_snapshotu
from enm.domain_operations import execute_domain_operation
from enm.mapping import build_zero_sequence_trace, map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ZespolUziemiajacy
from enm.przyczyny_zwarcia_doziemnego import (
    ETYKIETA_STATUSU_PL,
    KOD_POWODU,
    PODSTAWA_BRAK_DANYCH,
    PODSTAWA_BRAK_DROGI,
    PODSTAWA_NIE_DOTYCZY,
    ElementPrzyczyny,
    WpisSieciZerowej,
    rozstrzygnij_skladowa,
)
from enm.validator import ENMValidator
from network_model.odmowa_danych import OdmowaDanychError

from tests.enm.test_gpz_h5_akceptacja import (
    C_MAX,
    C_MIN,
    OPCJE_1F_MAX,
    OPCJE_1F_MIN,
    PK_W,
    S_RT_VA,
    U_RT_SN_V,
    U_RT_WN_V,
    UK,
    UN_SN_V,
    UN_WN_V,
    _bieg,
    _ikss,
    _przyczyny,
    _scenariusz,
    _wiersze_zwarcia,
    _z_q,
    _z_tk_sn,
    ik1_wn,
)
from tests.reference_networks.gpz_h5 import (
    RX_110,
    TOR_L1,
    TOR_L2,
    Z0_Z1_110,
    RefyH5,
    refy,
    zbuduj_h5,
)

# ---------------------------------------------------------------------------
# Dane zespołów uziemiających (wartości przykładowe projektanta, nie katalog)
# ---------------------------------------------------------------------------

R0_ZU = 2.0
X0_ZU = 6.0
R_N = 20.0
X_N_REZYSTORA = 2.0
X_L = 300.0
R_L = 3.0
R_P = 500.0

#: wariant → (rekord ``zespol_uziemiajacy`` albo None, oczekiwanie). Oczekiwanie: impedancja
#: zerowa Z0 [Ω] (wynik liczony) albo status przyczyny braku wyniku.
WARIANTY_ZU: dict[str, tuple[dict[str, Any] | None, complex | str]] = {
    "rezystor": (
        {
            "uklad": "ZN",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {"type": "resistor_grounded", "r_ohm": R_N},
        },
        complex(R0_ZU + 3 * R_N, X0_ZU),
    ),
    "rezystor_z_reaktancja": (
        {
            "uklad": "YNd",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {
                "type": "resistor_grounded",
                "r_ohm": R_N,
                "x_ohm": X_N_REZYSTORA,
            },
        },
        complex(R0_ZU + 3 * R_N, X0_ZU + 3 * X_N_REZYSTORA),
    ),
    "bezposrednio": (
        {
            "uklad": "ZN",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {"type": "directly_grounded"},
        },
        complex(R0_ZU, X0_ZU),
    ),
    "dlawik": (
        {
            "uklad": "ZN",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {"type": "petersen_coil", "r_ohm": R_L, "x_ohm": X_L},
        },
        "NIE_DOTYCZY",
    ),
    "dlawik_z_rezystorem": (
        {
            "uklad": "ZN",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {"type": "petersen_coil", "r_ohm": R_L, "x_ohm": X_L},
            "rezystor_rownolegly_ohm": R_P,
        },
        "NIE_DOTYCZY",
    ),
    "odlaczony": (
        {
            "uklad": "ZN",
            "r0_ohm": R0_ZU,
            "x0_ohm": X0_ZU,
            "punkt_neutralny": {"type": "isolated"},
        },
        "BRAK_DROGI_FIZYCZNEJ",
    ),
    "brak_zespolu": (None, "BRAK_DANYCH"),
    "bez_impedancji_zerowej": (
        {"uklad": "ZN", "punkt_neutralny": {"type": "resistor_grounded", "r_ohm": R_N}},
        "BRAK_DANYCH",
    ),
    "bez_punktu_neutralnego": (
        {"uklad": "ZN", "r0_ohm": R0_ZU, "x0_ohm": X0_ZU},
        "BRAK_DANYCH",
    ),
}


def _z_n_dlawika_z_rezystorem() -> complex:
    z_l = complex(R_L, X_L)
    return z_l * R_P / (z_l + R_P)


#: wariant → oczekiwanie dla zwarcia 2F+Z (wymaganie ``impedancja_z0``): impedancja zerowa
#: Z0 [Ω] albo status przyczyny. Sieć kompensowana MA impedancję zerową (dławik) — zwarcie
#: dwufazowe z ziemią jest w niej określone (IEC 60909-0 rozdz. 3), w odróżnieniu od 1F.
WARIANTY_ZU_2FZ: dict[str, complex | str] = {
    "rezystor": complex(R0_ZU + 3 * R_N, X0_ZU),
    "rezystor_z_reaktancja": complex(R0_ZU + 3 * R_N, X0_ZU + 3 * X_N_REZYSTORA),
    "bezposrednio": complex(R0_ZU, X0_ZU),
    "dlawik": complex(R0_ZU + 3 * R_L, X0_ZU + 3 * X_L),
    "dlawik_z_rezystorem": complex(R0_ZU, X0_ZU) + 3.0 * _z_n_dlawika_z_rezystorem(),
    "odlaczony": "BRAK_DROGI_FIZYCZNEJ",
    "brak_zespolu": "BRAK_DANYCH",
    "bez_impedancji_zerowej": "BRAK_DANYCH",
    "bez_punktu_neutralnego": "BRAK_DANYCH",
}

#: Brakujące pola zgłaszane dla wariantów BRAK_DANYCH (lista przyczyny wiersza).
BRAKUJACE_POLA = {
    "brak_zespolu": ["zespol_uziemiajacy"],
    "bez_impedancji_zerowej": ["zespol_uziemiajacy.r0_ohm", "zespol_uziemiajacy.x0_ohm"],
    "bez_punktu_neutralnego": ["zespol_uziemiajacy.punkt_neutralny"],
}

# ---------------------------------------------------------------------------
# Rachunek niezależny
# ---------------------------------------------------------------------------


def _ik1(z1: complex, z0: complex, c: float, un_v: float) -> float:
    """I″k1 = √3·c·U_n/|2·Z1 + Z0| (IEC 60909-0:2016 wzór 52, Z2 = Z1)."""
    return math.sqrt(3.0) * c * un_v / abs(2.0 * z1 + z0)


def _ik2fz(z1: complex, z0: complex, c: float, un_v: float) -> float:
    """I″k zwarcia dwufazowego z ziemią (składowa zgodna): c·U_n/|Z1 + Z2·Z0/(Z2 + Z0)|,
    Z2 = Z1 (IEC 60909-0:2016, zwarcie dwufazowe z ziemią — ta sama postać co solver)."""
    return c * un_v / abs(z1 + z1 * z0 / (z1 + z0))


def _z1_sn(tor: tuple[str, str, float, float], *, maks: bool) -> complex:
    """Z1 szyny SN sekcji zasilanej torem przez jeden transformator: Z_Q/t_r² + K_T·Z_T."""
    _linia, _stacja, sk_max, sk_min = tor
    c = C_MAX if maks else C_MIN
    t_r = U_RT_WN_V / U_RT_SN_V
    return _z_q(sk_max if maks else sk_min, c, RX_110, UN_WN_V) / t_r**2 + _z_tk_sn()


def _ztk_wn() -> complex:
    """K_T·Z_T po stronie 110 kV (K_T z c_max, wzór 12a; §6.3.3 — także dla Z_T0)."""
    z_t = UK * U_RT_WN_V**2 / S_RT_VA
    r_t = PK_W * U_RT_WN_V**2 / S_RT_VA**2
    x_t = math.sqrt(z_t**2 - r_t**2)
    k_t = 0.95 * C_MAX / (1.0 + 0.6 * x_t / (U_RT_WN_V**2 / S_RT_VA))
    return k_t * complex(r_t, x_t)


def ik1_wn_uziemiony(tor: tuple[str, str, float, float], *, maks: bool, z_n_ohm: complex) -> float:
    """I″k1 na szynie 110 kV z transformatorem YNd11, punkt neutralny 110 kV przez Z_N:
    Z0 = (Z0/Z1·Z_Q) ‖ (K_T·Z_T,WN + 3·Z_N)."""
    _linia, _stacja, sk_max, sk_min = tor
    c = C_MAX if maks else C_MIN
    z1 = _z_q(sk_max if maks else sk_min, c, RX_110, UN_WN_V)
    z0_sieci = Z0_Z1_110 * z1
    z0_tr = _ztk_wn() + 3.0 * z_n_ohm
    z0 = z0_sieci * z0_tr / (z0_sieci + z0_tr)
    return _ik1(z1, z0, c, UN_WN_V)


# ---------------------------------------------------------------------------
# Ścieżka użytkownika: operacje domenowe na migawce H5
# ---------------------------------------------------------------------------


def _op(enm: dict[str, Any], nazwa: str, ladunek: dict[str, Any]) -> dict[str, Any]:
    wynik = execute_domain_operation(enm_dict=enm, op_name=nazwa, payload=ladunek)
    assert wynik.get("error") is None, (wynik.get("error"), wynik.get("error_code"))
    return dict(wynik["snapshot"])


def _pole_uziemiajace(enm: dict[str, Any], szyna: str) -> str:
    (pole,) = (
        b["ref_id"] for b in enm["bays"] if b["bay_role"] == "EARTHING" and b["bus_ref"] == szyna
    )
    return pole


def _z_zespolem(enm: dict[str, Any], szyna: str, zespol: dict[str, Any] | None) -> dict[str, Any]:
    if zespol is None:
        return enm
    return _op(
        enm,
        "update_element_parameters",
        {
            "element_ref": _pole_uziemiajace(enm, szyna),
            "parameters": {"zespol_uziemiajacy": zespol},
        },
    )


def _punkt_110(enm: dict[str, Any], trafo: str, neutral: dict[str, Any]) -> dict[str, Any]:
    """Transformator 110/15 kV z wyprowadzonym punktem neutralnym 110 kV (YNd11)."""
    return _op(
        enm,
        "update_element_parameters",
        {"element_ref": trafo, "parameters": {"vector_group": "YNd11", "hv_neutral": neutral}},
    )


@pytest.fixture(scope="module")
def h5() -> dict[str, Any]:
    return zbuduj_h5()


@pytest.fixture(scope="module")
def r(h5: dict[str, Any]) -> RefyH5:
    return refy(h5)


def _sprawdz_przyczyne(
    run: Any, szyna: str, status: str, *, elementy: tuple[str, ...] = ()
) -> dict[str, Any]:
    """Wiersz bez wyniku: brak liczby, kod przyczyny, ta sama przyczyna w wierszu surowym
    biegu i w wierszu wyniku dla UI (jedno źródło), treść po polsku z podstawą."""
    assert _ikss(run)[szyna] is None
    assert _przyczyny(run)[szyna] == KOD_POWODU[status]
    wiersz_ui = _wiersze_zwarcia(run)[szyna]
    przyczyna = wiersz_ui["przyczyna_braku_wyniku"]
    (surowy,) = (
        w
        for w in run.raw_result["results"]
        if str(w["fault_node_id"]) == str(wiersz_ui["target_id"])
    )
    assert surowy["przyczyna_braku_wyniku"] == przyczyna
    assert przyczyna["status"] == status
    assert przyczyna["status_pl"] == ETYKIETA_STATUSU_PL[status]
    assert przyczyna["kod"] == KOD_POWODU[status]
    assert (
        przyczyna["podstawa"]
        == {
            "BRAK_DANYCH": PODSTAWA_BRAK_DANYCH,
            "BRAK_DROGI_FIZYCZNEJ": PODSTAWA_BRAK_DROGI,
            "NIE_DOTYCZY": PODSTAWA_NIE_DOTYCZY,
        }[status]
    )
    refy_elementow = {e["ref_id"] for e in przyczyna["elementy"]}
    for ref in elementy:
        assert ref in refy_elementow, (ref, przyczyna)
    for element in przyczyna["elementy"]:
        assert element["nazwa"] in przyczyna["opis_pl"]
    # Węzeł bez wyniku zwarcia doziemnego MA napięcie — nie jest „bez napięcia”.
    assert wiersz_ui["flags"] == []
    return przyczyna


# ---------------------------------------------------------------------------
# 110 kV — punkt neutralny transformatora (Transformer.hv_neutral), rachunek ręczny
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(("opcje", "maks"), [(OPCJE_1F_MAX, True), (OPCJE_1F_MIN, False)])
@pytest.mark.parametrize(
    ("neutral", "z_n"),
    [
        ({"type": "directly_grounded"}, 0j),
        ({"type": "resistor_grounded", "r_ohm": 10.0}, complex(10.0, 0.0)),
        ({"type": "isolated"}, None),
    ],
    ids=["uziemiony", "przez-rezystor", "izolowany"],
)
def test_110kv_punkt_neutralny_tr_steruje_ik1_po_stronie_wn(
    h5: dict[str, Any],
    r: RefyH5,
    neutral: dict[str, Any],
    z_n: complex | None,
    opcje: dict[str, Any],
    maks: bool,
) -> None:
    """Uziemiony: Z0 = 1,2·Z_Q ‖ (K_T·Z_T,WN + 3·Z_N) — I″k1 rośnie; izolowany: gałąź
    transformatora znika z sieci zerowej (I″k1 = ``ik1_wn``). Sekcja 110 kV z TR2 (Yd11 bez
    zmian) jest niezależna od punktu neutralnego TR1."""
    enm = _punkt_110(h5, r.tr1, neutral)
    run = _bieg(enm, "short_circuit_sn", opcje)
    ik = _ikss(run)
    oczekiwany = (
        ik1_wn(TOR_L1, maks=maks)
        if z_n is None
        else ik1_wn_uziemiony(TOR_L1, maks=maks, z_n_ohm=z_n)
    )
    assert ik[r.szyna_wn_1] == pytest.approx(oczekiwany, rel=1e-6)
    assert ik[r.szyna_wn_2] == pytest.approx(ik1_wn(TOR_L2, maks=maks), rel=1e-6)
    if z_n is not None:
        assert ik[r.szyna_wn_1] > ik1_wn(TOR_L1, maks=maks)


def test_110kv_reczne_wartosci_odniesienia() -> None:
    """Wartości odniesienia do meldunku (MAX, tor L1): uziemiony bezpośrednio ≈ 12 826 A,
    izolowany = 12 301,5 A (Z0 = 1,2·Z_Q, |3,2·Z_Q| = 17,0368 Ω)."""
    assert ik1_wn(TOR_L1, maks=True) == pytest.approx(12301.50, rel=1e-6)
    assert ik1_wn_uziemiony(TOR_L1, maks=True, z_n_ohm=0j) == pytest.approx(12825.40, rel=1e-5)


# ---------------------------------------------------------------------------
# SN — iloczyn cech: wariant ZU × MAX/MIN × sekcja × punkt neutralny 110 kV
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("punkt_110", ["trojkat_katalog", "ynd11_uziemiony"])
@pytest.mark.parametrize("rodzaj", ["1F", "2F+Z"])
@pytest.mark.parametrize("sekcja", ["A", "B"])
@pytest.mark.parametrize(("opcje", "maks"), [(OPCJE_1F_MAX, True), (OPCJE_1F_MIN, False)])
@pytest.mark.parametrize("wariant", sorted(WARIANTY_ZU))
def test_sn_zespol_uziemiajacy_iloczyn_cech(
    h5: dict[str, Any],
    r: RefyH5,
    wariant: str,
    opcje: dict[str, Any],
    maks: bool,
    sekcja: str,
    punkt_110: str,
    rodzaj: str,
) -> None:
    """Iloczyn {wariant ZU} × {MAX, MIN} × {sekcja A, B} × {punkt 110 kV} × {1F, 2F+Z}.

    1F i 2F+Z czytają tę samą klasyfikację z różnym wymaganiem: 1F potrzebuje sieci
    uziemionej (sieć kompensowana — NIE_DOTYCZY), 2F+Z wyłącznie obliczalnej impedancji
    zerowej (z dławikiem liczone); brak danych i fizyczny brak drogi — dla obu."""
    zespol, oczekiwanie_1f = WARIANTY_ZU[wariant]
    oczekiwanie = oczekiwanie_1f if rodzaj == "1F" else WARIANTY_ZU_2FZ[wariant]
    opcje = {**opcje, "fault_type": rodzaj}
    wzor = _ik1 if rodzaj == "1F" else _ik2fz
    szyna, druga, tor, trafo = (
        (r.szyna_sn_a, r.szyna_sn_b, TOR_L1, r.tr1)
        if sekcja == "A"
        else (r.szyna_sn_b, r.szyna_sn_a, TOR_L2, r.tr2)
    )
    enm = h5
    if punkt_110 == "ynd11_uziemiony":
        enm = _punkt_110(enm, trafo, {"type": "directly_grounded"})
    enm = _z_zespolem(enm, szyna, zespol)
    run = _bieg(enm, "short_circuit_sn", opcje)
    pole = _pole_uziemiajace(enm, szyna)
    if isinstance(oczekiwanie, complex):
        c = C_MAX if maks else C_MIN
        assert _ikss(run)[szyna] == pytest.approx(
            wzor(_z1_sn(tor, maks=maks), oczekiwanie, c, UN_SN_V), rel=1e-6
        )
        assert _przyczyny(run)[szyna] is None
        assert "przyczyna_braku_wyniku" not in _wiersze_zwarcia(run)[szyna]
    else:
        elementy: tuple[str, ...] = (pole,)
        if oczekiwanie == "BRAK_DROGI_FIZYCZNEJ":
            # Przerwa drogi: pole z punktem odłączonym i transformator sieciowy (trójkąt SN).
            elementy = (pole, trafo)
        przyczyna = _sprawdz_przyczyne(run, szyna, oczekiwanie, elementy=elementy)
        if wariant in BRAKUJACE_POLA:
            (element,) = przyczyna["elementy"]
            assert element["brakujace_pola"] == BRAKUJACE_POLA[wariant]
        if oczekiwanie == "NIE_DOTYCZY":
            assert "kompensowana" in przyczyna["opis_pl"]
        if oczekiwanie == "BRAK_DROGI_FIZYCZNEJ":
            assert "nie jest uziemiony" in przyczyna["opis_pl"]
            assert "zwarcie dwufazowe" in przyczyna["opis_pl"]
    # Druga sekcja (pole uziemiające bez danych zespołu) — niezależna: zawsze BRAK_DANYCH.
    _sprawdz_przyczyne(run, druga, "BRAK_DANYCH", elementy=(_pole_uziemiajace(enm, druga),))
    # Strona 110 kV liczona niezależnie od uziemienia SN (trójkąt SN rozdziela składowe).
    ik = _ikss(run)
    assert ik[r.szyna_wn_1] is not None and ik[r.szyna_wn_2] is not None


@pytest.mark.parametrize(("opcje", "maks"), [(OPCJE_1F_MAX, True), (OPCJE_1F_MIN, False)])
def test_sn_rezystor_reczne_wartosci_odniesienia(
    h5: dict[str, Any], r: RefyH5, opcje: dict[str, Any], maks: bool
) -> None:
    """Rachunek z nagłówka modułu (rezystor 20 Ω, Z_0,ZU = 2 + j6 Ω, tor L1): MAX ≈ 456,28 A."""
    enm = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU["rezystor"][0])
    ik = _ikss(_bieg(enm, "short_circuit_sn", opcje))[r.szyna_sn_a]
    c = C_MAX if maks else C_MIN
    assert ik == pytest.approx(_ik1(_z1_sn(TOR_L1, maks=maks), complex(62.0, 6.0), c, UN_SN_V))
    if maks:
        assert ik == pytest.approx(456.28, abs=0.01)


# ---------------------------------------------------------------------------
# SN — sekcje połączone (ŁS-SN zamknięty, jeden transformator): składowa sieci zerowej
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("zespol_a", "zespol_b", "oczekiwanie"),
    [
        ("rezystor", "bezposrednio", "rownolegle"),
        ("rezystor", "dlawik", "rownolegle"),
        ("rezystor", "odlaczony", "rezystor"),
        ("rezystor", "brak_zespolu", "BRAK_DANYCH"),
        ("dlawik", "odlaczony", "NIE_DOTYCZY"),
        ("odlaczony", "odlaczony", "BRAK_DROGI_FIZYCZNEJ"),
    ],
)
def test_sn_sekcje_polaczone_jedna_skladowa_sieci_zerowej(
    h5: dict[str, Any], r: RefyH5, zespol_a: str, zespol_b: str, oczekiwanie: str
) -> None:
    """ŁS-SN zamknięty, TR2 wyłączony (SC-05a): obie sekcje to jedna składowa sieci zerowej.
    Uziemienie w jednej sekcji obsługuje obie; dwa zespoły pracują równolegle; brak danych
    zespołu, który na pewno uziemia sieć, rozstrzyga o całej składowej (wynik bez jego
    impedancji byłby fikcją)."""
    enm = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU[zespol_a][0])
    enm = _z_zespolem(enm, r.szyna_sn_b, WARIANTY_ZU[zespol_b][0])
    sc = _scenariusz("sn-polaczone", stany={r.lacznik_sn: "closed"}, wylaczone=(r.tr2,))
    run = _bieg(enm, "short_circuit_sn", OPCJE_1F_MAX, sc)
    z1 = _z1_sn(TOR_L1, maks=True)
    z_a = WARIANTY_ZU[zespol_a][1]
    z_b = WARIANTY_ZU[zespol_b][1]
    for szyna in (r.szyna_sn_a, r.szyna_sn_b):
        if oczekiwanie == "rownolegle":
            assert isinstance(z_a, complex)
            if isinstance(z_b, complex):
                z0 = z_a * z_b / (z_a + z_b)
            else:
                # Dławik równolegle z rezystorem: bocznik Z_0,ZU + 3·(R_L + jX_L).
                z_dl = complex(R0_ZU + 3 * R_L, X0_ZU + 3 * X_L)
                z0 = z_a * z_dl / (z_a + z_dl)
            assert _ikss(run)[szyna] == pytest.approx(_ik1(z1, z0, C_MAX, UN_SN_V), rel=1e-6)
        elif oczekiwanie == "rezystor":
            assert isinstance(z_a, complex)
            assert _ikss(run)[szyna] == pytest.approx(_ik1(z1, z_a, C_MAX, UN_SN_V), rel=1e-6)
        else:
            _sprawdz_przyczyne(run, szyna, oczekiwanie)


# ---------------------------------------------------------------------------
# White Box: decyzja punktu neutralnego każdego uzwojenia i każdego zespołu
# ---------------------------------------------------------------------------


def test_white_box_punkt_neutralny_kazdego_uzwojenia_i_zespolu(
    h5: dict[str, Any], r: RefyH5
) -> None:
    enm = _punkt_110(h5, r.tr1, {"type": "resistor_grounded", "r_ohm": 10.0})
    enm = _z_zespolem(enm, r.szyna_sn_a, WARIANTY_ZU["dlawik_z_rezystorem"][0])
    model = EnergyNetworkModel.model_validate(enm)
    slad = {k["key"]: k for k in build_zero_sequence_trace(model, map_enm_to_network_graph(model))}
    # Decyzja punktu neutralnego KAŻDEGO uzwojenia — także transformatora bez wkładu (Yd11).
    for trafo in (r.tr1, r.tr2):
        for strona in ("HV", "LV"):
            assert f"tr_z0_pn[{trafo}][{strona}]" in slad
    # K_T (§6.3.3) w kroku transformatora, który wnosi impedancję zerową; Yd11 bez
    # wyprowadzonego punktu neutralnego nie wnosi nic — kroku korekcji nie ma.
    assert f"tr_z0_kt[{r.tr1}]" in slad
    assert f"tr_z0_kt[{r.tr2}]" not in slad
    assert "niewyprowadzony" in slad[f"tr_z0_pn[{r.tr2}][HV]"]["substitution"]
    pn_wn = slad[f"tr_z0_pn[{r.tr1}][HV]"]
    assert "rezystor" in pn_wn["substitution"].lower()
    assert "3·Z_N = 30 + j0 Ω" in pn_wn["substitution"]
    assert "trójkąt" in slad[f"tr_z0_pn[{r.tr1}][LV]"]["substitution"]
    krok_zu = slad[f"z0_zespol_uziemiajacy[{_pole_uziemiajace(enm, r.szyna_sn_a)}]"]
    z_l = complex(R_L, X_L)
    z_n = z_l * R_P / (z_l + R_P)
    assert complex(krok_zu["result"]["zn_ohm"]) == pytest.approx(z_n)
    assert complex(krok_zu["result"]["z0_ohm"]) == pytest.approx(complex(R0_ZU, X0_ZU) + 3.0 * z_n)
    # Determinizm śladu: ta sama migawka → ten sam ślad.
    assert build_zero_sequence_trace(model, map_enm_to_network_graph(model)) == list(
        build_zero_sequence_trace(model, map_enm_to_network_graph(model))
    )


# ---------------------------------------------------------------------------
# Konsumenci tej samej przyczyny: pakiet dowodowy i równoważnik sieci SN dla nN
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wariant", "status"),
    [
        ("brak_zespolu", "BRAK_DANYCH"),
        ("dlawik", "NIE_DOTYCZY"),
        ("odlaczony", "BRAK_DROGI_FIZYCZNEJ"),
    ],
)
def test_pakiet_dowodowy_1f_odmawia_z_ta_sama_przyczyna(
    h5: dict[str, Any], r: RefyH5, wariant: str, status: str
) -> None:
    enm = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU[wariant][0])
    run = _bieg(enm, "short_circuit_sn", OPCJE_1F_MAX)
    wiersz = _wiersze_zwarcia(run)[r.szyna_sn_a]
    with pytest.raises(OdmowaDanychError) as odmowa:
        wynik_zwarcia_1f_ze_snapshotu(
            snapshot=enm,
            fault_node_id=str(wiersz["target_id"]),
            scenariusz="MAX",
            nadpisanie_c=None,
            tk_s=1.0,
            tb_s=None,
        )
    tresc = str(odmowa.value)
    assert ETYKIETA_STATUSU_PL[status] in tresc
    assert wiersz["przyczyna_braku_wyniku"]["opis_pl"] in tresc


@pytest.mark.parametrize(
    ("wariant", "status"),
    [
        ("rezystor", None),
        ("dlawik", None),
        ("dlawik_z_rezystorem", None),
        ("brak_zespolu", "BRAK_DANYCH"),
        ("odlaczony", "BRAK_DROGI_FIZYCZNEJ"),
    ],
)
def test_rownowaznik_sn_dla_nn_czyta_ta_sama_przyczyne(
    h5: dict[str, Any], r: RefyH5, wariant: str, status: str | None
) -> None:
    """Kotwica SN domeny nN (``upstream_equivalent``): Z0 szyny SN albo ta sama przyczyna,
    którą niesie wiersz zwarcia 2F+Z biegu (wymaganie ``impedancja_z0``) — nigdy zero ani
    bocznik algebraiczny. Sieć kompensowana ma impedancję zerową (dławik): kotwica ją
    dostaje, choć zwarcie 1F tej szyny jest NIE_DOTYCZY."""
    enm = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU[wariant][0])
    run = _bieg(enm, "short_circuit_sn", {**OPCJE_1F_MAX, "fault_type": "2F+Z"})
    wiersz = _wiersze_zwarcia(run)[r.szyna_sn_a]
    z0, powod = _hv_zero_sequence_ohm(
        EnergyNetworkModel.model_validate(enm), str(wiersz["target_id"])
    )
    if status is None:
        assert powod is None
        assert z0 == pytest.approx(WARIANTY_ZU_2FZ[wariant])
        assert "przyczyna_braku_wyniku" not in wiersz
    else:
        assert z0 is None
        assert powod == f"Z0 sieci SN nieobliczalne — {wiersz['przyczyna_braku_wyniku']['opis_pl']}"


def test_pakiet_dowodowy_1f_liczy_przy_rezystorze(h5: dict[str, Any], r: RefyH5) -> None:
    enm = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU["rezystor"][0])
    run = _bieg(enm, "short_circuit_sn", OPCJE_1F_MAX)
    wiersz = _wiersze_zwarcia(run)[r.szyna_sn_a]
    zwarcie = wynik_zwarcia_1f_ze_snapshotu(
        snapshot=enm,
        fault_node_id=str(wiersz["target_id"]),
        scenariusz="MAX",
        nadpisanie_c=None,
        tk_s=1.0,
        tb_s=None,
    )
    assert zwarcie.wynik.ikss_a == pytest.approx(_ikss(run)[r.szyna_sn_a], rel=1e-9)


# ---------------------------------------------------------------------------
# Walidator E-W5-01: opis punktu neutralnego SN równoważnika 110 kV a zespół uziemiający
# ---------------------------------------------------------------------------


def _kody_w5(enm: dict[str, Any]) -> list[str]:
    raport = ENMValidator().validate(EnergyNetworkModel.model_validate(enm))
    return [i.message_pl for i in raport.issues if i.code == "E-W5-01"]


@pytest.mark.parametrize(
    ("opis", "wariant", "sprzeczny"),
    [
        ({"type": "resistor_grounded", "r_ohm": R_N}, "rezystor", False),
        ({"type": "resistor_grounded", "r_ohm": R_N}, "dlawik", True),
        ({"type": "petersen_coil", "r_ohm": R_L, "x_ohm": X_L}, "dlawik", False),
        ({"type": "isolated"}, "odlaczony", False),
        ({"type": "isolated"}, "rezystor", True),
        ({"type": "resistor_grounded", "r_ohm": R_N}, "brak_zespolu", True),
    ],
)
def test_e_w5_01_opis_sieci_sn_wobec_zespolu_uziemiajacego(
    h5: dict[str, Any], r: RefyH5, opis: dict[str, Any], wariant: str, sprzeczny: bool
) -> None:
    """Zespół uziemiający w polu sekcji zasilanej przez transformator źródła JEST fizyką
    punktu neutralnego sieci SN, którą czyta zwarcie 1F — opis źródła 110 kV zgodny z nim
    nie jest sprzecznością (dotąd walidator widział wyłącznie transformatory WN/SN)."""
    enm = _op(
        h5,
        "update_element_parameters",
        {"element_ref": r.zrodlo_l1, "parameters": {"neutral_grounding": opis}},
    )
    enm = _z_zespolem(enm, r.szyna_sn_a, WARIANTY_ZU[wariant][0])
    komunikaty = _kody_w5(enm)
    zrodlo = next(z for z in enm["sources"] if z["ref_id"] == r.zrodlo_l1)
    assert zrodlo.get("name")
    dotyczace = [k for k in komunikaty if zrodlo["name"] in k]
    assert bool(dotyczace) is sprzeczny, komunikaty
    if sprzeczny and WARIANTY_ZU[wariant][0] is not None:
        assert "zespół uziemiający" in dotyczace[0]


def test_opis_sieci_sn_na_rownowazniku_110_nie_zmienia_przyczyny_110kv(
    h5: dict[str, Any], r: RefyH5
) -> None:
    """Predykaty parami: ``Source.neutral_grounding`` równoważnika 110 kV opisuje sieć SN
    (W5-A), nie bocznik 110 kV. Opis „dławik” przy zespole z dławikiem: SN — NIE_DOTYCZY;
    110 kV (Z0 równoważnika = uziemienie sieci 110 kV) — liczone ``ik1_wn``."""
    opis = {"type": "petersen_coil", "r_ohm": R_L, "x_ohm": X_L}
    enm = _op(
        h5,
        "update_element_parameters",
        {"element_ref": r.zrodlo_l1, "parameters": {"neutral_grounding": opis}},
    )
    enm = _z_zespolem(enm, r.szyna_sn_a, WARIANTY_ZU["dlawik"][0])
    run = _bieg(enm, "short_circuit_sn", OPCJE_1F_MAX)
    assert _ikss(run)[r.szyna_wn_1] == pytest.approx(ik1_wn(TOR_L1, maks=True), rel=1e-6)
    _sprawdz_przyczyne(run, r.szyna_sn_a, "NIE_DOTYCZY")


# ---------------------------------------------------------------------------
# Jedno źródło: reguły rozstrzygnięcia składowej (każda reguła ma test)
# ---------------------------------------------------------------------------


def _wpis(rodzaj: Any, ref: str = "e", opis: str = "opis") -> WpisSieciZerowej:
    return WpisSieciZerowej(
        rodzaj=rodzaj,
        element=ElementPrzyczyny(ref_id=ref, nazwa=f"Element {ref}", opis_pl=opis),
    )


@pytest.mark.parametrize(
    ("rodzaje", "osobliwa", "status_1f", "status_z0"),
    [
        # reguła 0: brak danych elementu, który na pewno uziemia — dominuje nad uziemieniem
        (("uziemienie", "brak_danych_uziemienia"), False, "BRAK_DANYCH", "BRAK_DANYCH"),
        (("kompensacja", "brak_danych_uziemienia"), False, "BRAK_DANYCH", "BRAK_DANYCH"),
        # reguła 1: uziemienie w składowej — liczone, także przy braku danych innej drogi
        (("uziemienie",), False, None, None),
        (("uziemienie", "brak_danych"), False, None, None),
        (("uziemienie", "kompensacja"), False, None, None),
        (("uziemienie", "przerwa", "pojemnosc"), False, None, None),
        # reguła 2: dławik bez uziemienia — sieć kompensowana: 1F nie dotyczy, Z0 obliczalne
        (("kompensacja",), False, "NIE_DOTYCZY", None),
        (("kompensacja", "przerwa"), False, "NIE_DOTYCZY", None),
        (("kompensacja", "pojemnosc"), False, "NIE_DOTYCZY", None),
        # reguła 2 przed 3 (1F): sieć kompensowana niezależnie od braku danych innej drogi;
        # Z0 z brakującą daną drogi nie jest pewne — brak danych
        (("kompensacja", "brak_danych"), False, "NIE_DOTYCZY", "BRAK_DANYCH"),
        # reguła 3: brak danych drogi, bez uziemienia
        (("brak_danych",), True, "BRAK_DANYCH", "BRAK_DANYCH"),
        (("brak_danych", "przerwa"), True, "BRAK_DANYCH", "BRAK_DANYCH"),
        (("brak_danych", "pojemnosc"), False, "BRAK_DANYCH", "BRAK_DANYCH"),
        # reguła 4: blok osobliwy — fizyczny brak drogi dla obu wymagań
        (("przerwa",), True, "BRAK_DROGI_FIZYCZNEJ", "BRAK_DROGI_FIZYCZNEJ"),
        ((), True, "BRAK_DROGI_FIZYCZNEJ", "BRAK_DROGI_FIZYCZNEJ"),
        (("uziemienie",), True, "BRAK_DROGI_FIZYCZNEJ", "BRAK_DROGI_FIZYCZNEJ"),
        # reguła 5: wyłącznie pojemności doziemne — sieć izolowana: 1F nie dotyczy, Z0 liczone
        (("pojemnosc",), False, "NIE_DOTYCZY", None),
        (("pojemnosc", "przerwa"), False, "NIE_DOTYCZY", None),
    ],
)
@pytest.mark.parametrize("wymaganie", ["zwarcie_1f", "impedancja_z0"])
def test_rozstrzygniecie_skladowej_kazda_regula(
    rodzaje: tuple[str, ...],
    osobliwa: bool,
    status_1f: str | None,
    status_z0: str | None,
    wymaganie: Any,
) -> None:
    status = status_1f if wymaganie == "zwarcie_1f" else status_z0
    wpisy = [_wpis(rodzaj, ref=f"e{i}") for i, rodzaj in enumerate(rodzaje)]
    przyczyna = rozstrzygnij_skladowa(wpisy, osobliwa=osobliwa, wymaganie=wymaganie)
    if status is None:
        assert przyczyna is None
        return
    assert przyczyna is not None
    assert przyczyna.status == status
    assert przyczyna.powod == KOD_POWODU[status]
    assert przyczyna.opis_pl and przyczyna.podstawa
    slownik = przyczyna.to_dict()
    assert set(slownik) == {"status", "status_pl", "kod", "opis_pl", "podstawa", "elementy"}
    # NIE_DOTYCZY wyłącznie dla zwarcia 1F (2F+Z i kotwica czytają tylko obliczalność Z0).
    assert status != "NIE_DOTYCZY" or wymaganie == "zwarcie_1f"


def test_rozstrzygniecie_pojemnosc_nazywa_prad_pojemnosciowy() -> None:
    przyczyna = rozstrzygnij_skladowa(
        [_wpis("pojemnosc", ref="kabel"), _wpis("przerwa", ref="tr")],
        osobliwa=False,
        wymaganie="zwarcie_1f",
    )
    assert przyczyna is not None
    assert przyczyna.status == "NIE_DOTYCZY"
    assert "sieć izolowana" in przyczyna.opis_pl
    assert "pojemności doziemne" in przyczyna.opis_pl
    assert "Element kabel" in przyczyna.opis_pl
    assert [e.ref_id for e in przyczyna.elementy] == ["tr"]


def test_rozstrzygniecie_deterministyczne_niezalezne_od_kolejnosci_wpisow() -> None:
    wpisy = [
        _wpis("brak_danych", ref="b"),
        _wpis("przerwa", ref="a"),
        _wpis("brak_danych", ref="a2"),
    ]
    rng = np.random.default_rng(7)
    for wymaganie in ("zwarcie_1f", "impedancja_z0"):
        wzorzec = rozstrzygnij_skladowa(wpisy, osobliwa=True, wymaganie=wymaganie)
        for _ in range(5):
            kolejnosc = [wpisy[i] for i in rng.permutation(len(wpisy))]
            assert rozstrzygnij_skladowa(kolejnosc, osobliwa=True, wymaganie=wymaganie) == wzorzec


# ---------------------------------------------------------------------------
# Odcisk modelu: zespół uziemiający addytywny (migawki bez zespołu haszują jak przed kartą)
# ---------------------------------------------------------------------------


def test_odcisk_h5_bez_zespolu_bez_zmian_z_zespolem_zmieniony(
    h5: dict[str, Any], r: RefyH5
) -> None:
    from enm.hash import compute_enm_hash

    bazowy = EnergyNetworkModel.model_validate(h5)
    dump = bazowy.model_dump(mode="json")
    for pole in dump["bays"]:
        assert pole.get("zespol_uziemiajacy") is None
        pole.pop("zespol_uziemiajacy", None)
    assert compute_enm_hash(bazowy) == compute_enm_hash(EnergyNetworkModel.model_validate(dump))
    z_zespolem = _z_zespolem(h5, r.szyna_sn_a, WARIANTY_ZU["rezystor"][0])
    assert compute_enm_hash(EnergyNetworkModel.model_validate(z_zespolem)) != compute_enm_hash(
        bazowy
    )


# ---------------------------------------------------------------------------
# Kontrakt rekordu zespołu uziemiającego: sprzeczność danych jest odmową operacji
# ---------------------------------------------------------------------------


def _odmowa_operacji(enm: dict[str, Any], element: str, zespol: dict[str, Any]) -> str:
    wynik = execute_domain_operation(
        enm_dict=enm,
        op_name="update_element_parameters",
        payload={"element_ref": element, "parameters": {"zespol_uziemiajacy": zespol}},
    )
    assert wynik.get("error") is not None, wynik
    return str(wynik["error"])


def test_zespol_uziemiajacy_wylacznie_w_polu_uziemiajacym(h5: dict[str, Any]) -> None:
    """Ścieżka użytkownika: zespół w polu innej roli (np. TR) — odmowa operacji domenowej,
    migawka bez zmian; nazwa roli kanoniczna, nie kod roli."""
    pole = next(b for b in h5["bays"] if b["bay_role"] != "EARTHING")
    tresc = _odmowa_operacji(h5, pole["ref_id"], WARIANTY_ZU["rezystor"][0] or {})
    assert "zespół uziemiający należy wyłącznie do pola zespołu uziemiającego" in tresc
    assert all(b.get("zespol_uziemiajacy") is None for b in h5["bays"])


@pytest.mark.parametrize(
    ("zespol", "fragment"),
    [
        (
            {"uklad": "ZN", "r0_ohm": -1.0, "x0_ohm": X0_ZU},
            "r0_ohm musi być liczbą nieujemną",
        ),
        (
            {"uklad": "YNd", "r0_ohm": R0_ZU, "x0_ohm": -0.5},
            "x0_ohm musi być liczbą nieujemną",
        ),
        (
            {
                "uklad": "ZN",
                "punkt_neutralny": {"type": "resistor_grounded", "r_ohm": R_N},
                "rezystor_rownolegly_ohm": R_P,
            },
            "punkt neutralny musi być uziemiony przez dławik",
        ),
        (
            {
                "uklad": "ZN",
                "punkt_neutralny": {"type": "petersen_coil", "r_ohm": R_L, "x_ohm": X_L},
                "rezystor_rownolegly_ohm": 0.0,
            },
            "rezystor równoległy musi mieć R > 0",
        ),
        (
            {"uklad": "ZN", "rezystor_rownolegly_ohm": R_P},
            "punkt neutralny musi być uziemiony przez dławik",
        ),
    ],
    ids=["r0-ujemne", "x0-ujemne", "rownolegly-przy-rezystorze", "rownolegly-zero", "bez-pn"],
)
def test_zespol_uziemiajacy_sprzecznosc_danych_odmowa(
    h5: dict[str, Any], r: RefyH5, zespol: dict[str, Any], fragment: str
) -> None:
    """Sprzeczność danych zespołu (wartość ujemna, rezystor równoległy bez dławika — zał.
    Z.14) jest odmową kontraktu: przez operację domenową i przy walidacji rekordu wprost."""
    tresc = _odmowa_operacji(h5, _pole_uziemiajace(h5, r.szyna_sn_a), zespol)
    assert fragment in tresc
    with pytest.raises(ValueError, match=re.escape(fragment)):
        ZespolUziemiajacy.model_validate(zespol)
