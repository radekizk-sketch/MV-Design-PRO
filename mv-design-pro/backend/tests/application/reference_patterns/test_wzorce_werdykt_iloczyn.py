"""Rekordy werdyktu wyjaśnialnego wzorców odniesienia (karta WERDYKT-MIGRACJA-190, grupa 5).

Iloczyn cech, w którym defekt mógłby się schować:
- wzorzec C: sprawdzenie {A zmiana I''k, B blokada szyn, C margines, C rezerwa} × wielkość
  {poniżej progu ostrzeżenia, równa progowi ostrzeżenia, między progami, równa progowi
  przekroczenia, powyżej} × dane {kompletne, mianownik niedodatni, próg nieobecny};
- wzorzec A: okno {szerokie, wąskie, sprzeczne} × SPZ {włączone, wyłączone} × generacja
  lokalna {nieaktywna, bez progu, poniżej progu, powyżej progu};
- niezmienniki projekcji: kod sprawdzenia ↔ rekord K, kod wzorca ↔ rekordy rekordu W,
  etykieta i wyjaśnienie z rekordu, determinizm ładunku.
"""

from __future__ import annotations

import json
from dataclasses import replace

import pytest
from application.protection_settings.engine import ProtectionSettingsInput
from application.reference_patterns import (
    PROG_GRANICZNY_PCT,
    PROG_INFORMACYJNY_PCT,
    PROG_REZERWY_SELEKTYWNOSCI_PCT,
    DaneZwarciowePunktuZabezpieczenia,
    NastawyZabezpieczen,
    ReferencePatternResult,
    TypGeneracji,
    WzorzecCInput,
    ZrodloGeneracji,
    run_pattern_a,
    run_pattern_c,
    stable_json,
)
from application.reference_patterns.wzorzec_c_generacja_lokalna import (
    MARGINES_SELEKTYWNOSCI_MIN,
    MARGINES_SELEKTYWNOSCI_OSTRZEZENIE,
    WSPOLCZYNNIK_RYZYKA_BLOKADY,
)
from werdykt.porownanie import rozstrzygniecie

# --- niezmienniki projekcji ---------------------------------------------------------------

_KOD_SPRAWDZENIA = {"SPELNIA": {"PASS", "WARN"}, "NIE_SPELNIA": {"FAIL"}}


def _niezmienniki(wynik: ReferencePatternResult, *, diagnostyka: frozenset[str]) -> None:
    for check in wynik.checks:
        status_k = check["ocena"]["status_maszynowy"]
        assert check["status_pl"] == check["ocena"]["etykieta"]["etykieta_pl"]
        assert check["wyjasnienie"] == check["ocena"]["wyjasnienie"]
        if check["name_pl"] in diagnostyka:
            continue
        dozwolone = _KOD_SPRAWDZENIA.get(status_k, {"INFO"})
        assert check["status"] in dozwolone, (check["name_pl"], status_k, check["status"])
    oceny = wynik.wymaganie.oceny_skladowe
    rozstrz = rozstrzygniecie(oceny)
    if rozstrz is None:
        assert wynik.verdict == "NIEROZSTRZYGNIETE"
    elif rozstrz == "NIE_SPELNIA":
        assert wynik.verdict == "NIEZGODNE"
    else:
        assert wynik.verdict in ("ZGODNE", "GRANICZNE")
        ostrzezenia = [c for c in wynik.checks if c["status"] == "WARN"]
        assert (wynik.verdict == "GRANICZNE") == bool(ostrzezenia)
    assert wynik.wyjasnienie == wynik.wymaganie.wyjasnienie
    assert wynik.verdict_description_pl.startswith(wynik.wymaganie.wyjasnienie.zdanie_pl)
    assert wynik.summary_pl.startswith(wynik.wymaganie.etykieta.etykieta_pl)
    slownik = wynik.to_dict()
    assert slownik["wymaganie"]["status_maszynowy"] == wynik.wymaganie.status_maszynowy
    json.dumps(slownik, allow_nan=False)


# --- wzorzec C ----------------------------------------------------------------------------


