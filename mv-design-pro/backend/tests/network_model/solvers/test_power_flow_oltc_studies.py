"""OLTC study engines (V12K-045): sweep §9, annual profile §8, optimization §17.

All engines drive the FROZEN solver repeatedly, are deterministic, and must
restore the transformer tap state they mutate.
"""

from __future__ import annotations

import inspect
import re

import pytest
from network_model.core.branch import TransformerBranch
from network_model.solvers import power_flow_oltc_studies
from network_model.solvers.power_flow_oltc_studies import (
    ProfilePoint,
    optimize_tap_positions,
    run_annual_oltc_profile,
    sweep_tap_positions,
)

from tests.network_model.solvers.test_power_flow_oltc import _build_input, _oltc, _solve_once


def _trafo_id(pf_input) -> str:
    graph = pf_input.typed_graph()
    return next(b.id for b in graph.branches.values() if isinstance(b, TransformerBranch))


class TestSweep:
    def test_sweep_covers_full_range_and_restores_state(self):
        pf_input = _build_input(_oltc(current_position=0))
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(pf_input, _solve_once, branch_id=trafo_id)
        assert [p.position for p in result.points] == list(range(-9, 10))
        assert all(p.converged for p in result.points)
        # State restored to the original position after the sweep.
        graph = pf_input.typed_graph()
        trafo = graph.branches[trafo_id]
        assert trafo.tap_changer.current_position == 0

    def test_sweep_voltage_monotonic_in_position(self):
        # HV-regulated: stepping the position DOWN raises the LV busbar, so the
        # controlled-bus voltage decreases monotonically as position increases.
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(pf_input, _solve_once, branch_id=trafo_id)
        vs = [p.controlled_bus_kv for p in result.points]
        assert all(a >= b - 1e-9 for a, b in zip(vs, vs[1:], strict=False))

    def test_sweep_explicit_positions(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, positions=[-4, 0, 4]
        )
        assert [p.position for p in result.points] == [-4, 0, 4]


