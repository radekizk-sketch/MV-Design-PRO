"""Testy serwisu enumeracji kontyngencji N-1 (karta N-1-BACKEND, decyzja D8).

Zakres pokrywa ILOCZYN CECH, w którym defekt mógłby się schować, a nie pojedynczy
przykład z karty:

- rodzaj elementu {linia napowietrzna, kabel, transformator} × skutek
  {przeciążenie objazdu, odcięcie odbiorów, brak zmiany},
- stan biegu {zbieżny, niezbieżny, wykluczony} × rozstrzygalność kryteriów
  {policzone, jawnie pominięte},
- kompletność danych {gałąź z obciążalnością, gałąź bez obciążalności} ×
  raportowanie {naruszenie, kryterium pominięte},
- niezmienność {model w magazynie, migawka biegu bazowego} × liczba biegów
  wariantu,
- determinizm {dwa wywołania, permutacja kolejności elementów wejścia}.

ZERO nowej fizyki w teście: rozpływ liczy istniejący solver przez istniejącą
ścieżkę wykonania, oceny — istniejący builder walidacji energetycznej D2.
"""

from __future__ import annotations

import copy
import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application.analyses.kontyngencje_n1 import (
    POWOD_WYKLUCZENIA_PL,
    _klucz_rankingu,
    build_kontyngencje_n1_view,
    build_kontyngencje_n1_zakres_view,
)
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.hash import compute_enm_hash
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    Source,
    SwitchBranch,
    Transformer,
)
from enm.store import get_enm, reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(
    enm: EnergyNetworkModel,
    *,
    status: str = "FINISHED",
    analysis_type: str = "PF",
    run_id: UUID | None = None,
):
    """Przebieg rozpływu z realną migawką, bez persystencji.

    Serwis N-1 sam uruchamia rozpływ dla każdego wariantu, więc bazowy
    ``raw_result`` nie jest odczytywany (ten sam wzorzec, co w testach zdolności
    przyłączeniowej).
    """
    return CanonicalRun(
        id=run_id or uuid4(),
        case_id="case-n1",
        project_id="proj-n1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
    )


def _zrodlo(bus_ref: str = "b_src") -> Source:
    return Source(
        ref_id="src",
        name="System 15 kV",
        bus_ref=bus_ref,
        model="short_circuit_power",
        sk3_mva=500.0,
        r_ohm=0.1,
        x_ohm=1.0,
    )


def _pierscien() -> EnergyNetworkModel:
    """Pierścień: dwie drogi zasilania, jedna o małej obciążalności.

    Wyłączenie mocnej gałęzi (``ln_src_a``) przerzuca cały pobór na gałąź
    ``ln_src_b`` o obciążalności 60 A — post-awaryjnie przeciążoną. Wyłączenie
    zamknięcia pierścienia (``ln_a_b``) daje układ promieniowy bez przeciążenia:
    ta sama sieć, dwa różne skutki.
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Pierscien N-1"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[
            Load(ref_id="ld_a", name="Odbior A", bus_ref="b_a", p_mw=1.0, q_mvar=0.3),
            Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3),
        ],
        branches=[
            OverheadLine(
                ref_id="ln_src_a",
                name="Linia GPZ-A",
                from_bus_ref="b_src",
                to_bus_ref="b_a",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
            ),
            OverheadLine(
                ref_id="ln_src_b",
                name="Linia GPZ-B",
                from_bus_ref="b_src",
                to_bus_ref="b_b",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=60.0),
            ),
            Cable(
                ref_id="ka_a_b",
                name="Kabel A-B (zamkniecie pierscienia)",
                from_bus_ref="b_a",
                to_bus_ref="b_b",
                length_km=1.0,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.1,
                rating=BranchRating(in_a=280.0),
            ),
        ],
    )


def _promien_z_transformatorem() -> EnergyNetworkModel:
    """Promień z odgałęzieniem i stacją SN/nN.

    - wyłączenie odgałęzienia ``ln_odg`` odcina odbiór ``ld_odg``,
    - wyłączenie transformatora ``tr_sn_nn`` (jedyne zasilanie fragmentu nN)
      tworzy wyspę bez zasilania z odbiorem ``ld_nn``,
    - ``ln_wyl`` jest gałęzią JUŻ WYŁĄCZONĄ w modelu bazowym (status open).
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Promien N-1"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_mid", name="Stacja srodkowa", voltage_kv=15.0),
            Bus(ref_id="b_odg", name="Stacja odgalezienia", voltage_kv=15.0),
            Bus(ref_id="b_nn", name="Szyna nN", voltage_kv=0.4),
            Bus(ref_id="b_rez", name="Szyna rezerwowa", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[
            Load(ref_id="ld_mid", name="Odbior srodkowy", bus_ref="b_mid", p_mw=0.4, q_mvar=0.1),
            Load(
                ref_id="ld_odg", name="Odbior odgalezienia", bus_ref="b_odg", p_mw=0.3, q_mvar=0.1
            ),
            Load(ref_id="ld_nn", name="Odbior nN", bus_ref="b_nn", p_mw=0.2, q_mvar=0.05),
        ],
        transformers=[
            Transformer(
                ref_id="tr_sn_nn",
                name="TR 15/0,4",
                hv_bus_ref="b_mid",
                lv_bus_ref="b_nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.5,
                pk_kw=6.5,
            ),
        ],
        branches=[
            Cable(
                ref_id="ka_magistrala",
                name="Kabel magistralny",
                from_bus_ref="b_src",
                to_bus_ref="b_mid",
                length_km=1.5,
                r_ohm_per_km=0.16,
                x_ohm_per_km=0.1,
                rating=BranchRating(in_a=280.0),
            ),
            OverheadLine(
                ref_id="ln_odg",
                name="Linia odgalezienia",
                from_bus_ref="b_mid",
                to_bus_ref="b_odg",
                length_km=1.0,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.4,
                rating=BranchRating(in_a=120.0),
            ),
            OverheadLine(
                ref_id="ln_wyl",
                name="Linia rezerwowa (wylaczona)",
                from_bus_ref="b_mid",
                to_bus_ref="b_rez",
                length_km=1.0,
                r_ohm_per_km=0.3,
                x_ohm_per_km=0.4,
                status="open",
                rating=BranchRating(in_a=120.0),
            ),
            SwitchBranch(
                ref_id="sw_pole",
                name="Wylacznik pola rezerwowego",
                type="breaker",
                from_bus_ref="b_mid",
                to_bus_ref="b_rez",
            ),
        ],
    )


