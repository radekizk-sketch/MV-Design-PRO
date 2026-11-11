"""Pola GPZ Z.7, Z.12, Z.16 zgodne z OBRAZEM STRONY źródła — tabela zapisana literalnie.

Źródło: ENEA Operator, „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje dwutransformatorowe
110 kV/SN”, wersja 02.2023 – 2 (PDF SHA-256 467547d5b32bdad0534208f3870484f48663a862368b49b27c6ce
92f164ba488); strona fizyczna = załącznik: s.86 = Z.7, s.92 = Z.12, s.96 = Z.16. Tabele niżej
przepisano z wycinków obrazu strony w 200 dpi (karta POLA-GPZ-SZABLONY, 2026-11-05), NIE z kodu
— wyrocznia jest niezależna od danych szablonu. Raport porównania i lista rozbieżności
wtórnego odczytu: `docs/standards/ENEA_Z1_110KV_SOURCE_VERIFICATION.md`.

Rozbieżności wtórnego odczytu poprawione kartą (każda przypięta asercją niżej):
* Z.7: ARN (90) mierzy z uzwojenia III przekładnika T3 (nie II) i z rdzenia II przez blok
  „Pomiary lokalne str. SN”; uzwojenia I i II T3 mają odbiorniki (nie „niepodłączone”);
* Z.7: obwody okrężne „Blokowanie ZS” i „Pobudzenie LRW” są WEJŚCIAMI pola transformatora,
  „WZS” — wyjściem; ZS i LRW działają na OW1 (nie OW1 i OW2); OW2 zasila wejście „OW2 od
  zabezpieczeń str. 110 kV”;
* Z.7: rdzeń I przekładnika prądowego zasila układ pomiarowy BILANSOWO-KONTROLNY (nie
  rozliczeniowy);
* Z.12, Z.16: blok „Zab. ziemnozw.” ma znak kierunku i obwód „Z,Zz” — funkcja kierunkowa 67N;
* Z.16: U> mierzy z obwodu okrężnego „UL1,UL2,UL3,N, Pom.en.” (nie z przekładnika
  międzyfazowego T4), rdzeń III zasila blok ziemnozwarciowy (z rysunku, nie z interpretacji);
* wszystkie trzy: napęd łącznika trójpołożeniowego — znak na rysunku (nie przeniesiony z Z.10).
"""

from __future__ import annotations

import pytest
from network_model.catalog.bay_templates import (
    BAY_TEMPLATE_REGISTRY,
    UZWOJENIA_VT_POLA_TRANSFORMATORA_Z7,
)
from network_model.catalog.mv_auxiliary_catalog import get_all_ct_types
from network_model.catalog.obwody_wtorne_pola import (
    OBWODY_WTORNE_POL_GPZ,
    ObwodyWtornePola,
    PowiazanieFunkcjiEaz,
    SygnalPola,
    WejscieFunkcjiEaz,
)
from pydantic import ValidationError

Z7 = "bay_template_gpz_transformator_sn_enea_z7"
Z12 = "bay_template_gpz_lacznik_szyn_enea_z12"
Z16 = "bay_template_gpz_bateria_kondensatorow_enea_z16"


def _wejscia(p: PowiazanieFunkcjiEaz) -> list[tuple[str, object]]:
    return [(w.aparat or "SYGNAL", w.numer if w.aparat else w.sygnal) for w in p.wejscia]


#: Funkcja → (wejścia, wyjścia) przepisane z rysunku.
TABELA = {
    Z7: {
        "51": ([("T1", 4)], ["OW1"]),
        "50": ([("T1", 4)], ["OW1"]),
        "ZS": (
            [("T1", 4), ("SYGNAL", "Blokowanie ZS"), ("SYGNAL", "OW od ZS do łącznika szyn")],
            ["OW1", "WZS", "Zadziałanie Izs>> od łącznika szyn"],
        ),
        "50BF": ([("SYGNAL", "Pobudzenie LRW")], ["OW1"]),
        "87T": ([("T1", 3)], ["OW2"]),
        "90": ([("T1", 2), ("T3", 3)], ["Regulacja zaczepów"]),
    },
    Z12: {
        "51": ([("T1", 1)], ["OW1", "OW2"]),
        "50": ([("T1", 1)], ["OW1", "OW2"]),
        "51N": ([("T1", 2)], ["OW1", "OW2"]),
        "67N": ([("T1", 2), ("SYGNAL", "Z, Zz")], ["OW1", "OW2"]),
        "ZS": ([("T1", 1)], ["Blokowanie ZS"]),
        "50BF": ([("T1", 1)], ["OW1", "OW2", "Pobudzenie LRW"]),
    },
    Z16: {
        "51": ([("T1", 2)], ["OW1", "OW2"]),
        "50": ([("T1", 2)], ["OW1", "OW2"]),
        "51N": ([("T1", 3)], ["OW1", "OW2"]),
        "67N": ([("T1", 3), ("SYGNAL", "Z, Zz")], ["OW1", "OW2"]),
        "60N": ([("T6", None)], ["OW1", "OW2"]),
        "59": ([("SYGNAL", "UL1, UL2, UL3, N, Pom. en.")], ["OW1", "OW2"]),
        "ZS": ([("T1", 2)], ["OW1", "OW2", "Blokowanie ZS"]),
        "50BF": ([("T1", 2)], ["OW1", "OW2", "Pobudzenie LRW"]),
    },
}

