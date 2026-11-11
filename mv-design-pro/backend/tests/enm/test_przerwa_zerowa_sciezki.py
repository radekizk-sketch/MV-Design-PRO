"""Węzeł bez drogi prądu zerowego nie dostaje I″k1 na ŻADNEJ ścieżce (karta PRZERWA-ZEROWA).

Zgłoszenie: zwarcie 1F w węźle bez drogi zerowej liczy się jak w sieci uziemionej bezpośrednio
(pomiar 4062,43 A). Inwentarz ścieżek (reguła KLASA NIE INSTANCJA) wykazał, że bieg kanoniczny
odmawiał, a liczba powstawała poza nim: pakiet dowodowy zwarć niesymetrycznych
(``short_circuit_binding`` → rdzeń 1F z Z0 kotwicy numerycznej), kotwica SN domeny nN
(``upstream_equivalent`` publikowała Z0 = 2,25·10⁻⁶ Ω) i każdy wołający budowniczego Z0-bus bez
przyczyn (skasowane ``build_zero_sequence_zbus``/``_with_trace``).

FIZYKA (IEC 60909-0:2016 rozdz. 1 i §4.3.1): I″k1 = √3·c·U_n/|Z_1 + Z_2 + Z_0|. Węzeł bez
uziemienia przez małą impedancję nie ma prądu zwarcia doziemnego tej normy: w sieci izolowanej
płynie prąd pojemnościowy I_C (B_0, ocena doziemienia sieci), w skompensowanej prąd resztkowy,
bez żadnej drogi — nic. Kotwica numeryczna (Y_0,ii = 10⁶ pu, czyli Z_0 ≈ 0) domyka macierz
i NIE jest impedancją: liczba z niej to I″k1 dla Z_0 = 0, np. szyna SN 15 kV za Dyn11
z Z_1 = 0,35 + j3,5 Ω: √3·1,1·15 kV/|2·Z_1| = 4062,43 A — wartość zgłoszenia.

ILOCZYN CECH: przyczyna {brak_drogi (nN za Yy0), poza_zakresem izolowana (SN za YNd11 / Dyn11 —
wiersz kotwicy), poza_zakresem skompensowana (YNd11 z dławikiem — Z0 skończone, bez kotwicy),
brak_danych (110 kV ze źródłem bez Z0 — Z0 skończone z uzwojenia)} × ścieżka {bieg kanoniczny
1F i 2F+G, zwarcia doziemne szyn (prąd uziomowy V12.6), punkt rdzenia biegu i wkładów na
żądanie, dyspozycja rdzenia ``wynik_zwarcia_punktu``, t_b punktu ``czas_tb_punktu``,
wiązanie pakietu dowodowego, pakiet dowodowy biegu (ZIP), kotwica SN domeny nN} × węzeł
kontrolny liczony (nN za Dyn11 z yn uziemionym — liczba równa na wszystkich ścieżkach).

PREDYKATY PARAMI: dla każdego węzła sieci „wiersz biegu bez liczby” ⇔ „węzeł w przyczynach
sieci zerowej” ⇔ „wiązanie pakietu zwraca przyczynę” — jedno źródło
(``enm.mapping.zbuduj_siec_zerowa``).
"""

from __future__ import annotations

import io
import json
import math
import zipfile
from datetime import UTC, datetime
from typing import Any

import pytest
from application.analyses.lv_domain.upstream_equivalent import build_upstream_equivalent_snapshot
from application.proof_engine.pakiet_biegu import dostepnosc_pakietu, zbuduj_pakiet_biegu
from application.solvers.short_circuit_binding import (
    czas_tb_punktu,
    wynik_zwarcia_punktu,
    zwarcie_niesymetryczne_ze_snapshotu,
)
from enm.assembler import zloz_wejscie_zwarcia
from enm.canonical_analysis import (
    _wynik_solvera_punktu,
    create_run,
    execute_run,
    reset_canonical_runs,
    zwarcia_doziemne_szyn,
)
from enm.domain_operations import execute_domain_operation
from enm.mapping import _ref_to_uuid, map_enm_to_network_graph, zbuduj_siec_zerowa
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    GroundingConfig,
    Source,
    Substation,
    Transformer,
)
from enm.store import reset_enm_store, set_enm
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.odmowa_danych import OdmowaNazwana

