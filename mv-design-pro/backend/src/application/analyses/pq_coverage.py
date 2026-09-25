"""Serwis aplikacyjny: pokrycie wymaganego zakresu mocy biernej profilu operatora NC RfG
obszarem zdolności P–Q typu przekształtnika — rekord ``OcenaKryterium``.

Warstwa APPLICATION (porównanie wartości słownikowych, ZERO fizyki). Dla typu katalogowego
przekształtnika (krzywa zdolności producenta ``pq_curve``) i profilu operatora NC RfG porównuje
w każdym punkcie krzywej pasmo producenta z prostokątnym wymaganiem operatora (zakres Q jako
udział Pn) i buduje deterministyczny widok: dane typu i wymagania, zapasy per punkt (liczby),
JEDEN rekord ``OcenaKryterium`` (``ocena`` — status, margines, wyjaśnienie, braki i zastrzeżenia
liczy kontrakt werdyktu wyjaśnialnego, nie ten moduł) oraz ślad WHITE BOX (wzór, dane,
podstawienie, wynik liczbowy). Własnego statusu ani słownika status→tekst widok nie ma
(odbiór Pakietu C, plan AB O-50).

Odwzorowania:
- krzywa producenta ← ``ConverterType.pq_curve`` (``network_model.catalog.types``); brak krzywej
  = brak wyniku kryterium (``NIE_OCENIONO`` z nazwanym brakiem, nigdy krzywa typowa);
- wymaganie operatora ← ``NcRfgProfile.reactive_power`` — ``q_range_pct_pn_min`` /
  ``q_range_pct_pn_max`` (``catalog.profiles.nc_rfg.loader``), podstawa limitu ←
  ``NcRfgProfile.reactive_power.zrodlo`` (stan ``NIEUSTALONE`` → ``BRAK_PODSTAWY`` regułą K);
- moc odniesienia Pn ← ``ConverterType.pmax_mw`` (jakość danej z mapy jakości karty
  ``solver_input.provenance.resolve_card_field_quality_map`` — kompletność dowodu wg danych);
- stosowalność ← technologia typu (``technologia_modulu``): magazyn energii przy wymaganiu
  z rozporządzenia 2016/631 — ``NIE_DOTYCZY`` (art. 3 ust. 2 lit. d, plan AB O-28), ten sam
  predykat co ocena wymagań modułu (``stosowalnosc_wymagania``);
- poziom dowodowy ← rejestr zdolności ``solver_input.provenance`` (``pq_coverage.pokrycie_
  zakresu_q``: deklaracja katalogowa porównana z wymaganiem).

Konwencja pokrycia: pasmo producenta [q_min, q_max] w punkcie musi obejmować pasmo wymagane
[q_wym_min, q_wym_max]:
- zapas dolny = q_wym_min − q_min (producent sięga niżej niż wymaganie),
- zapas górny = q_max − q_wym_max (producent sięga wyżej niż wymaganie),
- zapas punktu = min(zapas dolny, zapas górny) (ujemny = deficyt),
- wynik kryterium = najmniejszy zapas po punktach krzywej; limit 0 Mvar, relacja „nie mniej";
  margines rekordu = najmniejsza odległość do granicy wymaganego zakresu [Mvar].
"""

from __future__ import annotations

from typing import Any

from catalog.profiles.nc_rfg.loader import NcRfgProfile
from network_model.catalog.types import ConverterKind, ConverterType
from network_model.solvers.ncrfg_ptpiree.contracts import PtpireeDerKind, technologia_modulu
from network_model.solvers.ncrfg_ptpiree.stosowalnosc import (
    NAZWA_TECHNOLOGII_PL,
    POWOD_MAGAZYNU_PL,
    RODZAJE_Z_ROZPORZADZENIA,
)
from solver_input.provenance import classify_dynamic_capability, resolve_card_field_quality_map
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    ZakresWaznosci,
    format_liczba,
    ocen_kryterium,
)

