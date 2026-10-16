"""Solver pętli zwarcia doziemnego TT/IT (karta W5-E-TTIT) — testy ILOCZYNU CECH.

Cechy: {TT, IT} × {R_A, R_B, I_Δn, pojemności, f: obecne / brak → odmowa nazwana} ×
{trasa zerowa / niezerowa} × {sieć zasilająca obecna / brak}; do tego: jedno wejście fizyki
(``compute_fault_loop`` dyspozycją), jądro wspólne z TN (identyczna suma składowych), sanity
U_dotyk ≥ 0, determinizm, kontrakt ``to_dict`` (klucz ``tt_it`` tylko dla TT/IT).
"""

from __future__ import annotations

import hashlib
import json
import math

import pytest
from network_model.odmowa_danych import RODZAJ_ELEMENT, OdmowaDanychError, OdmowaWejsciaRdzenia
from network_model.solvers.fault_loop_iec60364 import (
    C_MAX_LV,
    C_MIN_LV,
    FaultLoopInput,
    LoopImpedanceComponent,
    NetworkType,
    ProtectionArrangement,
    compute_fault_loop,
    zsumuj_skladowe_petli,
)
from network_model.solvers.petla_zwarcia_tt_it import (
    ETYKIETA_R_A,
    ETYKIETA_R_B,
    KOD_ODCINEK_IT_DANE,
    OBLICZ_WG_UKLADU,
    OPISY_DANYCH_TT_IT,
    RODZAJ_PRADU_IT_PL,
    RODZAJ_PRADU_TT_PL,
    DaneTtIt,
    PojemnoscDoziemnaOdcinka,
    WynikTtIt,
    oblicz_petle_it,
    oblicz_petle_tt,
)

_FAZA = LoopImpedanceComponent(label="Przewód fazowy L (trasa)", r_ohm=0.0625, x_ohm=0.008)
_PE = LoopImpedanceComponent(label="Przewód powrotny PE (trasa)", r_ohm=0.0625, x_ohm=0.008)
_ZERO = LoopImpedanceComponent(label="—", r_ohm=0.0, x_ohm=0.0)
_TR = LoopImpedanceComponent(label="Transformator", r_ohm=0.0043, x_ohm=0.0155)
_UP = LoopImpedanceComponent(label="Sieć SN (upstream)", r_ohm=0.0006, x_ohm=0.0032)
_U0 = 230.0


def _dane_tt(**zmiany) -> DaneTtIt:
    bazowe = {"r_a_ohm": 25.0, "r_b_ohm": 2.0, "i_delta_n_a": 0.03}
    bazowe.update(zmiany)
    return DaneTtIt(**bazowe)


def _pojemnosci() -> tuple[PojemnoscDoziemnaOdcinka, ...]:
    return (
        PojemnoscDoziemnaOdcinka("Kabel A", "c_a", b0_siemens_per_km=1.2e-4, length_km=0.25),
        PojemnoscDoziemnaOdcinka(
            "Kabel B (2 tory)", "c_b", b0_siemens_per_km=9.0e-5, length_km=0.4, n_parallel=2
        ),
    )


def _dane_it(**zmiany) -> DaneTtIt:
    bazowe = {"r_a_ohm": 25.0, "pojemnosci": _pojemnosci(), "czestotliwosc_hz": 50.0}
    bazowe.update(zmiany)
    return DaneTtIt(**bazowe)


def _wejscie(
    uklad: NetworkType,
    dane: DaneTtIt | None,
    *,
    faza: LoopImpedanceComponent = _FAZA,
    powrot: LoopImpedanceComponent | None = None,
    upstream: LoopImpedanceComponent | None = _UP,
) -> FaultLoopInput:
    if powrot is None:
        powrot = _ZERO if uklad is NetworkType.TT else _PE
    return FaultLoopInput(
        fault_node_id="odbior-1",
        u_nom_v=_U0,
        phase_conductor=faza,
        return_conductor=powrot,
        transformer_impedance=_TR,
        upstream_impedance=upstream,
        network_type=uklad,
        protection_arrangement=ProtectionArrangement.NONE,
        dane_tt_it=dane,
    )


# ---------------------------------------------------------------------------
# TT
# ---------------------------------------------------------------------------


