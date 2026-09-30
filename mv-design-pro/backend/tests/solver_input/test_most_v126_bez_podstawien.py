"""Most ENM → wejście V12.6: brak danej NIE zamienia się w liczbę (MOST-WEJSCIA-V126).

TEST JAKO ILOCZYN CECH, NIE PRZYKŁAD Z KARTY (reguła KLASA §2). Defekt mógłby się
schować w każdej kratce iloczynu

    {aparat łączeniowy · kabel · linia napowietrzna · transformator}
  × {dana OBECNA · dana NIEOBECNA · dana JAWNIE ZEROWA}

więc pokrywamy go w całości, a nie tylko w kratce nazwanej w karcie. Trzecia
kolumna jest tu najważniejsza: to ona odróżnia BRAK od ZERA, czyli dokładnie to,
czego operator ``or`` nie umiał.

CO PINUJĄ TE TESTY (stan sprzed naprawy, zmierzony):
  * ``ampacity_a=630.0`` — obciążalność zmyślona KAŻDEMU aparatowi łączeniowemu;
  * ``float(getattr(rating, "in_a", None) or 300.0)`` — 300 A odcinkowi bez
    obciążalności;
  * ``float(getattr(branch, "r_ohm", None) or 0.001)`` — JAWNE 0,0 Ω aparatu
    (wartość, którą operacje domenowe nadają każdemu tworzonemu aparatowi)
    podmieniane na 0,001, przy okazji z błędem jednostki: omy trafiały do pola
    „omy na kilometr" przy długości 0,001 km, czyli dzieliły daną przez 1000;
  * ``1000.0 * rated / (√3 · 15.0)`` — napięcie szyny zaszyte na 15 kV.
"""

from __future__ import annotations

import math

import pytest
from enm.mapping import map_enm_to_network_graph
from enm.models import GEN_TYPES_PRZEKSZTALTNIKOWE, EnergyNetworkModel, ENMHeader
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AnalysisType,
    build_v126_input_from_enm,
    generatory_przeksztaltnikowe_v126,
    pominiete_zrodla_v126,
)

_SZYNA_A = "BUS_A"
_SZYNA_B = "BUS_B"


def _model(
    *,
    branches: list[dict] | None = None,
    transformers: list[dict] | None = None,
    generators: list[dict] | None = None,
    napiecie_kv: float = 15.0,
) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="most-bez-podstawien").model_dump(),
            "buses": [
                {"ref_id": _SZYNA_A, "name": "Szyna A", "voltage_kv": napiecie_kv},
                {"ref_id": _SZYNA_B, "name": "Szyna B", "voltage_kv": napiecie_kv},
            ],
            "branches": branches or [],
            "transformers": transformers or [],
            "generators": generators or [],
        }
    )


def _odcinek(rodzaj: str, **nadpisania: object) -> dict:
    """Kabel albo linia napowietrzna z kompletem pól WYMAGANYCH modelu."""
    dane: dict = {
        "ref_id": f"{rodzaj}-1",
        "name": "Odcinek",
        "type": rodzaj,
        "from_bus_ref": _SZYNA_A,
        "to_bus_ref": _SZYNA_B,
        "length_km": 2.5,
        "r_ohm_per_km": 0.206,
        "x_ohm_per_km": 0.118,
    }
    dane.update(nadpisania)
    return dane


def _aparat(**nadpisania: object) -> dict:
    dane: dict = {
        "ref_id": "APARAT-1",
        "name": "Wyłącznik pola SN",
        "type": "breaker",
        "from_bus_ref": _SZYNA_A,
        "to_bus_ref": _SZYNA_B,
    }
    dane.update(nadpisania)
    return dane


def _galaz(wejscie, ref: str):
    return next(b for b in wejscie.branches if b.ref == ref)


# ---------------------------------------------------------------------------
# OBCIĄŻALNOŚĆ — iloczyn {aparat · kabel · linia} × {model · katalog · brak}
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", ["cable", "line_overhead"])
def test_obciazalnosc_odcinka_z_modelu(rodzaj: str) -> None:
    """Obciążalność jawna w modelu (``rating.in_a``) idzie do wejścia bez zmian."""
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek(rodzaj, rating={"in_a": 245.0})]))
    assert _galaz(wejscie, f"{rodzaj}-1").ampacity_a == pytest.approx(245.0)


@pytest.mark.parametrize("rodzaj", ["cable", "line_overhead"])
def test_obciazalnosc_odcinka_z_katalogu(rodzaj: str) -> None:
    """Bez ``rating`` obciążalność bierze się z MATERIALIZACJI katalogowej.

    ``rated_current_a`` należy do ``solver_fields`` kontraktu KABEL_SN/LINIA_SN,
    więc jest realnym źródłem danej — a nie zapasem. Reużycie zamiast zmyślania.
    """
    wejscie = build_v126_input_from_enm(
        _model(branches=[_odcinek(rodzaj, materialized_params={"rated_current_a": 395.0})])
    )
    assert _galaz(wejscie, f"{rodzaj}-1").ampacity_a == pytest.approx(395.0)


@pytest.mark.parametrize("rodzaj", ["cable", "line_overhead"])
def test_odcinek_bez_obciazalnosci_nie_dostaje_liczby(rodzaj: str) -> None:
    """PIN NA DEFEKT: przed naprawą odcinek bez obciążalności dostawał 300 A."""
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek(rodzaj)]))
    assert _galaz(wejscie, f"{rodzaj}-1").ampacity_a is None


