"""Testy izolacji podstrumieni losowania per szyna (karta HOSTING-RNG-IZOLACJA).

Dług źródłowy (zarejestrowany przy MOST-WEJSCIA-V126, `v126_academic.py`
`_hosting_capacity`, ok. linii 1978-2005 sprzed naprawy): PRZED naprawą
wszystkie szyny dzieliły JEDEN `random.Random(seed)`. Pętla kandydatów
kończyła się `break` w różnym miejscu per szyna, więc LICZBA losowań
zużytych dla szyny k przesuwała podstrumień szyny k+1 — wynik szyny zależał
od losowań szyn POPRZEDNICH. Fizycznie bezsensowne sprzężenie: dołożenie
niepowiązanej szyny albo zmiana kolejności szyn w modelu zmieniały wyniki
INNYCH szyn. Determinizm „ten sam wsad → ten sam wynik” był formalnie
zachowany (ziarno globalne pochodziło z odcisku modelu), ale IZOLACJA
PRZEDMIOTOWA między niezależnymi węzłami sieci — złamana.

Naprawa: każda szyna dostaje WŁASNY podstrumień, `seed_bus` wyprowadzony
jawnie z pary (ziarno modelu, `bus.ref`) — `V126AcademicSolver.
_hosting_capacity_bus_seed`. Poniższe testy przypinają cztery własności
z karty (T1-T4) oraz dodatkowy test wiążący `seed_bus` z ziarnem modelu
(a nie wyłącznie z referencją szyny) — wymagany iniekcją I2 karty.
"""

from __future__ import annotations

import network_model.solvers.v126_academic as v126_academic
import pytest
from network_model.solvers.v126_academic import TraceBuilder, V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126EarthingInput,
    V126MotorInput,
    V126TransformerInput,
)


def _bus(ref: str, *, fault_level_mva: float = 100.0, load_mw: float = 1.0) -> V126BusInput:
    """Szyna 15 kV z impedancją zastępczą sieci Z_th = U_n²/S_k (R/X = 0,1) — dana wejścia
    testu (w biegu z modelu Z_th liczy most kanonicznym budowniczym sieci zwarciowej).
    """
    z = 15.0**2 / fault_level_mva
    return V126BusInput(
        ref=ref,
        name=ref,
        nominal_kv=15.0,
        load_mw=load_mw,
        thevenin_r_ohm=0.1 * z,
        thevenin_x_ohm=z,
    )


def _hosting(model: V126AcademicInput) -> tuple[dict, dict]:
    """Wywołanie `_hosting_capacity` WPROST (bez `run()`), zwraca (wynik, krok śladu)."""
    solver = V126AcademicSolver()
    trace = TraceBuilder(V126AnalysisType.HOSTING_CAPACITY)
    wynik = solver._hosting_capacity(model, trace)
    return wynik, trace.steps[-1]


def _pozycja(wynik: dict, bus_ref: str) -> dict:
    return next(p for p in wynik["hosting_capacity"] if p["bus_ref"] == bus_ref)


# ---------------------------------------------------------------------------
# T1 — permutacja kolejności szyn w modelu NIE zmienia wyniku żadnej szyny.
# ---------------------------------------------------------------------------


