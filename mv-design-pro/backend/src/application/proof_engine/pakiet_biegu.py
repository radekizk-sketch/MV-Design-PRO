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

PAKIET PRZEBIEGU JEST PEŁNĄ DOKUMENTACJĄ PRZEBIEGU, NIE JEDNYM DOWODEM (karta
PACK-BEZ-KONSUMENTA). Bieg rozpływu wydaje pakiet ZBIORCZY: bilans i zbieżność
(``p14_power_flow``), straty mocy (``p16_losses``) oraz spadek napięcia na
wskazanym odcinku (``vdrop``). Wszystkie trzy czytają TEN SAM zamrożony wynik, więc
nie mogą się ze sobą rozjechać; rozbicie ich na osobne „rodzaje pakietu" zmuszałoby
projektanta do wyboru pozornego między pozycjami wyprowadzonymi z identycznych
danych. Do 2026-08-08 dwa z tych trzech generatorów nie miały ANI JEDNEGO
konsumenta.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from application.proof_engine.packs.p14_power_flow import P14PowerFlowInput, P14PowerFlowProof
from application.proof_engine.packs.p16_losses import P16LossesInput, P16LossesProof
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.packs.sc_symmetrical import SC3FPackInput, SC3FProofPack
from application.proof_engine.packs.vdrop import VDROPPackInput, zbuduj_zip_vdrop
from application.proof_engine.proof_pack import (
    ProofPackContext,
    resolve_mv_design_pro_version,
    zbuduj_zip_zbiorczy,
)
from application.solvers.power_flow_binding import (
    BrakDanychRozplywuError,
    RozplywZBiegu,
    rozplyw_z_biegu,
)
from application.solvers.voltage_drop_binding import (
    BrakDanychSpadkuError,
    OdcinekSpadku,
    odcinki_spadku_napiecia,
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

#: Rodzaje pakietu, których CAŁA treść dotyczy jednego punktu sieci — bez punktu
#: nie ma czego udokumentować, więc bieg bez punktów nie ma takiego pakietu.
#: JEDNO ŹRÓDŁO PRAWDY (reguła predykatów parami): czyta je i lista punktów w
#: odpowiedzi o dostępności, i wybór punktu przy budowie, i odmowa dla punktu
#: podanego tam, gdzie punkt nie ma sensu.
_RODZAJE_Z_PUNKTEM: frozenset[str] = frozenset({RODZAJ_SC3F, RODZAJ_SC_NIESYMETRYCZNE})

#: Rodzaje pakietu opisujące CAŁĄ sieć, do których punkt DOKŁADA jeden dokument.
#: Pakiet rozpływu dokumentuje bilans i straty całej sieci ZAWSZE, a spadek
#: napięcia — na wskazanym odcinku, o ile bieg jakiś odcinek policzył. Dlatego
#: punkt jest tu NIEOBOWIĄZKOWY: brak odcinków (sama rozdzielnia z transformatorem)
#: NIE MOŻE odebrać projektantowi bilansu mocy.
#:
#: Rozłączność z ``_RODZAJE_Z_PUNKTEM`` jest wymagana (rodzaj byłby jednocześnie
#: „bez punktu nie ma pakietu" i „punkt opcjonalny") i przypięta testem.
_RODZAJE_Z_ODCINKIEM: frozenset[str] = frozenset({RODZAJ_ROZPLYW})

#: Jak nazywa się to, co użytkownik wybiera — po polsku, dla ekranu. Klucze
#: pokrywają DOKŁADNIE sumę obu zbiorów powyżej (pin równości w testach): rodzaj
#: z wyborem, ale bez nazwy wyboru, dałby w interfejsie listę bez etykiety.
_ETYKIETA_PUNKTU_PL: dict[str, str] = {
    RODZAJ_SC3F: "Punkt zwarcia",
    RODZAJ_SC_NIESYMETRYCZNE: "Punkt zwarcia",
    RODZAJ_ROZPLYW: "Odcinek dla spadku napięcia",
}


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
    """Punkty wyboru biegu (deterministycznie posortowane po identyfikatorze).

    Źródło: artefakt wyniku biegu (te same wiersze, które widzi ekran wyników) —
    a nie ponowne przeliczanie modelu. Punkt, którego bieg nie policzył, nie jest
    ofertą pakietu.

    Czym jest punkt, rozstrzyga RODZAJ pakietu — z tych samych zbiorów, z których
    korzysta budowa (reguła predykatów parami): dla pakietów zwarciowych to punkt
    zwarcia, dla pakietu rozpływu ODCINEK linii/kabla. Rodzaj bez wyboru zwraca
    pustą listę; pusta lista nie oznacza wtedy „brak danych", tylko cechę rodzaju.
    """
    rodzaj = rodzaj_pakietu_biegu(run)
    if rodzaj in _RODZAJE_Z_ODCINKIEM:
        return _odcinki_jako_punkty(run)
    if rodzaj not in _RODZAJE_Z_PUNKTEM:
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


def _odcinki_biegu(run: CanonicalRun) -> list[OdcinekSpadku]:
    """Odcinki spadku napięcia przebiegu — JEDNO wejście dla listy i dla budowy.

    Bieg, którego artefakt nie nadaje się do odczytu odcinków, daje pustą listę
    zamiast wyjątku: brak dowodu spadku nie może odebrać projektantowi bilansu
    mocy, a powód braku CAŁEGO pakietu rozpływu ustala osobna kontrola danych
    (``_powod_braku_rozplywu``).
    """
    try:
        return odcinki_spadku_napiecia(raw_result=run.raw_result, snapshot=run.snapshot)
    except BrakDanychSpadkuError:
        return []


def _odcinki_jako_punkty(run: CanonicalRun) -> list[PunktPakietu]:
    return [
        PunktPakietu(target_id=odcinek.id_galezi, nazwa=odcinek.nazwa)
        for odcinek in _odcinki_biegu(run)
    ]


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
        "punkty_etykieta_pl": _ETYKIETA_PUNKTU_PL.get(rodzaj),
        "zawartosc_pl": _zawartosc_pl(rodzaj, punkty),
    }