def test_aparat_bez_obciazalnosci_nie_dostaje_liczby() -> None:
    """PIN NA DEFEKT: przed naprawą KAŻDY aparat dostawał 630 A z powietrza."""
    wejscie = build_v126_input_from_enm(_model(branches=[_aparat()]))
    assert _galaz(wejscie, "APARAT-1").ampacity_a is None


def test_aparat_z_katalogu_niesie_swoj_prad_znamionowy() -> None:
    """Aparat z kartą katalogową APARAT_SN (``i_n_a``) niesie SWÓJ prąd, nie 630 A."""
    wejscie = build_v126_input_from_enm(
        _model(branches=[_aparat(materialized_params={"i_n_a": 400.0})])
    )
    assert _galaz(wejscie, "APARAT-1").ampacity_a == pytest.approx(400.0)


def test_obciazalnosc_niedodatnia_jest_brakiem_a_nie_dana() -> None:
    """Zero amperów obciążalnością nie jest — kontrakt wymaga wartości dodatniej.

    Gdyby zero przechodziło, iloraz I/I_dop dawałby nieskończoność udającą
    stopień obciążenia. To kratka iloczynu „dana JAWNIE ZEROWA" dla obciążalności.
    """
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek("cable", rating={"in_a": 0.0})]))
    assert _galaz(wejscie, "cable-1").ampacity_a is None


# ---------------------------------------------------------------------------
# IMPEDANCJA APARATU — {obecna · nieobecna · JAWNIE ZEROWA}
# ---------------------------------------------------------------------------


def test_jawne_zero_rezystancji_aparatu_przezywa_most() -> None:
    """PIN GŁÓWNY KARTY: jawne ``r_ohm = 0,0`` MUSI przeżyć.

    Operacje domenowe nadają tę wartość każdemu tworzonemu aparatowi
    (``domain_operations``: „r_ohm": 0.0, „x_ohm": 0.0), a wyrażenie
    ``getattr(branch, "r_ohm", None) or 0.001`` podmieniało ją na 0,001 — bo
    ``or`` nie odróżnia braku danej od zera, a rezystancja styku aparatu jest
    fizycznie bliska zeru. Podmieniana była więc DANA, nie brak.
    """
    wejscie = build_v126_input_from_enm(_model(branches=[_aparat(r_ohm=0.0, x_ohm=0.0)]))
    galaz = _galaz(wejscie, "APARAT-1")
    assert galaz.r_ohm_per_km * galaz.length_km == 0.0
    assert galaz.x_ohm_per_km * galaz.length_km == 0.0


def test_rezystancja_styku_aparatu_zachowuje_rzad_wielkosci() -> None:
    """PIN NA BŁĄD JEDNOSTKI wykryty przy tej karcie.

    Aparat jest elementem SKUPIONYM (Ω), a kontrakt niesie parę (Ω/km, km) i
    używa jej ILOCZYNU. Most wstawiał omową wartość do pola per-km przy długości
    0,001 km, więc realna rezystancja styku 0,002 Ω wchodziła do obliczeń jako
    2·10⁻⁶ Ω — tysiąc razy mniejsza. Iloczyn musi równać się danej.
    """
    wejscie = build_v126_input_from_enm(_model(branches=[_aparat(r_ohm=0.002, x_ohm=0.004)]))
    galaz = _galaz(wejscie, "APARAT-1")
    assert galaz.r_ohm_per_km * galaz.length_km == pytest.approx(0.002, rel=1e-12)
    assert galaz.x_ohm_per_km * galaz.length_km == pytest.approx(0.004, rel=1e-12)


def test_aparat_bez_impedancji_jest_lacznikiem_idealnym() -> None:
    """Brak danej ⇒ zero, i to jest ZNACZENIE MODELU, nie liczba z powietrza.

    Aparat łączeniowy jest w kanonie urządzeniem bez impedancji (drugi most,
    ``enm.mapping``, mapuje go na ``Switch``, który impedancji nie ma w ogóle);
    pola ``r_ohm``/``x_ohm`` są opcjonalnym uściśleniem. Zmyślone było 0,001 Ω.
    """
    wejscie = build_v126_input_from_enm(_model(branches=[_aparat()]))
    galaz = _galaz(wejscie, "APARAT-1")
    assert galaz.r_ohm_per_km * galaz.length_km == 0.0
    assert galaz.x_ohm_per_km * galaz.length_km == 0.0


# ---------------------------------------------------------------------------
# ODCINEK — pola wymagane czytane wprost, susceptancja z rozróżnieniem braku
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("rodzaj", ["cable", "line_overhead"])
def test_dlugosc_i_impedancja_odcinka_ida_z_modelu(rodzaj: str) -> None:
    """Pola WYMAGANE modelu idą wprost — bez martwych wartości zapasowych.

    Wcześniejsze ``getattr(..., 1.0 / 0.18 / 0.12)`` były nieosiągalne (pydantic
    nie dopuści obiektu bez pola wymaganego), a wyglądały na założenie projektowe.
    """
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek(rodzaj)]))
    galaz = _galaz(wejscie, f"{rodzaj}-1")
    assert galaz.length_km == pytest.approx(2.5)
    assert galaz.r_ohm_per_km == pytest.approx(0.206)
    assert galaz.x_ohm_per_km == pytest.approx(0.118)