def test_t1_permutacja_kolejnosci_szyn_nie_zmienia_wynikow() -> None:
    """Ta sama treść modelu, TYLKO inna kolejność `model.buses` → identyczne wyniki.

    Przed naprawą kolejność decydowała o tym, ile losowań „zjadła” szyna
    poprzedzająca — zamiana kolejności przesuwała każdy podstrumień.
    """
    bus_a = _bus("A", fault_level_mva=120.0, load_mw=0.8)
    bus_b = _bus("B", fault_level_mva=60.0, load_mw=1.6)
    bus_c = _bus("C", fault_level_mva=200.0, load_mw=0.3)

    model_kolejnosc_1 = V126AcademicInput(
        buses=[bus_a, bus_b, bus_c], parameters={"hosting_monte_carlo_n": 64}
    )
    model_kolejnosc_2 = V126AcademicInput(
        buses=[bus_c, bus_a, bus_b], parameters={"hosting_monte_carlo_n": 64}
    )
    model_kolejnosc_3 = V126AcademicInput(
        buses=[bus_b, bus_c, bus_a], parameters={"hosting_monte_carlo_n": 64}
    )

    wynik_1, krok_1 = _hosting(model_kolejnosc_1)
    wynik_2, krok_2 = _hosting(model_kolejnosc_2)
    wynik_3, krok_3 = _hosting(model_kolejnosc_3)

    for ref in ("A", "B", "C"):
        pozycja_1 = _pozycja(wynik_1, ref)
        pozycja_2 = _pozycja(wynik_2, ref)
        pozycja_3 = _pozycja(wynik_3, ref)
        assert pozycja_1 == pozycja_2 == pozycja_3, ref
        assert (
            krok_1["data"]["seeds_by_bus"][ref]
            == krok_2["data"]["seeds_by_bus"][ref]
            == krok_3["data"]["seeds_by_bus"][ref]
        ), ref

    # Ziarno modelu samo w sobie też jest niezależne od kolejności wejścia —
    # to WŁAŚNIE ono niesie izolację dalej, do każdej szyny.
    assert (
        krok_1["data"]["seed_model"] == krok_2["data"]["seed_model"] == krok_3["data"]["seed_model"]
    )


# ---------------------------------------------------------------------------
# T2 — izolacja podstrumieni: wynik szyny nie zależy od obecności/liczby
# INNYCH szyn, o ile ziarno modelu jest to samo.
# ---------------------------------------------------------------------------
#
# CO TEN TEST DOWODZI: `_hosting_capacity_bus_seed` jest CZYSTĄ funkcją pary
# (ziarno modelu, referencja szyny) — sygnatura fizycznie nie ma jak przyjąć
# informacji o INNYCH szynach, więc dla USTALONEGO ziarna modelu podstrumień
# (a więc i cała symulacja Monte Carlo) danej szyny jest identyczny
# niezależnie od tego, ile innych szyn i jakich model niesie. Test wymusza
# TO SAMO ziarno modelu w dwóch modelach o RÓŻNYM zestawie szyn przez
# podmianę `_hash` — ale WYŁĄCZNIE dla wejścia typu `dict` (odcisk całego
# modelu); wejście typu `str` (para „seed:bus_ref” w `_hosting_capacity_bus_seed`)
# nadal liczy się PRAWDZIWYM `_hash`, więc różne szyny nadal dostają różne
# podstrumienie (patrz T4) — podmieniamy TYLKO jeden konkretny punkt sprzężenia
# z modelem, nie całą funkcję skrótu.
#
# CZEGO TEN TEST NIE DOWODZI: że dołożenie szyny do PRAWDZIWEGO wywołania
# (bez podmiany `_hash`) zostawia ziarno modelu bez zmian — nie zostawia,
# bo ziarno modelu to odcisk pól CZYTANYCH przez analizę (`POLA_HOSTINGU_*`,
# karta UX-04/POLE-ZU-SKLADOWA-ZEROWA — dawniej odcisk CAŁEGO modelu), a szyna
# jest takim polem — patrz `test_seed_bus_zalezy_od_tresci_modelu_nie_tylko_od_referencji`
# i iloczyn pól czytanych/nieczytanych na końcu pliku. Dołożenie szyny
# WŁAŚCIWIE zmienia wyniki WSZYSTKICH szyn (bo to inna sieć) — udokumentowana,
# zamierzona konsekwencja, nie ta klasa błędu, którą naprawia ta karta.


