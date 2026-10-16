"""Karta PROT-LTI — tożsamość czasów zadziałania przed i po ujednoliceniu nazwy krzywej.

Krzywa zależna długoczasowa t = TMS·120/(M − 1) miała w produkcie cztery nazwy:
„RI" w jądrze, „IEC_LI" w modelu ENM, „LTI" w mapie odczytu zabezpieczeń, „IEC_LTI"
w katalogu IED (``curves_supported``). Karta zostawia jedną nazwę — „LTI" (członek jądra
`IEC60255CurveType.LONG_TIME_INVERSE`, literał modelu „IEC_LTI" = kod katalogu IED).

Zmiana dotyczy WYŁĄCZNIE nazwy, więc każdy wynik liczbowy jądra musi być identyczny
bit w bit z wynikiem sprzed karty. Migawka `iec60255_t_m_przed_prot_lti.json` została
wygenerowana z pliku jądra z commita bazowego `f3c435b6` (przed zmianą) i jest
kluczowana STAŁYMI krzywej (A/B), nie nazwą — test nie może więc przejść dzięki temu,
że stara i nowa nazwa „pasują do siebie".

Iloczyn cech: każda krzywa jądra × M ∈ {1,05 … 50} (w tym M ∈ {2, 5, 10, 20} z karty)
× TMS ∈ {0,05 … 1,0} × ścieżka wejścia (jądro wprost, stopień nastawy modelu ENM przez
jedyną ścieżkę oceny `ocena_nadpradowa.czas_stopnia`) — porównanie `float.hex`, nie tolerancja.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from application.analyses.protection.ocena_nadpradowa import StopienNastaw, czas_stopnia
from network_model.solvers.protection_iec60255 import (
    IEC60255_CURVE_FORMULAS_LATEX,
    IEC60255_CURVE_LABELS_PL,
    IEC60255_CURVE_PARAMS,
    IEC60255CurveType,
    compute_curve_trip_time,
)

_MIGAWKA = (
    Path(__file__).resolve().parents[2]
    / "fixtures"
    / "protection"
    / "iec60255_t_m_przed_prot_lti.json"
)
_DANE = json.loads(_MIGAWKA.read_text(encoding="utf-8"))

#: Literał krzywej w modelu ENM → klucz migawki (stałe A/B jądra). Odwzorowanie po
#: stałych jest jedynym uczciwym kluczem — migawka powstała, gdy krzywa 0,14/0,02 miała w jądrze
#: inną nazwę („NI") niż w modelu („SI"); od partii integracji 9 nazwa jest jedna („SI").
_ENM_NA_KLUCZ = {
    "IEC_SI": "0.14/0.02",
    "IEC_VI": "13.5/1.0",
    "IEC_EI": "80.0/2.0",
    "IEC_LTI": "120.0/1.0",
}


def _hex(v: float | None) -> str | None:
    return None if v is None else float(v).hex()


def _klucz(typ: IEC60255CurveType) -> str:
    if typ not in IEC60255_CURVE_PARAMS:
        return "DT"
    a, b = IEC60255_CURVE_PARAMS[typ]
    return f"{a!r}/{b!r}"


def test_migawka_obejmuje_dokladnie_krzywe_jadra() -> None:
    """Każda krzywa jądra ma wiersze migawki i odwrotnie — nowa albo zgubiona krzywa
    nie może przejść niezauważona."""
    assert sorted(_klucz(t) for t in IEC60255CurveType) == sorted(_DANE["krzywe"])


def test_mnozniki_z_karty_sa_w_migawce() -> None:
    mnozniki = {w[0] for w in _DANE["krzywe"]["120.0/1.0"]["wiersze"]}
    assert {2.0, 5.0, 10.0, 20.0} <= mnozniki


@pytest.mark.parametrize("typ", list(IEC60255CurveType), ids=lambda t: t.value)
def test_jadro_bit_w_bit_jak_przed_karta(typ: IEC60255CurveType) -> None:
    krzywa = _DANE["krzywe"][_klucz(typ)]
    assert IEC60255_CURVE_FORMULAS_LATEX[typ] == krzywa["formula_latex"]
    for m, tms, t, base, mb, den, mx, trip, podstawienie in krzywa["wiersze"]:
        r = compute_curve_trip_time(curve_type=typ, i_fault_a=100.0 * m, is_pickup_a=100.0, tms=tms)
        assert [
            _hex(r.calculated_time_s),
            _hex(r.base_time_s),
            _hex(r.M_power_B),
            _hex(r.denominator),
            _hex(r.current_multiple_M),
            r.will_trip,
            r.substitution_latex,
        ] == [t, base, mb, den, mx, trip, podstawienie], (typ.value, m, tms)


def _stopien(krzywa: str, tms: float) -> StopienNastaw:
    return StopienNastaw(
        funkcja="overcurrent_51",
        krzywa=krzywa,
        wartosc_progu=100.0,
        jednostka_progu="A_PIERWOTNY",
        prog_wtorny_a=1.0,
        prog_pierwotny_a=100.0,
        tms=tms,
        zwloka_s=None,
        slad={},
    )


@pytest.mark.parametrize(("literal_enm", "klucz"), sorted(_ENM_NA_KLUCZ.items()))
def test_nastawa_modelu_daje_czas_jak_przed_karta(literal_enm: str, klucz: str) -> None:
    """Tor modelu ENM (`czas_stopnia` — jedyna ścieżka oceny nadprądowej, konsument czasu
    wyłączenia gałęzi) po zmianie literału „IEC_LI" → „IEC_LTI" daje ten sam czas co jądro
    przed kartą."""
    for m, tms, t, *_ in _DANE["krzywe"][klucz]["wiersze"]:
        slad = czas_stopnia(_stopien(literal_enm, tms), 100.0 * m)
        assert _hex(slad["t_s"]) == t, (literal_enm, m, tms)
        assert slad["krzywa"] == literal_enm
        assert f"{slad['stale']['A']!r}/{slad['stale']['B']!r}" == klucz


def test_literaly_modelu_pokrywaja_wszystkie_krzywe_odwrotne_jadra() -> None:
    """Predykat parami: zbiór literałów modelu w tym teście = zbiór krzywych odwrotnych
    jądra (bez DT) — test nie pomija krzywej, której nie przewidział."""
    odwrotne = {_klucz(t) for t in IEC60255CurveType if t in IEC60255_CURVE_PARAMS}
    assert set(_ENM_NA_KLUCZ.values()) == odwrotne


def test_jeden_zbior_nazw_krzywych_modelu_i_jego_konsumentow() -> None:
    """Literał krzywej w modelu ENM (`KrzywaNastawy`), odwzorowanie na rdzeń (IEC ∪ IEEE),
    kod katalogu IED, etykieta i mapa odczytu zabezpieczeń (`CURVE_TYPE_MAP`) to TEN SAM
    zbiór nazw — pozostawiona stara nazwa („IEC_LI") w którymkolwiek miejscu dawałaby
    cichy brak czasu albo błąd kontraktu."""
    from typing import get_args

    from application.analyses.protection.ocena_nadpradowa import (
        ETYKIETY_KRZYWYCH_PL,
        KRZYWE_IEC,
        KRZYWE_IEEE,
    )
    from application.protection_read_model import CURVE_TYPE_MAP
    from enm.models import KrzywaNastawy

    literaly = set(get_args(KrzywaNastawy))
    assert not set(KRZYWE_IEC) & set(KRZYWE_IEEE)
    assert literaly == set(KRZYWE_IEC) | set(KRZYWE_IEEE)
    assert literaly == set(CURVE_TYPE_MAP) == set(ETYKIETY_KRZYWYCH_PL)
    assert "IEC_LTI" in literaly and "IEC_LI" not in literaly
    assert KRZYWE_IEC["IEC_LTI"] is IEC60255CurveType.LONG_TIME_INVERSE
    assert CURVE_TYPE_MAP["IEC_LTI"] == (
        "IEC_60255",
        IEC60255CurveType.LONG_TIME_INVERSE.value,
    )


def test_lista_edytora_nastaw_niesie_lti_pod_jedna_nazwa_i_etykieta() -> None:
    """Edytor nastaw modelu (jedyna ścieżka pisania krzywej, karta BIEG-ZABEZPIECZEN-Z-MODELU)
    dostaje listę charakterystyk z `_zakresy_katalogu` — dla przekaźnika katalogu analitycznego
    z `IEC_LTI` w `curves_supported` pozycja LTI ma kod modelu „IEC_LTI" i etykietę z jedną
    nazwą „LTI, 120" (bez „RI" i bez „IEC_LI")."""
    from application.analyses.protection.catalog.catalog_store import load_device_capability
    from application.analyses.protection.ocena_nadpradowa import _zakresy_katalogu

    zdolnosc = load_device_capability("ABB_REF615")
    assert zdolnosc is not None and "IEC_LTI" in zdolnosc.curves_supported
    pozycje = {p["kod"]: p["etykieta_pl"] for p in _zakresy_katalogu(zdolnosc)["charakterystyki"]}
    assert pozycje["IEC_LTI"] == "IEC odwrotna długoczasowa (LTI, 120)"
    assert not any("IEC_LI" == k or "RI)" in v for k, v in pozycje.items())


def test_stan_katalogu_modelu_zaden_przekaznik_nie_oferuje_lti() -> None:
    """Pomiar przypięty (partia 9): przekaźniki katalogu MODELU (`mv_auxiliary_catalog`,
    odwołania `analytical_library_ref`) nie mają `IEC_LTI` w `curves_supported`, więc
    edytor nastaw nie pokazuje dziś LTI żadnemu projektantowi, a nastawa LTI na takim
    przekaźniku jest nazwanym brakiem „charakterystyka spoza katalogu". Test zmieni kolor,
    gdy katalog modelu dostanie przekaźnik z LTI — wtedy e2e wyboru LTI w edytorze staje się
    wykonalne i należy je dopisać."""
    from application.analyses.protection.catalog.catalog_store import load_device_capability
    from network_model.catalog import mv_auxiliary_catalog

    zrodlo = Path(mv_auxiliary_catalog.__file__).read_text(encoding="utf-8")
    odwolania = sorted(set(re.findall(r'"analytical_library_ref": "([^"]+)"', zrodlo)))
    assert odwolania, "katalog modelu bez przekaźników — pomiar nieważny"
    z_lti = [
        ref
        for ref in odwolania
        if (z := load_device_capability(ref)) is not None and "IEC_LTI" in z.curves_supported
    ]
    assert z_lti == []


# =============================================================================
# Para NI/SI (decyzja B-01 partii integracji 9, delegacja O-59): krzywa 0,14/0,02 miała w
# jądrze nazwę „NI", a w modelu ENM, adapterze `iec_curves` i dokumencie kanonicznym — „SI";
# katalog IED niósł „IEC_NI", więc ocena tłumaczyła nazwy mapą `KRZYWA_W_KATALOGU`. Od partii
# 9 nazwa jest jedna („SI"), mapa nazw zniknęła: literał modelu JEST kodem katalogu.
# Iloczyn cech: każda krzywa IEC modelu × {jądro, mapa odczytu, adapter (enum, stałe,
# etykieta), katalog IED} — porównanie zbiorów, nie przykładu.
# =============================================================================

#: Kody krzywych katalogu IED, których model ENM nie zna (charakterystyki producenta bez
#: literału `KrzywaNastawy`). Zbiór ZAMKNIĘTY: nowy alias krzywej modelu w katalogu (np. „IEC_NI"
#: obok „IEC_SI") albo nowa charakterystyka bez decyzji o jej nazwie zmienia kolor testu.
_KODY_KATALOGU_SPOZA_MODELU = frozenset({"IEC_STI", "RXIDG", "IAC51", "I2T", "USER_DEFINED", "US1"})


def _krzywe_iec_modelu() -> dict[str, IEC60255CurveType]:
    from application.analyses.protection.ocena_nadpradowa import KRZYWE_IEC

    return dict(KRZYWE_IEC)


@pytest.mark.parametrize("literal", sorted(_krzywe_iec_modelu()))
def test_krzywa_iec_modelu_ma_jedna_nazwe_w_jadrze_odczycie_i_adapterze(literal: str) -> None:
    """Literał modelu „IEC_<X>" (albo „DT") ↔ wartość jądra „<X>" ↔ kod mapy odczytu ↔ enum,
    stałe i etykieta adaptera `iec_curves` — jedna nazwa i jedno źródło stałych."""
    from application.protection_read_model import CURVE_TYPE_MAP
    from protection.curves.iec_curves import IEC_CURVE_LABELS_PL, IECCurveParams, IECCurveType

    typ = _krzywe_iec_modelu()[literal]
    assert literal == (typ.value if typ is IEC60255CurveType.DT else f"IEC_{typ.value}")
    assert CURVE_TYPE_MAP[literal] == ("IEC_60255", typ.value)
    adapter = IECCurveType(typ.value)
    assert IEC_CURVE_LABELS_PL[adapter.value] == IEC60255_CURVE_LABELS_PL[typ]
    stale = IECCurveParams.get_standard_params(adapter)
    if typ in IEC60255_CURVE_PARAMS:
        assert (stale.a, stale.b, stale.c) == (*IEC60255_CURVE_PARAMS[typ], 0.0)
    else:
        assert (stale.a, stale.b, stale.c) == (0.0, 0.0, 0.0)


def test_enum_adaptera_i_jadra_to_ten_sam_zbior_nazw() -> None:
    from protection.curves.iec_curves import IEC_CURVE_LABELS_PL, IECCurveType

    assert {t.value for t in IECCurveType} == {t.value for t in IEC60255CurveType}
    assert set(IEC_CURVE_LABELS_PL) == {t.value for t in IEC60255CurveType}
    assert "NI" not in {t.value for t in IEC60255CurveType}


def test_kody_krzywych_katalogu_ied_to_literaly_modelu_albo_jawne_kody_producenta() -> None:
    """Predykat parami: ocena (`curve_type in curves_supported`) i edytor nastaw (lista
    charakterystyk pozycji katalogu) pytają katalog LITERAŁEM modelu, więc każdy kod krzywej
    katalogu jest literałem modelu albo pozycją zamkniętego zbioru kodów producenta — trzeciej
    drogi (alias tej samej krzywej) nie ma."""
    from typing import get_args

    from application.analyses.protection.catalog.catalog_store import load_device_capability
    from enm.models import KrzywaNastawy

    dane = json.loads(
        (
            Path(__file__).resolve().parents[3]
            / "src/application/analyses/protection/catalog/data/devices_v0.json"
        ).read_text(encoding="utf-8")
    )
    kody = {k for urzadzenie in dane["devices"] for k in urzadzenie.get("curves_supported", [])}
    literaly = set(get_args(KrzywaNastawy))
    assert kody - literaly == _KODY_KATALOGU_SPOZA_MODELU
    assert literaly <= kody, "literał modelu bez żadnego przekaźnika w katalogu"
    zdolnosc = load_device_capability(dane["devices"][0]["device_id"])
    assert zdolnosc is not None and set(zdolnosc.curves_supported) <= kody


def test_lista_edytora_nastaw_niesie_si_pod_jedna_nazwa() -> None:
    """Edytor nastaw dostaje dla przekaźnika z krzywą 0,14/0,02 pozycję o kodzie modelu
    „IEC_SI" z etykietą „(SI)" — dawny kod katalogu „IEC_NI" nie przechodzi żadną ścieżką."""
    from application.analyses.protection.catalog.catalog_store import load_device_capability
    from application.analyses.protection.ocena_nadpradowa import _zakresy_katalogu

    zdolnosc = load_device_capability("ABB_REF615")
    assert zdolnosc is not None and "IEC_SI" in zdolnosc.curves_supported
    pozycje = {p["kod"]: p["etykieta_pl"] for p in _zakresy_katalogu(zdolnosc)["charakterystyki"]}
    assert pozycje["IEC_SI"] == "IEC normalnie odwrotna (SI)"
    assert "IEC_NI" not in zdolnosc.curves_supported


def test_stale_krzywych_cytowane_z_tabeli_a1_a_nie_z_tabeli_1_normy() -> None:
    """Cytat stałych (decyzja B-01 partii integracji 9): IEC 60255-151:2009 ma stałe krzywych
    w zał. A, tab. A.1; jej tab. 1 to mnożnik błędu czasu zadziałania (spis treści podglądu
    wydawcy). Żaden plik kodu, testu ani dokumentu zabezpieczeń nie cytuje „tab. 1" tej normy
    jako źródła stałych. Surowy raport subagenta (`docs/architecture/donor-raw/`) jest
    zachowanym, jawnie niezweryfikowanym materiałem dowodowym i nie jest przepisywany."""
    repo = Path(__file__).resolve().parents[4]
    wzorzec = re.compile(r"60255-151[^|\n]{0,30}(?:Table|Tabela|tab\.)\s*" + "1" + r"\b", re.I)
    korzenie = [repo / "backend" / "src", repo / "backend" / "tests", repo / "docs"]
    trafienia = [
        f"{plik.relative_to(repo)}:{nr}"
        for korzen in korzenie
        for plik in sorted(korzen.rglob("*"))
        if plik.suffix in {".py", ".md"}
        and "donor-raw" not in plik.parts
        and plik.resolve() != Path(__file__).resolve()
        for nr, linia in enumerate(plik.read_text(encoding="utf-8").splitlines(), start=1)
        if wzorzec.search(linia)
    ]
    assert trafienia == []
