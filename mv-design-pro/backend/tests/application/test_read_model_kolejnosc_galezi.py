"""Kolejność list odpowiedzi biegu (`application/analysis_run/read_model.canonicalize_json`).

Odpowiedź `GET /api/analysis-runs/{id}/snapshot` sortuje `branches` migawki. Element ENM niesie
`id` losowane przy konstrukcji modelu (uuid4) i `ref_id` — tożsamość domenową. Sortowanie po
`id` dawało kolejność gałęzi losową między dwiema budowami TEGO SAMEGO modelu (zmierzone na
fiksturze `gpzH5RezerwaJawnaBezLsSn`: pięć gałęzi w innej kolejności w każdym biegu
generatora). Iloczyn cech: lista z kluczem sortowanym {branches, nodes} × element {z `ref_id`
i losowym `id`, bez `ref_id` z `id`} × kolejność wejścia {prosta, odwrócona}.
"""

from __future__ import annotations

import uuid

import pytest
from application.analysis_run.read_model import canonicalize_json


def _galezie(kolejnosc: list[str]) -> list[dict[str, str]]:
    return [{"ref_id": ref, "id": str(uuid.uuid4()), "type": "breaker"} for ref in kolejnosc]


@pytest.mark.parametrize("klucz", ["branches", "nodes"])
@pytest.mark.parametrize("odwrocona", [False, True])
def test_elementy_z_ref_id_w_kolejnosci_ref_id_niezaleznie_od_losowego_id(
    klucz: str, odwrocona: bool
) -> None:
    refy = ["gpz/a/bay/001/001/apparatus", "gpz/a/coupler/001", "gpz/a/hv_coupler/001"]
    wejscie = list(reversed(refy)) if odwrocona else list(refy)
    # Wiele budów: losowe `id` w każdej, wynik ten sam (dawniej zależał od `id`).
    wyniki = {
        tuple(e["ref_id"] for e in canonicalize_json({klucz: _galezie(wejscie)})[klucz])
        for _ in range(20)
    }
    assert wyniki == {tuple(refy)}


def test_element_bez_ref_id_sortowany_po_id() -> None:
    wejscie = [{"id": "b", "x": 1}, {"id": "a", "x": 2}]
    assert [e["id"] for e in canonicalize_json({"branches": wejscie})["branches"]] == ["a", "b"]


def test_lista_spoza_kluczy_sortowanych_zachowuje_kolejnosc() -> None:
    wejscie = _galezie(["z", "a"])
    assert [e["ref_id"] for e in canonicalize_json({"buses": wejscie})["buses"]] == ["z", "a"]
