"""Koordynacja zabezpieczeń nadprądowych (ekran E-28) na urządzeniach i nastawach Z MODELU.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (decyzja D-21). Urządzenia, nastawy, strefy i prądy
przekaźników pochodzą z JEDNEJ ścieżki oceny (``application.analyses.protection.
ocena_nadpradowa``) policzonej na biegu zwarciowym maksymalnym i minimalnym. Ten moduł
wyłącznie INTERPRETUJE jej wynik — nie liczy żadnego czasu zadziałania sam:

* czułość: najmniejszy prąd przekaźnika w strefie urządzenia z biegu MINIMALNEGO wobec
  progu najczulszego stopnia (``I_min/I_s``),
* selektywność: dla KAŻDEJ pary (nadrzędne, podrzędne) i KAŻDEGO punktu zwarcia w strefie
  podrzędnego — różnica czasów zadziałania obu urządzeń przy ich WŁASNYCH prądach
  przekaźnika z biegu MAKSYMALNEGO (``Δt = t_nad − t_pod``); pary wynikają z topologii
  (strefa podrzędnego zawiera się w strefie nadrzędnego) albo są wskazane jawnie i wtedy
  sprawdzane wobec topologii — kolejność listy urządzeń nie znaczy nic,
* przeciążalność: próg stopnia zwłocznego (albo najczulszego) wobec prądu roboczego
  wyłącznika z biegu rozpływu (``I_s/I_rob``),
* charakterystyka TCC urządzenia: czas urządzenia (najszybszy pobudzony stopień) w siatce
  prądów — ten sam ``czas_urzadzenia`` co ocena punktu, ten sam rdzeń IEC 60255.

Dawny analizator brał urządzenia z żądania klienta (szablony ekranu), pary z kolejności
listy, prąd analizy z Ik'' szyny zamiast prądu przekaźnika, czas urządzenia wyłącznie ze
stopnia 51 i wpisywał 999,999 s jako „czas" braku zadziałania — wszystko skasowane.

Zakaz P-06 (``docs/analysis/PROTECTION_CANONICAL_ARCHITECTURE.md`` §3): koordynacja nie
wydaje werdyktów — każde sprawdzenie niesie liczby (prądy, czasy, odstęp, iloraz) obok wartości
wymaganej z kryteriów projektowych i zdanie z tymi liczbami; dawne pasma PASS/MARGINAL/FAIL
i werdykt ogólny skasowane.

NOT-A-SOLVER: zero fizyki poza rdzeniem ``network_model.solvers.protection_iec60255``
(wołanym przez ``czas_urzadzenia``); arytmetyka tu to ilorazy i różnice wyników.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from application.analyses.protection.ocena_nadpradowa import (
    ETYKIETY_KRZYWYCH_PL,
    NIEWIARYGODNY,
    NastawyUrzadzenia,
    OcenaPunktu,
    WynikOceny,
    czas_urzadzenia,
)
from domain.protection_device import (
    OverloadCheck,
    SelectivityCheck,
    SensitivityCheck,
    StanPary,
)

from .models import (
    CoordinationAnalysisResult,
    CoordinationConfig,
    CoordinationInput,
    FaultMarker,
    ParaSelektywnosci,
    TCCCurve,
    TCCPoint,
)

KOD_KRZYWA_PRZEKAZNIKOWA = "KRZYWA_PRZEKAZNIKOWA"
KOD_BRAK_CHARAKTERYSTYKI = "BRAK_CHARAKTERYSTYKI"
KOD_BRAK_PASMA_BEZPIECZNIKA = "BRAK_PASMA_BEZPIECZNIKA"

POWOD_BEZPIECZNIK_PL = (
    "Bezpiecznik topikowy nie ma charakterystyki przekaźnikowej IDMT wg IEC 60255 ani "
    "mnożnika czasowego TMS. Jego czas zadziałania wynika z pasma topikowego (krzywa "
    "przedłukowa i krzywa wyłączania) odczytywanego z karty katalogowej producenta wg "
    "IEC 60282-1. Katalog nie niesie punktów pasma, więc czasu zadziałania nie wyznaczono — "
    "nie zastąpiono go wzorem przekaźnika."
)

#: Paleta krzywych TCC (kolejność urządzeń posortowana po nazwie — deterministyczna).
CURVE_COLORS = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#9333ea",
    "#ea580c",
    "#0891b2",
    "#4f46e5",
    "#be123c",
]

#: Siatka charakterystyki TCC: liczba punktów i zakres krotności progu najczulszego.
PUNKTY_TCC = 60
KROTNOSC_TCC_OD = 1.05
KROTNOSC_TCC_DO = 30.0


def _liczba(wartosc: float, miejsca: int = 3) -> str:
    return f"{wartosc:.{miejsca}f}".rstrip("0").rstrip(".").replace(".", ",")


def _najczulszy_stopien(nastawy: NastawyUrzadzenia) -> Any:
    return min(nastawy.stopnie, key=lambda s: (s.prog_pierwotny_a, s.funkcja))


def _stopien_przeciazeniowy(nastawy: NastawyUrzadzenia) -> Any:
    """Stopień, który ma NIE działać przy prądzie roboczym: zwłoczny I> (51), a gdy go nie
    ma — najczulszy (każdy stopień pobudzony prądem roboczym to fałszywe zadziałanie)."""
    zwloczne = [s for s in nastawy.stopnie if s.funkcja == "overcurrent_51"]
    return zwloczne[0] if zwloczne else _najczulszy_stopien(nastawy)


def pary_z_topologii(
    strefy: Mapping[str, frozenset[str]],
) -> tuple[tuple[ParaSelektywnosci, ...], tuple[dict[str, Any], ...]]:
    """Pary (nadrzędne, podrzędne) z zawierania stref — bez żadnego domysłu kolejności.

    Podrzędne B ma nadrzędne A, gdy strefa B jest WŁAŚCIWYM podzbiorem strefy A (wyłącznik B
    leży w strefie A). Bezpośrednie nadrzędne to takie A o najmniejszej strefie. Dwa różne A
    o tej samej, najmniejszej strefie (nieuporządkowane względem siebie) to niejednoznaczność —
    nazwana odmowa pary z kandydatami, nie wybór jednego z nich.
    """
    pary: list[ParaSelektywnosci] = []
    odmowy: list[dict[str, Any]] = []
    for podrzedne in sorted(strefy):
        nadrzedne = [
            ref for ref in sorted(strefy) if ref != podrzedne and strefy[podrzedne] < strefy[ref]
        ]
        if not nadrzedne:
            continue
        najmniejsza = min(len(strefy[ref]) for ref in nadrzedne)
        kandydaci = [ref for ref in nadrzedne if len(strefy[ref]) == najmniejsza]
        if len(kandydaci) > 1:
            odmowy.append(
                {
                    "podrzedne_ref": podrzedne,
                    "kandydaci_nadrzedne": kandydaci,
                    "kod": "para_niejednoznaczna",
                    "powod_pl": (
                        "Kilka zabezpieczeń o tej samej strefie obejmuje strefę zabezpieczenia "
                        "podrzędnego — kolejność stopniowania nie wynika z topologii. Wskaż parę "
                        "jawnie."
                    ),
                }
            )
            continue
        pary.append(ParaSelektywnosci(nadrzedne_ref=kandydaci[0], podrzedne_ref=podrzedne))
    return tuple(pary), tuple(odmowy)


def pary_jawne(
    wskazane: Sequence[tuple[str, str]],
    strefy: Mapping[str, frozenset[str]],
) -> tuple[tuple[ParaSelektywnosci, ...], tuple[dict[str, Any], ...]]:
    """Pary wskazane przez projektanta — każda sprawdzona wobec topologii (tego samego
    zawierania stref, które wyznacza pary z topologii: jeden predykat dla obu dróg)."""
    pary: list[ParaSelektywnosci] = []
    odmowy: list[dict[str, Any]] = []
    for nadrzedne, podrzedne in sorted(set(wskazane)):
        if nadrzedne not in strefy or podrzedne not in strefy:
            odmowy.append(
                {
                    "podrzedne_ref": podrzedne,
                    "kandydaci_nadrzedne": [nadrzedne],
                    "kod": "para_bez_oceny",
                    "powod_pl": (
                        "Jedno z urządzeń wskazanej pary nie ma oceny (odmowa albo brak "
                        "urządzenia w modelu) — pary nie da się sprawdzić."
                    ),
                }
            )
            continue
        if not strefy[podrzedne] < strefy[nadrzedne]:
            odmowy.append(
                {
                    "podrzedne_ref": podrzedne,
                    "kandydaci_nadrzedne": [nadrzedne],
                    "kod": "para_sprzeczna_z_topologia",
                    "powod_pl": (
                        "Strefa urządzenia wskazanego jako podrzędne nie zawiera się w strefie "
                        "urządzenia nadrzędnego — para przeczy topologii modelu."
                    ),
                }
            )
            continue
        pary.append(ParaSelektywnosci(nadrzedne_ref=nadrzedne, podrzedne_ref=podrzedne))
    return tuple(pary), tuple(odmowy)


@dataclass
class OvercurrentCoordinationAnalyzer:
    """Interpretacja wyniku jednej ścieżki oceny w kryteriach koordynacji (E-28)."""

    config: CoordinationConfig

    def analyze(self, wejscie: CoordinationInput) -> CoordinationAnalysisResult:
        slad: list[dict[str, Any]] = []
        nastawy = {n.urzadzenie_ref: n for n in wejscie.ocena_max.nastawy if n.gotowe and n.stopnie}
        odmowy = {o.urzadzenie_ref: o for o in wejscie.ocena_max.odmowy}
        oceny_max = _indeks(wejscie.ocena_max)
        oceny_min = _indeks(wejscie.ocena_min)
        slad.append(
            {
                "step": "urzadzenia_z_modelu",
                "description_pl": "Urządzenia i nastawy z modelu (jedna ścieżka oceny)",
                "inputs": {"sc_run_id": wejscie.sc_run_id, "sc_run_id_min": wejscie.sc_run_id_min},
                "outputs": {
                    "urzadzenia": sorted(nastawy),
                    "odmowy": sorted(odmowy),
                    "pominiete": [p.to_dict() for p in wejscie.ocena_max.pominiete],
                },
            }
        )

        czulosc = self._czulosc(wejscie, nastawy, odmowy, oceny_min, slad)
        przeciazalnosc = self._przeciazalnosc(wejscie, nastawy, slad)
        selektywnosc = self._selektywnosc(wejscie, oceny_max, slad)
        krzywe = self._krzywe_tcc(wejscie, nastawy, slad)
        znaczniki = self._znaczniki(wejscie)
        urzadzenia = tuple(
            _wpis_urzadzenia(n, wejscie.ocena_max.strefy.get(n.urzadzenie_ref))
            for n in sorted(wejscie.ocena_max.nastawy, key=lambda n: (n.nazwa_pl, n.urzadzenie_ref))
        ) + tuple(wejscie.bezpieczniki)
        podsumowanie = _podsumowanie(urzadzenia, czulosc, selektywnosc, przeciazalnosc)
        podsumowanie["odmowy_par"] = len(wejscie.odmowy_par)
        podsumowanie["odmowy_urzadzen"] = len(wejscie.ocena_max.odmowy)
        # Kryteria (założenia projektowe) jawnie w wyniku — wartości wymagane przy liczbach.
        podsumowanie["kryteria"] = self.config.to_dict()
        return CoordinationAnalysisResult(
            run_id=str(uuid4()),
            project_id=wejscie.project_id,
            devices=urzadzenia,
            sensitivity_checks=tuple(czulosc),
            selectivity_checks=tuple(selektywnosc),
            overload_checks=tuple(przeciazalnosc),
            tcc_curves=tuple(krzywe),
            fault_markers=tuple(znaczniki),
            summary=podsumowanie,
            trace_steps=tuple(slad),
            odmowy_urzadzen=tuple(o.to_dict() for o in wejscie.ocena_max.odmowy),
            pominiete=tuple(p.to_dict() for p in wejscie.ocena_max.pominiete),
            pary=tuple(p.to_dict() for p in wejscie.pary),
            odmowy_par=tuple(wejscie.odmowy_par),
            pf_run_id=wejscie.pf_run_id,
            sc_run_id=wejscie.sc_run_id,
            sc_run_id_min=wejscie.sc_run_id_min,
            created_at=datetime.now(UTC),
        )

    # ------------------------------------------------------------------ czułość

    def _czulosc(
        self,
        wejscie: CoordinationInput,
        nastawy: Mapping[str, NastawyUrzadzenia],
        odmowy: Mapping[str, Any],
        oceny_min: Mapping[tuple[str, str], OcenaPunktu],
        slad: list[dict[str, Any]],
    ) -> list[SensitivityCheck]:
        wymagany = self.config.sensitivity_ratio_required
        wyniki: list[SensitivityCheck] = []
        for ref in sorted(set(nastawy) | set(odmowy)):
            if ref not in nastawy or not any(k[0] == ref for k in oceny_min):
                braki = odmowy[ref].braki if ref in odmowy else ()
                wyniki.append(
                    SensitivityCheck(
                        device_id=ref,
                        i_fault_min_a=None,
                        i_pickup_a=None,
                        ratio=None,
                        margin_percent=None,
                        required_ratio=wymagany,
                        notes_pl=(
                            " ".join(b.komunikat_pl for b in braki)
                            or "Bieg minimalny nie ma punktu zwarcia w strefie urządzenia."
                        ),
                    )
                )
                continue
            n = nastawy[ref]
            stopien = _najczulszy_stopien(n)
            punkty = [o for k, o in sorted(oceny_min.items()) if k[0] == ref]
            wiarygodne = [o for o in punkty if o.wiarygodnosc != NIEWIARYGODNY]
            if not wiarygodne:
                wyniki.append(
                    SensitivityCheck(
                        device_id=ref,
                        i_fault_min_a=None,
                        i_pickup_a=stopien.prog_pierwotny_a,
                        ratio=None,
                        margin_percent=None,
                        required_ratio=wymagany,
                        notes_pl=(
                            "Dane nastaw niewiarygodne: prąd przekaźnika we wszystkich punktach "
                            "strefy przekracza zakres dokładności przekładnika — ilorazu czułości "
                            "nie wyznaczono."
                        ),
                    )
                )
                continue
            najmniejszy = min(wiarygodne, key=lambda o: (o.prad_przekaznika_a, o.punkt_ref))
            iloraz = najmniejszy.prad_przekaznika_a / stopien.prog_pierwotny_a
            wyniki.append(
                SensitivityCheck(
                    device_id=ref,
                    i_fault_min_a=najmniejszy.prad_przekaznika_a,
                    i_pickup_a=stopien.prog_pierwotny_a,
                    ratio=round(iloraz, 6),
                    margin_percent=round((iloraz - 1.0) * 100.0, 2),
                    required_ratio=wymagany,
                    notes_pl=(
                        f"Najmniejszy prąd przekaźnika w strefie "
                        f"{_liczba(najmniejszy.prad_przekaznika_a, 1)} A (zwarcie w punkcie "
                        f"{najmniejszy.nazwa_punktu_pl}, bieg minimalny) wobec progu "
                        f"{_liczba(stopien.prog_pierwotny_a, 1)} A ({stopien.etykieta_pl}) — "
                        f"iloraz czułości {_liczba(iloraz, 2)}; wymagany co najmniej "
                        f"{_liczba(wymagany, 2)}."
                    ),
                    punkt_ref=najmniejszy.punkt_ref,
                    nazwa_punktu_pl=najmniejszy.nazwa_punktu_pl,
                    stopien=stopien.funkcja,
                )
            )
            slad.append(
                {
                    "step": "czulosc",
                    "description_pl": f"Czułość zabezpieczenia {n.nazwa_pl}",
                    "inputs": {
                        "punkty": [
                            {"punkt_ref": o.punkt_ref, "prad_przekaznika_a": o.prad_przekaznika_a}
                            for o in punkty
                        ],
                        "prog_pierwotny_a": stopien.prog_pierwotny_a,
                        "stopien": stopien.funkcja,
                    },
                    "outputs": {"iloraz": iloraz, "wymagany_iloraz": wymagany},
                }
            )
        return wyniki

    # --------------------------------------------------------- przeciążalność

    def _przeciazalnosc(
        self,
        wejscie: CoordinationInput,
        nastawy: Mapping[str, NastawyUrzadzenia],
        slad: list[dict[str, Any]],
    ) -> list[OverloadCheck]:
        wymagany = self.config.overload_ratio_required
        wyniki: list[OverloadCheck] = []
        for ref in sorted(nastawy):
            n = nastawy[ref]
            stopien = _stopien_przeciazeniowy(n)
            robocze = wejscie.prady_robocze.get(ref)
            if robocze is None or robocze.prad_a is None:
                wyniki.append(
                    OverloadCheck(
                        device_id=ref,
                        i_operating_a=None,
                        i_pickup_a=stopien.prog_pierwotny_a,
                        ratio=None,
                        margin_percent=None,
                        required_ratio=wymagany,
                        notes_pl=(
                            robocze.powod_pl
                            if robocze is not None and robocze.powod_pl
                            else "Brak biegu rozpływu mocy — prądu roboczego wyłącznika nie "
                            "wyznaczono."
                        ),
                    )
                )
                continue
            if robocze.prad_a <= 0.0:
                wyniki.append(
                    OverloadCheck(
                        device_id=ref,
                        i_operating_a=robocze.prad_a,
                        i_pickup_a=stopien.prog_pierwotny_a,
                        ratio=None,
                        margin_percent=None,
                        required_ratio=wymagany,
                        notes_pl=(
                            "Przez wyłącznik nie płynie prąd roboczy — ilorazu przeciążalności "
                            "nie ma (dzielenie przez zero), prąd roboczy nie pobudza żadnego "
                            "stopnia."
                        ),
                    )
                )
                continue
            iloraz = stopien.prog_pierwotny_a / robocze.prad_a
            wyniki.append(
                OverloadCheck(
                    device_id=ref,
                    i_operating_a=robocze.prad_a,
                    i_pickup_a=stopien.prog_pierwotny_a,
                    ratio=round(iloraz, 6),
                    margin_percent=round((iloraz - 1.0) * 100.0, 2),
                    required_ratio=wymagany,
                    notes_pl=(
                        f"Próg {_liczba(stopien.prog_pierwotny_a, 1)} A ({stopien.etykieta_pl}) "
                        f"wobec prądu roboczego wyłącznika {_liczba(robocze.prad_a, 1)} A — "
                        f"iloraz przeciążalności {_liczba(iloraz, 2)}; wymagany co najmniej "
                        f"{_liczba(wymagany, 2)}."
                    ),
                )
            )
            slad.append(
                {
                    "step": "przeciazalnosc",
                    "description_pl": f"Przeciążalność zabezpieczenia {n.nazwa_pl}",
                    "inputs": {
                        "prad_roboczy_a": robocze.prad_a,
                        "galaz_ref": robocze.galaz_ref,
                        "prog_pierwotny_a": stopien.prog_pierwotny_a,
                    },
                    "outputs": {"iloraz": iloraz, "wymagany_iloraz": wymagany},
                }
            )
        return wyniki

    # ----------------------------------------------------------- selektywność

    def _selektywnosc(
        self,
        wejscie: CoordinationInput,
        oceny_max: Mapping[tuple[str, str], OcenaPunktu],
        slad: list[dict[str, Any]],
    ) -> list[SelectivityCheck]:
        cti = self.config.get_minimum_grading_margin_s()
        wyniki: list[SelectivityCheck] = []
        for para in wejscie.pary:
            punkty = sorted(k[1] for k in oceny_max if k[0] == para.podrzedne_ref)
            porownania: list[SelectivityCheck] = []
            pominiete: list[dict[str, Any]] = []
            for punkt in punkty:
                pod = oceny_max[(para.podrzedne_ref, punkt)]
                nad = oceny_max.get((para.nadrzedne_ref, punkt))
                if nad is None:
                    pominiete.append(
                        {
                            "punkt_ref": punkt,
                            "powod_pl": "Brak oceny urządzenia nadrzędnego w tym punkcie.",
                        }
                    )
                    continue
                if NIEWIARYGODNY in (pod.wiarygodnosc, nad.wiarygodnosc):
                    pominiete.append(
                        {
                            "punkt_ref": punkt,
                            "powod_pl": "Dane nastaw niewiarygodne (zakres dokładności przekładnika).",
                        }
                    )
                    continue
                porownania.append(_porownanie(para, pod, nad, cti))
            if not porownania:
                wyniki.append(
                    SelectivityCheck(
                        upstream_device_id=para.nadrzedne_ref,
                        downstream_device_id=para.podrzedne_ref,
                        analysis_current_a=None,
                        t_upstream_s=None,
                        t_downstream_s=None,
                        margin_s=None,
                        required_margin_s=cti,
                        stan=StanPary.BEZ_PUNKTOW,
                        notes_pl=(
                            " ".join(p["powod_pl"] for p in pominiete)
                            or "Brak punktów zwarcia w strefie urządzenia podrzędnego."
                        ),
                    )
                )
                continue
            wyniki.append(min(porownania, key=_klucz_najmniejszego_odstepu))
            slad.append(
                {
                    "step": "selektywnosc",
                    "description_pl": "Selektywność pary zabezpieczeń w punktach strefy podrzędnego",
                    "inputs": {
                        "nadrzedne_ref": para.nadrzedne_ref,
                        "podrzedne_ref": para.podrzedne_ref,
                        "cti_s": cti,
                    },
                    "outputs": {
                        "punkty": [p.to_dict() for p in porownania],
                        "pominiete": pominiete,
                    },
                }
            )
        return wyniki

    # -------------------------------------------------------------------- TCC

    def _krzywe_tcc(
        self,
        wejscie: CoordinationInput,
        nastawy: Mapping[str, NastawyUrzadzenia],
        slad: list[dict[str, Any]],
    ) -> list[TCCCurve]:
        krzywe: list[TCCCurve] = []
        uporzadkowane = sorted(nastawy.values(), key=lambda n: (n.nazwa_pl, n.urzadzenie_ref))
        for indeks, n in enumerate(uporzadkowane):
            najczulszy = _najczulszy_stopien(n)
            punkty: list[TCCPoint] = []
            for k in range(PUNKTY_TCC):
                krotnosc = KROTNOSC_TCC_OD * math.pow(
                    KROTNOSC_TCC_DO / KROTNOSC_TCC_OD, k / (PUNKTY_TCC - 1)
                )
                prad = najczulszy.prog_pierwotny_a * krotnosc
                _slady, decydujacy = czas_urzadzenia(n.stopnie, prad)
                if decydujacy is None:
                    continue
                punkty.append(
                    TCCPoint(
                        current_a=round(prad, 6),
                        current_multiple=round(krotnosc, 6),
                        time_s=decydujacy["t_s"],
                    )
                )
            zwloczny = next((s for s in n.stopnie if s.funkcja == "overcurrent_51"), None)
            odniesienie = zwloczny if zwloczny is not None else najczulszy
            krzywe.append(
                TCCCurve(
                    device_id=n.urzadzenie_ref,
                    device_name=n.nazwa_pl,
                    # Kod charakterystyki stopnia zwłocznego (albo najczulszego) — legenda;
                    # pełny opis wszystkich stopni w `opis_pl`.
                    curve_type=odniesienie.krzywa,
                    pickup_current_a=najczulszy.prog_pierwotny_a,
                    time_multiplier=zwloczny.tms if zwloczny is not None else None,
                    points=tuple(punkty),
                    color=CURVE_COLORS[indeks % len(CURVE_COLORS)],
                    opis_pl="; ".join(
                        _opis_stopnia(s)
                        for s in sorted(n.stopnie, key=lambda s: s.funkcja, reverse=True)
                    ),
                )
            )
        for indeks, bezpiecznik in enumerate(wejscie.bezpieczniki, start=len(uporzadkowane)):
            krzywe.append(
                TCCCurve(
                    device_id=str(bezpiecznik["id"]),
                    device_name=str(bezpiecznik["name"]),
                    curve_type=KOD_BRAK_CHARAKTERYSTYKI,
                    pickup_current_a=None,
                    time_multiplier=None,
                    points=(),
                    color=CURVE_COLORS[indeks % len(CURVE_COLORS)],
                    podstawa_kod=KOD_BRAK_PASMA_BEZPIECZNIKA,
                    powod_pl=POWOD_BEZPIECZNIK_PL,
                )
            )
        slad.append(
            {
                "step": "krzywe_tcc",
                "description_pl": (
                    "Charakterystyki czasowo-prądowe urządzeń — czas najszybszego pobudzonego "
                    "stopnia w siatce prądów (rdzeń IEC 60255)"
                ),
                "inputs": {
                    "punkty": PUNKTY_TCC,
                    "krotnosc_od": KROTNOSC_TCC_OD,
                    "krotnosc_do": KROTNOSC_TCC_DO,
                },
                "outputs": {"krzywe": len(krzywe)},
            }
        )
        return krzywe

    def _znaczniki(self, wejscie: CoordinationInput) -> list[FaultMarker]:
        """Ik'' punktów stref ocenionych urządzeń (bieg maksymalny i minimalny) — znaczniki
        wykresu TCC wyłącznie tam, gdzie urządzenia modelu mają oceny."""
        znaczniki: list[FaultMarker] = []
        for etykieta, wiersze, rodzaj, ocena in (
            ("max", wejscie.prady_punktow_max, wejscie.rodzaj_zwarcia_max, wejscie.ocena_max),
            ("min", wejscie.prady_punktow_min, wejscie.rodzaj_zwarcia_min, wejscie.ocena_min),
        ):
            # Punkt oceny i wiersz wyniku, pod którym bieg go raportuje (zacisk pola za
            # wyłącznikiem = szyna pola, ``ocena_nadpradowa.punkty_zwarcia_strefy``).
            punkty_stref = {
                o.punkt_ref: (str(o.bilans_pradu["punkt_wyniku_ref"]), o.nazwa_punktu_pl)
                for o in ocena.oceny
            }
            for punkt in sorted(punkty_stref):
                punkt_wyniku, nazwa = punkty_stref[punkt]
                if punkt_wyniku not in wiersze:
                    continue
                prad, _nazwa_wiersza = wiersze[punkt_wyniku]
                znaczniki.append(
                    FaultMarker(
                        id=f"{punkt}_ik_{etykieta}",
                        label_pl=f"Ik'' {etykieta} {rodzaj} ({nazwa})",
                        current_a=prad,
                        fault_type=rodzaj,
                        location=punkt,
                    )
                )
        return znaczniki


def _opis_stopnia(stopien: Any) -> str:
    """„I> (51): 240 A, IEC normalnie odwrotna (NI), TMS 0,3" — stopień w zdaniu legendy."""
    czas = (
        f"TMS {_liczba(stopien.tms)}"
        if stopien.tms is not None
        else f"zwłoka {_liczba(stopien.zwloka_s)} s"
    )
    return (
        f"{stopien.etykieta_pl}: {_liczba(stopien.prog_pierwotny_a, 1)} A, "
        f"{ETYKIETY_KRZYWYCH_PL[stopien.krzywa]}, {czas}"
    )


