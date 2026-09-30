"""Zacisk zabezpieczenia gałęzi — JEDEN resolver (decyzja O-51, wariant (b)).

Reguła modelu: KCL na łańcuchu szeregowym — wyłącznik z przypiętym zabezpieczeniem wskazuje
zacisk gałęzi tylko wtedy, gdy łańcuch od wyłącznika (węzły stopnia 2, elementy łączeniowe
bez impedancji) kończy się tym zaciskiem. Pomiar na sieci GN_02 z jednym przypięciem przy
wyłączniku pola odgałęzienia: reguła „szyna wspólna z zaciskiem" przypisywała to
zabezpieczenie TRZEM liniom (odgałęzieniu oraz dwóm odcinkom magistrali wpiętym wprost w
szynę stacji obok trzech pól), reguła szeregowa — JEDNEJ (odgałęzieniu, zacisk `od`).

Iloczyn cech (reguła KLASA, NIE INSTANCJA):
- kształt łańcucha: wyłącznik wprost przy zacisku, wyłącznik + odłącznik (także otwarty —
  liczy się struktura, nie stan ruchowy), łańcuch z bocznikiem w węźle pośrednim (milczy),
  szyna zbiorcza z trzema polami (milczy);
- przypięcia: przy `od`, przy `do`, przy obu zaciskach, brak, pętla (wyłącznik w szeregu
  z oboma zaciskami) × wskazanie: `od`, `do`, brak — zgodne, sprzeczne, wybór;
- typ urządzenia z katalogu: z funkcją 50/51, czysta 87L (poza), bez danych o funkcjach
  (kandydat);
- orientacja pakietu 110/15 kV: prąd obciążenia w miejscu zabezpieczenia `od` ≠ `do`;
- predykaty parami: dostępność = bieg dla KAŻDEJ trójki (linia, wskazanie, szyna) sieci
  syntetycznych i GN_01…GN_05 z jednym dołożonym przypięciem.
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest
from application.protection_settings import zacisk_zabezpieczenia as modul
from application.protection_settings.batch_run import (
    BrakDanychNastawError,
    kandydaci_nastepnej_szyny,
    linie_kandydujace,
    zbuduj_wejscie_nastaw,
)
from application.protection_settings.zacisk_zabezpieczenia import (
    FUNKCJE_PAKIETU_NASTAW,
    KOD_BRAK_WSKAZANIA,
    KOD_PETLA_WYLACZNIKA,
    KOD_SPRZECZNY_Z_MODELEM,
    KOD_WYBOR_ZACISKU,
    KOLEKCJE_BEZ_ELEMENTOW_MOCY,
    KOLEKCJE_GALEZI_MOCY,
    KOLEKCJE_WEZLOWE_MOCY,
    OdmowaZacisku,
    ZaciskZabezpieczenia,
    funkcje_typu_zabezpieczenia,
    rozstrzygnij_zacisk,
    zaciski_galezi,
)
from domain.canonical_operations import READINESS_CODES
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_power_flow,
    _execute_short_circuit,
    build_branch_results,
)
from enm.mapping import ref_to_graph_id
from enm.models import (
    BranchRating,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    ProtectionAssignment,
    ShuntCapacitor,
    Source,
    SwitchBranch,
    Transformer,
)

TYP_Z_FUNKCJA_50_51 = "REF-OC-200"

# ---------------------------------------------------------------------------
# Sieci resolvera (bez solvera): linia L między szynami F (od) i T (do)
# ---------------------------------------------------------------------------


def _linia(ref_id: str, od: str, do: str) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        length_km=2.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        rating=BranchRating(in_a=200.0),
        cross_section_mm2=120.0,
        conductor_material="Al",
    )


def _lacznik(ref_id: str, od: str, do: str, rodzaj: str = "breaker", stan: str = "closed"):
    return SwitchBranch(
        ref_id=ref_id,
        name=ref_id,
        from_bus_ref=od,
        to_bus_ref=do,
        type=rodzaj,
        status=stan,
    )


def _przypiecie(
    ref_id: str, wylacznik: str, catalog_ref: str | None = TYP_Z_FUNKCJA_50_51
) -> ProtectionAssignment:
    return ProtectionAssignment(
        ref_id=ref_id,
        name=f"Zabezpieczenie {ref_id}",
        breaker_ref=wylacznik,
        device_type="overcurrent",
        catalog_ref=catalog_ref,
        catalog_namespace="ZABEZPIECZENIE" if catalog_ref else None,
    )


def _siec_resolvera(ksztalt: str, przypiecia: str, catalog_ref: str | None = None) -> dict:
    """Migawka z linią L (F → T) i przypięciami przy zaciskach wg `przypiecia`.

    Szyny zbiorcze `S_od` i `S_do` mają po trzy przyłączenia (wyłącznik pola, źródło albo
    odbiór, drugi odpływ), więc łańcuch nigdy nie „przechodzi" przez szynę zbiorczą.
    """
    typ = TYP_Z_FUNKCJA_50_51 if catalog_ref is None else catalog_ref
    szyny = [
        Bus(ref_id=r, name=f"Szyna {r}", voltage_kv=15.0) for r in ("S_od", "S_do", "X_od", "X_do")
    ]
    galezie: list[Any] = [
        _linia("L", "F", "T"),
        _linia("X1", "S_od", "X_od"),
        _linia("X2", "S_do", "X_do"),
    ]
    szyny += [Bus(ref_id="F", name="Stacja F", voltage_kv=15.0)]
    szyny += [Bus(ref_id="T", name="Stacja T", voltage_kv=15.0)]
    boczniki: list[ShuntCapacitor] = []
    przypiete: list[ProtectionAssignment] = []

    def pole(zacisk: str) -> str:
        """Wyłącznik pola przy zacisku `zacisk` w danym kształcie; zwraca ref wyłącznika."""
        szyna_zbiorcza, szyna_zacisku = ("S_od", "F") if zacisk == "od" else ("S_do", "T")
        wylacznik = f"CB_{zacisk}"
        if ksztalt == "wprost":
            galezie.append(_lacznik(wylacznik, szyna_zbiorcza, szyna_zacisku))
        elif ksztalt in ("lancuch", "lancuch_otwarty", "bocznik"):
            posredni = f"N_{zacisk}"
            szyny.append(Bus(ref_id=posredni, name=f"Węzeł {posredni}", voltage_kv=15.0))
            galezie.append(_lacznik(wylacznik, szyna_zbiorcza, posredni))
            stan = "open" if ksztalt == "lancuch_otwarty" else "closed"
            galezie.append(_lacznik(f"DS_{zacisk}", posredni, szyna_zacisku, "disconnector", stan))
            if ksztalt == "bocznik":
                boczniki.append(
                    ShuntCapacitor(
                        ref_id=f"BK_{zacisk}",
                        name="Bateria",
                        bus_ref=posredni,
                        rated_mvar=0.5,
                        rated_kv=15.0,
                    )
                )
        elif ksztalt == "szyna":
            # Linia wpięta wprost w szynę zbiorczą stacji z trzema polami (jak kreator):
            # wyłącznik pola odpływowego ma szynę wspólną z zaciskiem, ale nie stoi z nim
            # w szeregu.
            galezie.append(_lacznik(f"CB_przyl_{zacisk}", szyna_zacisku, szyna_zbiorcza))
            odplyw = f"P_{zacisk}"
            szyny.append(Bus(ref_id=odplyw, name=f"Pole {odplyw}", voltage_kv=15.0))
            galezie.append(_lacznik(wylacznik, szyna_zacisku, odplyw))
            galezie.append(_linia(f"Odplyw_{zacisk}", odplyw, "X_od" if zacisk == "od" else "X_do"))
        else:
            raise AssertionError(ksztalt)
        return wylacznik

    if przypiecia in ("od", "oba"):
        przypiete.append(_przypiecie("PA_od", pole("od"), typ))
    if przypiecia in ("do", "oba"):
        przypiete.append(_przypiecie("PA_do", pole("do"), typ))
    if przypiecia == "petla":
        galezie.append(_lacznik("CB_petla", "F", "T"))
        przypiete.append(_przypiecie("PA_petla", "CB_petla", typ))
    enm = EnergyNetworkModel(
        header=ENMHeader(name=f"Resolver — {ksztalt} — {przypiecia}"),
        buses=szyny,
        branches=galezie,
        sources=[
            Source(
                ref_id="src",
                name="Zasilanie",
                bus_ref="S_od",
                model="short_circuit_power",
                sk3_mva=500.0,
                rx_ratio=0.1,
            )
        ],
        loads=[Load(ref_id="ld", name="Odbiór", bus_ref="S_do", p_mw=1.0, q_mvar=0.3)],
        shunt_capacitors=boczniki,
        protection_assignments=przypiete,
    )
    return enm.model_dump(mode="json")


KSZTALTY_W_SZEREGU = ("wprost", "lancuch", "lancuch_otwarty")
KSZTALTY_MILCZACE = ("bocznik", "szyna")


def _oczekiwane(przypiecia: str, wskazanie: str | None) -> tuple[str, str] | str:
    """Wyrocznia hierarchii (decyzja O-51): (zacisk, źródło) albo kod odmowy."""
    if przypiecia == "petla":
        return KOD_PETLA_WYLACZNIKA
    if przypiecia == "brak":
        return KOD_BRAK_WSKAZANIA if wskazanie is None else (wskazanie, "wskazanie")
    if przypiecia == "oba":
        return KOD_WYBOR_ZACISKU if wskazanie is None else (wskazanie, "wskazanie")
    if wskazanie is None or wskazanie == przypiecia:
        return (przypiecia, "model")
    return KOD_SPRZECZNY_Z_MODELEM


def _werdykt(wynik: ZaciskZabezpieczenia | OdmowaZacisku) -> tuple[str, str] | str:
    if isinstance(wynik, OdmowaZacisku):
        return wynik.kod
    return (wynik.zacisk, wynik.zrodlo)


PRZYPADKI_RESOLVERA = [
    (ksztalt, przypiecia, wskazanie)
    for ksztalt in (*KSZTALTY_W_SZEREGU, *KSZTALTY_MILCZACE)
    for przypiecia in ("od", "do", "oba", "brak")
    for wskazanie in (None, "od", "do")
] + [("petla", "petla", wskazanie) for wskazanie in (None, "od", "do")]


@pytest.mark.parametrize(
    ("ksztalt", "przypiecia", "wskazanie"),
    PRZYPADKI_RESOLVERA,
    ids=[f"{k}-{p}-{w}" for k, p, w in PRZYPADKI_RESOLVERA],
)
def test_iloczyn_cech_ksztalt_przypiecia_wskazanie(
    ksztalt: str, przypiecia: str, wskazanie: str | None
) -> None:
    snapshot = _siec_resolvera("wprost" if ksztalt == "petla" else ksztalt, przypiecia)
    widziane = przypiecia if ksztalt not in KSZTALTY_MILCZACE else "brak"
    wynik = rozstrzygnij_zacisk(snapshot, "L", wskazanie)  # type: ignore[arg-type]
    assert _werdykt(wynik) == _oczekiwane(widziane, wskazanie)
    if isinstance(wynik, OdmowaZacisku):
        # Odmowa nazwana: kod z kanonu i zdanie z rejestru na początku powodu.
        assert wynik.powod_pl.startswith(READINESS_CODES[wynik.kod].message_pl)
    else:
        szyny = {"od": "F", "do": "T"}
        assert wynik.szyna_zacisku_ref == szyny[wynik.zacisk]
        assert wynik.szyna_przeciwna_ref == szyny["do" if wynik.zacisk == "od" else "od"]


def test_typ_czysta_87L_poza_filtrem_typ_bez_funkcji_kandydatem(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Filtr rodzaju urządzenia z KATALOGU (decyzja O-51 pkt 3): czysta różnicówka 87L bez
    50/51 nie wskazuje zacisku pakietu nastaw I>/I>>; typ bez danych o funkcjach liczy się
    jako kandydat (bez zgadywania)."""

    def funkcje(
        catalog_ref: str | None, _przestrzen: str | None, *, migawka: object
    ) -> tuple[str, ...] | None:
        return {"TYP-87L": ("87L",), "TYP-87L-51": ("87L", "51")}.get(catalog_ref or "")

    monkeypatch.setattr(modul, "funkcje_typu_zabezpieczenia", funkcje)
    tylko_87l = rozstrzygnij_zacisk(_siec_resolvera("wprost", "od", "TYP-87L"), "L", None)
    assert isinstance(tylko_87l, OdmowaZacisku) and tylko_87l.kod == KOD_BRAK_WSKAZANIA
    z_51 = rozstrzygnij_zacisk(_siec_resolvera("wprost", "od", "TYP-87L-51"), "L", None)
    assert _werdykt(z_51) == ("od", "model")
    bez_danych = rozstrzygnij_zacisk(_siec_resolvera("wprost", "do", "TYP-NIEZNANY"), "L", None)
    assert _werdykt(bez_danych) == ("do", "model")
    # Różnicówki 87L przy OBU zaciskach i nadprądowe tylko przy `od`: model rozstrzyga `od`.
    snapshot = _siec_resolvera("wprost", "oba", "TYP-87L")
    snapshot["protection_assignments"][0]["catalog_ref"] = "TYP-87L-51"
    assert _werdykt(rozstrzygnij_zacisk(snapshot, "L", None)) == ("od", "model")


