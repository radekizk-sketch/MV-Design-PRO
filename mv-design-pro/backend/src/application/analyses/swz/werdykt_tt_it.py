"""Werdykt SWZ w układach TT i IT (IEC 60364-4-41 §411.5 / §411.6) — karta W5-E-TTIT.

Warstwa INTERPRETACJI na kontrakcie werdyktu wyjaśnialnego (``werdykt``): nie liczy fizyki
(prąd doziemny, napięcie dotykowe, prąd pierwszego i drugiego zwarcia IT daje solver
``petla_zwarcia_tt_it`` przez ``compute_fault_loop``), tylko porównuje gotowe wielkości
z limitami, KAŻDY z nazwaną podstawą i stanem źródła:

* czasy wyłączenia układu TT — WYŁĄCZNIE z tabeli repo
  ``lv_disconnection_times_iec60364_4_41`` (``TABLICA_TT_ODBIORCZE`` / ``CZAS_TT_ROZDZIELCZY``,
  status REFERENCYJNY z dwóch źródeł wtórnych) — stan źródła jest częścią wyjaśnienia;
* czas wyłączenia RCD przy I_Δn i prąd różnicowy znamionowy — z rekordu katalogowego RCD
  zmaterializowanego na gałęzi (stan źródła wg statusu weryfikacji rekordu);
* dopuszczalne napięcie dotykowe (TT, IT — pierwsze zwarcie) i warunki drugiego zwarcia IT
  NIE są w repozytorium: kryterium dostaje ``limit=None`` → status ``BRAK_PODSTAWY`` z kodem
  ``swz.limit_tt_it_brak_tekstu_normy`` do czasu pakietu danych właściciela (IEC 60364-4-41:
  wydanie, punkt, cytat). ŻADNEJ liczby z pamięci. Testy podają limit jawnie jako daną
  testową (parametry ``limit_*``) — wtedy kryterium rozstrzyga się normalnie.

Status maszynowy nigdy nie jest samodzielną odpowiedzią: rekordy K i W niosą kryterium,
wynik z jednostką, limit z podstawą, margines, przyczynę, dowód i zakres ważności.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.analyses.fault_loop.tt_it import DanePunktuTtIt, RcdNaTrasie
from application.ocena_niewykonana import rekord_json
from network_model.catalog.lv_disconnection_times_iec60364_4_41 import (
    CZAS_TT_ROZDZIELCZY,
    TABLICA_TT_ODBIORCZE,
    WpisCzasuWylaczenia,
    pasmo_dla_u0,
)
from network_model.solvers.fault_loop_iec60364 import FaultLoopResult, NetworkType
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    ClaimKind,
    DanaPrzyjeta,
    EvidenceTier,
    FieldQuality,
    Kryterium,
    LimitKryterium,
    Niepewnosc,
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    StatusDanych,
    StatusDowodu,
    Stosowalnosc,
    Wielkosc,
    WynikKryterium,
    WynikWymagania,
    ZakresWaznosci,
    format_liczba,
    ocen_kryterium,
    zagreguj_wymaganie,
)

from .werdykt import dane_przyjete_petli, rodzaj_obwodu_dla_aparatu

#: Kod odmowy limitu (rejestr kodów gotowości): tekst normy nie jest w repozytorium.
KOD_LIMIT_BRAK_TEKSTU_NORMY = "swz.limit_tt_it_brak_tekstu_normy"
#: Znacznik kontraktu odpowiedzi SWZ TT/IT (konsumenci: projekcja nN, dowód, arkusz, front).
KONTRAKT_WERDYKTU_TT_IT = "werdykt_wyjasnialny_tt_it"
#: Zdolność obliczeniowa w rejestrze dowodowym (``solver_input/provenance.py``).
ZDOLNOSC_PETLI_TT_IT = "nn.petla_zwarcia_tt_it"

_J_A = "A"
_J_V = "V"
_J_S = "s"
_J_OHM = "Ω"

_PODSTAWA_WYMAGANIA_TT = PodstawaWymagania(
    rodzaj="NORMA",
    dokument="IEC 60364-4-41",
    wydanie="2005 / 2017 (progi czasowe potwierdzone w dwóch źródłach wtórnych)",
    jednostka_redakcyjna="§411.5 (układ TT) i Tab. 41.1",
    status="WSKAZANE",
    uwagi_pl=(
        "pełny tekst normy niedostępny w repozytorium — czasy z modułu tabeli czasów "
        "(status referencyjny), limit napięcia dotykowego oczekuje na tekst od właściciela"
    ),
)
_PODSTAWA_WYMAGANIA_IT = PodstawaWymagania(
    rodzaj="NORMA",
    dokument="IEC 60364-4-41",
    wydanie="2005 / 2017",
    jednostka_redakcyjna="§411.6 (układ IT)",
    status="WSKAZANE",
    uwagi_pl=(
        "pełny tekst normy niedostępny w repozytorium — warunki pierwszego i drugiego zwarcia "
        "oczekują na tekst od właściciela; fizyka liczona jawnie"
    ),
)
_PODSTAWA_LIMITU_NIEUSTALONA = PodstawaWymagania(
    rodzaj="NIEUSTALONA",
    dokument="IEC 60364-4-41 — wartość graniczna z tekstu normy (pakiet danych właściciela)",
    status="NIEUSTALONE",
)
_NIEPEWNOSC_OBLICZENIA = Niepewnosc(
    nie_dotyczy=True,
    powod_pl=(
        "wielkości pętli doziemnej liczone algebraicznie z impedancji modelu (bez "
        "dyskretyzacji) — niepewność numeryczna nie dotyczy"
    ),
)
_NIEPEWNOSC_DEKLARACJI = Niepewnosc(
    nie_dotyczy=True,
    powod_pl="czas wyłączenia z rekordu katalogowego aparatu — niepewność numeryczna nie dotyczy",
)
_BRAK_LIMITU_TT_PL = (
    "Dopuszczalne napięcie dotykowe układu TT z tekstu IEC 60364-4-41 (wydanie, punkt, "
    "cytat z jednostką) — pakiet danych właściciela; wartość nie jest przyjmowana z pamięci"
)
_BRAK_WARUNKOW_IT_PIERWSZE_PL = (
    "Warunek pierwszego zwarcia doziemnego układu IT z tekstu IEC 60364-4-41 §411.6 "
    "(dopuszczalne napięcie dotykowe, wzór) — pakiet danych właściciela"
)
_BRAK_WARUNKOW_IT_DRUGIE_PL = (
    "Warunki drugiego zwarcia doziemnego układu IT z tekstu IEC 60364-4-41 §411.6 "
    "(z rozprowadzonym i bez rozprowadzonego przewodu neutralnego: wzory, współczynniki, "
    "czas wymagany) — pakiet danych właściciela"
)


def _w(wartosc: float, jednostka: str) -> Wielkosc:
    return Wielkosc(wartosc=float(wartosc), jednostka=jednostka)


def _dowod_obliczenia(
    odniesienie: str, dane_przyjete: tuple[DanaPrzyjeta, ...] = ()
) -> StatusDowodu:
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_PETLI_TT_IT)
    return StatusDowodu(
        metoda="OBLICZENIE",
        poziom=zdolnosc.tier,
        rodzaj_twierdzenia=zdolnosc.claim_kind,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=dane_przyjete)
            if dane_przyjete
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=odniesienie,
    )


def _dowod_deklaracji_rcd(
    rcd: RcdNaTrasie,
    t_a: float | None,
    kolumna: str,
    dane_petli: tuple[DanaPrzyjeta, ...] = (),
) -> StatusDowodu:
    """Czas wyłączenia z rekordu RCD: rekord niezweryfikowany = dana przyjęta (jakość karty);
    kolumnę rekordu wybiera prąd pętli, więc jego dana przyjęta (``dane_petli``) też."""
    przyjete: tuple[DanaPrzyjeta, ...] = ()
    if rcd.verification_status != "ZWERYFIKOWANY" and t_a is not None:
        przyjete = (
            DanaPrzyjeta(
                nazwa_pl=f"czas wyłączenia RCD „{rcd.nazwa}” przy prądzie {kolumna}",
                wartosc=_w(t_a, _J_S),
                powod_pl=(
                    "rekord katalogowy rodziny generycznej o statusie referencyjnym (Tabela 1 "
                    "IEC 61008-1 z dwóch źródeł wtórnych), nie zweryfikowana karta producenta"
                ),
                jakosc=FieldQuality.DATASHEET,
            ),
        )
    przyjete = przyjete + dane_petli
    return StatusDowodu(
        metoda="DEKLARACJA",
        poziom=EvidenceTier.DECLARATION,
        rodzaj_twierdzenia=ClaimKind.DECLARED_CONFIGURATION,
        status_modelu="NIE_DOTYCZY",
        status_danych=(
            StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=przyjete)
            if przyjete
            else StatusDanych(stan="ZWALIDOWANE")
        ),
        odniesienie=f"rekord katalogowy RCD „{rcd.catalog_ref or rcd.branch_ref}”",
    )


def _podstawa_rekordu_rcd(rcd: RcdNaTrasie, co: str) -> PodstawaWymagania:
    """Podstawa wartości z rekordu RCD — stan źródła wg statusu weryfikacji rekordu (ta sama
    reguła co podstawa obciążalności z katalogu w ocenie magistrali SN)."""
    dokument = rcd.source_reference or "rekord katalogowy wyłącznika różnicowoprądowego"
    if rcd.verification_status == "ZWERYFIKOWANY":
        return PodstawaWymagania(
            rodzaj="KATALOG_PRODUCENTA",
            dokument=dokument,
            wydanie="katalog typów nN",
            jednostka_redakcyjna=f"pozycja „{rcd.nazwa}” — {co}",
            status="WSKAZANE",
        )
    return PodstawaWymagania(
        rodzaj="KATALOG_PRODUCENTA",
        dokument=dokument,
        status="NIEUSTALONE",
        uwagi_pl=(
            f"rekord katalogowy „{rcd.nazwa}” ma status weryfikacji "
            f"„{(rcd.verification_status or 'nieznany').lower()}” — {co} nie jest przeniesiony "
            "ze zweryfikowanej karty producenta"
        ),
    )


def _podstawa_tabeli_czasow(
    wpis: WpisCzasuWylaczenia, jednostka_redakcyjna: str
) -> PodstawaWymagania:
    return PodstawaWymagania(
        rodzaj="NORMA",
        dokument="IEC 60364-4-41",
        wydanie="2005 / 2017 (progi czasowe potwierdzone w dwóch źródłach wtórnych)",
        jednostka_redakcyjna=jednostka_redakcyjna,
        status="WSKAZANE",
        uwagi_pl=wpis.podstawa,
    )


def _zakres(uklad: str, opis: str) -> ZakresWaznosci:
    return ZakresWaznosci(
        rodzaj_analizy="SHORT_CIRCUIT",
        opis_pl=opis,
        wykluczenia=(
            "zwarcia w instalacji poza modelem sieci (za zaciskami instalacji odbiorczej)",
            "wpływ innych transformatorów stacji przy sprzęgle zamkniętym (pętla od transformatora własnej sekcji)",
        )
        + (("RCD inny niż najbliższy punktowi na trasie",) if uklad == "TT" else ()),
    )


@dataclass(frozen=True)
class SwzTtItWynik:
    """Werdykt SWZ TT/IT: rekord W z rekordami K + kontekst tabeli czasów."""

    uklad: str
    wymaganie: WynikWymagania
    kod_odmowy_limitu: str | None
    t_wymagany_s: float | None
    pasmo_u0: str | None
    rodzaj_obwodu: str
    ik_min_a: float

    @property
    def kryteria(self) -> tuple[OcenaKryterium, ...]:
        return self.wymaganie.oceny_skladowe

    def to_dict(self) -> dict[str, Any]:
        return {
            "kontrakt": KONTRAKT_WERDYKTU_TT_IT,
            "uklad": self.uklad,
            "wymaganie": rekord_json(self.wymaganie),
            "kod_odmowy_limitu": self.kod_odmowy_limitu,
            "t_wymagany_s": self.t_wymagany_s,
            "pasmo_u0": self.pasmo_u0,
            "rodzaj_obwodu": self.rodzaj_obwodu,
            "ik1_min_a": self.ik_min_a,
        }


def _slad(wynik: FaultLoopResult, krok: str, opis: str) -> tuple[OdnosnikSladu, ...]:
    kroki = {k["step"] for k in wynik.white_box_trace}
    return (
        OdnosnikSladu(
            krok=f"petla-tt-it:{wynik.fault_node_id}:{krok}",
            opis_pl=opis + ("" if krok in kroki else " (krok śladu nieobecny — dana nieobecna)"),
        ),
    )


def _kryterium_prad_rcd(
    wynik: FaultLoopResult, rcd: RcdNaTrasie, przedmiot: Przedmiot, punkt: str
) -> OcenaKryterium:
    return ocen_kryterium(
        kryterium_id="swz.tt.prad_rcd",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Prąd zwarcia doziemnego przez uziomy instalacji i stacji (scenariusz MIN) osiąga "
                "prąd różnicowy znamionowy wyłącznika różnicowoprądowego"
            ),
            warunek_latex=r"I_{d,min} \ge I_{\Delta n}",
            relacja="NIE_MNIEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_TT,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="układ TT: wyłącznik różnicowoprądowy zadziała dopiero, gdy prąd doziemny osiągnie I_Δn",
        ),
        wynik=WynikKryterium(
            wielkosc_pl="prąd zwarcia doziemnego minimalny (pętla przez R_A i R_B)",
            symbol_latex="I_{d,min}",
            wartosc=_w(wynik.ik_min_a, _J_A),
            punkt_krytyczny_pl=f"punkt „{punkt}”",
            metoda="OBLICZENIE",
        ),
        limit=LimitKryterium(
            wartosc=_w(rcd.i_delta_n_a, _J_A),
            podstawa=_podstawa_rekordu_rcd(rcd, "prąd różnicowy znamionowy I_Δn"),
            zakres_stosowalnosci_pl=f"wyłącznik różnicowoprądowy „{rcd.nazwa}” najbliższy punktowi",
        ),
        niepewnosc=_NIEPEWNOSC_OBLICZENIA,
        dowod=_dowod_obliczenia(
            f"pętla doziemna TT w punkcie „{punkt}”", dane_przyjete_petli(wynik, punkt)
        ),
        zakres_waznosci=_zakres(
            "TT", "Pętla doziemna TT: trasa + transformator + sieć zasilająca + R_B + R_A"
        ),
        slad=_slad(
            wynik,
            "compute_ik",
            f"I_d,min = {format_liczba(wynik.ik_min_a)} A z |Z_s| = {format_liczba(abs(wynik.z_loop_ohm))} Ω",
        ),
    )


def czas_wylaczenia_rcd_dla_pradu(rcd: RcdNaTrasie, i_d_a: float) -> tuple[float | None, str]:
    """Kolumna czasu wyłączenia rekordu RCD właściwa dla prądu doziemnego ``i_d_a``.

    Rekord katalogowy niesie maksymalne czasy wyłączenia przy I_Δn, 2·I_Δn i 5·I_Δn (kolumny
    Tabeli 1 IEC 61008-1 zmaterializowane z katalogu). Wybór kolumny to ODCZYT danych po
    krotności prądu (interpretacja, nie fizyka): prąd ≥ 5·I_Δn → kolumna 5·I_Δn, ≥ 2·I_Δn →
    2·I_Δn, ≥ I_Δn → I_Δn; prąd poniżej I_Δn → ``None`` (RCD nie ma obowiązku zadziałać —
    kryterium czasu nie ma wielkości ocenianej). Brak kolumny w rekordzie → cofnięcie do
    kolumny wolniejszej (nigdy szybszej — po bezpiecznej stronie).
    """
    krotnosc = i_d_a / rcd.i_delta_n_a
    kandydaci: list[tuple[float, float | None, str]] = [
        (5.0, rcd.t_a_5idn_s, "5·I_Δn"),
        (2.0, rcd.t_a_2idn_s, "2·I_Δn"),
        (1.0, rcd.t_a_s, "I_Δn"),
    ]
    for prog, czas, kolumna in kandydaci:
        if krotnosc >= prog and czas is not None:
            return czas, kolumna
    if krotnosc >= 1.0:
        return None, "I_Δn"
    return None, "poniżej I_Δn"


def _kryterium_czas_rcd(
    wynik: FaultLoopResult,
    rcd: RcdNaTrasie,
    wpis: WpisCzasuWylaczenia,
    jednostka_redakcyjna: str,
    rodzaj: str,
    pasmo: str,
    przedmiot: Przedmiot,
    punkt: str,
) -> OcenaKryterium:
    t_a, kolumna = czas_wylaczenia_rcd_dla_pradu(rcd, wynik.ik_min_a)
    wynik_k = (
        WynikKryterium(
            wielkosc_pl=(
                f"maksymalny czas wyłączenia RCD przy prądzie doziemnym (kolumna {kolumna} "
                "rekordu katalogowego)"
            ),
            symbol_latex="t_a",
            wartosc=_w(t_a, _J_S),
            punkt_krytyczny_pl=(
                f"prąd doziemny minimalny {format_liczba(wynik.ik_min_a)} A = "
                f"{format_liczba(wynik.ik_min_a / rcd.i_delta_n_a)} × I_Δn"
            ),
            metoda="DEKLARACJA",
        )
        if t_a is not None
        else None
    )
    return ocen_kryterium(
        kryterium_id="swz.tt.czas_wylaczenia",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Czas wyłączenia wyłącznika różnicowoprądowego przy prądzie doziemnym obwodu "
                "nie przekracza czasu wymaganego dla układu TT"
            ),
            warunek_latex=r"t_a \le t_{wym}",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_TT,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=f"obwód {rodzaj} w układzie TT, pasmo napięcia względem ziemi {pasmo}",
        ),
        wynik=wynik_k,
        limit=LimitKryterium(
            wartosc=_w(wpis.czas_s, _J_S),
            podstawa=_podstawa_tabeli_czasow(wpis, jednostka_redakcyjna),
            zakres_stosowalnosci_pl=f"obwód {rodzaj}, pasmo U0 {pasmo}",
        ),
        niepewnosc=_NIEPEWNOSC_DEKLARACJI,
        dowod=_dowod_deklaracji_rcd(rcd, t_a, kolumna, dane_przyjete_petli(wynik, punkt)),
        zakres_waznosci=_zakres(
            "TT", "Czas wyłączenia RCD z rekordu katalogowego wobec tabeli czasów układu TT"
        ),
        slad=_slad(
            wynik,
            "napiecie_dotykowe_rcd",
            f"RCD „{rcd.nazwa}”: I_Δn = {format_liczba(rcd.i_delta_n_a)} A, t_a = {format_liczba(rcd.t_a_s) if rcd.t_a_s is not None else 'brak'} s",
        ),
        braki_dodatkowe=(
            ()
            if t_a is not None
            else (
                f"Czas wyłączenia RCD „{rcd.nazwa}” przy prądzie {kolumna} w rekordzie "
                "katalogowym",
            )
        ),
    )


def _kryterium_napiecie_dotykowe_tt(
    wynik: FaultLoopResult,
    rcd: RcdNaTrasie,
    limit: LimitKryterium | None,
    przedmiot: Przedmiot,
    punkt: str,
) -> OcenaKryterium:
    assert wynik.tt_it is not None and wynik.tt_it.u_dotyk_v is not None
    assert wynik.tt_it.r_a_ohm is not None  # solver TT nie liczy U_dotyk bez R_A
    r_a_ohm = wynik.tt_it.r_a_ohm
    return ocen_kryterium(
        kryterium_id="swz.tt.napiecie_dotykowe",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Napięcie na uziomie instalacji odbiorczej przy prądzie różnicowym znamionowym "
                "wyłącznika nie przekracza dopuszczalnego napięcia dotykowego"
            ),
            warunek_latex=r"R_A \cdot I_{\Delta n} \le U_L",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_TT,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="układ TT: napięcie dotykowe zależy od uziomu instalacji i prądu różnicowego RCD",
        ),
        wynik=WynikKryterium(
            wielkosc_pl="napięcie na uziomie instalacji przy prądzie różnicowym znamionowym",
            symbol_latex="U_{dotyk}",
            wartosc=_w(wynik.tt_it.u_dotyk_v, _J_V),
            metoda="OBLICZENIE",
        ),
        limit=limit,
        niepewnosc=_NIEPEWNOSC_OBLICZENIA,
        dowod=_dowod_obliczenia(f"U_dotyk = R_A · I_Δn w punkcie „{punkt}”"),
        zakres_waznosci=_zakres(
            "TT", "Napięcie dotykowe z rezystancji uziomu instalacji i prądu różnicowego RCD"
        ),
        slad=_slad(
            wynik,
            "napiecie_dotykowe_rcd",
            f"U_dotyk = {format_liczba(r_a_ohm)} Ω · {format_liczba(rcd.i_delta_n_a)} A = {format_liczba(wynik.tt_it.u_dotyk_v)} V",
        ),
        braki_dodatkowe=(_BRAK_LIMITU_TT_PL,) if limit is None else (),
    )


def _kryterium_pierwsze_zwarcie_it(
    wynik: FaultLoopResult, limit: LimitKryterium | None, przedmiot: Przedmiot
) -> OcenaKryterium:
    assert wynik.tt_it is not None
    tt_it = wynik.tt_it
    # Solver IT odmawia bez pojemności/częstotliwości — prąd pierwszego zwarcia i C_e są
    # zawsze obecne w wyniku IT (brak = błąd kontraktu, nie dana do podstawienia zerem).
    assert tt_it.i_d_pierwsze_zwarcie_a is not None and tt_it.c_e_f is not None
    i_d1_a = tt_it.i_d_pierwsze_zwarcie_a
    c_e_f = tt_it.c_e_f
    wynik_k = (
        WynikKryterium(
            wielkosc_pl="napięcie na uziomie instalacji przy pierwszym zwarciu doziemnym",
            symbol_latex="U_{dotyk}",
            wartosc=_w(tt_it.u_dotyk_pierwsze_zwarcie_v, _J_V),
            metoda="OBLICZENIE",
        )
        if tt_it.u_dotyk_pierwsze_zwarcie_v is not None
        else None
    )
    braki: list[str] = []
    if wynik_k is None:
        braki.append(
            "Rezystancja uziomu instalacji odbiorczej R_A w punkcie (pole odbioru nN) — bez niej "
            "napięcie dotykowe pierwszego zwarcia nie jest liczone"
        )
    if limit is None:
        braki.append(_BRAK_WARUNKOW_IT_PIERWSZE_PL)
    return ocen_kryterium(
        kryterium_id="swz.it.pierwsze_zwarcie",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Napięcie na uziomie instalacji przy pierwszym zwarciu doziemnym (prąd przez "
                "pojemności doziemne sieci) nie przekracza dopuszczalnego napięcia dotykowego"
            ),
            warunek_latex=r"R_A \cdot I_d \le U_L",
            relacja="NIE_WIECEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_IT,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="układ IT: pierwsze zwarcie doziemne nie wymaga wyłączenia, ale ogranicza napięcie dotykowe",
        ),
        wynik=wynik_k,
        limit=limit,
        niepewnosc=_NIEPEWNOSC_OBLICZENIA,
        dowod=_dowod_obliczenia(f"I_d = 3·ω·C_e·U_0 sieci IT ({format_liczba(i_d1_a)} A)"),
        zakres_waznosci=_zakres(
            "IT",
            "Pierwsze zwarcie doziemne IT: pojemności doziemne wszystkich odcinków sieci zasilanej z transformatora",
        ),
        slad=_slad(
            wynik,
            "prad_pierwszego_zwarcia_it",
            f"I_d = {format_liczba(i_d1_a)} A, C_e = {format_liczba(c_e_f * 1e6)} µF",
        ),
        braki_dodatkowe=tuple(braki),
    )


def _kryterium_drugie_zwarcie_it(
    wynik: FaultLoopResult, limit: LimitKryterium | None, przedmiot: Przedmiot, punkt: str
) -> OcenaKryterium:
    assert wynik.tt_it is not None
    return ocen_kryterium(
        kryterium_id="swz.it.drugie_zwarcie",
        przedmiot=przedmiot,
        kryterium=Kryterium(
            opis_pl=(
                "Prąd drugiego zwarcia doziemnego (dwie fazy, części przewodzące dostępne na "
                "wspólnym przewodzie ochronnym) wystarcza do zadziałania zabezpieczenia w czasie "
                "wymaganym dla drugiego zwarcia"
            ),
            warunek_latex=r"I_{d2,min} \ge I_a",
            relacja="NIE_MNIEJ",
        ),
        podstawa=_PODSTAWA_WYMAGANIA_IT,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl="układ IT: drugie zwarcie doziemne na innej fazie musi być wyłączone samoczynnie",
        ),
        wynik=WynikKryterium(
            wielkosc_pl="prąd drugiego zwarcia doziemnego minimalny",
            symbol_latex="I_{d2,min}",
            wartosc=_w(wynik.ik_min_a, _J_A),
            punkt_krytyczny_pl=f"punkt „{punkt}” (obie usterki w tym samym punkcie)",
            metoda="OBLICZENIE",
        ),
        limit=limit,
        niepewnosc=_NIEPEWNOSC_OBLICZENIA,
        dowod=_dowod_obliczenia(
            f"I_d2 = c·U_LL/(2·|Z_s|) w punkcie „{punkt}”", dane_przyjete_petli(wynik, punkt)
        ),
        zakres_waznosci=_zakres(
            "IT",
            "Drugie zwarcie doziemne IT: pętla L-PE-L tym samym jądrem co pętla TN, napięcie napędowe U_LL/2",
        ),
        slad=_slad(
            wynik,
            "prad_drugiego_zwarcia_it",
            f"I_d2,min = {format_liczba(wynik.ik_min_a)} A z |Z_s| = {format_liczba(abs(wynik.z_loop_ohm))} Ω",
        ),
        braki_dodatkowe=(_BRAK_WARUNKOW_IT_DRUGIE_PL,) if limit is None else (),
    )


def ocen_swz_tt_it(
    *,
    wynik_petli: FaultLoopResult,
    dane_punktu: DanePunktuTtIt,
    u0_v: float,
    przedmiot: Przedmiot,
    nazwa_punktu_pl: str,
    aparat_in_a: float | None = None,
    rodzaj_obwodu: str | None = None,
    limit_napiecia_dotykowego: LimitKryterium | None = None,
    limit_drugiego_zwarcia_it: LimitKryterium | None = None,
) -> SwzTtItWynik:
    """Werdykt SWZ układu TT albo IT z gotowego wyniku pętli doziemnej.

    ``nazwa_punktu_pl`` — nazwa punktu oceny z modelu (jedno źródło nazw); wchodzi do punktu
    krytycznego i odniesień dowodu zamiast identyfikatora maszynowego.

    ``limit_*`` — dopuszczalne wartości z tekstu normy; domyślnie ``None`` (brak w repozytorium →
    ``BRAK_PODSTAWY`` z kodem ``KOD_LIMIT_BRAK_TEKSTU_NORMY``). Podanie limitu to dana
    wołającego (testy: dana testowa; produkt: po pakiecie danych właściciela).
    """
    if wynik_petli.tt_it is None or wynik_petli.network_type not in (
        NetworkType.TT,
        NetworkType.IT,
    ):
        raise AssertionError(
            "Błąd programu: werdykt SWZ TT/IT wymaga wyniku pętli układu TT albo IT (pole tt_it)."
        )
    uklad = wynik_petli.network_type.value
    rodzaj = rodzaj_obwodu_dla_aparatu(aparat_in_a, rodzaj_obwodu)
    pasmo = pasmo_dla_u0(u0_v)
    kryteria: list[OcenaKryterium]
    t_wymagany: float | None = None
    if uklad == "TT":
        rcd = dane_punktu.rcd
        if rcd is None:
            raise AssertionError(
                "Błąd programu: werdykt SWZ TT wymaga RCD najbliższego punktowi (odmowa wcześniej)."
            )
        wpis = TABLICA_TT_ODBIORCZE[pasmo] if rodzaj == "odbiorczy" else CZAS_TT_ROZDZIELCZY
        jednostka_redakcyjna = (
            "Tab. 41.1 (układ TT, obwody odbiorcze)"
            if rodzaj == "odbiorczy"
            else "§411.3.2.4 (obwody rozdzielcze, układ TT)"
        )
        t_wymagany = wpis.czas_s
        kryteria = [
            _kryterium_prad_rcd(wynik_petli, rcd, przedmiot, nazwa_punktu_pl),
            _kryterium_czas_rcd(
                wynik_petli,
                rcd,
                wpis,
                jednostka_redakcyjna,
                rodzaj,
                pasmo,
                przedmiot,
                nazwa_punktu_pl,
            ),
            _kryterium_napiecie_dotykowe_tt(
                wynik_petli, rcd, limit_napiecia_dotykowego, przedmiot, nazwa_punktu_pl
            ),
        ]
        podstawa_w, nazwa_w = (
            _PODSTAWA_WYMAGANIA_TT,
            "Ochrona przez samoczynne wyłączenie zasilania w układzie TT",
        )
        wymaganie_id = "swz.tt"
        brak_limitu = limit_napiecia_dotykowego is None
    else:
        kryteria = [
            _kryterium_pierwsze_zwarcie_it(wynik_petli, limit_napiecia_dotykowego, przedmiot),
            _kryterium_drugie_zwarcie_it(
                wynik_petli, limit_drugiego_zwarcia_it, przedmiot, nazwa_punktu_pl
            ),
        ]
        podstawa_w, nazwa_w = (
            _PODSTAWA_WYMAGANIA_IT,
            "Ochrona przeciwporażeniowa w układzie IT (pierwsze i drugie zwarcie doziemne)",
        )
        wymaganie_id = "swz.it"
        brak_limitu = limit_napiecia_dotykowego is None or limit_drugiego_zwarcia_it is None

    wymaganie = zagreguj_wymaganie(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_w,
        podstawa=podstawa_w,
        stosowalnosc=Stosowalnosc(
            dotyczy=True,
            powod_pl=f"transformator zasilający deklaruje układ sieci nN {uklad}",
        ),
        sposob_wykazania="OBLICZENIE",
        oceny_skladowe=tuple(kryteria),
        pokrycie_programu="NIE_DOTYCZY",
        pokrycie_programu_pl="ocena obwodu nN — program badań modułu wytwórczego nie dotyczy",
        dowod=_dowod_obliczenia(
            f"pętla doziemna {uklad} w punkcie „{nazwa_punktu_pl}”",
            dane_przyjete_petli(wynik_petli, nazwa_punktu_pl),
        ),
        zakres_waznosci=_zakres(uklad, f"Ochrona przeciwporażeniowa obwodu nN w układzie {uklad}"),
        slad=[odnosnik for ocena in kryteria for odnosnik in ocena.slad],
    )
    return SwzTtItWynik(
        uklad=uklad,
        wymaganie=wymaganie,
        kod_odmowy_limitu=KOD_LIMIT_BRAK_TEKSTU_NORMY if brak_limitu else None,
        t_wymagany_s=t_wymagany,
        pasmo_u0=pasmo,
        rodzaj_obwodu=rodzaj,
        ik_min_a=wynik_petli.ik_min_a,
    )