class TestPetlaTT:
    @pytest.mark.parametrize("upstream", [_UP, None], ids=["z siecią zasilającą", "bez"])
    @pytest.mark.parametrize("faza", [_FAZA, _ZERO], ids=["trasa", "u źródła"])
    def test_petla_tt_z_uziomami_jadro_jak_tn(self, upstream, faza) -> None:
        wynik = compute_fault_loop(
            _wejscie(NetworkType.TT, _dane_tt(), faza=faza, upstream=upstream)
        )
        assert wynik.network_type is NetworkType.TT
        etykiety = [c.label for c in wynik.components]
        assert etykiety[-2:] == [ETYKIETA_R_B, ETYKIETA_R_A]
        assert _PE.label not in etykiety
        # Jądro wspólne z TN: ta sama suma zespolona składowych.
        skladowe = (
            [faza, _TR]
            + ([upstream] if upstream else [])
            + [
                LoopImpedanceComponent(ETYKIETA_R_B, 2.0, 0.0),
                LoopImpedanceComponent(ETYKIETA_R_A, 25.0, 0.0),
            ]
        )
        z_oczekiwane, _ = zsumuj_skladowe_petli(skladowe)
        assert wynik.z_loop_ohm == z_oczekiwane
        assert wynik.ik_min_a == C_MIN_LV * _U0 / abs(z_oczekiwane)
        assert wynik.ik_max_a == C_MAX_LV * _U0 / abs(z_oczekiwane)
        assert wynik.tt_it is not None
        assert wynik.tt_it.u_dotyk_v == 25.0 * 0.03
        assert wynik.tt_it.rodzaj_pradu_pl == RODZAJ_PRADU_TT_PL
        kroki = [k["step"] for k in wynik.white_box_trace]
        assert kroki == [
            "uklad_tt_droga_powrotu",
            "sum_components",
            "compute_ik",
            "napiecie_dotykowe_rcd",
        ]
        assert wynik.to_dict()["tt_it"]["u_dotyk_v"] == pytest.approx(0.75)

    @pytest.mark.parametrize("brak", ["r_a_ohm", "r_b_ohm", "i_delta_n_a"])
    def test_tt_brak_danej_odmowa_nazwana(self, brak) -> None:
        # Partia integracji 10: odmowa nazywa daną symbolem i opisem (jedno źródło
        # `OPISY_DANYCH_TT_IT`), klucz pola nie trafia do treści.
        symbol, opis = OPISY_DANYCH_TT_IT[brak]
        with pytest.raises(OdmowaDanychError) as exc:
            compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt(**{brak: None})))
        assert f"brak danej {symbol} ({opis})" in str(exc.value)
        assert brak not in str(exc.value)

    def test_tt_bez_bloku_danych_odmowa(self) -> None:
        with pytest.raises(OdmowaDanychError, match="Układ TT"):
            compute_fault_loop(_wejscie(NetworkType.TT, None))

    def test_tt_niezerowy_przewod_powrotny_odmowa(self) -> None:
        with pytest.raises(OdmowaDanychError, match="nie jest drogą powrotu"):
            compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt(), powrot=_PE))

    @pytest.mark.parametrize("pole", ["r_a_ohm", "r_b_ohm", "i_delta_n_a", "czestotliwosc_hz"])
    @pytest.mark.parametrize("wartosc", [0.0, -1.0, float("nan"), float("inf")])
    def test_dane_tt_it_odrzucaja_wartosci_niefizyczne(self, pole, wartosc) -> None:
        symbol, opis = OPISY_DANYCH_TT_IT[pole]
        with pytest.raises(OdmowaDanychError) as exc:
            DaneTtIt(**{pole: wartosc})
        assert f"{opis} {symbol} musi być liczbą skończoną i dodatnią" in str(exc.value)
        assert pole not in str(exc.value)

    def test_sanity_u_dotyk_nieujemne_i_rosnie_z_r_a(self) -> None:
        male = compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt(r_a_ohm=5.0)))
        duze = compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt(r_a_ohm=50.0)))
        assert 0.0 <= male.tt_it.u_dotyk_v < duze.tt_it.u_dotyk_v
        # Większy uziom = większa impedancja pętli = mniejszy prąd doziemny.
        assert duze.ik_min_a < male.ik_min_a