def test_funkcje_typu_z_katalogu_mv_i_biblioteki_analitycznej() -> None:
    """Droga danych filtra bez podmiany: katalog MV → `analytical_library_ref` → biblioteka."""
    assert set(
        funkcje_typu_zabezpieczenia(TYP_Z_FUNKCJA_50_51, "ZABEZPIECZENIE", migawka={}) or ()
    ) == {
        "50",
        "51",
    }
    assert funkcje_typu_zabezpieczenia(TYP_Z_FUNKCJA_50_51, None, migawka={}) is not None
    assert funkcje_typu_zabezpieczenia("TYP-SPOZA-KATALOGU", "ZABEZPIECZENIE", migawka={}) is None
    assert funkcje_typu_zabezpieczenia(TYP_Z_FUNKCJA_50_51, "CT", migawka={}) is None
    assert funkcje_typu_zabezpieczenia(None, None, migawka={}) is None


def test_funkcje_pakietu_to_stopnie_ktore_nastawy_wypelniaja() -> None:
    """Deklaracja z testem: `FUNKCJE_PAKIETU_NASTAW` = stopnie, które `wymaganie_z_nastaw`
    wypełnia liczbą (51: próg i czas I>, 50: próg I>>); 50N/51N zostają puste."""
    from application.analyses.protection.catalog.mapper import wymaganie_z_nastaw
    from application.protection_settings.engine import ProtectionSettingsEngine

    kotwica = _kotwica(_siec_110_15(z_polem=False))
    wejscie = zbuduj_wejscie_nastaw(
        kotwica, line_id="k1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia="od"
    )
    wymaganie = wymaganie_z_nastaw(ProtectionSettingsEngine.calculate(wejscie.engine_input))
    stopnie = {
        "i_pickup_51_a": "51",
        "t_51_s": "51",
        "i_inst_50_a": "50",
        "i_pickup_51n_a": "51N",
        "tms_51n": "51N",
        "i_inst_50n_a": "50N",
    }
    wypelnione = {kod for pole, kod in stopnie.items() if getattr(wymaganie, pole) is not None}
    assert wypelnione == FUNKCJE_PAKIETU_NASTAW