def _bez_obciazalnosci() -> EnergyNetworkModel:
    """Gałąź bez obciążalności długotrwałej — kryterium prądowe niesprawdzalne."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Bez obciazalnosci"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3)],
        branches=[
            OverheadLine(
                ref_id="ln_bez_ratingu",
                name="Linia bez obciazalnosci",
                from_bus_ref="b_src",
                to_bus_ref="b_b",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
            ),
            OverheadLine(
                ref_id="ln_z_ratingiem",
                name="Linia z obciazalnoscia",
                from_bus_ref="b_src",
                to_bus_ref="b_a",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
            ),
        ],
    )


def _niezbiezny() -> EnergyNetworkModel:
    """Sieć, w której JEDNA kontyngencja odbiera zbieżność biegu.

    Odbiór 9 MW zasilany dwiema drogami: krótkim kablem o małej impedancji i
    bardzo długą, wysokoimpedancyjną linią. Stan bazowy jest zbieżny; wyłączenie
    kabla zostawia zasilanie wyłącznie drogą, na której rozwiązanie rozpływu nie
    istnieje w zakresie napięć roboczych (kolano charakterystyki PU).
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="Niezbieznosc N-1"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_load", name="Stacja odbiorcza", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld", name="Odbior duzy", bus_ref="b_load", p_mw=9.0, q_mvar=3.0)],
        branches=[
            Cable(
                ref_id="ka_mocny",
                name="Kabel mocny",
                from_bus_ref="b_src",
                to_bus_ref="b_load",
                length_km=0.5,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.08,
                rating=BranchRating(in_a=400.0),
            ),
            OverheadLine(
                ref_id="ln_slaby",
                name="Linia slaba",
                from_bus_ref="b_src",
                to_bus_ref="b_load",
                length_km=60.0,
                r_ohm_per_km=1.2,
                x_ohm_per_km=1.0,
                rating=BranchRating(in_a=400.0),
            ),
        ],
    )


def _po_ref(widok: dict, ref: str) -> dict:
    pozycje = [k for k in widok["kontyngencje"] if k["element_ref"] == ref]
    assert pozycje, f"Brak kontyngencji {ref} w wyniku"
    return pozycje[0]


# ---------------------------------------------------------------------------
# Enumeracja — klasa elementów, nie przykład
# ---------------------------------------------------------------------------


def test_enumeruje_wszystkie_kwalifikowane_elementy_po_sortowanym_ref() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    refy = [k["element_ref"] for k in widok["kontyngencje"]]
    # Linia, kabel i transformator — wszystkie trzy rodzaje; aparat łączeniowy
    # (``sw_pole``) świadomie poza enumeracją.
    assert refy == sorted(refy)
    assert refy == ["ka_magistrala", "ln_odg", "ln_wyl", "tr_sn_nn"]
    rodzaje = {k["element_ref"]: k["element_kind"] for k in widok["kontyngencje"]}
    assert rodzaje == {
        "ka_magistrala": "cable",
        "ln_odg": "line_overhead",
        "ln_wyl": "line_overhead",
        "tr_sn_nn": "transformer",
    }
    assert widok["podsumowanie"]["kontyngencji"] == 4


def test_kazdy_rodzaj_elementu_znika_z_grafu_wariantu() -> None:
    """Warunek WYJŚCIA wariantu jest jeden dla wszystkich rodzajów elementu.

    Gałąź i transformator schodzą z ruchu tym samym mechanizmem, więc test
    sprawdza oba: krawędź elementu jest w grafie bazowym i nie ma jej w grafie
    wariantu. Bez tej pary rozjazd mechanizmów byłby niewidoczny.
    """
    from application.analyses.kontyngencje_n1 import (  # noqa: PLC0415 — szczegół wewnętrzny
        _inwentarz_elementow,
        _wariant_bez_elementu,
    )

    enm = _promien_z_transformatorem()
    snapshot = enm.model_dump(mode="json")
    graf_bazowy = map_enm_to_network_graph(enm)
    for element in _inwentarz_elementow(snapshot):
        wariant = _wariant_bez_elementu(snapshot, element)
        graf_wariantu = map_enm_to_network_graph(EnergyNetworkModel.model_validate(wariant))
        id_elementu = ref_to_graph_id(element.ref)
        assert id_elementu in graf_bazowy.branches, element.ref
        assert id_elementu not in graf_wariantu.branches, element.ref


