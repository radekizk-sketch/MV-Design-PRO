"""Operacje dzielące/scalające odcinek MELDUJĄ brak danych, zamiast je zmyślać.

PO CO TEN PLIK (pomiar, nie przekonanie). Sześć operacji ENM budowało nową
gałąź z odcinka istniejącego i czytało jego fizykę z wartością zastępczą:
``segment.get("r_ohm_per_km", 0.0)``, ``segment.get("x_ohm_per_km", 0.0)``,
``segment.get("length_km", 1.0)``. Odcinek bez tych danych stawał się więc
kablem o impedancji jednostkowej ZERO (idealny zwieracz wchodzący wprost do
prądu zwarciowego i spadku napięcia) albo kablem o długości 1 km wziętej
znikąd — bez jednego ostrzeżenia i nieodróżnialnie od pomiaru. `length_km`,
`r_ohm_per_km` i `x_ohm_per_km` są w `enm/models.py` polami WYMAGANYMI,
więc rekord bez nich nie jest odcinkiem sieci, tylko rekordem uszkodzonym.

DLACZEGO ILOCZYN CECH, A NIE JEDEN PRZYPADEK (CLAUDE.md, reguła KLASA §2).
Defekt chował się w trzech niezależnych osiach i test, który sprawdza jedną,
nie widzi pozostałych:
  * OŚ OPERACJI — pięć operacji czytało tę samą daną osobnym wyrażeniem,
  * OŚ POLA — trzy różne pola, każde z własną wartością zastępczą,
  * OŚ ODCINKA (tylko scalenie) — scalenie czytało R/X WYŁĄCZNIE z odcinka A,
    więc brak danej w odcinku B był NIEWYKRYWALNY testem na odcinku A.
    Ta oś jest w tym pliku najważniejsza: to ona pokazuje różnicę między
    naprawą instancji a naprawą klasy.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.domain_operations import execute_domain_operation, insert_station_on_segment_sn
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

REF_KABEL_NN = "kab_nn_4x120_al"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
WYLACZNIK = "sw-cb-abb-vd4-17kv-630a"

#: Pola WYMAGANE `Cable`/`OverheadLine` — pełna oś "pole" tego iloczynu.
POLA_WYMAGANE = ("length_km", "r_ohm_per_km", "x_ohm_per_km")


# ---------------------------------------------------------------------------
# Sieć nN: split / merge
# ---------------------------------------------------------------------------


def _snapshot_z_odcinkiem_nn() -> tuple[dict[str, Any], str]:
    """RGnN + jeden odcinek kabla nN (100 m) — punkt wyjścia dla split/merge."""
    pusty = EnergyNetworkModel(
        header=ENMHeader(name="brak-fizyki", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    wynik = execute_domain_operation(pusty, "add_nn_distribution_board", {"voltage_kv": 0.4})
    assert not wynik.get("error"), wynik
    snapshot = wynik["snapshot"]
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") == "rozdzielnica_nn")
    wynik = execute_domain_operation(
        snapshot,
        "add_nn_cable_segment",
        {
            "from_bus_ref": stacja["bus_refs"][0],
            "length_m": 100.0,
            "catalog_ref": REF_KABEL_NN,
            "name": "Odcinek",
        },
    )
    assert not wynik.get("error"), wynik
    snapshot = wynik["snapshot"]
    return snapshot, snapshot["branches"][-1]["ref_id"]


def _usun_pole(snapshot: dict[str, Any], branch_ref: str, pole: str) -> dict[str, Any]:
    """Usuwa JEDNO wymagane pole z gałęzi — tak wygląda rekord uszkodzony.

    Nie da się tego zbudować walidatorem (pole jest wymagane), a dokładnie taki
    ładunek dociera z importu, z migracji i ze starszej migawki projektu.
    """
    for galaz in snapshot["branches"]:
        if galaz["ref_id"] == branch_ref:
            assert pole in galaz, f"fikstura nie niesie '{pole}' — test nic by nie mierzył"
            del galaz[pole]
            return snapshot
    raise AssertionError(f"brak gałęzi {branch_ref}")


@pytest.mark.parametrize("pole", POLA_WYMAGANE)
def test_split_nn_bez_wymaganego_pola_melduje_brak(pole: str) -> None:
    snapshot, segment_ref = _snapshot_z_odcinkiem_nn()
    snapshot = _usun_pole(snapshot, segment_ref, pole)

    wynik = execute_domain_operation(
        snapshot, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": 40.0}
    )

    assert wynik.get("error_code") == "nn.split_segment_missing_physics"
    assert pole in wynik["error"]
    assert wynik.get("snapshot") is None


def _rozciety_nn() -> tuple[dict[str, Any], str, str]:
    snapshot, segment_ref = _snapshot_z_odcinkiem_nn()
    wynik = execute_domain_operation(
        snapshot, "split_nn_segment", {"segment_ref": segment_ref, "split_at_m": 40.0}
    )
    assert not wynik.get("error"), wynik
    snapshot = wynik["snapshot"]
    lewy = next(b for b in snapshot["branches"] if b.get("name") == "Odcinek (A)")
    prawy = next(b for b in snapshot["branches"] if b.get("name") == "Odcinek (B)")
    return snapshot, lewy["ref_id"], prawy["ref_id"]


@pytest.mark.parametrize("pole", POLA_WYMAGANE)
@pytest.mark.parametrize("ktory", ["a", "b"])
def test_merge_nn_bez_wymaganego_pola_melduje_brak(pole: str, ktory: str) -> None:
    """OŚ ODCINKA — wariant ``b`` jest dowodem naprawy KLASY, nie instancji.

    Scalenie czytało R/X wyłącznie z odcinka A, więc przed naprawą wariant
    ``b`` przechodził "na zielono", produkując kabel z impedancją odcinka A
    rozciągniętą na sumę długości obu odcinków.
    """
    snapshot, ref_a, ref_b = _rozciety_nn()
    snapshot = _usun_pole(snapshot, ref_a if ktory == "a" else ref_b, pole)

    wynik = execute_domain_operation(
        snapshot, "merge_nn_segments", {"segment_a_ref": ref_a, "segment_b_ref": ref_b}
    )

    assert wynik.get("error_code") == "nn.merge_segment_missing_physics"
    assert pole in wynik["error"]
    assert wynik.get("snapshot") is None


def test_merge_nn_odrzuca_rozne_impedancje_jednostkowe() -> None:
    """PREDYKATY PARAMI (reguła KLASA §3): warunek wejścia (ta sama pozycja
    katalogowa) i warunek wyjścia (impedancja scalonego kabla) muszą pochodzić
    z jednego źródła prawdy. Gdy R/km odcinków się różni, scalona gałąź nie
    może wyrazić obu naraz — i to jest błąd operacji, nie cicha kopia z A."""
    snapshot, ref_a, ref_b = _rozciety_nn()
    for galaz in snapshot["branches"]:
        if galaz["ref_id"] == ref_b:
            galaz["r_ohm_per_km"] = galaz["r_ohm_per_km"] * 2.0

    wynik = execute_domain_operation(
        snapshot, "merge_nn_segments", {"segment_a_ref": ref_a, "segment_b_ref": ref_b}
    )

    assert wynik.get("error_code") == "nn.merge_impedance_mismatch"
    assert wynik.get("snapshot") is None


def test_merge_nn_scala_gdy_komplet_danych_sie_zgadza() -> None:
    """Strona pozytywna — bez niej powyższe testy przechodziłyby też wtedy,
    gdyby scalenie zostało zepsute i odrzucało WSZYSTKO."""
    snapshot, ref_a, ref_b = _rozciety_nn()
    wynik = execute_domain_operation(
        snapshot, "merge_nn_segments", {"segment_a_ref": ref_a, "segment_b_ref": ref_b}
    )
    assert not wynik.get("error"), wynik
    scalony = wynik["snapshot"]["branches"][-1]
    assert scalony["length_km"] == pytest.approx(0.1)
    assert scalony["r_ohm_per_km"] > 0.0
    assert scalony["x_ohm_per_km"] > 0.0


# ---------------------------------------------------------------------------
# Sieć SN: wcięcie stacji w odcinek
# ---------------------------------------------------------------------------


def _enm_sn_z_odcinkiem() -> dict[str, Any]:
    return {
        "header": {"name": "brak-fizyki-sn"},
        "buses": [
            {"ref_id": "bus-a", "name": "A", "voltage_kv": 15.0},
            {"ref_id": "bus-b", "name": "B", "voltage_kv": 15.0},
        ],
        "branches": [
            {
                "ref_id": "seg-1",
                "name": "Odcinek",
                "type": "cable",
                "from_bus_ref": "bus-a",
                "to_bus_ref": "bus-b",
                "length_km": 1.0,
                "r_ohm_per_km": 0.2,
                "x_ohm_per_km": 0.1,
            }
        ],
        "transformers": [],
        "corridors": [],
    }


@pytest.mark.parametrize("pole", POLA_WYMAGANE)
def test_wciecie_stacji_sn_bez_wymaganego_pola_melduje_brak(pole: str) -> None:
    enm = _enm_sn_z_odcinkiem()
    del enm["branches"][0][pole]

    wynik = insert_station_on_segment_sn(
        enm,
        {
            "segment_id": "seg-1",
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT", "TR"],
            "field_apparatus_catalog_ref": WYLACZNIK,
            "transformer": {"create": True, "transformer_catalog_ref": TRAFO},
        },
    )

    assert wynik.get("error_code") == "station.insert.segment_missing_physics"
    assert pole in wynik["error"]
    assert wynik.get("snapshot") is None
