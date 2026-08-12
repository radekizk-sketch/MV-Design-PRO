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

from network_model.solvers.v126_academic import TraceBuilder, V126AcademicSolver
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType, V126BusInput

import network_model.solvers.v126_academic as v126_academic


def _bus(ref: str, *, fault_level_mva: float = 100.0, load_mw: float = 1.0) -> V126BusInput:
    return V126BusInput(
        ref=ref,
        name=ref,
        nominal_kv=15.0,
        load_mw=load_mw,
        fault_level_mva=fault_level_mva,
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
        krok_1["data"]["seed_model"]
        == krok_2["data"]["seed_model"]
        == krok_3["data"]["seed_model"]
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
# bo ziarno modelu to odcisk CAŁEJ treści modelu (świadomie, żeby zmiana
# JAKIEJKOLWIEK danej wejściowej odświeżała losowanie — patrz test
# `test_seed_bus_zalezy_od_tresci_modelu_nie_tylko_od_referencji` niżej).
# Dołożenie szyny WŁAŚCIWIE zmienia wyniki WSZYSTKICH szyn (bo to inny
# model) — to jest udokumentowana, zamierzona konsekwencja, nie ta klasa
# błędu, którą naprawia ta karta.


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

    model_bez_z = V126AcademicInput(
        buses=[bus_x, bus_y], parameters={"hosting_monte_carlo_n": 64}
    )
    wynik_bez_z, krok_bez_z = _hosting(model_bez_z)

    pozycje_wstawienia = {
        "przed_obiema": [bus_z_dodatkowa, bus_x, bus_y],
        "miedzy": [bus_x, bus_z_dodatkowa, bus_y],
        "po_obu": [bus_x, bus_y, bus_z_dodatkowa],
    }
    for nazwa_pozycji, kolejnosc in pozycje_wstawienia.items():
        model_z_z = V126AcademicInput(
            buses=kolejnosc, parameters={"hosting_monte_carlo_n": 64}
        )
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
    seedy = [
        V126AcademicSolver._hosting_capacity_bus_seed(seed_modelu, ref) for ref in referencje
    ]
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