def _wejscie_c(
    *,
    ik_bez: float = 10_000.0,
    ik_gen: float = 10_200.0,
    wklad: float = 200.0,
    prog_blokady: float | None = 1_000.0,
    i_wyzszy: float = 6_000.0,
    ik_next: float | None = 4_000.0,
) -> WzorzecCInput:
    def dane(scenariusz: str, ik: float, wklad_a: float) -> DaneZwarciowePunktuZabezpieczenia:
        return DaneZwarciowePunktuZabezpieczenia(
            scenariusz=scenariusz,
            ik_3f_a=ik,
            ik_2f_a=ik * 0.866,
            ik_1f_a=None,
            wklad_generacji_a=wklad_a,
        )

    return WzorzecCInput(
        punkt_zabezpieczenia_id="pole-L1",
        punkt_zabezpieczenia_nazwa="Pole liniowe L-1",
        szyny_id="szyny-1",
        szyny_nazwa="Szyny SN 1",
        zrodla_generacji=(
            ZrodloGeneracji(
                id="pv-1",
                nazwa="PV 1",
                typ=TypGeneracji.PV,
                moc_znamionowa_kw=500.0,
                prad_zwarciowy_a=wklad,
            ),
        ),
        dane_bez_generacji=dane("bez_generacji", ik_bez, 0.0),
        dane_generacja_min=dane("generacja_min", ik_bez, wklad / 2),
        dane_generacja_max=dane("generacja_max", ik_gen, wklad),
        nastawy=NastawyZabezpieczen(
            i_wyzszy_stopien_a=i_wyzszy,
            i_nizszy_stopien_a=600.0,
            prog_blokady_szyn_a=prog_blokady,
        ),
        ik_za_nastepnym_zabezpieczeniem_a=ik_next,
    )


def _sprawdzenie(wynik: ReferencePatternResult, prefiks: str) -> dict:
    (check,) = (c for c in wynik.checks if c["name_pl"].startswith(prefiks))
    return check


_ZMIANA = [
    (PROG_INFORMACYJNY_PCT / 2, "PASS"),
    (PROG_INFORMACYJNY_PCT, "PASS"),  # równość z progiem ostrzeżenia: bez ostrzeżenia
    ((PROG_INFORMACYJNY_PCT + PROG_GRANICZNY_PCT) / 2, "WARN"),
    (PROG_GRANICZNY_PCT, "WARN"),  # równość z progiem przekroczenia spełnia relację
    (PROG_GRANICZNY_PCT * 1.5, "FAIL"),
]


@pytest.mark.parametrize(("zmiana_pct", "kod"), _ZMIANA)
def test_c_zmiana_pradu_iloczyn(zmiana_pct: float, kod: str) -> None:
    wynik = run_pattern_c(_wejscie_c(ik_bez=10_000.0, ik_gen=10_000.0 * (1 + zmiana_pct / 100)))
    check = _sprawdzenie(wynik, "A)")
    assert check["status"] == kod
    assert check["ocena"]["wynik"]["wartosc"]["wartosc"] == pytest.approx(zmiana_pct)
    assert check["ocena"]["limit"]["wartosc"]["wartosc"] == PROG_GRANICZNY_PCT
    _niezmienniki(wynik, diagnostyka=frozenset())