@pytest.mark.parametrize(
    ("podana", "oczekiwana"),
    [(3.1e-6, 3.1e-6), (0.0, 0.0), (None, None)],
    ids=["obecna", "jawnie-zerowa", "nieobecna"],
)
def test_susceptancja_odroznia_zero_od_braku(
    podana: float | None, oczekiwana: float | None
) -> None:
    """Trzecia kolumna iloczynu dla susceptancji: 0 S/km ≠ „nie wiadomo".

    Rozróżnienie ma skutek: ryzyko ferrorezonansu stoi na sumie B·ℓ sieci, więc
    suma z podstawionym zerem meldowała „brak przesłanek" tam, gdzie danych po
    prostu nie było.
    """
    nadpisania: dict = {} if podana is None else {"b_siemens_per_km": podana}
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek("cable", **nadpisania)]))
    galaz = _galaz(wejscie, "cable-1")
    if oczekiwana is None:
        assert galaz.b_siemens_per_km is None
    else:
        assert galaz.b_siemens_per_km == pytest.approx(oczekiwana)


# ---------------------------------------------------------------------------
# TRANSFORMATOR — czwarty rodzaj elementu w iloczynie
# ---------------------------------------------------------------------------


def _transformator(**nadpisania: object) -> dict:
    dane: dict = {
        "ref_id": "TR-1",
        "name": "Transformator",
        "hv_bus_ref": _SZYNA_A,
        "lv_bus_ref": _SZYNA_B,
        "sn_mva": 16.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 10.5,
        "pk_kw": 90.0,
    }
    dane.update(nadpisania)
    return dane


@pytest.mark.parametrize(
    ("podane", "oczekiwane"),
    [(12.5, 12.5), (0.0, 0.0)],
    ids=["obecne", "jawnie-zerowe"],
)
def test_straty_jalowe_transformatora(podane: float, oczekiwane: float) -> None:
    """Straty jałowe: wartość podana przechodzi, także jawne zero."""
    wejscie = build_v126_input_from_enm(_model(transformers=[_transformator(p0_kw=podane)]))
    assert wejscie.transformers[0].p0_kw == pytest.approx(oczekiwane)


def test_straty_jalowe_transformatora_nieobecne_nie_dostaja_liczby() -> None:
    """PIN NA DEFEKT (karta FAB-D2, D2): przed naprawą brak p0_kw dostawał 0.0.

    Zero strat jałowych JEST wynikiem fizycznym (transformator idealny), nie
    synonimem „nie wiadomo" — most `transformer.p0_kw or 0.0` (ENM ma to pole
    jako `float | None`) mylił te dwa stany identycznie jak defekty pinowane
    wyżej w tym pliku dla obciążalności/susceptancji/skoku zaczepu. Tu drobna
    różnica: solver `_opf_loss_lcc` (`network_model/solvers/v126_academic.py`)
    NIE ma dziś własnej ścieżki „brak = niedostępne" (FROZEN, B-01). Do karty
    W3-E (2026-09-09) brak musiał więc zablokować URUCHOMIENIE tej jednej
    analizy w warstwie API; W3-E wycofała CAŁY rodzaj `opf_loss_lcc` z
    powierzchni nowych biegów (410, duplikuje `equipment_checks/
    transformer_losses.py` — β rzeczywisty z karty katalogowej, nie zaszyte
    0,45; patrz `tests/api/test_v126_opf_loss_lcc_api.py`), więc ta konkretna
    bramka p0_kw stała się zbędna i została zdjęta razem z rodzajem — pole
    `p0_kw` zostaje `float | None` z tego samego powodu co reszta mostu
    (rozróżnienie „nieznane" vs „zero" jest faktem modelu, niezależnym od
    tego, który rodzaj V12.6 dziś to pole czyta).
    """
    wejscie = build_v126_input_from_enm(_model(transformers=[_transformator()]))
    assert wejscie.transformers[0].p0_kw is None


@pytest.mark.parametrize(
    ("podany", "oczekiwany"),
    [(1.5, 1.5), (0.0, 0.0), (None, 2.5)],
    ids=["obecny", "jawnie-zerowy", "nieobecny"],
)
def test_skok_zaczepu_odroznia_zero_od_braku(podany: float | None, oczekiwany: float) -> None:
    """PIN NA DEFEKT w DRUGIM moście (``enm.mapping``): ``tap_step_percent or 2.5``.

    Transformator z JAWNIE podanym skokiem 0,0 % (brak regulacji zaczepowej)
    dostawał 2,5 %, czyli regulację, której model NIE MA — a skok wchodzi wprost
    do przekładni t = 1 + poz·skok/100, czyli do rozpływu mocy. To ta sama klasa,
    co ``r_ohm or 0.001`` w moście V12.6, tylko w innym pliku.
    """
    nadpisania: dict = {} if podany is None else {"tap_step_percent": podany}
    graf = map_enm_to_network_graph(_model(transformers=[_transformator(**nadpisania)]))
    galaz = next(iter(graf.branches.values()))
    assert galaz.tap_step_percent == pytest.approx(oczekiwany)


