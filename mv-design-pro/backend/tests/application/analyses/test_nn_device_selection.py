"""Testy doboru aparatu zabezpieczającego nN (karta P0.7, §0.5).

Pokrywa: cztery kryteria doboru (spełnia/nie spełnia/nierozstrzygalne),
determinizm rankingu (niezależny od kolejności wejścia kandydatów),
dobór na obwodzie referencyjnym (orkiestracja pełna z ENM), oraz N-D5
(FUSE nigdy przez równanie przekaźnikowe IEC 60255 — dowód strukturalny
przez monitorowanie wywołań solvera przekaźnikowego)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from application.analyses.nn_device_selection import (
    KIND_FUSE_SWITCH,
    KIND_MCB,
    KIND_MCCB,
    KandydatAparatuNn,
    KryteriumStatus,
    ocen_kandydatow_nn,
    oceniaj_kandydata,
    wybierz_aparat_dla_obwodu_nn,
    zbierz_kandydatow_z_katalogu,
)
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)
from network_model.catalog.repository import get_default_mv_catalog

# =============================================================================
# FIXTURES — kandydaci syntetyczni (kontrolowane dane, bez zależności od
# konkretnych rekordów katalogu, żeby test kryteriów nie rozjeżdżał się przy
# zmianie danych katalogowych).
# =============================================================================


def _mcb(in_a: float = 16.0, klasa: str = "B", icn_ka: float | None = 6.0) -> KandydatAparatuNn:
    return KandydatAparatuNn(
        id=f"mcb_{klasa.lower()}{int(in_a)}",
        nazwa=f"MCB {klasa}{int(in_a)}",
        kind=KIND_MCB,
        in_a=in_a,
        zdolnosc_wylaczania_ka=icn_ka,
        klasa_mcb=klasa,
    )


def _fuse_switch(in_a: float = 63.0, conditional_ka: float | None = 50.0) -> KandydatAparatuNn:
    return KandydatAparatuNn(
        id=f"fuse_{int(in_a)}",
        nazwa=f"Rozłącznik + gG {int(in_a)}A",
        kind=KIND_FUSE_SWITCH,
        in_a=in_a,
        zdolnosc_wylaczania_ka=conditional_ka,
    )


def _mccb(in_a: float = 400.0, i_cu_ka: float | None = 50.0) -> KandydatAparatuNn:
    return KandydatAparatuNn(
        id=f"mccb_{int(in_a)}",
        nazwa=f"Wyłącznik {int(in_a)}A",
        kind=KIND_MCCB,
        in_a=in_a,
        zdolnosc_wylaczania_ka=i_cu_ka,
    )


# =============================================================================
# WALIDACJA KandydatAparatuNn — spójność danych fuse_breaking_capacity_ka
# =============================================================================


class TestKandydatAparatuNnWalidacja:
    def test_fuse_switch_z_fuse_breaking_capacity_ka(self) -> None:
        k = KandydatAparatuNn(
            id="x",
            nazwa="x",
            kind=KIND_FUSE_SWITCH,
            in_a=63.0,
            zdolnosc_wylaczania_ka=50.0,
            fuse_breaking_capacity_ka=120.0,
        )
        assert k.fuse_breaking_capacity_ka == 120.0
        assert k.to_dict()["fuse_breaking_capacity_ka"] == 120.0

    def test_kombinacja_przekraczajaca_wlasna_zdolnosc_wkladki_odrzucona(self) -> None:
        """Dane fizycznie niemożliwe (kombinacja > sama wkładka) — jawny błąd,
        nie ciche zaakceptowanie sprzecznych danych katalogowych."""
        with pytest.raises(ValueError):
            KandydatAparatuNn(
                id="x",
                nazwa="x",
                kind=KIND_FUSE_SWITCH,
                in_a=63.0,
                zdolnosc_wylaczania_ka=150.0,  # > 120 kA wkładki — niespójne
                fuse_breaking_capacity_ka=120.0,
            )

    def test_brak_fuse_breaking_capacity_ka_nie_blokuje(self) -> None:
        """Pole opcjonalne — jego brak nie uniemożliwia budowy kandydata."""
        k = KandydatAparatuNn(
            id="x",
            nazwa="x",
            kind=KIND_FUSE_SWITCH,
            in_a=63.0,
            zdolnosc_wylaczania_ka=50.0,
        )
        assert k.fuse_breaking_capacity_ka is None


# =============================================================================
# KRYTERIUM (i) Ib<=In<=Iz′
# =============================================================================


class TestKryteriumIbInIz:
    def test_spelnia(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=16.0),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "Ib<=In<=Iz′")
        assert k.status == KryteriumStatus.SPELNIA

    def test_nie_spelnia_in_za_maly(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=6.0),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "Ib<=In<=Iz′")
        assert k.status == KryteriumStatus.NIE_SPELNIA

    def test_nie_spelnia_in_za_duzy(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=32.0),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "Ib<=In<=Iz′")
        assert k.status == KryteriumStatus.NIE_SPELNIA


# =============================================================================
# KRYTERIUM (ii) I2<=1,45·Iz′
# =============================================================================


class TestKryteriumI2:
    def test_mcb_spelnia(self) -> None:
        # I2 = 1.45*16 = 23.2; limit = 1.45*20 = 29.0 -> spelnia
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=16.0),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "I2<=1,45·Iz′")
        assert k.status == KryteriumStatus.SPELNIA
        assert k.wartosci["i2_a"] == pytest.approx(1.45 * 16.0)

    def test_mcb_nie_spelnia(self) -> None:
        # I2 = 1.45*20 = 29.0; limit = 1.45*13 = 18.85 -> nie spelnia
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=20.0),
            ib_a=10.0,
            iz_prime_a=13.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "I2<=1,45·Iz′")
        assert k.status == KryteriumStatus.NIE_SPELNIA

    def test_fuse_switch_spelnia(self) -> None:
        # I2 = 1.6*25 = 40; limit = 1.45*32 = 46.4 -> spelnia
        wynik = oceniaj_kandydata(
            kandydat=_fuse_switch(in_a=25.0),
            ib_a=10.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "I2<=1,45·Iz′")
        assert k.status == KryteriumStatus.SPELNIA
        assert k.wartosci["i2_a"] == pytest.approx(1.6 * 25.0)

    def test_mccb_nierozstrzygalne(self) -> None:
        """MCCB bez nastaw elektronicznych — trzeci stan, NIE ciche odrzucenie/zaliczenie."""
        wynik = oceniaj_kandydata(
            kandydat=_mccb(in_a=100.0),
            ib_a=10.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "I2<=1,45·Iz′")
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE


# =============================================================================
# KRYTERIUM (iii) zdolność wyłączania >= Ik″max
# =============================================================================


class TestKryteriumZdolnoscWylaczania:
    def test_spelnia(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(icn_ka=10.0),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if "Zdolność wyłączania" in k.nazwa)
        assert k.status == KryteriumStatus.SPELNIA

    def test_nie_spelnia(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(icn_ka=4.5),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if "Zdolność wyłączania" in k.nazwa)
        assert k.status == KryteriumStatus.NIE_SPELNIA

    def test_nierozstrzygalne_brak_pola_katalogowego(self) -> None:
        """Katalog bez zdolności wyłączania — trzeci stan, kandydat NIE znika z listy."""
        wynik = oceniaj_kandydata(
            kandydat=_mcb(icn_ka=None),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if "Zdolność wyłączania" in k.nazwa)
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE
        assert wynik.kwalifikuje_sie is False  # nierozstrzygalne != spelnia

    def test_nierozstrzygalne_brak_ik_max(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=None,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if "Zdolność wyłączania" in k.nazwa)
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE


# =============================================================================
# KRYTERIUM (iv) SWZ przy Ik_min (REUSE pakietu swz)
# =============================================================================


class TestKryteriumSwz:
    def test_mcb_spelnia_wysoki_ik1_min(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=16.0, klasa="B"),
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,  # >> Ia=5*16=80A
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "SWZ przy Ik_min")
        assert k.status == KryteriumStatus.SPELNIA

    def test_mcb_nie_spelnia_niski_ik1_min(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mcb(in_a=63.0, klasa="C"),
            ib_a=10.0,
            iz_prime_a=80.0,
            ik_max_ka=6.0,
            ik1_min_a=50.0,  # << Ia=10*63=630A
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "SWZ przy Ik_min")
        assert k.status == KryteriumStatus.NIE_SPELNIA

    def test_fuse_switch_nierozstrzygalne(self) -> None:
        """gG: G-D2 puste w pakiecie SWZ (P0.6) — zawsze nierozstrzygalne, nigdy PASS."""
        wynik = oceniaj_kandydata(
            kandydat=_fuse_switch(in_a=25.0),
            ib_a=10.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "SWZ przy Ik_min")
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE

    def test_mccb_nierozstrzygalne(self) -> None:
        wynik = oceniaj_kandydata(
            kandydat=_mccb(in_a=100.0),
            ib_a=10.0,
            iz_prime_a=120.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
        )
        k = next(k for k in wynik.kryteria if k.nazwa == "SWZ przy Ik_min")
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE


# =============================================================================
# N-D5 — FUSE nigdy przez równanie przekaźnikowe IEC 60255 (iniekcja)
# =============================================================================


class TestND5FuseNigdyPrzezRownaniePrzekaznikowe:
    def test_fuse_switch_ocena_nie_woła_solvera_iec60255(self) -> None:
        """Iniekcja: kandydat FUSE_SWITCH oceniony bez ANI JEDNEGO wywołania
        `compute_curve_trip_time` (solver relayowy IEC 60255) — dowód
        strukturalny, że fizyka gG (`compute_fuse_gg_gate`) jest JEDYNĄ
        ścieżką, nigdy relayowa formuła IDMT po cichu podstawiona za gG."""
        with patch(
            "network_model.solvers.protection_iec60255.compute_curve_trip_time"
        ) as mock_relay:
            wynik = oceniaj_kandydata(
                kandydat=_fuse_switch(in_a=63.0),
                ib_a=10.0,
                iz_prime_a=80.0,
                ik_max_ka=6.0,
                ik1_min_a=1000.0,
                u0_v=230.0,
            )
        mock_relay.assert_not_called()
        assert wynik is not None  # ocena mimo to zakonczona (I2 przez compute_fuse_gg_gate)

    def test_fuse_switch_i2_uzywa_wylacznie_fuse_gg_gate(self) -> None:
        """I2 dla gG POCHODZI z `compute_fuse_gg_gate`, nie z policzenia lokalnego."""
        with patch(
            "application.analyses.nn_device_selection.compute_fuse_gg_gate",
            wraps=__import__(
                "network_model.solvers.protection_lv_curves", fromlist=["compute_fuse_gg_gate"]
            ).compute_fuse_gg_gate,
        ) as spy:
            oceniaj_kandydata(
                kandydat=_fuse_switch(in_a=63.0),
                ib_a=10.0,
                iz_prime_a=80.0,
                ik_max_ka=6.0,
                ik1_min_a=1000.0,
                u0_v=230.0,
            )
        assert spy.call_count == 1

    def test_mccb_i2_nie_uzywa_ani_mcb_ani_fuse_bramek(self) -> None:
        """MCCB bez nastaw: I2 NIE woła ani MCB-thermal, ani FUSE_GG bramki
        (byłoby to podstawienie cudzej fizyki) — jawny trzeci stan zamiast."""
        with (
            patch("application.analyses.nn_device_selection.compute_mcb_thermal_point") as mock_mcb,
            patch("application.analyses.nn_device_selection.compute_fuse_gg_gate") as mock_fuse,
        ):
            wynik = oceniaj_kandydata(
                kandydat=_mccb(in_a=100.0),
                ib_a=10.0,
                iz_prime_a=120.0,
                ik_max_ka=6.0,
                ik1_min_a=1000.0,
                u0_v=230.0,
            )
        mock_mcb.assert_not_called()
        mock_fuse.assert_not_called()
        k = next(k for k in wynik.kryteria if k.nazwa == "I2<=1,45·Iz′")
        assert k.status == KryteriumStatus.NIEROZSTRZYGALNE


# =============================================================================
# RANKING DETERMINISTYCZNY
# =============================================================================


class TestRankingDeterminizm:
    def test_dwa_biegi_identyczny_wynik(self) -> None:
        kandydaci = (_mcb(in_a=16.0), _mcb(in_a=10.0), _fuse_switch(in_a=25.0))
        w1 = ocen_kandydatow_nn(
            ib_a=8.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=kandydaci,
        )
        w2 = ocen_kandydatow_nn(
            ib_a=8.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=kandydaci,
        )
        assert w1.deterministic_signature == w2.deterministic_signature
        assert w1.to_dict() == w2.to_dict()

    def test_wynik_niezalezny_od_kolejnosci_wejscia(self) -> None:
        """Ta sama pula kandydatów w INNEJ kolejności wejściowej -> identyczny wynik."""
        a, b, c = _mcb(in_a=16.0), _mcb(in_a=10.0), _fuse_switch(in_a=25.0)
        w1 = ocen_kandydatow_nn(
            ib_a=8.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=(a, b, c),
        )
        w2 = ocen_kandydatow_nn(
            ib_a=8.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=(c, b, a),
        )
        assert w1.deterministic_signature == w2.deterministic_signature
        assert [k.kandydat.id for k in w1.kandydaci] == [k.kandydat.id for k in w2.kandydaci]

    def test_rekomendacja_najmniejsze_spelniajace_in_tie_break_id(self) -> None:
        kandydaci = (
            _mcb(in_a=16.0, klasa="C"),  # id "mcb_c16"
            _mcb(in_a=16.0, klasa="B"),  # id "mcb_b16" -- takie samo In, mniejszy id
            _mcb(in_a=10.0, klasa="B"),  # najmniejsze In, powinno wygrac
        )
        wynik = ocen_kandydatow_nn(
            ib_a=5.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=kandydaci,
        )
        assert wynik.rekomendacja is not None
        assert wynik.rekomendacja.in_a == 10.0

    def test_tie_break_po_id_gdy_rowne_in(self) -> None:
        kandydaci = (
            _mcb(in_a=16.0, klasa="C"),  # id "mcb_c16"
            _mcb(in_a=16.0, klasa="B"),  # id "mcb_b16" < "mcb_c16"
        )
        wynik = ocen_kandydatow_nn(
            ib_a=5.0,
            iz_prime_a=32.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=kandydaci,
        )
        assert wynik.rekomendacja is not None
        assert wynik.rekomendacja.id == "mcb_b16"

    def test_kandydat_niekwalifikujacy_sie_nie_znika_z_listy(self) -> None:
        """Trzeci stan / FAIL: kandydat pozostaje w pełnej liście, nie jest cicho usuwany."""
        kandydaci = (_mcb(in_a=100.0),)  # za duży In wobec Iz'
        wynik = ocen_kandydatow_nn(
            ib_a=5.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
            ik1_min_a=1000.0,
            u0_v=230.0,
            kandydaci=kandydaci,
        )
        assert len(wynik.kandydaci) == 1
        assert wynik.kandydaci[0].kwalifikuje_sie is False
        assert wynik.rekomendacja is None

    def test_zero_kandydatow_input_validation(self) -> None:
        with pytest.raises(ValueError):
            ocen_kandydatow_nn(
                ib_a=-1.0,
                iz_prime_a=20.0,
                ik_max_ka=6.0,
                ik1_min_a=1000.0,
                u0_v=230.0,
                kandydaci=(),
            )
        with pytest.raises(ValueError):
            ocen_kandydatow_nn(
                ib_a=5.0,
                iz_prime_a=0.0,
                ik_max_ka=6.0,
                ik1_min_a=1000.0,
                u0_v=230.0,
                kandydaci=(),
            )
        with pytest.raises(ValueError):
            ocen_kandydatow_nn(
                ib_a=5.0,
                iz_prime_a=20.0,
                ik_max_ka=6.0,
                ik1_min_a=-1.0,
                u0_v=230.0,
                kandydaci=(),
            )


# =============================================================================
# KANDYDACI Z KATALOGU (P0.2/P0.7 runda 3 — pola nowe)
# =============================================================================


class TestZbierzKandydatowZKatalogu:
    def test_zwraca_wszystkie_trzy_rodzaje(self) -> None:
        kandydaci = zbierz_kandydatow_z_katalogu()
        kindy = {k.kind for k in kandydaci}
        assert kindy == {KIND_MCB, KIND_FUSE_SWITCH, KIND_MCCB}

    def test_fuse_switch_uzywa_conditional_sc_current_ka_kombinacji(self) -> None:
        """Runda 3: FUSE_SWITCH czyta `conditional_sc_current_ka` (KOMBINACJA), nie i_cu_ka."""
        kandydaci = zbierz_kandydatow_z_katalogu()
        fuse_switch = [k for k in kandydaci if k.kind == KIND_FUSE_SWITCH]
        assert fuse_switch
        for k in fuse_switch:
            assert k.zdolnosc_wylaczania_ka is not None  # katalog zasilony (rb_nn_* = 50 kA)

    def test_fuse_switch_niesie_wlasna_zdolnosc_wkladki_osobno(self) -> None:
        """`fuse_breaking_capacity_ka` (własna zdolność SAMEJ wkładki, IEC 60269-1/-2)
        jest NIESIONE osobno od `zdolnosc_wylaczania_ka` (kombinacji) — oba pola
        mają realnego konsumenta (dowód doboru), żadne nie jest martwą wagą."""
        kandydaci = zbierz_kandydatow_z_katalogu()
        fuse_switch = [k for k in kandydaci if k.kind == KIND_FUSE_SWITCH]
        assert fuse_switch
        for k in fuse_switch:
            assert k.fuse_breaking_capacity_ka == 120.0  # NH gG, katalog P0.7
            # Kombinacja fizycznie nie może przewyższyć zdolności samej wkładki.
            assert k.zdolnosc_wylaczania_ka is not None
            assert k.zdolnosc_wylaczania_ka <= k.fuse_breaking_capacity_ka

    def test_fuse_in_a_nie_przekracza_ramy_rozlacznika(self) -> None:
        catalog = get_default_mv_catalog()
        apparaty = {
            a.id: a
            for a in catalog.list_lv_apparatus_types()
            if a.device_kind == "ROZLACZNIK_BEZPIECZNIKOWY"
        }
        for k in zbierz_kandydatow_z_katalogu(catalog):
            if k.kind != KIND_FUSE_SWITCH:
                continue
            apparat_id = k.id.split("+")[0]
            assert k.in_a <= apparaty[apparat_id].i_n_a

    def test_mcb_zdolnosc_z_icn_ka(self) -> None:
        catalog = get_default_mv_catalog()
        mcb_typy = {t.id: t for t in catalog.list_lv_breaker_mcb_types()}
        for k in zbierz_kandydatow_z_katalogu(catalog):
            if k.kind != KIND_MCB:
                continue
            assert k.zdolnosc_wylaczania_ka == mcb_typy[k.id].icn_ka


# =============================================================================
# DOBÓR NA OBWODZIE REFERENCYJNYM (orkiestracja pełna, ENM)
# =============================================================================


def _enm(cable_length_km: float) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="t", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
        ],
        sources=[
            Source(ref_id="src", name="GPZ", bus_ref="sn", model="thevenin", r_ohm=0.1, x_ohm=0.5)
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=cable_length_km,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
                short_circuit_temperature_c=160.0,
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


class TestDoborNaObwodzieReferencyjnym:
    def test_krotki_obwod_znajduje_rekomendacje(self) -> None:
        enm = _enm(cable_length_km=0.05)
        out = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="stn",
            bus_ref="b1",
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
        )
        assert out["status"] == "OK"
        dobor = out["dobor"]
        assert dobor["rekomendacja"] is not None
        assert dobor["ik1_min_a"] > 0

    def test_dlugi_obwod_wysoki_in_swz_odrzuca(self) -> None:
        """Długi obwód: Ik1_min niski — wysokoprądowe MCB nie spełniają SWZ (trzeci
        parametr obwodu decyduje, nie tylko Ib/Iz′/Icu — dowód, że kryterium iv
        realnie filtruje kandydatów, nie jest martwym polem)."""
        enm = _enm(cable_length_km=2.0)
        out = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="stn",
            bus_ref="b1",
            ib_a=50.0,
            iz_prime_a=63.0,
            ik_max_ka=6.0,
        )
        assert out["status"] == "OK"
        dobor = out["dobor"]
        wysokoprad = [
            k
            for k in dobor["kandydaci"]
            if k["kandydat"]["kind"] == "MCB" and k["kandydat"]["in_a"] == 63.0
        ]
        assert wysokoprad
        for k in wysokoprad:
            swz = next(kr for kr in k["kryteria"] if kr["nazwa"] == "SWZ przy Ik_min")
            assert swz["status"] in ("nie spełnia", "nierozstrzygalne")

    def test_stan_docelowy_missing_data_honest(self) -> None:
        enm = _enm(cable_length_km=0.05)
        out = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="nieistniejaca",
            bus_ref="b1",
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
        )
        assert out["status"] == "brak danych"
        assert "station" in out["missing_data"]

    def test_determinizm_dwa_biegi(self) -> None:
        enm = _enm(cable_length_km=0.05)
        out1 = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="stn",
            bus_ref="b1",
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
        )
        out2 = wybierz_aparat_dla_obwodu_nn(
            enm=enm,
            station_ref="stn",
            bus_ref="b1",
            ib_a=10.0,
            iz_prime_a=20.0,
            ik_max_ka=6.0,
        )
        assert out1["dobor"]["deterministic_signature"] == out2["dobor"]["deterministic_signature"]