#: Identyfikator kryterium (rekord K) i zdolności w rejestrze dowodowym.
KRYTERIUM_POKRYCIA_PQ = "pq.pokrycie_zakresu_mocy_biernej"
ZDOLNOSC_POKRYCIA_PQ = "pq_coverage.pokrycie_zakresu_q"
#: Jednostka mocy biernej wyników i limitu.
_J_MVAR = "Mvar"
# Zaokraglenie wartosci wyjsciowych [Mvar] — determinizm i czytelnosc.
_ROUND_MVAR = 6
#: Rodzaj przekształtnika katalogu → rodzaj źródła wejścia oceny NC RfG (komplet ``ConverterKind``,
#: przypięte testem) — technologię wyprowadza JEDNO odwzorowanie ``technologia_modulu``.
_DER_KIND_Z_RODZAJU: dict[ConverterKind, PtpireeDerKind] = {
    ConverterKind.PV: "PV",
    ConverterKind.WIND: "FW",
    ConverterKind.BESS: "BESS",
}
_BRAK_KRZYWEJ_PL = (
    "krzywa zdolności P–Q producenta (pole pq_curve) w karcie katalogowej typu {typ} — bez niej "
    "obszaru zdolności urządzenia nie ma z czym porównać"
)
_NIEPEWNOSC = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "porównanie krzywej producenta z karty katalogowej z wymaganiem profilu — niepewność "
        "numeryczna nie dotyczy"
    ),
)
_WYKLUCZENIA = (
    "obszar między punktami krzywej producenta (porównanie wyłącznie w punktach krzywej)",
    "zależność zdolności mocy biernej od napięcia sieci (krzywa producenta bez parametru "
    "napięcia)",
)

_COVERAGE_FORMULA = (
    r"\Delta Q_{\min} = \min_{p}\,\min(q_{\text{wym,min}} - q_{\min,\text{prod}}(p),\; "
    r"q_{\max,\text{prod}}(p) - q_{\text{wym,max}}) \ge 0;\quad "
    r"q_{\text{wym,min}} = u_{\min} \cdot P_{n},\; "
    r"q_{\text{wym,max}} = u_{\max} \cdot P_{n}"
)


def _round(value: float) -> float:
    return round(float(value), _ROUND_MVAR)


def _mvar(value: float) -> str:
    return f"{format_liczba(_round(value))} {_J_MVAR}"


def _stosowalnosc(converter: ConverterType, profile: NcRfgProfile) -> Stosowalnosc:
    """Stosowalność wymagania zakresu Q do typu: magazyn energii przy wymaganiu z rozporządzenia
    2016/631 — nie dotyczy (predykat ``stosowalnosc_wymagania``); pozostałe technologie —
    dotyczy, typ modułu rozstrzyga ocena wymagań modułu (tu przedmiotem jest typ urządzenia)."""
    technologia = technologia_modulu(_DER_KIND_Z_RODZAJU[converter.kind], "PPM")
    podstawa = profile.reactive_power.zrodlo
    if technologia == "MAGAZYN" and podstawa.rodzaj in RODZAJE_Z_ROZPORZADZENIA:
        return Stosowalnosc(
            technologia=NAZWA_TECHNOLOGII_PL[technologia],
            dotyczy=False,
            powod_pl=POWOD_MAGAZYNU_PL,
        )
    return Stosowalnosc(
        technologia=NAZWA_TECHNOLOGII_PL[technologia],
        dotyczy=True,
        powod_pl=(
            f"wymagany zakres mocy biernej profilu operatora {profile.operator_name_pl} "
            f"porównany z obszarem zdolności P–Q typu ({NAZWA_TECHNOLOGII_PL[technologia]}); "
            "stosowalność wymagania do modułu (typ modułu NC RfG z mocy i napięcia "
            "przyłączenia) rozstrzyga ocena wymagań modułu"
        ),
    )


def _status_danych(converter: ConverterType, pn_mw: float) -> StatusDanych:
    """Kompletność wg danych: moc odniesienia Pn z karty o jakości innej niż karta techniczna
    jest daną przyjętą bez walidacji (jakość z mapy jakości karty, nigdy z założenia)."""
    status = resolve_card_field_quality_map(converter)["pmax_mw"]
    if status.quality is FieldQuality.DATASHEET:
        return StatusDanych(stan="ZWALIDOWANE")
    return StatusDanych(
        stan="UNVALIDATED_INPUT",
        dane_przyjete=(
            DanaPrzyjeta(
                nazwa_pl="moc znamionowa czynna typu (pmax_mw) — moc odniesienia Pn wymagania",
                wartosc=Wielkosc(wartosc=_round(pn_mw), jednostka="MW"),
                powod_pl=f"jakość danej karty katalogowej: {status.quality.label_pl}",
                jakosc=status.quality,
            ),
        ),
    )


