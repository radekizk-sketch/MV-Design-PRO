"""Rekordy doboru kompensacji (karta WERDYKT-MIGRACJA-190, D18).

Dawniej kandydat niósł gołe flagi ``spelnia_dzien`` / ``spelnia_noc`` / ``spelnia`` (cosφ
``None`` dawało po cichu „nie spełnia”, a ekran pisał „spełnia / nie spełnia” bez limitu
i marginesu). Teraz kandydat niesie rekord W nad składowymi K dnia i nocy, a dobór czyta
rozstrzygnięcie liczbowe TEGO SAMEGO rekordu.

Iloczyn cech: zakres scenariuszy (sam dzień, dzień i noc) × stan składowej dnia × stan
składowej nocy, gdzie stan ∈ {spełnia, nie spełnia, bez wyniku z każdym z trzech powodów}.
Predykaty parami: rekord W ``NIE_SPELNIA`` ⇔ choć jedna składowa naruszona; dobór ⇔ każda
składowa spełniona na liczbach; składowa bez wyniku ⇒ nigdy ``SPELNIA`` i powód w brakach.
"""

from __future__ import annotations

import itertools
from typing import Any

import pytest
from application.analyses import dobor_kompensacji
from application.analyses.dobor_kompensacji import (
    _POWOD_BEZ_GALEZI,
    _POWOD_NIEZBIEZNOSCI,
    _POWOD_ODMOWY,
    _pusty_pomiar,
    build_compensation_sizing_view,
)
from application.analyses.dobor_kompensacji_oceny import (
    nierozstrzygniety,
    oceny_kandydata,
    spelnia_liczbowo,
)

from tests.application.analyses.test_dobor_kompensacji_service import (
    _compensation_enm,
    _golden_run,
    _run,
)

_WYMAGANY = 0.95
_STANY: dict[str, dict[str, Any]] = {
    "spelnia": {"cosfi_punktu": 0.97},
    "na_granicy": {"cosfi_punktu": _WYMAGANY},
    "nie_spelnia": {"cosfi_punktu": 0.91},
    "odmowa": _pusty_pomiar(_POWOD_ODMOWY),
    "niezbiezny": _pusty_pomiar(_POWOD_NIEZBIEZNOSCI),
    "bez_galezi": _pusty_pomiar(_POWOD_BEZ_GALEZI),
}
_BEZ_WYNIKU = {"odmowa", "niezbiezny", "bez_galezi"}
_SPELNIONE = {"spelnia", "na_granicy"}


def _rekord(dzien: str, noc: str | None) -> Any:
    return oceny_kandydata(
        bus_ref="bus_pcc",
        nazwa_szyny_pl="Szyna „PCC”",
        nazwa_baterii_pl="Bateria próbna",
        dzien=_STANY[dzien],
        noc=None if noc is None else _STANY[noc],
        cos_phi_min=_WYMAGANY,
    )


_PRZYPADKI = [(d, None) for d in _STANY] + list(itertools.product(_STANY, _STANY))


@pytest.mark.parametrize(("dzien", "noc"), _PRZYPADKI)
def test_rekord_w_i_predykat_doboru_parami(dzien: str, noc: str | None) -> None:
    rekord = _rekord(dzien, noc)
    stany = [dzien] if noc is None else [dzien, noc]
    skladowe = rekord.oceny_skladowe
    assert [o.kryterium_id for o in skladowe] == [
        f"kompensacja.cosfi_punktu.{s}" for s in ("dzien", "noc")[: len(stany)]
    ]
    for stan, ocena in zip(stany, skladowe, strict=True):
        if stan in _BEZ_WYNIKU:
            # Brak wyniku ≠ spełnia: NIE_OCENIONO z powodem pomiaru w brakach.
            assert ocena.status_maszynowy == "NIE_OCENIONO"
            assert _STANY[stan]["powod_braku_pl"] in ocena.wyjasnienie.czego_brakuje
        elif stan in _SPELNIONE:
            assert ocena.status_maszynowy == "SPELNIA"
            assert ocena.limit is not None and ocena.limit.wartosc is not None
            assert ocena.limit.wartosc.wartosc == _WYMAGANY
        else:
            assert ocena.status_maszynowy == "NIE_SPELNIA"
        assert ocena.wyjasnienie.zdanie_pl
    naruszony = any(s == "nie_spelnia" for s in stany)
    assert (rekord.status_maszynowy == "NIE_SPELNIA") is naruszony
    assert spelnia_liczbowo(rekord) is all(s in _SPELNIONE for s in stany)
    assert nierozstrzygniety(rekord) is (not naruszony and any(s in _BEZ_WYNIKU for s in stany))
    if not spelnia_liczbowo(rekord):
        assert rekord.status_maszynowy not in {"SPELNIA", "BRAK_DOWODU"}


@pytest.mark.parametrize("noc", [False, True])
def test_dobor_jest_pierwszym_kandydatem_spelniajacym_z_rekordu(noc: bool) -> None:
    widok = build_compensation_sizing_view(
        _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0)),
        bus_ref="bus_pcc",
        cos_phi_min=0.90,
        uwzglednij_noc=noc,
    )
    statusy = [
        [o["status_maszynowy"] for o in c["wymaganie"]["oceny_skladowe"]]
        for c in widok["candidates"]
    ]
    spelniajace = [i for i, s in enumerate(statusy) if all(x == "SPELNIA" for x in s)]
    assert spelniajace, "fikstura musi mieć kandydata spełniającego"
    assert widok["dobor"]["catalog_ref"] == widok["candidates"][spelniajace[0]]["catalog_ref"]
    for c in widok["candidates"]:
        assert c["wymaganie"]["etykieta"]["etykieta_pl"]
        assert c["wymaganie"]["wyjasnienie"]["zdanie_pl"]


def test_kandydat_bez_wyniku_nocy_nie_jest_liczony_jako_niespelniajacy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Noc bez rozwiązania rozpływu: żaden kandydat nie jest dobrany, a powód braku doboru mówi
    o kandydatach bez wyznaczonego cosφ, nie o „niespełnieniu”."""
    oryginal = dobor_kompensacji._point_cos_phi

    def _bez_nocy(*args: Any, **kwargs: Any) -> dict[str, Any]:
        if kwargs.get("night"):
            return _pusty_pomiar(_POWOD_NIEZBIEZNOSCI)
        return oryginal(*args, **kwargs)

    monkeypatch.setattr(dobor_kompensacji, "_point_cos_phi", _bez_nocy)
    widok = build_compensation_sizing_view(
        _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0)),
        bus_ref="bus_pcc",
        cos_phi_min=0.90,
        uwzglednij_noc=True,
    )
    assert widok["dobor"] is None
    n = len(widok["candidates"])
    assert f"dla {n} z {n} kandydatów cosφ punktu nie wyznaczono" in widok["powod_braku"]
    for c in widok["candidates"]:
        noc = c["wymaganie"]["oceny_skladowe"][1]
        assert noc["status_maszynowy"] == "NIE_OCENIONO"
        assert _POWOD_NIEZBIEZNOSCI in noc["wyjasnienie"]["czego_brakuje"]
        assert c["wymaganie"]["status_maszynowy"] != "SPELNIA"


def test_rekordy_deterministyczne() -> None:
    a = build_compensation_sizing_view(_golden_run(), bus_ref="bus_sn_c", cos_phi_min=0.999)
    b = build_compensation_sizing_view(_golden_run(), bus_ref="bus_sn_c", cos_phi_min=0.999)
    assert [c["wymaganie"] for c in a["candidates"]] == [c["wymaganie"] for c in b["candidates"]]