#: Pliki, które są W KAŻDYM pakiecie dowodowym — opis ZAWARTOŚCI, nie obietnica.
#: Zgodny z ``ProofPackBuilder.build`` (proof.json/proof.tex/manifest/signature;
#: proof.pdf wyłącznie gdy toolchain LaTeX jest dostępny na serwerze).
_ZAWARTOSC_PL: tuple[str, ...] = (
    "Dowód w postaci danych (proof.json) — kroki: wzór, podstawienie, wynik, jednostka",
    "Źródło dokumentu (proof.tex) do wklejenia w opracowanie",
    "Wykaz plików z sumami kontrolnymi i wersją narzędzia (manifest.json)",
    "Odcisk integralności pakietu (signature.json)",
    "Dokument PDF (proof.pdf) — gdy serwer ma złożenie LaTeX",
)

#: Dowody, które niesie pakiet ZBIORCZY rozpływu. Wiersz spadku napięcia dokładany
#: jest WYŁĄCZNIE wtedy, gdy bieg ma odcinek do udokumentowania — obietnica dowodu,
#: którego w pliku nie będzie, jest gorsza od braku wiersza.
_ZAWARTOSC_ROZPLYWU_PL: tuple[str, ...] = (
    "Dowód rozpływu mocy: zbieżność, bilans P i Q, zakres napięć (rozplyw.zip)",
    "Dowód strat mocy: straty gałęziowe, sumy sieci, udział strat (straty.zip)",
)
_ZAWARTOSC_SPADKU_PL = (
    "Dowód spadku napięcia na wskazanym odcinku linii/kabla (spadek_napiecia.zip)"
)
_ZAWARTOSC_BEZ_ODCINKA_PL = (
    "Bez dowodu spadku napięcia — ten przebieg nie zawiera odcinka linii ani kabla "
    "o znanej impedancji i długości."
)


def _zawartosc_pl(rodzaj: str, punkty: list[PunktPakietu]) -> list[str]:
    """Co PROJEKTANT znajdzie w pobranym pliku — opis prawdziwy dla TEGO biegu.

    Dla pakietu zbiorczego rozpływu lista zależy od danych: wiersz spadku napięcia
    pojawia się wtedy i tylko wtedy, gdy bieg ma odcinek (czyli gdy ``punkty`` są
    niepuste — z tego samego źródła, z którego korzysta budowa).
    """
    if rodzaj not in _RODZAJE_Z_ODCINKIEM:
        return list(_ZAWARTOSC_PL)
    dowody = list(_ZAWARTOSC_ROZPLYWU_PL)
    dowody.append(_ZAWARTOSC_SPADKU_PL if punkty else _ZAWARTOSC_BEZ_ODCINKA_PL)
    return dowody + [f"W każdym dowodzie: {pozycja}" for pozycja in _ZAWARTOSC_PL]


def _niedostepny(run: CanonicalRun, powod_pl: str, *, rodzaj: str | None = None) -> dict[str, Any]:
    return {
        "run_id": str(run.id),
        "dostepny": False,
        "rodzaj": rodzaj,
        "rodzaj_pl": _RODZAJ_PL.get(rodzaj) if rodzaj else None,
        "powod_pl": powod_pl,
        "punkty": [],
        "punkty_etykieta_pl": None,
        "zawartosc_pl": [],
    }