# ---------------------------------------------------------------------------
# Skutki: przeciążenie, odcięcie odbiorów, wyspa
# ---------------------------------------------------------------------------


def test_wylaczenie_galezi_pierscienia_daje_przeciazenie_objazdu() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_pierscien()))
    assert widok["przypadek_bazowy"]["status"] == "zbiegl"
    assert widok["przypadek_bazowy"]["przeciazenia"] == []

    przeciazona = _po_ref(widok, "ln_src_a")
    assert przeciazona["status"] == "zbiegl"
    refy_przeciazone = {p["element_name"] for p in przeciazona["przeciazenia"]}
    assert "Linia GPZ-B" in refy_przeciazone
    pozycja = next(p for p in przeciazona["przeciazenia"] if p["element_name"] == "Linia GPZ-B")
    assert pozycja["check_type"] == "BRANCH_LOADING"
    # Naruszenie MUSI dac sie zwiazac z elementem modelu — inaczej ekran pokaze
    # przeciazenie, ktorego projektant nie umie znalezc w sieci.
    assert pozycja["element_ref"] == "ln_src_b"
    assert set(pozycja) == {
        "check_type",
        "element_ref",
        "element_id",
        "element_name",
        "wartosc",
        "granica_pct",
        "jednostka",
        "powod_pl",
        "slad_kryterium",
    }
    assert pozycja["wartosc"] > pozycja["granica_pct"]
    # WHITE BOX kryterium pochodzi z buildera D2 (wzór → dane → wynik → próg).
    assert [krok["tekst"] for krok in pozycja["slad_kryterium"]][0].startswith("Wzor:")

    # Ta sama sieć, inna kontyngencja: rozcięcie pierścienia bez przeciążenia.
    bez_skutku = _po_ref(widok, "ka_a_b")
    assert bez_skutku["status"] == "zbiegl"
    assert bez_skutku["przeciazenia"] == []
    assert bez_skutku["odbiory_bez_zasilania"] == []


def test_wylaczenie_odgalezienia_odcina_odbior() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    odgalezienie = _po_ref(widok, "ln_odg")
    assert odgalezienie["status"] == "zbiegl"
    assert [o["load_ref"] for o in odgalezienie["odbiory_bez_zasilania"]] == ["ld_odg"]
    assert odgalezienie["szyny_bez_zasilania"] == ["b_odg"]
    assert odgalezienie["dotkliwosc"]["odbiory_bez_zasilania"] == 1
    assert odgalezienie["dotkliwosc"]["moc_odciazona_mw"] == pytest.approx(0.3)


def test_wylaczenie_jedynego_zasilania_fragmentu_daje_wyspe() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    trafo = _po_ref(widok, "tr_sn_nn")
    assert trafo["status"] == "zbiegl"
    assert [o["load_ref"] for o in trafo["odbiory_bez_zasilania"]] == ["ld_nn"]
    assert trafo["szyny_bez_zasilania"] == ["b_nn"]
    slad = trafo["slad"]["wyspa_zasilana"]
    assert slad["wezel_bilansujacy_ref"] == "b_src"
    assert slad["szyny_bez_zasilania"] == 1
    # Szyna poza wyspą nie ma policzonego napięcia — kryterium napięciowe jest
    # POMINIĘTE JAWNIE, nigdy „w normie".
    pominiete = {(p["check_type"], p["element_name"]) for p in trafo["kryteria_pominiete"]}
    assert ("VOLTAGE_DEVIATION", "Szyna nN") in pominiete
    assert all(
        n["element_name"] != "Szyna nN" for n in trafo["naruszenia_napiecia"]
    ), "Szyna bez zasilania nie moze byc raportowana jako naruszenie napiecia"


def test_element_juz_wylaczony_jest_wykluczony_z_powodem() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    wylaczony = _po_ref(widok, "ln_wyl")
    assert wylaczony["status"] == "wykluczony"
    assert "już wyłączony" in wylaczony["powod_pl"]
    assert wylaczony["dotkliwosc"]["przeciazenia"] is None
    assert [n["element_ref"] for n in widok["nierozstrzygniete"]] == ["ln_wyl"]
    assert all(r["element_ref"] != "ln_wyl" for r in widok["ranking"])


# ---------------------------------------------------------------------------
# Uczciwa degradacja: niezbieżność i brak danych
# ---------------------------------------------------------------------------


