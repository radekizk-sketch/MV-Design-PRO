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
    NIEWIARYGODNY,
    NastawyUrzadzenia,
    OcenaPunktu,
    WynikOceny,
    czas_urzadzenia,
)
from domain.protection_device import (
    VERDICT_LABELS_PL,
    CoordinationVerdict,
    OverloadCheck,
    SelectivityCheck,
    SensitivityCheck,
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
            ref
            for ref in sorted(strefy)
            if ref != podrzedne and strefy[podrzedne] < strefy[ref]
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
        nastawy = {
            n.urzadzenie_ref: n for n in wejscie.ocena_max.nastawy if n.gotowe and n.stopnie
        }
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
        werdykt = _werdykt_ogolny(czulosc, selektywnosc, przeciazalnosc)
        urzadzenia = tuple(
            _wpis_urzadzenia(n, wejscie.ocena_max.strefy.get(n.urzadzenie_ref))
            for n in sorted(wejscie.ocena_max.nastawy, key=lambda n: (n.nazwa_pl, n.urzadzenie_ref))
        ) + tuple(wejscie.bezpieczniki)
        podsumowanie = _podsumowanie(urzadzenia, czulosc, selektywnosc, przeciazalnosc, werdykt)
        podsumowanie["odmowy_par"] = len(wejscie.odmowy_par)
        podsumowanie["odmowy_urzadzen"] = len(wejscie.ocena_max.odmowy)
        # Kryteria (założenia projektowe) jawnie w wyniku — werdykt bez nich jest niewyjaśnialny.
        podsumowanie["kryteria"] = self.config.to_dict()
        slad.append(
            {
                "step": "werdykt",
                "description_pl": "Werdykt ogólny koordynacji",
                "inputs": {},
                "outputs": {"overall_verdict": werdykt},
            }
        )
        return CoordinationAnalysisResult(
            run_id=str(uuid4()),
            project_id=wejscie.project_id,
            devices=urzadzenia,
            sensitivity_checks=tuple(czulosc),
            selectivity_checks=tuple(selektywnosc),
            overload_checks=tuple(przeciazalnosc),
            tcc_curves=tuple(krzywe),
            fault_markers=tuple(znaczniki),
            overall_verdict=werdykt,
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
        wyniki: list[SensitivityCheck] = []
        for ref in sorted(set(nastawy) | set(odmowy)):
            if ref not in nastawy or not any(k[0] == ref for k in oceny_min):
                braki = odmowy[ref].braki if ref in odmowy else ()
                wyniki.append(
                    SensitivityCheck(
                        device_id=ref,
                        i_fault_min_a=None,
                        i_pickup_a=None,
                        margin_percent=None,
                        verdict=CoordinationVerdict.ERROR,
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
                        margin_percent=None,
                        verdict=CoordinationVerdict.ERROR,
                        notes_pl=(
                            "Dane nastaw niewiarygodne: prąd przekaźnika we wszystkich punktach "
                            "strefy przekracza zakres dokładności przekładnika."
                        ),
                    )
                )
                continue
            najmniejszy = min(wiarygodne, key=lambda o: (o.prad_przekaznika_a, o.punkt_ref))
            iloraz = najmniejszy.prad_przekaznika_a / stopien.prog_pierwotny_a
            if iloraz >= self.config.sensitivity_margin_pass:
                werdykt = CoordinationVerdict.PASS
                zdanie = "wystarczająca"
            elif iloraz >= self.config.sensitivity_margin_marginal:
                werdykt = CoordinationVerdict.MARGINAL
                zdanie = "na granicy"
            else:
                werdykt = CoordinationVerdict.FAIL
                zdanie = "niewystarczająca"
            wyniki.append(
                SensitivityCheck(
                    device_id=ref,
                    i_fault_min_a=najmniejszy.prad_przekaznika_a,
                    i_pickup_a=stopien.prog_pierwotny_a,
                    margin_percent=round((iloraz - 1.0) * 100.0, 2),
                    verdict=werdykt,
                    notes_pl=(
                        f"Czułość {zdanie}: najmniejszy prąd przekaźnika w strefie "
                        f"{_liczba(najmniejszy.prad_przekaznika_a, 1)} A (zwarcie w punkcie "
                        f"{najmniejszy.nazwa_punktu_pl}, bieg minimalny) wobec progu "
                        f"{_liczba(stopien.prog_pierwotny_a, 1)} A — iloraz {_liczba(iloraz, 2)}, "
                        f"wymagane co najmniej {_liczba(self.config.sensitivity_margin_pass, 2)}."
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
                    "outputs": {"iloraz": iloraz, "werdykt": wyniki[-1].verdict.value},
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
                        margin_percent=None,
                        verdict=CoordinationVerdict.ERROR,
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
                        margin_percent=None,
                        verdict=CoordinationVerdict.PASS,
                        notes_pl=(
                            "Przez wyłącznik nie płynie prąd roboczy — prąd roboczy nie pobudza "
                            "żadnego stopnia."
                        ),
                    )
                )
                continue
            iloraz = stopien.prog_pierwotny_a / robocze.prad_a
            if iloraz >= self.config.overload_margin_pass:
                werdykt, zdanie = CoordinationVerdict.PASS, "prawidłowa"
            elif iloraz >= self.config.overload_margin_marginal:
                werdykt, zdanie = CoordinationVerdict.MARGINAL, "na granicy"
            else:
                werdykt, zdanie = CoordinationVerdict.FAIL, "zagrożona (ryzyko zbędnego zadziałania)"
            wyniki.append(
                OverloadCheck(
                    device_id=ref,
                    i_operating_a=robocze.prad_a,
                    i_pickup_a=stopien.prog_pierwotny_a,
                    margin_percent=round((iloraz - 1.0) * 100.0, 2),
                    verdict=werdykt,
                    notes_pl=(
                        f"Przeciążalność {zdanie}: próg {_liczba(stopien.prog_pierwotny_a, 1)} A "
                        f"wobec prądu roboczego {_liczba(robocze.prad_a, 1)} A — iloraz "
                        f"{_liczba(iloraz, 2)}, wymagane co najmniej "
                        f"{_liczba(self.config.overload_margin_pass, 2)}."
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
                    "outputs": {"iloraz": iloraz, "werdykt": werdykt.value},
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
        cti_zalecane = cti * self.config.cti_margin_factor
        wyniki: list[SelectivityCheck] = []
        for para in wejscie.pary:
            punkty = sorted(k[1] for k in oceny_max if k[0] == para.podrzedne_ref)
            porownania: list[dict[str, Any]] = []
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
                porownania.append(_porownanie(pod, nad, cti, cti_zalecane))
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
                        verdict=CoordinationVerdict.ERROR,
                        notes_pl=(
                            " ".join(p["powod_pl"] for p in pominiete)
                            or "Brak punktów zwarcia w strefie urządzenia podrzędnego."
                        ),
                    )
                )
                continue
            najgorsze = min(porownania, key=_klucz_najgorszego)
            wyniki.append(
                SelectivityCheck(
                    upstream_device_id=para.nadrzedne_ref,
                    downstream_device_id=para.podrzedne_ref,
                    analysis_current_a=najgorsze["prad_podrzednego_a"],
                    t_upstream_s=najgorsze["t_nadrzednego_s"],
                    t_downstream_s=najgorsze["t_podrzednego_s"],
                    margin_s=najgorsze["margines_s"],
                    required_margin_s=cti,
                    verdict=najgorsze["werdykt"],
                    notes_pl=najgorsze["zdanie_pl"],
                    punkt_ref=najgorsze["punkt_ref"],
                    nazwa_punktu_pl=najgorsze["nazwa_punktu_pl"],
                    i_upstream_a=najgorsze["prad_nadrzednego_a"],
                )
            )
            slad.append(
                {
                    "step": "selektywnosc",
                    "description_pl": "Selektywność pary zabezpieczeń w punktach strefy podrzędnego",
                    "inputs": {
                        "nadrzedne_ref": para.nadrzedne_ref,
                        "podrzedne_ref": para.podrzedne_ref,
                        "cti_s": cti,
                        "cti_zalecane_s": cti_zalecane,
                    },
                    "outputs": {
                        "punkty": [
                            {k: v for k, v in p.items() if k != "werdykt"}
                            | {"werdykt": p["werdykt"].value}
                            for p in porownania
                        ],
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
            krzywe.append(
                TCCCurve(
                    device_id=n.urzadzenie_ref,
                    device_name=n.nazwa_pl,
                    curve_type=" + ".join(
                        f"{'I>' if s.funkcja == 'overcurrent_51' else 'I>>'} {s.krzywa}"
                        for s in sorted(n.stopnie, key=lambda s: s.funkcja, reverse=True)
                    ),
                    pickup_current_a=najczulszy.prog_pierwotny_a,
                    time_multiplier=zwloczny.tms if zwloczny is not None else None,
                    points=tuple(punkty),
                    color=CURVE_COLORS[indeks % len(CURVE_COLORS)],
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
            punkty_stref = {o.punkt_ref for o in ocena.oceny}
            for punkt in sorted(p for p in wiersze if p in punkty_stref):
                prad, nazwa = wiersze[punkt]
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


def _indeks(wynik: WynikOceny) -> dict[tuple[str, str], OcenaPunktu]:
    return {(o.urzadzenie_ref, o.punkt_ref): o for o in wynik.oceny}


def _porownanie(
    pod: OcenaPunktu, nad: OcenaPunktu, cti: float, cti_zalecane: float
) -> dict[str, Any]:
    t_pod = pod.t_zadzialania_s
    t_nad = nad.t_zadzialania_s
    wspolne = {
        "punkt_ref": pod.punkt_ref,
        "nazwa_punktu_pl": pod.nazwa_punktu_pl,
        "prad_podrzednego_a": pod.prad_przekaznika_a,
        "prad_nadrzednego_a": nad.prad_przekaznika_a,
        "t_podrzednego_s": t_pod,
        "t_nadrzednego_s": t_nad,
    }
    miejsce = f"przy zwarciu w punkcie {pod.nazwa_punktu_pl}"
    if t_pod is None and t_nad is None:
        return wspolne | {
            "margines_s": None,
            "werdykt": CoordinationVerdict.FAIL,
            "zdanie_pl": (
                f"Żadne z dwóch zabezpieczeń nie zadziała {miejsce} — prąd przekaźników "
                "nie przekracza progów (zwarcie nie jest wyłączane)."
            ),
        }
    if t_pod is None:
        return wspolne | {
            "margines_s": None,
            "werdykt": CoordinationVerdict.FAIL,
            "zdanie_pl": (
                f"Zabezpieczenie podrzędne nie zadziała {miejsce}, a nadrzędne zadziała po "
                f"{_liczba(t_nad or 0.0)} s — zwarcie wyłącza zabezpieczenie nadrzędne "
                "(brak selektywności)."
            ),
        }
    if t_nad is None:
        return wspolne | {
            "margines_s": None,
            "werdykt": CoordinationVerdict.PASS,
            "zdanie_pl": (
                f"Zabezpieczenie nadrzędne nie pobudza się {miejsce}; podrzędne wyłącza "
                f"zwarcie po {_liczba(t_pod)} s — selektywność zachowana."
            ),
        }
    margines = round(t_nad - t_pod, 6)
    if margines >= cti_zalecane:
        werdykt, zdanie = CoordinationVerdict.PASS, "zachowana"
    elif margines >= cti:
        werdykt, zdanie = CoordinationVerdict.MARGINAL, "na granicy"
    else:
        werdykt, zdanie = CoordinationVerdict.FAIL, "niezachowana"
    return wspolne | {
        "margines_s": margines,
        "werdykt": werdykt,
        "zdanie_pl": (
            f"Selektywność {zdanie} {miejsce}: podrzędne {_liczba(t_pod)} s przy "
            f"{_liczba(pod.prad_przekaznika_a, 1)} A, nadrzędne {_liczba(t_nad)} s przy "
            f"{_liczba(nad.prad_przekaznika_a, 1)} A — odstęp czasowy {_liczba(margines)} s, "
            f"wymagany co najmniej {_liczba(cti)} s (zalecany {_liczba(cti_zalecane)} s)."
        ),
    }


_RANGA_WERDYKTU = {
    CoordinationVerdict.FAIL: 0,
    CoordinationVerdict.ERROR: 1,
    CoordinationVerdict.MARGINAL: 2,
    CoordinationVerdict.PASS: 3,
}


def _klucz_najgorszego(p: dict[str, Any]) -> tuple[int, float, str]:
    margines = p["margines_s"]
    return (
        _RANGA_WERDYKTU[p["werdykt"]],
        margines if margines is not None else math.inf,
        p["punkt_ref"],
    )


def _wpis_urzadzenia(nastawy: NastawyUrzadzenia, strefa: Mapping[str, Any] | None) -> dict[str, Any]:
    return {
        "id": nastawy.urzadzenie_ref,
        "name": nastawy.nazwa_pl,
        "device_type": "RELAY",
        "breaker_ref": nastawy.breaker_ref,
        "nastawy": nastawy.to_dict(),
        "strefa": dict(strefa) if strefa is not None else None,
    }


def _werdykt_ogolny(
    czulosc: Sequence[SensitivityCheck],
    selektywnosc: Sequence[SelectivityCheck],
    przeciazalnosc: Sequence[OverloadCheck],
) -> str:
    werdykty = [c.verdict for c in (*czulosc, *selektywnosc, *przeciazalnosc)]
    if not werdykty:
        return CoordinationVerdict.ERROR.value
    if any(v in (CoordinationVerdict.FAIL, CoordinationVerdict.ERROR) for v in werdykty):
        return CoordinationVerdict.FAIL.value
    if any(v == CoordinationVerdict.MARGINAL for v in werdykty):
        return CoordinationVerdict.MARGINAL.value
    return CoordinationVerdict.PASS.value


def _podsumowanie(
    urzadzenia: Sequence[dict[str, Any]],
    czulosc: Sequence[SensitivityCheck],
    selektywnosc: Sequence[SelectivityCheck],
    przeciazalnosc: Sequence[OverloadCheck],
    werdykt: str,
) -> dict[str, Any]:
    def liczniki(sprawdzenia: Sequence[Any]) -> dict[str, int]:
        return {
            "pass": sum(1 for c in sprawdzenia if c.verdict == CoordinationVerdict.PASS),
            "marginal": sum(1 for c in sprawdzenia if c.verdict == CoordinationVerdict.MARGINAL),
            "fail": sum(1 for c in sprawdzenia if c.verdict == CoordinationVerdict.FAIL),
            "error": sum(1 for c in sprawdzenia if c.verdict == CoordinationVerdict.ERROR),
        }

    return {
        "total_devices": len(urzadzenia),
        "total_checks": len(czulosc) + len(selektywnosc) + len(przeciazalnosc),
        "sensitivity": liczniki(czulosc),
        "selectivity": liczniki(selektywnosc),
        "overload": liczniki(przeciazalnosc),
        "overall_verdict": werdykt,
        "overall_verdict_pl": VERDICT_LABELS_PL.get(werdykt, werdykt),
    }
