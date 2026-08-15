"""Bilans mocy wtornej i ZMIANA NAPIECIA obwodu PRZEKLADNIKA NAPIECIOWEGO.

DLACZEGO TEN MODUL POWSTAL (karta KD-3, dlug §7.4 pozycja 2). Przekladnik
napieciowy dobierano po przekladni i klasie, bez sprawdzenia obwodu wtornego.
Tymczasem o rzeczywistej dokladnosci pomiaru decyduja DWIE rzeczy: czy suma mocy
odbiornikow miesci sie w mocy znamionowej uzwojenia oraz jaka czesc napiecia
gubi sie na przewodach miedzy przekladnikiem a aparatem. Spadek 1 % na obwodzie
uzwojenia POMIAROWEGO to blad rozliczeniowy, ktorego zadna klasa dokladnosci
przekladnika juz nie odrobi.

PODSTAWA NORMOWA (IEC 61869-3). Obciazenie uzwojenia jest moca pozorna
odbiornikow; prad obwodu wynika z tej mocy i napiecia znamionowego wtornego:

    S2obl = S_aparatow + S_stykow            (styki tylko podane jawnie)
    I2 = S2obl / U2n
    Rp = 2·ρ·L / s                            (obwod dwuprzewodowy)
    ΔU = I2 · Rp,      ΔU% = ΔU / U2n · 100

LIMITY WEDLUG KATEGORII UZWOJENIA (rozstrzygniecie tej karty, zapisane jawnie):
  * uzwojenie POMIAROWE (klasy 0,1 / 0,2 / 0,2S / 0,5 / 0,5S / 1,0 / 3)  → 0,5 %
  * uzwojenie ZABEZPIECZENIOWE (klasy 3P / 6P)                            → 1,0 %
Kategorie wyprowadzamy z KLASY KATALOGOWEJ uzwojenia — nie z domyslu ani z nazwy
pola. Klasa nierozpoznana konczy sie kodem gotowosci, nie „bezpiecznym" limitem.

ZERO FABRYKACJI. Brak danych obwodu, mocy znamionowej uzwojenia, napiecia
wtornego albo kategorii uzwojenia daje status NIEDOSTEPNY i kod gotowosci.

WHITE BOX. Wynik niesie rezystancje przewodow, prad obwodu, ΔU w woltach i
procentach, limit z jego uzasadnieniem, oba werdykty czastkowe i pelny slad.
"""

from __future__ import annotations

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
READINESS_VT_SECONDARY_CIRCUIT_MISSING = "vt.secondary_circuit_missing"
READINESS_VT_RATED_BURDEN_MISSING = "vt.rated_burden_missing"
READINESS_VT_WINDING_CATEGORY_MISSING = "vt.winding_category_missing"

#: Rezystywnosc miedzi w 20 °C [Ω·mm²/m] — IEC 60228 (ta sama stala co w bilansie CT).
REZYSTYWNOSC_MIEDZI_20C = 0.017241

#: Kategorie uzwojenia i przypisane im limity zmiany napiecia obwodu wtornego [%].
KATEGORIA_POMIAROWA = "POMIAROWE"
KATEGORIA_ZABEZPIECZENIOWA = "ZABEZPIECZENIOWE"

LIMIT_DELTA_U_PROCENT: dict[str, float] = {
    KATEGORIA_POMIAROWA: 0.5,
    KATEGORIA_ZABEZPIECZENIOWA: 1.0,
}

ETYKIETA_KATEGORII_PL: dict[str, str] = {
    KATEGORIA_POMIAROWA: "uzwojenie pomiarowe",
    KATEGORIA_ZABEZPIECZENIOWA: "uzwojenie zabezpieczeniowe",
}

#: Klasy dokladnosci uzwojen wg IEC 61869-3. Rozdzial jest normowy, nie umowny:
#: klasy z litera „P" opisuja uchyb przy napieciach ZABEZPIECZENIOWYCH, pozostale
#: — uchyb pomiarowy w otoczeniu napiecia znamionowego.
_KLASY_POMIAROWE = frozenset({"0.1", "0.2", "0.2S", "0.5", "0.5S", "1.0", "1", "3"})
_KLASY_ZABEZPIECZENIOWE = frozenset({"3P", "6P"})

