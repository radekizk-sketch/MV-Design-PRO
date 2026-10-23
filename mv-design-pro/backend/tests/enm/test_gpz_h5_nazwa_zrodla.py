"""Nazwa źródła 110 kV GPZ H5 (`add_grid_source_sn`, tryb ze stroną 110 kV).

Kontrakt: nazwą źródła jest nazwa toru (linii 110 kV, `supply.line_name`) albo nazwa nadana
jawnie (`supply.name`); stacja zasilająca zostaje WYŁĄCZNIE w `supplying_station_name`
(schemat rysuje ją jako „kier. …"), a `meta.source_id` niesie tożsamość GPZ (unikalność
kolejnego GPZ), wspólną dla wszystkich równoważników. Dawniej nazwa domyślna sklejała linię
i stację („L1 (Stacja zasilająca A — …)"), co dublowało dane i dawało tabliczce źródła tekst
nie mieszczący się w kadrze. Iloczyn cech: nazwa {domyślna, nadana} × tor {L1, L2}.
"""

from __future__ import annotations

import pytest

from tests.reference_networks.gpz_h5 import TOR_L1, TOR_L2, _operacja, ladunek_h5, pusty_model, refy


def _zrodla(nadane: dict[int, str]) -> dict[str, dict]:
    ladunek = ladunek_h5()
    for indeks, nazwa in nadane.items():
        ladunek["hv_sections"][indeks]["supply"]["name"] = nazwa
    enm = _operacja(pusty_model(), "add_grid_source_sn", ladunek)
    r = refy(enm)
    po_refie = {s["ref_id"]: s for s in enm["sources"]}
    return {"L1": po_refie[r.zrodlo_l1], "L2": po_refie[r.zrodlo_l2]}


@pytest.mark.parametrize("tor", [TOR_L1, TOR_L2], ids=["L1", "L2"])
def test_nazwa_domyslna_to_nazwa_toru_a_stacja_osobno(tor: tuple[str, str, float, float]) -> None:
    linia, stacja, _, _ = tor
    zrodlo = _zrodla({})[linia]
    assert zrodlo["name"] == linia
    assert zrodlo["supply_line_name"] == linia
    assert zrodlo["supplying_station_name"] == stacja
    assert stacja not in zrodlo["name"]
    assert zrodlo["meta"]["source_id"] == "GPZ H5 110/15 kV"


@pytest.mark.parametrize("indeks,tor", [(0, "L1"), (1, "L2")], ids=["L1", "L2"])
def test_nazwa_nadana_wygrywa_z_nazwa_toru(indeks: int, tor: str) -> None:
    zrodla = _zrodla({indeks: f"Równoważnik {tor} — nazwa projektanta"})
    assert zrodla[tor]["name"] == f"Równoważnik {tor} — nazwa projektanta"
    drugi = "L2" if tor == "L1" else "L1"
    assert zrodla[drugi]["name"] == drugi
