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
from typing import Any

from enm.canonical_analysis import CanonicalRun

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

# Tolerancja porownan doborowych — spojna z pozostalymi analizami (der_sn_validation).
_EPS = 1e-9


@dataclass(frozen=True)
class PozycjaOceny:
    """Jedna pozycja werdyktu: kryterium, wartosc zmierzona, wartosc wymagana.

    ``status`` = UNAVAILABLE znaczy BRAK PODSTAWY do oceny (patrz ``readiness_codes``),
    nie spelnienie kryterium.
    """

    kryterium: str
    status: str
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
            "wartosc": self.wartosc,
            "wymagana": self.wymagana,
            "jednostka": self.jednostka,
            "opis_pl": self.opis_pl,
            "readiness_codes": list(self.readiness_codes),
        }


@dataclass(frozen=True)
class OcenaWarunkowPrzylaczenia:
    """Werdykt warunkow przylaczenia (WHITE BOX: wielkosci zmierzone + zalozenia)."""

    punkt_przylaczenia: str | None
    p_mw: float | None
    q_mvar: float | None
    s_mva: float | None
    cos_phi: float | None
    kierunek: str | None
    pozycje: tuple[PozycjaOceny, ...]
    formula_ref: str = "cosφ = |P| / √(P² + Q²);  kryterium mocy: |P| ≤ P_limit"
    zalozenia: tuple[str, ...] = field(
        default_factory=lambda: (
            "Wielkosci z wezla bilansujacego biegu rozplywu (punkt przylaczenia do sieci OSD).",
            "P > 0 = pobor z sieci, P < 0 = oddawanie do sieci.",
            "Limit mocy przylaczeniowej dotyczy MODULU mocy czynnej (oba kierunki).",
            "cosfi liczone z mocy czynnej i biernej w punkcie, bez korekty kierunku.",
            "Brak danej = NIESPRAWDZONE z kodem gotowosci, nigdy wartosc zastepcza.",
        )
    )

    @property
    def status_ogolny(self) -> str:
        """FAIL gdy dowolne kryterium naruszone; UNAVAILABLE gdy zadne nie ma podstawy."""
        if any(p.status == STATUS_FAIL for p in self.pozycje):
            return STATUS_FAIL
        if any(p.status == STATUS_PASS for p in self.pozycje):
            return STATUS_PASS
        return STATUS_UNAVAILABLE

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


def _pozycja_niedostepna(
    kryterium: str, jednostka: str, opis: str, kody: list[str]
) -> PozycjaOceny:
    return PozycjaOceny(
        kryterium=kryterium,
        status=STATUS_UNAVAILABLE,
        wartosc=None,
        wymagana=None,
        jednostka=jednostka,
        opis_pl=opis,
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
    if braki_mocy:
        pozycje.append(
            _pozycja_niedostepna(
                KRYTERIUM_MOC,
                "MW",
                "Nie mozna ocenic mocy w punkcie przylaczenia — brak danych wejsciowych.",
                braki_mocy,
            )
        )
    else:
        assert p_mw is not None and limit_mw is not None
        modul_p = abs(p_mw)
        przekroczony = modul_p > limit_mw + _EPS
        opis = (
            f"Moc {'oddawana do sieci' if kierunek == KIERUNEK_ODDAWANIE else 'pobierana z sieci'}"
            f" {modul_p:.3f} MW wobec limitu {limit_mw:.3f} MW"
            f" ({'PRZEKROCZONY' if przekroczony else 'dotrzymany'})."
        )
        pozycje.append(
            PozycjaOceny(
                kryterium=KRYTERIUM_MOC,
                status=STATUS_FAIL if przekroczony else STATUS_PASS,
                wartosc=_round6(modul_p),
                wymagana=_round6(limit_mw),
                jednostka="MW",
                opis_pl=opis,
            )
        )

    # --- Kryterium 2: cosfi w punkcie wobec wymagania OSD ---------------------
    braki_cos: list[str] = []
    if cos_phi_wymagany is None:
        braki_cos.append(READINESS_CONNECTION_COS_PHI_MISSING)
    if cos_phi is None:
        braki_cos.append(READINESS_CONNECTION_FLOW_MISSING)
    if braki_cos:
        pozycje.append(
            _pozycja_niedostepna(
                KRYTERIUM_COS_PHI,
                "-",
                "Nie mozna ocenic cosfi w punkcie przylaczenia — brak danych wejsciowych.",
                braki_cos,
            )
        )
    else:
        assert cos_phi is not None and cos_phi_wymagany is not None
        # Wymaganie OSD jest DOLNYM ograniczeniem: im nizszy cosfi, tym wieksza moc
        # bierna wymieniana z siecia przy tej samej mocy czynnej.
        naruszony = cos_phi < cos_phi_wymagany - _EPS
        pozycje.append(
            PozycjaOceny(
                kryterium=KRYTERIUM_COS_PHI,
                status=STATUS_FAIL if naruszony else STATUS_PASS,
                wartosc=_round6(cos_phi),
                wymagana=_round6(cos_phi_wymagany),
                jednostka="-",
                opis_pl=(
                    f"cosfi w punkcie {cos_phi:.4f} wobec wymaganego {cos_phi_wymagany:.4f}"
                    f" ({'NIEDOTRZYMANY' if naruszony else 'dotrzymany'})."
                ),
            )
        )

    return OcenaWarunkowPrzylaczenia(
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
        raise ValueError(
            "Ocena warunkow przylaczenia wymaga przebiegu rozplywu mocy (PF); "
            f"otrzymano rodzaj analizy: {run.analysis_type}."
        )
    if run.status != "FINISHED":
        raise ValueError(
            f"Przebieg {run.id} nie jest zakonczony (status={run.status}); "
            "wynik rozplywu nie jest dostepny."
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
    }