# ---------------------------------------------------------------------------
# ŹRÓDŁO HARMONICZNE — napięcie z modelu, nie zaszyte
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("napiecie_kv", [0.4, 15.0, 20.0, 30.0])
def test_prad_bazowy_zrodla_harmonicznego_z_napiecia_szyny(napiecie_kv: float) -> None:
    """PIN NA DEFEKT: prąd bazowy liczył się z ZASZYTYCH 15 kV.

    Każde źródło spoza tego poziomu dostawało prąd zafałszowany proporcją napięć,
    a prąd bazowy wchodzi wprost do wstrzyknięcia harmonicznych, czyli do THD,
    TDD i oceny zgodności. Źródło harmoniczne wymaga karty z mocą znamionową
    (`sn_mva`) ORAZ widma. Przepisany w karcie AB-H0: widmo szło dotąd kluczem
    `harmonic_spectrum_percent` wstrzykniętym RĘCZNIE do `materialized_params`
    (pole skasowane z katalogu — żaden typ go nie materializuje); jedynym torem widma
    jest jawne wejście `parameters.harmonic_spectra`. Intencja bez zmian: test pinuje
    wyłącznie napięcie bazowe, nie widmo.
    """
    model = _model(
        napiecie_kv=napiecie_kv,
        generators=[
            {
                "ref_id": "PV-1",
                "name": "Falownik PV",
                "bus_ref": _SZYNA_A,
                "p_mw": 2.0,
                "gen_type": "pv_inverter",
                "materialized_params": {"sn_mva": 2.2},
            }
        ],
    )
    wejscie = build_v126_input_from_enm(
        model, parameters={"harmonic_spectra": {"PV-1": {"5": 3.0}}}
    )
    assert len(wejscie.harmonic_sources) == 1
    oczekiwany = 1000.0 * 2.2 / (math.sqrt(3.0) * napiecie_kv)
    assert wejscie.harmonic_sources[0].base_current_a == pytest.approx(oczekiwany, rel=1e-9)


# ---------------------------------------------------------------------------
# KARTA W2-C — zero fabrykacji parametrów przekształtnika (widmo/droop/tryb/moc)
# ---------------------------------------------------------------------------
#
# Iloczyn cech pokrywany poniżej (reguła KLASA §2): {karta · karta z kluczem widma
# wstrzykniętym mimo katalogu · jawne wejście RECZNE poprawne · RECZNE częściowo
# błędne · generator bez KARTY w ogóle} × {BESS z GFM zadeklarowanym w karcie · bez
# GFM} × {moc znamionowa obecna (sn_mva/s_n_kva) · nieobecna} × {każdy rodzaj
# `GEN_TYPES_PRZEKSZTALTNIKOWE`}.
#
# Karta AB-H0: `ConverterType.harmonic_spectrum_percent` skasowane (0 ze 176 pozycji
# niosło widmo), więc karta katalogowa NIE jest już źródłem widma — jedynym torem jest
# jawne wejście projektanta. Testy, które wstrzykiwały klucz ręcznie do
# `materialized_params` (proweniencja „KATALOG"), przepisano: intencja „źródło z
# widmem wchodzi z nazwaną proweniencją" przechodzi na widmo RECZNE, a klucz
# wstrzyknięty jest pinowany jako MARTWY (niczego nie zasila).

_KARTA_GFL_KOMPLETNA: dict = {
    "un_kv": 15.0,
    "sn_mva": 2.2,
    "control_mode": "Q_OF_U",
}

_KARTA_GFM_KOMPLETNA: dict = {
    "un_kv": 30.0,
    "sn_mva": 55.0,
    "control_mode": "GRID_FORMING",
    "droop_p_f_percent": 4.0,
    "droop_q_u_percent": 3.0,
}


def _przeksztaltnik(**nadpisania: object) -> dict:
    dane: dict = {
        "ref_id": "PV-1",
        "name": "Przekształtnik",
        "bus_ref": _SZYNA_A,
        "p_mw": 2.0,
        "gen_type": "pv_inverter",
    }
    dane.update(nadpisania)
    return dane


def test_klucz_widma_wstrzykniety_do_karty_jest_martwy() -> None:
    """Przepisany w karcie AB-H0 (dawniej: „karta z widmem daje źródło z proweniencją
    KATALOG"). Pole `harmonic_spectrum_percent` zniknęło z katalogu, więc klucz w
    `materialized_params` może pochodzić WYŁĄCZNIE z wstrzyknięcia mimo katalogu —
    most go NIE czyta: źródła harmonicznego brak, pominięcie nazwane kodem, a
    przekształtnik (moc, tryb, droop z karty) nadal wchodzi do wejścia."""
    karta = {**_KARTA_GFL_KOMPLETNA, "harmonic_spectrum_percent": {5: 4.5, 7: 2.1}}
    model = _model(generators=[_przeksztaltnik(materialized_params=karta)])
    wejscie = build_v126_input_from_enm(model)
    assert wejscie.harmonic_sources == []
    assert len(wejscie.converters) == 1
    assert wejscie.converters[0].rated_mva == pytest.approx(2.2)
    assert wejscie.converters[0].mode == "GFL"
    assert wejscie.converters[0].droop_p_f_percent is None
    assert wejscie.converters[0].droop_q_u_percent is None
    assert [(z["ref"], z["kod"]) for z in pominiete_zrodla_v126(model)] == [
        ("PV-1", "generator.harmonic_spectrum_missing")
    ]


