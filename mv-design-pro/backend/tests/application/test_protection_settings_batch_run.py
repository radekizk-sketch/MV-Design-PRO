"""Testy biegu zbiorczego nastaw (karta PACK-NASTAWY, domkniecie PACK-DLUG-NASTAWY).

Pokrycie jako ILOCZYN CECH (nie jeden przyklad z karty):
- kotwica {zakonczona 3F c_max, niezakonczona, zlego rodzaju (PF), zly typ zwarcia
  (2F), c_factor ponizej progu} x wynik (wejscie zbudowane / BrakDanychNastawError),
- linia {komplet danych katalogowych, brak przekroju, brak pradu znamionowego}
  x dostepnosc kandydata,
- topologia nastepnej szyny {rozgalezienie, slepy koniec, szyna spoza migawki}
  x wynik kandydatow/bledu,
- c_min {mniejszy od c_max, rowny c_max, wiekszy od c_max, ujemny} x wynik,
- determinizm {dwa wywolania na tej samej migawce} — identyczne bajty liczb.

ZERO nowej fizyki w tescie: zwarcie i rozplyw licza istniejace solvery przez
istniejaca sciezke wykonania (`enm.canonical_analysis`).
"""

from __future__ import annotations

import copy
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from application.protection_settings.batch_run import (
    BrakDanychNastawError,
    kandydaci_nastepnej_szyny,
    linie_kandydujace,
    zbuduj_wejscie_nastaw,
)
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_power_flow,
    _execute_short_circuit,
)
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    Source,
)
from enm.scenariusze import SCENARIUSZ_NORMALNY, apply_scenario


def _zrodlo(bus_ref: str = "b_src") -> Source:
    return Source(
        ref_id="src",
        name="System 15 kV",
        bus_ref=bus_ref,
        model="short_circuit_power",
        sk3_mva=500.0,
        r_ohm=0.1,
        x_ohm=1.0,
    )


def _linia(ref_id: str, *, od: str, do: str, in_a: float = 200.0) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        length_km=2.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        rating=BranchRating(in_a=in_a),
        cross_section_mm2=120.0,
        conductor_material="Al",
    )


def _siec_promieniowa() -> EnergyNetworkModel:
    """b_src --ln1--> b_a --ln2--> b_b, odbior na b_b."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec nastaw — promien"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3)],
        branches=[
            _linia("ln1", od="b_src", do="b_a"),
            _linia("ln2", od="b_a", do="b_b"),
        ],
    )


def _siec_slepy_koniec() -> EnergyNetworkModel:
    """b_src --ln1--> b_a, koniec promienia (brak gałęzi w dół od b_a)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec nastaw — slepy koniec"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
        ],
        sources=[_zrodlo()],
        loads=[Load(ref_id="ld_a", name="Odbior A", bus_ref="b_a", p_mw=0.8, q_mvar=0.2)],
        branches=[_linia("ln1", od="b_src", do="b_a")],
    )


def _siec_rozgalezienie() -> EnergyNetworkModel:
    """b_src --ln1--> b_a --ln2--> b_b ORAZ b_a --ln3--> b_c (rozgałęzienie)."""
    enm = _siec_promieniowa()
    enm = enm.model_copy(
        update={
            "buses": [*enm.buses, Bus(ref_id="b_c", name="Stacja C", voltage_kv=15.0)],
            "loads": [
                *enm.loads,
                Load(ref_id="ld_c", name="Odbior C", bus_ref="b_c", p_mw=0.5, q_mvar=0.1),
            ],
            "branches": [*enm.branches, _linia("ln3", od="b_a", do="b_c")],
        }
    )
    return enm


def _linia_bez_danych_katalogowych() -> OverheadLine:
    return OverheadLine(
        ref_id="ln_bez_katalogu",
        name="Linia bez katalogu",
        from_bus_ref="b_a",
        to_bus_ref="b_b",
        length_km=1.0,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.35,
        # BRAK: rating, cross_section_mm2, conductor_material.
    )


def _kotwica(
    enm: EnergyNetworkModel,
    *,
    c_factor: float = 1.10,
    fault_type: str = "3F",
    analysis_type: str = "short_circuit_sn",
    status_: str = "FINISHED",
    run_id: UUID | None = None,
    wykonaj: bool = True,
) -> CanonicalRun:
    run = CanonicalRun(
        id=run_id or uuid4(),
        case_id="case-nastawy",
        project_id="proj-nastawy",
        analysis_type=analysis_type,
        status=status_,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash-nastawy",
        input_hash="in-hash-nastawy",
        snapshot=enm.model_dump(mode="json"),
        validation={},
        readiness={},
        options={
            "fault_type": fault_type,
            "c_factor": c_factor,
            "thermal_time_seconds": 1.0,
        },
    )
    run.finished_at = run.created_at
    if wykonaj:
        if analysis_type == "short_circuit_sn":
            _execute_short_circuit(run)
        elif analysis_type == "PF":
            _execute_power_flow(run)
    return run