#: Sygnały: nazwa → kierunek (grot strzałki na rysunku).
KIERUNKI = {
    Z7: {
        "OW1": "WYJSCIE",
        "OW2": "WYJSCIE",
        "ZW": "WYJSCIE",
        "Zadziałanie Izs>> od łącznika szyn": "WYJSCIE",
        "OW od ZS do łącznika szyn": "WEJSCIE",
        "Blokowanie SZR": "WYJSCIE",
        "OW od SZR": "WEJSCIE",
        "ZW od SZR": "WEJSCIE",
        "OW2 od zabezpieczeń str. 110 kV": "WEJSCIE",
        "OW od zabezpieczeń str. 110 kV": "WEJSCIE",
        "ZW sterownikiem str. 110 kV": "WEJSCIE",
        "OW sterownikiem str. 110 kV": "WEJSCIE",
        "Wyłączenie pól SN z generacją": "WYJSCIE",
        "Topologia": "WEJSCIE",
        "Zasilanie": "WEJSCIE",
        "SSiN": "WYJSCIE",
        "Łącze inżynierskie": "WYJSCIE",
        "+AwUp": "WEJSCIE",
        "Up": "WYJSCIE",
        "Aw": "WYJSCIE",
        "Al": "WYJSCIE",
        "Pobudzenie LRW": "WEJSCIE",
        "WZS": "WYJSCIE",
        "Blokowanie ZS": "WEJSCIE",
        # Jedyny sygnał spoza rysunku (wyjście ARN) — interpretacja, sprawdzana niżej.
        "Regulacja zaczepów": "WYJSCIE",
    },
    Z12: {
        "OW1": "WYJSCIE",
        "OW2": "WYJSCIE",
        "ZW": "WYJSCIE",
        "Topologia": "WEJSCIE",
        "Zasilanie": "WEJSCIE",
        "SSiN": "WYJSCIE",
        "Łącze inżynierskie": "WYJSCIE",
        "+AwUp": "WEJSCIE",
        "Up": "WYJSCIE",
        "Aw": "WYJSCIE",
        "Al": "WYJSCIE",
        "UL1, UL2, UL3, N": "WEJSCIE",
        "Pobudzenie LRW": "WYJSCIE",
        "Blokowanie ZS": "WYJSCIE",
        "Z, Zz": "WEJSCIE",
    },
    Z16: {
        "OW1": "WYJSCIE",
        "OW2": "WYJSCIE",
        "ZW": "WYJSCIE",
        "Sterowanie zegarem": "WEJSCIE",
        "Topologia": "WEJSCIE",
        "Zasilanie": "WEJSCIE",
        "SSiN": "WYJSCIE",
        "Łącze inżynierskie": "WYJSCIE",
        "Wył. od zab. TR": "WEJSCIE",
        "+AwUp": "WEJSCIE",
        "Up": "WYJSCIE",
        "Aw": "WYJSCIE",
        "Al": "WYJSCIE",
        "Pobudzenie LRW": "WYJSCIE",
        "Blokowanie ZS": "WYJSCIE",
        "UL1, UL2, UL3, N, Pom. en.": "WEJSCIE",
        "Z, Zz": "WEJSCIE",
    },
}


@pytest.mark.parametrize("szablon_id", [Z7, Z12, Z16])
def test_funkcje_wejscia_i_wyjscia_wg_rysunku(szablon_id: str) -> None:
    obwody = BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne
    assert obwody is not None
    assert {p.funkcja: (_wejscia(p), p.wyjscia) for p in obwody.powiazania} == TABELA[szablon_id]
    assert BAY_TEMPLATE_REGISTRY[szablon_id].funkcje_eaz == list(TABELA[szablon_id])