def _indeks(wynik: WynikOceny) -> dict[tuple[str, str], OcenaPunktu]:
    return {(o.urzadzenie_ref, o.punkt_ref): o for o in wynik.oceny}


def _porownanie(
    para: ParaSelektywnosci,
    pod: OcenaPunktu,
    nad: OcenaPunktu,
    cti: float,
) -> SelectivityCheck:
    """Selektywność pary w jednym punkcie strefy podrzędnego: kto zadziała (``StanPary``),
    odstęp czasowy i zdanie z liczbami (punkt, czasy i prądy obu przekaźników, odstęp,
    wymagany odstęp) — bez werdyktu (P-06)."""
    t_pod = pod.t_zadzialania_s
    t_nad = nad.t_zadzialania_s
    miejsce = f"Przy zwarciu w punkcie {pod.nazwa_punktu_pl}"

    def sprawdzenie(margines: float | None, stan: StanPary, zdanie: str) -> SelectivityCheck:
        return SelectivityCheck(
            upstream_device_id=para.nadrzedne_ref,
            downstream_device_id=para.podrzedne_ref,
            analysis_current_a=pod.prad_przekaznika_a,
            t_upstream_s=t_nad,
            t_downstream_s=t_pod,
            margin_s=margines,
            required_margin_s=cti,
            stan=stan,
            notes_pl=zdanie,
            punkt_ref=pod.punkt_ref,
            nazwa_punktu_pl=pod.nazwa_punktu_pl,
            i_upstream_a=nad.prad_przekaznika_a,
        )

    prady = (
        f"prąd przekaźnika podrzędnego {_liczba(pod.prad_przekaznika_a, 1)} A, "
        f"nadrzędnego {_liczba(nad.prad_przekaznika_a, 1)} A"
    )
    if t_pod is None and t_nad is None:
        return sprawdzenie(
            None,
            StanPary.ZADNE_NIE_ZADZIALA,
            f"{miejsce} żadne z dwóch zabezpieczeń nie zadziała ({prady} — poniżej progów); "
            "odstępu czasowego nie ma.",
        )
    if t_pod is None:
        assert t_nad is not None
        return sprawdzenie(
            None,
            StanPary.PODRZEDNE_NIE_ZADZIALA,
            f"{miejsce} zabezpieczenie podrzędne nie zadziała, a nadrzędne zadziała po "
            f"{_liczba(t_nad)} s ({prady}); odstępu czasowego nie ma.",
        )
    if t_nad is None:
        return sprawdzenie(
            None,
            StanPary.NADRZEDNE_NIE_POBUDZA,
            f"{miejsce} zabezpieczenie nadrzędne się nie pobudza, podrzędne zadziała po "
            f"{_liczba(t_pod)} s ({prady}); odstępu czasowego nie ma.",
        )
    margines = round(t_nad - t_pod, 6)
    return sprawdzenie(
        margines,
        StanPary.ODSTEP,
        f"{miejsce}: podrzędne {_liczba(t_pod)} s przy {_liczba(pod.prad_przekaznika_a, 1)} A, "
        f"nadrzędne {_liczba(t_nad)} s przy {_liczba(nad.prad_przekaznika_a, 1)} A — odstęp "
        f"czasowy {_liczba(margines)} s; wymagany co najmniej {_liczba(cti)} s.",
    )


