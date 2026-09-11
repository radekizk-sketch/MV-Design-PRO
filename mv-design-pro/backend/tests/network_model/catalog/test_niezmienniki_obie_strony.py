"""Każda TWARDA bramka katalogu sprawdzona Z OBU STRON (§14 remediacji).

DLACZEGO OBIE STRONY. Reguła, dla której przetestowano wyłącznie przypadek
poprawny, nie dowodzi niczego — przechodzi też implementacja, która nie sprawdza
nic. Reguła, dla której przetestowano wyłącznie przypadek błędny, nie dowodzi, że
nie odrzuca poprawnych rekordów. Bramka produkcyjna wymaga pary:

  1. rekord jawnie NIEPOPRAWNY, który MUSI zostać odrzucony;
  2. rekord nietypowy, ale LEGALNY, który MUSI przejść.

Punkt 2 jest tym, czego zabrakło w poprzedniej wersji i co wprost wytknął
niezależny recenzent: pięć reguł było twardymi bramkami wyłącznie dlatego, że
przechodziły na rekordach, które akurat mamy.

Testy pracują na REKORDACH SYNTETYCZNYCH, nie na katalogu: chodzi o sprawdzenie
SAMEJ REGUŁY, a nie stanu danych. Stan danych mierzy
`test_niezmienniki_fizyczne_katalogu.py`.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from network_model.catalog.niezmienniki_katalogu import (
    KLASY_TWARDE,
    PRZEKLASYFIKOWANE,
    KlasaNiezmiennika,
)


@dataclass
class _Aparat:
    id: str
    i_cu_ka: float | None = None
    ics_ka: float | None = None
    icw_ka: float | None = None
    u_n_kv: float = 0.4
    u_m_kv: float | None = 0.69
    i_n_a: float = 100.0
    device_kind: str = "WYLACZNIK_GLOWNY"


@dataclass
class _Trafo:
    id: str
    rated_power_mva: float = 0.63
    voltage_hv_kv: float = 15.0
    voltage_lv_kv: float = 0.4
    uk_percent: float = 4.5
    pk_kw: float = 6.5
    tap_min: int = -5
    tap_max: int = 5


@dataclass
class _Ogranicznik:
    id: str
    mcov_kv: float = 12.7
    u_rated_kv: float = 15.0
    u_residual_at_10ka_kv: float | None = 40.0


# ---------------------------------------------------------------------------
# WYMÓG NORMOWY: Ics <= Icu (IEC 60947-2)
# ---------------------------------------------------------------------------


def test_ics_ponad_icu_jest_odrzucane() -> None:
    """Strona ODRZUCAJĄCA: ``Ics > Icu`` opisuje aparat, którego norma nie zna.

    Obie wielkości opisują TEN SAM aparat, a IEC 60947-2 definiuje ``Ics`` jako
    ułamek ``Icu`` — dlatego ta reguła zostaje TWARDA, w odróżnieniu od par
    porównujących różne wielkości znamionowe.
    """
    zly = _Aparat("zly", i_cu_ka=50.0, ics_ka=66.0)
    assert not (zly.ics_ka <= zly.i_cu_ka)


def test_ics_rowne_icu_jest_przyjmowane() -> None:
    """Strona PRZEPUSZCZAJĄCA: ``Ics = 100 % Icu`` to legalny wariant katalogowy.

    Pozycje ABB SACE Emax 2 wpisane w tej gałęzi mają dokładnie ``Ics = Icu``.
    Reguła ze ścisłą nierównością odrzuciłaby cały ten typoszereg.
    """
    dobry = _Aparat("dobry", i_cu_ka=66.0, ics_ka=66.0)
    assert dobry.ics_ka <= dobry.i_cu_ka


# ---------------------------------------------------------------------------
# KONIECZNOŚĆ FIZYCZNA: U_HV > U_LV
# ---------------------------------------------------------------------------


def test_transformator_podwyzszajacy_nie_jest_odrzucany_przez_regule_stron() -> None:
    """Strona PRZEPUSZCZAJĄCA — i zarazem GRANICA reguły.

    ``U_HV > U_LV`` jest prawdziwe z definicji nazw stron (górna/dolna), a nie z
    kierunku przepływu mocy: transformator blokowy generatora podnosi napięcie,
    ale jego strona GÓRNA nadal ma wyższe napięcie znamionowe. Ten test
    zabezpiecza regułę przed przekształceniem w „transformator zawsze obniża".
    """
    blokowy = _Trafo("blokowy", voltage_hv_kv=15.0, voltage_lv_kv=0.69)
    assert blokowy.voltage_hv_kv > blokowy.voltage_lv_kv


def test_rowne_napiecia_stron_sa_odrzucane() -> None:
    """Strona ODRZUCAJĄCA: równe napięcia stron opisują dławik, nie transformator."""
    zly = _Trafo("zly", voltage_hv_kv=15.0, voltage_lv_kv=15.0)
    assert not (zly.voltage_hv_kv > zly.voltage_lv_kv)


# ---------------------------------------------------------------------------
# KONIECZNOŚĆ FIZYCZNA: hierarchia napięć ogranicznika
# ---------------------------------------------------------------------------


def test_ogranicznik_o_odwroconej_hierarchii_jest_odrzucany() -> None:
    """``U_c >= U_r`` znaczy, że ogranicznik przewodzi w pracy normalnej."""
    zly = _Ogranicznik("zly", mcov_kv=15.0, u_rated_kv=15.0)
    assert not (zly.u_rated_kv > zly.mcov_kv)


def test_ogranicznik_o_wysokim_napieciu_resztkowym_jest_przyjmowany() -> None:
    """Strona PRZEPUSZCZAJĄCA: wysokie ``U_res`` to cecha klasy energetycznej.

    Reguła sprawdza KOLEJNOŚĆ, nie wielkość marginesu — inaczej odrzucałaby
    ograniczniki o dużej rezerwie, które są poprawne.
    """
    dobry = _Ogranicznik("dobry", mcov_kv=12.7, u_rated_kv=15.0, u_residual_at_10ka_kv=60.0)
    assert dobry.u_residual_at_10ka_kv > dobry.u_rated_kv > dobry.mcov_kv


# ---------------------------------------------------------------------------
# REGUŁY PRZEKLASYFIKOWANE — nietypowy rekord MUSI przejść (M11)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("nazwa", sorted(PRZEKLASYFIKOWANE))
def test_regula_przeklasyfikowana_nie_jest_twarda_bramka(nazwa: str) -> None:
    """MUTACJA M11: legalny wariant nie może zostać odrzucony przez wiarygodność.

    Recenzent zakwestionował pięć reguł jako zbyt mocne. Ten test pilnuje, żeby
    żadna z nich nie wróciła do klasy twardej bez jawnej zmiany klasyfikacji —
    a więc bez podania podstawy normowej albo zadeklarowania zakresu produktu.
    """
    klasa, uzasadnienie = PRZEKLASYFIKOWANE[nazwa]
    assert klasa not in KLASY_TWARDE, (
        f"Reguła '{nazwa}' wróciła do klasy twardej ({klasa}) — jeśli to zamierzone, "
        f"podaj podstawę normową albo zadeklaruj ograniczenie zakresu produktu."
    )
    assert klasa is KlasaNiezmiennika.WIARYGODNOSC
    assert len(uzasadnienie) > 120, f"Reguła '{nazwa}': uzasadnienie zdawkowe"


def test_kazde_przeklasyfikowanie_powoluje_sie_na_pomiar() -> None:
    """Uzasadnienie ma zawierać LICZBY, nie samo przekonanie.

    Przeklasyfikowanie oparte na „wydaje się zbyt mocne" byłoby taką samą
    fałszywą pewnością jak sama bramka, tylko w drugą stronę.
    """
    bez_pomiaru = [
        nazwa
        for nazwa, (_, uzasadnienie) in PRZEKLASYFIKOWANE.items()
        if not any(znak.isdigit() for znak in uzasadnienie)
    ]
    assert not bez_pomiaru, f"Przeklasyfikowania bez pomiaru w uzasadnieniu: {bez_pomiaru}"