def test_przeksztaltnik_bez_widma_ma_przeksztaltnik_ale_nie_zrodlo_harmoniczne() -> None:
    """PIN NA DEFEKT USUNIĘTY KARTĄ W2-C: przekształtnik bez widma NIE dostaje
    zaszytego {5:3%, 7:2%, 11:1,2%, 13:1%} wspólnego dla każdego przekształtnika —
    źródło harmoniczne jest POMINIĘTE, ale przekształtnik (moc, tryb, Q) nadal
    wchodzi do wejścia V12.6 (SSCI go widzi)."""
    model = _model(generators=[_przeksztaltnik(materialized_params=_KARTA_GFL_KOMPLETNA)])
    wejscie = build_v126_input_from_enm(model)
    assert len(wejscie.converters) == 1
    assert wejscie.harmonic_sources == []


def test_przeksztaltnik_bez_zadnej_karty_jest_pominiety_calkowicie() -> None:
    """PIN NA DEFEKT USUNIĘTY TĄ KARTĄ: `rated = max(abs(P), 0,1 MVA)` dawał
    przekształtnikowi bez karty zmyśloną moc znamionową 2,0 MVA (=P) — dziś
    generator bez ŻADNEJ materializacji katalogowej jest pominięty w CAŁOŚCI
    (ani converters, ani harmonic_sources), nie wchodzi z liczbą z powietrza."""
    model = _model(generators=[_przeksztaltnik()])
    wejscie = build_v126_input_from_enm(model)
    assert wejscie.converters == []
    assert wejscie.harmonic_sources == []


def test_przeksztaltnik_z_karta_bez_mocy_znamionowej_jest_pominiety_calkowicie() -> None:
    """Karta ISTNIEJE (niesie inne pola) ale bez `sn_mva`/`s_n_kva` — nadal
    pominięcie CAŁKOWITE, nie `max(P, 0,1 MVA)`."""
    karta_bez_mocy = {"un_kv": 15.0, "control_mode": "Q_OF_U"}
    model = _model(generators=[_przeksztaltnik(materialized_params=karta_bez_mocy)])
    wejscie = build_v126_input_from_enm(model)
    assert wejscie.converters == []
    assert wejscie.harmonic_sources == []


def test_przeksztaltnik_moc_znamionowa_z_klucza_s_n_kva_zapasowego_namespace() -> None:
    """Generator materializowany z namespace'u nN (`s_n_kva`, nie `sn_mva`) nadal
    dostaje realną moc znamionową — konwersja kVA -> MVA, nie pominięcie."""
    karta_nn = {"un_kv": 0.4, "s_n_kva": 50.0, "control_mode": "Q_OF_U"}
    model = _model(napiecie_kv=0.4, generators=[_przeksztaltnik(materialized_params=karta_nn)])
    wejscie = build_v126_input_from_enm(model)
    assert len(wejscie.converters) == 1
    assert wejscie.converters[0].rated_mva == pytest.approx(0.05)


def test_bess_z_karta_grid_forming_dostaje_tryb_gfm_i_droop_z_karty() -> None:
    """Tryb grid-forming z KARTY (`control_mode == "GRID_FORMING"`), nie z
    `gen_type == "bess"` — PIN NA DEFEKT USUNIĘTY: `mode = "GFL" if gen_type !=
    "bess" else "GFM_droop"` dawał KAŻDEMU BESS tryb GFM niezależnie od karty."""
    model = _model(
        generators=[
            _przeksztaltnik(
                ref_id="BESS-1", gen_type="bess", materialized_params=_KARTA_GFM_KOMPLETNA
            )
        ]
    )
    wejscie = build_v126_input_from_enm(model)
    konwerter = wejscie.converters[0]
    assert konwerter.mode == "GFM_droop"
    assert konwerter.droop_p_f_percent == pytest.approx(4.0)
    assert konwerter.droop_q_u_percent == pytest.approx(3.0)


def test_bess_bez_deklaracji_gfm_w_karcie_pracuje_jako_gfl() -> None:
    """Kontrola dwustronna: BESS jest fizycznym typem magazynu, ale bez
    zadeklarowanej zdolności GRID_FORMING w karcie pracuje jako grid-following
    — to własność karty, nie domysł z `gen_type == "bess"`."""
    karta_bess_gfl = {"un_kv": 15.0, "sn_mva": 5.0, "control_mode": "Q_OF_U"}
    model = _model(
        generators=[
            _przeksztaltnik(ref_id="BESS-1", gen_type="bess", materialized_params=karta_bess_gfl)
        ]
    )
    wejscie = build_v126_input_from_enm(model)
    konwerter = wejscie.converters[0]
    assert konwerter.mode == "GFL"
    assert konwerter.droop_p_f_percent is None
    assert konwerter.droop_q_u_percent is None


def test_pv_z_deklaracja_grid_forming_w_karcie_dostaje_tryb_gfm() -> None:
    """Kontrola dwustronna PO DRUGIEJ STRONIE: PV (nie tylko BESS) z kartą
    `control_mode == "GRID_FORMING"` dostaje tryb GFM — dawny kod nigdy nie
    dawał PV trybu grid-forming, niezależnie od karty (fałszywy warunek
    `gen_type != "bess"`)."""
    model = _model(generators=[_przeksztaltnik(materialized_params=_KARTA_GFM_KOMPLETNA)])
    wejscie = build_v126_input_from_enm(model)
    assert wejscie.converters[0].mode == "GFM_droop"