def _klucz_najmniejszego_odstepu(p: SelectivityCheck) -> tuple[float, str]:
    """Punkt pary pokazywany w tabeli: NAJMNIEJSZY odstęp czasowy, potem punkt (kolejność
    deterministyczna). Punkt bez odstępu, w którym podrzędne nie zadziała (samo albo z
    nadrzędnym), ma odstęp −∞ (zwarcie nie jest wyłączane przez podrzędne — mniejszego odstępu
    nie ma); punkt, w którym nadrzędne się nie pobudza, ma +∞ (nadrzędne nie ogranicza pary)."""
    if p.margin_s is not None:
        odstep = p.margin_s
    elif p.stan in (StanPary.PODRZEDNE_NIE_ZADZIALA, StanPary.ZADNE_NIE_ZADZIALA):
        odstep = -math.inf
    else:
        odstep = math.inf
    return (odstep, str(p.punkt_ref))


def _wpis_urzadzenia(
    nastawy: NastawyUrzadzenia, strefa: Mapping[str, Any] | None
) -> dict[str, Any]:
    return {
        "id": nastawy.urzadzenie_ref,
        "name": nastawy.nazwa_pl,
        "device_type": "RELAY",
        "breaker_ref": nastawy.breaker_ref,
        "nastawy": nastawy.to_dict(),
        "strefa": dict(strefa) if strefa is not None else None,
    }


