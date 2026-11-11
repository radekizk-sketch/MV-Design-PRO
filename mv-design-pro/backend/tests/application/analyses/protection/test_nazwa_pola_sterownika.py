"""Identyfikacja wiersza tabel rodzin zabezpieczeń (karta EKRANY-EAZ-ZIEMNOZWARCIOWE).

Wiersz rodziny ziemnozwarciowej i rodziny nadprądowej 50/51 nazywa pole przez
``nazwa_pola_sterownika``. Sieć złota G08 ma w każdej z czterech stacji pola o tych samych
nazwach („Pole liniowe wejściowe 1” w S01…S04) — sama nazwa pola dawała wiersze nie do
odróżnienia na ekranie i w raporcie. Iloczyn cech: {nazwa jednoznaczna, nazwa powtarzalna}
× {kontener: stacja, rozdzielnica odgałęźna} × {rodzina ziemnozwarciowa, rodzina 50/51}.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from application.analyses.protection.ocena_ziemnozwarciowa import nazwa_pola_sterownika
from enm.models import BranchPointSN, EnergyNetworkModel
from enm.store import get_enm

from tests.application.analyses.protection.test_rodzina_nadpradowa import _koordynacja
from tests.reference_networks.scena_doziemienia import scena_z_nastawami

_SKRYPT = Path(__file__).resolve().parents[4] / "scripts" / "eksport_fixtur_harnessu.py"
_spec = importlib.util.spec_from_file_location("eksport_fixtur_harnessu_nazwy", _SKRYPT)
assert _spec is not None and _spec.loader is not None
eksport = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(eksport)


def _model_g08() -> EnergyNetworkModel:
    with eksport._biegi_sceny_koordynacja():
        return get_enm(eksport.CASE_ID_HARNESSU)


def test_nazwa_jednoznaczna_bez_dopisku() -> None:
    enm = EnergyNetworkModel.model_validate(scena_z_nastawami("KOMPENSOWANY_AWSC"))
    pola = {b.ref_id: b.name for b in enm.bays}
    sprawdzone = 0
    for a in enm.protection_assignments:
        if a.bay_ref in pola:
            assert nazwa_pola_sterownika(enm, a) == pola[a.bay_ref]
            sprawdzone += 1
    assert sprawdzone >= 3


def test_nazwa_powtarzalna_ze_stacja() -> None:
    enm = _model_g08()
    stacje = {s.ref_id: s.name for s in enm.substations}
    pola = {b.ref_id: b for b in enm.bays}
    nazwy = []
    for a in enm.protection_assignments:
        pole = pola.get(a.bay_ref or "")
        if pole is None:
            continue
        powtorzona = sum(1 for b in enm.bays if b.name == pole.name) > 1
        assert powtorzona, "scena G08: nazwy pól powtarzają się między stacjami"
        assert nazwa_pola_sterownika(enm, a) == f"{pole.name} — {stacje[pole.substation_ref]}"
        nazwy.append(nazwa_pola_sterownika(enm, a))
    assert len(nazwy) >= 12 and len(set(nazwy)) == len(nazwy)


def test_nazwa_powtarzalna_z_rozdzielnica_odgaleziona() -> None:
    enm = _model_g08()
    a = next(x for x in enm.protection_assignments if x.bay_ref)
    pole = next(b for b in enm.bays if b.ref_id == a.bay_ref)
    zksn = BranchPointSN(
        ref_id="bp-zksn-1",
        name="ZKSN Leśna",
        branch_point_type="zksn",
        parent_segment_id="seg-x",
        bus_ref=pole.bus_ref,
    )
    pole_zksn = pole.model_copy(update={"substation_ref": None, "branch_point_ref": "bp-zksn-1"})
    enm = enm.model_copy(
        update={
            "bays": [pole_zksn if b.ref_id == pole.ref_id else b for b in enm.bays],
            "branch_points": [*enm.branch_points, zksn],
        }
    )
    assert nazwa_pola_sterownika(enm, a) == f"{pole.name} — ZKSN Leśna"
    # Kontener nieobecny w modelu: sama nazwa pola (bez zmyślonego dopisku).
    bez = enm.model_copy(update={"branch_points": []})
    assert nazwa_pola_sterownika(bez, a) == pole.name


def test_obie_rodziny_identyfikuja_pole_jednoznacznie() -> None:
    dane = _koordynacja()["dict"]
    for rodzina in ("nadpradowe", "ziemnozwarciowe"):
        wiersze = dane[rodzina]["wiersze"]
        assert wiersze, rodzina
        urzadzenia_nazwy: dict[str, set[str]] = {}
        for w in wiersze:
            urzadzenia_nazwy.setdefault(w["pole_pl"], set()).add(w["urzadzenie_ref"])
        assert all(len(u) == 1 for u in urzadzenia_nazwy.values()), (rodzina, urzadzenia_nazwy)
        assert any(" — Stacja " in w["pole_pl"] for w in wiersze), rodzina