# ---------------------------------------------------------------------------
# IT
# ---------------------------------------------------------------------------


class TestPetlaIT:
    @pytest.mark.parametrize("upstream", [_UP, None], ids=["z siecią zasilającą", "bez"])
    def test_pierwsze_i_drugie_zwarcie(self, upstream) -> None:
        wynik = compute_fault_loop(_wejscie(NetworkType.IT, _dane_it(), upstream=upstream))
        assert wynik.network_type is NetworkType.IT
        tt_it = wynik.tt_it
        assert isinstance(tt_it, WynikTtIt)
        b_e = 1.2e-4 * 0.25 + 9.0e-5 * 0.4 * 2
        omega = 2.0 * math.pi * 50.0
        assert tt_it.b_e_s == pytest.approx(b_e)
        assert tt_it.c_e_f == pytest.approx(b_e / omega)
        assert tt_it.i_d_pierwsze_zwarcie_a == pytest.approx(3.0 * b_e * _U0)
        assert tt_it.u_dotyk_pierwsze_zwarcie_v == pytest.approx(25.0 * 3.0 * b_e * _U0)
        # Drugie zwarcie: jądro TN (faza + PE + TR + upstream), napięcie napędowe U_LL/2.
        skladowe = [_FAZA, _PE, _TR] + ([upstream] if upstream else [])
        z_s, _ = zsumuj_skladowe_petli(skladowe)
        assert wynik.z_loop_ohm == z_s
        u_ll = math.sqrt(3.0) * _U0
        assert tt_it.u_ll_v == pytest.approx(u_ll)
        assert wynik.ik_min_a == pytest.approx(C_MIN_LV * (u_ll / 2.0) / abs(z_s))
        assert wynik.ik_max_a == pytest.approx(C_MAX_LV * (u_ll / 2.0) / abs(z_s))
        assert tt_it.i_d2_min_a == wynik.ik_min_a
        assert tt_it.rodzaj_pradu_pl == RODZAJ_PRADU_IT_PL
        # Prąd pierwszego zwarcia (pojemnościowy) jest o rzędy mniejszy niż drugiego.
        assert tt_it.i_d_pierwsze_zwarcie_a < wynik.ik_min_a
        kroki = [k["step"] for k in wynik.white_box_trace]
        assert kroki == [
            "pojemnosc_doziemna_sieci_it",
            "prad_pierwszego_zwarcia_it",
            "napiecie_dotykowe_pierwszego_zwarcia_it",
            "sum_components_drugie_zwarcie_it",
            "prad_drugiego_zwarcia_it",
        ]

    def test_it_bez_r_a_liczy_prady_bez_napiecia_dotykowego(self) -> None:
        wynik = compute_fault_loop(_wejscie(NetworkType.IT, _dane_it(r_a_ohm=None)))
        assert wynik.tt_it.u_dotyk_pierwsze_zwarcie_v is None
        assert wynik.tt_it.r_a_ohm is None
        assert wynik.tt_it.i_d_pierwsze_zwarcie_a > 0.0
        krok = next(
            k
            for k in wynik.white_box_trace
            if k["step"] == "napiecie_dotykowe_pierwszego_zwarcia_it"
        )
        assert "nie liczone" in krok["result"]

    def test_it_bez_pojemnosci_odmowa(self) -> None:
        with pytest.raises(OdmowaDanychError, match="pojemności"):
            compute_fault_loop(_wejscie(NetworkType.IT, _dane_it(pojemnosci=())))

    def test_it_bez_czestotliwosci_odmowa(self) -> None:
        with pytest.raises(OdmowaDanychError, match=r"brak danej f \(częstotliwość sieci\)"):
            compute_fault_loop(_wejscie(NetworkType.IT, _dane_it(czestotliwosc_hz=None)))

    def test_it_bez_bloku_danych_odmowa(self) -> None:
        with pytest.raises(OdmowaDanychError, match="Układ IT"):
            compute_fault_loop(_wejscie(NetworkType.IT, None))

    @pytest.mark.parametrize(
        ("kwargs", "fragment"),
        [
            ({"b0_siemens_per_km": -1e-5, "length_km": 0.1}, "Susceptancja zerowa b_0"),
            ({"b0_siemens_per_km": 1e-5, "length_km": 0.0}, "Długość odcinka sieci IT"),
            (
                {"b0_siemens_per_km": 1e-5, "length_km": 0.1, "n_parallel": 0},
                "Liczba torów równoległych",
            ),
        ],
        ids=["b0_ujemne", "dlugosc_zerowa", "tory_zero"],
    )
    def test_pojemnosc_odcinka_odrzuca_dane_niefizyczne(self, kwargs, fragment) -> None:
        # Partia integracji 10: odmowa strukturalna — odcinek w odwołaniu rekordu,
        # treść bez identyfikatora odcinka i bez kluczy pól.
        with pytest.raises(OdmowaWejsciaRdzenia) as exc:
            PojemnoscDoziemnaOdcinka("Kabel IT", "kabel_it_7", **kwargs)
        (rekord,) = exc.value.rekordy
        assert rekord.kod == KOD_ODCINEK_IT_DANE
        assert fragment in rekord.tresc
        assert [(o.rodzaj, o.ref) for o in rekord.odwolania] == [(RODZAJ_ELEMENT, "kabel_it_7")]
        assert "kabel_it_7" not in str(exc.value)
        assert not any(klucz in str(exc.value) for klucz in kwargs)

    def test_tory_rownolegle_sumuja_pojemnosc(self) -> None:
        jeden = compute_fault_loop(
            _wejscie(
                NetworkType.IT,
                _dane_it(pojemnosci=(PojemnoscDoziemnaOdcinka("k", "k", 1e-4, 0.5, n_parallel=1),)),
            )
        )
        dwa = compute_fault_loop(
            _wejscie(
                NetworkType.IT,
                _dane_it(pojemnosci=(PojemnoscDoziemnaOdcinka("k", "k", 1e-4, 0.5, n_parallel=2),)),
            )
        )
        assert dwa.tt_it.i_d_pierwsze_zwarcie_a == pytest.approx(
            2.0 * jeden.tt_it.i_d_pierwsze_zwarcie_a
        )