def test_t2_izolacja_strumieni_przy_ustalonym_ziarnie_modelu(monkeypatch) -> None:
    """Iloczyn cech: POZYCJA wstawienia dodanej szyny × KTÓRA szyna sprawdzana.

    Pod starym błędem (jeden strumień dzielony, sekwencyjne zużycie losowań)
    dołożenie szyny PRZED daną szyną porusza jej podstrumień, a dołożenie PO
    niej — nie. Test świadomy tej asymetrii sprawdza WSZYSTKIE trzy pozycje
    wstawienia (przed obiema, między nimi, po obu), żeby nie dać się złapać
    tylko na jednej z nich — dokładnie w duchu reguły „KLASA, NIE INSTANCJA”.
    """
    prawdziwy_hash = v126_academic._hash

    def hash_z_uciszonym_wplywem_modelu(payload: object) -> str:
        if isinstance(payload, dict):
            # Ziarno modelu UDAJEMY jako stałe — jedyny sposób, by zmienić
            # ZESTAW szyn bez poruszania ziarna modelu (kontrolowany seed
            # z rozstrzygnięcia karty §0.3).
            return "a" * 64
        return prawdziwy_hash(payload)

    monkeypatch.setattr(v126_academic, "_hash", hash_z_uciszonym_wplywem_modelu)

    bus_x = _bus("X", fault_level_mva=90.0, load_mw=1.1)
    bus_y = _bus("Y", fault_level_mva=45.0, load_mw=2.2)
    bus_z_dodatkowa = _bus("Z-dolozona", fault_level_mva=300.0, load_mw=0.1)

    model_bez_z = V126AcademicInput(buses=[bus_x, bus_y], parameters={"hosting_monte_carlo_n": 64})
    wynik_bez_z, krok_bez_z = _hosting(model_bez_z)

    pozycje_wstawienia = {
        "przed_obiema": [bus_z_dodatkowa, bus_x, bus_y],
        "miedzy": [bus_x, bus_z_dodatkowa, bus_y],
        "po_obu": [bus_x, bus_y, bus_z_dodatkowa],
    }
    for nazwa_pozycji, kolejnosc in pozycje_wstawienia.items():
        model_z_z = V126AcademicInput(buses=kolejnosc, parameters={"hosting_monte_carlo_n": 64})
        wynik_z_z, krok_z_z = _hosting(model_z_z)

        # Ziarno modelu jest (podmienione) identyczne we wszystkich wywołaniach
        # — to PRZESŁANKA testu, nie jego teza; sprawdzamy ją, żeby test nie
        # milczał, gdyby podmiana `_hash` przestała działać.
        assert krok_bez_z["data"]["seed_model"] == krok_z_z["data"]["seed_model"], nazwa_pozycji

        for ref in ("X", "Y"):
            assert (
                krok_bez_z["data"]["seeds_by_bus"][ref] == krok_z_z["data"]["seeds_by_bus"][ref]
            ), (nazwa_pozycji, ref)
            assert _pozycja(wynik_bez_z, ref) == _pozycja(wynik_z_z, ref), (nazwa_pozycji, ref)

        # Kontrola: dołożona szyna faktycznie jest w drugim wyniku (test nie
        # udaje, że oba wywołania są tym samym modelem).
        assert any(p["bus_ref"] == "Z-dolozona" for p in wynik_z_z["hosting_capacity"])
    assert not any(p["bus_ref"] == "Z-dolozona" for p in wynik_bez_z["hosting_capacity"])


# ---------------------------------------------------------------------------
# T3 — determinizm: ta sama szyna + ten sam model → identyczny wynik.
# ---------------------------------------------------------------------------


def test_t3_determinizm_ten_sam_model_i_szyna_daje_identyczny_wynik() -> None:
    model = V126AcademicInput(
        buses=[_bus("A", fault_level_mva=120.0), _bus("B", fault_level_mva=55.0)],
        parameters={"hosting_monte_carlo_n": 64},
    )
    wynik_1, krok_1 = _hosting(model)
    wynik_2, krok_2 = _hosting(model)

    assert wynik_1 == wynik_2
    assert krok_1["data"]["seeds_by_bus"] == krok_2["data"]["seeds_by_bus"]
    assert krok_1["data"]["seed_model"] == krok_2["data"]["seed_model"]


# ---------------------------------------------------------------------------
# T4 — kolizja: dwie RÓŻNE szyny nie dostają identycznych podstrumieni.
# ---------------------------------------------------------------------------


