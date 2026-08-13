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
from enm.models import EnergyNetworkModel, ENMHeader
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AnalysisType, build_v126_input_from_enm

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
    [(12.5, 12.5), (0.0, 0.0), (None, 0.0)],
    ids=["obecne", "jawnie-zerowe", "nieobecne"],
)
def test_straty_jalowe_transformatora(podane: float | None, oczekiwane: float) -> None:
    """Straty jałowe: wartość podana przechodzi, także jawne zero."""
    nadpisania: dict = {} if podane is None else {"p0_kw": podane}
    wejscie = build_v126_input_from_enm(_model(transformers=[_transformator(**nadpisania)]))
    assert wejscie.transformers[0].p0_kw == pytest.approx(oczekiwane)


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
    TDD i oceny zgodności.
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
            }
        ],
    )
    wejscie = build_v126_input_from_enm(model)
    assert len(wejscie.harmonic_sources) == 1
    oczekiwany = 1000.0 * 2.0 / (math.sqrt(3.0) * napiecie_kv)
    assert wejscie.harmonic_sources[0].base_current_a == pytest.approx(oczekiwany, rel=1e-9)


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
    model = _model(
        branches=[_aparat(r_ohm=0.0, x_ohm=0.0)],
        generators=[
            {
                "ref_id": "PV-1",
                "name": "Falownik PV",
                "bus_ref": _SZYNA_A,
                "p_mw": 2.0,
                "gen_type": "pv_inverter",
            }
        ],
    )
    solver = V126AcademicSolver()
    wejscie = build_v126_input_from_enm(model)

    # Węzeł elektryczny jest JEDEN, mimo dwóch szyn modelu.
    indeks = solver._indeks_wezla_elektrycznego(wejscie)
    assert indeks[_SZYNA_A] == indeks[_SZYNA_B]
    assert solver._ybus(wejscie).shape == (1, 1)

    # Analiza jakości energii przechodzi, a obie szyny widzą TO SAMO napięcie
    # harmoniczne — bo to jeden punkt sieci, a nie dwa rozspojone.
    wynik = solver.run(V126AnalysisType.POWER_QUALITY_HARMONICS, wejscie)["result"]
    a = next(p for p in wynik["nodes"] if p["bus_ref"] == _SZYNA_A)
    b = next(p for p in wynik["nodes"] if p["bus_ref"] == _SZYNA_B)
    assert a["u_h"] == b["u_h"]
    assert a["thd_u_percent"] == pytest.approx(b["thd_u_percent"])


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