# ---------------------------------------------------------------------------
# Jedno wejście fizyki, determinizm, kontrakt
# ---------------------------------------------------------------------------


class TestJednoWejscie:
    def test_dyspozycja_po_ukladzie(self) -> None:
        assert OBLICZ_WG_UKLADU == {
            NetworkType.TT: oblicz_petle_tt,
            NetworkType.IT: oblicz_petle_it,
        }
        tt = compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt()))
        it = compute_fault_loop(_wejscie(NetworkType.IT, _dane_it()))
        assert tt.to_dict() == oblicz_petle_tt(_wejscie(NetworkType.TT, _dane_tt())).to_dict()
        assert it.to_dict() == oblicz_petle_it(_wejscie(NetworkType.IT, _dane_it())).to_dict()

    @pytest.mark.parametrize("uklad", [NetworkType.TT, NetworkType.IT])
    def test_determinizm(self, uklad) -> None:
        dane = _dane_tt() if uklad is NetworkType.TT else _dane_it()
        odciski = {
            hashlib.sha256(
                json.dumps(
                    compute_fault_loop(_wejscie(uklad, dane)).to_dict(),
                    sort_keys=True,
                    ensure_ascii=False,
                ).encode("utf-8")
            ).hexdigest()
            for _ in range(3)
        }
        assert len(odciski) == 1

    def test_to_dict_tn_bez_klucza_tt_it(self) -> None:
        tn = compute_fault_loop(
            FaultLoopInput(
                fault_node_id="x",
                u_nom_v=_U0,
                phase_conductor=_FAZA,
                return_conductor=_PE,
                transformer_impedance=_TR,
                network_type=NetworkType.TN_S,
            )
        )
        assert tn.tt_it is None
        assert "tt_it" not in tn.to_dict()

    def test_wynik_zamrozony(self) -> None:
        wynik = compute_fault_loop(_wejscie(NetworkType.TT, _dane_tt()))
        with pytest.raises(Exception):
            wynik.tt_it.u_dotyk_v = 0.0  # type: ignore[misc]