def test_widmo_reczne_wchodzi_z_proweniencja_reczne_mimo_klucza_wstrzyknietego() -> None:
    """Przepisany w karcie AB-H0 (dawniej: „widmo ręczne nadpisuje widmo karty").
    Jawne wejście projektanta (`parameters.harmonic_spectra`, wzorzec OD-15(a)) jest
    JEDYNYM źródłem widma: wchodzi z proweniencją RECZNE, a klucz wstrzyknięty do karty
    niczego nie zmienia."""
    karta = {**_KARTA_GFL_KOMPLETNA, "harmonic_spectrum_percent": {5: 1.0}}
    model = _model(generators=[_przeksztaltnik(materialized_params=karta)])
    wejscie = build_v126_input_from_enm(
        model, parameters={"harmonic_spectra": {"PV-1": {"5": 9.9, "7": 1.1}}}
    )
    zrodlo = wejscie.harmonic_sources[0]
    assert zrodlo.spectrum_percent == {5: 9.9, 7: 1.1}
    assert zrodlo.spectrum_provenance == "RECZNE"


def test_widmo_reczne_dla_przeksztaltnika_z_karta_wchodzi_z_proweniencja_reczne() -> None:
    """Jawne wejście działa dla przekształtnika z kartą (moc znamionowa) —
    źródło harmoniczne WCHODZI i nie ma pominięcia."""
    model = _model(generators=[_przeksztaltnik(materialized_params=_KARTA_GFL_KOMPLETNA)])
    parametry = {"harmonic_spectra": {"PV-1": {"5": 6.0}}}
    wejscie = build_v126_input_from_enm(model, parameters=parametry)
    assert len(wejscie.harmonic_sources) == 1
    assert wejscie.harmonic_sources[0].spectrum_provenance == "RECZNE"
    assert pominiete_zrodla_v126(model, parameters=parametry) == []


@pytest.mark.parametrize(
    ("widmo", "fragmenty_powodu"),
    [
        pytest.param({"51": 5.0, "5": 150.0, "x": 3.0}, ("rząd 51", "150.0 %", "'x'"), id="same"),
        # PIN NA DEFEKT (karta AB-H0 §9.2): widmo częściowo błędne było CZYSZCZONE —
        # {5: 3,0} wchodziło po cichu bez rzędu 51, wbrew docstringowi funkcji.
        pytest.param({"5": 3.0, "51": 5.0}, ("rząd 51",), id="czesciowo-bledne"),
        pytest.param({"5": True}, ("wartość logiczna",), id="bool"),
        pytest.param({"5": 3.0, "05": 4.0}, ("rząd 5 podany wielokrotnie",), id="duplikat"),
        pytest.param({}, ("puste",), id="puste"),
        pytest.param([5, 3.0], ("puste albo nie jest mapą",), id="nie-mapa"),
    ],
)
def test_widmo_reczne_bledne_odrzucone_w_calosci_z_powodem(
    widmo: object, fragmenty_powodu: tuple[str, ...]
) -> None:
    """Widmo z choćby jednym błędnym wpisem jest ODRZUCANE W CAŁOŚCI z powodem
    wymieniającym każdy błąd — zero częściowego czyszczenia, zero fabrykacji."""
    model = _model(generators=[_przeksztaltnik(materialized_params=_KARTA_GFL_KOMPLETNA)])
    parametry = {"harmonic_spectra": {"PV-1": widmo}}
    assert build_v126_input_from_enm(model, parameters=parametry).harmonic_sources == []
    [pominiecie] = pominiete_zrodla_v126(model, parameters=parametry)
    assert (pominiecie["ref"], pominiecie["kod"]) == ("PV-1", "generator.harmonic_spectrum_missing")
    assert "odrzucone w całości" in pominiecie["powod"]
    for fragment in fragmenty_powodu:
        assert fragment in pominiecie["powod"], pominiecie["powod"]


@pytest.mark.parametrize("gen_type", sorted(GEN_TYPES_PRZEKSZTALTNIKOWE))
def test_kazdy_rodzaj_przeksztaltnikowy_wchodzi_do_wejscia_v126(gen_type: str) -> None:
    """PIN NA DEFEKT (karta AB-H0 Pakiet D): lokalna kopia zbioru rodzajów w moście
    pomijała `wind_inverter` — turbina z pełnym przekształtnikiem znikała z analiz
    V12.6 bez kodu. Każdy rodzaj kanonicznego zbioru z kartą i widmem ręcznym wchodzi
    jako przekształtnik i źródło harmoniczne, i jest kandydatem listy 422."""
    model = _model(
        generators=[
            _przeksztaltnik(
                ref_id="G-1", gen_type=gen_type, materialized_params=_KARTA_GFL_KOMPLETNA
            )
        ]
    )
    wejscie = build_v126_input_from_enm(model, parameters={"harmonic_spectra": {"G-1": {"5": 2.0}}})
    assert [k.ref for k in wejscie.converters] == ["G-1"]
    assert [z.source_ref for z in wejscie.harmonic_sources] == ["G-1"]
    assert generatory_przeksztaltnikowe_v126(model) == ["G-1"]


# ---------------------------------------------------------------------------
# MOC BIERNA WYTWÓRCY — karta FAB-H (H2, KLASA NIE INSTANCJA): iloczyn cech
# jawne | Q-set-point karty | brak, dla agregatu Q szyny (`generation_mvar`).
# ---------------------------------------------------------------------------