@pytest.mark.parametrize("ik_bez", [0.0, -5.0])
def test_c_zmiana_pradu_bez_pradu_odniesienia_nie_jest_zgodna(ik_bez: float) -> None:
    """Dawniej zmiana 0 % (INFO) i wzorzec ZGODNE — brak danych ≠ zgodny."""
    wynik = run_pattern_c(_wejscie_c(ik_bez=ik_bez, ik_gen=1_000.0, ik_next=4_000.0))
    check = _sprawdzenie(wynik, "A)")
    assert check["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert check["status"] == "INFO"
    assert wynik.verdict == "NIEROZSTRZYGNIETE"
    assert wynik.artifacts["zmiana_pradu_zwarciowego_pct"] is None
    _niezmienniki(wynik, diagnostyka=frozenset())


_BLOKADA = [
    (None, 500.0, "NIE_DOTYCZY", "INFO"),
    (0.0, 500.0, "NIE_OCENIONO", "INFO"),
    (-100.0, 500.0, "NIE_OCENIONO", "INFO"),
    (1_000.0, 500.0, "SPELNIA", "PASS"),
    # Równość z progiem ryzyka 0,8 · próg nie jest przekroczeniem (dawniej `>=` → FAIL).
    (1_000.0, WSPOLCZYNNIK_RYZYKA_BLOKADY * 1_000.0, "SPELNIA", "PASS"),
    (1_000.0, 900.0, "NIE_SPELNIA", "FAIL"),
]


@pytest.mark.parametrize(("prog", "wklad", "status_k", "kod"), _BLOKADA)
def test_c_blokada_szyn_iloczyn(prog: float | None, wklad: float, status_k: str, kod: str) -> None:
    wynik = run_pattern_c(_wejscie_c(prog_blokady=prog, wklad=wklad))
    check = _sprawdzenie(wynik, "B)")
    assert check["ocena"]["status_maszynowy"] == status_k
    assert check["status"] == kod
    if status_k == "NIE_DOTYCZY":
        assert wynik.verdict == "ZGODNE"  # niestosujące się kryterium nie blokuje oceny
    if status_k == "NIE_OCENIONO":
        assert wynik.verdict == "NIEROZSTRZYGNIETE"
    _niezmienniki(wynik, diagnostyka=frozenset())


_MARGINES = [
    (MARGINES_SELEKTYWNOSCI_MIN * 0.9, "FAIL"),
    (MARGINES_SELEKTYWNOSCI_MIN, "WARN"),  # równość z minimum spełnia relację
    ((MARGINES_SELEKTYWNOSCI_MIN + MARGINES_SELEKTYWNOSCI_OSTRZEZENIE) / 2, "WARN"),
    (MARGINES_SELEKTYWNOSCI_OSTRZEZENIE, "PASS"),  # równość z progiem ostrzeżenia
    (MARGINES_SELEKTYWNOSCI_OSTRZEZENIE * 2, "PASS"),
]


@pytest.mark.parametrize(("margines", "kod"), _MARGINES)
def test_c_margines_selektywnosci_iloczyn(margines: float, kod: str) -> None:
    wynik = run_pattern_c(_wejscie_c(ik_next=4_000.0, i_wyzszy=4_000.0 * margines))
    check = _sprawdzenie(wynik, "C)")
    assert check["status"] == kod
    _niezmienniki(wynik, diagnostyka=frozenset())


@pytest.mark.parametrize("ik_next", [0.0, -1.0])
def test_c_margines_bez_pradu_za_zabezpieczeniem(ik_next: float) -> None:
    """Dawniej margines nieskończony → PASS; teraz wielkość niewyznaczona."""
    wynik = run_pattern_c(_wejscie_c(ik_next=ik_next))
    check = _sprawdzenie(wynik, "C)")
    assert check["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert wynik.verdict == "NIEROZSTRZYGNIETE"
    _niezmienniki(wynik, diagnostyka=frozenset())


_REZERWA = [
    (PROG_REZERWY_SELEKTYWNOSCI_PCT / 2, "PASS"),
    (PROG_REZERWY_SELEKTYWNOSCI_PCT, "PASS"),
    (PROG_REZERWY_SELEKTYWNOSCI_PCT * 1.5, "WARN"),
    (PROG_REZERWY_SELEKTYWNOSCI_PCT * 2, "WARN"),
    (PROG_REZERWY_SELEKTYWNOSCI_PCT * 3, "FAIL"),
]


@pytest.mark.parametrize(("zmiana_rezerwy", "kod"), _REZERWA)
def test_c_rezerwa_selektywnosci_iloczyn(zmiana_rezerwy: float, kod: str) -> None:
    # Zmiana rezerwy = |ΔI''k| / I>> · 100 %; przy I>> = 1000 A i ΔI''k = x·10 A daje x %.
    # Zmiana I''k względem 10 000 A pozostaje ≤ 10 % — sprawdzenie A bez ostrzeżenia.
    wynik = run_pattern_c(
        _wejscie_c(ik_next=None, i_wyzszy=1_000.0, ik_gen=10_000.0 + zmiana_rezerwy * 10.0)
    )
    check = _sprawdzenie(wynik, "C)")
    assert check["status"] == kod
    assert check["ocena"]["wynik"]["wartosc"]["wartosc"] == pytest.approx(zmiana_rezerwy)
    _niezmienniki(wynik, diagnostyka=frozenset())


@pytest.mark.parametrize("i_wyzszy", [0.0, -10.0])
def test_c_rezerwa_bez_nastawy(i_wyzszy: float) -> None:
    """Dawniej rezerwa 0 % → PASS; teraz wielkość niewyznaczona."""
    wynik = run_pattern_c(_wejscie_c(ik_next=None, i_wyzszy=i_wyzszy))
    check = _sprawdzenie(wynik, "C)")
    assert check["ocena"]["status_maszynowy"] == "NIE_OCENIONO"
    assert wynik.verdict == "NIEROZSTRZYGNIETE"
    _niezmienniki(wynik, diagnostyka=frozenset())


def test_c_slad_niesie_wyjasnienie_sprawdzenia() -> None:
    wynik = run_pattern_c(_wejscie_c())
    kroki = {k["step"]: k for k in wynik.trace}
    for krok, prefiks in (
        ("sprawdzenie_zmiany_pradu", "A)"),
        ("sprawdzenie_blokady_szyn", "B)"),
        ("sprawdzenie_selektywnosci", "C)"),
    ):
        check = _sprawdzenie(wynik, prefiks)
        assert kroki[krok]["outputs"]["status"] == check["status"]
        assert kroki[krok]["outputs"]["wyjasnienie"] == check["wyjasnienie"]["zdanie_pl"]


# --- wzorzec A ----------------------------------------------------------------------------

_A_BAZA = ProtectionSettingsInput(
    line_id="linia-1",
    line_name="Linia SN 1",
    cross_section_mm2=150.0,
    conductor_material="Al",
    length_km=8.0,
    i_nominal_a=300.0,
    ik3_max_beginning_a=3500.0,
    ik3_min_beginning_a=3000.0,
    ik3_max_end_a=1800.0,
    ik3_min_end_a=1500.0,
    ik2_min_end_a=1300.0,
    ik_max_next_bus_a=1200.0,
    i_load_max_a=150.0,
    k_b=1.2,
    k_bth=1.1,
    spz_enabled=True,
    spz_pause_s=0.5,
)

_OKNA = {
    # I_min,sel = 1,2 · 1200 = 1440 A; I_max,cz = 3000 / 1,2 = 2500 A — okno szerokie.
    "szerokie": {},
    # I_min,sel = 1,2 · 1700 = 2040 A; I_max,cz = 2500 A ... wąskie: 2,45 kA · 1,2 = 2940
    "waskie": {"ik_max_next_bus_a": 2050.0},
    "sprzeczne": {"ik_max_next_bus_a": 6000.0},
    # I_min = 0 A: szerokość względna niewyznaczona — jawny sygnał, nie zero podstawione za brak.
    "bez_dolnej_granicy": {"ik_max_next_bus_a": 0.0},
}
_GENERACJA = {
    "nieaktywna": {},
    "bez_progu": {
        "lokalna_generacja_aktywna": True,
        "lokalna_generacja_typ_zrodla": "FALOWNIKOWE",
        "lokalna_generacja_wklad_a": 400.0,
    },
    "ponizej_progu": {
        "lokalna_generacja_aktywna": True,
        "lokalna_generacja_typ_zrodla": "FALOWNIKOWE",
        "lokalna_generacja_wklad_a": 400.0,
        "lokalna_generacja_prog_udzialu_zsz": 0.5,
    },
    "powyzej_progu": {
        "lokalna_generacja_aktywna": True,
        "lokalna_generacja_typ_zrodla": "SYNCHRONICZNE",
        "lokalna_generacja_wklad_a": 1_500.0,
        "lokalna_generacja_prog_udzialu_zsz": 0.1,
    },
}
_DIAGNOSTYKA_A = frozenset({"Generacja lokalna (E-L)"})


@pytest.mark.parametrize("okno", sorted(_OKNA))
@pytest.mark.parametrize("spz", [True, False])
@pytest.mark.parametrize("generacja", sorted(_GENERACJA))
def test_a_iloczyn_okno_spz_generacja(okno: str, spz: bool, generacja: str) -> None:
    wejscie = replace(_A_BAZA, spz_enabled=spz, **_OKNA[okno], **_GENERACJA[generacja])
    wynik = run_pattern_a(input_data=wejscie)
    _niezmienniki(wynik, diagnostyka=_DIAGNOSTYKA_A)

    okno_check = _sprawdzenie(wynik, "Okno nastaw")
    valid = wynik.artifacts["window_valid"]
    assert okno_check["ocena"]["status_maszynowy"] == ("SPELNIA" if valid else "NIE_SPELNIA")

    spz_check = _sprawdzenie(wynik, "SPZ")
    if not spz:
        assert spz_check["ocena"]["status_maszynowy"] == "NIE_DOTYCZY"
        assert spz_check["status"] == "INFO"

    lg = _sprawdzenie(wynik, "Generacja lokalna")
    oczekiwany_lg = {
        "nieaktywna": ("NIE_DOTYCZY", "INFO"),
        "bez_progu": ("NIE_OCENIONO", "INFO"),
        "ponizej_progu": ("SPELNIA", "PASS"),
        "powyzej_progu": ("NIE_SPELNIA", "WARN"),
    }[generacja]
    assert (lg["ocena"]["status_maszynowy"], lg["status"]) == oczekiwany_lg
    # Diagnostyka generacji lokalnej nie wchodzi do rekordu W wzorca.
    kryteria_w = {o.kryterium_id for o in wynik.wymaganie.oceny_skladowe}
    assert "wzorzec_a.generacja_lokalna_zsz" not in kryteria_w
    assert len(kryteria_w) == 5

    if not valid:
        assert wynik.verdict == "NIEZGODNE"
    elif generacja == "powyzej_progu" or okno in ("waskie", "bez_dolnej_granicy"):
        assert wynik.verdict in ("GRANICZNE", "NIEZGODNE")
        if wynik.verdict == "GRANICZNE":
            assert "Ograniczenia:" in wynik.verdict_description_pl
    else:
        assert wynik.verdict in ("ZGODNE", "NIEZGODNE")


def test_a_okno_waskie_jest_waskie() -> None:
    """Strażnik danych iloczynu: wariant „wąskie” daje okno prawidłowe i wąskie."""
    wynik = run_pattern_a(input_data=replace(_A_BAZA, **_OKNA["waskie"]))
    assert wynik.artifacts["window_valid"] is True
    assert _sprawdzenie(wynik, "Okno nastaw")["status"] == "WARN"
    assert wynik.verdict == "GRANICZNE"


def test_a_okno_bez_dolnej_granicy_nazywa_brak_szerokosci() -> None:
    """Dawniej szerokość względna 0 podstawiona za I_min ≤ 0 („okno wąskie 0,0 %”)."""
    wynik = run_pattern_a(input_data=replace(_A_BAZA, **_OKNA["bez_dolnej_granicy"]))
    okno = _sprawdzenie(wynik, "Okno nastaw")
    assert okno["status"] == "WARN"
    assert "niewyznaczona" in okno["description_pl"]
    assert "wąskie" not in okno["description_pl"]
    assert wynik.verdict == "GRANICZNE"
    assert "szerokość względna okna nastaw niewyznaczona" in wynik.verdict_description_pl


@pytest.mark.parametrize("plik", ["case_A_zgodne.json", "case_D_generacja_lokalna.json"])
def test_wzorce_deterministyczne(plik: str) -> None:
    assert stable_json(run_pattern_a(fixture_file=plik).to_dict()) == stable_json(
        run_pattern_a(fixture_file=plik).to_dict()
    )
    zgodny = _wejscie_c()
    assert stable_json(run_pattern_c(zgodny).to_dict()) == stable_json(
        run_pattern_c(zgodny).to_dict()
    )
