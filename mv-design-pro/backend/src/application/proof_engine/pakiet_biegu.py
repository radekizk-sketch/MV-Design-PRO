"""Pakiet dowodowy PRZEBIEGU — brama między biegiem kanonicznym a pakietami dowodowymi.

STATUS: CANONICAL (karta PACK-DOWODY, rejestr V12K).

DEFEKT, KTÓRY TO ZAMYKA. Dedykowane pakiety dowodowe (ZIP: ``proof.json`` +
``proof.tex`` + opcjonalny ``proof.pdf`` + ``manifest.json`` z odciskiem +
``signature.json``) istniały w backendzie od dawna, ale ŻADEN nie miał konsumenta
w interfejsie. Powód nie był przypadkiem — ich kontrakty HTTP wymagały od klienta
WIELKOŚCI FIZYCZNYCH, których interfejs uczciwie nie ma i mieć nie może:

- ``POST /api/proof/sc3f/pack``            — snapshot ENM (klient ma) ⇒ wołalny,
- ``POST /api/proof/sc-asymmetrical/pack`` — Z1/Z2/Z0, U_f = c·U_n/√3, operator
  Fortescue ``a`` ⇒ NIEWOŁALNY bez liczenia fizyki w UI (zakaz CLAUDE.md),
- ``GET  /api/proof/{p}/{c}/{r}/pack``     — wycofany (410 Gone) w torze V12.xx.

Ta brama odwraca kierunek: klient podaje WYŁĄCZNIE tożsamość przebiegu (``run_id``)
i punkt zwarcia, a serwer — który ma zamrożony snapshot biegu, jego opcje i wynik —
sam dobiera rodzaj pakietu i liczy wszystko po swojej stronie (ZERO fizyki w UI).

JEDNO ŹRÓDŁO PRAWDY RODZAJU (reguła predykatów parami). Zarówno DOSTĘPNOŚĆ pakietu
(co widzi użytkownik), jak i BUDOWA pakietu (co dostaje) czytają ten sam predykat
``rodzaj_pakietu_biegu`` opisany rodzajem wykonawczym biegu
(``CanonicalRun.to_execution_dict()['analysis_type']``). Dwa niezależne warunki,
które „dziś się zgadzają", byłyby defektem czekającym na dane brzegowe.

NOT-A-SOLVER: ten moduł nie liczy fizyki. Woła solvery (``ShortCircuitIEC60909Solver``,
``compute_sc1_asymmetrical_quantities`` przez pakiet) i pakiety dowodowe, a sam
wyłącznie zestawia ich wejścia z zapisanego biegu. Pakiet ROZPŁYWU nie woła nawet
solvera: bieg zapisał gotowy, zamrożony wynik, a warstwa wiązania
(``application/solvers/power_flow_binding.py``) wyłącznie go odtwarza — fizyka
NIE POWTARZA SIĘ (karta PACK-ROZPLYW).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from application.proof_engine.packs.p14_power_flow import P14PowerFlowInput, P14PowerFlowProof
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from application.solvers.power_flow_binding import (
    BrakDanychRozplywuError,
    RozplywZBiegu,
    rozplyw_z_biegu,
)
from enm.canonical_analysis import CanonicalRun

#: Rodzaje pakietów dowodowych osiągalne dla biegu kanonicznego.
RODZAJ_SC3F = "SC3F"
RODZAJ_SC_NIESYMETRYCZNE = "SC_NIESYMETRYCZNE"
RODZAJ_ROZPLYW = "ROZPLYW_MOCY"

#: Rodzaj wykonawczy biegu → rodzaj pakietu. Lista ZAMKNIĘTA: rodzaj spoza mapy
#: NIE MA pakietu dowodowego i brama mówi to wprost (zamiast budować pakiet
#: „podobnego" rodzaju). Pin: tests/api/test_pakiet_dowodowy_biegu.py.
_RODZAJ_PAKIETU_PO_BIEGU: dict[str, str] = {
    "SC_3F": RODZAJ_SC3F,
    "SC_1F": RODZAJ_SC_NIESYMETRYCZNE,
    "SC_2F": RODZAJ_SC_NIESYMETRYCZNE,
    "SC_2F_G": RODZAJ_SC_NIESYMETRYCZNE,
    "LOAD_FLOW": RODZAJ_ROZPLYW,
}

#: Nazwa rodzaju pakietu w języku ekranu (strefa pierwszoplanowa mówi po polsku).
_RODZAJ_PL: dict[str, str] = {
    RODZAJ_SC3F: "Zwarcie trójfazowe (IEC 60909)",
    RODZAJ_SC_NIESYMETRYCZNE: "Zwarcia niesymetryczne (1F-Z, 2F, 2F-Z)",
    RODZAJ_ROZPLYW: "Rozpływ mocy (zbieżność, bilans mocy, zakres napięć)",
}

#: Rodzaje pakietu dokumentujące POJEDYNCZY PUNKT sieci. JEDNO ŹRÓDŁO PRAWDY
#: (reguła predykatów parami): czyta je i lista punktów w odpowiedzi o dostępności,
#: i wybór punktu przy budowie, i odmowa dla punktu podanego tam, gdzie punkt nie
#: ma sensu. Pakiet rozpływu opisuje CAŁĄ sieć naraz — dlatego go tu nie ma, a
#: nie dlatego, że „na razie" nie zebrano punktów.
_RODZAJE_Z_PUNKTEM: frozenset[str] = frozenset({RODZAJ_SC3F, RODZAJ_SC_NIESYMETRYCZNE})

#: Powody braku pakietu — po polsku, każdy z realnym następnym krokiem.
_POWOD_RODZAJ_BEZ_PAKIETU = (
    "Ten rodzaj obliczenia nie ma jeszcze dedykowanego pakietu dowodowego. "
    "Pakiet składany jest dla rozpływu mocy oraz dla zwarć: trójfazowego i "
    "niesymetrycznych (1F-Z, 2F, 2F-Z). "
    "Ślad obliczeń i źródło LaTeX tego przebiegu pozostają dostępne."
)
_POWOD_BIEG_NIEZAKONCZONY = (
    "Przebieg nie zakończył się wynikiem — pakiet dowodowy powstaje wyłącznie "
    "z zakończonego obliczenia. Uruchom obliczenie ponownie."
)
_POWOD_BRAK_PUNKTOW = (
    "Przebieg nie zawiera punktów zwarcia nadających się do udokumentowania. "
    "Sprawdź model i uruchom obliczenie ponownie."
)


class PakietBieguError(ValueError):
    """Pakietu nie da się zbudować dla tego biegu/punktu (powód po polsku)."""


@dataclass(frozen=True)
class PunktPakietu:
    """Punkt zwarcia, dla którego brama potrafi złożyć pakiet dowodowy."""

    target_id: str
    nazwa: str

    def to_dict(self) -> dict[str, Any]:
        return {"target_id": self.target_id, "nazwa": self.nazwa}


def rodzaj_pakietu_biegu(run: CanonicalRun) -> str | None:
    """Rodzaj pakietu dowodowego tego biegu albo ``None``, gdy rodzaj go nie ma.

    JEDYNY predykat rodzaju — czytają go i dostępność, i budowa. Rodzaj biegu
    bierze się z jego danych (``to_execution_dict``), nigdy z nazwy ekranu, który
    o pakiet prosi.
    """
    try:
        rodzaj_biegu = run.to_execution_dict()["analysis_type"]
    except (KeyError, ValueError):
        # Rodzaj analizy nieznany torowi wykonawczemu = na pewno bez pakietu.
        return None
    return _RODZAJ_PAKIETU_PO_BIEGU.get(str(rodzaj_biegu))


def punkty_pakietu(run: CanonicalRun) -> list[PunktPakietu]:
    """Punkty zwarcia biegu (deterministycznie posortowane po identyfikatorze).

    Źródło: artefakt wyniku biegu (te same wiersze, które widzi ekran zwarć) —
    a nie ponowne przeliczanie modelu. Punkt, którego bieg nie policzył, nie jest
    ofertą pakietu.

    Rodzaj pakietu opisujący całą sieć (rozpływ mocy) nie ma punktów i zwraca
    pustą listę — z ``_RODZAJE_Z_PUNKTEM``, czyli z tego samego źródła, z którego
    korzysta budowa. Pusta lista nie oznacza tu „brak danych"; to cecha rodzaju.
    """
    if rodzaj_pakietu_biegu(run) not in _RODZAJE_Z_PUNKTEM:
        return []
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    punkty: list[PunktPakietu] = []
    for item in (run.raw_result or {}).get("results", []):
        target_id = item.get("fault_node_id")
        if not target_id:
            continue
        node = graph_nodes.get(target_id, {})
        nazwa = node.get("name") or node.get("element_id") or str(target_id)
        punkty.append(PunktPakietu(target_id=str(target_id), nazwa=str(nazwa)))
    punkty.sort(key=lambda p: p.target_id)
    return punkty


def _powod_braku_punktow(run: CanonicalRun) -> str | None:
    """Kontrola danych rodzajów punktowych: bieg musi mieć co udokumentować."""
    return None if punkty_pakietu(run) else _POWOD_BRAK_PUNKTOW


def _powod_braku_rozplywu(run: CanonicalRun) -> str | None:
    """Kontrola danych rodzaju rozpływowego: bieg musi nieść komplet wyniku.

    Sprawdzenie polega na PRÓBIE odtworzenia wyniku dokładnie tą funkcją, której
    użyje budowa pakietu — nie na osobnej liście warunków, która „dziś się zgadza"
    (reguła predykatów parami). Dzięki temu „dostępny" nie może rozjechać się z
    „da się pobrać" na żadnych danych brzegowych.
    """
    try:
        _rozplyw_biegu(run)
    except BrakDanychRozplywuError as exc:
        return str(exc)
    return None


#: Rodzaj pakietu → kontrola danych, których TEN rodzaj wymaga od biegu. Mapa jest
#: ZAMKNIĘTA i pokrywa wszystkie rodzaje z ``_RODZAJ_PAKIETU_PO_BIEGU``: rodzaj
#: bez kontroli byłby rodzajem, dla którego brama obiecuje pakiet bez sprawdzenia
#: podstawy. Pin równości zbiorów: tests/api/test_pakiet_dowodowy_biegu.py.
_KONTROLA_DANYCH_RODZAJU: dict[str, Callable[[CanonicalRun], str | None]] = {
    RODZAJ_SC3F: _powod_braku_punktow,
    RODZAJ_SC_NIESYMETRYCZNE: _powod_braku_punktow,
    RODZAJ_ROZPLYW: _powod_braku_rozplywu,
}


def dostepnosc_pakietu(run: CanonicalRun) -> dict[str, Any]:
    """Opis dostępności pakietu dowodowego przebiegu (kontrakt ekranu dowodu).

    Uczciwie rozdziela różne „nie ma": rodzaj bez pakietu, bieg bez wyniku oraz
    brak danych właściwy rodzajowi (brak punktów zwarcia / niekompletny albo
    niepełny rozpływ) — każdy z własnym powodem po polsku.
    """
    rodzaj = rodzaj_pakietu_biegu(run)
    if rodzaj is None:
        return _niedostepny(run, _POWOD_RODZAJ_BEZ_PAKIETU)
    if run.status != "FINISHED":
        return _niedostepny(run, _POWOD_BIEG_NIEZAKONCZONY, rodzaj=rodzaj)
    powod = _KONTROLA_DANYCH_RODZAJU[rodzaj](run)
    if powod is not None:
        return _niedostepny(run, powod, rodzaj=rodzaj)
    punkty = punkty_pakietu(run)
    return {
        "run_id": str(run.id),
        "dostepny": True,
        "rodzaj": rodzaj,
        "rodzaj_pl": _RODZAJ_PL[rodzaj],
        "powod_pl": None,
        "punkty": [p.to_dict() for p in punkty],
        "zawartosc_pl": list(_ZAWARTOSC_PL),
    }


#: Co użytkownik dostaje w pobranym pliku — opis ZAWARTOŚCI, nie obietnica.
#: Zgodny z ``ProofPackBuilder.build`` (proof.json/proof.tex/manifest/signature;
#: proof.pdf wyłącznie gdy toolchain LaTeX jest dostępny na serwerze).
_ZAWARTOSC_PL: tuple[str, ...] = (
    "Dowód w postaci danych (proof.json) — kroki: wzór, podstawienie, wynik, jednostka",
    "Źródło dokumentu (proof.tex) do wklejenia w opracowanie",
    "Wykaz plików z sumami kontrolnymi i wersją narzędzia (manifest.json)",
    "Odcisk integralności pakietu (signature.json)",
    "Dokument PDF (proof.pdf) — gdy serwer ma złożenie LaTeX",
)


def _niedostepny(run: CanonicalRun, powod_pl: str, *, rodzaj: str | None = None) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "dostepny": False,
        "rodzaj": rodzaj,
        "rodzaj_pl": _RODZAJ_PL.get(rodzaj) if rodzaj else None,
        "powod_pl": powod_pl,
        "punkty": [],
        "zawartosc_pl": [],
    }


def zbuduj_pakiet_biegu(run: CanonicalRun, *, punkt: str | None = None) -> tuple[str, bytes]:
    """Zbuduj pakiet dowodowy przebiegu: ``(nazwa_pliku, zawartość ZIP)``.

    ``punkt`` = identyfikator punktu zwarcia; ``None`` = pierwszy punkt biegu
    (deterministycznie: najmniejszy identyfikator). Punkt spoza biegu i rodzaj bez
    pakietu kończą się ``PakietBieguError`` z powodem po polsku — API tłumaczy go
    na odpowiedź HTTP, a ekran pokazuje wprost.
    """
    dostepnosc = dostepnosc_pakietu(run)
    if not dostepnosc["dostepny"]:
        raise PakietBieguError(str(dostepnosc["powod_pl"]))

    context = ProofPackContext(
        project_id=str(run.project_id or ""),
        case_id=str(run.case_id),
        run_id=str(run.id),
        snapshot_id=str(run.snapshot_hash),
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    rodzaj = str(dostepnosc["rodzaj"])

    if rodzaj not in _RODZAJE_Z_PUNKTEM:
        # Pakiet opisujący całą sieć. Punkt podany dla takiego rodzaju NIE jest
        # po cichu pomijany — ciche zignorowanie parametru byłoby kłamstwem o
        # tym, co dokumentuje pobrany plik.
        if punkt is not None:
            raise PakietBieguError(
                f"Pakiet dowodowy tego rodzaju ({_RODZAJ_PL[rodzaj]}) dokumentuje całą sieć, "
                "więc nie przyjmuje pojedynczego punktu."
            )
        zawartosc = _zbuduj_rozplyw(run, context)
        return f"pakiet_dowodowy_rozplyw_mocy__{run.id}.zip", zawartosc

    punkty = punkty_pakietu(run)
    if punkt is None:
        wybrany = punkty[0]
    else:
        znaleziony = next((p for p in punkty if p.target_id == punkt), None)
        if znaleziony is None:
            raise PakietBieguError(
                f"Punkt zwarcia {punkt} nie występuje w tym przebiegu — "
                "wybierz punkt z listy wyników."
            )
        wybrany = znaleziony

    if rodzaj == RODZAJ_SC3F:
        zawartosc = _zbuduj_sc3f(run, wybrany, context)
        nazwa = f"pakiet_dowodowy_zwarcie_3f__{run.id}__{wybrany.target_id}.zip"
    else:
        zawartosc = _zbuduj_sc_niesymetryczne(run, wybrany, context)
        nazwa = f"pakiet_dowodowy_zwarcia_niesymetryczne__{run.id}__{wybrany.target_id}.zip"
    return nazwa, zawartosc


def _znacznik_czasu(run: CanonicalRun) -> datetime:
    """Znacznik czasu dowodu = moment zakończenia biegu (albo jego utworzenia).

    Deterministyczny: ten sam bieg → ten sam znacznik (nigdy „teraz").
    """
    znacznik = run.finished_at or run.created_at
    if znacznik.tzinfo is None:
        return znacznik.replace(tzinfo=UTC)
    return znacznik


def _wersja_solvera(run: CanonicalRun) -> str:
    """Wersja solvera z artefaktu biegu; brak pola → uczciwa etykieta zamiast zmyślenia."""
    wersja = (run.raw_result or {}).get("solver_version")
    return str(wersja) if wersja else "nieznana"


def _c_factor(run: CanonicalRun) -> float:
    return float(run.options.get("c_factor", 1.10))


def _tk_s(run: CanonicalRun) -> float:
    return float(run.options.get("thermal_time_seconds", 1.0))


def _nazwa_przypadku(run: CanonicalRun) -> str:
    return str(run.case_id)


def _nazwa_projektu(run: CanonicalRun) -> str:
    naglowek = (run.snapshot or {}).get("header") or {}
    nazwa = naglowek.get("name")
    return str(nazwa) if nazwa else str(run.project_id or "")


def _rozplyw_biegu(run: CanonicalRun) -> RozplywZBiegu:
    """Zamrożony wynik rozpływu ODTWORZONY z zapisu biegu (bez ponownej fizyki).

    Jedyne wejście pakietu rozpływu — czyta je i kontrola dostępności, i budowa.
    Podnosi ``BrakDanychRozplywuError`` z powodem po polsku, gdy bieg nie niesie
    kompletu (wtedy brama melduje brak zamiast składać dowód z domysłów).
    """
    return rozplyw_z_biegu(
        raw_result=run.raw_result,
        white_box_trace=run.white_box_trace,
    )


def _zbuduj_rozplyw(run: CanonicalRun, context: ProofPackContext) -> bytes:
    rozplyw = _rozplyw_biegu(run)
    pack_input = P14PowerFlowInput.from_power_flow_result(
        rozplyw.wynik,
        project_name=_nazwa_projektu(run),
        case_name=_nazwa_przypadku(run),
        run_timestamp=_znacznik_czasu(run),
        # Wersja solvera z ARTEFAKTU biegu (`load-flow-<metoda>-v1`), nie z
        # `_wersja_solvera` — tam etykieta zapasowa „nieznana" jest uczciwa dla
        # zwarć, a tu warstwa wiązania już odmówiła, gdyby wersji zabrakło.
        solver_version=rozplyw.solver_version,
        max_mismatch_pu=rozplyw.max_mismatch_pu,
    )
    try:
        return P14PowerFlowProof.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietBieguError(f"Nie udało się złożyć pakietu dowodowego: {exc}") from exc


def _zbuduj_sc3f(
    run: CanonicalRun,
    punkt: PunktPakietu,
    context: ProofPackContext,
) -> bytes:
    pack_input = SC3FPackInput(
        project_name=_nazwa_projektu(run),
        case_name=_nazwa_przypadku(run),
        snapshot=run.snapshot,
        fault_node_id=punkt.target_id,
        run_timestamp=_znacznik_czasu(run),
        solver_version=_wersja_solvera(run),
        c_factor=_c_factor(run),
        tk_s=_tk_s(run),
    )
    try:
        return SC3FProofPack.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietBieguError(f"Nie udało się złożyć pakietu dowodowego: {exc}") from exc


def _zbuduj_sc_niesymetryczne(
    run: CanonicalRun,
    punkt: PunktPakietu,
    context: ProofPackContext,
) -> bytes:
    try:
        pack_input = SCAsymmetricalProofPack.wejscie_ze_snapshotu(
            snapshot=run.snapshot,
            fault_node_id=punkt.target_id,
            project_name=_nazwa_projektu(run),
            case_name=_nazwa_przypadku(run),
            run_timestamp=_znacznik_czasu(run),
            solver_version=_wersja_solvera(run),
            c_factor=_c_factor(run),
            tk_s=_tk_s(run),
        )
    except (KeyError, ValueError) as exc:
        raise PakietBieguError(f"Nie udało się złożyć pakietu dowodowego: {exc}") from exc
    return _spakuj_niesymetryczne(pack_input, context)


def _spakuj_niesymetryczne(pack_input: SCAsymmetricalPackInput, context: ProofPackContext) -> bytes:
    packs = SCAsymmetricalProofPack.generate_zip(pack_input, context)
    return SCAsymmetricalProofPack.zbuduj_zip_zbiorczy(packs)