def test_t4_rozne_szyny_maja_rozne_podstrumienie() -> None:
    model = V126AcademicInput(
        buses=[
            _bus("A", fault_level_mva=120.0),
            _bus("B", fault_level_mva=120.0),  # celowo IDENTYCZNE dane co A
            _bus("C", fault_level_mva=120.0),
        ],
        parameters={"hosting_monte_carlo_n": 64},
    )
    _, krok = _hosting(model)
    seeds = krok["data"]["seeds_by_bus"]
    wartosci = list(seeds.values())
    assert len(wartosci) == len(set(wartosci)), seeds


def test_t4_bezposrednia_kolizja_pary_referencji_na_male_probce() -> None:
    """Bezpośredni test funkcji czystej: różne `bus_ref` → różne `seed_bus`."""
    seed_modelu = 123456789
    referencje = [f"bus_{i:03d}" for i in range(200)]
    seedy = [V126AcademicSolver._hosting_capacity_bus_seed(seed_modelu, ref) for ref in referencje]
    assert len(seedy) == len(set(seedy))


# ---------------------------------------------------------------------------
# Test wiążący: `seed_bus` zależy od TREŚCI modelu, nie WYŁĄCZNIE od
# referencji szyny (przypina iniekcję I2 karty — cofnięcie do
# `seed_bus = hash(bus_ref)` samo w sobie NIE psuje T3, ale psuje TEN test).
# ---------------------------------------------------------------------------


def test_seed_bus_zalezy_od_tresci_modelu_nie_tylko_od_referencji() -> None:
    """Ta sama szyna X w dwóch modelach o RÓŻNEJ treści → RÓŻNY `seed_bus`.

    T3 (determinizm) sam w sobie NIE odróżnia „seed_bus zależy od modelu”
    od „seed_bus zależy WYŁĄCZNIE od bus_ref” — obie wersje są deterministyczne.
    Ten test przypina drugą połowę rozstrzygnięcia karty §0.3: `seed_bus`
    MUSI nieść ziarno modelu, inaczej dwa RÓŻNE modele z tą samą szyną X
    (tu: różniące się WYŁĄCZNIE danymi INNEJ szyny, Y) losowałyby dla X
    identyczną sekwencję — co jest dokładnie tym, co zrobiłaby iniekcja I2
    (`seed_bus = hash(bus_ref)` bez seedu modelu).
    """
    bus_x = _bus("X", fault_level_mva=90.0, load_mw=1.1)
    bus_y_wariant_1 = _bus("Y", fault_level_mva=45.0, load_mw=2.2)
    bus_y_wariant_2 = _bus("Y", fault_level_mva=999.0, load_mw=0.05)

    model_1 = V126AcademicInput(
        buses=[bus_x, bus_y_wariant_1], parameters={"hosting_monte_carlo_n": 64}
    )
    model_2 = V126AcademicInput(
        buses=[bus_x, bus_y_wariant_2], parameters={"hosting_monte_carlo_n": 64}
    )

    _, krok_1 = _hosting(model_1)
    _, krok_2 = _hosting(model_2)

    assert krok_1["data"]["seed_model"] != krok_2["data"]["seed_model"]
    assert krok_1["data"]["seeds_by_bus"]["X"] != krok_2["data"]["seeds_by_bus"]["X"]


# ---------------------------------------------------------------------------
# Ziarno z pól CZYTANYCH (karta UX-04/POLE-ZU-SKLADOWA-ZEROWA, decyzja B-01): ILOCZYN CECH
# pole {czytane, nieczytane} × element {szyna, gałąź, transformator, parametr biegu, sekcja
# innej analizy (silnik, uziom)} — pole nieczytane nie zmienia ani ziarna, ani wyniku; pole
# czytane zmienia ziarno. Parytet projekcji: obliczenie na projekcji = obliczenie na pełnym
# wejściu (projekcja nie gubi żadnego pola, które analiza czyta — inaczej dostałaby wartość
# domyślną kontraktu po cichu).
# ---------------------------------------------------------------------------