_FORMULA_REF = "S2obl = S_aparatow + S_stykow;  I2 = S2obl/U2n;  ΔU% = I2·Rp/U2n·100"


def kategoria_z_klasy(accuracy_class: str | None) -> str | None:
    """Wyprowadz kategorie uzwojenia z klasy katalogowej.

    Zwraca ``None`` dla klasy nierozpoznanej — wtedy kryterium nie ma limitu i
    konczy sie kodem gotowosci. Domyslanie sie kategorii („skoro nie pomiarowa,
    to zabezpieczeniowa") zamienialoby limit 0,5 % na 1,0 % i przepuszczaloby
    obwod pomiarowy dwukrotnie za dlugi.
    """
    if not accuracy_class:
        return None
    znormalizowana = accuracy_class.strip().upper().replace(",", ".")
    if znormalizowana in _KLASY_ZABEZPIECZENIOWE:
        return KATEGORIA_ZABEZPIECZENIOWA
    if znormalizowana in _KLASY_POMIAROWE:
        return KATEGORIA_POMIAROWA
    return None


@dataclass(frozen=True)
class VtDeviceBurden:
    """Pojedynczy odbiornik obwodu wtornego VT (licznik, przekaznik, miernik)."""

    nazwa: str
    moc_va: float


@dataclass(frozen=True)
class VtBurdenInput:
    """Dane wejsciowe bilansu wtornego VT.

    ``sn_va`` i ``u2n_v`` pochodza z pozycji katalogowej (wiazanie robi koncowka),
    ``kategoria_uzwojenia`` — z klasy dokladnosci TEGO uzwojenia.
    """

    u2n_v: float | None
    sn_va: float | None
    kategoria_uzwojenia: str | None
    dlugosc_przewodu_m: float | None
    przekroj_przewodu_mm2: float | None
    obciazenia_aparatow: tuple[VtDeviceBurden, ...] = ()
    moc_stykow_va: float | None = None
    rezystywnosc_ohm_mm2_per_m: float = REZYSTYWNOSC_MIEDZI_20C


@dataclass(frozen=True)
class VtBurdenResult:
    """Wynik bilansu wtornego i zmiany napiecia obwodu VT (WHITE BOX).

    ``status`` = NIEDOSTEPNY oznacza brak podstawy do oceny (patrz
    ``readiness_codes``); nie wolno go czytac jako spelnienia kryterium.

    ``status`` jest ZLOZENIEM obu werdyktow czastkowych regula
    ``slad.werdykt_zbiorczy`` (FAIL > NIEDOSTEPNY > PASS), wiec NIEDOSTEPNY
    werdykt zmiany napiecia nie moze dac zbiorczego PASS z samego obciazenia.
    """

    status: str
    status_obciazenia: str
    status_spadku: str
    rezystancja_przewodow_ohm: float | None
    moc_aparatow_va: float | None
    moc_stykow_va: float | None
    moc_obliczeniowa_va: float | None
    wykorzystanie_mocy: float | None
    prad_obwodu_a: float | None
    delta_u_v: float | None
    delta_u_procent: float | None
    limit_delta_u_procent: float | None
    kategoria_uzwojenia: str | None
    readiness_codes: tuple[str, ...] = ()
    formula_ref: str = _FORMULA_REF
    white_box_trace: tuple[dict[str, Any], ...] = ()
    assumptions: tuple[str, ...] = ()

    @property
    def is_conclusive(self) -> bool:
        return self.status in (STATUS_PASS, STATUS_FAIL)