# ---------------------------------------------------------------------------
# linie_kandydujace / kandydaci_nastepnej_szyny
# ---------------------------------------------------------------------------


def test_linie_kandydujace_zwraca_linie_z_kompletem_danych() -> None:
    enm = _siec_promieniowa()
    linie = linie_kandydujace(enm.model_dump(mode="json"))
    assert [linia.ref_id for linia in linie] == ["ln1", "ln2"]
    assert linie[0].i_nominal_a == 200.0
    assert linie[0].conductor_material == "Al"


def test_linie_kandydujace_wyklucza_galaz_bez_danych_katalogowych() -> None:
    enm = _siec_promieniowa()
    enm2 = enm.model_copy(update={"branches": [*enm.branches, _linia_bez_danych_katalogowych()]})
    linie = linie_kandydujace(enm2.model_dump(mode="json"))
    assert "ln_bez_katalogu" not in {linia.ref_id for linia in linie}


def test_kandydaci_nastepnej_szyny_rozgalezienie() -> None:
    enm = _siec_rozgalezienie()
    kandydaci = kandydaci_nastepnej_szyny(enm.model_dump(mode="json"), "ln1")
    assert kandydaci == ["b_b", "b_c"]


def test_kandydaci_nastepnej_szyny_slepy_koniec_jest_pusty() -> None:
    enm = _siec_slepy_koniec()
    kandydaci = kandydaci_nastepnej_szyny(enm.model_dump(mode="json"), "ln1")
    assert kandydaci == []


# ---------------------------------------------------------------------------
# zbuduj_wejscie_nastaw — sciezka pozytywna + wiazanie 9 wczesniej brakujacych pol
# ---------------------------------------------------------------------------


def test_zbuduj_wejscie_nastaw_wypelnia_wszystkie_dziewiec_wczesniej_brakujacych_pol() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    wejscie = zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)
    ei = wejscie.engine_input

    # Galaz c_min (3 pola) — inna niz c_max, bo c=1.0 != c=1.10 na TEJ SAMEJ sieci.
    assert ei.ik3_min_beginning_a > 0
    assert ei.ik3_min_end_a > 0
    assert ei.ik2_min_end_a > 0
    assert ei.ik3_min_beginning_a != ei.ik3_max_beginning_a
    assert ei.ik3_min_end_a != ei.ik3_max_end_a
    # Zwarcie 2F < zwarcie 3F w tym samym wezle (fizyka IEC 60909: I_k2 = (sqrt(3)/2) I_k3).
    assert ei.ik2_min_end_a < ei.ik3_min_end_a

    # Rozplyw (1 pole).
    assert ei.i_load_max_a > 0

    # Nastawy — wyjscia silnika Hoppela (5 pol), silnik przestaje byc wyspa.
    from application.protection_settings.engine import ProtectionSettingsEngine

    wynik = ProtectionSettingsEngine.calculate(ei)
    assert wynik.delayed.i_setting_a > 0
    assert wynik.delayed.t_setting_s > 0
    assert wynik.instantaneous.i_setting_a > 0
    assert wynik.thermal.i_th_dop_a > 0
    assert wynik.thermal.j_thn > 0


def test_zbuduj_wejscie_nastaw_deterministyczny_dla_tych_samych_wejsc() -> None:
    kotwica1 = _kotwica(_siec_promieniowa(), run_id=UUID(int=1))
    kotwica2 = _kotwica(_siec_promieniowa(), run_id=UUID(int=1))
    w1 = zbuduj_wejscie_nastaw(kotwica1, line_id="ln1", next_bus_id="b_b", c_min=1.0)
    w2 = zbuduj_wejscie_nastaw(kotwica2, line_id="ln1", next_bus_id="b_b", c_min=1.0)
    assert w1.engine_input == w2.engine_input


def test_k_b_k_bth_delta_t_s_pochodza_z_parametrow_wywolania_nie_z_opcji_kotwicy() -> None:
    """Zrodlo konfiguracji (k_b/k_bth/delta_t_s) to PARAMETRY WYWOLANIA, nigdy
    `kotwica.options` (ktore niesie wylacznie fault_type/c_factor/thermal_time_seconds
    — SC nie zna k_b/k_bth). Jesli kod kiedys zaczalby czytac je z opcji kotwicy,
    wartosci nieobecne w options dalyby CICHO domyslne 1.2/1.1/0.3 zamiast
    jawnie przekazanych — ten test lapie taki rozjazd zrodla."""
    kotwica = _kotwica(_siec_promieniowa())
    assert "k_b" not in kotwica.options and "k_bth" not in kotwica.options
    wejscie = zbuduj_wejscie_nastaw(
        kotwica,
        line_id="ln1",
        next_bus_id="b_b",
        c_min=1.0,
        delta_t_s=0.45,
        k_b=1.35,
        k_bth=1.18,
    )
    assert wejscie.engine_input.k_b == 1.35
    assert wejscie.engine_input.k_bth == 1.18
    assert wejscie.engine_input.delta_t_s == 0.45