def test_moc_bierna_wytworcy_jawna_wchodzi_do_agregatu_szyny() -> None:
    model = _model(
        generators=[
            {
                "ref_id": "GEN-1",
                "name": "Generator",
                "bus_ref": _SZYNA_A,
                "p_mw": 1.0,
                "q_mvar": 0.42,
            }
        ],
    )
    wejscie = build_v126_input_from_enm(model)
    szyna_a = next(b for b in wejscie.buses if b.ref == _SZYNA_A)
    assert szyna_a.generation_mvar == pytest.approx(0.42, rel=1e-9)


def test_moc_bierna_wytworcy_q_set_point_karty_wchodzi_do_agregatu_szyny() -> None:
    """PIN NA DEFEKT (karta FAB-H, KLASA NIE INSTANCJA): Q nieznane wprost, ale
    karta katalogowa niesie zdegenerowany Q-set-point (``qmin_mvar == qmax_mvar``)
    — przed naprawą ten most czytał WYŁĄCZNIE ``generator.q_mvar``, więc karta
    katalogowa była ignorowana i agregat dostawał 0,0 mimo jawnej liczby w karcie
    (dokładnie ten sam warunek, który bramka gotowości już wtedy odczytywała —
    dwa niezależne warunki, które "dziś się zgadzają", są defektem)."""
    model = _model(
        generators=[
            {
                "ref_id": "GEN-1",
                "name": "Generator",
                "bus_ref": _SZYNA_A,
                "p_mw": 1.0,
                "materialized_params": {"qmin_mvar": 0.3, "qmax_mvar": 0.3},
            }
        ],
    )
    wejscie = build_v126_input_from_enm(model)
    szyna_a = next(b for b in wejscie.buses if b.ref == _SZYNA_A)
    assert szyna_a.generation_mvar == pytest.approx(0.3, rel=1e-9)


def test_moc_bierna_wytworcy_brak_jest_wylacznie_strukturalnym_zerem_agregatu() -> None:
    """Q naprawdę nieznane (brak pola, brak Q-set-pointu karty) => 0,0 jako
    WYŁĄCZNIE strukturalne wypełnienie agregatu (V126BusInput.generation_mvar
    jest float nie-Optional) — analizy, które to Q faktycznie CZYTAJĄ
    (RELIABILITY_CONTINGENCY, OPF_LOSS_LCC), są zablokowane PRZED solverem przez
    `api/v126_academic.py` (kod gotowości `generator.q_missing`), patrz
    tests/api/test_v126_generator_q_missing_api.py."""
    model = _model(
        generators=[{"ref_id": "GEN-1", "name": "Generator", "bus_ref": _SZYNA_A, "p_mw": 1.0}],
    )
    wejscie = build_v126_input_from_enm(model)
    szyna_a = next(b for b in wejscie.buses if b.ref == _SZYNA_A)
    assert szyna_a.generation_mvar == 0.0


# ---------------------------------------------------------------------------
# KONSUMENCI — brak obciążalności mówi po polsku, nie liczbą
# ---------------------------------------------------------------------------


def _wynik(rodzaj: V126AnalysisType, model: EnergyNetworkModel) -> dict:
    wejscie = build_v126_input_from_enm(model)
    return V126AcademicSolver().run(rodzaj, wejscie)["result"]


def test_niezawodnosc_melduje_brak_obciazalnosci_po_polsku() -> None:
    """Element bez obciążalności × warstwa, która obciążalności POTRZEBUJE.

    Przed naprawą stopień obciążenia N-1 wychodził zawsze — z liczby, której
    nikt nie zmierzył. Teraz pozycja niesie ``None`` i powód po polsku.
    """
    wynik = _wynik(
        V126AnalysisType.RELIABILITY_CONTINGENCY,
        _model(branches=[_odcinek("cable")]),
    )
    pozycja = next(p for p in wynik["contingency_ranking"] if p["contingency"] == "cable-1")
    assert pozycja["max_loading_percent"] is None
    assert "obciążalności" in pozycja["brak_danych"]
    assert wynik["elementy_bez_obciazalnosci"] == ["cable-1"]


def test_niezawodnosc_liczy_stopien_obciazenia_gdy_obciazalnosc_jest() -> None:
    """Kontrola dwustronna: z obciążalnością wielkość JEST liczona i nie ma meldunku."""
    wynik = _wynik(
        V126AnalysisType.RELIABILITY_CONTINGENCY,
        _model(branches=[_odcinek("cable", rating={"in_a": 245.0})]),
    )
    pozycja = next(p for p in wynik["contingency_ranking"] if p["contingency"] == "cable-1")
    assert isinstance(pozycja["max_loading_percent"], int | float)
    assert "brak_danych" not in pozycja
    assert "elementy_bez_obciazalnosci" not in wynik


def test_zdolnosc_przylaczeniowa_melduje_brak_obciazalnosci_po_polsku() -> None:
    """Szyna bez elementu z obciążalnością: kryterium prądowe POMINIĘTE i nazwane.

    Przed naprawą liczyło się z ``default=300.0`` — obciążalności wziętej
    z powietrza, nieobecnej w żadnym elemencie sieci.
    """
    wynik = _wynik(
        V126AnalysisType.HOSTING_CAPACITY,
        _model(branches=[_odcinek("cable")]),
    )
    for pozycja in wynik["hosting_capacity"]:
        assert "brak_danych" in pozycja
        assert "kryterium prądowe pominięto" in pozycja["brak_danych"]