def _zalozenia(*, rezystywnosc: float, kategoria: str, limit: float) -> tuple[str, ...]:
    return (
        "Obwod wtorny DWUPRZEWODOWY: Rp = 2·ρ·L/s (dlugosc L liczona w jedna strone).",
        f"Rezystywnosc zyly ρ = {rezystywnosc} Ω·mm²/m (miedz, 20 °C, IEC 60228) "
        "— zalozenie jawne, nie dane katalogu przekladnika.",
        "Prad obwodu wyprowadzony z mocy pozornej odbiornikow: I2 = S2obl/U2n.",
        "Zmiana napiecia liczona na skladowej REZYSTANCYJNEJ przewodow "
        "(reaktancja obwodu pomiarowego pomijalna przy tych dlugosciach).",
        f"Limit ΔU = {limit} % dla kategorii „{ETYKIETA_KATEGORII_PL[kategoria]}” "
        "— wyprowadzony z klasy dokladnosci uzwojenia, nie przyjety domyslnie.",
    )


def check_vt_burden_voltage_drop(data: VtBurdenInput) -> VtBurdenResult:
    """Policz bilans mocy wtornej VT i zmiane napiecia obwodu wtornego."""
    u2n = dodatnia(data.u2n_v)
    sn = dodatnia(data.sn_va)
    dlugosc = dodatnia(data.dlugosc_przewodu_m)
    przekroj = dodatnia(data.przekroj_przewodu_mm2)
    rho = dodatnia(data.rezystywnosc_ohm_mm2_per_m)
    styki = nieujemna(data.moc_stykow_va)
    kategoria = (
        data.kategoria_uzwojenia if data.kategoria_uzwojenia in LIMIT_DELTA_U_PROCENT else None
    )

    braki: list[str] = []
    if u2n is None or dlugosc is None or przekroj is None or rho is None:
        braki.append(READINESS_VT_SECONDARY_CIRCUIT_MISSING)
    if sn is None:
        braki.append(READINESS_VT_RATED_BURDEN_MISSING)
    if kategoria is None:
        braki.append(READINESS_VT_WINDING_CATEGORY_MISSING)

    if u2n is None or dlugosc is None or przekroj is None or rho is None or sn is None:
        return VtBurdenResult(
            status=STATUS_UNAVAILABLE,
            status_obciazenia=STATUS_UNAVAILABLE,
            status_spadku=STATUS_UNAVAILABLE,
            rezystancja_przewodow_ohm=None,
            moc_aparatow_va=None,
            moc_stykow_va=None,
            moc_obliczeniowa_va=None,
            wykorzystanie_mocy=None,
            prad_obwodu_a=None,
            delta_u_v=None,
            delta_u_procent=None,
            limit_delta_u_procent=None,
            kategoria_uzwojenia=kategoria,
            readiness_codes=tuple(dict.fromkeys(braki)),
        )

    rp_ohm = 2.0 * rho * dlugosc / przekroj
    moc_aparatow = sum(pozycja.moc_va for pozycja in data.obciazenia_aparatow)
    moc_stykow = styki or 0.0
    s2obl = moc_aparatow + moc_stykow
    wykorzystanie = s2obl / sn
    status_obciazenia = STATUS_PASS if s2obl <= sn else STATUS_FAIL

    prad_a = s2obl / u2n
    delta_u_v = prad_a * rp_ohm
    delta_u_procent = delta_u_v / u2n * 100.0

    if kategoria is None:
        limit = None
        status_spadku = STATUS_UNAVAILABLE
    else:
        limit = LIMIT_DELTA_U_PROCENT[kategoria]
        status_spadku = STATUS_PASS if delta_u_procent <= limit else STATUS_FAIL

    # Werdykt LACZNY skladany wspolna regula rodziny: FAIL > NIEDOSTEPNY > PASS.
    # Poprzednio nierozpoznana kategoria uzwojenia (limit NIE przyjety) znikala z
    # werdyktu, bo zbiorczy status wychodzil PASS z samego bilansu obciazenia —
    # ekran pokazywal zielone kryterium, ktorego polowy nikt nie sprawdzil.
    status = werdykt_zbiorczy(status_obciazenia, status_spadku)

    return VtBurdenResult(
        status=status,
        status_obciazenia=status_obciazenia,
        status_spadku=status_spadku,
        rezystancja_przewodow_ohm=rp_ohm,
        moc_aparatow_va=moc_aparatow,
        moc_stykow_va=styki,
        moc_obliczeniowa_va=s2obl,
        wykorzystanie_mocy=wykorzystanie,
        prad_obwodu_a=prad_a,
        delta_u_v=delta_u_v,
        delta_u_procent=delta_u_procent,
        limit_delta_u_procent=limit,
        kategoria_uzwojenia=kategoria,
        readiness_codes=tuple(dict.fromkeys(braki)),
        white_box_trace=_slad_vt(
            u2n_v=u2n,
            sn_va=sn,
            rho=rho,
            dlugosc_m=dlugosc,
            przekroj_mm2=przekroj,
            rp_ohm=rp_ohm,
            moc_aparatow_va=moc_aparatow,
            moc_stykow_va=moc_stykow,
            s2obl_va=s2obl,
            wykorzystanie=wykorzystanie,
            prad_a=prad_a,
            delta_u_v=delta_u_v,
            delta_u_procent=delta_u_procent,
            limit=limit,
            kategoria=kategoria,
            status_obciazenia=status_obciazenia,
            status_spadku=status_spadku,
            pozycje=data.obciazenia_aparatow,
        ),
        assumptions=(
            _zalozenia(rezystywnosc=rho, kategoria=kategoria, limit=limit)
            if kategoria is not None and limit is not None
            else (
                "Obwod wtorny DWUPRZEWODOWY: Rp = 2·ρ·L/s.",
                f"Rezystywnosc zyly ρ = {rho} Ω·mm²/m (miedz, 20 °C, IEC 60228).",
                "Brak rozpoznanej kategorii uzwojenia — limit ΔU NIE zostal przyjety.",
            )
        ),
    )