def test_kazda_kolekcja_modelu_jest_sklasyfikowana_dla_reguly_szeregowej() -> None:
    """Nowa kolekcja ENM bez klasyfikacji (element mocy albo nie) czerwieni ten test —
    inaczej element mocy nowego rodzaju wypadłby cicho z reguły szeregowej."""
    galezie = {kolekcja for kolekcja, _a, _b in KOLEKCJE_GALEZI_MOCY}
    sklasyfikowane = galezie | set(KOLEKCJE_WEZLOWE_MOCY) | set(KOLEKCJE_BEZ_ELEMENTOW_MOCY)
    assert len(sklasyfikowane) == (
        len(galezie) + len(KOLEKCJE_WEZLOWE_MOCY) + len(KOLEKCJE_BEZ_ELEMENTOW_MOCY)
    )
    assert sklasyfikowane == set(EnergyNetworkModel.model_fields)


def test_zaciski_galezi_transformatora_od_to_strona_gn() -> None:
    snapshot = _siec_110_15(z_polem=False).model_dump(mode="json")
    zaciski = zaciski_galezi(snapshot, "T1")
    assert zaciski is not None
    assert (zaciski.szyna_od_ref, zaciski.szyna_do_ref) == ("b_110", "b_gpz")
    assert zaciski.etykieta_od_pl == "Zacisk początkowy — szyna GPZ 110 kV"


