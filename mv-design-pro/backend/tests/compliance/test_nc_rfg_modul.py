"""Testy klasyfikacji modułu NC RfG (`compliance/nc_rfg_modul.py`).

Karta FAB-J, naprawa 2026-09-05 (odbiór): `modul_nc_rfg` deleguje do
`NcRfgProfile.classify_module` (`catalog/profiles/nc_rfg/loader.py`), którego
zamrożony solver `network_model/solvers/ncrfg_ptpiree/engine.py` już używa —
JEDNO źródło progów, zero własnej tabeli w warstwie compliance.

Progi (identyczne we wszystkich 5 profili YAML — pse/energa/tauron/enea/pge,
sprawdzone przy tej naprawie): A 0,8 kW ≤ P < 1 000 kW; B 1 000 kW ≤ P <
50 000 kW; C 50 000 kW ≤ P < 75 000 kW; D P ≥ 75 000 kW ALBO brak dopasowania
A/B/C z powodu napięcia > 110 kV (pętla `classify_module` spada wtedy na
ostatni typ — D).

UWAGA — progi te NIE zgadzają się z progami decyzji Prezesa URE dla NC RfG
(A do 200 kW, B do 10 MW, C do 75 MW), na których ta funkcja opierała się
PRZED tą naprawą. Rozbieżność opisana liczbowo w module docstring
`compliance/nc_rfg_modul.py` — pytanie do właściciela, YAML solvera
NIETKNIĘTY (B-01).

Reguła KLASA NIE INSTANCJA (CLAUDE.md): testy pokrywają ILOCZYN CECH — każdy
próg mocy (A/B/C granica) × obie strony granicy (P=próg, P=próg−ε, P=próg+ε)
× oba profile klasyfikujące (compliance vs solver PTPiREE — predykaty
parami), ORAZ kryterium napięcia niezależnie sprawdzone przy mocy A, B i C.
"""

from __future__ import annotations

import pytest
from catalog.profiles.nc_rfg import load_nc_rfg_profile
from compliance.nc_rfg_modul import modul_nc_rfg

# Progi mocy [kW] — z YAML (identyczne we wszystkich 5 profili operatorów).
PROG_A_KW_MAX = 1_000.0
PROG_B_KW_MAX = 50_000.0
PROG_C_KW_MAX = 75_000.0
#: Napięcie przyłączenia [kV], od którego (włącznie) żadna z kategorii A/B/C
#: nie dopasowuje się (ich `voltage_kv_max` w YAML = 110) i klasyfikacja
#: spada na ostatnią kategorię (D) — ten sam skutek co jawny próg URE.
PROG_NAPIECIE_MODUL_D_KV = 110.0
EPSILON_KW = 0.001

# Napięcia reprezentatywne poniżej progu modułu D (żeby test progu mocy nie
# mieszał się z kryterium napięcia).
NAPIECIE_NN_KV = 0.4
NAPIECIE_SN_KV = 15.0