def _najmniejsza(wartosci: Sequence[float | None]) -> float | None:
    liczby = [w for w in wartosci if w is not None]
    return min(liczby) if liczby else None


def _podsumowanie(
    urzadzenia: Sequence[dict[str, Any]],
    czulosc: Sequence[SensitivityCheck],
    selektywnosc: Sequence[SelectivityCheck],
    przeciazalnosc: Sequence[OverloadCheck],
) -> dict[str, Any]:
    """Liczby zbiorcze — najmniejsze wartości sprawdzeń i liczby sprawdzeń bez wyznaczonej
    wartości. Bez werdyktu ogólnego (P-06): agregat nie zastępuje sprawdzeń składowych."""
    return {
        "total_devices": len(urzadzenia),
        "total_checks": len(czulosc) + len(selektywnosc) + len(przeciazalnosc),
        "sensitivity": {
            "sprawdzenia": len(czulosc),
            "najmniejszy_iloraz": _najmniejsza([c.ratio for c in czulosc]),
            "bez_wartosci": sum(1 for c in czulosc if c.ratio is None),
        },
        "selectivity": {
            "sprawdzenia": len(selektywnosc),
            "najmniejszy_odstep_s": _najmniejsza([c.margin_s for c in selektywnosc]),
            "bez_odstepu": sum(1 for c in selektywnosc if c.margin_s is None),
        },
        "overload": {
            "sprawdzenia": len(przeciazalnosc),
            "najmniejszy_iloraz": _najmniejsza([c.ratio for c in przeciazalnosc]),
            "bez_wartosci": sum(1 for c in przeciazalnosc if c.ratio is None),
        },
    }