def test_zdolnosc_przylaczeniowa_bez_meldunku_gdy_obciazalnosc_jest() -> None:
    """Kontrola dwustronna dla szyny zasilanej elementem z obciążalnością."""
    wynik = _wynik(
        V126AnalysisType.HOSTING_CAPACITY,
        _model(branches=[_odcinek("cable", rating={"in_a": 245.0})]),
    )
    pozycja = next(p for p in wynik["hosting_capacity"] if p["bus_ref"] == _SZYNA_B)
    assert "brak_danych" not in pozycja


# ---------------------------------------------------------------------------
# POŁĄCZENIE IDEALNE — naprawa jednego defektu nie może budzić drugiego
# ---------------------------------------------------------------------------


def test_aparat_zwarty_bez_impedancji_nie_rozspaja_sieci() -> None:
    """Skutek uboczny, który MUSIAŁ zostać domknięty razem z naprawą.

    ``_ybus`` pomijał gałąź o zerowej impedancji (``if abs(z) == 0: continue``),
    czyli po cichu rozspajał sieć w miejscu aparatu. Defekt był uśpiony wyłącznie
    dlatego, że most wstawiał każdemu aparatowi zmyślone 0,001 Ω/km — dopiero
    uczciwe przeniesienie jawnego ``r_ohm = 0,0`` postawiłoby sieć na tej
    ścieżce. Gałąź zwarta o impedancji zerowej to POŁĄCZENIE IDEALNE: obie szyny
    są jednym węzłem elektrycznym i mają identyczny potencjał.
    """
    # Przepisany w karcie AB-H0 (sonda P14 — tautologia). Stara wersja porównywała dwa
    # ZERA: (1) falownik bez karty i bez widma był pomijany (karta W2-C), więc sieć nie
    # miała żadnego źródła harmonicznego; (2) nawet ze źródłem obie szyny tworzyły węzeł
    # nr 0, który solver uziemia (`ybus[0, 0] += 1e6` — sieć sztywna), więc napięcie
    # harmoniczne wychodziło zerowe z konstrukcji. Teraz: szyna zasilająca (węzeł 0)
    # → kabel → A ═ aparat zwarty ═ B, źródło z kartą i jawnym widmem na B — napięcie
    # harmoniczne sklejonego węzła A/B jest NIEZEROWE i identyczne na obu szynach.
    szyna_zasilania = "BUS_ZASILANIE"
    model = EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="most-bez-podstawien").model_dump(),
            "buses": [
                {"ref_id": szyna_zasilania, "name": "Szyna zasilania", "voltage_kv": 15.0},
                {"ref_id": _SZYNA_A, "name": "Szyna A", "voltage_kv": 15.0},
                {"ref_id": _SZYNA_B, "name": "Szyna B", "voltage_kv": 15.0},
            ],
            "branches": [
                _odcinek("cable", from_bus_ref=szyna_zasilania, to_bus_ref=_SZYNA_A),
                _aparat(r_ohm=0.0, x_ohm=0.0),
            ],
            "generators": [
                {
                    "ref_id": "PV-1",
                    "name": "Falownik PV",
                    "bus_ref": _SZYNA_B,
                    "p_mw": 2.0,
                    "gen_type": "pv_inverter",
                    "materialized_params": {"sn_mva": 2.2},
                }
            ],
        }
    )
    solver = V126AcademicSolver()
    wejscie = build_v126_input_from_enm(
        model, parameters={"harmonic_spectra": {"PV-1": {"5": 4.0, "7": 2.0}}}
    )
    assert len(wejscie.harmonic_sources) == 1

    # Węzeł elektryczny A/B jest JEDEN, mimo dwóch szyn modelu.
    indeks = solver._indeks_wezla_elektrycznego(wejscie)
    assert indeks[_SZYNA_A] == indeks[_SZYNA_B] != indeks[szyna_zasilania]
    assert solver._ybus(wejscie).shape == (2, 2)

    # Analiza jakości energii przechodzi, a obie szyny widzą TO SAMO, niezerowe napięcie
    # harmoniczne — bo to jeden punkt sieci, a nie dwa rozspojone.
    wynik = solver.run(V126AnalysisType.POWER_QUALITY_HARMONICS, wejscie)["result"]
    a = next(p for p in wynik["nodes"] if p["bus_ref"] == _SZYNA_A)
    b = next(p for p in wynik["nodes"] if p["bus_ref"] == _SZYNA_B)
    assert a["u_h"] == b["u_h"]
    assert a["thd_u_percent"] == pytest.approx(b["thd_u_percent"])
    assert a["thd_u_percent"] > 0.0


def test_siec_bez_polaczen_idealnych_zachowuje_tozsamosc_wezlow() -> None:
    """Kontrola dwustronna: bez zwarć odwzorowanie jest TOŻSAMOŚCIĄ.

    To jest gwarancja zgodności wstecz — macierz wychodzi bajtowo taka sama jak
    przed kartą dla każdej sieci bez aparatu o zerowej impedancji.
    """
    solver = V126AcademicSolver()
    wejscie = build_v126_input_from_enm(_model(branches=[_odcinek("cable")]))
    indeks = solver._indeks_wezla_elektrycznego(wejscie)
    assert indeks == {bus.ref: idx for idx, bus in enumerate(wejscie.buses)}
    assert solver._ybus(wejscie).shape == (len(wejscie.buses), len(wejscie.buses))