# ---------------------------------------------------------------------------
# Pakiet nastaw na sieci 110/15 kV — orientacja z zacisku, prąd w miejscu zabezpieczenia
# ---------------------------------------------------------------------------


def _siec_110_15(*, z_polem: bool) -> EnergyNetworkModel:
    """110 kV → T1 110/15 → GPZ SN → kabel k1 (8 km, susceptancja) → stacja A → ln2 → B;
    drugi odpływ k0 z GPZ do stacji C. `z_polem`: k1 wychodzi z pola GPZ przez wyłącznik
    CB1 z przypiętym zabezpieczeniem (model rozstrzyga zacisk `od`)."""
    poczatek_k1 = "b_p1" if z_polem else "b_gpz"
    szyny = [
        Bus(ref_id="b_110", name="GPZ 110 kV", voltage_kv=110.0),
        Bus(ref_id="b_gpz", name="GPZ SN", voltage_kv=15.0),
        Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
        Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        Bus(ref_id="b_c", name="Stacja C", voltage_kv=15.0),
    ]
    galezie: list[Any] = [
        Cable(
            ref_id="k1",
            name="Kabel k1",
            from_bus_ref=poczatek_k1,
            to_bus_ref="b_a",
            length_km=8.0,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.11,
            b_siemens_per_km=90e-6,
            rating=BranchRating(in_a=256.0),
            cross_section_mm2=240.0,
            conductor_material="Al",
        ),
        _linia("ln2", "b_a", "b_b"),
        Cable(
            ref_id="k0",
            name="Kabel k0",
            from_bus_ref="b_gpz",
            to_bus_ref="b_c",
            length_km=3.0,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.11,
            b_siemens_per_km=90e-6,
            rating=BranchRating(in_a=256.0),
            cross_section_mm2=240.0,
            conductor_material="Al",
        ),
    ]
    przypiecia: list[ProtectionAssignment] = []
    if z_polem:
        szyny.append(Bus(ref_id="b_p1", name="Pole k1", voltage_kv=15.0))
        galezie.append(_lacznik("CB1", "b_gpz", "b_p1"))
        przypiecia.append(_przypiecie("PA1", "CB1"))
    return EnergyNetworkModel(
        header=ENMHeader(name="Sieć 110/15 kV — zacisk zabezpieczenia"),
        buses=szyny,
        branches=galezie,
        transformers=[
            Transformer(
                ref_id="T1",
                name="TR 110/15",
                hv_bus_ref="b_110",
                lv_bus_ref="b_gpz",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=11.0,
                pk_kw=120.0,
                vector_group="Dyn11",
            )
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć 110 kV",
                bus_ref="b_110",
                model="short_circuit_power",
                sk3_mva=3000.0,
                rx_ratio=0.1,
            )
        ],
        loads=[
            Load(ref_id="ld_b", name="Odbiór B", bus_ref="b_b", p_mw=0.4, q_mvar=0.1),
            Load(ref_id="ld_c", name="Odbiór C", bus_ref="b_c", p_mw=1.0, q_mvar=0.3),
        ],
        protection_assignments=przypiecia,
    )