def _punkt_krytyczny_pl(punkty: list[dict[str, Any]], krytyczny: dict[str, Any]) -> str:
    dolna = krytyczny["zapas_dolny_mvar"] <= krytyczny["zapas_gorny_mvar"]
    strona = "dolna (Q_min)" if dolna else "górna (Q_max)"
    tekst = (
        f"P = {format_liczba(krytyczny['p_mw'])} MW, strona {strona}: producent "
        f"{_mvar(krytyczny['q_min_mvar'])} … {_mvar(krytyczny['q_max_mvar'])}, wymagane "
        f"{_mvar(krytyczny['q_wymagane_min_mvar'])} … {_mvar(krytyczny['q_wymagane_max_mvar'])}"
    )
    niepokryte = [pt for pt in punkty if pt["margines_mvar"] < 0.0]
    tekst += f"; punkty niepokryte: {len(niepokryte)} z {len(punkty)}"
    if niepokryte:
        tekst += (
            " ("
            + "; ".join(
                f"P = {format_liczba(pt['p_mw'])} MW: Q {_mvar(pt['q_min_mvar'])} … "
                f"{_mvar(pt['q_max_mvar'])}, deficyt {_mvar(-pt['margines_mvar'])}"
                for pt in niepokryte
            )
            + ")"
        )
    return tekst


def _ocena(
    converter: ConverterType,
    profile: NcRfgProfile,
    punkty: list[dict[str, Any]],
    pn_mw: float,
    q_wym_min: float,
    q_wym_max: float,
) -> OcenaKryterium:
    """JEDYNA budowa rekordu K pokrycia — status, margines i wyjaśnienie liczy ``werdykt``."""
    podstawa = profile.reactive_power.zrodlo
    wynik: WynikKryterium | None = None
    braki: list[str] = []
    if punkty:
        krytyczny = min(punkty, key=lambda pt: pt["margines_mvar"])
        wynik = WynikKryterium(
            wielkosc_pl=(
                "najmniejszy zapas pokrycia wymaganego zakresu mocy biernej w punktach krzywej "
                "producenta"
            ),
            symbol_latex=r"\Delta Q_{\min}",
            wartosc=Wielkosc(wartosc=krytyczny["margines_mvar"], jednostka=_J_MVAR),
            punkt_krytyczny_pl=_punkt_krytyczny_pl(punkty, krytyczny),
            metoda="DEKLARACJA",
        )
    else:
        braki.append(_BRAK_KRZYWEJ_PL.format(typ=converter.id))
    return ocen_kryterium(
        kryterium_id=KRYTERIUM_POKRYCIA_PQ,
        przedmiot=Przedmiot(
            element_ref=converter.id,
            nazwa_pl=converter.name,
            opis_pl=(
                f"typ katalogowy przekształtnika {converter.name} — obszar zdolności P–Q z karty "
                "producenta"
            ),
        ),
        kryterium=Kryterium(
            opis_pl=(
                "Punkty pracy wymagane profilem operatora (zakres mocy biernej w każdym punkcie "
                "mocy czynnej) zawierają się w obszarze zdolności P–Q urządzenia — najmniejszy "
                "zapas pokrycia po punktach krzywej i obu stronach zakresu"
            ),
            warunek_latex=(
                r"\min_{p}\,\min(q_{\mathrm{wym},\min} - q_{\min}(p),\; q_{\max}(p) - "
                r"q_{\mathrm{wym},\max}) \ge 0"
            ),
            relacja="NIE_MNIEJ",
        ),
        podstawa=podstawa,
        stosowalnosc=_stosowalnosc(converter, profile),
        wynik=wynik,
        limit=LimitKryterium(
            wartosc=Wielkosc(wartosc=0.0, jednostka=_J_MVAR),
            podstawa=podstawa,
            zakres_stosowalnosci_pl=(
                f"wymagany zakres mocy biernej operatora {profile.operator_name_pl}: "
                f"[{format_liczba(profile.reactive_power.q_range_pct_pn_min)} · Pn, "
                f"{format_liczba(profile.reactive_power.q_range_pct_pn_max)} · Pn] = "
                f"[{_mvar(q_wym_min)}, {_mvar(q_wym_max)}] przy Pn = "
                f"{format_liczba(_round(pn_mw))} MW, w każdym punkcie mocy czynnej krzywej"
            ),
            wersja_profilu=profile.wersja_profilu,
        ),
        niepewnosc=_NIEPEWNOSC,
        dowod=StatusDowodu(
            metoda="DEKLARACJA",
            poziom=classify_dynamic_capability(ZDOLNOSC_POKRYCIA_PQ).tier,
            rodzaj_twierdzenia=classify_dynamic_capability(ZDOLNOSC_POKRYCIA_PQ).claim_kind,
            status_modelu="NIE_DOTYCZY",
            status_danych=_status_danych(converter, pn_mw),
            odniesienie=f"karta katalogowa typu {converter.id} (krzywa zdolności P–Q producenta)",
        ),
        zakres_waznosci=ZakresWaznosci(
            opis_pl=(
                "punkty krzywej zdolności P–Q producenta z karty katalogowej typu wobec "
                "prostokątnego wymagania zakresu mocy biernej profilu operatora"
            ),
            wykluczenia=_WYKLUCZENIA,
        ),
        slad=[
            OdnosnikSladu(
                krok=f"pq-coverage:{converter.id}:{profile.operator_id}:porownanie",
                opis_pl=(
                    "porównanie pasma producenta z pasmem wymaganym w punktach krzywej (ślad "
                    "WHITE BOX widoku: wzór, dane, podstawienie, wynik)"
                ),
            )
        ],
        braki_dodatkowe=braki,
    )