def test_kontyngencja_niezbiezna_ma_status_a_nie_pominiecie() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_niezbiezny()))
    assert widok["przypadek_bazowy"]["status"] == "zbiegl"
    assert widok["podsumowanie"]["kontyngencji"] == 2

    niezbiezna = _po_ref(widok, "ka_mocny")
    assert niezbiezna["status"] == "niezbiegl"
    assert niezbiezna["powod_pl"]
    # Liczniki, których NIE policzono, są None — nie zerem.
    assert niezbiezna["dotkliwosc"]["przeciazenia"] is None
    assert niezbiezna["dotkliwosc"]["naruszenia_napiecia"] is None
    # Kryterium topologiczne pozostaje rozstrzygnięte mimo braku zbieżności.
    assert niezbiezna["dotkliwosc"]["odbiory_bez_zasilania"] == 0
    assert [n["element_ref"] for n in widok["nierozstrzygniete"]] == ["ka_mocny"]
    assert all(r["element_ref"] != "ka_mocny" for r in widok["ranking"])


def test_brak_obciazalnosci_pomija_kryterium_pradowe_jawnie() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_bez_obciazalnosci()))
    kontyngencja = _po_ref(widok, "ln_z_ratingiem")
    assert kontyngencja["status"] == "zbiegl"

    pominiete = [
        p for p in kontyngencja["kryteria_pominiete"] if p["check_type"] == "BRANCH_LOADING"
    ]
    assert [p["element_name"] for p in pominiete] == ["Linia bez obciazalnosci"]
    assert pominiete[0]["powod_pl"] == "Brak pradu znamionowego galezi."
    assert pominiete[0]["element_ref"] == "ln_bez_ratingu"
    # Gałąź bez obciążalności NIE MOŻE trafić do przeciążeń: przed naprawą
    # mostu ENM→graf dostawała podstawiony prąd znamionowy 1 A i meldowała
    # przeciążenie rzędu tysięcy procent.
    assert all(p["element_name"] != "Linia bez obciazalnosci" for p in kontyngencja["przeciazenia"])


# ---------------------------------------------------------------------------
# Niezmienność modelu (Case Immutability)
# ---------------------------------------------------------------------------


def test_enumeracja_nie_mutuje_modelu_ani_migawki_biegu() -> None:
    set_enm("c-n1", build_golden_enm())
    bieg = execute_run(create_run(case_id="c-n1", klucz_twin="c-n1", analysis_type="PF").id)
    hash_przed = compute_enm_hash(get_enm("c-n1"))
    migawka_przed = copy.deepcopy(bieg.snapshot)

    build_kontyngencje_n1_view(bieg)

    assert compute_enm_hash(get_enm("c-n1")) == hash_przed
    assert bieg.snapshot == migawka_przed
    assert get_enm("c-n1").model_dump(mode="json") == migawka_przed


# ---------------------------------------------------------------------------
# Determinizm
# ---------------------------------------------------------------------------


def test_dwa_wywolania_daja_identyczny_wynik() -> None:
    bieg = _bieg(_pierscien())
    pierwszy = build_kontyngencje_n1_view(bieg)
    drugi = build_kontyngencje_n1_view(bieg)
    assert json.dumps(pierwszy, sort_keys=True) == json.dumps(drugi, sort_keys=True)
    assert pierwszy["input_hash"] == drugi["input_hash"]


def test_permutacja_kolejnosci_elementow_wejscia_nie_zmienia_wyniku() -> None:
    enm = _promien_z_transformatorem()
    odwrocony = enm.model_copy(
        update={
            "branches": list(reversed(enm.branches)),
            "transformers": list(reversed(enm.transformers)),
            "buses": list(reversed(enm.buses)),
            "loads": list(reversed(enm.loads)),
        }
    )
    # Ten sam identyfikator przebiegu w obu wywolaniach: porownujemy WYNIK
    # enumeracji, a nie kopertę `context` (ta niesie identyfikator biegu).
    run_id = UUID("11111111-2222-3333-4444-555555555555")
    wzorzec = build_kontyngencje_n1_view(_bieg(enm, run_id=run_id))
    permutacja = build_kontyngencje_n1_view(_bieg(odwrocony, run_id=run_id))
    assert json.dumps(wzorzec, sort_keys=True) == json.dumps(permutacja, sort_keys=True)


def test_wynik_nie_zawiera_wartosci_nieliczbowych() -> None:
    """Odpowiedź musi być poprawnym JSON-em (RFC 8259) — bez ``NaN``/``Infinity``.

    Kontyngencja z wyspą pozostawia węzły bez rozwiązania; solver oznacza je
    NaN-em, a warstwa interpretacji ma zamienić ten znacznik na jawny brak.
    """
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    json.dumps(widok, allow_nan=False)


# ---------------------------------------------------------------------------
# Ranking i dotkliwość
# ---------------------------------------------------------------------------


def test_ranking_sortuje_po_licznikach_kategorii_bez_wag() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    klucze = [
        (
            -r["dotkliwosc"]["odbiory_bez_zasilania"],
            -r["dotkliwosc"]["przeciazenia"],
            -r["dotkliwosc"]["naruszenia_napiecia"],
            r["element_ref"],
        )
        for r in widok["ranking"]
    ]
    assert klucze == sorted(klucze)
    assert [r["pozycja"] for r in widok["ranking"]] == list(range(1, len(widok["ranking"]) + 1))
    # Kontyngencja o największym skutku odbiorczym (magistrala: dwa odbiory za
    # nią) stoi przed kontyngencjami o jednym odbiorze.
    assert widok["ranking"][0]["element_ref"] == "ka_magistrala"


