"""Korzeń odpływu przy JAWNYM wyłączniku głównym nN (incomer) — klasa, nie
instancja: pętla zwarcia/SWZ (`fault_loop.service`) i arkusz obwodów
(`nn_circuit_sheet`) grupują odpływy TĄ SAMĄ funkcją, więc dowód obejmuje
oba konsumenty na jednym modelu.

Defekt zmierzony (scenariusz 18 mandatu SLD nN): stacja z incomerem QF-T1
między zaciskiem nN transformatora a szyną rozdzielnicy miała JEDEN „odpływ"
— incomer — obejmujący wszystkie punkty rozdzielnicy; trzy realne odpływy
(QF-01/QF-02/FU-03) nie istniały w SWZ ani w arkuszu.
"""

from __future__ import annotations

from application.analyses.fault_loop.route import (
    bfs_paths_from,
    feeder_root_branch_ref,
    group_bus_refs_by_feeder,
    incomer_branch_refs,
)
from application.analyses.fault_loop.service import build_feeder_fault_loop_view_for_transformer
from application.analyses.nn_circuit_sheet import build_nn_circuit_sheet

from tests.application.analyses.lv_domain.scenariusze_nn import (
    scenariusz_01_single_tr,
    scenariusz_18_swz_overlay,
)


class TestIncomerNieJestOdplywem:
    def test_incomer_rozpoznany_z_topologii(self) -> None:
        enm = scenariusz_18_swz_overlay()
        station = enm.substations[0]
        assert incomer_branch_refs(enm, station.bus_refs, ["T1_zacisk"]) == frozenset({"QF-T1"})
        # Zacisk będący szyną rozdzielnicy (transformator wprost na szynie) nie
        # ma incomera — jego gałąź jest zwykłym odpływem.
        assert incomer_branch_refs(enm, ["T1_zacisk"], ["T1_zacisk"]) == frozenset()

    def test_korzen_odplywu_to_druga_galaz_za_incomerem(self) -> None:
        enm = scenariusz_18_swz_overlay()
        paths = bfs_paths_from(enm, "T1_zacisk")
        incomers = frozenset({"QF-T1"})
        assert feeder_root_branch_ref(paths["T1_zacisk"], incomers) is None
        assert feeder_root_branch_ref(paths["RGnN-1"], incomers) is None
        assert feeder_root_branch_ref(paths["QF-01_koniec"], incomers) == "QF-01"
        assert feeder_root_branch_ref(paths["FU-03_koniec"], incomers) == "FU-03"
        # Bez wiedzy o incomerze — dawne zachowanie (jedna gałąź, jeden odpływ).
        assert feeder_root_branch_ref(paths["QF-01_koniec"]) == "QF-T1"
        assert set(group_bus_refs_by_feeder(paths, incomers)) == {"QF-01", "QF-02", "FU-03"}
        assert set(group_bus_refs_by_feeder(paths)) == {"QF-T1"}

    def test_swz_liczy_odplywy_rozdzielnicy_a_nie_incomer(self) -> None:
        widok = build_feeder_fault_loop_view_for_transformer(
            scenariusz_18_swz_overlay(), "stSWZ", "T1"
        )
        assert widok["status"] == "OK"
        assert sorted(f["feeder_root_branch_ref"] for f in widok["feeders"]) == [
            "FU-03",
            "QF-01",
            "QF-02",
        ]
        for feeder in widok["feeders"]:
            assert feeder["worst_point_bus_ref"] == f"{feeder['feeder_root_branch_ref']}_koniec"

    def test_arkusz_obwodow_ma_wiersz_per_odplyw_rozdzielnicy(self) -> None:
        arkusz = build_nn_circuit_sheet(enm=scenariusz_01_single_tr(), station_ref="stC")
        assert arkusz["status"] == "OK"
        korzenie = sorted({w["feeder_root_branch_ref"] for w in arkusz["wiersze"]})
        assert "QF-T1" not in korzenie
        assert {"QF-01", "QF-02", "QF-03"} <= set(korzenie)