def _bogaty_model(**zmiany: object) -> V126AcademicInput:
    """Sieć GPZ → kabel → stacja z transformatorem SN/nN; każde pole niedomyślne."""
    szyny = [
        V126BusInput(
            ref="GPZ",
            name="GPZ",
            nominal_kv=15.0,
            voltage_pu=1.02,
            load_mw=0.4,
            load_mvar=0.1,
            generation_mw=0.2,
            generation_mvar=0.05,
            customer_count=40,
            fault_level_mva=250.0,
            source_r_ohm=0.09,
            source_x_ohm=0.89,
            thevenin_r_ohm=0.09,
            thevenin_x_ohm=0.89,
        ),
        V126BusInput(
            ref="ST1",
            name="Stacja 1",
            nominal_kv=15.0,
            voltage_pu=1.0,
            load_mw=1.2,
            load_mvar=0.3,
            customer_count=120,
            thevenin_r_ohm=0.708,
            thevenin_x_ohm=1.244,
        ),
        V126BusInput(
            ref="NN1",
            name="nN stacji 1",
            nominal_kv=0.4,
            load_mw=0.3,
            customer_count=60,
            thevenin_r_ohm=0.0049,
            thevenin_x_ohm=0.0157,
        ),
    ]
    galaz = V126BranchInput(
        ref="K1",
        from_bus_ref="GPZ",
        to_bus_ref="ST1",
        kind="cable",
        length_km=3.0,
        r_ohm_per_km=0.206,
        x_ohm_per_km=0.118,
        b_siemens_per_km=8.0e-5,
        b0_siemens_per_km=8.0e-5,
        ampacity_a=245.0,
        failure_rate_per_year=0.045,
        mttr_h=12.0,
    )
    trafo = V126TransformerInput(
        ref="TR1",
        hv_bus_ref="ST1",
        lv_bus_ref="NN1",
        sn_mva=0.63,
        uhv_kv=15.0,
        ulv_kv=0.42,
        uk_percent=6.0,
        pk_kw=6.5,
        p0_kw=0.9,
        vector_group="Dyn11",
    )
    dane: dict = {
        "base_frequency_hz": 50.0,
        "buses": szyny,
        "branches": [galaz],
        "transformers": [trafo],
        "motors": [
            V126MotorInput(
                ref="M1",
                bus_ref="ST1",
                rated_kw=315.0,
                rated_voltage_kv=15.0,
                locked_rotor_multiplier=6.0,
                start_power_factor=0.22,
                start_time_s=8.0,
                allowable_locked_rotor_time_s=20.0,
                max_torque_pu=2.0,
                critical_slip=0.2,
                load_start_torque_pu=0.6,
            )
        ],
        "earthing": V126EarthingInput(
            bus_ref="B1",
            rho1_ohm_m=100.0,
            length_m=60.0,
            width_m=40.0,
            mesh_spacing_m=6.0,
            buried_depth_m=0.6,
            rods_total_length_m=40.0,
            split_factor=0.65,
            fault_current_ka=10.0,
            fault_clearing_time_s=0.5,
            surface_layer_rho_ohm_m=2500.0,
            surface_layer_derating=0.74,
        ),
        "parameters": {"hosting_monte_carlo_n": 48, "breaker_rated_voltage_kv": 17.5},
    }
    dane.update(zmiany)
    return V126AcademicInput(**dane)


def _zmien_szyne(model: V126AcademicInput, ref: str, **pola: object) -> V126AcademicInput:
    szyny = [b.model_copy(update=pola) if b.ref == ref else b for b in model.buses]
    return model.model_copy(update={"buses": szyny})


def _zmien_galaz(model: V126AcademicInput, **pola: object) -> V126AcademicInput:
    return model.model_copy(update={"branches": [model.branches[0].model_copy(update=pola)]})


def _zmien_trafo(model: V126AcademicInput, **pola: object) -> V126AcademicInput:
    return model.model_copy(
        update={"transformers": [model.transformers[0].model_copy(update=pola)]}
    )