class TestAnnualProfile:
    def test_profile_tracks_positions_switches_and_deadband(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        profile = [
            ProfilePoint(label="noc", load_scale=0.3),
            ProfilePoint(label="dzień", load_scale=1.0),
            ProfilePoint(label="szczyt", load_scale=1.6),
        ]
        result = run_annual_oltc_profile(pf_input, _solve_once, profile)
        assert len(result.steps) == 3
        assert result.total_switch_count == sum(s.switch_count for s in result.steps)
        # Heavier load needs the tap driven further down (more negative position).
        pos_light = result.steps[0].positions[trafo_id]
        pos_heavy = result.steps[2].positions[trafo_id]
        assert pos_heavy <= pos_light
        # Every step reports the controlled busbar voltage.
        assert all(trafo_id in s.controlled_bus_kv for s in result.steps)
        # State restored.
        graph = pf_input.typed_graph()
        assert graph.branches[trafo_id].tap_changer.current_position == 0

    def test_profile_deterministic(self):
        profile = [ProfilePoint(label="a", load_scale=0.5), ProfilePoint(label="b", load_scale=1.4)]
        r1 = run_annual_oltc_profile(_build_input(_oltc()), _solve_once, profile)
        r2 = run_annual_oltc_profile(_build_input(_oltc()), _solve_once, profile)
        assert [s.positions for s in r1.steps] == [s.positions for s in r2.steps]
        assert r1.total_switch_count == r2.total_switch_count

    def test_profil_roczny_mierzy_odchylke_do_POLOWY_pasma_modelu(self):
        """Profil roczny musi stosowac POLOWE pasma martwego, tak jak regulator.

        Luka wykryta przy odbiorze karty D (audyt szczytu 2026-08-01): kryterium
        doboru zaczepow bylo juz przypiete testami, ale znacznik `within_deadband`
        profilu rocznego — nie. Podwojenie pasma w tym miejscu (uzycie CALEGO
        `deadband_kv` zamiast polowy) nie zapalalo zadnego testu, a to ono decyduje,
        ile krokow profilu inzynier zobaczy jako „poza pasmem".

        Test rozstrzyga przez okno: odchylka lezy MIEDZY polowa pasma a calym
        pasmem, wiec konwencja polowy daje „poza pasmem", a konwencja calego
        pasma — „w pasmie". Zakres zaczepow jest nasycony (nastawa nieosiagalna),
        zeby odchylka nie zalezala od tego, kiedy regulator przestanie krecic.
        """
        pf_input = _build_input(_oltc(voltage_setpoint_kv=18.0, deadband_kv=0.2))
        trafo_id = _trafo_id(pf_input)
        nasycenie = run_annual_oltc_profile(
            pf_input, _solve_once, [ProfilePoint(label="nasycenie", load_scale=1.0)]
        )
        krok_ref = nasycenie.steps[0]
        assert krok_ref.positions[trafo_id] == -9, "sonda wymaga nasycenia zakresu zaczepow"
        odchylka = abs(krok_ref.controlled_bus_kv[trafo_id] - 18.0)

        pasmo = 1.5 * odchylka
        wynik = run_annual_oltc_profile(
            _build_input(_oltc(voltage_setpoint_kv=18.0, deadband_kv=pasmo)),
            _solve_once,
            [ProfilePoint(label="nasycenie", load_scale=1.0)],
        )
        krok = wynik.steps[0]
        dev = abs(krok.controlled_bus_kv[trafo_id] - 18.0)
        assert pasmo / 2.0 < dev <= pasmo, "okno rozstrzygajace polowa-vs-cale pasmo"
        assert krok.within_deadband[trafo_id] is False


class TestProfilBezDanychRegulatora:
    """Profil roczny: brak danej modelu NIE MOZE udawac werdyktu (przeglad P10/N3).

    Kryterium pasma pochodzi z modelu tak samo, jak kryterium doboru zaczepow z
    karty D. Brak pasma => znacznik NIEUSTALONY + kod gotowosci; liczba laczen
    NIEDOSTEPNA, bo policzono by ja na paśmie, ktorego nikt nie zadeklarowal.
    """

    PROFIL = [
        ProfilePoint(label="noc", load_scale=0.3),
        ProfilePoint(label="dzien", load_scale=1.0),
        ProfilePoint(label="szczyt", load_scale=1.6),
    ]

    def test_bez_pasma_znacznik_nieustalony_i_kod_gotowosci(self):
        pf_input = _build_input(_oltc(deadband_kv=None))
        trafo_id = _trafo_id(pf_input)
        wynik = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL)

        # Znacznik trojstanowy przez OBECNOSC klucza: brak klucza = nieustalone.
        for krok in wynik.steps:
            assert trafo_id not in krok.within_deadband
            # Zmierzone napiecie zostaje — brakuje kryterium, nie pomiaru.
            assert trafo_id in krok.controlled_bus_kv
        assert wynik.steps_outside_deadband is None
        assert wynik.readiness_codes == ("oltc.deadband_missing",)

    def test_bez_pasma_wywod_nie_drukuje_progu_zerowego(self):
        # BRAMKA (a): inzynier NIE MOZE zobaczyc „> 0.000 kV" jako kryterium.
        # Odchylki tej sondy to 0,876 / 1,193 / 1,496 kV, a skale profilu drukuja
        # sie jako 0.30/1.00/1.60 — wiec „0.000" w wywodzie moze pochodzic
        # WYLACZNIE z podstawionego pasma zerowego.
        pf_input = _build_input(_oltc(deadband_kv=None))
        kroki = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL).to_dict()["wywod"]
        caly = " | ".join(f"{k['tekst']} {k['latex'] or ''}" for k in kroki)
        assert "0.000" not in caly
        assert "> 0.000" not in caly
        assert r"\le 0.000" not in caly
        # Zamiast progu — nazwana brakujaca dana i uczciwy stan znacznika.
        assert "NIEUSTALONE" in caly
        assert "pasma nieczulosci regulatora" in caly
        assert r"\Delta U_{db} = \text{brak}" in caly

    def test_bez_pasma_liczba_laczen_niedostepna(self):
        # BRAMKA (b): licznik przelaczen nie moze powstac z fikcyjnego pasma.
        pf_input = _build_input(_oltc(deadband_kv=None))
        wynik = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL)
        assert wynik.total_switch_count is None
        assert [s.switch_count for s in wynik.steps] == [None, None, None]
        teksty = " | ".join(k["tekst"] for k in wynik.to_dict()["wywod"])
        assert "Suma przelaczen zaczepow: NIEDOSTEPNA" in teksty

    def test_z_pasmem_liczba_laczen_bez_zmian(self):
        # BRAMKA (b), druga polowa: obecnosc pasma = wynik jak dotad. Liczby
        # przypiete pomiarem na tej samej sondzie (110/15 kV, U_zad 15,0 kV,
        # pasmo 0,2 kV, profil 0,3/1,0/1,6): 5 + 1 + 1 = 7 laczen, 0 krokow poza
        # pasmem. To jest wartosc, ktora fikcyjne pasmo zerowe zawyzalo.
        pf_input = _build_input(_oltc(deadband_kv=0.2))
        wynik = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL)
        assert [s.switch_count for s in wynik.steps] == [5, 1, 1]
        assert wynik.total_switch_count == 7
        assert wynik.steps_outside_deadband == 0
        assert wynik.readiness_codes == ()
        assert "readiness_codes" not in wynik.to_dict()

    def test_bez_nastawy_znacznik_nieustalony_zamiast_poza_pasmem(self):
        # Znalezisko N3: przy braku nastawy tabela pokazywala „nie" w kazdym
        # wierszu, a podsumowanie „0 krokow poza pasmem" — ekran przeczyl sobie.
        # Prawda jest jedna: kryterium NIE ZOSTALO USTALONE.
        pf_input = _build_input(_oltc(voltage_setpoint_kv=None, control_mode="MANUAL"))
        trafo_id = _trafo_id(pf_input)
        wynik = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL)
        assert all(trafo_id not in s.within_deadband for s in wynik.steps)
        assert wynik.steps_outside_deadband is None
        assert wynik.readiness_codes == ("oltc.target_voltage_missing",)

    def test_bez_obu_danych_oba_kody_w_stalej_kolejnosci(self):
        pf_input = _build_input(_oltc(voltage_setpoint_kv=None, deadband_kv=None))
        wynik = run_annual_oltc_profile(pf_input, _solve_once, self.PROFIL)
        assert wynik.readiness_codes == (
            "oltc.target_voltage_missing",
            "oltc.deadband_missing",
        )
        assert wynik.to_dict()["readiness_codes"] == [
            "oltc.target_voltage_missing",
            "oltc.deadband_missing",
        ]
        assert wynik.total_switch_count is None
        assert wynik.steps_outside_deadband is None

    def test_bez_pasma_wynik_deterministyczny(self):
        def _bieg():
            return run_annual_oltc_profile(
                _build_input(_oltc(deadband_kv=None)), _solve_once, self.PROFIL
            ).to_dict()

        assert _bieg() == _bieg()

    def test_brak_podstawienia_za_pasmo_w_zrodle(self):
        # BRAMKA KLASY: podstawienie `deadband_kv or ...` nie moze wrocic w ZADNYM
        # z dwoch miejsc (profil i petla regulatora) — pomiar na jednej sieci nie
        # odroznia „pasma z modelu" od „pasma podstawionego, ktore akurat pasuje".
        from network_model.solvers import power_flow_oltc

        for modul in (power_flow_oltc_studies, power_flow_oltc):
            zrodlo = inspect.getsource(modul)
            assert "deadband_kv" in zrodlo  # skanujemy wlasciwy modul
            podejrzane = re.findall(r"deadband(?:_kv)?\s+or\s+[0-9]", zrodlo)
            assert podejrzane == [], f"{modul.__name__}: podstawienie za pasmo: {podejrzane}"