@pytest.mark.parametrize("szablon_id", [Z7, Z12, Z16])
def test_sygnaly_i_kierunki_wg_grotow_strzalek(szablon_id: str) -> None:
    obwody = BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne
    assert obwody is not None
    assert {s.nazwa: s.kierunek for s in obwody.sygnaly} == KIERUNKI[szablon_id]


@pytest.mark.parametrize("szablon_id", [Z7, Z12, Z16])
def test_brak_statusu_wtornego_odczytu(szablon_id: str) -> None:
    """Po porównaniu ze źródłem żadna pozycja nie zostaje „wg odczytu tekstu”; interpretacja
    tylko tam, gdzie rysunek relacji nie rysuje — z uzasadnieniem."""
    obwody = BAY_TEMPLATE_REGISTRY[szablon_id].obwody_wtorne
    assert obwody is not None
    zrzut = obwody.model_dump_json()
    assert "ODCZYT_TEKSTU" not in zrzut
    assert "wg odczytu" not in zrzut
    for p in obwody.powiazania:
        if p.weryfikacja == "INTERPRETACJA":
            assert p.uwaga
    for n in obwody.napedy:
        assert n.weryfikacja == "ZWERYFIKOWANE_NA_RYSUNKU"
    szablon = BAY_TEMPLATE_REGISTRY[szablon_id]
    assert all("odczytu" not in (d.podstawa or "") for d in szablon.devices)
    assert "zweryfikowano ze źródłem ENEA" in (szablon.podstawa or "")


def test_z7_polaczenie_ow2_od_zabezpieczen_110kv() -> None:
    obwody = OBWODY_WTORNE_POL_GPZ["Z7"]
    sygnal = next(s for s in obwody.sygnaly if s.nazwa == "OW2 od zabezpieczeń str. 110 kV")
    assert sygnal.polaczony_z == ["OW2"] and not sygnal.sterownik_pola
    z16 = next(s for s in OBWODY_WTORNE_POL_GPZ["Z16"].sygnaly if s.nazwa == "Wył. od zab. TR")
    assert z16.polaczony_z == ["OW1", "OW2"]


def test_z7_przekladniki_przeznaczenie_wg_rysunku() -> None:
    obwody = OBWODY_WTORNE_POL_GPZ["Z7"]
    poza = {(p.aparat, p.numer): p.odbiornik_pl for p in obwody.obwody_przekladnikow}
    assert poza == {
        ("T1", 1): "układ pomiarowy bilansowo-kontrolny",
        ("T3", 1): "układ pomiarowy bilansowo-kontrolny, analizator jakości energii",
        ("T3", 2): "pomiary lokalne strony SN",
    }
    # Tabliczka T3 (s.86): trzy uzwojenia fazowe 0,1/√3, bez otwartego trójkąta.
    assert [(u.przekladnia, u.moc_va, u.klasa, u.otwarty_trojkat) for u in
            UZWOJENIA_VT_POLA_TRANSFORMATORA_Z7] == [
        ("SN/√3 / 0,1/√3", 10.0, "0,2", False),
        ("SN/√3 / 0,1/√3", 7.5, "0,5", False),
        ("SN/√3 / 0,1/√3", 7.5, "0,5/3P", False),
    ]  # fmt: skip
    assert "REGULACJA" in UZWOJENIA_VT_POLA_TRANSFORMATORA_Z7[2].przeznaczenie


def test_przekladnie_z_gwiazdka_wszystkie_warianty_tabeli_uwaga() -> None:
    typy = {t["id"]: t for t in get_all_ct_types()}
    for pierwotny in (1000, 1600, 800, 1200):
        z7 = typy[f"ct_typ_ogolny_osd_{pierwotny}_5_5_5_5_z7"]["params"]["rdzenie"]
        assert [(r["przekladnia"], r["moc_va"], r["klasa"], r["fs"]) for r in z7] == [
            (f"{pierwotny}/5", 10.0, "0,2S", 5.0),
            (f"{pierwotny}/5", 10.0, "0,2", 5.0),
            (f"{pierwotny}/5", 15.0, "5P20", None),
            (f"{pierwotny}/5", 15.0, "5P20", None),
        ]
        assert "ROZLICZENIE" not in z7[0]["przeznaczenie"]
        z12 = typy[f"ct_typ_ogolny_osd_{pierwotny}_5_5_z12"]["params"]["rdzenie"]
        assert [(r["moc_va"], r["klasa"]) for r in z12] == [(15.0, "5P20"), (15.0, "5P20")]
    z16 = typy["ct_typ_ogolny_osd_100_5_5_5_z16"]["params"]["rdzenie"]
    assert [(r["przekladnia"], r["moc_va"], r["klasa"], r["fs"]) for r in z16] == [
        ("100/5", 10.0, "0,2S", 5.0),
        ("100/5", 15.0, "5P20", None),
        ("100/5", 15.0, "5P20", None),
    ]
    # Szablon wskazuje wariant 1000/5 jako wartość roboczą (ZASADA NR 4), z opisem doboru.
    for szablon_id in (Z7, Z12):
        ct = next(d for d in BAY_TEMPLATE_REGISTRY[szablon_id].devices if d.kind == "CT")
        assert ct.catalog_ref is not None and "_1000_" in ct.catalog_ref
        assert "wartość robocza" in (ct.podstawa or "")