_ZMIANY_NIECZYTANE = {
    "szyna.name": lambda m: _zmien_szyne(m, "ST1", name="Stacja przemianowana"),
    # Impedancja zasilania i moc zwarciowa szyny wchodzą do Z_th w moście (kanoniczny
    # budowniczy sieci zwarciowej) — analiza czyta Z_th, nie składniki.
    "szyna.fault_level_mva": lambda m: _zmien_szyne(m, "GPZ", fault_level_mva=500.0),
    "szyna.source_r_ohm": lambda m: _zmien_szyne(m, "GPZ", source_r_ohm=0.2),
    "szyna.source_x_ohm": lambda m: _zmien_szyne(m, "GPZ", source_x_ohm=1.5),
    "galaz.from_bus_ref": lambda m: _zmien_galaz(m, from_bus_ref="NN1"),
    "galaz.length_km": lambda m: _zmien_galaz(m, length_km=5.0),
    "galaz.r": lambda m: _zmien_galaz(m, r_ohm_per_km=0.3),
    "galaz.x": lambda m: _zmien_galaz(m, x_ohm_per_km=0.2),
    "galaz.b": lambda m: _zmien_galaz(m, b_siemens_per_km=1.0e-5),
    "trafo.ref": lambda m: _zmien_trafo(m, ref="TR9"),
    "trafo.hv_bus_ref": lambda m: _zmien_trafo(m, hv_bus_ref="GPZ"),
    "trafo.lv_bus_ref": lambda m: _zmien_trafo(m, lv_bus_ref="ST1"),
    "trafo.sn_mva": lambda m: _zmien_trafo(m, sn_mva=1.0),
    "trafo.uhv_kv": lambda m: _zmien_trafo(m, uhv_kv=15.75),
    "trafo.uk_percent": lambda m: _zmien_trafo(m, uk_percent=4.5),
    "trafo.pk_kw": lambda m: _zmien_trafo(m, pk_kw=8.0),
    "szyna.load_mvar": lambda m: _zmien_szyne(m, "ST1", load_mvar=0.9),
    "szyna.generation_mw": lambda m: _zmien_szyne(m, "GPZ", generation_mw=1.5),
    "szyna.generation_mvar": lambda m: _zmien_szyne(m, "GPZ", generation_mvar=0.7),
    "szyna.customer_count": lambda m: _zmien_szyne(m, "ST1", customer_count=999),
    "galaz.kind": lambda m: _zmien_galaz(m, kind="line_overhead"),
    "galaz.b0": lambda m: _zmien_galaz(m, b0_siemens_per_km=1.0e-6),
    "galaz.failure_rate": lambda m: _zmien_galaz(m, failure_rate_per_year=0.5),
    "galaz.mttr": lambda m: _zmien_galaz(m, mttr_h=48.0),
    "trafo.ulv_kv": lambda m: _zmien_trafo(m, ulv_kv=0.4),
    "trafo.p0_kw": lambda m: _zmien_trafo(m, p0_kw=2.0),
    "trafo.vector_group": lambda m: _zmien_trafo(m, vector_group="Yzn5"),
    "silnik": lambda m: m.model_copy(
        update={"motors": [m.motors[0].model_copy(update={"rated_kw": 900.0})]}
    ),
    "uziom": lambda m: m.model_copy(
        update={"earthing": m.earthing.model_copy(update={"rho1_ohm_m": 400.0})}
    ),
    "parametr_innej_analizy": lambda m: m.model_copy(
        update={"parameters": {**m.parameters, "breaker_rated_voltage_kv": 24.0}}
    ),
}

_ZMIANY_CZYTANE = {
    "szyna.nominal_kv": lambda m: _zmien_szyne(m, "ST1", nominal_kv=20.0),
    "szyna.voltage_pu": lambda m: _zmien_szyne(m, "ST1", voltage_pu=0.98),
    "szyna.load_mw": lambda m: _zmien_szyne(m, "ST1", load_mw=2.0),
    "szyna.thevenin_r_ohm": lambda m: _zmien_szyne(m, "ST1", thevenin_r_ohm=0.9),
    "szyna.thevenin_x_ohm": lambda m: _zmien_szyne(m, "NN1", thevenin_x_ohm=0.02),
    "galaz.to_bus_ref": lambda m: _zmien_galaz(m, to_bus_ref="NN1"),
    "galaz.is_open": lambda m: _zmien_galaz(m, is_open=True),
    "galaz.ampacity": lambda m: _zmien_galaz(m, ampacity_a=180.0),
    "monte_carlo_n": lambda m: m.model_copy(
        update={"parameters": {**m.parameters, "hosting_monte_carlo_n": 49}}
    ),
}