def _bieg(enm: EnergyNetworkModel, rodzaj: str) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-zacisk",
        project_id="proj-zacisk",
        analysis_type=rodzaj,
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash-zacisk",
        input_hash="in-hash-zacisk",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options=(
            {"fault_type": "3F", "c_factor": 1.10, "thermal_time_seconds": 1.0}
            if rodzaj == "short_circuit_sn"
            else {}
        ),
    )
    run.finished_at = run.created_at
    if rodzaj == "short_circuit_sn":
        _execute_short_circuit(run)
    else:
        _execute_power_flow(run)
    return run


def _kotwica(enm: EnergyNetworkModel) -> CanonicalRun:
    return _bieg(enm, "short_circuit_sn")


def _ik3(kotwica: CanonicalRun, szyna: str) -> float:
    return next(
        float(w["ikss_a"])
        for w in kotwica.raw_result["results"]
        if w.get("fault_node_id") == ref_to_graph_id(szyna)
    )


def test_110_15_prad_w_miejscu_zabezpieczenia_od_rozny_od_do_i_orientacja_pakietu() -> None:
    """Kabel k1 z susceptancją: prąd zacisku `do` różni się od prądu zacisku `od` o więcej
    niż 1 % — pakiet bierze prąd zacisku, przy którym stoi zabezpieczenie (ten sam wiersz
    tabeli gałęzi co interfejs), a „początek" i „koniec" odcinka zamieniają się miejscami.
    """
    enm = _siec_110_15(z_polem=False)
    kotwica = _kotwica(enm)
    tabela = next(
        w
        for w in build_branch_results(_bieg(enm, "PF"))["rows"]
        if w["branch_id"] == ref_to_graph_id("k1")
    )
    assert abs(tabela["i_do_a"] - tabela["i_a"]) / tabela["i_a"] > 0.01

    od = zbuduj_wejscie_nastaw(
        kotwica, line_id="k1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia="od"
    )
    do = zbuduj_wejscie_nastaw(
        kotwica, line_id="k1", next_bus_id="b_c", c_min=1.0, zacisk_zabezpieczenia="do"
    )
    assert (od.zacisk_zabezpieczenia, od.zrodlo_zacisku) == ("od", "wskazanie")
    assert (do.zacisk_zabezpieczenia, do.zrodlo_zacisku) == ("do", "wskazanie")
    assert od.engine_input.i_load_max_a == tabela["i_a"]
    assert do.engine_input.i_load_max_a == tabela["i_do_a"]
    assert od.engine_input.ik3_max_beginning_a == _ik3(kotwica, "b_gpz")
    assert od.engine_input.ik3_max_end_a == _ik3(kotwica, "b_a")
    assert do.engine_input.ik3_max_beginning_a == _ik3(kotwica, "b_a")
    assert do.engine_input.ik3_max_end_a == _ik3(kotwica, "b_gpz")
    assert do.engine_input.ik_max_next_bus_a == _ik3(kotwica, "b_c")
    # Kolejna strefa za KOŃCEM odcinka zależy od zacisku.
    assert kandydaci_nastepnej_szyny(kotwica.snapshot, "k1", "od") == ["b_b"]
    assert kandydaci_nastepnej_szyny(kotwica.snapshot, "k1", "do") == ["b_c"]


