"""Transformator bez grupy połączeń w sieci zerowej: nazwana odmowa ``brak_danych``, nie „brak drogi”.

DLACZEGO. Transformator bez ``vector_group`` (W004) nie wchodzi do Y0 — połączenie uzwojeń
w składowej zerowej jest nieznane (``build_transformer_zero_seq_model``: zero zgadywania).
Węzeł sieci SN za takim transformatorem dostawał przyczynę ``brak_drogi`` („zwarcie doziemne
nie płynie”), czyli twierdzenie fizyczne, którego bez grupy połączeń nie da się postawić,
a węzeł uziemiony innym bocznikiem był liczony tak, jakby uzwojenie było otwarte (uzwojenie
YN z uziemionym punktem neutralnym dołożyłoby bocznik równoległy — prąd zaniżony). Teraz każda
składowa sieci zerowej stykająca się z takim transformatorem dostaje ``brak_danych``
z elementem i treścią „uzupełnij grupę połączeń” — ta sama reguła co źródło bez Z0.

ILOCZYN CECH: grupa połączeń {znana (Dyn11), brak} × liczba transformatorów równoległych
{1, 2 — drugi bez grupy} × pasmo {SN za GPZ 110/15 kV, nN za stacją 15/0,4 kV} × węzeł
{strona górna, strona dolna, za odcinkiem} × odcinek {z Z0, bez Z0 bez podstawy wartości
roboczej} × zwarcie {1F, 2F+Z}. Para predykatów: odmowa z transformatorem ⇔ W004 walidatora.
"""

from __future__ import annotations

from typing import Any

import pytest
from enm.models import EnergyNetworkModel, Transformer
from enm.validator import ENMValidator

from tests.enm.test_z0_wartosc_robocza_odcinka import _bieg_zwarcia, _odcinek, _siec, _wiersz

SZYNY = ("hv", "sn", "st")


def _model(*, pasmo: str, grupa: str | None, rownolegly: bool, odcinek_bez_z0: bool) -> Any:
    pola: dict[str, Any] = (
        {"r0_ohm_per_km": None, "x0_ohm_per_km": None, "r_ohm_per_km": 0.0}
        if odcinek_bez_z0
        else {}
    )
    enm = _siec(_odcinek("kabel", **pola), pasmo)
    tr1 = enm.transformers[0].model_copy(update={"vector_group": grupa})
    transformatory = [tr1]
    if rownolegly:
        transformatory = [
            enm.transformers[0],
            Transformer(**{**tr1.model_dump(), "ref_id": "tr2", "name": "TR równoległy"}),
        ]
    return EnergyNetworkModel(
        header=enm.header,
        buses=enm.buses,
        sources=enm.sources,
        transformers=transformatory,
        branches=enm.branches,
    )


def _oczekiwana_przyczyna(
    *, pasmo: str, szyna: str, bez_grupy: str | None, odcinek_bez_z0: bool
) -> tuple[str | None, set[str]]:
    """(przyczyna, elementy) węzła; ``None`` — węzeł liczony."""
    if szyna == "st" and odcinek_bez_z0:
        # Za odcinkiem bez Z0 i bez podstawy: odcięty — składowa styka się tylko z odcinkiem.
        return "brak_danych", {"odc1"}
    if bez_grupy is not None:
        elementy = {bez_grupy}
        if szyna == "sn" and odcinek_bez_z0 and bez_grupy != "tr2":
            # Strona dolna bez innego uziemienia (przy dwóch transformatorach uziemia ją
            # uzwojenie YN transformatora z grupą): oba braki danych w jednym zdaniu.
            elementy.add("odc1")
        return "brak_danych", elementy
    if szyna == "hv" and pasmo == "nN":
        # Szyna SN stacji: źródło w paśmie SN nie niesie Z0, uzwojenie D, brak zespołu
        # uziemiającego — sieć SN z punktem neutralnym izolowanym; prąd doziemienia jest prądem
        # pojemnościowym, poza zakresem IEC 60909-0 (warunek odbioru właściciela 2026-10-29,
        # dokument karty §3.17; dawniej ``brak_drogi`` z modelu Z1+Z2+Z0).
        return "poza_zakresem_iec60909", set()
    return None, set()