def _slad_vt(
    *,
    u2n_v: float,
    sn_va: float,
    rho: float,
    dlugosc_m: float,
    przekroj_mm2: float,
    rp_ohm: float,
    moc_aparatow_va: float,
    moc_stykow_va: float,
    s2obl_va: float,
    wykorzystanie: float,
    prad_a: float,
    delta_u_v: float,
    delta_u_procent: float,
    limit: float | None,
    kategoria: str | None,
    status_obciazenia: str,
    status_spadku: str,
    pozycje: tuple[VtDeviceBurden, ...],
) -> tuple[dict[str, Any], ...]:
    """Kroki dowodowe bilansu VT (kanon pieciu pol); slad nie liczy nic od nowa."""
    wykaz = (
        ", ".join(f"{p.nazwa}: {liczba_tex(p.moc_va)} VA" for p in pozycje) or "brak odbiornikow"
    )

    kroki: list[dict[str, Any]] = [
        {
            "step": 1,
            "key": "vt_bilans_mocy",
            "title": "Bilans mocy uzwojenia wtórnego",
            "formula_latex": r"$$S_{2obl} = S_{aparatow} + S_{stykow} \le S_n$$",
            "inputs": {
                "moc_aparatow_va": wartosc(moc_aparatow_va, "VA", "Suma mocy odbiorników"),
                "moc_stykow_va": wartosc(moc_stykow_va, "VA", "Moc styków i zacisków"),
                "sn_va": wartosc(sn_va, "VA", "Moc znamionowa uzwojenia"),
            },
            "substitution": (
                r"$$S_{2obl} = "
                + liczba_tex(moc_aparatow_va)
                + r" + "
                + liczba_tex(moc_stykow_va)
                + r" = "
                + liczba_tex(s2obl_va)
                + r"\ \mathrm{VA}$$"
            ),
            "result": {
                "s2obl_va": wartosc(s2obl_va, "VA", "Moc obliczeniowa uzwojenia"),
                "wykorzystanie": wartosc(wykorzystanie, "", "Wykorzystanie mocy znamionowej"),
                "werdykt": {"value": status_obciazenia, "unit": "", "label": "Werdykt obciążenia"},
            },
            "notes": f"Odbiorniki w obwodzie: {wykaz}.",
        },
        {
            "step": 2,
            "key": "vt_rezystancja_przewodow",
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
            "notes": "Współczynnik 2 wynika z dwuprzewodowego obwodu wtórnego.",
        },
        {
            "step": 3,
            "key": "vt_prad_obwodu",
            "title": "Prąd obwodu wtórnego",
            "formula_latex": r"$$I_2 = \frac{S_{2obl}}{U_{2n}}$$",
            "inputs": {
                "s2obl_va": wartosc(s2obl_va, "VA", "Moc obliczeniowa uzwojenia"),
                "u2n_v": wartosc(u2n_v, "V", "Napięcie znamionowe wtórne"),
            },
            "substitution": (
                r"$$I_2 = \frac{"
                + liczba_tex(s2obl_va)
                + r"}{"
                + liczba_tex(u2n_v)
                + r"} = "
                + liczba_tex(prad_a)
                + r"\ \mathrm{A}$$"
            ),
            "result": {"prad_a": wartosc(prad_a, "A", "Prąd obwodu wtórnego")},
            "notes": (
                "Przekładnik napięciowy pracuje jak źródło napięcia — prąd obwodu wynika "
                "z mocy pobieranej przez odbiorniki, nie z przekładni."
            ),
        },
        {
            "step": 4,
            "key": "vt_zmiana_napiecia",
            "title": "Zmiana napięcia na przewodach obwodu",
            "formula_latex": r"$$\Delta U = I_2 R_p,\quad \Delta U\% = \frac{\Delta U}{U_{2n}}\cdot 100$$",
            "inputs": {
                "prad_a": wartosc(prad_a, "A", "Prąd obwodu wtórnego"),
                "rp_ohm": wartosc(rp_ohm, "Ω", "Rezystancja przewodów"),
                "u2n_v": wartosc(u2n_v, "V", "Napięcie znamionowe wtórne"),
            },
            "substitution": (
                r"$$\Delta U = "
                + liczba_tex(prad_a)
                + r" \cdot "
                + liczba_tex(rp_ohm)
                + r" = "
                + liczba_tex(delta_u_v)
                + r"\ \mathrm{V} \Rightarrow "
                + liczba_tex(delta_u_procent)
                + r"\ \%$$"
            ),
            "result": {
                "delta_u_v": wartosc(delta_u_v, "V", "Zmiana napięcia"),
                "delta_u_procent": wartosc(delta_u_procent, "%", "Zmiana napięcia względna"),
            },
            "notes": (
                "Ta część napięcia nie dociera do aparatu — wchodzi wprost w uchyb "
                "pomiaru i nie jest korygowana klasą przekładnika."
            ),
        },
    ]

    if limit is not None and kategoria is not None:
        kroki.append(
            {
                "step": 5,
                "key": "vt_werdykt_spadku",
                "title": "Kryterium zmiany napięcia obwodu wtórnego",
                "formula_latex": r"$$\Delta U\% \le \Delta U_{dop}$$",
                "inputs": {
                    "delta_u_procent": wartosc(delta_u_procent, "%", "Zmiana napięcia względna"),
                    "limit": wartosc(limit, "%", "Limit dla kategorii uzwojenia"),
                    "kategoria": {
                        "value": ETYKIETA_KATEGORII_PL[kategoria],
                        "unit": "",
                        "label": "Kategoria uzwojenia",
                    },
                },
                "substitution": (
                    r"$$"
                    + liczba_tex(delta_u_procent)
                    + (r" \le " if delta_u_procent <= limit else r" > ")
                    + liczba_tex(limit)
                    + r"\ \%$$"
                ),
                "result": {
                    "zapas_procent": wartosc(limit - delta_u_procent, "%", "Zapas do limitu"),
                    "werdykt": {
                        "value": status_spadku,
                        "unit": "",
                        "label": "Werdykt zmiany napięcia",
                    },
                },
                "notes": (
                    "Limit wynika z kategorii uzwojenia: 0,5 % dla pomiarowego "
                    "(uchyb rozliczeniowy), 1,0 % dla zabezpieczeniowego."
                ),
            }
        )

    return tuple(kroki)