def test_110_15_model_milczy_brak_wskazania_to_odmowa_z_kodem() -> None:
    kotwica = _kotwica(_siec_110_15(z_polem=False))
    with pytest.raises(BrakDanychNastawError) as blad:
        zbuduj_wejscie_nastaw(
            kotwica,
            line_id="k1",
            next_bus_id="b_b",
            c_min=1.0,
            zacisk_zabezpieczenia=None,
        )
    assert blad.value.kod == KOD_BRAK_WSKAZANIA
    assert "Zacisk początkowy — szyna GPZ SN" in str(blad.value)


def test_110_15_model_rozstrzyga_wskazanie_zbedne_sprzeczne_odmawia() -> None:
    kotwica = _kotwica(_siec_110_15(z_polem=True))
    z_modelu = zbuduj_wejscie_nastaw(
        kotwica, line_id="k1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia=None
    )
    zgodne = zbuduj_wejscie_nastaw(
        kotwica, line_id="k1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia="od"
    )
    assert (z_modelu.zacisk_zabezpieczenia, z_modelu.zrodlo_zacisku) == ("od", "model")
    assert zgodne.engine_input == z_modelu.engine_input
    with pytest.raises(BrakDanychNastawError) as blad:
        zbuduj_wejscie_nastaw(
            kotwica,
            line_id="k1",
            next_bus_id="b_b",
            c_min=1.0,
            zacisk_zabezpieczenia="do",
        )
    assert blad.value.kod == KOD_SPRZECZNY_Z_MODELEM


# ---------------------------------------------------------------------------
# Predykaty parami: dostępność = bieg dla każdej trójki (linia, wskazanie, szyna)
# ---------------------------------------------------------------------------