def test_kolejnosc_aparatow_od_szyny_wg_rysunku() -> None:
    def plan(szablon_id: str) -> list[tuple[str, str]]:
        return [(d.kind, d.designation_q) for d in BAY_TEMPLATE_REGISTRY[szablon_id].devices]

    assert plan(Z7) == [
        ("VOLTAGE_INDICATOR", "PF0"),
        ("THREE_POSITION_SWITCH", "Q1"),
        ("CB", "Q0"),
        ("THREE_POSITION_SWITCH", "Q5"),
        ("CABLE_HEAD", "GK1"),
        ("VT", "T3"),
        ("CT", "T1"),
        ("VOLTAGE_INDICATOR", "PF1"),
        ("CABLE_HEAD", "GK"),
        ("SURGE_ARRESTER", "F1"),
    ]
    assert plan(Z12) == [
        ("VOLTAGE_INDICATOR", "PF0"),
        ("THREE_POSITION_SWITCH", "Q1"),
        ("CB", "Q0"),
        ("CT", "T1"),
        ("THREE_POSITION_SWITCH", "Q2"),
        ("VOLTAGE_INDICATOR", "PF2"),
    ]
    assert plan(Z16) == [
        ("THREE_POSITION_SWITCH", "Q1"),
        ("CB", "Q0"),
        ("CT", "T1"),
        ("VOLTAGE_INDICATOR", "PF1"),
        ("CABLE_HEAD", "GK"),
        ("SURGE_ARRESTER", "F1"),
        ("PHASE_TO_PHASE_VT", "T4"),
        ("PHASE_TO_PHASE_VT", "T5"),
        ("UNBALANCE_CT", "T6"),
    ]


def _obwody_z_sygnalem(sygnal: SygnalPola) -> ObwodyWtornePola:
    return ObwodyWtornePola(
        podstawa="test",
        powiazania=[
            PowiazanieFunkcjiEaz(
                funkcja="51",
                blok_rysunku="I>",
                wejscia=[WejscieFunkcjiEaz(rodzaj="SYGNAL", sygnal="A", weryfikacja="ZWERYFIKOWANE_NA_RYSUNKU")],
                wyjscia=["OW1"],
                wylacznik="Q0",
                weryfikacja="ZWERYFIKOWANE_NA_RYSUNKU",
            )
        ],
        sygnaly=[
            SygnalPola(nazwa="A", kierunek="WEJSCIE", obwod="NADRZEDNY", weryfikacja="ZWERYFIKOWANE_NA_RYSUNKU"),
            SygnalPola(nazwa="OW1", kierunek="WYJSCIE", obwod="WYLACZNIK", weryfikacja="ZWERYFIKOWANE_NA_RYSUNKU"),
            sygnal,
        ],
    )  # fmt: skip


def test_polaczenie_sygnalow_predykat_parami() -> None:
    """Połączenie wprost użyje OBA końce (sygnał bez bloku nie jest osierocony), a połączenie
    z sygnałem spoza pola albo z samym sobą jest odmową."""
    wejscie: dict[str, str] = {
        "kierunek": "WEJSCIE",
        "obwod": "OKREZNY",
        "weryfikacja": "ZWERYFIKOWANE_NA_RYSUNKU",
    }
    _obwody_z_sygnalem(SygnalPola(nazwa="B", polaczony_z=["OW1"], **wejscie))
    with pytest.raises(ValidationError, match="bez odbiornika"):
        _obwody_z_sygnalem(SygnalPola(nazwa="B", **wejscie))
    with pytest.raises(ValidationError, match="którego pole nie ma"):
        _obwody_z_sygnalem(SygnalPola(nazwa="B", polaczony_z=["OW9"], **wejscie))
    with pytest.raises(ValidationError, match="którego pole nie ma"):
        _obwody_z_sygnalem(SygnalPola(nazwa="B", polaczony_z=["B"], **wejscie))