from tests.enm.test_skladowa_zerowa_zu import _siec as _siec_zu
from tests.enm.test_skladowa_zerowa_zu import _szyny as _szyny_zu

C_MAX = 1.1
UN_SN_KV = 15.0
Z1_GPZ_OHM = complex(0.35, 3.5)


def _tr(ref: str, hv: str, lv: str, uhv: float, ulv: float, grupa: str, **kw: Any) -> Transformer:
    wn = uhv > 100.0
    return Transformer(
        ref_id=ref,
        name=f"Transformator {ref.upper()}",
        hv_bus_ref=hv,
        lv_bus_ref=lv,
        sn_mva=25.0 if wn else 0.63,
        uhv_kv=uhv,
        ulv_kv=ulv,
        uk_percent=11.0 if wn else 4.0,
        pk_kw=120.0 if wn else 6.5,
        vector_group=grupa,
        **kw,
    )


def _siec_wn() -> EnergyNetworkModel:
    """110 kV (źródło bez Z0 — brak_danych) → YNd11 → SN izolowana (kotwica) → Dyn11 → nN-1
    (liczony, kontrola) i Yy0 → nN-2 (brak drogi)."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Przerwa zerowa WN", defaults=ENMDefaults(sn_nominal_kv=UN_SN_KV)),
        buses=[
            Bus(ref_id="wn", name="Szyna 110 kV", voltage_kv=110.0),
            Bus(ref_id="sn", name="Szyna SN", voltage_kv=UN_SN_KV),
            Bus(ref_id="nn1", name="Szyna nN uziemiona", voltage_kv=0.4),
            Bus(ref_id="nn2", name="Szyna nN bez drogi", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="q", name="Sieć 110 kV", bus_ref="wn", model="thevenin", r_ohm=0.4, x_ohm=4.0
            )
        ],
        transformers=[
            _tr(
                "t1",
                "wn",
                "sn",
                110.0,
                UN_SN_KV,
                "YNd11",
                hv_neutral=GroundingConfig(type="directly_grounded"),
            ),
            _tr(
                "t2",
                "sn",
                "nn1",
                UN_SN_KV,
                0.4,
                "Dyn11",
                lv_neutral=GroundingConfig(type="directly_grounded"),
                lv_voltage_tolerance="PLUS_6",
            ),
            _tr("t3", "sn", "nn2", UN_SN_KV, 0.4, "Yy0", lv_voltage_tolerance="PLUS_6"),
        ],
        substations=[
            Substation(
                ref_id="st1",
                name="Stacja nN 1",
                station_type="mv_lv",
                bus_refs=["nn1"],
                transformer_refs=["t2"],
            )
        ],
    )


def _siec_sn(dlawik: bool) -> EnergyNetworkModel:
    """Szyna SN z GPZ (Z_1 = 0,35 + j3,5 Ω). ``dlawik`` — YNd11 z punktem neutralnym SN przez
    dławik (sieć skompensowana, Z0 skończone bez kotwicy); inaczej Dyn11 (SN izolowana,
    wiersz kotwicy — sieć zgłoszenia 4062,43 A)."""
    tr = (
        _tr(
            "t1",
            "sn",
            "nn",
            UN_SN_KV,
            0.4,
            "YNd11",
            hv_neutral=GroundingConfig(type="petersen_coil", x_ohm=120.0),
            lv_voltage_tolerance="PLUS_6",
        )
        if dlawik
        else _tr(
            "t1",
            "sn",
            "nn",
            UN_SN_KV,
            0.4,
            "Dyn11",
            lv_neutral=GroundingConfig(type="directly_grounded"),
            lv_voltage_tolerance="PLUS_6",
        )
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="Przerwa zerowa SN", defaults=ENMDefaults(sn_nominal_kv=UN_SN_KV)),
        buses=[
            Bus(ref_id="sn", name="Szyna SN", voltage_kv=UN_SN_KV),
            Bus(ref_id="nn", name="Szyna nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="q",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=Z1_GPZ_OHM.real,
                x_ohm=Z1_GPZ_OHM.imag,
            )
        ],
        transformers=[tr],
        substations=[
            Substation(
                ref_id="st1",
                name="Stacja nN",
                station_type="mv_lv",
                bus_refs=["nn"],
                transformer_refs=["t1"],
            )
        ],
    )


def _gpz(wariant: str, *, zrodlo_izolowane: bool = False) -> EnergyNetworkModel:
    """GPZ ścieżką projektanta (operacje domenowe, transformator 110/15 kV Yd11 z katalogu,
    zespół uziemiający wariantu — ``test_skladowa_zerowa_zu._siec``). ``zrodlo_izolowane`` —
    punkt neutralny sieci 110 kV opisany jako izolowany (korekta ekspercka
    ``update_element_parameters``): węzeł 110 kV bez żadnego bocznika — ``brak_drogi``."""
    migawka = _siec_zu(wariant)
    if zrodlo_izolowane:
        wynik = execute_domain_operation(
            enm_dict=migawka,
            op_name="update_element_parameters",
            payload={
                "element_ref": migawka["sources"][0]["ref_id"],
                "parameters": {"neutral_grounding": {"type": "isolated"}},
            },
        )
        assert not wynik.get("error"), wynik.get("error")
        migawka = wynik["snapshot"]
    return EnergyNetworkModel.model_validate(migawka)


def _szyna_wn(enm: EnergyNetworkModel) -> str:
    return next(b.ref_id for b in enm.buses if b.voltage_kv == 110.0)


def _szyna_sn(enm: EnergyNetworkModel) -> str:
    return _szyny_zu(enm.model_dump(mode="json"))[0]


def _stala(ref: str) -> Any:
    return lambda _enm: ref


#: przypadek → (budowa modelu, szyna zwarcia, oczekiwana przyczyna — ``None`` = węzeł kontrolny
#: liczony, model przez bieg kanoniczny ``create_run``/``execute_run``). Modele „GPZ” powstają
#: ścieżką projektanta z katalogiem (bramka katalogowa biegu); modele surowe (sieć zgłoszenia,
#: Yy0) idą ścieżkami bez bramki katalogowej (assembler, wiązanie, kotwica SN domeny nN).
PRZYPADKI: dict[str, tuple[Any, Any, str | None, bool]] = {
    "gpz_brak_danych_wn": (lambda: _gpz("izolowany"), _szyna_wn, "brak_danych", True),
    "gpz_brak_drogi_wn": (
        lambda: _gpz("rezystor", zrodlo_izolowane=True),
        _szyna_wn,
        "brak_drogi",
        True,
    ),
    "gpz_izolowana_sn": (lambda: _gpz("izolowany"), _szyna_sn, "poza_zakresem_iec60909", True),
    "gpz_skompensowana_sn": (lambda: _gpz("dlawik"), _szyna_sn, "poza_zakresem_iec60909", True),
    "gpz_kontrola_sn_rezystor": (lambda: _gpz("rezystor"), _szyna_sn, None, True),
    "surowa_brak_danych_wn": (_siec_wn, _stala("wn"), "brak_danych", False),
    "surowa_izolowana_sn_za_ynd": (_siec_wn, _stala("sn"), "poza_zakresem_iec60909", False),
    "surowa_brak_drogi_za_yy": (_siec_wn, _stala("nn2"), "brak_drogi", False),
    "surowa_izolowana_sn_za_dyn": (
        lambda: _siec_sn(False),
        _stala("sn"),
        "poza_zakresem_iec60909",
        False,
    ),
    "surowa_skompensowana_sn": (
        lambda: _siec_sn(True),
        _stala("sn"),
        "poza_zakresem_iec60909",
        False,
    ),
    "surowa_kontrola_nn_uziemiony": (_siec_wn, _stala("nn1"), None, False),
}
WSZYSTKIE = sorted(PRZYPADKI)
BEZ_WYNIKU = sorted(k for k, v in PRZYPADKI.items() if v[2] is not None)
PRZEZ_BIEG = sorted(k for k, v in PRZYPADKI.items() if v[3])


def _przypadek(nazwa: str) -> tuple[EnergyNetworkModel, str, str | None]:
    budowa, szyna, przyczyna, _ = PRZYPADKI[nazwa]
    enm = budowa()
    return enm, szyna(enm), przyczyna


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg(enm: EnergyNetworkModel, typ: str, klucz: str):
    set_enm(klucz, enm)
    run = create_run(
        case_id=klucz,
        klucz_twin=klucz,
        analysis_type="short_circuit_sn",
        options={"fault_type": typ},
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    return wynik


def _wiersz(wynik: Any, szyna: str) -> dict[str, Any]:
    return next(r for r in wynik.raw_result["results"] if r["fault_node_id"] == _ref_to_uuid(szyna))


def _wejscie(enm: EnergyNetworkModel, typ: str = "1F"):
    return zloz_wejscie_zwarcia(enm.model_dump(mode="json"), {"fault_type": typ, "scenario": "max"})


def test_sonda_wartosci_zgloszenia_to_ik1_dla_z0_rownego_zero() -> None:
    """Sonda: wiersz kotwicy szyny SN za Dyn11 to Z0 = 1/10⁶ pu·Z_base = 2,25·10⁻⁶ Ω, a I″k1
    z niego — 4062,43 A = √3·c·U_n/|2·Z_1| (Z_0 = 0, uziemienie bezpośrednie, którego nie ma).
    Węzeł niesie przyczynę, więc ta liczba nie wychodzi na żadną ścieżkę (testy niżej)."""
    enm = _siec_sn(False)
    graf = map_enm_to_network_graph(enm)
    siec = zbuduj_siec_zerowa(enm, graf)
    wezel = _ref_to_uuid("sn")
    builder = AdmittanceMatrixBuilder(graf)
    builder.build(siec_zwarciowa=True)
    z0_kotwicy = complex(
        siec.z0_bus[builder.node_id_to_index[wezel], builder.node_id_to_index[wezel]]
    )
    assert z0_kotwicy * builder.get_zbase_ohm(wezel) == pytest.approx(UN_SN_KV**2 / 100.0 * 1e-6)
    ik1_z0_zero = math.sqrt(3.0) * C_MAX * UN_SN_KV * 1e3 / abs(2.0 * Z1_GPZ_OHM)
    assert ik1_z0_zero == pytest.approx(4062.43, abs=0.01)
    assert siec.przyczyny[wezel].przyczyna == "poza_zakresem_iec60909"


@pytest.mark.parametrize("przypadek", PRZEZ_BIEG)
@pytest.mark.parametrize("typ", ["1F", "2FG"])
def test_bieg_kanoniczny_wiersz_bez_liczby_z_przyczyna(przypadek: str, typ: str) -> None:
    enm, szyna, przyczyna = _przypadek(przypadek)
    wiersz = _wiersz(_bieg(enm, typ, f"{przypadek}-{typ}"), szyna)
    if przyczyna is None:
        assert wiersz["ikss_a"] > 0
        assert "brak_wyniku_zerowego" not in wiersz
        return
    assert wiersz.get("ikss_a") is None
    brak = wiersz["brak_wyniku_zerowego"]
    assert brak["przyczyna"] == przyczyna
    assert brak["kod"].startswith("fault.zero_sequence_")
    assert brak["status"] in ("NIE_DOTYCZY", "BRAK_PODSTAWY")
    assert brak["wyjasnienie"]["zdanie_pl"]


@pytest.mark.parametrize("przypadek", WSZYSTKIE)
def test_zwarcia_doziemne_szyn_bez_liczby_z_przyczyna(przypadek: str) -> None:
    """Prąd uziomowy stacji (V12.6, EN 50522) czyta I″k1 z ``zwarcia_doziemne_szyn``."""
    enm, szyna, przyczyna = _przypadek(przypadek)
    wynik = zwarcia_doziemne_szyn(enm, [szyna])[szyna]
    if przyczyna is None:
        assert wynik.ikss_a is not None and wynik.ikss_a > 0
        assert wynik.brak_pl is None
        return
    assert wynik.ikss_a is None
    assert wynik.brak_pl


@pytest.mark.parametrize("przypadek", BEZ_WYNIKU)
@pytest.mark.parametrize("typ", ["1F", "2FG"])
def test_rdzen_nie_dostaje_wezla_z_przyczyna(przypadek: str, typ: str) -> None:
    """Punkt rdzenia biegu i wkładów na żądanie (``_wynik_solvera_punktu``) — ``None``;
    dyspozycja rdzenia i t_b punktu wołane wprost — odmowa nazwana z kodem przyczyny."""
    enm, szyna, przyczyna = _przypadek(przypadek)
    wejscie = _wejscie(enm, typ)
    wezel = _ref_to_uuid(szyna)
    assert _wynik_solvera_punktu(wejscie, wezel, c_factor=C_MAX, wklady=True) is None
    with pytest.raises(OdmowaNazwana) as wynik_odmowy:
        wynik_zwarcia_punktu(
            wejscie, wezel, c_factor=C_MAX, czas_tb=czas_tb_roboczy(), wklady=False, z_f_ohm=None
        )
    assert wynik_odmowy.value.kod == wejscie.brak_wyniku_zerowego[wezel].kod
    assert wynik_odmowy.value.dane["przyczyna"] == przyczyna
    assert str(wynik_odmowy.value) == wejscie.brak_wyniku_zerowego[wezel].opis_pl
    with pytest.raises(OdmowaNazwana):
        czas_tb_punktu(wejscie, wezel, c_factor=C_MAX, z_f_ohm=None, pola_lokalne={wezel: ("x",)})


@pytest.mark.parametrize("przypadek", WSZYSTKIE)
def test_wiazanie_pakietu_daje_2f_i_przyczyne_albo_1f_rowne_biegowi(przypadek: str) -> None:
    """Wiązanie pakietu dowodowego: węzeł liczony — 1F równe punktowi rdzenia biegu
    (``_wynik_solvera_punktu`` 1F); węzeł z przyczyną — 2F równe punktowi rdzenia biegu 2F
    i przyczyna (Z0 brak)."""
    enm, szyna, przyczyna = _przypadek(przypadek)
    wezel = _ref_to_uuid(szyna)
    zwarcie = zwarcie_niesymetryczne_ze_snapshotu(
        snapshot=enm.model_dump(mode="json"),
        fault_node_id=wezel,
        scenariusz="MAX",
        nadpisanie_c=None,
        tk_s=1.0,
        tb_s=None,
    )
    typ_biegu = "1F" if przyczyna is None else "2F"
    wejscie = _wejscie(enm, typ_biegu)
    punkt = _wynik_solvera_punktu(wejscie, wezel, c_factor=zwarcie.wynik.c_factor, wklady=False)
    assert punkt is not None
    assert zwarcie.wynik.ikss_a == pytest.approx(punkt[0].ikss_a, rel=1e-12)
    if przyczyna is None:
        assert zwarcie.brak_wyniku_zerowego is None
        assert zwarcie.wynik.short_circuit_type.value == "1F"
        assert zwarcie.wynik.z0_ohm is not None
        return
    assert zwarcie.brak_wyniku_zerowego is not None
    assert zwarcie.brak_wyniku_zerowego.przyczyna == przyczyna
    assert zwarcie.wynik.short_circuit_type.value == "2F"
    assert zwarcie.wynik.z0_ohm is None


def test_sonda_2f_szyny_sn_zgloszenia() -> None:
    """Sonda liczbowa: szyna SN zgłoszenia w pakiecie — I″k2 = c·U_n/|2·Z_1| = 2345,44 A
    (IEC 60909-0 §4.3.1 wzór 22, Z_2 = Z_1), a nie I″k1 = 4062,43 A z Z_0 kotwicy."""
    zwarcie = zwarcie_niesymetryczne_ze_snapshotu(
        snapshot=_siec_sn(False).model_dump(mode="json"),
        fault_node_id=_ref_to_uuid("sn"),
        scenariusz="MAX",
        nadpisanie_c=None,
        tk_s=1.0,
        tb_s=None,
    )
    assert zwarcie.wynik.ikss_a == pytest.approx(
        C_MAX * UN_SN_KV * 1e3 / abs(2.0 * Z1_GPZ_OHM), rel=1e-9
    )
    assert zwarcie.wynik.ikss_a == pytest.approx(2345.44, abs=0.01)


def _wpisy_pakietu(wynik: Any, szyna: str) -> dict[str, bytes]:
    _, tresc = zbuduj_pakiet_biegu(wynik, punkt=_ref_to_uuid(szyna), nazwa_przypadku="Przypadek")
    with zipfile.ZipFile(io.BytesIO(tresc)) as paczka:
        return {nazwa: paczka.read(nazwa) for nazwa in paczka.namelist()}


@pytest.mark.parametrize("przypadek", PRZEZ_BIEG)
@pytest.mark.parametrize("typ", ["1F", "2F"])
def test_pakiet_biegu_dowod_2f_i_odmowa_nazwana_doziemnych(przypadek: str, typ: str) -> None:
    """Pakiet dowodowy biegu 1F i 2F (ścieżka projektanta: ekran dowodu → ZIP). Punkt
    z przyczyną: SC2F.zip + odmowy SC1FZ/SC2FZ (status, kod, wyjaśnienie) i ŻADNEGO dowodu
    doziemnego; punkt kontrolny: trzy dowody, bez odmów."""
    enm, szyna, przyczyna = _przypadek(przypadek)
    wynik = _bieg(enm, typ, f"pakiet-{przypadek}-{typ}")
    dostepnosc = dostepnosc_pakietu(wynik)
    assert _ref_to_uuid(szyna) in [p["target_id"] for p in dostepnosc["punkty"]]
    assert any("SC1FZ.odmowa.json" in pozycja for pozycja in dostepnosc["zawartosc_pl"])
    wpisy = _wpisy_pakietu(wynik, szyna)
    if przyczyna is None:
        assert sorted(w for w in wpisy if w.startswith("pakiet_dowodowy/SC")) == [
            "pakiet_dowodowy/SC1FZ.zip",
            "pakiet_dowodowy/SC2F.zip",
            "pakiet_dowodowy/SC2FZ.zip",
        ]
        assert not any(w.endswith(".odmowa.json") for w in wpisy)
        return
    assert sorted(w for w in wpisy if w.startswith("pakiet_dowodowy/SC")) == [
        "pakiet_dowodowy/SC1FZ.odmowa.json",
        "pakiet_dowodowy/SC2F.zip",
        "pakiet_dowodowy/SC2FZ.odmowa.json",
    ]
    for nazwa, rodzaj in (("SC1FZ", "ONE_PHASE_TO_GROUND"), ("SC2FZ", "TWO_PHASE_TO_GROUND")):
        odmowa = json.loads(wpisy[f"pakiet_dowodowy/{nazwa}.odmowa.json"])
        assert odmowa["rodzaj_zwarcia"] == rodzaj
        assert odmowa["dowod"] is None
        assert odmowa["przyczyna"] == przyczyna
        assert odmowa["kod"].startswith("fault.zero_sequence_")
        assert odmowa["status"] in ("NIE_DOTYCZY", "BRAK_PODSTAWY")
        assert odmowa["wyjasnienie"]["zdanie_pl"]


def test_pakiet_biegu_deterministyczny_dla_punktu_bez_wyniku_zerowego() -> None:
    """Determinizm pakietu z odmową (reguła jak ``test_pakiet_jest_deterministyczny_bajt_w_bajt``
    w ``tests/api/test_pakiet_dowodowy_biegu.py``): ten sam przebieg pobrany dwa razy → plik
    bajt w bajt ten sam; dwa niezależne biegi tego samego modelu → odmowy SC1FZ/SC2FZ bajt
    w bajt te same (dowód SC2F niesie identyfikator i chwilę biegu, więc między biegami
    różni się metryką biegu, nie treścią odmowy)."""
    enm = _gpz("izolowany")
    szyna = _szyna_sn(enm)
    wynik = _bieg(enm, "1F", "det")
    pierwszy = _wpisy_pakietu(wynik, szyna)
    assert pierwszy == _wpisy_pakietu(wynik, szyna)
    reset_canonical_runs()
    drugi = _wpisy_pakietu(_bieg(enm, "1F", "det"), szyna)
    odmowy = sorted(w for w in pierwszy if w.endswith(".odmowa.json"))
    assert odmowy == ["pakiet_dowodowy/SC1FZ.odmowa.json", "pakiet_dowodowy/SC2FZ.odmowa.json"]
    assert {w: pierwszy[w] for w in odmowy} == {w: drugi[w] for w in odmowy}


@pytest.mark.parametrize("dlawik", [False, True], ids=["izolowana", "skompensowana"])
def test_kotwica_sn_domeny_nn_bez_z0_z_przyczyna(dlawik: bool) -> None:
    """Kotwica SN domeny nN (L2): szyna SN bez drogi prądu zerowego przez małą impedancję —
    ``z0_ohm`` = ``None`` i powód = zdanie przyczyny (dawniej 2,25·10⁻⁶ Ω z kotwicy)."""
    enm = _siec_sn(dlawik)
    migawka = build_upstream_equivalent_snapshot(enm, "przypadek", "st1")
    assert migawka["status"] == "OK"
    assert migawka["z0_ohm"] is None
    graf = map_enm_to_network_graph(enm)
    brak = zbuduj_siec_zerowa(enm, graf).przyczyny[_ref_to_uuid("sn")]
    assert migawka["z0_missing_reason_pl"] == brak.opis_pl


def test_kotwica_sn_domeny_nn_z_z0_gdy_sn_uziemiona() -> None:
    """Kontrola: SN uziemiona przez rezystor w punkcie neutralnym uzwojenia SN (YNd11 15/0,4,
    R_N = 40 Ω) — Z0 = Z_T0 + 3·R_N, liczba z tej samej macierzy co bieg."""
    enm = _siec_sn(False)
    enm.transformers[0] = _tr(
        "t1",
        "sn",
        "nn",
        UN_SN_KV,
        0.4,
        "YNd11",
        hv_neutral=GroundingConfig(type="resistor_grounded", r_ohm=40.0),
        lv_voltage_tolerance="PLUS_6",
    )
    migawka = build_upstream_equivalent_snapshot(enm, "przypadek", "st1")
    graf = map_enm_to_network_graph(enm)
    assert _ref_to_uuid("sn") not in zbuduj_siec_zerowa(enm, graf).przyczyny
    z_t0 = complex(6.5e-3 / 0.63, math.sqrt(0.04**2 - (6.5e-3 / 0.63) ** 2)) * UN_SN_KV**2 / 0.63
    assert complex(migawka["z0_ohm"]["r"], migawka["z0_ohm"]["x"]) == pytest.approx(
        z_t0 + 3 * 40.0, rel=1e-6
    )
    assert migawka["z0_missing_reason_pl"] is None


@pytest.mark.parametrize(
    "budowa",
    [
        lambda: _gpz("izolowany"),
        lambda: _gpz("dlawik"),
        lambda: _gpz("rezystor"),
        lambda: _gpz("rezystor", zrodlo_izolowane=True),
    ],
    ids=["izolowany", "dlawik", "rezystor", "rezystor_zrodlo_izolowane"],
)
def test_predykat_jeden_dla_biegu_wiazania_i_sieci_zerowej(budowa: Any) -> None:
    """Parami, dla KAŻDEGO węzła biegu: wiersz 1F bez liczby ⇔ węzeł w przyczynach sieci
    zerowej ⇔ wiązanie pakietu zwraca przyczynę."""
    enm = budowa()
    graf = map_enm_to_network_graph(enm)
    przyczyny = zbuduj_siec_zerowa(enm, graf).przyczyny
    wynik = _bieg(enm, "1F", "predykat")
    assert wynik.raw_result["results"]
    for wiersz in wynik.raw_result["results"]:
        wezel = wiersz["fault_node_id"]
        zwarcie = zwarcie_niesymetryczne_ze_snapshotu(
            snapshot=enm.model_dump(mode="json"),
            fault_node_id=wezel,
            scenariusz="MAX",
            nadpisanie_c=None,
            tk_s=1.0,
            tb_s=None,
        )
        bez_liczby = wiersz.get("ikss_a") is None
        assert bez_liczby == (wezel in przyczyny) == (zwarcie.brak_wyniku_zerowego is not None)


def test_wejscie_pakietu_para_z0_i_przyczyny_z_jednego_zrodla() -> None:
    """``SCAsymmetricalPackInput``: brak Z0 bez przyczyny i przyczyna przy Z0 — odmowa."""
    from application.proof_engine.packs.sc_asymmetrical import SCAsymmetricalPackInput

    wspolne: dict[str, Any] = {
        "project_name": "p",
        "case_name": "c",
        "fault_node_id": "n",
        "run_timestamp": datetime(2026, 1, 1, tzinfo=UTC),
        "solver_version": "v",
        "u_n_kv": 15.0,
        "c_factor": 1.1,
        "u_prefault_kv": 9.5,
        "c_zrodlo": "tabela",
        "z1_ohm": Z1_GPZ_OHM,
        "z2_ohm": Z1_GPZ_OHM,
        "a_operator": complex(-0.5, math.sqrt(3) / 2),
        "tk_s": 1.0,
    }
    with pytest.raises(AssertionError, match="jedno źródło"):
        SCAsymmetricalPackInput(**wspolne, z0_ohm=None)
    with pytest.raises(AssertionError, match="jedno źródło"):
        SCAsymmetricalPackInput(**wspolne, z0_ohm=0j, brak_wyniku_zerowego={"kod": "x"})


@pytest.mark.parametrize("z_f", [None, complex(0.5, 0.2)])
@pytest.mark.parametrize("rodzaj", ["ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND"])
def test_wielkosci_sc1_bez_z0_licza_tylko_2f(rodzaj: str, z_f: complex | None) -> None:
    """Iloczyn: rodzaj zwarcia × impedancja przejścia, Z_0 = None (punkt bez wyniku zerowego).

    ``compute_sc1_asymmetrical_quantities``: 2F nie zależy od Z_0 (pętla Z_1 + Z_2 [+ Z_f],
    IEC 60909-0 §4.3.1) — wynik bez Z_0 równy wynikowi z dowolnym Z_0; 1F-Z i 2F-Z odmawiają
    zamiast liczyć z liczbą zastępczą."""
    from network_model.odmowa_danych import OdmowaDanychError
    from network_model.solvers.short_circuit_asymmetrical_quantities import (
        OPERATOR_FORTESCUE_A,
        compute_sc1_asymmetrical_quantities,
    )

    def licz(z0: complex | None) -> Any:
        return compute_sc1_asymmetrical_quantities(
            fault_type=rodzaj,
            u_n_kv=UN_SN_KV,
            c_factor=C_MAX,
            u_prefault_kv=C_MAX * UN_SN_KV / math.sqrt(3.0),
            z1_ohm=Z1_GPZ_OHM,
            z2_ohm=Z1_GPZ_OHM,
            z0_ohm=z0,
            a_operator=OPERATOR_FORTESCUE_A,
            tk_s=1.0,
            z_f_ohm=z_f,
        )

    if rodzaj != "TWO_PHASE":
        with pytest.raises(OdmowaDanychError, match="impedancji składowej zerowej"):
            licz(None)
        return
    bez_z0, z_kotwica = licz(None), licz(complex(0.0, 2.25e-6))
    assert bez_z0 == z_kotwica
    if z_f is None:
        assert bez_z0.ikss_ka * 1e3 == pytest.approx(2345.44, abs=0.01)


def test_dowod_2f_bez_z0_nie_wypisuje_z0() -> None:
    """Dowód SC2F punktu bez wyniku zerowego: żaden krok nie podstawia ani nie wymienia Z_0
    (brak liczby zastępczej w dowodzie), a kroki doziemne odmawiają wprost."""
    from application.proof_engine.packs.sc_asymmetrical import (
        SCAsymmetricalPackInput,
        SCAsymmetricalProofPack,
    )
    from application.proof_engine.proof_generator import ProofGenerator
    from network_model.solvers.short_circuit_asymmetrical_quantities import OPERATOR_FORTESCUE_A

    dane = SCAsymmetricalPackInput(
        project_name="p",
        case_name="c",
        fault_node_id="n",
        run_timestamp=datetime(2026, 1, 1, tzinfo=UTC),
        solver_version="v",
        u_n_kv=UN_SN_KV,
        c_factor=C_MAX,
        u_prefault_kv=C_MAX * UN_SN_KV / math.sqrt(3.0),
        c_zrodlo="tabela",
        z1_ohm=Z1_GPZ_OHM,
        z2_ohm=Z1_GPZ_OHM,
        z0_ohm=None,
        brak_wyniku_zerowego={"przyczyna": "brak_drogi", "kod": "fault.zero_sequence_no_path"},
        a_operator=OPERATOR_FORTESCUE_A,
        tk_s=1.0,
    )
    wynik = SCAsymmetricalProofPack.generate(dane)
    assert wynik.proof_1fz is None and wynik.proof_2fz is None
    assert wynik.proof_2f is not None
    for krok in wynik.proof_2f.steps:
        assert "Z_0" not in krok.source_keys
        assert all(v.symbol != "Z_0" for v in krok.input_values)
        assert "Z_0 =" not in krok.substitution_latex
    for wywolanie in (
        lambda: ProofGenerator._z0_kroku_doziemnego(None, "EQ_SC1_003"),
        lambda: ProofGenerator._create_sc1_step_equiv_impedance(
            step_number=1, equation_id="EQ_SC1_005", z1=1j, z2=1j, z0=None, z_equiv=1j
        ),
    ):
        with pytest.raises(AssertionError, match="składowej zerowej"):
            wywolanie()
