"""Zwarcie przez impedancję przejścia Z_f w rdzeniu IEC 60909 (karta OD-14, partia integracji 10).

INTENCJA. Do partii 10 tryb IMPEDANCE scenariusza zwarciowego był zaślepką: kwalifikowalność
zwracała BLOKER „binding unsupported", a rdzeń nie znał Z_f. Teraz Z_f = R_f + jX_f wchodzi
do JEDNEGO toku obliczenia (`ShortCircuitIEC60909Solver._oblicz_zwarcie`) dla czterech rodzajów
zwarcia. Testy przypinają obietnice kontraktu
`docs/domain/KONTRAKT_SCENARIUSZY_ZWARCIOWYCH_TRYB_IMPEDANCE.md` §2 jako ILOCZYN CECH:

  * rodzaj zwarcia {3F, 2F, 1F, 2F+G} × Z_f {brak, 0, R_f, jX_f, R_f + jX_f} — wyrocznia
    analityczna na sieci promieniowej liczonej RĘCZNIE (Z_Q z mocy zwarciowej + linia; Z_kk
    w węźle końcowym to dokładnie Z_Q + Z_L, bez macierzy);
  * Z_f nieobecna — wynik bit w bit (ślad, słownik, każda wielkość) jak przed kartą;
  * Z_f niedopuszczalna {X_f < 0, R_f < 0, NaN, ∞} × rodzaj — odmowa wejścia rdzenia z kodem
    i odwołaniem do węzła, treść bez identyfikatora;
  * warunek sanity |I_k(Z_f)| ≤ |I_k(0)|: dla pętli szeregowych (3F, 2F, 1F) wynika z algebry,
    dla 2F+G NIE — przypięty kontrprzykład (Z_0 rezystancyjna, Z_f indukcyjna), w którym prąd
    przez impedancję przejścia jest WIĘKSZY niż metaliczny i ślad mówi to wprost;
  * wkład falownika × rodzaj — tłumienie pętli |Z(0)|/|Z(Z_f)| w sumie, w wkładach źródeł
    i w wkładach gałęziowych; bilans rozpływu Thevenina w węźle zwarcia domyka się z Z_f;
  * determinizm — dwa biegi na tym samym wejściu dają ten sam słownik wyniku.
"""

from __future__ import annotations

import cmath
import math

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.grid_source import GridShortCircuitSource
from network_model.core.impedancja_przejscia import (
    KOD_IMPEDANCJA_NIESKONCZONA,
    KOD_IMPEDANCJA_POJEMNOSCIOWA,
    KOD_REZYSTANCJA_UJEMNA,
)
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.odmowa_danych import RODZAJ_WEZEL, OdmowaWejsciaRdzenia, OdwolanieElementu
from network_model.solvers.short_circuit_core import build_zbus
from network_model.solvers.short_circuit_iec60909 import (
    THEVENIN_GRID_SOURCE_ID,
    ShortCircuitIEC60909Solver,
    ShortCircuitType,
)

# ---------------------------------------------------------------------------
# Sieć ręczna: zasilanie 15 kV S_k'' = 250 MVA (c = 1,1, R/X = 0,1) + linia 5 km
# ---------------------------------------------------------------------------

UN_KV = 15.0
C = 1.1
SK_MVA = 250.0
RX_Q = 0.1
R_L_OHM_KM = 0.206
X_L_OHM_KM = 0.35
DLUGOSC_KM = 5.0
WEZEL = "wezel/koniec-linii-7f3a"

_ZQ_ABS = C * UN_KV**2 / SK_MVA
_XQ = _ZQ_ABS / math.sqrt(1.0 + RX_Q**2)
Z_Q = complex(RX_Q * _XQ, _XQ)
Z_L = complex(R_L_OHM_KM * DLUGOSC_KM, X_L_OHM_KM * DLUGOSC_KM)
Z_K = Z_Q + Z_L  # Z_kk w węźle końcowym — policzona ręcznie, bez macierzy

RODZAJE = [
    ShortCircuitType.THREE_PHASE,
    ShortCircuitType.TWO_PHASE,
    ShortCircuitType.SINGLE_PHASE_GROUND,
    ShortCircuitType.TWO_PHASE_GROUND,
]
DOZIEMNE = {ShortCircuitType.SINGLE_PHASE_GROUND, ShortCircuitType.TWO_PHASE_GROUND}
WARTOSCI_ZF = {
    "rezystancja": complex(2.0, 0.0),
    "reaktancja": complex(0.0, 1.5),
    "zespolona": complex(2.0, 1.5),
}