@pytest.mark.parametrize("rodzaj_zwarcia", ["1F", "2FG"])
@pytest.mark.parametrize("odcinek_bez_z0", [False, True], ids=["odcinek_z0", "odcinek_bez_z0"])
@pytest.mark.parametrize(
    ("grupa", "rownolegly"),
    [("Dyn11", False), (None, False), (None, True)],
    ids=["grupa_znana", "bez_grupy", "rownolegly_bez_grupy"],
)
@pytest.mark.parametrize("pasmo", ["SN", "nN"])
def test_transformator_bez_grupy_daje_brak_danych_w_kazdej_stycznej_skladowej(
    pasmo: str, grupa: str | None, rownolegly: bool, odcinek_bez_z0: bool, rodzaj_zwarcia: str
) -> None:
    enm = _model(pasmo=pasmo, grupa=grupa, rownolegly=rownolegly, odcinek_bez_z0=odcinek_bez_z0)
    bez_grupy = None if grupa else ("tr2" if rownolegly else "tr1")
    run = _bieg_zwarcia(enm, rodzaj_zwarcia)
    for szyna in SZYNY:
        wiersz = _wiersz(run, szyna)
        przyczyna, elementy = _oczekiwana_przyczyna(
            pasmo=pasmo, szyna=szyna, bez_grupy=bez_grupy, odcinek_bez_z0=odcinek_bez_z0
        )
        brak = wiersz.get("brak_wyniku_zerowego")
        if przyczyna is None:
            assert brak is None, (szyna, brak)
            assert wiersz["ikss_a"] is not None and wiersz["ikss_a"] > 0.0
            continue
        assert wiersz["ikss_a"] is None, szyna
        assert brak["przyczyna"] == przyczyna, (szyna, brak)
        assert set(brak["elementy"]) == elementy, (szyna, brak)
        zdanie = brak["wyjasnienie"]["zdanie_pl"]
        if bez_grupy in elementy:
            assert "Transformator bez grupy połączeń" in zdanie
            assert "Uzupełnij grupę połączeń transformatora" in zdanie
            assert any("grupa połączeń" in c for c in brak["wyjasnienie"]["czego_brakuje"])
        if "odc1" in elementy:
            assert "Uzupełnij R′0 i X′0 gałęzi" in zdanie
        if przyczyna == "brak_danych":
            assert "zwarcie doziemne nie płynie" not in zdanie


@pytest.mark.parametrize("pasmo", ["SN", "nN"])
@pytest.mark.parametrize("grupa", ["Dyn11", None])
def test_odmowa_transformatora_bez_grupy_ma_pare_w004(pasmo: str, grupa: str | None) -> None:
    """Predykaty parami: wiersz z odmową transformatora ⇔ walidator zgłasza W004 tego
    transformatora (oba czytają brak ``vector_group``)."""
    enm = _model(pasmo=pasmo, grupa=grupa, rownolegly=False, odcinek_bez_z0=False)
    w004 = [i for i in ENMValidator().validate(enm).issues if i.code == "W004"]
    run = _bieg_zwarcia(enm, "1F")
    odmowy_trafo = {
        szyna
        for szyna in SZYNY
        if "tr1" in ((_wiersz(run, szyna).get("brak_wyniku_zerowego") or {}).get("elementy") or ())
    }
    assert bool(w004) is (grupa is None)
    assert bool(odmowy_trafo) is (grupa is None)
    assert all(i.element_refs == ["tr1"] for i in w004)


def test_odmowa_transformatora_bez_grupy_deterministyczna() -> None:
    enm = _model(pasmo="SN", grupa=None, rownolegly=True, odcinek_bez_z0=True)
    pierwszy = _bieg_zwarcia(enm, "1F").raw_result["results"]
    drugi = _bieg_zwarcia(enm, "1F").raw_result["results"]
    assert pierwszy == drugi