def build_pq_coverage_view(converter: ConverterType, profile: NcRfgProfile) -> dict[str, Any]:
    """Zbuduj widok pokrycia wymaganego zakresu mocy biernej obszarem zdolności P–Q typu.

    Typ bez krzywej producenta daje rekord ``NIE_OCENIONO`` z nazwanym brakiem (bez punktów),
    nigdy wyjątek ani krzywą typową.
    """
    pn_mw = float(converter.pmax_mw)
    udzial_min = float(profile.reactive_power.q_range_pct_pn_min)
    udzial_max = float(profile.reactive_power.q_range_pct_pn_max)
    q_wym_min = udzial_min * pn_mw
    q_wym_max = udzial_max * pn_mw

    punkty: list[dict[str, Any]] = []
    podstawienie: list[str] = []
    for p_mw, q_min_prod, q_max_prod in converter.pq_curve or ():
        zapas_dolny = q_wym_min - q_min_prod
        zapas_gorny = q_max_prod - q_wym_max
        margines = min(zapas_dolny, zapas_gorny)
        punkty.append(
            {
                "p_mw": _round(p_mw),
                "q_min_mvar": _round(q_min_prod),
                "q_max_mvar": _round(q_max_prod),
                "q_wymagane_min_mvar": _round(q_wym_min),
                "q_wymagane_max_mvar": _round(q_wym_max),
                "zapas_dolny_mvar": _round(zapas_dolny),
                "zapas_gorny_mvar": _round(zapas_gorny),
                "margines_mvar": _round(margines),
            }
        )
        podstawienie.append(
            f"p={_round(p_mw)} MW: min({_round(zapas_dolny)}, {_round(zapas_gorny)}) "
            f"= {_round(margines)} Mvar"
        )

    ocena = _ocena(converter, profile, punkty, pn_mw, q_wym_min, q_wym_max)
    if punkty:
        wynik_sladu = (
            f"min = {min(pt['margines_mvar'] for pt in punkty)} Mvar; punkty z ujemnym "
            f"zapasem: {sum(1 for pt in punkty if pt['margines_mvar'] < 0.0)} z {len(punkty)}"
        )
    else:
        wynik_sladu = "brak punktów krzywej producenta (pq_curve) — porównanie niewykonane"

    return {
        "typ_katalogowy": {
            "id": converter.id,
            "nazwa": converter.name,
            "kind": converter.kind.value,
            "pmax_mw": _round(pn_mw),
            "sn_mva": _round(converter.sn_mva),
        },
        "operator": {
            "id": profile.operator_id,
            "nazwa": profile.operator_name_pl,
            "udzial_q_min_pct_pn": udzial_min,
            "udzial_q_max_pct_pn": udzial_max,
        },
        "wymaganie": {
            "pn_mw": _round(pn_mw),
            "q_wymagane_min_mvar": _round(q_wym_min),
            "q_wymagane_max_mvar": _round(q_wym_max),
            "opis": (
                "Prostokątne wymaganie zakresu Q operatora: "
                "[udzial_min * Pn, udzial_max * Pn] w każdym punkcie pracy."
            ),
        },
        "punkty": punkty,
        "ocena": ocena.model_dump(mode="json"),
        "slad_whitebox": {
            "wzor": _COVERAGE_FORMULA,
            "dane": {
                "pn_mw": _round(pn_mw),
                "udzial_q_min_pct_pn": udzial_min,
                "udzial_q_max_pct_pn": udzial_max,
                "q_wymagane_min_mvar": _round(q_wym_min),
                "q_wymagane_max_mvar": _round(q_wym_max),
                "liczba_punktow_krzywej": len(punkty),
            },
            "podstawienie": podstawienie,
            "wynik": wynik_sladu,
        },
    }