def test_kontrakt_widoku_jest_kompletny() -> None:
    widok = build_kontyngencje_n1_view(_bieg(_pierscien()))
    assert widok["analysis"] == "kontyngencje_n1"
    assert set(widok) == {
        "analysis",
        "context",
        "parameters",
        "input_hash",
        "przypadek_bazowy",
        "kontyngencje",
        "ranking",
        "nierozstrzygniete",
        "podsumowanie",
    }
    assert set(widok["context"]) == {"run_id", "snapshot_hash", "case_id"}
    kryteria = widok["parameters"]["kryteria"]
    assert kryteria["obciazenie"]["granica_fail_pct"] == 100.0
    assert kryteria["napiecie"]["granica_fail_pct"] == 10.0
    # ZAMKNIETA lista ocenianych kategorii — deklaracja przypieta testem, a nie
    # zapisana wylacznie w komentarzu. Kazde nowe kryterium musi tu dojsc swiadomie.
    assert kryteria["ocenione_kategorie"] == [
        "BRANCH_LOADING",
        "TRANSFORMER_LOADING",
        "VOLTAGE_DEVIATION",
    ]
    assert "Budżet strat" in kryteria["poza_zakresem_pl"]
    assert kryteria["ranking"]["kolejnosc_kategorii"] == [
        "odbiory_bez_zasilania",
        "przeciazenia",
        "naruszenia_napiecia",
    ]
    # Pochodzenie kryterium zasilania opisane SEMANTYCZNIE (bez sciezek/nazw
    # kodu — to tresc widoczna dla inzyniera).
    assert "wyspa węzła bilansującego" in kryteria["zasilanie"]["zrodlo_pl"].lower()

    kontyngencja = widok["kontyngencje"][0]
    assert set(kontyngencja) == {
        "element_ref",
        "element_name",
        "element_kind",
        "status",
        "powod_pl",
        "przeciazenia",
        "naruszenia_napiecia",
        "kryteria_pominiete",
        "odbiory_bez_zasilania",
        "szyny_bez_zasilania",
        "dotkliwosc",
        "slad",
    }
    assert set(kontyngencja["slad"]) == {
        "element_wylaczony",
        "wariant_wejscia",
        "bieg",
        "wyspa_zasilana",
    }
    assert kontyngencja["slad"]["bieg"]["metoda"] == "newton-raphson"
    wariant = kontyngencja["slad"]["wariant_wejscia"]
    assert wariant["galezie_wariant"] == wariant["galezie_baza"] - 1


# ---------------------------------------------------------------------------
# Zawężenie enumeracji i błędy wejścia
# ---------------------------------------------------------------------------


def test_zaden_skutek_nie_wychodzi_poza_zamknieta_liste_kategorii() -> None:
    """Wynik NIE MOZE zawierac kryterium spoza zadeklarowanej listy.

    Kontrole sieciowe walidacji energetycznej (budzet strat, bilans mocy biernej)
    sa w tym samym zrodle pozycji, wiec bez tej asercji ich przypadkowe wpuszczenie
    do skutkow kontyngencji przeszloby niezauwazone.
    """
    dozwolone = {"BRANCH_LOADING", "TRANSFORMER_LOADING", "VOLTAGE_DEVIATION"}
    widok = build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()))
    pozycje = []
    for grupa in (widok["przypadek_bazowy"], *widok["kontyngencje"]):
        pozycje += grupa["przeciazenia"] + grupa["naruszenia_napiecia"]
        pozycje += grupa["kryteria_pominiete"]
    assert pozycje, "Brak pozycji do sprawdzenia — test nie mialby czego pilnowac"
    assert {p["check_type"] for p in pozycje} <= dozwolone


def test_zawezenie_enumeracji_do_wskazanych_elementow() -> None:
    widok = build_kontyngencje_n1_view(
        _bieg(_promien_z_transformatorem()), element_refs=["tr_sn_nn"]
    )
    assert [k["element_ref"] for k in widok["kontyngencje"]] == ["tr_sn_nn"]
    assert widok["parameters"]["element_refs"] == ["tr_sn_nn"]


def test_nieznany_element_konczy_sie_bledem_po_polsku() -> None:
    with pytest.raises(ValueError, match="nie są kwalifikowanymi elementami"):
        build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()), element_refs=["sw_pole"])


def test_pusta_lista_elementow_konczy_sie_bledem() -> None:
    with pytest.raises(ValueError, match="Lista elementów"):
        build_kontyngencje_n1_view(_bieg(_promien_z_transformatorem()), element_refs=[])


def test_zly_rodzaj_przebiegu_konczy_sie_bledem() -> None:
    with pytest.raises(ValueError, match="wymaga przebiegu rozpływu"):
        build_kontyngencje_n1_view(_bieg(_pierscien(), analysis_type="short_circuit_sn"))


def test_niezakonczony_przebieg_konczy_sie_bledem() -> None:
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_kontyngencje_n1_view(_bieg(_pierscien(), status="RUNNING"))


def test_model_bez_kwalifikowanych_elementow_konczy_sie_bledem() -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="Sama szyna"),
        buses=[Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0)],
        sources=[_zrodlo()],
    )
    with pytest.raises(ValueError, match="kwalifikowanego elementu"):
        build_kontyngencje_n1_view(_bieg(enm))