class TestOptimization:
    def test_minimize_losses_picks_converged_position_and_restores(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, objective="minimize_losses"
        )
        assert result.best_position is not None
        best = min((c for c in result.candidates if c.converged), key=lambda c: c.losses_mw)
        assert result.best_position == best.position
        graph = pf_input.typed_graph()
        assert graph.branches[trafo_id].tap_changer.current_position == 0

    def test_maintain_voltage_targets_setpoint(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=trafo_id,
            objective="maintain_voltage",
            target_kv=15.0,
        )
        assert result.best_position is not None
        # The chosen position minimizes |V_controlled - target|.
        best = min(
            (c for c in result.candidates if c.voltage_deviation_kv is not None),
            key=lambda c: c.voltage_deviation_kv,
        )
        assert result.best_position == best.position

    def test_minimize_switching_prefers_initial_when_within_model_deadband(self):
        # INTENCJA (zachowana z wersji sprzed V12K-312): gdy pozostanie na pozycji
        # poczatkowej SPELNIA kryterium, J = 0 wygrywa i zaczep sie nie rusza.
        # Kryterium jest teraz JAWNE i pochodzi z modelu: |U(n) - U_cel| <= dU_db/2.
        # Odchylka pozycji 0 przy U_cel = 14,0 kV wynosi 0,1927 kV, wiec pasmo 1,0 kV
        # (polowa 0,5 kV) ja obejmuje. Poprzednia wersja tego testu przechodzila dla
        # DOWOLNEGO progu > 1,38 % U_cel — nie mogla zapalic sie na zmianie kryterium.
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=1.0))
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=trafo_id,
            objective="minimize_switching",
            target_kv=14.0,
        )
        assert result.best_position == 0
        assert result.switch_count == 0
        best = next(c for c in result.candidates if c.position == 0)
        assert best.feasible is True
        assert best.voltage_deviation_kv is not None
        assert best.voltage_deviation_kv <= 0.5  # polowa pasma z modelu

    def test_minimize_switching_verdict_follows_model_deadband(self):
        # BRAMKA KLASY (§2.4 karty D): dwie ROZNE wartosci pasma w modelu musza dac
        # dwa ROZNE werdykty. Przed naprawa werdykt byl identyczny dla 0,05 / 0,2 /
        # 1,0 / 5,0 kV, bo o dopuszczalnosci decydowal zaszyty prog 0,05 * U_cel.
        def _uruchom(deadband_kv: float):
            pf_input = _build_input(_oltc(current_position=0, deadband_kv=deadband_kv))
            return optimize_tap_positions(
                pf_input,
                _solve_once,
                branch_id=_trafo_id(pf_input),
                objective="minimize_switching",
                target_kv=14.0,
            )

        waskie = _uruchom(0.2)
        szerokie = _uruchom(5.0)
        assert (waskie.best_position, waskie.switch_count) == (-1, 1)
        assert (szerokie.best_position, szerokie.switch_count) == (0, 0)
        assert waskie.best_position != szerokie.best_position

    def test_minimize_switching_band_boundary_is_half_of_model_deadband(self):
        # Granica dopuszczalnosci lezy DOKLADNIE na polowie pasma z modelu — ta sama
        # konwencja, co petla regulatora (power_flow_oltc). Zaden margines, zadna
        # domieszka numeryczna (dawne `1e-9`).
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=0.2))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        )
        polowa = result.feasibility_criterion.half_band_kv
        assert polowa == pytest.approx(0.1)
        for kandydat in result.candidates:
            if not kandydat.converged or kandydat.voltage_deviation_kv is None:
                continue
            assert kandydat.feasible is (kandydat.voltage_deviation_kv <= polowa)

    def test_minimize_switching_rejects_position_outside_model_band(self):
        # Scenariusz audytu D6 na REALNYM Newtonie: zaczep stoi na n0 = -3, gdzie
        # napiecie szyny jest 4,54 % powyzej celu. Przy pasmie 0,2 kV z modelu ta
        # pozycja NIE jest dopuszczalna — badanie ma wskazac pozycje trzymajaca cel
        # (n = 0, |dU| = 0,068 kV), a nie „zostaw, 0 przelaczen".
        pf_input = _build_input(
            _oltc(current_position=-3, min_position=-4, max_position=4, deadband_kv=0.2),
            slack_u_pu=1.08,
        )
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=15.75,
            positions=list(range(-4, 5)),
        )
        poza_pasmem = next(c for c in result.candidates if c.position == -3)
        assert poza_pasmem.voltage_deviation_kv > 0.1
        assert poza_pasmem.feasible is False
        assert result.best_position == 0
        assert result.switch_count == 3

    def test_minimize_switching_without_target_voltage_is_unavailable(self):
        # Brak U_cel NIE moze znaczyc „kazda pozycja dopuszczalna". Wynik NIEDOSTEPNY
        # + kod gotowosci; zero werdyktu (best/switch_count = None).
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=0.2))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=None,
        )
        assert result.best_position is None
        assert result.switch_count is None
        assert result.readiness_codes == ("oltc.target_voltage_missing",)
        assert result.feasibility_criterion.available is False
        assert all(c.feasible is None for c in result.candidates)

    def test_minimize_switching_without_model_deadband_is_unavailable(self):
        # Brak pasma w modelu — kryterium nie da sie zbudowac; ZADNEGO progu
        # zastepczego (to jest sedno defektu D6).
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=None))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        )
        assert result.best_position is None
        assert result.switch_count is None
        assert result.readiness_codes == ("oltc.deadband_missing",)
        kryterium = result.feasibility_criterion
        assert kryterium.available is False
        assert kryterium.band_kv is None and kryterium.half_band_kv is None
        assert kryterium.target_kv == pytest.approx(14.0)
        assert all(c.feasible is None for c in result.candidates)

    def test_minimize_switching_without_both_inputs_reports_both_codes(self):
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=None))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=None,
        )
        assert result.readiness_codes == (
            "oltc.target_voltage_missing",
            "oltc.deadband_missing",
        )
        assert result.best_position is None

    def test_maintain_voltage_without_target_gives_no_verdict(self):
        # Znalezisko uboczne D6: bez U_cel funkcja celu ma wartosc nieskonczona, a
        # mimo to wskazywana byla „najlepsza" pozycja. Teraz: brak werdyktu + kod.
        pf_input = _build_input(_oltc())
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="maintain_voltage",
            target_kv=None,
        )
        assert result.best_position is None
        assert result.switch_count is None
        assert result.readiness_codes == ("oltc.target_voltage_missing",)

    def test_no_acceptable_position_gives_no_verdict(self):
        # Pasmo zerowe: zadna pozycja nie trafia w cel co do 0 kV. Solver NIE odwraca
        # sie wtedy do puli „samych zbieznych" (dawne zachowanie: najlepsza z gorszych).
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=0.0))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        )
        assert all(c.feasible is False for c in result.candidates if c.converged)
        assert result.best_position is None
        assert result.switch_count is None
        # Kryterium ISTNIEJE (pasmo 0 kV jest jawna dana modelu) — to nie jest brak danych.
        assert result.feasibility_criterion.available is True
        assert result.readiness_codes == ()

    def test_optimization_deterministic(self):
        r1 = optimize_tap_positions(
            _build_input(_oltc()),
            _solve_once,
            branch_id=_trafo_id(_build_input(_oltc())),
            objective="minimize_losses",
        )
        pf2 = _build_input(_oltc())
        r2 = optimize_tap_positions(
            pf2, _solve_once, branch_id=_trafo_id(pf2), objective="minimize_losses"
        )
        assert r1.best_position == r2.best_position


