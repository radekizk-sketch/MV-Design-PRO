"""Testy serwisu zgodności powykonawczej (pomiary z obiektu vs model) — D12.

Zakres (rachunki ręczne): punkt U/P w tolerancji i poza, U w kV z u_pu, Q po
wartości bezwzględnej (V12K-040), nieznany element_ref → wiersz raportu (nie
błąd), brak wyniku, parser CSV (średnik+przecinek dziesiętny, przecinek+kropka,
błąd → numer wiersza), walidacja jednostki/wielkości, brak jawnej tolerancji,
zły rodzaj/status przebiegu, pusta lista, determinizm i sortowanie.
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
        snapshot={"header": {"name": "Projekt"}, "buses": buses},
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
    """Węzeł ``bus_a`` (u_pu=1.02, U_n=15 kV → 15.30 kV) i gałąź ``line_1``
    (P_from=0.8 MW, Q_from=-0.6 Mvar)."""
    return _pf_run(
        buses=[{"ref_id": "bus_a", "voltage_kv": 15.0}],
        bus_results=[{"bus_id": "n1", "v_pu": 1.02, "angle_deg": 0.0}],
        graph_nodes={
            "n1": {"element_id": "bus_a", "name": "Bus A", "node_type": "PQ", "voltage_level": 15.0}
        },
        node_voltage_kv={"n1": 15.3},
        branch_results=[{"branch_id": "b1", "p_from_mw": 0.8, "q_from_mvar": -0.6}],
        graph_branches={
            "b1": {
                "element_id": "line_1",
                "name": "Line 1",
                "from_node_id": "n1",
                "to_node_id": "n2",
            }
        },
    )


def _pomiar(element_ref: str, wielkosc: str, wartosc: float, jednostka: str) -> dict:
    return {
        "element_ref": element_ref,
        "wielkosc": wielkosc,
        "wartosc": wartosc,
        "jednostka": jednostka,
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
        [_pomiar("line_1", "P", 0.804, "MW")],
        {"moc_pct": 1.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["odchylka_pct"] == pytest.approx(0.5, abs=1e-6)
    assert wiersz["werdykt"] == "w tolerancji"


def test_p_poza_tolerancja() -> None:
    # Pomiar 0.82 → odchyłka 0.02 → 2.5% > 1%.
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(),
        [_pomiar("line_1", "P", 0.82, "MW")],
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
        [_pomiar("line_1", "Q", 0.62, "Mvar")],
        {"moc_pct": 5.0},
    )
    wiersz = view["wiersze"][0]
    assert wiersz["wartosc_model"] == -0.6
    assert wiersz["odchylka_bezwzgledna"] == pytest.approx(0.02, abs=1e-6)
    assert wiersz["odchylka_pct"] == pytest.approx(3.333333, abs=1e-6)
    assert wiersz["werdykt"] == "w tolerancji"
    # K10: intencja bez zmian — założenia mają jawnie deklarować porównanie Q po
    # wartości bezwzględnej; kod rejestru nie może pojawiać się w treści dla inżyniera.
    assert any("wartości bezwzględnej" in z and "znaku mocy biernej" in z for z in view["zalozenia_pl"])


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
    pomiary = [_pomiar("bus_a", "U", 15.35, "kV"), _pomiar("line_1", "P", 0.81, "MW")]
    tol = {"napiecie_pct": 1.0, "moc_pct": 1.0}
    pierwszy = build_zgodnosc_powykonawcza_view(run, pomiary, tol)
    drugi = build_zgodnosc_powykonawcza_view(run, pomiary, tol)
    assert pierwszy == drugi
    assert len(pierwszy["input_hash"]) == 64


def test_sortowanie_wierszy_po_element_ref_wielkosc() -> None:
    run = _standardowy_run()
    pomiary = [
        _pomiar("line_1", "Q", 0.6, "Mvar"),
        _pomiar("bus_a", "U", 15.3, "kV"),
        _pomiar("line_1", "P", 0.8, "MW"),
    ]
    view = build_zgodnosc_powykonawcza_view(run, pomiary, {"napiecie_pct": 1.0, "moc_pct": 1.0})
    klucze = [(w["element_ref"], w["wielkosc"]) for w in view["wiersze"]]
    assert klucze == [("bus_a", "U"), ("line_1", "P"), ("line_1", "Q")]


def test_podsumowanie_najwieksza_odchylka() -> None:
    run = _standardowy_run()
    pomiary = [
        _pomiar("bus_a", "U", 15.35, "kV"),  # ~0.327%
        _pomiar("line_1", "P", 0.82, "MW"),  # 2.5%
    ]
    view = build_zgodnosc_powykonawcza_view(run, pomiary, {"napiecie_pct": 5.0, "moc_pct": 5.0})
    assert view["podsumowanie"]["najwieksza_odchylka_pct"] == pytest.approx(2.5, abs=1e-6)
    assert view["podsumowanie"]["najwieksza_odchylka_element_ref"] == "line_1"
    assert view["podsumowanie"]["najwieksza_odchylka_wielkosc"] == "P"


# --------------------------------------------------------------------------
# Parser CSV
# --------------------------------------------------------------------------


def test_csv_srednik_z_przecinkiem_dziesietnym() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka\nbus_a;U;15,35;kV\n"
    wiersze = parse_measurements_csv(csv_text)
    assert len(wiersze) == 1
    assert wiersze[0]["wartosc"] == pytest.approx(15.35)
    assert wiersze[0]["_wiersz"] == 2


def test_csv_przecinek_z_kropka_dziesietna() -> None:
    csv_text = "element_ref,wielkosc,wartosc,jednostka\nline_1,P,0.808,MW\n"
    wiersze = parse_measurements_csv(csv_text)
    assert wiersze[0]["wartosc"] == pytest.approx(0.808)


def test_csv_bledna_wartosc_daje_numer_wiersza() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka\nbus_a;U;abc;kV\n"
    with pytest.raises(ValueError, match="Wiersz 2 CSV"):
        parse_measurements_csv(csv_text)


def test_csv_zla_liczba_kolumn_daje_numer_wiersza() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka\nbus_a;U;15,3\n"
    with pytest.raises(ValueError, match="Wiersz 2 CSV"):
        parse_measurements_csv(csv_text)


def test_csv_zly_naglowek_blad() -> None:
    with pytest.raises(ValueError, match="Nagłówek CSV"):
        parse_measurements_csv("a;b;c;d\nbus_a;U;15,3;kV\n")


def test_csv_pusty_blad() -> None:
    with pytest.raises(ValueError, match="pusty"):
        parse_measurements_csv("   ")


def test_csv_end_to_end_z_serwisem() -> None:
    csv_text = "element_ref;wielkosc;wartosc;jednostka\n" "bus_a;U;15,35;kV\n" "line_1;P;0,804;MW\n"
    pomiary = parse_measurements_csv(csv_text)
    view = build_zgodnosc_powykonawcza_view(
        _standardowy_run(), pomiary, {"napiecie_pct": 1.0, "moc_pct": 1.0}
    )
    assert view["podsumowanie"]["liczba_punktow"] == 2
    assert {w["werdykt"] for w in view["wiersze"]} == {"w tolerancji"}


def test_csv_zla_wielkosc_wykrywana_przez_serwis() -> None:
    # Parser waliduje strukturę; semantyka (wielkość) w serwisie z numerem wiersza.
    csv_text = "element_ref;wielkosc;wartosc;jednostka\nbus_a;Z;15,3;kV\n"
    pomiary = parse_measurements_csv(csv_text)
    with pytest.raises(ValueError, match="wierszu 2"):
        build_zgodnosc_powykonawcza_view(_standardowy_run(), pomiary, {"napiecie_pct": 1.0})
