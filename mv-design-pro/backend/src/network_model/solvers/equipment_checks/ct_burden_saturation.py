"""Bilans mocy wtornej i nasycenie PRZEKLADNIKA PRADOWEGO (IEC 61869-2 § 5.6).

DLACZEGO TEN MODUL POWSTAL (karta KD-3, dlug §7.4 pozycja 1). Dobor przekladnika
pradowego konczyl sie dotad na przekladni i klasie. Brakowalo kryterium, ktore
decyduje o tym, czy zabezpieczenie w ogole ZOBACZY prad zwarciowy: rzeczywiste
obciazenie obwodu wtornego. Przekladnik z poprawna przekladnia i klasa 5P20,
obciazony ponad moc znamionowa, nasyca sie przy krotnosci znacznie mniejszej niz
20 — i zabezpieczenie nadpradowe dostaje prad mniejszy od rzeczywistego.

PODSTAWA NORMOWA. Moc pobierana przez obwod wtorny sklada sie z mocy aparatow
oraz mocy traconej w przewodach polaczeniowych:

    S2obl = S_aparatow + S_przewodow,      S_przewodow = I2n² · Rp
    Rp = 2·ρ·L / s        (obwod DWUPRZEWODOWY: tam i z powrotem)

ROZSTRZYGNIECIE O SKLADNIKACH (zapisane swiadomie). Skrocony zapis kryterium
krazy w postaci „S2obl = S_przewodow + S_aparatow + I2²·Rp", w ktorej czlon
przewodow wystepuje DWA RAZY: raz z nazwy, raz ze wzoru. Tu liczymy go RAZ —
``S_przewodow`` JEST rownowazne ``I2n²·Rp``. Podwojne ujecie zawyzaloby S2obl,
czyli zanizalo ALF_eff, i falszowalo werdykt w strone „bezpieczna", ale
nieprawdziwa. Opcjonalny czlon ``S_stykow`` (zaciski, przekaznik posredniczacy)
wchodzi WYLACZNIE wtedy, gdy wolajacy poda go jawnie — nie jest domyslany.

WARIANT ALF (rozstrzygniecie NORMATYWNE tej karty). Efektywny wspolczynnik
graniczny dokladnosci liczymy w postaci PELNEJ, uwzgledniajacej moc tracona w
samym uzwojeniu wtornym przekladnika:

    ALF_eff = ALF · (Sn + Sw) / (S2obl + Sw),     Sw = I2n² · Rct        (PELNY)

Postac uproszczona ``ALF · Sn / S2obl`` to ten sam wzor przy Sw = 0. NIE jest
rownowazna: przy typowym S2obl < Sn daje wynik WIEKSZY, czyli optymistyczny.
Dlatego wariant pelny jest domyslny i obowiazujacy, a uproszczony wchodzi tylko
wtedy, gdy katalog nie niesie rezystancji uzwojenia (``rct_ohm``) — wowczas jest
NAZWANY w wyniku i w sladzie, a wynik dostaje kod gotowosci
``ct.winding_resistance_missing``. Milczace podstawienie Sw = 0 byloby wartoscia
zastepcza (zakaz zgadywania), nazwany wariant + kod gotowosci — nie jest.

ZERO FABRYKACJI. Brak dlugosci/przekroju obwodu, mocy znamionowej albo
wspolczynnika ALF konczy sie statusem NIEDOSTEPNY i kodem gotowosci. Zadna
wielkosc znamionowa nie jest zgadywana ani zastepowana „typowa".

WHITE BOX. Wynik niesie rezystancje przewodow, obie skladowe bilansu, moc
wewnetrzna, ALF_eff, oba werdykty czastkowe, zalozenia i pelny slad krokow.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from network_model.solvers.equipment_checks.slad import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    dodatnia,
    liczba_tex,
    nieujemna,
    wartosc,
    werdykt_zbiorczy,
)

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_CT_SECONDARY_CIRCUIT_MISSING = "ct.secondary_circuit_missing"
READINESS_CT_RATED_BURDEN_MISSING = "ct.rated_burden_missing"
READINESS_CT_ACCURACY_LIMIT_MISSING = "ct.accuracy_limit_missing"
READINESS_CT_WINDING_RESISTANCE_MISSING = "ct.winding_resistance_missing"
READINESS_CT_REQUIRED_ALF_MISSING = "ct.required_alf_missing"

#: Rezystywnosc miedzi w 20 °C [Ω·mm²/m] — IEC 60228 (ta sama stala, ktorej uzywa
#: wyprowadzenie k w `conductor_thermal_withstand`: 17,241·10⁻⁶ Ω·mm = 0,017241
#: Ω·mm²/m). Wartosc jest ZALOZENIEM JAWNYM: jedzie w polu `assumptions` wyniku i
#: w sladzie, wiec projektant widzi, dla jakiej temperatury policzono rezystancje.
REZYSTYWNOSC_MIEDZI_20C = 0.017241

#: Nazwy wariantow rachunku ALF_eff — jadą w wyniku i w sladzie.
WARIANT_ALF_PELNY = "PELNY_IEC61869_2"
WARIANT_ALF_UPROSZCZONY = "UPROSZCZONY_BEZ_RCT"

_FORMULA_REF = "S2obl = S_aparatow + I2n²·Rp;  ALF_eff = ALF·(Sn + Sw)/(S2obl + Sw)"

#: Oznaczenie klasy zabezpieczeniowej wg IEC 61869-2: liczba·P·ALF (np. „5P20”,
#: „10P10”, „5PR10”). Klasy pomiarowe („0.5”, „0.2S”) NIE maja ALF — dla nich
#: rachunek nasycenia nie ma zastosowania i konczy sie kodem gotowosci.
_KLASA_ZABEZPIECZENIOWA = re.compile(r"^\s*\d+(?:[.,]\d+)?\s*P\s*R?\s*(\d+)\s*$", re.IGNORECASE)


def alf_z_klasy(accuracy_class: str | None) -> int | None:
    """Wyluskaj wspolczynnik graniczny dokladnosci z oznaczenia klasy katalogowej.

    ``"5P20"`` → 20, ``"10P10"`` → 10, ``"5PR10"`` → 10. Klasa pomiarowa
    (``"0.5"``, ``"0.2S"``) zwraca ``None`` — to nie jest brak danych katalogu,
    tylko informacja, ze rdzen NIE jest zabezpieczeniowy. Rozdzielenie tych dwoch
    sytuacji nalezy do wolajacego (kod gotowosci niesie jedna tresc).
    """
    if not accuracy_class:
        return None
    dopasowanie = _KLASA_ZABEZPIECZENIOWA.match(accuracy_class)
    if dopasowanie is None:
        return None
    return int(dopasowanie.group(1))


@dataclass(frozen=True)
class CtDeviceBurden:
    """Pojedyncze obciazenie obwodu wtornego (aparat, licznik, przekaznik)."""

    nazwa: str
    moc_va: float


@dataclass(frozen=True)
class CtBurdenInput:
    """Dane wejsciowe bilansu wtornego CT.

    Wielkosci ZNAMIONOWE (``i2n_a``, ``sn_va``, ``alf``, ``rct_ohm``) pochodza z
    pozycji katalogowej — wiazanie ``catalog_ref`` → pozycja robi warstwa
    koncowki, zeby solver zostal funkcja czysta. Wielkosci OBWODU podaje
    projektant w kroku CT/VT kreatora stacji.
    """

    i2n_a: float | None
    sn_va: float | None
    alf: float | None
    dlugosc_przewodu_m: float | None
    przekroj_przewodu_mm2: float | None
    obciazenia_aparatow: tuple[CtDeviceBurden, ...] = ()
    rct_ohm: float | None = None
    #: Wymagany wspolczynnik graniczny z funkcji zabezpieczeniowych pola
    #: (ALF_wym = Ik/I1n). Brak = werdykt nasycenia NIEDOSTEPNY, nigdy domyslny.
    alf_wymagany: float | None = None
    #: Moc tracona na stykach i zaciskach [VA] — TYLKO gdy podana jawnie.
    moc_stykow_va: float | None = None
    rezystywnosc_ohm_mm2_per_m: float = REZYSTYWNOSC_MIEDZI_20C


@dataclass(frozen=True)
class CtBurdenResult:
    """Wynik bilansu wtornego i nasycenia CT (WHITE BOX).

    ``status`` = NIEDOSTEPNY oznacza brak podstawy do oceny (patrz
    ``readiness_codes``); nie wolno go czytac jako spelnienia kryterium.

    ``status`` jest ZLOZENIEM obu werdyktow czastkowych regula
    ``slad.werdykt_zbiorczy`` (FAIL > NIEDOSTEPNY > PASS), wiec NIEDOSTEPNE
    nasycenie nie moze dac zbiorczego PASS wydanego na samym obciazeniu.
    """

    status: str
    #: Werdykt bilansu obciazenia (S2obl ≤ Sn) — dostepny bez znajomosci ALF.
    status_obciazenia: str
    #: Werdykt nasycenia (ALF_eff ≥ ALF_wym) — NIEDOSTEPNY bez wymagania.
    status_nasycenia: str
    rezystancja_przewodow_ohm: float | None
    moc_przewodow_va: float | None
    moc_aparatow_va: float | None
    moc_stykow_va: float | None
    moc_obliczeniowa_va: float | None
    moc_wewnetrzna_va: float | None
    wykorzystanie_mocy: float | None
    alf_efektywny: float | None
    zapas_alf: float | None
    wariant_alf: str | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    white_box_trace: tuple[dict[str, Any], ...] = ()
    assumptions: tuple[str, ...] = ()

    @property
    def is_conclusive(self) -> bool:
        """Czy wynik jest werdyktem, a nie brakiem podstawy do oceny."""
        return self.status in (STATUS_PASS, STATUS_FAIL)


def _zalozenia(*, rezystywnosc: float, wariant: str) -> tuple[str, ...]:
    podstawa = (
        "Obwod wtorny DWUPRZEWODOWY: Rp = 2·ρ·L/s (dlugosc L liczona w jedna strone).",
        f"Rezystywnosc zyly ρ = {rezystywnosc} Ω·mm²/m (miedz, 20 °C, IEC 60228) "
        "— zalozenie jawne, nie dane katalogu przekladnika.",
        "Moc przewodow S_przewodow = I2n²·Rp liczona RAZ (nie jest osobnym skladnikiem "
        "obok siebie samej).",
        "Moc stykow wchodzi do bilansu wylacznie wtedy, gdy podano ja jawnie.",
    )
    if wariant == WARIANT_ALF_PELNY:
        return podstawa + (
            "ALF_eff = ALF·(Sn + Sw)/(S2obl + Sw) — wariant PELNY (IEC 61869-2 § 5.6), "
            "Sw = I2n²·Rct z rezystancji uzwojenia wtornego.",
        )
    return podstawa + (
        "ALF_eff = ALF·Sn/S2obl — wariant UPROSZCZONY (Sw = 0), bo katalog nie niesie "
        "rezystancji uzwojenia wtornego Rct.",
        "Wariant uproszczony przy S2obl < Sn daje ALF_eff WIEKSZY niz pelny — wynik jest "
        "optymistyczny i wymaga potwierdzenia rezystancja uzwojenia z karty producenta.",
    )


def check_ct_burden_saturation(data: CtBurdenInput) -> CtBurdenResult:
    """Policz bilans mocy wtornej CT i efektywny wspolczynnik graniczny ALF_eff.

    Zwraca dwa werdykty czastkowe: obciazenia (S2obl ≤ Sn) oraz nasycenia
    (ALF_eff ≥ ALF_wym). Kazdy brak danej daje kod gotowosci, nigdy wartosc
    zastepcza.
    """
    i2n = dodatnia(data.i2n_a)
    sn = dodatnia(data.sn_va)
    alf = dodatnia(data.alf)
    dlugosc = dodatnia(data.dlugosc_przewodu_m)
    przekroj = dodatnia(data.przekroj_przewodu_mm2)
    rho = dodatnia(data.rezystywnosc_ohm_mm2_per_m)
    rct = dodatnia(data.rct_ohm)
    alf_wym = dodatnia(data.alf_wymagany)
    styki = nieujemna(data.moc_stykow_va)

    braki: list[str] = []
    if i2n is None or dlugosc is None or przekroj is None or rho is None:
        braki.append(READINESS_CT_SECONDARY_CIRCUIT_MISSING)
    if sn is None:
        braki.append(READINESS_CT_RATED_BURDEN_MISSING)
    if alf is None:
        braki.append(READINESS_CT_ACCURACY_LIMIT_MISSING)

    if i2n is None or dlugosc is None or przekroj is None or rho is None or sn is None:
        return CtBurdenResult(
            status=STATUS_UNAVAILABLE,
            status_obciazenia=STATUS_UNAVAILABLE,
            status_nasycenia=STATUS_UNAVAILABLE,
            rezystancja_przewodow_ohm=None,
            moc_przewodow_va=None,
            moc_aparatow_va=None,
            moc_stykow_va=None,
            moc_obliczeniowa_va=None,
            moc_wewnetrzna_va=None,
            wykorzystanie_mocy=None,
            alf_efektywny=None,
            zapas_alf=None,
            wariant_alf=None,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    # --- Bilans mocy wtornej ---------------------------------------------------
    rp_ohm = 2.0 * rho * dlugosc / przekroj
    moc_przewodow = i2n * i2n * rp_ohm
    moc_aparatow = sum(pozycja.moc_va for pozycja in data.obciazenia_aparatow)
    moc_stykow = styki or 0.0
    s2obl = moc_aparatow + moc_przewodow + moc_stykow
    wykorzystanie = s2obl / sn
    status_obciazenia = STATUS_PASS if s2obl <= sn else STATUS_FAIL

    # --- Efektywny wspolczynnik graniczny -------------------------------------
    if rct is not None:
        wariant = WARIANT_ALF_PELNY
        sw = i2n * i2n * rct
    else:
        wariant = WARIANT_ALF_UPROSZCZONY
        sw = 0.0
        braki.append(READINESS_CT_WINDING_RESISTANCE_MISSING)

    alf_eff: float | None = None
    zapas: float | None = None
    status_nasycenia = STATUS_UNAVAILABLE
    if alf is not None and (s2obl + sw) > 0.0:
        alf_eff = alf * (sn + sw) / (s2obl + sw)
        if alf_wym is None:
            braki.append(READINESS_CT_REQUIRED_ALF_MISSING)
        else:
            zapas = alf_eff - alf_wym
            status_nasycenia = STATUS_PASS if alf_eff >= alf_wym else STATUS_FAIL

    # Werdykt LACZNY skladany wspolna regula rodziny: FAIL > NIEDOSTEPNY > PASS.
    # Poprzednio brak podstawy do oceny nasycenia (np. nieznane ALF_wym albo rdzen
    # bez klasy zabezpieczeniowej) znikal z werdyktu, bo zbiorczy status wychodzil
    # PASS z samego bilansu obciazenia — zielone na POLICZONEJ POLOWIE kryterium.
    status = werdykt_zbiorczy(status_obciazenia, status_nasycenia)

    return CtBurdenResult(
        status=status,
        status_obciazenia=status_obciazenia,
        status_nasycenia=status_nasycenia,
        rezystancja_przewodow_ohm=rp_ohm,
        moc_przewodow_va=moc_przewodow,
        moc_aparatow_va=moc_aparatow,
        moc_stykow_va=styki,
        moc_obliczeniowa_va=s2obl,
        moc_wewnetrzna_va=sw if rct is not None else None,
        wykorzystanie_mocy=wykorzystanie,
        alf_efektywny=alf_eff,
        zapas_alf=zapas,
        wariant_alf=wariant,
        readiness_codes=tuple(dict.fromkeys(braki)),
        white_box_trace=_slad_ct(
            i2n_a=i2n,
            sn_va=sn,
            alf=alf,
            rho=rho,
            dlugosc_m=dlugosc,
            przekroj_mm2=przekroj,
            rp_ohm=rp_ohm,
            moc_przewodow_va=moc_przewodow,
            moc_aparatow_va=moc_aparatow,
            moc_stykow_va=moc_stykow,
            s2obl_va=s2obl,
            wykorzystanie=wykorzystanie,
            sw_va=sw,
            wariant=wariant,
            alf_eff=alf_eff,
            alf_wymagany=alf_wym,
            status_obciazenia=status_obciazenia,
            status_nasycenia=status_nasycenia,
            pozycje=data.obciazenia_aparatow,
        ),
        assumptions=_zalozenia(rezystywnosc=rho, wariant=wariant),
    )


def _slad_ct(
    *,
    i2n_a: float,
    sn_va: float,
    alf: float | None,
    rho: float,
    dlugosc_m: float,
    przekroj_mm2: float,
    rp_ohm: float,
    moc_przewodow_va: float,
    moc_aparatow_va: float,
    moc_stykow_va: float,
    s2obl_va: float,
    wykorzystanie: float,
    sw_va: float,
    wariant: str,
    alf_eff: float | None,
    alf_wymagany: float | None,
    status_obciazenia: str,
    status_nasycenia: str,
    pozycje: tuple[CtDeviceBurden, ...],
) -> tuple[dict[str, Any], ...]:
    """Kroki dowodowe bilansu CT (kanon pieciu pol).

    Slad NIE liczy niczego od nowa — wszystkie wielkosci sa argumentami, wyliczone
    wyzej w tym samym solverze. Tekst i formatowanie to prezentacja dowodu, fizyka
    zostaje w jednym miejscu.
    """
    wykaz = ", ".join(f"{p.nazwa}: {liczba_tex(p.moc_va)} VA" for p in pozycje) or "brak aparatow"

    kroki: list[dict[str, Any]] = [
        {
            "step": 1,
            "key": "ct_rezystancja_przewodow",
            "title": "Rezystancja przewodów obwodu wtórnego",
            "formula_latex": r"$$R_p = \frac{2\,\rho\,L}{s}$$",
            "inputs": {
                "rho": wartosc(rho, "Ω·mm²/m", "Rezystywność żyły (miedź, 20 °C)"),
                "dlugosc_m": wartosc(dlugosc_m, "m", "Długość obwodu w jedną stronę"),
                "przekroj_mm2": wartosc(przekroj_mm2, "mm²", "Przekrój żyły"),
            },
            "substitution": (
                r"$$R_p = \frac{2 \cdot "
                + liczba_tex(rho)
                + r" \cdot "
                + liczba_tex(dlugosc_m)
                + r"}{"
                + liczba_tex(przekroj_mm2)
                + r"} = "
                + liczba_tex(rp_ohm)
                + r"\ \Omega$$"
            ),
            "result": {"rp_ohm": wartosc(rp_ohm, "Ω", "Rezystancja przewodów")},
            "notes": (
                "Współczynnik 2 wynika z dwuprzewodowego obwodu wtórnego — prąd wraca "
                "tą samą trasą. Rezystywność jest założeniem jawnym, nie daną katalogu."
            ),
        },
        {
            "step": 2,
            "key": "ct_bilans_mocy",
            "title": "Bilans mocy obwodu wtórnego",
            "formula_latex": r"$$S_{2obl} = S_{aparatow} + I_{2n}^2 R_p + S_{stykow}$$",
            "inputs": {
                "i2n_a": wartosc(i2n_a, "A", "Prąd znamionowy wtórny"),
                "rp_ohm": wartosc(rp_ohm, "Ω", "Rezystancja przewodów"),
                "moc_aparatow_va": wartosc(moc_aparatow_va, "VA", "Suma mocy aparatów"),
                "moc_stykow_va": wartosc(moc_stykow_va, "VA", "Moc styków i zacisków"),
            },
            "substitution": (
                r"$$S_{2obl} = "
                + liczba_tex(moc_aparatow_va)
                + r" + "
                + liczba_tex(i2n_a)
                + r"^2 \cdot "
                + liczba_tex(rp_ohm)
                + r" + "
                + liczba_tex(moc_stykow_va)
                + r" = "
                + liczba_tex(s2obl_va)
                + r"\ \mathrm{VA}$$"
            ),
            "result": {
                "moc_przewodow_va": wartosc(moc_przewodow_va, "VA", "Moc tracona w przewodach"),
                "s2obl_va": wartosc(s2obl_va, "VA", "Moc obliczeniowa obwodu wtórnego"),
            },
            "notes": f"Aparaty w obwodzie: {wykaz}.",
        },
        {
            "step": 3,
            "key": "ct_wykorzystanie_mocy",
            "title": "Wykorzystanie mocy znamionowej przekładnika",
            "formula_latex": r"$$\frac{S_{2obl}}{S_n} \le 1$$",
            "inputs": {
                "s2obl_va": wartosc(s2obl_va, "VA", "Moc obliczeniowa"),
                "sn_va": wartosc(sn_va, "VA", "Moc znamionowa uzwojenia"),
            },
            "substitution": (
                r"$$\frac{"
                + liczba_tex(s2obl_va)
                + r"}{"
                + liczba_tex(sn_va)
                + r"} = "
                + liczba_tex(wykorzystanie)
                + r"$$"
            ),
            "result": {
                "wykorzystanie": wartosc(wykorzystanie, "", "Wykorzystanie mocy znamionowej"),
                "werdykt": {"value": status_obciazenia, "unit": "", "label": "Werdykt obciążenia"},
            },
            "notes": (
                "Przekroczenie mocy znamionowej pogarsza dokładność i obniża efektywny "
                "współczynnik graniczny — przekładnik nasyca się wcześniej."
            ),
        },
    ]

    if alf is not None and alf_eff is not None:
        if wariant == WARIANT_ALF_PELNY:
            wzor = r"$$ALF_{eff} = ALF \cdot \frac{S_n + S_w}{S_{2obl} + S_w}$$"
            uwaga = (
                "Wariant PEŁNY (normatywny): moc tracona w uzwojeniu wtórnym "
                "Sw = I2n²·Rct wchodzi po obu stronach ilorazu."
            )
        else:
            wzor = r"$$ALF_{eff} = ALF \cdot \frac{S_n}{S_{2obl}} \quad (S_w = 0)$$"
            uwaga = (
                "Wariant UPROSZCZONY — katalog nie niesie rezystancji uzwojenia wtórnego. "
                "Przy S2obl < Sn wynik jest WIĘKSZY niż w wariancie pełnym, czyli "
                "optymistyczny; potwierdź rezystancją uzwojenia z karty producenta."
            )
        kroki.append(
            {
                "step": 4,
                "key": "ct_alf_efektywny",
                "title": "Efektywny współczynnik graniczny dokładności",
                "formula_latex": wzor,
                "inputs": {
                    "alf": wartosc(alf, "", "Współczynnik graniczny z klasy"),
                    "sn_va": wartosc(sn_va, "VA", "Moc znamionowa uzwojenia"),
                    "sw_va": wartosc(sw_va, "VA", "Moc tracona w uzwojeniu wtórnym"),
                    "s2obl_va": wartosc(s2obl_va, "VA", "Moc obliczeniowa"),
                },
                "substitution": (
                    r"$$ALF_{eff} = "
                    + liczba_tex(alf)
                    + r" \cdot \frac{"
                    + liczba_tex(sn_va + sw_va)
                    + r"}{"
                    + liczba_tex(s2obl_va + sw_va)
                    + r"} = "
                    + liczba_tex(alf_eff)
                    + r"$$"
                ),
                "result": {
                    "alf_efektywny": wartosc(alf_eff, "", "Efektywny współczynnik graniczny"),
                    "wariant": {"value": wariant, "unit": "", "label": "Wariant rachunku"},
                },
                "notes": uwaga,
            }
        )

    if alf_eff is not None and alf_wymagany is not None:
        kroki.append(
            {
                "step": 5,
                "key": "ct_werdykt_nasycenia",
                "title": "Kryterium nasycenia przekładnika",
                "formula_latex": r"$$ALF_{eff} \ge ALF_{wym}$$",
                "inputs": {
                    "alf_efektywny": wartosc(alf_eff, "", "Efektywny współczynnik graniczny"),
                    "alf_wymagany": wartosc(
                        alf_wymagany, "", "Wymaganie funkcji zabezpieczeniowych pola"
                    ),
                },
                "substitution": (
                    r"$$"
                    + liczba_tex(alf_eff)
                    + (r" \ge " if alf_eff >= alf_wymagany else r" < ")
                    + liczba_tex(alf_wymagany)
                    + r"$$"
                ),
                "result": {
                    "zapas": wartosc(alf_eff - alf_wymagany, "", "Zapas współczynnika"),
                    "werdykt": {
                        "value": status_nasycenia,
                        "unit": "",
                        "label": "Werdykt nasycenia",
                    },
                },
                "notes": (
                    "Wymaganie wynika z funkcji zabezpieczeniowych pola (krotność prądu "
                    "zwarciowego względem prądu pierwotnego przekładnika)."
                ),
            }
        )

    return tuple(kroki)