def test_zbiory_zmian_pokrywaja_kazde_pole_kontraktu() -> None:
    """Inwentarz klasy: każde pole szyny, gałęzi i transformatora jest w dokładnie jednym
    zbiorze (czytane = `POLA_HOSTINGU_*` bez referencji) — nowe pole kontraktu bez decyzji
    „czytane czy nie” czerwieni ten test."""
    for klasa, pola, prefiks in (
        (V126BusInput, v126_academic.POLA_HOSTINGU_SZYNY, "szyna."),
        (V126BranchInput, v126_academic.POLA_HOSTINGU_GALEZI, "galaz."),
        # Transformatory nie są czytane wprost — wchodzą do Z_th szyn w moście.
        (V126TransformerInput, (), "trafo."),
    ):
        nieczytane = set(klasa.model_fields) - set(pola)
        czytane = set(pola) - {"ref"}
        skroty = {
            "r_ohm_per_km": "r",
            "x_ohm_per_km": "x",
            "b_siemens_per_km": "b",
            "b0_siemens_per_km": "b0",
            "failure_rate_per_year": "failure_rate",
            "mttr_h": "mttr",
            "ampacity_a": "ampacity",
        }
        pokryte_n = {k.removeprefix(prefiks) for k in _ZMIANY_NIECZYTANE if k.startswith(prefiks)}
        pokryte_c = {k.removeprefix(prefiks) for k in _ZMIANY_CZYTANE if k.startswith(prefiks)}
        assert {skroty.get(p, p) for p in nieczytane} == pokryte_n, klasa.__name__
        assert {skroty.get(p, p) for p in czytane} == pokryte_c, klasa.__name__


@pytest.mark.parametrize("zmiana", sorted(_ZMIANY_NIECZYTANE))
def test_pole_nieczytane_nie_zmienia_ziarna_ani_wyniku(zmiana: str) -> None:
    bazowy = _bogaty_model()
    zmieniony = _ZMIANY_NIECZYTANE[zmiana](bazowy)
    assert zmieniony != bazowy
    wynik_b, krok_b = _hosting(bazowy)
    wynik_z, krok_z = _hosting(zmieniony)
    assert krok_z["data"]["seed_model"] == krok_b["data"]["seed_model"], zmiana
    assert wynik_z == wynik_b, zmiana


@pytest.mark.parametrize("zmiana", sorted(_ZMIANY_CZYTANE))
def test_pole_czytane_zmienia_ziarno(zmiana: str) -> None:
    bazowy = _bogaty_model()
    _, krok_b = _hosting(bazowy)
    _, krok_z = _hosting(_ZMIANY_CZYTANE[zmiana](bazowy))
    assert krok_z["data"]["seed_model"] != krok_b["data"]["seed_model"], zmiana


@pytest.mark.parametrize("czestotliwosc_hz", [50.0, 60.0])
def test_obliczenie_na_projekcji_rowne_obliczeniu_na_pelnym_wejsciu(
    monkeypatch: pytest.MonkeyPatch, czestotliwosc_hz: float
) -> None:
    """Parytet projekcji: z projekcją wyłączoną (tożsamość) analiza liczy na pełnym wejściu
    i daje ten sam wynik — projekcja nie podstawia wartości domyślnej kontraktu w miejsce
    pola, które analiza czyta (np. częstotliwości sieci)."""
    model = _bogaty_model(base_frequency_hz=czestotliwosc_hz)
    z_projekcja, krok_p = _hosting(model)
    monkeypatch.setattr(
        V126AcademicSolver, "_projekcja_hostingu", staticmethod(lambda wejscie: wejscie)
    )
    bez_projekcji, krok_b = _hosting(model)
    assert bez_projekcji == z_projekcja
    assert krok_b["data"]["seed_model"] == krok_p["data"]["seed_model"]