#: Jedno dołożone przypięcie na sieć rejestru (sufiks refu łącznika) i skutek reguły
#: szeregowej: GN_01/04/05 — wyłącznik pola na szynie stacji (szyna zbiorcza → model
#: milczy), GN_02 — wyłącznik pola odgałęzienia (w szeregu z zaciskiem `od`
#: odgałęzienia), GN_03 — łącznik pierścienia (w szeregu z zaciskiem `do` odcinka SL).
PRZYPIECIA_REJESTRU = {
    "build_gn01_sn_promieniowa": "sn_field_breaker/000",
    "build_gn02_sn_odgalezienie": "sn_field_breaker/002",
    "build_gn03_sn_pierscien": "/switch",
    "build_gn04_sn_nn_oze": "sn_field_breaker/000",
    "build_gn05_sn_nn_oze_ochrona": "sn_field_breaker/000",
}


def _kotwice_rejestru() -> list[tuple[str, CanonicalRun]]:
    from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
    from enm.store import reset_enm_store, set_enm

    from tests.reference_networks import builders

    kotwice: list[tuple[str, CanonicalRun]] = []
    for nazwa, sufiks in PRZYPIECIA_REJESTRU.items():
        surowa = copy.deepcopy(getattr(builders, nazwa)()["enm"])
        lacznik = next(g["ref_id"] for g in surowa["branches"] if g["ref_id"].endswith(sufiks))
        surowa.setdefault("protection_assignments", []).append(
            _przypiecie("PA_dolozone", lacznik).model_dump(mode="json")
        )
        siec = EnergyNetworkModel.model_validate(surowa)
        reset_canonical_runs()
        reset_enm_store()
        try:
            set_enm("case-parytet-zacisku", siec)
            kotwice.append(
                (
                    nazwa,
                    execute_run(
                        create_run(
                            case_id="case-parytet-zacisku",
                            klucz_twin="case-parytet-zacisku",
                            analysis_type="short_circuit_sn",
                        ).id
                    ),
                )
            )
        finally:
            reset_canonical_runs()
            reset_enm_store()
    return kotwice


