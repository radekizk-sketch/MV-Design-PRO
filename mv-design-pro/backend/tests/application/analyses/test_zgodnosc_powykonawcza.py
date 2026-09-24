"""Testy serwisu zgodności powykonawczej (pomiary z obiektu vs model) — D12.

Zakres (rachunki ręczne): punkt U/P w tolerancji i poza, U w kV z u_pu, Q po
wartości bezwzględnej (V12K-040), nieznany element_ref → wiersz raportu (nie
błąd), brak wyniku, parser CSV (średnik+przecinek dziesiętny, przecinek+kropka,
błąd → numer wiersza), walidacja jednostki/wielkości, brak jawnej tolerancji,
zły rodzaj/status przebiegu, pusta lista, determinizm i sortowanie.

Miejsce pomiaru mocy gałęzi (decyzja O-51, klasa P9, miejsce 12): rekord P/Q niesie
zacisk `od`/`do`; iloczyn cech {zacisk od, do, brak} × {linia, transformator z
przekładnią — P/Q wyraźnie różne na końcach} × {w tolerancji, poza} w
`test_iloczyn_zacisk_x_galaz_x_tolerancja`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.zgodnosc_powykonawcza import (
    build_zgodnosc_powykonawcza_view,
    parse_measurements_csv,
)
from enm.canonical_analysis import CanonicalRun


def _pf_run(
    *,
    buses: list[dict],
    bus_results: list[dict],
    graph_nodes: dict[str, dict],
    node_voltage_kv: dict[str, float],
    branch_results: list[dict] | None = None,
    graph_branches: dict[str, dict] | None = None,
    status: str = "FINISHED",
    analysis_type: str = "PF",
    snapshot_galezie: dict | None = None,
) -> CanonicalRun:
    """Zbuduj przebieg rozpływu z kontrolowanym wynikiem FROZEN."""
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={
            "header": {"name": "Projekt"},
            "buses": buses,
            **(snapshot_galezie or {}),
        },
        validation={},
        readiness={},
        raw_result={
            "result_v1": {
                "bus_results": bus_results,
                "branch_results": branch_results or [],
            },
            "graph": {
                "nodes": graph_nodes,
                "branches": graph_branches or {},
            },
            "node_voltage_kv": node_voltage_kv,
            "branch_current_ka": {},
        },
    )


def _standardowy_run() -> CanonicalRun:
    """Węzeł ``bus_a`` (u_pu=1.02, U_n=15 kV → 15.30 kV), linia ``line_1`` (bus_a → bus_b;
    P_od=0.8 MW, Q_od=-0.6 Mvar, P_do=-0.79 MW, Q_do=0.55 Mvar) i transformator
    ``tr_1`` 110/15 kV (bus_gn → bus_a; P_od=10.0 MW, Q_od=3.0 Mvar, P_do=-9.9 MW,
    Q_do=-2.4 Mvar — moce końców różne o straty i moc bierną magnesowania)."""
    return _pf_run(
        buses=[
            {"ref_id": "bus_a", "name": "Stacja A", "voltage_kv": 15.0},
            {"ref_id": "bus_b", "name": "Stacja B", "voltage_kv": 15.0},
            {"ref_id": "bus_gn", "name": "GPZ 110 kV", "voltage_kv": 110.0},
        ],
        bus_results=[{"bus_id": "n1", "v_pu": 1.02, "angle_deg": 0.0}],
        graph_nodes={
            "n1": {"element_id": "bus_a", "name": "Bus A", "node_type": "PQ", "voltage_level": 15.0}
        },
        node_voltage_kv={"n1": 15.3},
        branch_results=[
            {
                "branch_id": "b1",
                "p_from_mw": 0.8,
                "q_from_mvar": -0.6,
                "p_to_mw": -0.79,
                "q_to_mvar": 0.55,
            },
            {
                "branch_id": "t1",
                "p_from_mw": 10.0,
                "q_from_mvar": 3.0,
                "p_to_mw": -9.9,
                "q_to_mvar": -2.4,
            },
        ],
        graph_branches={
            "b1": {
                "element_id": "line_1",
                "name": "Line 1",
                "from_node_id": "n1",
                "to_node_id": "n2",
            },
            "t1": {
                "element_id": "tr_1",
                "name": "TR 110/15",
                "from_node_id": "n0",
                "to_node_id": "n1",
            },
        },
        snapshot_galezie={
            "branches": [
                {
                    "ref_id": "line_1",
                    "type": "line_overhead",
                    "from_bus_ref": "bus_a",
                    "to_bus_ref": "bus_b",
                }
            ],
            "transformers": [{"ref_id": "tr_1", "hv_bus_ref": "bus_gn", "lv_bus_ref": "bus_a"}],
        },
    )


def _pomiar(
    element_ref: str,
    wielkosc: str,
    wartosc: float,
    jednostka: str,
    zacisk: str | None = None,
) -> dict:
    return {
        "element_ref": element_ref,
        "wielkosc": wielkosc,
        "wartosc": wartosc,
        "jednostka": jednostka,
        "zacisk": zacisk,
    }


# --------------------------------------------------------------------------
# Napięcie U — rachunki ręczne
# --------------------------------------------------------------------------


def test_u_w_tolerancji_rachunek() -> None:
    # Model = 1.02 × 15 = 15.30 kV; pomiar 15.35 → odchyłka 0.05 → 0.326797% < 1%.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("bus_a", "U", 15.35, "kV")],
        {"napiecie_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["wartosc_model"] == 15.3
    assert wiersz["odchylka_bezwzgledna"] == 0.05
    assert wiersz["odchylka_pct"] == pytest.approx(0.326797, abs=1e-6)
    assert wiersz["werdykt"] == "w tolerancji"


def test_u_poza_tolerancja_rachunek() -> None:
    # Pomiar 15.60 → odchyłka 0.30 → 1.960784% > 1%.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("bus_a", "U", 15.60, "kV")],
        {"napiecie_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["odchylka_pct"] == pytest.approx(1.960784, abs=1e-6)
    assert wiersz["werdykt"] == "poza tolerancją"


def test_u_przeliczenie_kv_z_upu() -> None:
    # Model U = u · U_n = 1.02 × 15 = 15.30 kV (jawne w śladzie).
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("bus_a", "U", 15.30, "kV")],
        {"napiecie_pct": 0.5},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["wartosc_model"] == 15.3
    # K10: asercja na semantykę kroku (przeliczenie U = u · U_n jawne w śladzie),
    # nie na nazwę pola kontraktu.
    assert any("U = u · U_n" in krok for krok in wiersz["slad_pl"])
    assert wiersz["werdykt"] == "w tolerancji"


# --------------------------------------------------------------------------
# Moce P/Q — rachunki ręczne
# --------------------------------------------------------------------------


def test_p_w_tolerancji() -> None:
    # P_from 0.8 MW; pomiar 0.804 → odchyłka 0.004 → 0.5% < 1%.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("line_1", "P", 0.804, "MW", "od")],
        {"moc_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["odchylka_pct"] == pytest.approx(0.5, abs=1e-6)
    assert wiersz["werdykt"] == "w tolerancji"


def test_p_poza_tolerancja() -> None:
    # Pomiar 0.82 → odchyłka 0.02 → 2.5% > 1%.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("line_1", "P", 0.82, "MW", "od")],
        {"moc_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["odchylka_pct"] == pytest.approx(2.5, abs=1e-6)
    assert wiersz["werdykt"] == "poza tolerancją"


def test_q_po_wartosci_bezwzglednej_v12k040() -> None:
    # Model |Q| na początku gałęzi = |-0.6| (znak nieinterpretowany); pomiar +0.62 →
    # |0.62| - |−0.6| = 0.02 → 0.02/0.6 = 3.333% < 5% → w tolerancji.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("line_1", "Q", 0.62, "Mvar", "od")],
        {"moc_pct": 5.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["wartosc_model"] == -0.6
    assert wiersz["odchylka_bezwzgledna"] == pytest.approx(0.02, abs=1e-6)
    assert wiersz["odchylka_pct"] == pytest.approx(3.333333, abs=1e-6)
    assert wiersz["werdykt"] == "w tolerancji"
    # K10: intencja bez zmian — założenia mają jawnie deklarować porównanie Q po
    # wartości bezwzględnej; kod rejestru nie może pojawiać się w treści dla inżyniera.
    assert any(
        "wartości bezwzględnej" in z and "znaku mocy biernej" in z for z in view["zalozenia_pl"]
    )


# --------------------------------------------------------------------------
# Werdykty brakowe (uczciwe wiersze, nie błędy)
# --------------------------------------------------------------------------


def test_nieznany_element_ref_daje_wiersz_brak_odpowiednika() -> None:
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("nieznany", "U", 15.0, "kV")],
        {"napiecie_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["werdykt"] == "brak odpowiednika w modelu"
    assert view["podsumowanie"]["brak_odpowiednika"] == 1


def test_wezel_bez_wyniku_upu_daje_brak_wyniku() -> None:
    run = _pf_run(
        buses=[{"ref_id": "bus_a", "voltage_kv": 15.0}],
        bus_results=[{"bus_id": "n1", "v_pu": None, "angle_deg": 0.0}],
        graph_nodes={"n1": {"element_id": "bus_a", "name": "Bus A", "voltage_level": 15.0}},
        node_voltage_kv={},
    )
    view = build_zgodnosc_powykonawcza_view(
        run, [_pomiar("bus_a", "U", 15.0, "kV")], {"napiecie_pct": 1.0}
    )
    assert view["wiersze"][0]["werdykt"] == "brak wyniku dla elementu"


def test_p_dla_wezla_daje_brak_odpowiednika() -> None:
    # 'bus_a' istnieje jako węzeł, ale nie jako gałąź → P bez odpowiednika.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("bus_a", "P", 0.5, "MW")],
        {"moc_pct": 1.0},
    )
    assert view["wiersze"][0]["werdykt"] == "brak odpowiednika w modelu"


# --------------------------------------------------------------------------
# Walidacja wejścia (422 PL)
# --------------------------------------------------------------------------


def test_pusta_lista_pomiarow_blad() -> None:
    with pytest.raises(ValueError, match="pusta"):
        build_zgodnosc_powykonawcza_view(_standardowy_run(), [], {"napiecie_pct": 1.0})


def test_zly_rodzaj_przebiegu_blad() -> None:
    run = _pf_run(
        buses=[{"ref_id": "bus_a", "voltage_kv": 15.0}],
        bus_results=[],
        graph_nodes={},
        node_voltage_kv={},
        analysis_type="short_circuit_sn",
    )
    with pytest.raises(ValueError, match="rozpływu mocy"):
        build_zgodnosc_powykonawcza_view(
            run, [_pomiar("bus_a", "U", 15.0, "kV")], {"napiecie_pct": 1.0}
        )


def test_przebieg_niezakonczony_blad() -> None:
    run = _pf_run(
        buses=[{"ref_id": "bus_a", "voltage_kv": 15.0}],
        bus_results=[],
        graph_nodes={},
        node_voltage_kv={},
        status="RUNNING",
    )
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_zgodnosc_powykonawcza_view(
            run, [_pomiar("bus_a", "U", 15.0, "kV")], {"napiecie_pct": 1.0}
        )


def test_brak_tolerancji_napiecia_blad() -> None:
    with pytest.raises(ValueError, match="tolerancji napięcia"):
        build_zgodnosc_powykonawcza_view(
            _standardowy_run(), [_pomiar("bus_a", "U", 15.0, "kV")], {}
        )


def test_brak_tolerancji_mocy_blad() -> None:
    with pytest.raises(ValueError, match="tolerancji mocy"):
        build_zgodnosc_powykonawcza_view(
            _standardowy_run(), [_pomiar("line_1", "P", 0.8, "MW")], {}
        )


def test_nieznana_wielkosc_blad() -> None:
    with pytest.raises(ValueError, match="nieznana wielkość"):
        build_zgodnosc_powykonawcza_view(
            _standardowy_run(), [_pomiar("bus_a", "X", 1.0, "kV")], {"napiecie_pct": 1.0}
        )


def test_niezgodna_jednostka_blad() -> None:
    with pytest.raises(ValueError, match="jednostka"):
        build_zgodnosc_powykonawcza_view(
            _standardowy_run(), [_pomiar("bus_a", "U", 15.0, "MW")], {"napiecie_pct": 1.0}
        )


# --------------------------------------------------------------------------
# Determinizm i sortowanie
# --------------------------------------------------------------------------


def test_determinizm_hash_i_powtarzalnosc() -> None:
    run = _standardowy_run()
    pomiary = [
        _pomiar("bus_a", "U", 15.35, "kV"),
        _pomiar("line_1", "P", 0.81, "MW", "od"),
    ]
    tol = {"napiecie_pct": 1.0, "moc_pct": 1.0}
    pierwszy = build_zgodnosc_powykonawcza_view(run, pomiary, tol)
    drugi = build_zgodnosc_powykonawcza_view(run, pomiary, tol)
    assert pierwszy == drugi
    assert len(pierwszy["input_hash"]) == 64


def test_sortowanie_wierszy_po_element_ref_wielkosc() -> None:
    run = _standardowy_run()
    pomiary = [
        _pomiar("line_1", "Q", 0.6, "Mvar", "od"),
        _pomiar("bus_a", "U", 15.3, "kV"),
        _pomiar("line_1", "P", 0.8, "MW", "od"),
    ]
    view = build_zgodnosc_powykonawcza_view(run, pomiary, {"napiecie_pct": 1.0, "moc_pct": 1.0})
    klucze = [(w["element_ref"], w["wielkosc"]) for w in view["wiersze"]]
    assert klucze == [("bus_a", "U"), ("line_1", "P"), ("line_1", "Q")]


def test_podsumowanie_najwieksza_odchylka() -> None:
    run = _standardowy_run()
    pomiary = [
        _pomiar("bus_a", "U", 15.35, "kV"),  # ~0.327%
        _pomiar("line_1", "P", 0.82, "MW", "od"),  # 2.5%
    ]
    view = build_zgodnosc_powykonawcza_view(run, pomiary, {"napiecie_pct": 5.0, "moc_pct": 5.0})
    assert view["podsumowanie"]["najwieksza_odchylka_pct"] == pytest.approx(2.5, abs=1e-6)
    assert view["podsumowanie"]["najwieksza_odchylka_element_ref"] == "line_1"
    assert view["podsumowanie"]["najwieksza_odchylka_wielkosc"] == "P"


# --------------------------------------------------------------------------
# Parser CSV
# --------------------------------------------------------------------------


def test_csv_srednik_z_przecinkiem_dziesietnym() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka;zacisk\nbus_a;U;15,35;kV;\n"
    wiersze = parse_measurements_csv(csv_text)
    assert len(wiersze) == 1
    assert wiersze[0]["zacisk"] is None
    assert wiersze[0]["wartosc"] == pytest.approx(15.35)
    assert wiersze[0]["_wiersz"] == 2


def test_csv_przecinek_z_kropka_dziesietna() -> None:
    csv_text = "element_ref,wielkosc,wartosc,jednostka,zacisk\nline_1,P,0.808,MW,do\n"
    wiersze = parse_measurements_csv(csv_text)
    assert wiersze[0]["wartosc"] == pytest.approx(0.808)
    assert wiersze[0]["zacisk"] == "do"


def test_csv_bledna_wartosc_daje_numer_wiersza() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka;zacisk\nbus_a;U;abc;kV;\n"
    with pytest.raises(ValueError, match="Wiersz 2 CSV"):
        parse_measurements_csv(csv_text)


def test_csv_zla_liczba_kolumn_daje_numer_wiersza() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka;zacisk\nbus_a;U;15,3\n"
    with pytest.raises(ValueError, match="Wiersz 2 CSV"):
        parse_measurements_csv(csv_text)


def test_csv_zly_naglowek_blad() -> None:
    with pytest.raises(ValueError, match="Nagłówek CSV"):
        parse_measurements_csv("a;b;c;d;e\nbus_a;U;15,3;kV;\n")


def test_csv_pusty_blad() -> None:
    with pytest.raises(ValueError, match="pusty"):
        parse_measurements_csv("   ")


def test_csv_end_to_end_z_serwisem() -> None:
    csv_text = (
        "element_ref;wielkosc;wartosc;jednostka;zacisk\n"
        "bus_a;U;15,35;kV;\n"
        "line_1;P;0,804;MW;od\n"
    )
    pomiary = parse_measurements_csv(csv_text)
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(), pomiary, {"napiecie_pct": 1.0, "moc_pct": 1.0}
    )
    assert view["podsumowanie"]["liczba_punktow"] == 2
    assert {w["werdykt"] for w in view["wiersze"]} == {"w tolerancji"}


def test_csv_zla_wielkosc_wykrywana_przez_serwis() -> None:
    # Parser waliduje strukturę; semantyka (wielkość) w serwisie z numerem wiersza.
    csv_text = "element_ref;wielkosc;wartosc;jednostka;zacisk\nbus_a;Z;15,3;kV;\n"
    pomiary = parse_measurements_csv(csv_text)
    with pytest.raises(ValueError, match="wierszu 2"):
        build_zgodnosc_powykonawcza_view(_standardowy_run(), pomiary, {"napiecie_pct": 1.0})


# --------------------------------------------------------------------------
# Miejsce pomiaru mocy gałęzi (decyzja O-51, klasa P9, miejsce 12)
# --------------------------------------------------------------------------

#: Model na każdym zacisku (P [MW], |Q| [Mvar]) — z `_standardowy_run`.
_MODEL_ZACISKU = {
    ("line_1", "od"): (0.8, 0.6),
    ("line_1", "do"): (-0.79, 0.55),
    ("tr_1", "od"): (10.0, 3.0),
    ("tr_1", "do"): (-9.9, 2.4),
}


@pytest.mark.parametrize("galaz", ["line_1", "tr_1"])
@pytest.mark.parametrize("zacisk", ["od", "do", None])
@pytest.mark.parametrize("w_tolerancji", [True, False])
@pytest.mark.parametrize("wielkosc", ["P", "Q"])
def test_iloczyn_zacisk_x_galaz_x_tolerancja(
    galaz: str, zacisk: str | None, w_tolerancji: bool, wielkosc: str
) -> None:
    """Model z WSKAZANEGO zacisku; pomiar 0,5 % od modelu tego zacisku jest w tolerancji
    1 %, pomiar 3 % — poza. Na transformatorze moce końców różnią się o więcej niż
    tolerancja (P: 10,0 wobec 9,9 MW = 1,0 %, |Q|: 3,0 wobec 2,4 Mvar = 25 %), więc
    werdykt rozstrzyga miejsce pomiaru, nie konwencja „początek gałęzi". Rekord bez
    zacisku = odmowa nazwana z kodem kanonu, nie porównanie z którymkolwiek końcem."""
    from application.analyses.zgodnosc_powykonawcza import KOD_BRAK_ZACISKU_POMIARU

    odniesienie = _MODEL_ZACISKU[(galaz, zacisk or "od")]
    model = odniesienie[0] if wielkosc == "P" else odniesienie[1]
    wartosc = model * (1.005 if w_tolerancji else 1.03)
    jednostka = "MW" if wielkosc == "P" else "Mvar"
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar(galaz, wielkosc, wartosc, jednostka, zacisk)],
        {"moc_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["zacisk"] == zacisk
    if zacisk is None:
        assert wiersz["werdykt"] == "brak miejsca pomiaru"
        assert wiersz["kod_odmowy"] == KOD_BRAK_ZACISKU_POMIARU
        assert wiersz["wartosc_model"] is None
        assert view["podsumowanie"]["brak_miejsca_pomiaru"] == 1
        assert wiersz["miejsce_pomiaru_pl"] is None
        return
    assert wiersz["kod_odmowy"] is None
    # Etykieta miejsca w wierszu = etykieta, którą formularz pokazuje przy wyborze
    # zacisku (`GET …/zaciski-galezi` → `zaciski_galezi_migawki`) — jedno źródło.
    from application.protection_settings.zacisk_zabezpieczenia import (
        zaciski_galezi_migawki,
    )

    etykiety_formularza = zaciski_galezi_migawki(_standardowy_run().snapshot)
    assert wiersz["miejsce_pomiaru_pl"] == etykiety_formularza[galaz][zacisk]["etykieta_pl"]
    assert wiersz["werdykt"] == ("w tolerancji" if w_tolerancji else "poza tolerancją")
    assert abs(wiersz["wartosc_model"]) == pytest.approx(abs(model), abs=1e-6)
    etykieta = "Zacisk początkowy" if zacisk == "od" else "Zacisk końcowy"
    assert any(etykieta in krok for krok in wiersz["slad_pl"])


def test_moce_koncow_transformatora_roznia_sie_o_wiecej_niz_tolerancja() -> None:
    """Warunek konieczny mocy rozróżniającej testu iloczynu: pomiar P na zacisku `do`
    transformatora zgodny z modelem tego zacisku jest POZA tolerancją wobec zacisku
    `od` — dawna reguła („początek gałęzi") dawała więc zły werdykt."""
    run = _standardowy_run()
    do = build_zgodnosc_powykonawcza_view(
        run, [_pomiar("tr_1", "P", -9.9, "MW", "do")], {"moc_pct": 0.5}
    )
    od = build_zgodnosc_powykonawcza_view(
        run, [_pomiar("tr_1", "P", -9.9, "MW", "od")], {"moc_pct": 0.5}
    )
    assert do["wiersze"][0]["werdykt"] == "w tolerancji"
    assert od["wiersze"][0]["werdykt"] == "poza tolerancją"


@pytest.mark.parametrize(
    ("pomiar", "fragment"),
    [
        (_pomiar("bus_a", "U", 15.3, "kV", "od"), "napięcie mierzy się w węźle"),
        (_pomiar("line_1", "P", 0.8, "MW", "srodek"), "dozwolone 'od'"),
    ],
)
def test_zacisk_walidacja_wejscia(pomiar: dict, fragment: str) -> None:
    with pytest.raises(ValueError, match=fragment):
        build_zgodnosc_powykonawcza_view(
            _standardowy_run(), [pomiar], {"napiecie_pct": 1.0, "moc_pct": 1.0}
        )


def test_csv_bez_kolumny_zacisku_odrzucony() -> None:
    """Bez kompatybilności wstecznej: nagłówek sprzed decyzji O-51 (cztery kolumny)."""
    with pytest.raises(ValueError, match="Nagłówek CSV"):
        parse_measurements_csv("element_ref;wielkosc;wartosc;jednostka\nline_1;P;0,8;MW\n")
