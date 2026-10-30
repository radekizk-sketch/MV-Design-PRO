"""Ocena warunkow przylaczenia OSD wobec wyniku rozplywu (karta F-K2).

Znalezisko Z2 audytu FLOW (docs/uiux/AUDYT_I_PROJEKT_FLOW_2026-07.md): warunki
przylaczenia z dokumentu OSD — moc przylaczeniowa, wymagany cosfi, tryb pracy —
byly zapisywane do ``header.connection_conditions``, ale NIE BYLY KRYTERIUM
NICZEGO. Czytal je wylacznie kafel pulpitu; zero konsumpcji w backendzie, zero w
analizach, zero w ocenie zgodnosci. Projektant mogl wpisac limit 5 MW, zbudowac
siec oddajaca w punkcie przylaczenia 6,2 MW, policzyc rozplyw i NIE DOSTAC
zadnego sygnalu.

Ten modul jest brakujacym ogniwem lancucha E1 -> E5 -> E7:
  E1 (warunki OSD)  ->  kryteria projektu
  E5 (rozplyw)      ->  moc i cosfi RZECZYWISCIE wymieniane w punkcie przylaczenia
  E7 (weryfikacja)  ->  werdykt: czy warunki sa dotrzymane

WARSTWA APPLICATION — INTERPRETACJA, ZERO FIZYKI. Nie liczy rozplywu, nie dotyka
solvera, nie mutuje modelu. Bierze GOTOWE wielkosci z ``PowerFlowResultV1``
(kontrakt FROZEN, czytany read-only) i porownuje je z danymi WEJSCIOWYMI projektu.
cosfi = abs(P)/hypot(P, Q) jest projekcja arytmetyczna na wynikach solvera — ta
sama, ktora stosuje juz ``dobor_kompensacji._cosfi``.

PUNKT PRZYLACZENIA. Wielkosci odczytujemy w wezle bilansujacym
(``PowerFlowResultV1.slack_bus_id``), bo to on reprezentuje zasilanie z sieci OSD:
``canonical_analysis`` sadza slack na szynie zrodla sieciowego
(``enm/canonical_analysis.py:1373-1378,1434``), a moc slacka jest wynikiem
bilansu calej sieci (``canonical_analysis.py:1475-1476``). Punkt przylaczenia
mozna tez podac jawnie — wtedy uzywamy wskazanego wezla. Zgodnie z regula 5
kanonu punkt przylaczenia zyje WYLACZNIE w warstwie interpretacji; nie ma
go i nie moze byc w NetworkModel.

KONWENCJA ZNAKU. ``PowerFlowBusResult.p_injected_mw`` to moc WSTRZYKNIETA do
sieci w danym wezle (``power_flow_result.py:35``). Dla wezla bilansujacego
oznacza to moc dostarczana z sieci OSD, czyli:
  P > 0  — projekt POBIERA moc czynna z sieci,
  P < 0  — projekt ODDAJE moc czynna do sieci (typowo instalacja OZE).
Limit mocy przylaczeniowej dotyczy MODULU tej wielkosci — dokument OSD ogranicza
moc wymieniana w obu kierunkach.

ZERO FABRYKACJI (precedens V12K-189, V12K-192). Brak ktorejkolwiek danej daje
status NIESPRAWDZONE + kanoniczny kod gotowosci. Nie wolno tego mylic ze
spelnieniem kryterium — to trzeci stan, obowiazkowy w kontrakcie ekranu
prowadzacego.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any, Final

from application.analyses.opis_przebiegu import rodzaj_przebiegu_pl
from enm.canonical_analysis import CanonicalRun
from enm.dane_przyjete_galezi import pola_danych_przyjetych_biegu
from network_model.odmowa_danych import OdmowaDanychError
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    OdnosnikSladu,
    Przedmiot,
    WyjasnienieWerdyktu,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_osd,
    projekcja_statusu,
    wymaganie_z_ocen,
)

# Kanoniczne kody gotowosci (zsynchronizowane z domain.canonical_operations.READINESS_CODES).
READINESS_CONNECTION_LIMIT_MISSING = "connection.power_limit_missing"
READINESS_CONNECTION_COS_PHI_MISSING = "connection.cos_phi_required_missing"
READINESS_CONNECTION_FLOW_MISSING = "connection.power_flow_missing"

STATUS_PASS = "PASS"
STATUS_FAIL = "FAIL"
STATUS_UNAVAILABLE = "UNAVAILABLE"

KRYTERIUM_MOC = "moc_w_punkcie_przylaczenia"
KRYTERIUM_COS_PHI = "cos_phi_w_punkcie_przylaczenia"

KIERUNEK_POBOR = "pobor"
KIERUNEK_ODDAWANIE = "oddawanie"

ZDOLNOSC_WARUNKOW: Final = "przylaczenie.warunki_osd"
WYMAGANIE_WARUNKOW: Final = "przylaczenie.warunki_osd"

_PODSTAWA_WARUNKOW: Final = podstawa_osd(
    "Warunki przyłączenia wydane przez operatora systemu dystrybucyjnego",
    "moc przyłączeniowa i wymagany współczynnik mocy w miejscu przyłączenia",
    wydanie="wpis projektu (warunki przyłączenia w nagłówku modelu)",
)
_ZAKRES_WARUNKOW: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Stan ustalony jednego biegu rozpływu mocy: moc i cosφ w węźle bilansującym "
        "(zasilanie z sieci OSD) przy obciążeniach i generacji zapisanych w modelu."
    ),
    wykluczenia=(
        "inne stany pracy niż zapisany w modelu (obciążenie szczytowe, minimalne, awaryjne)",
        "wymagania jakości energii i rozruchu z warunków przyłączenia",
    ),
)
_PRZEDMIOT: Final = Przedmiot(
    element_ref=None,
    nazwa_pl="punkt przyłączenia do sieci OSD",
    opis_pl="Wymiana mocy projektu z siecią operatora w węźle bilansującym biegu rozpływu",
)
#: Opisy kodów gotowości jako braki rekordu (brak danych ≠ spełnia).
_OPIS_BRAKU: Final[dict[str, str]] = {
    READINESS_CONNECTION_LIMIT_MISSING: (
        "Moc przyłączeniowa z warunków przyłączenia OSD (wpis projektu)."
    ),
    READINESS_CONNECTION_COS_PHI_MISSING: (
        "Wymagany współczynnik mocy z warunków przyłączenia OSD (wpis projektu)."
    ),
    READINESS_CONNECTION_FLOW_MISSING: (
        "Zbieżny bieg rozpływu mocy z wynikiem w węźle bilansującym (punkt przyłączenia)."
    ),
}


@dataclass(frozen=True)
class PozycjaOceny:
    """Jedna pozycja oceny: kryterium, wartosc z rozplywu, wartosc wymagana.

    ``ocena`` — rekord werdyktu wyjasnialnego (poziom K), ``wyjasnienie`` jego wyjasnienie.
    ``status`` jest PROJEKCJA statusu rekordu (``PASS``/``FAIL``; ``UNAVAILABLE`` znaczy BRAK
    PODSTAWY do oceny — patrz ``readiness_codes`` — nie spelnienie kryterium).
    """

    kryterium: str
    status: str
    ocena: OcenaKryterium
    wyjasnienie: WyjasnienieWerdyktu
    wartosc: float | None
    wymagana: float | None
    jednostka: str
    opis_pl: str
    readiness_codes: tuple[str, ...] = ()

    @property
    def is_conclusive(self) -> bool:
        return self.status in (STATUS_PASS, STATUS_FAIL)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kryterium": self.kryterium,
            "status": self.status,
            "ocena": self.ocena.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "wartosc": self.wartosc,
            "wymagana": self.wymagana,
            "jednostka": self.jednostka,
            "opis_pl": self.opis_pl,
            "readiness_codes": list(self.readiness_codes),
        }


@dataclass(frozen=True)
class OcenaWarunkowPrzylaczenia:
    """Ocena warunkow przylaczenia (WHITE BOX: wielkosci z rozplywu + zalozenia).

    ``ocena_wymagania`` — rekord W nad kryteriami pozycji, ``wyjasnienie`` jego wyjasnienie;
    ``status_ogolny`` jest jego projekcja (jedno zrodlo rozstrzygniecia).
    """

    ocena_wymagania: WynikWymagania
    wyjasnienie: WyjasnienieWerdyktu
    punkt_przylaczenia: str | None
    p_mw: float | None
    q_mvar: float | None
    s_mva: float | None
    cos_phi: float | None
    kierunek: str | None
    pozycje: tuple[PozycjaOceny, ...]
    # Matematyka wyłącznie LaTeX w delimiterach $...$ (konwencja Proof Engine).
    formula_ref: str = (
        r"$\cos\varphi = \dfrac{|P|}{\sqrt{P^{2} + Q^{2}}}$;  "
        r"kryterium mocy: $|P| \le P_{\text{limit}}$"
    )
    zalozenia: tuple[str, ...] = field(
        default_factory=lambda: (
            "Wielkości z węzła bilansującego biegu rozpływu (punkt przyłączenia do sieci OSD).",
            "P > 0 oznacza pobór z sieci, P < 0 — oddawanie do sieci.",
            "Limit mocy przyłączeniowej dotyczy modułu mocy czynnej (oba kierunki).",
            "cosφ liczone z mocy czynnej i biernej w punkcie, bez korekty kierunku.",
            "Brak danej daje kryterium niesprawdzone z nazwanym brakiem, nigdy wartość "
            "zastępczą.",
        )
    )

    @property
    def status_ogolny(self) -> str:
        """Projekcja rekordu W: FAIL gdy ktorekolwiek kryterium naruszone; PASS tylko gdy
        KAZDE kryterium spelnione na liczbach; inaczej UNAVAILABLE (brak danych ≠ spelnia —
        dawniej jedno kryterium spelnione przy drugim nieocenionym dawalo PASS)."""
        return _kod(self.ocena_wymagania.oceny_skladowe)

    @property
    def readiness_codes(self) -> tuple[str, ...]:
        kody: list[str] = []
        for pozycja in self.pozycje:
            kody.extend(pozycja.readiness_codes)
        return tuple(dict.fromkeys(kody))

    def to_dict(self) -> dict[str, Any]:
        return {
            "punkt_przylaczenia": self.punkt_przylaczenia,
            "p_mw": self.p_mw,
            "q_mvar": self.q_mvar,
            "s_mva": self.s_mva,
            "cos_phi": self.cos_phi,
            "kierunek": self.kierunek,
            "status_ogolny": self.status_ogolny,
            "ocena_wymagania": self.ocena_wymagania.model_dump(mode="json"),
            "wyjasnienie": self.wyjasnienie.model_dump(mode="json"),
            "pozycje": [p.to_dict() for p in self.pozycje],
            "readiness_codes": list(self.readiness_codes),
            "formula_ref": self.formula_ref,
            "zalozenia": list(self.zalozenia),
        }


def _round6(value: float | None) -> float | None:
    return None if value is None else round(value, 6)


def _dodatnia(value: Any) -> float | None:
    """Liczba dodatnia albo None — wartosc niedodatnia nie jest kryterium."""
    try:
        liczba = float(value)
    except (TypeError, ValueError):
        return None
    return liczba if liczba > 0.0 else None


def _wielkosci_punktu(
    result_v1: dict[str, Any], punkt: str | None
) -> tuple[str | None, float | None, float | None]:
    """Zwroc (id punktu, P [MW], Q [Mvar]) z ``bus_results``; brak danych -> None."""
    if not result_v1:
        return punkt, None, None
    if not result_v1.get("converged", False):
        # Bieg niezbiezny nie daje podstawy do oceny — nie wolno czytac liczb z
        # nieukonczonej iteracji jako stanu sieci.
        return punkt or (result_v1.get("slack_bus_id") or None), None, None
    szukany = punkt or (result_v1.get("slack_bus_id") or None)
    if not szukany:
        return None, None, None
    for bus in result_v1.get("bus_results") or []:
        if str(bus.get("bus_id")) != str(szukany):
            continue
        if str(bus.get("status") or "solved") != "solved":
            return szukany, None, None
        p = bus.get("p_injected_mw")
        q = bus.get("q_injected_mvar")
        return (
            szukany,
            None if p is None else float(p),
            None if q is None else float(q),
        )
    return szukany, None, None


def _kod(oceny: tuple[OcenaKryterium, ...]) -> str:
    return projekcja_statusu(
        oceny, spelnia=STATUS_PASS, nie_spelnia=STATUS_FAIL, nierozstrzygniete=STATUS_UNAVAILABLE
    )


def _pozycja(
    porownanie: Porownanie, *, kody: list[str], opis_pl: str, jednostka: str
) -> PozycjaOceny:
    """Pozycja z rekordem K porownania; kod ``status`` jest projekcja rekordu."""
    ocena = ocena_porownania(
        porownanie,
        przedmiot=_PRZEDMIOT,
        podstawa=_PODSTAWA_WARUNKOW,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WARUNKOW),
        zakres=_ZAKRES_WARUNKOW,
        slad=(
            ()
            if porownanie.wynik is None
            else (
                OdnosnikSladu(
                    krok="power_flow_slack_bus",
                    opis_pl="Moce wstrzyknięte w węźle bilansującym biegu rozpływu",
                ),
            )
        ),
        odniesienie="application/analyses/warunki_przylaczenia.py",
    )
    return PozycjaOceny(
        kryterium=porownanie.kryterium_id,
        status=_kod((ocena,)),
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
        wartosc=porownanie.wynik,
        wymagana=porownanie.limit,
        jednostka=jednostka,
        opis_pl=opis_pl,
        readiness_codes=tuple(dict.fromkeys(kody)),
    )


def ocen_warunki_przylaczenia(
    *,
    connection_conditions: dict[str, Any] | None,
    result_v1: dict[str, Any] | None,
    punkt_przylaczenia: str | None = None,
) -> OcenaWarunkowPrzylaczenia:
    """Porownaj wynik rozplywu w punkcie przylaczenia z warunkami OSD.

    ``connection_conditions`` — blok ``header.connection_conditions`` ze snapshotu
    (dane WEJSCIOWE projektu z dokumentu OSD).
    ``result_v1`` — ``PowerFlowResultV1.to_dict()`` (read-only).
    ``punkt_przylaczenia`` — jawny wezel; brak = wezel bilansujacy biegu.
    """
    warunki = connection_conditions or {}
    wynik = result_v1 or {}

    punkt, p_mw, q_mvar = _wielkosci_punktu(wynik, punkt_przylaczenia)

    limit_mw = _dodatnia(warunki.get("moc_przylaczeniowa_mw"))
    cos_phi_wymagany = _dodatnia(warunki.get("wymagany_cos_phi"))

    if p_mw is None or q_mvar is None:
        s_mva: float | None = None
        cos_phi: float | None = None
        kierunek: str | None = None
    else:
        s_mva = math.hypot(p_mw, q_mvar)
        cos_phi = None if s_mva == 0.0 else abs(p_mw) / s_mva
        kierunek = KIERUNEK_POBOR if p_mw >= 0.0 else KIERUNEK_ODDAWANIE

    pozycje: list[PozycjaOceny] = []

    # --- Kryterium 1: moc czynna w punkcie wobec limitu OSD -------------------
    braki_mocy: list[str] = []
    if limit_mw is None:
        braki_mocy.append(READINESS_CONNECTION_LIMIT_MISSING)
    if p_mw is None:
        braki_mocy.append(READINESS_CONNECTION_FLOW_MISSING)
    # Porownanie na wartosciach opublikowanych (6 miejsc w MW = rozdzielczosc 1 W) — rekord
    # i pozycja pokazuja te same liczby, ktore rozstrzygaja; szum zmiennoprzecinkowy rozplywu
    # ponizej rozdzielczosci nie przesuwa rozstrzygniecia.
    # Wynik bez limitu zostaje w rekordzie jako informacyjny (regula daje BRAK_PODSTAWY
    # z nazwanym brakiem limitu); limit bez wyniku — NIE_OCENIONO z nazwanym brakiem biegu.
    modul_p = None if p_mw is None else _round6(abs(p_mw))
    pozycje.append(
        _pozycja(
            Porownanie(
                kryterium_id=KRYTERIUM_MOC,
                opis_pl="Moc czynna wymieniana z siecią nie większa od mocy przyłączeniowej",
                warunek_latex=r"|P| \le P_{\text{limit}}",
                relacja="NIE_WIECEJ",
                wielkosc_pl=(
                    "moc czynna oddawana do sieci"
                    if kierunek == KIERUNEK_ODDAWANIE
                    else "moc czynna pobierana z sieci"
                ),
                symbol_latex="|P|",
                jednostka="MW",
                wynik=modul_p,
                limit=_round6(limit_mw),
                limit_pl="moc przyłączeniowa z warunków przyłączenia (oba kierunki)",
                braki=tuple(_OPIS_BRAKU[kod] for kod in braki_mocy),
            ),
            kody=braki_mocy,
            jednostka="MW",
            opis_pl=(
                "Nie można ocenić mocy w punkcie przyłączenia — brak danych wejściowych."
                if modul_p is None or limit_mw is None
                else (
                    f"Moc {'oddawana do sieci' if kierunek == KIERUNEK_ODDAWANIE else 'pobierana z sieci'}"
                    f" {format_liczba(round(modul_p, 3))} MW wobec limitu "
                    f"{format_liczba(round(limit_mw, 3))} MW."
                )
            ),
        )
    )

    # --- Kryterium 2: cosfi w punkcie wobec wymagania OSD ---------------------
    braki_cos: list[str] = []
    if cos_phi_wymagany is None:
        braki_cos.append(READINESS_CONNECTION_COS_PHI_MISSING)
    if cos_phi is None:
        braki_cos.append(READINESS_CONNECTION_FLOW_MISSING)
    # Wymaganie OSD jest DOLNYM ograniczeniem: im nizszy cosfi, tym wieksza moc bierna
    # wymieniana z siecia przy tej samej mocy czynnej.
    cos_publikowany = _round6(cos_phi)
    pozycje.append(
        _pozycja(
            Porownanie(
                kryterium_id=KRYTERIUM_COS_PHI,
                opis_pl="Współczynnik mocy w punkcie przyłączenia nie mniejszy od wymaganego",
                warunek_latex=r"\cos\varphi \ge \cos\varphi_{\text{wym}}",
                relacja="NIE_MNIEJ",
                wielkosc_pl="współczynnik mocy cosφ w punkcie przyłączenia",
                symbol_latex=r"\cos\varphi",
                jednostka="1",
                wynik=cos_publikowany,
                limit=_round6(cos_phi_wymagany),
                limit_pl="wymagany współczynnik mocy z warunków przyłączenia",
                braki=tuple(_OPIS_BRAKU[kod] for kod in braki_cos),
            ),
            kody=braki_cos,
            jednostka="-",
            opis_pl=(
                "Nie można ocenić cosφ w punkcie przyłączenia — brak danych wejściowych."
                if cos_publikowany is None or cos_phi_wymagany is None
                else (
                    f"cosφ w punkcie {format_liczba(round(cos_publikowany, 4))} wobec wymaganego "
                    f"{format_liczba(round(cos_phi_wymagany, 4))}."
                )
            ),
        )
    )

    ocena_wymagania = wymaganie_z_ocen(
        wymaganie_id=WYMAGANIE_WARUNKOW,
        nazwa_pl="Warunki przyłączenia OSD w punkcie przyłączenia",
        podstawa=_PODSTAWA_WARUNKOW,
        oceny=tuple(p.ocena for p in pozycje),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_WARUNKOW),
        zakres=_ZAKRES_WARUNKOW,
        odniesienie="application/analyses/warunki_przylaczenia.py",
    )
    return OcenaWarunkowPrzylaczenia(
        ocena_wymagania=ocena_wymagania,
        wyjasnienie=ocena_wymagania.wyjasnienie,
        punkt_przylaczenia=punkt,
        p_mw=_round6(p_mw),
        q_mvar=_round6(q_mvar),
        s_mva=_round6(s_mva),
        cos_phi=_round6(cos_phi),
        kierunek=kierunek,
        pozycje=tuple(pozycje),
    )


def build_warunki_przylaczenia_view(run: CanonicalRun) -> dict[str, Any]:
    """Zbuduj widok oceny warunkow przylaczenia dla przebiegu rozplywu (PF).

    To jest KONSUMENT tej analizy — bez niego modul bylby wyspa, a znalezisko Z2
    audytu FLOW zostaloby tylko przepisane w inne miejsce.

    Raises:
        ValueError: gdy przebieg nie jest rozplywem (``PF``) albo nie jest
            zakonczony — komunikat w jezyku polskim (jak pozostale widoki).
    """
    if run.analysis_type != "PF":
        raise OdmowaDanychError(
            "Ocena warunków przyłączenia wymaga przebiegu rozpływu mocy; "
            f"wskazany przebieg: {rodzaj_przebiegu_pl(run.analysis_type)}."
        )
    if run.status != "FINISHED":
        raise OdmowaDanychError(
            "Przebieg rozpływu mocy nie jest zakończony — wynik rozpływu nie jest " "dostępny."
        )

    snapshot = run.snapshot or {}
    header = snapshot.get("header") or {}
    result_v1 = (run.raw_result or {}).get("result_v1") or {}

    ocena = ocen_warunki_przylaczenia(
        connection_conditions=header.get("connection_conditions"),
        result_v1=result_v1,
    )
    return {
        "run_id": str(run.id),
        "case_id": run.case_id,
        "analysis_type": run.analysis_type,
        "ocena": ocena.to_dict(),
        # Karta LINIA-110: wielkości rozpływu w punkcie przyłączenia stoją na impedancji linii
        # 110 kV z wartością roboczą geometrii — dane przyjęte widoku (addytywnie, gdy są).
        **pola_danych_przyjetych_biegu(run.raw_result),
    }