def test_predykaty_parami_dostepnosc_rowna_sie_biegowi_na_kazdej_trojce() -> None:
    """Dla KAŻDEJ linii kandydującej × wskazanie {brak, od, do} × KAŻDA szyna sieci:
    budowa się udaje ⟺ dostępność reklamuje trójkę; odmowa zacisku niesie ten sam kod
    co rekord `odmowa_zacisku` dostępności.

    Pomiar: sieci GN_01…GN_05 są dla pakietu NIEDOSTĘPNE także na HEAD bez przypięcia
    (żaden odcinek nie ma kompletu trzech szyn z prądem zwarciowym — szyny pomocnicze
    magistrali nie są punktami raportowalnymi), więc na nich test sprawdza równość odmów;
    trójki budowane pochodzą z sieci 110/15 kV (bez pola i z polem, w którym model
    rozstrzyga zacisk). Reguła szeregowa rozstrzyga na tych sieciach sześć linii: GN_02
    (odgałęzienie, `od`), GN_03 (odcinek SL, `do`), połówki od strony zasilania GN_01 i GN_04
    (`do` — zacisk pola wejściowego stacji, karta POLA-W-TORZE), odcinek GN_05 od GPZ do
    wyłącznika liniowego (`do`) i k1 sieci z polem (`od`)."""
    from application.proof_engine.pakiet_nastaw import dostepnosc_pakietu_nastaw

    kotwice = _kotwice_rejestru() + [
        ("syntetyczna_110_15_bez_pola", _kotwica(_siec_110_15(z_polem=False))),
        ("syntetyczna_110_15_z_polem", _kotwica(_siec_110_15(z_polem=True))),
    ]
    rozstrzygniete_modelem: list[tuple[str, str, str]] = []
    reklamowane_z_modelu = 0
    reklamowane = 0
    for nazwa, kotwica in kotwice:
        dostepnosc = dostepnosc_pakietu_nastaw(kotwica)
        pozycje = {p["line_id"]: p for p in dostepnosc["linie"]}
        szyny = [s["ref_id"] for s in kotwica.snapshot["buses"]]
        for linia in linie_kandydujace(kotwica.snapshot):
            pozycja = pozycje.get(linia.ref_id)
            bez_wskazania = rozstrzygnij_zacisk(kotwica.snapshot, linia.ref_id, None)
            if isinstance(bez_wskazania, ZaciskZabezpieczenia):
                rozstrzygniete_modelem.append((nazwa, linia.ref_id, bez_wskazania.zacisk))
            for wskazanie in (None, "od", "do"):
                zacisk = wskazanie or (pozycja["zacisk_z_modelu"] if pozycja else None)
                for szyna in szyny:
                    obiecane = bool(
                        pozycja
                        and zacisk in pozycja["zaciski_dozwolone"]
                        and szyna in pozycja["nastepne_szyny_wg_zacisku"][zacisk]
                    )
                    try:
                        zbuduj_wejscie_nastaw(
                            kotwica,
                            line_id=linia.ref_id,
                            next_bus_id=szyna,
                            c_min=1.0,
                            zacisk_zabezpieczenia=wskazanie,
                        )
                        zbudowane, kod = True, None
                    except BrakDanychNastawError as blad:
                        zbudowane, kod = False, blad.kod
                    assert zbudowane == obiecane, (
                        nazwa,
                        linia.ref_id,
                        wskazanie,
                        szyna,
                        kod,
                    )
                    reklamowane += obiecane
                    reklamowane_z_modelu += obiecane and wskazanie is None
                    if pozycja and wskazanie is None and pozycja["odmowa_zacisku"]:
                        assert kod == pozycja["odmowa_zacisku"]["kod"], (
                            nazwa,
                            linia.ref_id,
                        )
    assert reklamowane > 0 and reklamowane_z_modelu > 0, (
        reklamowane,
        reklamowane_z_modelu,
    )
    # Karta POLA-W-TORZE: połówka odcinka od strony zasilania kończy się na zacisku pola
    # wejściowego stacji, więc wyłącznik tego pola (z przypiętym zabezpieczeniem) stoi W SZEREGU
    # z zaciskiem `do` połówki (węzeł stopnia 2: kabel + aparat pola). Dawniej połówka wisiała
    # na szynie głównej obok pola, a reguła szeregowa milczała — zabezpieczenie pola WE nie
    # widziało prądu kabla, który fizycznie przez nie płynie. Stąd trzy nowe rozstrzygnięcia
    # (GN_01, GN_04, GN_05 — sieci ze stacją wstawioną w odcinek i zabezpieczeniem pola WE).
    assert sorted((n, ref.rsplit("/", 1)[-1], z) for n, ref, z in rozstrzygniete_modelem) == [
        ("build_gn01_sn_promieniowa", "segment_L", "do"),
        ("build_gn02_sn_odgalezienie", "branch_segment", "od"),
        ("build_gn03_sn_pierscien", "segment_SL", "do"),
        ("build_gn04_sn_nn_oze", "segment_L", "do"),
        # GN_05 ma od karty BIEG-ZABEZPIECZEN-Z-MODELU realne zabezpieczenie przy wyłączniku
        # liniowym wstawionym w odcinek zasilający magistrali: wyłącznik dzieli odcinek na dwie
        # linie (SL: GPZ → wyłącznik, SR: wyłącznik → stacja). SL ma zabezpieczenie w szeregu
        # tylko z zaciskiem `do`, więc model go rozstrzyga. SR po karcie POLA-W-TORZE kończy się
        # na zacisku pola wejściowego stacji z zabezpieczeniem pola WE, więc ma zabezpieczenie
        # w szeregu z OBOMA zaciskami (wyłącznik liniowy przy `od`, wyłącznik pola przy `do`) —
        # model nie wybiera, dla którego przekaźnika jest pakiet: odmowa `KOD_WYBOR_ZACISKU`
        # (wskazanie projektanta), a nie rozstrzygnięcie. Pomiar na drzewie przeniesienia karty
        # na partię integracji 6 (BIEG-ZABEZPIECZEN-NA-PARTII-6).
        ("build_gn05_sn_nn_oze_ochrona", "segment_L_SL", "do"),
        ("syntetyczna_110_15_z_polem", "k1", "od"),
    ]