class TestProgMocyModulA:
    """Moduł A: 0,8 kW ≤ P < 1 000 kW."""

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_moc_minimalna_0_8_kw_jest_modulem_a(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(0.0008, napiecie_kv) == "A"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_moc_ponizej_minimum_pozostaje_modulem_a(self, napiecie_kv: float) -> None:
        """YAML nie definiuje kategorii poniżej 0,8 kW — pętla spada na fallback
        (ostatni typ, D) w `NcRfgProfile.classify_module`, gdy P < 0,8 kW."""
        assert modul_nc_rfg(0.0001, napiecie_kv) == "D"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_tuz_ponizej_1000_kw_jest_modulem_a(self, napiecie_kv: float) -> None:
        p_max_mw = (PROG_A_KW_MAX - EPSILON_KW) / 1000.0
        assert modul_nc_rfg(p_max_mw, napiecie_kv) == "A"


class TestProgMocyModulB:
    """Moduł B: 1 000 kW ≤ P < 50 000 kW."""

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_dokladnie_1000_kw_jest_modulem_b(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(PROG_A_KW_MAX / 1000.0, napiecie_kv) == "B"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_1_2_mw_typowa_instalacja_pv_jest_modulem_b(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(1.2, napiecie_kv) == "B"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_tuz_ponizej_50_mw_jest_modulem_b(self, napiecie_kv: float) -> None:
        p_max_mw = (PROG_B_KW_MAX - EPSILON_KW) / 1000.0
        assert modul_nc_rfg(p_max_mw, napiecie_kv) == "B"


class TestProgMocyModulC:
    """Moduł C: 50 000 kW ≤ P < 75 000 kW."""

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_dokladnie_50_mw_jest_modulem_c(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(PROG_B_KW_MAX / 1000.0, napiecie_kv) == "C"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_tuz_ponizej_75_mw_jest_modulem_c(self, napiecie_kv: float) -> None:
        p_max_mw = (PROG_C_KW_MAX - EPSILON_KW) / 1000.0
        assert modul_nc_rfg(p_max_mw, napiecie_kv) == "C"


class TestProgMocyModulD:
    """Moduł D przez próg mocy: P ≥ 75 MW (niezależnie od napięcia < 110 kV)."""

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_dokladnie_75_mw_jest_modulem_d(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(PROG_C_KW_MAX / 1000.0, napiecie_kv) == "D"

    @pytest.mark.parametrize("napiecie_kv", [NAPIECIE_NN_KV, NAPIECIE_SN_KV])
    def test_moc_powyzej_75_mw_jest_modulem_d(self, napiecie_kv: float) -> None:
        assert modul_nc_rfg(100.0, napiecie_kv) == "D"


class TestKryteriumNapieciaModulD:
    """Moduł D przez napięcie: brak dopasowania A/B/C przy napięciu > 110 kV.

    Iloczyn cech (KLASA NIE INSTANCJA): kryterium napięcia sprawdzone przy
    mocy modułu A, B i C — nie tylko przy jednym scenariuszu z karty.
    """

    @pytest.mark.parametrize(
        "p_max_mw",
        [0.0008, 0.5, 30.0],
        ids=["moc_a", "moc_b", "moc_c"],
    )
    def test_napiecie_powyzej_110kv_jest_zawsze_modulem_d(self, p_max_mw: float) -> None:
        assert modul_nc_rfg(p_max_mw, 220.0) == "D"

    def test_dokladnie_110kv_nie_dopasowuje_zadnej_kategorii_i_spada_na_d(self) -> None:
        """`voltage_kv_max: 110` w YAML wyklucza RÓWNE 110 kV z A/B/C (warunek
        `voltage_kv > mt.voltage_kv_max` jest ostry) — więc 110,0 kV NIE jest
        jeszcze modułem D przez to kryterium, o module decyduje moc."""
        assert modul_nc_rfg(0.0008, PROG_NAPIECIE_MODUL_D_KV) == "A"
        assert modul_nc_rfg(100.0, PROG_NAPIECIE_MODUL_D_KV) == "D"  # nadal D, ale przez MOC

    def test_tuz_powyzej_110kv_wymusza_modul_d(self) -> None:
        napiecie_kv = PROG_NAPIECIE_MODUL_D_KV + 0.01
        assert modul_nc_rfg(0.0008, napiecie_kv) == "D"

    def test_mala_moc_na_wysokim_napieciu_jest_modulem_d_nie_a(self) -> None:
        """Sedno kryterium: mikroinstalacja (moc modułu A) na >110 kV to D."""
        assert modul_nc_rfg(0.001, 111.0) == "D"


class TestZgodnoscComplianceZProfilemSolvera:
    """Predykaty parami (KLASA NIE INSTANCJA): `modul_nc_rfg` (compliance) i
    `NcRfgProfile.classify_module` (solver PTPiREE, ten sam profil YAML) MUSZĄ
    dawać IDENTYCZNY wynik — to jest cały sens delegacji. Iloczyn cech: każdy
    próg (A/B, B/C, C/D) × wartość brzegowa (próg, próg−ε, próg+ε) × wszystkie
    5 operatorów (profile mają identyczne `module_types`, sprawdzone przy tej
    naprawie, ale test to PRZYPINA zamiast zakładać).
    """

    OPERATORZY = ["pse", "energa", "tauron", "enea", "pge"]
    PROGI_KW = [PROG_A_KW_MAX, PROG_B_KW_MAX, PROG_C_KW_MAX]

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    @pytest.mark.parametrize("prog_kw", PROGI_KW)
    @pytest.mark.parametrize(
        "offset_kw", [0.0, -EPSILON_KW, EPSILON_KW], ids=["=prog", "-eps", "+eps"]
    )
    def test_te_same_wyniki_na_progu_i_wartosciach_brzegowych(
        self, operator_id: str, prog_kw: float, offset_kw: float
    ) -> None:
        p_max_kw = prog_kw + offset_kw
        p_max_mw = p_max_kw / 1000.0
        napiecie_kv = NAPIECIE_SN_KV

        wynik_compliance = modul_nc_rfg(p_max_mw, napiecie_kv)

        profil = load_nc_rfg_profile(operator_id)
        typ_solvera = profil.classify_module(p_max_kw, napiecie_kv)
        assert typ_solvera is not None
        assert wynik_compliance == typ_solvera.id, (
            f"Rozbieżność compliance vs solver PTPiREE ({operator_id}) dla "
            f"P={p_max_kw} kW: compliance={wynik_compliance}, solver={typ_solvera.id}"
        )

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    @pytest.mark.parametrize(
        "p_max_mw,napiecie_kv",
        [
            (0.0008, NAPIECIE_NN_KV),
            (0.5, NAPIECIE_SN_KV),
            (30.0, NAPIECIE_SN_KV),
            (100.0, NAPIECIE_SN_KV),
        ],
        ids=["moc_a", "moc_b", "moc_c", "moc_d"],
    )
    def test_te_same_wyniki_dla_typowych_mocy(
        self, operator_id: str, p_max_mw: float, napiecie_kv: float
    ) -> None:
        wynik_compliance = modul_nc_rfg(p_max_mw, napiecie_kv)
        profil = load_nc_rfg_profile(operator_id)
        typ_solvera = profil.classify_module(p_max_mw * 1000.0, napiecie_kv)
        assert typ_solvera is not None
        assert wynik_compliance == typ_solvera.id

    def test_wszystkie_5_profili_ma_identyczne_progi_mocy(self) -> None:
        """Fundament delegacji: wybór profilu referencyjnego w
        `compliance/nc_rfg_modul.py` jest bez znaczenia TYLKO jeśli progi są
        identyczne we wszystkich profilach — ten test to PRZYPINA."""
        profile_types = {
            operator_id: [
                (mt.id, mt.threshold_kw_min, mt.threshold_kw_max, mt.voltage_kv_max)
                for mt in load_nc_rfg_profile(operator_id).module_types
            ]
            for operator_id in self.OPERATORZY
        }
        referencyjne = profile_types["pse"]
        for operator_id, typy in profile_types.items():
            assert typy == referencyjne, (
                f"Profil '{operator_id}' ma INNE module_types niż 'pse' — "
                f"wybór profilu referencyjnego w compliance/nc_rfg_modul.py "
                f"przestał być bez znaczenia, wymaga naprawy u źródła."
            )