class TestKryteriumWWyniku:
    """Kryterium dopuszczalnosci (wartosc + zrodlo) musi byc CZESCIA wyniku i wywodu.

    Bez tego werdykt „pozycja optymalna" jest nieweryfikowalny: o wyniku decyduje
    wylacznie zbior pozycji uznanych za dopuszczalne (defekt D6).
    """

    def test_to_dict_carries_criterion_value_and_source(self):
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=0.2))
        result = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        )
        kryterium = result.to_dict()["feasibility_criterion"]
        assert kryterium["kind"] == "voltage_deadband"
        assert kryterium["available"] is True
        assert kryterium["source"] == "tap_changer_deadband"
        assert kryterium["target_kv"] == pytest.approx(14.0)
        assert kryterium["band_kv"] == pytest.approx(0.2)
        assert kryterium["half_band_kv"] == pytest.approx(0.1)

    def test_to_dict_carries_readiness_codes_when_criterion_unavailable(self):
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=None))
        d = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        ).to_dict()
        assert d["readiness_codes"] == ["oltc.deadband_missing"]
        assert d["feasibility_criterion"]["available"] is False
        assert d["best_position"] is None
        assert d["switch_count"] is None
        assert all(c["feasible"] is None for c in d["candidates"])

    def test_criterion_absent_keys_when_value_unknown(self):
        # Konwencja `exclude_none`: pola bez wartosci NIE pojawiaja sie w payloadzie.
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=None))
        kryterium = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=None,
        ).to_dict()["feasibility_criterion"]
        assert "band_kv" not in kryterium
        assert "half_band_kv" not in kryterium
        assert "target_kv" not in kryterium
        assert "source" not in kryterium

    def test_wywod_states_criterion_with_substitution(self):
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=0.2))
        kroki = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=14.0,
        ).to_dict()["wywod"]
        teksty = [k["tekst"] for k in kroki]
        assert any("Kryterium dopuszczalnosci pozycji" in t for t in teksty)
        assert any("0.200 kV" in t and "14.000 kV" in t for t in teksty)
        latexy = [k["latex"] for k in kroki if k["latex"]]
        assert any(r"\frac{0.200}{2} = 0.100" in latex for latex in latexy)

    def test_wywod_names_missing_input_instead_of_verdict(self):
        pf_input = _build_input(_oltc(current_position=0, deadband_kv=None))
        kroki = optimize_tap_positions(
            pf_input,
            _solve_once,
            branch_id=_trafo_id(pf_input),
            objective="minimize_switching",
            target_kv=None,
        ).to_dict()["wywod"]
        teksty = " | ".join(k["tekst"] for k in kroki)
        assert "NIEDOSTEPNE" in teksty
        assert "napiecia docelowego" in teksty
        assert "pasma nieczulosci regulatora" in teksty
        assert "najlepsza pozycja" not in teksty

    def test_no_hardcoded_acceptance_band_in_source(self):
        # BRAMKA KLASY: prog dopuszczalnosci NIE moze wrocic jako literal. Sprawdzamy
        # tresc modulu, bo pomiar zachowania na jednej sieci nie odroznia „progu z
        # modelu" od „progu zaszytego, ktory akurat daje ten sam wynik".
        zrodlo = inspect.getsource(power_flow_oltc_studies)
        assert "target_kv" in zrodlo  # asercja pilnuje, ze skanujemy wlasciwy modul
        podejrzane = re.findall(r"[0-9.]+\s*\*\s*target_kv|target_kv\s*\*\s*[0-9.]+", zrodlo)
        assert podejrzane == [], f"prog dopuszczalnosci jako literal: {podejrzane}"
        assert "1e-9" not in zrodlo, "domieszka numeryczna w porownaniu z pasmem"