def test_priorytet_kategorii_dotkliwosci_jest_przypiety_a_nie_tylko_zadeklarowany() -> None:
    """Kolejność kategorii w kluczu rankingu — PRZYPIĘTA, nie tylko opisana.

    Znalezisko odbioru nadzoru (2026-08-13, karta N-1-BACKEND): docstring
    ``_klucz_rankingu`` deklaruje porządek „odbiory bez zasilania → przeciążenia
    → naruszenia napięciowe", ale ODWRÓCENIE tej kolejności w kodzie nie
    czerwieniło ŻADNEGO testu — deklaracja bez testu (KLASA-NIE-INSTANCJA §4).
    Ten test ustawia trzy pozycje tak, by KAŻDA para kategorii rozstrzygała się
    inaczej przy odwróconym porządku: „tylko odbiór bez zasilania" musi wygrać z
    „wiele przeciążeń", a „jedno przeciążenie" z „wiele naruszeń napięciowych".
    """
    pozycje = [
        {
            "element_ref": "b_napiecia",
            "dotkliwosc": {
                "odbiory_bez_zasilania": 0,
                "przeciazenia": 0,
                "naruszenia_napiecia": 9,
            },
        },
        {
            "element_ref": "a_przeciazenia",
            "dotkliwosc": {
                "odbiory_bez_zasilania": 0,
                "przeciazenia": 1,
                "naruszenia_napiecia": 0,
            },
        },
        {
            "element_ref": "c_odbior",
            "dotkliwosc": {
                "odbiory_bez_zasilania": 1,
                "przeciazenia": 0,
                "naruszenia_napiecia": 0,
            },
        },
    ]

    kolejnosc = [p["element_ref"] for p in sorted(pozycje, key=_klucz_rankingu)]

    assert kolejnosc == ["c_odbior", "a_przeciazenia", "b_napiecia"]


def test_remis_pelnej_dotkliwosci_rozstrzyga_element_ref_rosnaco() -> None:
    """Tie-break rankingu — deterministyczny i przypięty (ta sama klasa co wyżej)."""
    dotkliwosc = {"odbiory_bez_zasilania": 2, "przeciazenia": 1, "naruszenia_napiecia": 0}
    pozycje = [
        {"element_ref": "z_ostatni", "dotkliwosc": dict(dotkliwosc)},
        {"element_ref": "a_pierwszy", "dotkliwosc": dict(dotkliwosc)},
    ]

    kolejnosc = [p["element_ref"] for p in sorted(pozycje, key=_klucz_rankingu)]

    assert kolejnosc == ["a_pierwszy", "z_ostatni"]


# ---------------------------------------------------------------------------
# Bitowa niezmienność wyniku wobec optymalizacji wydajności (karta N1-WYDAJNOSC)
# ---------------------------------------------------------------------------

#: Odciski SHA-256 KANONICZNEGO widoku N-1 na sieciach referencyjnych, ZMIERZONE
#: PRZED optymalizacją wydajności (karta N1-WYDAJNOSC) i niezmienione po niej.
#: Wartości zweryfikowane pod obiema postaciami kodu: z pętlą skalarną jakobianu
#: (stan sprzed karty) i z postacią blokową (stan obecny) — identyczne.
#:
#: Ten pin istnieje po to, żeby KAŻDA przyszła optymalizacja tej ścieżki musiała
#: udowodnić, że nie rusza wyniku. Optymalizacja zmieniająca choć jedną cyfrę nie
#: jest optymalizacją, tylko cichą zmianą fizyki — a wynik N-1 rozstrzyga, czy
#: projektant zobaczy przeciążenie po wyłączeniu elementu. NIE aktualizować tych
#: wartości „bo się zmieniły": zmiana wymaga wykazania źródła różnicy i decyzji,
#: że jest zamierzona.
#:
#: ODŚWIEŻENIE 2026-08-14 (zamierzona zmiana SEMANTYCZNA, nie optymalizacja):
#: połówki dzielonego odcinka dziedziczą nazwę rodzica zamiast nosić surowy
#: ref (`_nazwa_polowki_odcinka`, defekt zmierzony na żywym ekranie N-1).
#: Widok kanoniczny niesie `element_name`, więc odcisk MUSIAŁ się zmienić;
#: zmiana w `domain_operations.py` dotyczy WYŁĄCZNIE pól "name" (4 linie),
#: żadna wielkość liczbowa nie ma prawa się różnić — potwierdzone zielenią
#: wszystkich pozostałych testów enumeracji przy czerwieni wyłącznie tych
#: dwóch odcisków.
ODCISKI_WIDOKU_PRZED_OPTYMALIZACJA = {
    "gn01_promieniowa": "fbf4ccd6d49375fdb9a43ccf5cd97ab9f1de34fa39e4fb28f730717060f34125",
    "gn03_pierscien": "b4639a3b1347f4b9e5df80b5eb2e26aec214f252d1a41682fb9e04091d94e22b",
}


