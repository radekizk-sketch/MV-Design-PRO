"""Stan fazowy SN bez domysłu prądu zwarcia z etykiety uziemienia (karta K-Q).

Przeniesione z dawnego pliku torów rozszerzeń konfiguracji stacji (skasowanych kartą
JEDNA-SCIEZKA-EDYCJI) — intencja tych testów nie dotyczyła konfiguracji stacji.
"""

from __future__ import annotations

# Stan fazowy SN a katalog uziemienia (karta K-Q, 2026-08-14)
#
# INTENCJA POPRZEDNICH TESTOW (Phase 46) zostala odwrocona SWIADOMIE. Pinowaly
# one zachowanie, w ktorym `_phase_state_default_fault_current_from_grounding`
# brala MEDIANE zgadnietego zakresu `typical_ik1_a_range` i podawala ja solverowi
# `phase_state_sn` jako domyslny prad zwarcia doziemnego (test wprost oczekiwal
# 15,5 A z zakresu 1-30 A). Zakres nie mial zrodla — karta K-O usunela go z
# frontendu, karta K-Q z backendu — wiec pin utrwalal fabrykacje wchodzaca do
# fizyki. Ponizsze testy pilnuja stanu uczciwego: etykieta wariantu uziemienia
# NIE wyznacza zadnego pradu zwarcia. Sam katalog wariantow uziemienia SN skasowano
# kartą UX-04/POLE-ZU-SKLADOWA-ZEROWA (druga prawda obok elementow modelu).


def test_stan_fazowy_nie_ma_juz_domyslu_z_etykiety_uziemienia() -> None:
    """Zrodlowy pin: helper zgadujacy prad zwarcia zniknal razem z wolaniem."""
    import inspect

    from enm import canonical_analysis

    assert not hasattr(canonical_analysis, "_phase_state_default_fault_current_from_grounding")
    ps_source = inspect.getsource(canonical_analysis._execute_phase_state_sn)
    assert "_phase_state_default_fault_current_from_grounding" not in ps_source
    assert "typical_ik1_a_range" not in ps_source


def test_stan_fazowy_bez_jawnego_pradu_liczy_sie_bez_zwarcia() -> None:
    """Brak `fault_current_a` w opcjach = 0 A na kazdej fazie, a nie mediana."""
    import inspect

    from enm import canonical_analysis

    ps_source = inspect.getsource(canonical_analysis._execute_phase_state_sn)
    fragment = ps_source.split('"fault_current_a"', 1)[1].split("open_phase", 1)[0]
    assert "default=(0.0, 0.0, 0.0)" in fragment, fragment