class TestWywod:
    """Wywod dyplomowy {tekst, latex} w to_dict() — addytywny (zasada KaTeX 2026-07-22)."""

    def test_sweep_wywod_formula_and_per_point_substitution(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = sweep_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, positions=[-1, 0, 1]
        )
        d = result.to_dict()
        kroki = d["wywod"]
        assert kroki and all(set(k) == {"tekst", "latex"} for k in kroki)
        # Wzor ogolny przekladni (LaTeX).
        wzor = [k for k in kroki if k["latex"] and "t(n) = 1 +" in k["latex"]]
        assert wzor
        # Podstawienie liczbowe per pozycja — wartosc t z JUZ policzonego tap_ratio.
        podstawienia = [
            k
            for k in kroki
            if k["latex"] and k["latex"].startswith("t(") and not k["latex"].startswith("t(n)")
        ]
        assert len(podstawienia) == len(result.points)
        p0 = result.points[0]
        assert f"= {p0.tap_ratio:.6f}" in podstawienia[0]["latex"]
        assert f"t({p0.position})" in podstawienia[0]["latex"]

    def test_profile_wywod_deadband_substitution_and_switch_sum(self):
        pf_input = _build_input(_oltc())
        profile = [
            ProfilePoint(label="noc", load_scale=0.3),
            ProfilePoint(label="szczyt", load_scale=1.6),
        ]
        result = run_annual_oltc_profile(pf_input, _solve_once, profile)
        kroki = result.to_dict()["wywod"]
        assert kroki and all(set(k) == {"tekst", "latex"} for k in kroki)
        # Wzory ogolne: skalowanie obciazen i pasmo nieczulosci.
        latexy = [k["latex"] for k in kroki if k["latex"]]
        assert any("P_{i} = s_{i}" in latex for latex in latexy)
        assert any("U_{zad}" in latex for latex in latexy)
        # Suma przelaczen (podstawienie liczbowe).
        assert any(
            f"= {result.total_switch_count}" in latex and "N_{prz}" in latex for latex in latexy
        )

    def test_optimize_wywod_objective_substitution_for_best(self):
        pf_input = _build_input(_oltc())
        trafo_id = _trafo_id(pf_input)
        result = optimize_tap_positions(
            pf_input, _solve_once, branch_id=trafo_id, objective="minimize_losses"
        )
        kroki = result.to_dict()["wywod"]
        latexy = [k["latex"] for k in kroki if k["latex"]]
        assert any("J(n) = P_{str}(n)" in latex for latex in latexy)
        best = next(c for c in result.candidates if c.position == result.best_position)
        # Podstawienie z JUZ policzonych strat i wartosci kryterium.
        assert any(f"{best.losses_mw:.6f}" in latex for latex in latexy)
        assert any(f"= {result.best_position}" in latex and "arg" in latex for latex in latexy)

    def test_wywod_deterministic_two_runs_identical(self):
        def _run():
            pf = _build_input(_oltc())
            return sweep_tap_positions(
                pf, _solve_once, branch_id=_trafo_id(pf), positions=[-2, 0, 2]
            ).to_dict()["wywod"]

        assert _run() == _run()