def _odcisk_widoku(widok: dict) -> str:
    kanoniczny = json.dumps(widok, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(kanoniczny.encode("utf-8")).hexdigest()


def _bieg_o_stalym_id(dane: dict) -> CanonicalRun:
    """Przebieg o USTALONYM identyfikatorze — inaczej odcisk zmieniałby się co bieg."""
    return CanonicalRun(
        id=UUID("00000000-0000-4000-8000-000000000007"),
        case_id="c",
        project_id="p",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
        snapshot_hash=dane["snapshot_hash"],
        input_hash="x",
        snapshot=dane["enm"],
        validation={},
        readiness={},
        options={},
    )


@pytest.mark.parametrize("siec", sorted(ODCISKI_WIDOKU_PRZED_OPTYMALIZACJA))
def test_pelny_widok_kanoniczny_nie_zmienil_sie_po_optymalizacji(siec: str) -> None:
    """Pełny wynik (nie wyrywkowe pole) zgodny z odciskiem sprzed optymalizacji.

    Pokrycie obejmuje topologię PROMIENIOWĄ i OCZKOWĄ: w pierścieniu wyłączenie
    gałęzi przenosi przepływ na objazd (zmieniają się przeciążenia), w promieniu
    odcina zasilanie (zmieniają się odbiory bez zasilania) — czyli obie kategorie
    dotkliwości są realnie ćwiczone, a nie tylko obecne w kontrakcie.
    """
    from tests.reference_networks.builders import (
        build_gn01_sn_promieniowa,
        build_gn03_sn_pierscien,
    )

    dane = {
        "gn01_promieniowa": build_gn01_sn_promieniowa,
        "gn03_pierscien": build_gn03_sn_pierscien,
    }[siec]()

    widok = build_kontyngencje_n1_view(_bieg_o_stalym_id(dane))

    assert _odcisk_widoku(widok) == ODCISKI_WIDOKU_PRZED_OPTYMALIZACJA[siec], (
        f"Widok N-1 dla sieci {siec} różni się od stanu sprzed optymalizacji "
        "wydajności. Optymalizacja NIE MOŻE zmieniać wyniku — najpierw ustal "
        "przyczynę różnicy, nie aktualizuj odcisku."
    )
    # Kontrola samego pinu: odcisk ma pokrywać NIEPUSTĄ enumerację, inaczej
    # pilnowałby stałej wartości pustej listy.
    assert widok["podsumowanie"]["kontyngencji"] > 0


# Zapowiedź zakresu (koszt przed biegiem) — karta ekranu N-1
# ---------------------------------------------------------------------------


def test_zakres_wymienia_kwalifikowane_elementy_z_kosztem_biegu() -> None:
    """Zakres = lista do wyboru + koszt wyrażony LICZBĄ (nie czasem).

    Iloczyn cech: element kwalifikowany × element wykluczony w bazie — bo to
    właśnie ta para rozdziela „ile pozycji stanie w macierzy" od „ile razy
    uruchomi się solver", czyli od realnego kosztu biegu.
    """
    zakres = build_kontyngencje_n1_zakres_view(_bieg(_promien_z_transformatorem()))

    assert zakres["analysis"] == "kontyngencje_n1_zakres"
    assert set(zakres) == {"analysis", "context", "elementy", "podsumowanie"}
    assert set(zakres["elementy"][0]) == {
        "element_ref",
        "element_name",
        "element_kind",
        "wykluczony",
        "powod_pl",
    }
    # Kolejność po element_ref (ta sama, którą enumeracja wypisuje kontyngencje).
    assert [e["element_ref"] for e in zakres["elementy"]] == [
        "ka_magistrala",
        "ln_odg",
        "ln_wyl",
        "tr_sn_nn",
    ]
    wykluczony = next(e for e in zakres["elementy"] if e["element_ref"] == "ln_wyl")
    assert wykluczony["wykluczony"] is True
    assert wykluczony["powod_pl"] == POWOD_WYKLUCZENIA_PL
    kwalifikowany = next(e for e in zakres["elementy"] if e["element_ref"] == "tr_sn_nn")
    assert kwalifikowany["wykluczony"] is False
    # Brak powodu tam, gdzie nie ma czego uzasadniać (zero pustej treści w UI).
    assert kwalifikowany["powod_pl"] is None
    assert zakres["podsumowanie"] == {
        "kontyngencji": 4,
        "biegow_rozplywu": 3,
        "wykluczonych": 1,
    }


def test_zakres_nie_zapowiada_czasu_bo_kontrakt_go_nie_niesie() -> None:
    """Kosztu NIE wolno wyrazić czasem — pomiar pochodzi z innego substratu.

    Deklaracja z nagłówka modułu („kosztu nie wyrażamy czasem") ma tu PRZYPIĘCIE:
    gdyby ktoś dołożył do zapowiedzi pole z sekundami wyliczonymi z cudzego
    pomiaru, inżynier zobaczyłby liczbę zmyśloną i planował nią swoją pracę.
    """
    zakres = build_kontyngencje_n1_zakres_view(_bieg(_pierscien()))

    def klucze(wezel: object) -> list[str]:
        if isinstance(wezel, dict):
            return [
                *wezel.keys(),
                *(k for wartosc in wezel.values() for k in klucze(wartosc)),
            ]
        if isinstance(wezel, list):
            return [k for pozycja in wezel for k in klucze(pozycja)]
        return []

    czasowe = ("czas", "sekund", "minut", "_s", "szacun", "trwan", "predykcj")
    for klucz in klucze(zakres):
        assert not any(token in klucz.lower() for token in czasowe), (
            f"Zapowiedź zakresu nie może nieść czasu — pole `{klucz}`. "
            "Pomiar 2,64 s pochodzi z INNEGO substratu; przeliczony na tę sieć "
            "byłby liczbą zmyśloną."
        )
    tresc = " ".join(
        str(wartosc)
        for element in zakres["elementy"]
        for wartosc in element.values()
        if wartosc is not None
    ).lower()
    assert "sekund" not in tresc and "minut" not in tresc


def test_zakres_oglasza_DOKLADNIE_ten_zbior_ktory_enumeracja_liczy() -> None:
    """Predykaty PARAMI: zbiór ogłoszony = zbiór policzony.

    Zapowiedź i enumeracja to dwa wyjścia tej samej reguły kwalifikacji. Gdyby
    rozjechały się choćby o jeden element, ekran oferowałby zakres, którego bieg
    nie policzy (albo policzyłby element, którego nikt nie zapowiedział) — dokładnie
    ta klasa defektu, którą przegląd fali nazwał „inny zbiór niż powinien".
    """
    for enm in (_pierscien(), _promien_z_transformatorem(), build_golden_enm()):
        bieg = _bieg(enm)
        ogloszone = [e["element_ref"] for e in build_kontyngencje_n1_zakres_view(bieg)["elementy"]]
        widok = build_kontyngencje_n1_view(bieg)

        assert ogloszone == [k["element_ref"] for k in widok["kontyngencje"]]
        assert ogloszone == widok["parameters"]["element_refs"]


def test_zakres_wyklucza_te_same_elementy_co_enumeracja() -> None:
    """Ten sam element = ten sam werdykt i to samo uzasadnienie w obu wyjściach."""
    bieg = _bieg(_promien_z_transformatorem())
    zakres = build_kontyngencje_n1_zakres_view(bieg)
    widok = build_kontyngencje_n1_view(bieg)

    wykluczone_zakres = {e["element_ref"] for e in zakres["elementy"] if e["wykluczony"]}
    wykluczone_bieg = {
        k["element_ref"] for k in widok["kontyngencje"] if k["status"] == "wykluczony"
    }

    assert wykluczone_zakres == wykluczone_bieg
    assert _po_ref(widok, "ln_wyl")["powod_pl"] == POWOD_WYKLUCZENIA_PL


def test_zakres_odrzuca_dokladnie_te_same_przebiegi_co_enumeracja() -> None:
    """Warunek wejścia jest JEDEN (parzystość zapowiedzi i biegu).

    Ekran, który zapowiada zakres dla przebiegu, a przy starcie dostaje odmowę,
    kłamałby o wykonalności biegu — i odwrotnie. Test sprawdza obie strony na
    komplecie odrzuceń: zły rodzaj analizy, przebieg niezakończony, model bez
    kwalifikowanego elementu.
    """
    sama_szyna = EnergyNetworkModel(
        header=ENMHeader(name="Sama szyna"),
        buses=[Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0)],
        sources=[_zrodlo()],
    )
    odrzucane = [
        (_bieg(_pierscien(), analysis_type="short_circuit_sn"), "wymaga przebiegu rozpływu"),
        (_bieg(_pierscien(), status="RUNNING"), "nie jest zakończony"),
        (_bieg(sama_szyna), "kwalifikowanego elementu"),
    ]

    for bieg, komunikat in odrzucane:
        with pytest.raises(ValueError, match=komunikat):
            build_kontyngencje_n1_zakres_view(bieg)
        with pytest.raises(ValueError, match=komunikat):
            build_kontyngencje_n1_view(bieg)