# ---------------------------------------------------------------------------
# Iloczyn cech: kotwica zlego rodzaju/stanu
# ---------------------------------------------------------------------------


def test_kotwica_niezakonczona_odmawia() -> None:
    kotwica = _kotwica(_siec_promieniowa(), status_="RUNNING", wykonaj=False)
    with pytest.raises(BrakDanychNastawError, match="nie jest zakończony"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


def test_kotwica_rodzaju_rozplyw_odmawia() -> None:
    kotwica = _kotwica(_siec_promieniowa(), analysis_type="PF")
    with pytest.raises(BrakDanychNastawError, match="short_circuit_sn"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


def test_kotwica_zwarcia_dwufazowego_odmawia_bo_to_nie_galaz_maksymalna() -> None:
    kotwica = _kotwica(_siec_promieniowa(), fault_type="2F")
    with pytest.raises(BrakDanychNastawError, match="TRÓJFAZOWYM"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


def test_kotwica_c_factor_ponizej_progu_odmawia() -> None:
    kotwica = _kotwica(_siec_promieniowa(), c_factor=0.95)
    with pytest.raises(BrakDanychNastawError, match="galezi maksymalnej|maksymalnej"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


@pytest.mark.parametrize("c_min", [0.0, -1.0, 1.20])
def test_c_min_poza_dopuszczalnym_zakresem_odmawia(c_min: float) -> None:
    kotwica = _kotwica(_siec_promieniowa(), c_factor=1.10)
    with pytest.raises(BrakDanychNastawError, match="c_min"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=c_min)


def test_c_min_rowny_c_max_jest_dopuszczalny_brzeg() -> None:
    kotwica = _kotwica(_siec_promieniowa(), c_factor=1.10)
    wejscie = zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.10)
    assert wejscie.engine_input.ik3_min_beginning_a == pytest.approx(
        wejscie.engine_input.ik3_max_beginning_a
    )


def test_linia_nieznana_odmawia() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    with pytest.raises(BrakDanychNastawError, match="ln_nieznana"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln_nieznana", next_bus_id="b_b", c_min=1.0)


def test_linia_bez_danych_katalogowych_odmawia() -> None:
    enm = _siec_promieniowa()
    enm2 = enm.model_copy(update={"branches": [*enm.branches, _linia_bez_danych_katalogowych()]})
    kotwica = _kotwica(enm2)
    with pytest.raises(BrakDanychNastawError, match="katalogowych"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln_bez_katalogu", next_bus_id="b_b", c_min=1.0)


def test_nastepna_szyna_spoza_migawki_odmawia() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    with pytest.raises(BrakDanychNastawError, match="b_nieznana"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_nieznana", c_min=1.0)


def test_nastepna_szyna_bez_zwarcia_odmawia() -> None:
    """Szyna istnieje w migawce, ale nie jest raportowalnym punktem zwarcia kotwicy."""
    enm = _siec_promieniowa()
    kotwica = _kotwica(enm)
    # Usun wiersz wyniku dla b_b z zamrozonego wyniku kotwicy (symulacja luki).
    from enm.mapping import ref_to_graph_id

    graf_b = ref_to_graph_id("b_b")
    kotwica.raw_result["results"] = [
        wiersz for wiersz in kotwica.raw_result["results"] if wiersz.get("fault_node_id") != graf_b
    ]
    with pytest.raises(BrakDanychNastawError, match="nie zawiera prądu zwarcia 3F"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


def test_zbuduj_wejscie_nastaw_nie_mutuje_migawki_kotwicy_pin_spojnosci() -> None:
    """Pin architektoniczny karty PACK-NASTAWY, PRZEPISANY na kanon CV-3-W
    (karta CV-3-W, 2026-09-05 — zmiana kanonu, nie regresja testu, zob. Zero-Debt
    pkt 2 CLAUDE.md).

    Znalezisko nadzoru (2026-08-14, czwarta instancja klasy deklaracja-bez-testu
    w tej fali): docstring i meldunek twierdzily, ze trzy warianty w pamieci sa
    GWARANTOWANIE spojne z ta sama migawka kotwicy, ale podmiana migawki wariantu
    na obca nie czerwienila ZADNEGO z 25 testow. Ten pin przypinal spojnosc WPROST
    na konstruktorach wariantow `_wariant_zwarciowy`/`_wariant_rozplywu`
    (rekonstruowanych bezposrednio w tescie) — CV-3-W USUNELA te prywatne
    konstruktory: trzy warianty (SC 3F@c_min, SC 2F@c_min, PF) powstaja dzis
    WYLACZNIE przez fabryke rdzenia CV-3.1 `enm.canonical_analysis.bieg_wariantu`
    na migawce `enm.scenariusze.apply_scenario(model_kotwicy, SCENARIUSZ_NORMALNY)`.

    INTENCJA oryginalnego pinu BEZ ZMIAN: trzy warianty licza sie na TEJ SAMEJ
    tresci modelu co kotwica, z KOPII (nie referencji) — wywolanie
    `zbuduj_wejscie_nastaw` NIE mutuje snapshotu/wyniku kotwicy w pamieci (Case
    Immutability). Literalna rownosc `snapshot_hash`/`input_hash` wariantu z
    kotwica PRZESTAJE byc kontraktem po migracji: `bieg_wariantu` liczy OBA
    hashe uczciwie z migawki i WLASNYCH opcji wariantu (inny `fault_type`/
    `c_factor` per wariant daje inny, poprawny `input_hash` — to POPRAWA
    architektoniczna, nie regresja), wiec ten pin sprawdza TRESC migawki, nie
    bookkeeping biegu.
    """
    kotwica = _kotwica(_siec_promieniowa())
    snapshot_przed = copy.deepcopy(kotwica.snapshot)
    raw_result_przed = copy.deepcopy(kotwica.raw_result)

    # Ta sama fabryka migawki, ktorej `zbuduj_wejscie_nastaw` uzywa WEWNATRZ dla
    # wszystkich trzech wariantow — dowod, ze wariant liczy sie na TRESCI kotwicy.
    enm_kotwicy = EnergyNetworkModel.model_validate(kotwica.snapshot)
    migawka = apply_scenario(enm_kotwicy, SCENARIUSZ_NORMALNY)
    assert migawka.snapshot == kotwica.snapshot, "wariant liczy sie na tej samej tresci co kotwica"
    assert migawka.snapshot is not kotwica.snapshot, "migawka wariantu to KOPIA, nie referencja"

    wejscie = zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)

    assert wejscie.engine_input.ik3_min_beginning_a > 0  # dowod, ze warianty faktycznie policzono
    assert kotwica.snapshot == snapshot_przed, "kotwica bazowa NIETKNIETA (Case Immutability)"
    assert kotwica.raw_result == raw_result_przed, "zamrozony wynik kotwicy NIETKNIETY"


# ---------------------------------------------------------------------------
# CV-4.2b: warianty nastaw licza TEN SAM model stacji co kotwica (para audytu 2
# dziedziczona), a bez fabryki wolajacego odmawiaja jawnie.
# ---------------------------------------------------------------------------


def test_warianty_nastaw_dziedzicza_pare_audit2_kotwicy() -> None:
    from application.protection_settings.batch_run import (
        _opcje_audit2_kotwicy,
        _opcje_wariantu_zwarciowego,
    )

    kotwica = _kotwica(_siec_promieniowa(), wykonaj=False)
    assert _opcje_audit2_kotwicy(kotwica) == {}
    bez_pary = _opcje_wariantu_zwarciowego(kotwica, fault_type="3F", c_factor=1.0)
    assert "audit2_project_id" not in bez_pary and "audit2_station_id" not in bez_pary

    para = {"audit2_project_id": str(uuid4()), "audit2_station_id": "stacja-nastaw"}
    kotwica.options = {**kotwica.options, **para}
    assert _opcje_audit2_kotwicy(kotwica) == para
    z_para = _opcje_wariantu_zwarciowego(kotwica, fault_type="2F", c_factor=1.0)
    assert {k: z_para[k] for k in para} == para
    assert z_para["fault_type"] == "2F" and z_para["c_factor"] == 1.0


def test_kotwica_z_para_audit2_bez_fabryki_odmawia_jawnie() -> None:
    kotwica = _kotwica(_siec_promieniowa())
    kotwica.options = {
        **kotwica.options,
        "audit2_project_id": str(uuid4()),
        "audit2_station_id": "stacja-nastaw",
    }

    with pytest.raises(BrakDanychNastawError, match="nie dostal fabryki UnitOfWork"):
        zbuduj_wejscie_nastaw(kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0)


def test_kotwica_z_para_audit2_i_fabryka_liczy_komplet_wariantow(uow_factory) -> None:
    kotwica = _kotwica(_siec_promieniowa())
    kotwica.options = {
        **kotwica.options,
        "audit2_project_id": str(uuid4()),
        "audit2_station_id": "stacja-nastaw",
    }

    wejscie = zbuduj_wejscie_nastaw(
        kotwica, line_id="ln1", next_bus_id="b_b", c_min=1.0, uow_factory=uow_factory
    )

    assert wejscie.engine_input is not None