def _siec(*, falownik: bool = False) -> NetworkGraph:
    graf = NetworkGraph()
    graf.add_node(
        Node(
            id="zasilanie",
            name="Zasilanie",
            node_type=NodeType.SLACK,
            voltage_level=UN_KV,
            active_power=0.0,
            reactive_power=0.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    graf.add_node(
        Node(
            id=WEZEL,
            name="Koniec linii",
            node_type=NodeType.PQ,
            voltage_level=UN_KV,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graf.add_branch(
        LineBranch(
            id="linia",
            name="Linia",
            branch_type=BranchType.LINE,
            from_node_id="zasilanie",
            to_node_id=WEZEL,
            r_ohm_per_km=R_L_OHM_KM,
            x_ohm_per_km=X_L_OHM_KM,
            b_us_per_km=0.0,
            length_km=DLUGOSC_KM,
            rated_current_a=0.0,
        )
    )
    graf.add_grid_sc_source(
        GridShortCircuitSource(id="siec", name="Sieć", node_id="zasilanie", z_ohm=Z_Q)
    )
    if falownik:
        graf.add_inverter_source(
            InverterSource(
                id="falownik",
                name="Falownik",
                node_id=WEZEL,
                in_rated_a=100.0,
                k_sc=1.2,
                contributes_negative_sequence=True,
                contributes_zero_sequence=True,
            )
        )
    return graf


def _z0_bus(graf: NetworkGraph, mnoznik: complex = 3.0) -> np.ndarray:
    _, z1_bus = build_zbus(graf)
    return z1_bus * mnoznik


def _licz(
    rodzaj: ShortCircuitType,
    graf: NetworkGraph,
    z_f: complex | None,
    *,
    z0_bus: np.ndarray | None = None,
    wklady: bool = False,
):
    wspolne = {
        "graph": graf,
        "fault_node_id": WEZEL,
        "c_factor": C,
        "tk_s": 1.0,
        "include_branch_contributions": wklady,
    }
    if z_f is not None:
        wspolne["z_f_ohm"] = z_f
    if rodzaj in DOZIEMNE:
        wspolne["z0_bus"] = z0_bus if z0_bus is not None else _z0_bus(graf)
    metoda = {
        ShortCircuitType.THREE_PHASE: ShortCircuitIEC60909Solver.compute_3ph_short_circuit,
        ShortCircuitType.TWO_PHASE: ShortCircuitIEC60909Solver.compute_2ph_short_circuit,
        ShortCircuitType.SINGLE_PHASE_GROUND: ShortCircuitIEC60909Solver.compute_1ph_short_circuit,
        ShortCircuitType.TWO_PHASE_GROUND: (
            ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit
        ),
    }[rodzaj]
    return metoda(**wspolne)


def _petla_reczna(rodzaj: ShortCircuitType, z_f: complex) -> complex:
    """Impedancja pętli z kontraktu §2 — ręcznie, z Z_1 = Z_2 = Z_K i Z_0 = 3·Z_K."""
    z1 = z2 = Z_K
    z0 = 3.0 * Z_K
    if rodzaj == ShortCircuitType.THREE_PHASE:
        return z1 + z_f
    if rodzaj == ShortCircuitType.TWO_PHASE:
        return z1 + z2 + z_f
    if rodzaj == ShortCircuitType.SINGLE_PHASE_GROUND:
        return z1 + z2 + z0 + 3.0 * z_f
    return z1 + z2 * (z0 + 3.0 * z_f) / (z2 + z0 + 3.0 * z_f)


def _wspolczynnik_napiecia(rodzaj: ShortCircuitType) -> float:
    if rodzaj == ShortCircuitType.THREE_PHASE:
        return 1.0 / math.sqrt(3.0)
    if rodzaj == ShortCircuitType.SINGLE_PHASE_GROUND:
        return math.sqrt(3.0)
    return 1.0


def _kroki(wynik) -> dict[str, dict]:
    return {krok["key"]: krok for krok in wynik.white_box_trace}


# ---------------------------------------------------------------------------
# Wyrocznia analityczna: rodzaj × Z_f
# ---------------------------------------------------------------------------


def test_impedancja_wezla_sieci_recznej_to_suma_zasilania_i_linii() -> None:
    """Podstawa wyroczni: Z_kk z macierzy = Z_Q + Z_L policzone ręcznie."""
    wynik = _licz(ShortCircuitType.THREE_PHASE, _siec(), None)
    assert wynik.zkk_ohm == pytest.approx(Z_K, rel=1e-9)


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize("etykieta", sorted(WARTOSCI_ZF))
def test_prad_przez_impedancje_przejscia_zgodny_z_wyrocznia_reczna(
    rodzaj: ShortCircuitType, etykieta: str
) -> None:
    z_f = WARTOSCI_ZF[etykieta]
    wynik = _licz(rodzaj, _siec(), z_f)
    petla = _petla_reczna(rodzaj, z_f)
    petla_metaliczna = _petla_reczna(rodzaj, 0j)
    un_v = UN_KV * 1000.0
    oczekiwany = C * un_v * _wspolczynnik_napiecia(rodzaj) / abs(petla)
    oczekiwany_metaliczny = C * un_v * _wspolczynnik_napiecia(rodzaj) / abs(petla_metaliczna)

    assert wynik.zkk_ohm == pytest.approx(petla, rel=1e-9)
    assert wynik.ikss_a == pytest.approx(oczekiwany, rel=1e-9)
    assert wynik.z_f_ohm == z_f
    assert wynik.zkk_metaliczne_ohm == pytest.approx(petla_metaliczna, rel=1e-9)
    assert wynik.ikss_metaliczny_a == pytest.approx(oczekiwany_metaliczny, rel=1e-9)
    assert wynik.poza_zakresem_iec60909 is True
    slownik = wynik.to_dict()
    for klucz in ("z_f_ohm", "zkk_metaliczne_ohm", "ikss_metaliczny_a", "poza_zakresem_iec60909"):
        assert klucz in slownik
    kroki = _kroki(wynik)
    assert kroki["Zf"]["result"]["poza_zakresem_iec60909"] is True
    assert "Z_f" in kroki["Zk"]["formula_latex"] or "Z_{f}" in kroki["Zk"]["formula_latex"]


def test_sonda_liczbowa_reczna_zwarcie_trojfazowe_przez_rezystancje_2_om() -> None:
    """Sonda ręczna z meldunku: |Z_k| = 2,9588 Ω, I_k3'' = 3219,7 A; R_f = 2 Ω daje
    |Z_k + Z_f| = 4,1556 Ω i I_k3''(Z_f) = 2292,4 A (stosunek 0,7120)."""
    wynik = _licz(ShortCircuitType.THREE_PHASE, _siec(), complex(2.0, 0.0))
    assert abs(Z_K) == pytest.approx(2.958755, abs=1e-6)
    assert wynik.ikss_metaliczny_a == pytest.approx(3219.6918, abs=1e-3)
    assert wynik.ikss_a == pytest.approx(2292.4451, abs=1e-3)
    assert wynik.ikss_a / wynik.ikss_metaliczny_a == pytest.approx(0.712008, abs=1e-6)


# ---------------------------------------------------------------------------
# Z_f nieobecna: bit w bit
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize("falownik", [False, True], ids=["bez_falownika", "z_falownikiem"])
def test_brak_impedancji_przejscia_zostawia_wynik_bit_w_bit(
    rodzaj: ShortCircuitType, falownik: bool
) -> None:
    graf = _siec(falownik=falownik)
    z0 = _z0_bus(graf)
    domyslny = _licz(rodzaj, graf, None, z0_bus=z0, wklady=True).to_dict()
    jawny_brak = getattr(
        ShortCircuitIEC60909Solver,
        {
            ShortCircuitType.THREE_PHASE: "compute_3ph_short_circuit",
            ShortCircuitType.TWO_PHASE: "compute_2ph_short_circuit",
            ShortCircuitType.SINGLE_PHASE_GROUND: "compute_1ph_short_circuit",
            ShortCircuitType.TWO_PHASE_GROUND: "compute_2ph_ground_short_circuit",
        }[rodzaj],
    )(
        graph=graf,
        fault_node_id=WEZEL,
        c_factor=C,
        tk_s=1.0,
        include_branch_contributions=True,
        z_f_ohm=None,
        **({"z0_bus": z0} if rodzaj in DOZIEMNE else {}),
    ).to_dict()
    assert domyslny == jawny_brak
    for klucz in ("z_f_ohm", "zkk_metaliczne_ohm", "ikss_metaliczny_a", "poza_zakresem_iec60909"):
        assert klucz not in domyslny
    assert not any(krok["key"] in {"Zf", "sanity_Zf"} for krok in domyslny["white_box_trace"])


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize("falownik", [False, True], ids=["bez_falownika", "z_falownikiem"])
@pytest.mark.parametrize(
    "z_f",
    [0j, complex(-0.0, 0.0), complex(0.0, -0.0)],
    ids=["zero", "r_minus_zero", "x_minus_zero"],
)
def test_zerowa_impedancja_przejscia_to_zwarcie_metaliczne_bit_w_bit(
    rodzaj: ShortCircuitType, falownik: bool, z_f: complex
) -> None:
    """Kontrakt OD-14 §1 (R_f = X_f = 0 ≡ zwarcie metaliczne, parytet bit w bit) i §3 (flaga
    „poza zakresem IEC 60909" wyłącznie dla Z_f ≠ 0): wynik ze słownikiem, śladem i wkładami
    identyczny z biegiem bez Z_f — także dla zer ze znakiem minus (IEEE 754)."""
    graf = _siec(falownik=falownik)
    z0 = _z0_bus(graf)
    metaliczny = _licz(rodzaj, graf, None, z0_bus=z0, wklady=True)
    zerowa = _licz(rodzaj, graf, z_f, z0_bus=z0, wklady=True)
    assert zerowa.to_dict() == metaliczny.to_dict()
    assert zerowa.z_f_ohm is None
    assert zerowa.poza_zakresem_iec60909 is None


# ---------------------------------------------------------------------------
# Odmowy: Z_f niedopuszczalna × rodzaj
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize(
    ("z_f", "kod"),
    [
        (complex(1.0, -0.5), KOD_IMPEDANCJA_POJEMNOSCIOWA),
        (complex(-0.1, 0.5), KOD_REZYSTANCJA_UJEMNA),
        (complex(-0.1, -0.5), KOD_IMPEDANCJA_POJEMNOSCIOWA),
        (complex(math.nan, 0.5), KOD_IMPEDANCJA_NIESKONCZONA),
        (complex(1.0, math.inf), KOD_IMPEDANCJA_NIESKONCZONA),
    ],
    ids=["x_ujemna", "r_ujemna", "obie_ujemne", "r_nan", "x_inf"],
)
def test_niedopuszczalna_impedancja_przejscia_to_odmowa_wejscia_rdzenia(
    rodzaj: ShortCircuitType, z_f: complex, kod: str
) -> None:
    with pytest.raises(OdmowaWejsciaRdzenia) as odmowa:
        _licz(rodzaj, _siec(), z_f)
    (rekord,) = odmowa.value.rekordy
    assert rekord.kod == kod
    assert rekord.odwolania == (OdwolanieElementu(RODZAJ_WEZEL, WEZEL),)
    assert WEZEL not in str(odmowa.value)
    assert WEZEL not in rekord.tresc


# ---------------------------------------------------------------------------
# Warunek sanity |I_k(Z_f)| ≤ |I_k(0)|
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rodzaj",
    [
        ShortCircuitType.THREE_PHASE,
        ShortCircuitType.TWO_PHASE,
        ShortCircuitType.SINGLE_PHASE_GROUND,
    ],
    ids=lambda r: r.value,
)
@pytest.mark.parametrize("etykieta", sorted(WARTOSCI_ZF))
def test_petla_szeregowa_spelnia_warunek_z_algebry(rodzaj: ShortCircuitType, etykieta: str) -> None:
    wynik = _licz(rodzaj, _siec(falownik=True), WARTOSCI_ZF[etykieta])
    krok = _kroki(wynik)["sanity_Zf"]
    assert krok["result"]["warunek_wynika_z_algebry"] is True
    assert krok["result"]["warunek_spelniony"] is True
    assert wynik.ikss_a <= wynik.ikss_metaliczny_a * (1.0 + 1e-12)


def test_dwufazowe_z_ziemia_kontrprzyklad_prad_rosnie_i_slad_to_mowi() -> None:
    """2F+G: Z_0 rezystancyjna (5 Ω), 3·Z_f = j2 Ω — |Z_2 ∥ (Z_0 + 3Z_f)| < |Z_2 ∥ Z_0|,
    więc prąd przez impedancję przejścia jest WIĘKSZY niż metaliczny. Ślad podaje stosunek
    i NIE twierdzi, że warunek wynika z algebry (kontrakt §2, korekta partii 10)."""
    graf = _siec()
    builder, z1_bus = build_zbus(graf)
    z0_bus = np.eye(z1_bus.shape[0], dtype=complex) * (5.0 / builder.get_zbase_ohm(WEZEL))
    wynik = _licz(ShortCircuitType.TWO_PHASE_GROUND, graf, complex(0.0, 2.0 / 3.0), z0_bus=z0_bus)
    krok = _kroki(wynik)["sanity_Zf"]
    assert wynik.ikss_a > wynik.ikss_metaliczny_a
    assert krok["result"]["warunek_wynika_z_algebry"] is False
    assert krok["result"]["warunek_spelniony"] is False
    assert krok["result"]["stosunek"] == pytest.approx(
        wynik.ikss_a / wynik.ikss_metaliczny_a, rel=1e-12
    )


# ---------------------------------------------------------------------------
# Wkład falownika: tłumienie pętli × rodzaj
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
@pytest.mark.parametrize("etykieta", ["rezystancja", "reaktancja", "zespolona"])
def test_wklad_falownika_tlumiony_stosunkiem_impedancji_petli(
    rodzaj: ShortCircuitType, etykieta: str
) -> None:
    graf = _siec(falownik=True)
    metaliczny = _licz(rodzaj, graf, None, wklady=True)
    z_f = WARTOSCI_ZF[etykieta]
    przez_zf = _licz(rodzaj, graf, z_f, wklady=True)
    tlumienie = abs(metaliczny.zkk_ohm) / abs(przez_zf.zkk_ohm)

    assert metaliczny.ik_inverters_a > 0.0
    assert przez_zf.ik_inverters_a == pytest.approx(metaliczny.ik_inverters_a * tlumienie)
    assert przez_zf.ik_total_a == pytest.approx(przez_zf.ik_thevenin_a + przez_zf.ik_inverters_a)
    wklad_0 = next(w for w in metaliczny.contributions if w.source_id == "falownik")
    wklad_f = next(w for w in przez_zf.contributions if w.source_id == "falownik")
    assert wklad_f.i_contrib_a == pytest.approx(wklad_0.i_contrib_a * tlumienie)
    galezie_0 = {
        (g.branch_id, g.source_id): g.i_contrib_a
        for g in metaliczny.branch_contributions or []
        if g.source_id == "falownik"
    }
    galezie_f = {
        (g.branch_id, g.source_id): g.i_contrib_a
        for g in przez_zf.branch_contributions or []
        if g.source_id == "falownik"
    }
    assert galezie_0.keys() == galezie_f.keys()
    for klucz, wartosc in galezie_0.items():
        assert galezie_f[klucz] == pytest.approx(wartosc * tlumienie)
    assert _kroki(przez_zf)["sanity_Zf"]["inputs"]["tlumienie_petli"] == pytest.approx(tlumienie)


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
def test_rozplyw_thevenina_bilansuje_sie_w_wezle_zwarcia_z_impedancja_przejscia(
    rodzaj: ShortCircuitType,
) -> None:
    wynik = _licz(rodzaj, _siec(), complex(2.0, 1.5), wklady=True)
    doplyw = 0.0
    for g in wynik.branch_contributions or []:
        if g.source_id != THEVENIN_GRID_SOURCE_ID:
            continue
        if (g.to_node_id == WEZEL and g.direction == "from_to") or (
            g.from_node_id == WEZEL and g.direction == "to_from"
        ):
            doplyw += g.i_contrib_a
        elif (g.from_node_id == WEZEL and g.direction == "from_to") or (
            g.to_node_id == WEZEL and g.direction == "to_from"
        ):
            doplyw -= g.i_contrib_a
    assert wynik.ik_thevenin_a > 0.0
    assert doplyw == pytest.approx(wynik.ik_thevenin_a, rel=1e-9, abs=1e-6)


@pytest.mark.parametrize("rodzaj", RODZAJE, ids=lambda r: r.value)
def test_determinizm_z_impedancja_przejscia(rodzaj: ShortCircuitType) -> None:
    pierwszy = _licz(rodzaj, _siec(falownik=True), complex(2.0, 1.5), wklady=True).to_dict()
    drugi = _licz(rodzaj, _siec(falownik=True), complex(2.0, 1.5), wklady=True).to_dict()
    assert pierwszy == drugi


def test_kat_impedancji_petli_rosnie_ku_rezystancji_przy_r_f() -> None:
    """R_f przesuwa pętlę ku osi rzeczywistej: R/X pętli rośnie, współczynnik κ maleje."""
    metaliczny = _licz(ShortCircuitType.THREE_PHASE, _siec(), None)
    przez_rf = _licz(ShortCircuitType.THREE_PHASE, _siec(), complex(2.0, 0.0))
    assert cmath.phase(przez_rf.zkk_ohm) < cmath.phase(metaliczny.zkk_ohm)
    assert przez_rf.rx_ratio > metaliczny.rx_ratio
    assert przez_rf.kappa < metaliczny.kappa