def test_zakres_nie_uruchamia_solvera() -> None:
    """Zapowiedź musi być TANIA — inaczej nie ma czego zapowiadać.

    Gdyby zapowiedź liczyła cokolwiek rozpływem, ekran płaciłby pełny koszt N-1
    zanim inżynier zdecydował o biegu — czyli dokładnie ten koszt, przed którym
    ma go chronić. Pin: podmieniona ścieżka wykonania rozpływu nie może zostać
    wywołana ani razu.
    """
    import application.analyses.kontyngencje_n1 as modul

    wywolania: list[object] = []
    oryginal = modul._execute_power_flow
    modul._execute_power_flow = lambda bieg: wywolania.append(bieg)  # type: ignore[assignment]
    try:
        build_kontyngencje_n1_zakres_view(_bieg(_pierscien()))
    finally:
        modul._execute_power_flow = oryginal  # type: ignore[assignment]

    assert wywolania == []


def test_zakres_nie_mutuje_migawki_biegu() -> None:
    """Odczyt migawki nie może jej dotknąć (reguła Case Immutability)."""
    bieg = _bieg(_promien_z_transformatorem())
    przed = json.dumps(bieg.snapshot, sort_keys=True, ensure_ascii=False)

    build_kontyngencje_n1_zakres_view(bieg)

    assert json.dumps(bieg.snapshot, sort_keys=True, ensure_ascii=False) == przed