def zbuduj_pakiet_biegu(run: CanonicalRun, *, punkt: str | None = None) -> tuple[str, bytes]:
    """Zbuduj pakiet dowodowy przebiegu: ``(nazwa_pliku, zawartość ZIP)``.

    ``punkt`` = identyfikator wyboru właściwego rodzajowi: punkt zwarcia dla
    pakietów zwarciowych, ODCINEK linii/kabla dla pakietu rozpływu. ``None`` =
    pierwszy z listy biegu (deterministycznie: najmniejszy identyfikator). Punkt
    spoza biegu, punkt podany dla rodzaju, który go nie ma, i rodzaj bez pakietu
    kończą się ``PakietBieguError`` z powodem po polsku — API tłumaczy go na
    odpowiedź HTTP, a ekran pokazuje wprost.
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

    # KAŻDY rodzaj pakietu deklaruje, czym jest jego punkt (równość zbiorów
    # przypięta testem), więc nie ma tu gałęzi „rodzaj, który punktu nie zna".
    # Gdyby kiedyś powstał rodzaj opisujący wyłącznie całą sieć, pin równości
    # zapali się i wymusi ŚWIADOMĄ decyzję: albo punkt, albo jawna odmowa dla
    # podanego parametru. Ciche pominięcie parametru byłoby kłamstwem o tym, co
    # dokumentuje pobrany plik, i dlatego nie może powstać przez przeoczenie.
    if rodzaj in _RODZAJE_Z_ODCINKIEM:
        zawartosc = _zbuduj_rozplyw_zbiorczy(run, context, punkt=punkt)
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


def _zbuduj_rozplyw_zbiorczy(
    run: CanonicalRun,
    context: ProofPackContext,
    *,
    punkt: str | None,
) -> bytes:
    """Pakiet ZBIORCZY przebiegu rozpływu: rozpływ + straty (+ spadek napięcia).

    Trzy dowody czytają TEN SAM zamrożony wynik, więc nie mogą się ze sobą
    rozjechać. Dowód spadku dokłada się wyłącznie wtedy, gdy bieg ma odcinek —
    brak odcinków nie odbiera projektantowi bilansu mocy (dlatego rodzaj rozpływu
    ma punkt NIEOBOWIĄZKOWY, a nie obowiązkowy jak rodzaje zwarciowe).
    """
    rozplyw = _rozplyw_biegu(run)
    pakiety = {
        "rozplyw": _zbuduj_dowod_rozplywu(run, context, rozplyw),
        "straty": _zbuduj_dowod_strat(run, context, rozplyw),
    }
    odcinek = _wybierz_odcinek(run, punkt)
    if odcinek is not None:
        pakiety["spadek_napiecia"] = _zbuduj_dowod_spadku(run, context, odcinek)
    return zbuduj_zip_zbiorczy(pakiety)


def _wybierz_odcinek(run: CanonicalRun, punkt: str | None) -> OdcinekSpadku | None:
    """Odcinek wskazany przez użytkownika albo pierwszy z listy biegu.

    Zwraca ``None`` wyłącznie wtedy, gdy bieg NIE MA odcinków — i tylko wtedy
    pakiet powstaje bez dowodu spadku. Odcinek WSKAZANY, którego bieg nie zna,
    jest odmową, nie cichym podstawieniem pierwszego z brzegu: projektant, który
    prosił o odcinek A, nie może dostać dokumentu o odcinku B.
    """
    odcinki = _odcinki_biegu(run)
    if punkt is None:
        return odcinki[0] if odcinki else None
    znaleziony = next((o for o in odcinki if o.id_galezi == punkt), None)
    if znaleziony is None:
        raise PakietBieguError(
            f"Odcinek {punkt} nie występuje w tym przebiegu jako linia ani kabel o znanej "
            "impedancji i długości — wybierz odcinek z listy."
        )
    return znaleziony


def _zbuduj_dowod_rozplywu(
    run: CanonicalRun,
    context: ProofPackContext,
    rozplyw: RozplywZBiegu,
) -> bytes:
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


def _zbuduj_dowod_strat(
    run: CanonicalRun,
    context: ProofPackContext,
    rozplyw: RozplywZBiegu,
) -> bytes:
    pack_input = P16LossesInput.from_power_flow_result(
        rozplyw.wynik,
        project_name=_nazwa_projektu(run),
        case_name=_nazwa_przypadku(run),
        run_timestamp=_znacznik_czasu(run),
        solver_version=rozplyw.solver_version,
    )
    try:
        return P16LossesProof.generate_zip(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietBieguError(f"Nie udało się złożyć pakietu dowodowego strat: {exc}") from exc


def _zbuduj_dowod_spadku(
    run: CanonicalRun,
    context: ProofPackContext,
    odcinek: OdcinekSpadku,
) -> bytes:
    pack_input = VDROPPackInput.z_odcinka_biegu(
        odcinek,
        project_name=_nazwa_projektu(run),
        case_name=_nazwa_przypadku(run),
        run_timestamp=_znacznik_czasu(run),
        solver_version=_rozplyw_biegu(run).solver_version,
    )
    try:
        return zbuduj_zip_vdrop(pack_input, context)
    except (KeyError, ValueError) as exc:
        raise PakietBieguError(
            f"Nie udało się złożyć pakietu dowodowego spadku napięcia: {exc}"
        ) from exc


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
