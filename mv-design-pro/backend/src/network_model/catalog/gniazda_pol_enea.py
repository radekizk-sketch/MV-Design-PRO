"""Gniazda aparatury pól rozdzielnicy SN stacji 110 kV/SN według standardu ENEA Operator
(karta GPZ-H5-APARATURA).

PO CO. Pole rozdzielnicy SN to UPORZĄDKOWANY ciąg gniazd aparatury — od szyny zbiorczej do
końca pola — a każde gniazdo ma rodzaj aparatu i wymagane znamiona z podstawą w standardzie.
Do tej karty pola funkcyjne SN (zespół uziemiający, BKR, pomiar napięcia) nie miały żadnego
składu, a pola główne SN nie miały wymagań. Ten moduł jest JEDYNYM źródłem tych danych:
szablony pól standardu z gniazdami. Status gniazda (zaprojektowane / wymagane standardem,
brak) wylicza ``enm.sklad_pola.sklad_pola``; model zapisuje wyłącznie odniesienie szablonu na
polu (``Bay.szablon_standardu_ref``) i gniazda na aparacie (``BayPrimaryDevice.gniazdo_ref``).

GRANICA 110 kV (decyzja właściciela 2026-10-22). Strona 110 kV jest wyłącznie funkcjonalną
granicą zasilania sieci SN: tory zasilania L1 i L2, pola zasilające jako przyłącza z łącznikiem
pola (gałąź modelu, której stan wchodzi do obliczeń), transformatory 110/SN i łącznik szyn
110 kV. Szablonów gniazd pól 110 kV, wymagań standardu dla aparatury 110 kV i oceny jej
wytrzymałości tu nie ma — pole 110 kV ma tylko łącznik potrzebny do stanu łączeniowego.

ŹRÓDŁO. ENEA Operator sp. z o.o., „Stacje elektroenergetyczne 110 kV. Zeszyt 1. Stacje
dwutransformatorowe 110 kV/SN", wersja 02.2023-2 (dalej: Zeszyt 1). Kolejność aparatów
i przekładnie przekładników — z rysunków pól (odczyt:
``docs/zrodla/ODCZYT_ENEA_H5_SPECYFIKACJA.md``); znamiona — z tekstu (tabele 3–5, §9.2, §13,
§16, §17, §19). Wymaganie odczytane z rysunku, którego nazwy rysunek nie definiuje (odłącznik
trójpołożeniowy, łącznik szyn SN w dwóch celach), niesie adnotację ``interpretacja_pl`` —
nigdy nie jest podawane jako tekst standardu. Rozstrzygnięcia właściciela (2026-10-22)
wpisane z adnotacją: A1 — aparat łączeniowy pól SN to odłącznik trójpołożeniowy (zamknięty /
otwarty / uziemiony), nie człon wysuwny; A3 — układ rozdzielnicy SN (pola i cele) wg
zał. Z.2, a skład i kolejność gniazd pola wg rysunku pola (Z.7, Z.10–Z.17) z zachowaniem toru
elektrycznego. Numerów symboli PN-EN 60617 nie podajemy — baza normy była niedostępna, żaden
nie jest potwierdzony.

GRANICE (nazwane). Głowica kablowa i kabel NIE są gniazdami pola: należą do gałęzi kablowej
(odcinka SN), a standard nie podaje dla nich parametrów aparatu pola. Układ H4 (zał. Z.9)
nie jest odczytany — szablonów H4 tu nie ma. Wymagania są DANĄ do pokazania i do oceny
doboru w warstwie analizy; moduł nie ocenia aparatu (zero fizyki, zero werdyktu).
Impedancji uziemienia punktu neutralnego (dławik, rezystor) gniazda nie niosą — sposób
uziemienia i jego impedancję niesie ``GroundingConfig`` źródła z katalogu
``mv_neutral_grounding``.

Moduł-LIŚĆ katalogu: zero importów spoza biblioteki standardowej.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from enm.rola_pola_sn import nazwa_roli_pola_sn_z_okresleniem

#: Dokument źródłowy — pełny opis w każdym zdaniu podstawy.
DOKUMENT_ENEA = (
    "ENEA Operator, Stacje elektroenergetyczne 110 kV, Zeszyt 1 — stacje dwutransformatorowe "
    "110 kV/SN (wersja 02.2023-2)"
)

RelacjaWymagania = Literal["CO_NAJMNIEJ", "CO_NAJWYZEJ", "ROWNE"]


@dataclass(frozen=True)
class WymaganieGniazda:
    """Jedno wymaganie standardu wobec aparatu w gnieździe — z podstawą i jednostką.

    ``parametr`` to klucz parametru aparatu w słowniku wymagań (``u_m_kv``, ``i_n_a``,
    ``i_cu_ka``, ``i_th_ka``, ``t_th_s``, ``przekladnia``, ``rdzenie``, ``uzwojenia``,
    ``u_r_kv``, ``u_c_kv``, ``i_n_wyl_ka``, ``energia_kj_na_kv``, ``u_pl_kv``, ``naped``,
    ``licznik_zadzialan``, ``grupa_polaczen``, ``u_nn_v``, ``s_nn_kva``, ``regulacja``,
    ``chlodzenie``, ``prad_regulacji_a``, ``zakres_regulacji_proc``, ``u_wt_v``,
    ``uklad``, ``q_ogniwa_kvar``, ``wkladki``, ``porownanie_faz``). ``warunek_pl`` — gdy
    wymaganie obowiązuje tylko w części przypadków (np. moc transformatora).
    """

    parametr: str
    nazwa_pl: str
    relacja: RelacjaWymagania
    wartosc: float | str | bool
    jednostka: str | None
    podstawa_pl: str
    warunek_pl: str | None = None
    interpretacja_pl: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "parametr": self.parametr,
            "nazwa_pl": self.nazwa_pl,
            "relacja": self.relacja,
            "wartosc": self.wartosc,
            "jednostka": self.jednostka,
            "podstawa_pl": self.podstawa_pl,
            "warunek_pl": self.warunek_pl,
            "interpretacja_pl": self.interpretacja_pl,
        }


@dataclass(frozen=True)
class GniazdoPola:
    """Gniazdo aparatu w polu: rodzaj aparatu (``BayPrimaryDevice.kind``), położenie w torze,
    wymagania i podstawa. Kolejność gniazd w szablonie = kolejność od szyny do końca pola."""

    id: str
    rodzaj: str
    nazwa_pl: str
    placement: str
    podstawa_pl: str
    wymagania: tuple[WymaganieGniazda, ...] = ()
    interpretacja_pl: str | None = None
    earthing_role: str | None = None
    #: Poziom izolacji gniazda: ``SIEC`` — aparat pracuje na napięciu sieci szyny pola (U_m
    #: aparatu porównywany z U_m sieci), ``PUNKT_NEUTRALNY`` — aparat w punkcie neutralnym
    #: transformatora (izolacja stopniowana; obowiązuje wyłącznie wymaganie U_m gniazda).
    izolacja: Literal["SIEC", "PUNKT_NEUTRALNY"] = "SIEC"

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "rodzaj": self.rodzaj,
            "nazwa_pl": self.nazwa_pl,
            "placement": self.placement,
            "podstawa_pl": self.podstawa_pl,
            "wymagania": [w.to_dict() for w in self.wymagania],
            "interpretacja_pl": self.interpretacja_pl,
            "earthing_role": self.earthing_role,
            "izolacja": self.izolacja,
        }


@dataclass(frozen=True)
class SzablonPolaStandardu:
    """Pole standardu rozdzielnicy SN: role pola modelu, którym przysługuje, i gniazda."""

    id: str
    nazwa_pl: str
    role_pola: tuple[str, ...]
    podstawa_pl: str
    gniazda: tuple[GniazdoPola, ...]
    uwagi_pl: str | None = None

    def gniazdo(self, gniazdo_id: str) -> GniazdoPola | None:
        return next((g for g in self.gniazda if g.id == gniazdo_id), None)

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "nazwa_pl": self.nazwa_pl,
            "role_pola": list(self.role_pola),
            "podstawa_pl": self.podstawa_pl,
            "gniazda": [g.to_dict() for g in self.gniazda],
            "uwagi_pl": self.uwagi_pl,
        }


def _p(punkt: str) -> str:
    return f"{DOKUMENT_ENEA}, {punkt}"


# ---------------------------------------------------------------------------
# Wymagania wspólne
# ---------------------------------------------------------------------------

#: §13: „W stacjach 110 kV/SN o dolnym napięciu nominalnym mniejszym lub równym 20 kV należy
#: stosować rozdzielnice SN na napięcie znamionowe 24 kV" — wymaganie rozdzielnicy (aparatów
#: pól), ostrzejsze od U_m 17,5 kV sieci 15 kV z tabeli 5.
_UM_SN = WymaganieGniazda(
    "u_m_kv",
    "napięcie znamionowe rozdzielnicy (aparatu pola) U_r",
    "CO_NAJMNIEJ",
    24.0,
    "kV",
    _p("§13 (rozdzielnica SN na 24 kV dla U_n ≤ 20 kV)"),
)
_ITH_SN = WymaganieGniazda(
    "i_th_ka",
    "prąd wytrzymywany krótkotrwały 3 s rozdzielnicy SN",
    "CO_NAJMNIEJ",
    16.0,
    "kA",
    _p("§9.2"),
)
_TTH_SN = WymaganieGniazda(
    "t_th_s", "czas odniesienia prądu krótkotrwałego", "ROWNE", 3.0, "s", _p("§9.2")
)


def _prad_ciagly_sn(*, glowny: bool) -> tuple[WymaganieGniazda, ...]:
    """Tabele 3 i 4: pola TR i łącznika szyn 1250 A (≤ 25 MVA) / 2000 A (25–40 MVA); pola
    liniowe, zespołu uziemiającego i BKR — 630 A (obie tabele)."""
    if not glowny:
        return (
            WymaganieGniazda(
                "i_n_a",
                "prąd znamionowy ciągły pola",
                "CO_NAJMNIEJ",
                630.0,
                "A",
                _p("tabele 3 i 4 (pole liniowe, zespołu uziemiającego, BKR)"),
            ),
        )
    return (
        WymaganieGniazda(
            "i_n_a",
            "prąd znamionowy ciągły pola",
            "CO_NAJMNIEJ",
            1250.0,
            "A",
            _p("tabela 3"),
            warunek_pl="transformator 110 kV/SN o mocy znamionowej do 25 MVA",
        ),
        WymaganieGniazda(
            "i_n_a",
            "prąd znamionowy ciągły pola",
            "CO_NAJMNIEJ",
            2000.0,
            "A",
            _p("tabela 4"),
            warunek_pl="transformator 110 kV/SN o mocy powyżej 25 MVA i nie większej niż 40 MVA",
        ),
    )


# ---------------------------------------------------------------------------
# Aparaty pól SN (zał. Z.2, Z.7, Z.10–Z.17)
# ---------------------------------------------------------------------------

#: A1 (decyzja właściciela 2026-10-22): rodzaj aparatu — odłącznik trójpołożeniowy; §13
#: dopuszcza go i odróżnia od członu wysuwnego (blokady „wyłącznikami, odłącznikami, członem
#: wysuwnym i uziemnikami, w tym (…) łącznikami trójpołożeniowymi”).
INTERPRETACJA_TROJPOLOZENIOWY = (
    "interpretacja rysunku ENEA (odłącznik z trzpieniem uziemiającym); symbolu PN-EN 60617 nie "
    "potwierdzono — brak dostępu do normy. Rodzaj aparatu przyjęty decyzją właściciela (A1): "
    "odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony), nie człon wysuwny"
)
NAZWA_ODLACZNIKA_TROJPOLOZENIOWEGO = "odłącznik trójpołożeniowy (zamknięty / otwarty / uziemiony)"


def _odlacznik_trojpolozeniowy(
    id_: str,
    *,
    glowny: bool,
    rysunek: str,
    placement: str = "UPSTREAM",
    okreslenie: str | None = None,
) -> GniazdoPola:
    nazwa = NAZWA_ODLACZNIKA_TROJPOLOZENIOWEGO
    return GniazdoPola(
        id=id_,
        rodzaj="DS_ES",
        nazwa_pl=f"{nazwa} {okreslenie}" if okreslenie else nazwa,
        placement=placement,
        podstawa_pl=_p(
            "§13 (odłączniki trójpołożeniowe dopuszczone, pozycje załączony–wyłączony–uziemiony), "
            + rysunek
        ),
        wymagania=(
            _UM_SN,
            *_prad_ciagly_sn(glowny=glowny),
            _ITH_SN,
            _TTH_SN,
            WymaganieGniazda(
                "naped",
                "napęd uziemnika",
                "ROWNE",
                "jeden wspólny napęd dla trzech faz",
                None,
                _p("§13"),
            ),
        ),
        interpretacja_pl=INTERPRETACJA_TROJPOLOZENIOWY,
        earthing_role="field_earth",
    )


def _wylacznik_sn(id_: str = "W", *, glowny: bool, rysunek: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="CB",
        nazwa_pl="wyłącznik próżniowy pola SN",
        placement="MIDSTREAM",
        podstawa_pl=_p(f"§13 (wyłączniki z próżniowymi komorami gaszeniowymi), {rysunek}"),
        wymagania=(
            _UM_SN,
            *_prad_ciagly_sn(glowny=glowny),
            _ITH_SN,
            _TTH_SN,
            WymaganieGniazda("medium", "komora gaszeniowa", "ROWNE", "próżniowa", None, _p("§13")),
        ),
    )


def _uziemnik_sn(id_: str, nazwa_pl: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="ES",
        nazwa_pl=nazwa_pl,
        placement="GROUND_BRANCH",
        podstawa_pl=_p(podstawa),
        wymagania=(
            _UM_SN,
            _ITH_SN,
            _TTH_SN,
            WymaganieGniazda(
                "naped", "napęd", "ROWNE", "jeden wspólny napęd dla trzech faz", None, _p("§13")
            ),
        ),
        earthing_role="field_earth",
    )


def _wskaznik(id_: str, nazwa_pl: str, placement: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="VOLTAGE_INDICATOR",
        nazwa_pl=nazwa_pl,
        placement=placement,
        podstawa_pl=_p(podstawa),
        wymagania=(
            _UM_SN,
            WymaganieGniazda(
                "porownanie_faz",
                "współpraca z urządzeniami do uzgadniania faz",
                "ROWNE",
                True,
                None,
                _p("§13 (stacjonarne wskaźniki obecności napięcia)"),
            ),
        ),
    )


def _ct_sn(id_: str, nazwa_pl: str, przekladnia: str, rdzenie: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="CT",
        nazwa_pl=nazwa_pl,
        placement="MIDSTREAM",
        podstawa_pl=_p(podstawa),
        wymagania=(
            _UM_SN,
            WymaganieGniazda(
                "przekladnia", "przekładnia", "ROWNE", przekladnia, None, _p(podstawa)
            ),
            WymaganieGniazda("rdzenie", "rdzenie", "ROWNE", rdzenie, None, _p(podstawa)),
        ),
    )


_BEZ_WKLADEK = WymaganieGniazda(
    "wkladki",
    "wkładki bezpiecznikowe po stronie pierwotnej",
    "ROWNE",
    False,
    None,
    _p("§13 (przekładników napięciowych nie należy wyposażać we wkładki bezpiecznikowe)"),
)


def _vt_sn(id_: str, nazwa_pl: str, przekladnia: str, uzwojenia: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="VT",
        nazwa_pl=nazwa_pl,
        placement="OFF_PATH",
        podstawa_pl=_p(podstawa),
        wymagania=(
            _UM_SN,
            WymaganieGniazda(
                "przekladnia", "przekładnia", "ROWNE", przekladnia, None, _p(podstawa)
            ),
            WymaganieGniazda(
                "uzwojenia", "uzwojenia wtórne", "ROWNE", uzwojenia, None, _p(podstawa)
            ),
            _BEZ_WKLADEK,
        ),
    )


_FERRANTI = GniazdoPola(
    id="CT_F",
    rodzaj="CT",
    nazwa_pl="przekładnik Ferrantiego (ziemnozwarciowy, na kablu w przedziale kablowym)",
    placement="DOWNSTREAM",
    podstawa_pl=_p("§13 (przekładnik Ferrantiego w polu liniowym), rys. Z.10"),
    wymagania=(
        WymaganieGniazda(
            "przekladnia", "przekładnia (opis rysunku)", "ROWNE", "1/100", None, _p("rys. Z.10")
        ),
        WymaganieGniazda(
            "zlacze_pomiarowe",
            "dodatkowe złącze pomiarowe wyprowadzone na listwę obwodów wtórnych",
            "ROWNE",
            True,
            None,
            _p("§13"),
        ),
    ),
)

_OGRANICZNIK_SN_BEZ_LICZNIKA = WymaganieGniazda(
    "licznik_zadzialan",
    "licznik zadziałań",
    "ROWNE",
    False,
    None,
    _p("§19 (liczniki nie są wymagane)"),
)


def _ogranicznik_sn(
    id_: str, nazwa_pl: str, podstawa: str, *, punkt_neutralny: bool = False
) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="SURGE_ARRESTER",
        nazwa_pl=nazwa_pl,
        placement="OFF_PATH" if punkt_neutralny else "GROUND_BRANCH",
        podstawa_pl=_p(podstawa),
        wymagania=(_OGRANICZNIK_SN_BEZ_LICZNIKA,),
        earthing_role="neutral_point" if punkt_neutralny else "surge_ground",
        izolacja="PUNKT_NEUTRALNY" if punkt_neutralny else "SIEC",
    )


_VT_POLA_SN_PRZEKLADNIA = "U_n/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 kV"

POLE_SN_TRANSFORMATOROWE = SzablonPolaStandardu(
    id="ENEA_SN_TR",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("TRANSFORMATOROWE", "SN"),
    role_pola=("TR",),
    podstawa_pl=_p("§13, zał. Z.2 (pola 7/8), zał. Z.7"),
    gniazda=(
        _wskaznik(
            "VI_SZ", "wskaźnik obecności napięcia od strony szyny", "UPSTREAM", "rys. Z.7, §13"
        ),
        _odlacznik_trojpolozeniowy("DS_ES", glowny=True, rysunek="rys. Z.7"),
        _wylacznik_sn(glowny=True, rysunek="rys. Z.7"),
        _uziemnik_sn(
            "ES", "uziemnik za wyłącznikiem (węzeł przekładnika napięciowego)", "rys. Z.7"
        ),
        _vt_sn(
            "VT",
            "przekładnik napięciowy pola transformatorowego (gniazdo wtykowe)",
            _VT_POLA_SN_PRZEKLADNIA,
            "I 0–10 VA kl. 0,2; II 7,5 VA kl. 0,5; III 7,5 VA kl. 0,5/3P",
            "rys. Z.7, §13 (gniazda przekładników napięciowych w polach transformatorowych)",
        ),
        _ct_sn(
            "CT",
            "przekładnik prądowy pola transformatorowego",
            "1000/5/5/5/5 A (110/15 kV ≤ 25 MVA); 1600/5 A (110/15 kV 40 MVA); 800/5 A "
            "(110/20 kV ≤ 25 MVA); 1200/5 A (110/20 kV 40 MVA)",
            "I 10 VA kl. 0,2S FS5; II 10 VA kl. 0,2 FS5; III 15 VA kl. 5P20; IV 15 VA kl. 5P20",
            "rys. Z.7 (uwaga * przekładni)",
        ),
        _wskaznik("VI_KB", "wskaźnik obecności napięcia od strony kabla", "DOWNSTREAM", "rys. Z.7"),
        _ogranicznik_sn(
            "OGR",
            "ogranicznik przepięć strony SN transformatora (bez licznika zadziałań)",
            "§19 (ograniczniki po obu stronach transformatora), rys. Z.6 i Z.7",
        ),
    ),
    uwagi_pl="Głowica i kabel mostu transformatorowego należą do gałęzi kablowej, nie do gniazd pola.",
)


def _pole_liniowe_sn(
    id_: str,
    nazwa_pl: str,
    podstawa: str,
    srodek: tuple[GniazdoPola, ...],
    *,
    rysunek: str,
    wskaznik_szyny: bool,
    interpretacja_wskaznika: str | None = None,
) -> SzablonPolaStandardu:
    """Pole liniowe SN; ``rysunek`` — rysunek pola (Z.10, Z.11, Z.11.1), z którego pochodzą
    skład i kolejność gniazd (A3); zał. Z.2 wyznacza wyłącznie miejsce pola w rozdzielnicy."""
    poczatek: tuple[GniazdoPola, ...] = ()
    if wskaznik_szyny:
        wskaznik = _wskaznik(
            "VI_SZ", "wskaźnik obecności napięcia od strony szyny", "UPSTREAM", rysunek
        )
        if interpretacja_wskaznika:
            wskaznik = GniazdoPola(
                id=wskaznik.id,
                rodzaj=wskaznik.rodzaj,
                nazwa_pl=wskaznik.nazwa_pl,
                placement=wskaznik.placement,
                podstawa_pl=wskaznik.podstawa_pl,
                wymagania=wskaznik.wymagania,
                interpretacja_pl=interpretacja_wskaznika,
            )
        poczatek = (wskaznik,)
    return SzablonPolaStandardu(
        id=id_,
        nazwa_pl=nazwa_pl,
        role_pola=("OUT", "FEEDER"),
        podstawa_pl=_p(podstawa),
        gniazda=(
            *poczatek,
            _odlacznik_trojpolozeniowy("DS_ES", glowny=False, rysunek=rysunek),
            _wylacznik_sn(glowny=False, rysunek=rysunek),
            _uziemnik_sn("ES", "uziemnik po stronie kabla", rysunek),
            *srodek,
            _wskaznik(
                "VI_KB",
                "wskaźnik obecności napięcia od strony kabla",
                "DOWNSTREAM",
                f"{rysunek}, §13",
            ),
            _FERRANTI,
        ),
        uwagi_pl=(
            "Liczba pól liniowych w sekcji jest daną projektu (zał. Z.2: „liczba pól liniowych "
            "dostosowana do potrzeb”). Głowica kablowa i kabel należą do gałęzi kablowej."
        ),
    )


POLE_SN_LINIOWE = _pole_liniowe_sn(
    "ENEA_SN_LINIA",
    nazwa_roli_pola_sn_z_okresleniem("LINIA_OUT", "SN"),
    "zał. Z.2 (pola 15–32), zał. Z.10",
    (
        _ct_sn(
            "CT",
            "przekładnik prądowy pola liniowego",
            "200-400/5 A",
            "I 15 VA kl. 5P20",
            "rys. Z.10",
        ),
    ),
    rysunek="rys. Z.10",
    wskaznik_szyny=False,
)

POLE_SN_LINIOWE_POMIAR_ROZLICZENIOWY = _pole_liniowe_sn(
    "ENEA_SN_LINIA_POMIAR_ROZLICZENIOWY",
    nazwa_roli_pola_sn_z_okresleniem("LINIA_OUT", "SN z pomiarem energii rozliczeniowym (LINIA*)"),
    "zał. Z.2 (pola 11/12), zał. Z.11",
    (
        _vt_sn(
            "VT",
            "przekładnik napięciowy pomiaru rozliczeniowego (gniazdo wtykowe)",
            "U_n/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 kV",
            "I 0–10 VA kl. 0,2; II 7,5 VA kl. 0,2; III 7,5 VA kl. 0,5/3P",
            "rys. Z.11",
        ),
        _ct_sn(
            "CT",
            "przekładnik prądowy pomiaru rozliczeniowego",
            "200-400/5/5/5 A",
            "I 10 VA kl. 0,2S FS5; II 10 VA kl. 0,2 FS5; III 15 VA kl. 5P20",
            "rys. Z.11",
        ),
    ),
    rysunek="rys. Z.11",
    wskaznik_szyny=True,
)

POLE_SN_LINIOWE_POMIAR_NAPIECIA = _pole_liniowe_sn(
    "ENEA_SN_LINIA_POMIAR_NAPIECIA",
    nazwa_roli_pola_sn_z_okresleniem("LINIA_OUT", "SN z pomiarem napięcia zwrotnego (LINIA**)"),
    "zał. Z.2 (pola 13/14), zał. Z.11.1",
    (
        _vt_sn(
            "VT",
            "przekładnik napięciowy pomiaru napięcia zwrotnego (gniazdo wtykowe)",
            "U_n/√3 / 0,1/√3 / 0,1/√3 / 0,1/√3 kV",
            "I 0–10 VA kl. 0,2; II 7,5 VA kl. 0,2; III 7,5 VA kl. 0,5/3P",
            "rys. Z.11.1",
        ),
        _ct_sn(
            "CT",
            "przekładnik prądowy pola liniowego",
            "200-400/5 A",
            "I 15 VA kl. 5P20",
            "rys. Z.11.1",
        ),
    ),
    rysunek="rys. Z.11.1",
    wskaznik_szyny=True,
    interpretacja_wskaznika=(
        "rysunek Z.11.1 jest opisany „jak Z.11” — wskaźnik przy szynie przyjęty z Z.11; "
        "interpretacja rysunku"
    ),
)

_CT_LS_SN = _ct_sn(
    "CT",
    "przekładnik prądowy łącznika szyn",
    "1000/5/5 A (110/15 kV ≤ 25 MVA); 1600/5/5 A (40 MVA); 800/5/5 A (110/20 kV ≤ 25 MVA); "
    "1200/5/5 A (40 MVA)",
    "I 15 VA kl. 5P20 (I>, I>>); II 15 VA kl. 5P20 (ziemnozwarciowe)",
    "rys. Z.12 (uwaga * przekładni jak Z.7)",
)

POLE_SN_LACZNIKA_SZYN = SzablonPolaStandardu(
    id="ENEA_SN_LS",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("SPRZEGLO", "SN — łącznik szyn w jednej celi"),
    role_pola=("COUPLER",),
    podstawa_pl=_p("§13 (łącznik szyn w jednej celce), zał. Z.12"),
    gniazda=(
        _wskaznik(
            "VI_A", "wskaźnik obecności napięcia od strony sekcji A", "UPSTREAM", "rys. Z.12"
        ),
        _odlacznik_trojpolozeniowy(
            "DS_ES_A", glowny=True, rysunek="rys. Z.12", okreslenie="od strony sekcji A"
        ),
        _wylacznik_sn(glowny=True, rysunek="rys. Z.12"),
        _CT_LS_SN,
        # Tor elektryczny Z.12: sekcja A → odłącznik A → wyłącznik → przekładnik → odłącznik B
        # → sekcja B — odłącznik B leży za wyłącznikiem, po stronie sekcji B.
        _odlacznik_trojpolozeniowy(
            "DS_ES_B",
            glowny=True,
            rysunek="rys. Z.12",
            placement="DOWNSTREAM",
            okreslenie="od strony sekcji B",
        ),
        _wskaznik(
            "VI_B", "wskaźnik obecności napięcia od strony sekcji B", "DOWNSTREAM", "rys. Z.12"
        ),
    ),
)

_INTERPRETACJA_CEL = (
    "układ rozdzielnicy wg zał. Z.2: łącznik szyn w dwóch celach połączonych mostem (cela przy "
    "sekcji A bez wyłącznika, cela przy sekcji B z wyłącznikiem i przekładnikiem) — "
    "interpretacja rysunku; wyposażenie cel wg rysunku pola Z.12 (decyzja właściciela A3), "
    "rozdzielone na cele z zachowaniem toru Z.12: sekcja A → odłącznik A → wyłącznik → "
    "przekładnik → odłącznik B → sekcja B"
)

POLE_SN_LACZNIKA_SZYN_CELA_SPRZEGLA = SzablonPolaStandardu(
    id="ENEA_SN_LS_CELA_SPRZEGLA",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem(
        "SPRZEGLO", "SN — cela przy sekcji A, bez wyłącznika"
    ),
    role_pola=("COUPLER",),
    podstawa_pl=_p("§13 (łącznik szyn w dwóch celkach), zał. Z.2 (pola 1/2), zał. Z.12"),
    gniazda=(
        _wskaznik(
            "VI_SZ", "wskaźnik obecności napięcia od strony sekcji A", "UPSTREAM", "rys. Z.12"
        ),
        _odlacznik_trojpolozeniowy(
            "DS_ES", glowny=True, rysunek="rys. Z.12", okreslenie="od strony sekcji A"
        ),
    ),
    uwagi_pl=_INTERPRETACJA_CEL,
)

POLE_SN_LACZNIKA_SZYN_CELA_WYLACZNIKOWA = SzablonPolaStandardu(
    id="ENEA_SN_LS_CELA_WYLACZNIKOWA",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("SPRZEGLO", "SN — cela wyłącznikowa przy sekcji B"),
    role_pola=("COUPLER",),
    podstawa_pl=_p("§13 (łącznik szyn w dwóch celkach), zał. Z.2 (pola 1/2), zał. Z.12"),
    # Kolejność od szyny sekcji B (cela leży przy sekcji B): tor Z.12 czytany od strony B —
    # odłącznik B, przekładnik, wyłącznik, dalej most do celi sprzęgła.
    gniazda=(
        _wskaznik(
            "VI_SZ", "wskaźnik obecności napięcia od strony sekcji B", "UPSTREAM", "rys. Z.12"
        ),
        _odlacznik_trojpolozeniowy(
            "DS_ES", glowny=True, rysunek="rys. Z.12", okreslenie="od strony sekcji B"
        ),
        _CT_LS_SN,
        _wylacznik_sn(glowny=True, rysunek="rys. Z.12"),
    ),
    uwagi_pl=_INTERPRETACJA_CEL,
)


def _transformator_uziemiajacy(*, kompensowany: bool) -> GniazdoPola:
    """§16: wymagania transformatora uziemiającego są dwa zestawy — dla punktu neutralnego
    uziemionego przez rezystor i dla sieci skompensowanej (dodatkowo moc uzwojenia
    kompensującego i praca dorywcza 2 h)."""
    wspolne = (
        WymaganieGniazda("grupa_polaczen", "układ połączeń", "ROWNE", "ZNyn11", None, _p("§16")),
        WymaganieGniazda(
            "regulacja",
            "regulacja napięcia",
            "ROWNE",
            "trójstopniowa beznapięciowa ±5% po stronie SN, ręczny napęd przełącznika zaczepów",
            None,
            _p("§16"),
        ),
        WymaganieGniazda("chlodzenie", "chłodzenie", "ROWNE", "ONAN", None, _p("§16")),
        WymaganieGniazda(
            "u_nn_v", "napięcie znamionowe uzwojenia dolnego", "ROWNE", 400.0, "V", _p("§16")
        ),
        WymaganieGniazda(
            "s_nn_kva",
            "moc uzwojenia potrzeb własnych nn",
            "CO_NAJMNIEJ",
            100.0,
            "kVA",
            _p("§16 (dostosowana do bilansu mocy, nie mniejsza niż 100 kVA)"),
        ),
    )
    dodatkowe: tuple[WymaganieGniazda, ...] = ()
    if kompensowany:
        dodatkowe = (
            WymaganieGniazda(
                "moc_uzwojenia_kompensujacego",
                "moc uzwojenia kompensującego",
                "ROWNE",
                "dostosowana do wartości maksymalnej prądu dławika gaszącego",
                None,
                _p("§16 (sieć skompensowana)"),
            ),
            WymaganieGniazda(
                "tryb_pracy",
                "tryb pracy",
                "ROWNE",
                "praca dorywcza 2 h",
                None,
                _p("§16 (sieć skompensowana)"),
            ),
        )
    return GniazdoPola(
        id="TU",
        rodzaj="EARTHING_TRANSFORMER",
        nazwa_pl="transformator uziemiający z uzwojeniem potrzeb własnych nn",
        placement="DOWNSTREAM",
        podstawa_pl=_p("§16, rys. Z.13–Z.15"),
        wymagania=(*wspolne, *dodatkowe),
    )


def _gniazda_zu_wspolne(*, kompensowany: bool) -> tuple[GniazdoPola, ...]:
    return (
        _odlacznik_trojpolozeniowy("DS_ES", glowny=False, rysunek="rys. Z.13–Z.15"),
        _wylacznik_sn(glowny=False, rysunek="rys. Z.13–Z.15"),
        _ct_sn(
            "CT",
            "przekładnik prądowy pola zespołu uziemiającego",
            "100/5 A",
            "I 15 VA kl. 5P20",
            "rys. Z.13–Z.15",
        ),
        _ogranicznik_sn(
            "OGR", "ogranicznik przepięć stanowiska zespołu uziemiającego", "§19, rys. Z.13–Z.15"
        ),
        _transformator_uziemiajacy(kompensowany=kompensowany),
        _ogranicznik_sn(
            "N_OGR",
            "ogranicznik przepięć punktu neutralnego transformatora uziemiającego",
            "§16 (sieć skompensowana: ograniczniki przepięć), rys. Z.13–Z.15",
            punkt_neutralny=True,
        ),
    )


_ODLACZNIK_PUNKTU_NEUTRALNEGO_WYMAGANIA = (
    WymaganieGniazda(
        "naped",
        "napęd",
        "ROWNE",
        "ręczny",
        None,
        _p("§11.1 (odłączniki w stanowiskach zespołów uziemiających — napędy ręczne), §16"),
    ),
)


def _odlacznik_zu(id_: str, nazwa_pl: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="DS",
        nazwa_pl=nazwa_pl,
        placement="OFF_PATH",
        podstawa_pl=_p(podstawa),
        wymagania=_ODLACZNIK_PUNKTU_NEUTRALNEGO_WYMAGANIA,
        izolacja="PUNKT_NEUTRALNY",
    )


_DLAWIK = GniazdoPola(
    id="DL",
    izolacja="PUNKT_NEUTRALNY",
    rodzaj="NEUTRAL_REACTOR",
    nazwa_pl="dławik gaszący z regulacją nadążną",
    placement="OFF_PATH",
    podstawa_pl=_p("§16, rys. Z.13/Z.14"),
    wymagania=(
        WymaganieGniazda(
            "prad_regulacji_a",
            "zakres prądu dławika",
            "ROWNE",
            "minimum 40–400 A",
            None,
            _p("§16"),
        ),
        WymaganieGniazda(
            "zakres_regulacji_proc",
            "automatyczna płynna regulacja prądu kompensacyjnego",
            "ROWNE",
            "10–100 %",
            None,
            _p("§16"),
        ),
        WymaganieGniazda(
            "u_wt_v",
            "napięcie uzwojenia dodatkowego (wtórnego)",
            "ROWNE",
            "500 V ±10 %, obciążalność ≥ 500 A przez 60 s",
            None,
            _p("§16"),
        ),
        WymaganieGniazda(
            "przekladnik",
            "przekładnik prądowy dławika",
            "ROWNE",
            "przekładnia do zakresu 5 A, moc ≥ 15 VA, klasa ≥ 1",
            None,
            _p("§16"),
        ),
        WymaganieGniazda("chlodzenie", "chłodzenie", "ROWNE", "ONAN", None, _p("§16")),
        WymaganieGniazda(
            "tryb_pracy", "tryb pracy", "ROWNE", "praca dorywcza 2 h (KB 2)", None, _p("§16")
        ),
    ),
)

_REZYSTOR_WYMUSZAJACY = GniazdoPola(
    id="AWSC",
    izolacja="PUNKT_NEUTRALNY",
    rodzaj="NEUTRAL_RESISTOR",
    nazwa_pl="rezystor wymuszający AWSC (strona wtórna dławika)",
    placement="OFF_PATH",
    podstawa_pl=_p("§16, rys. Z.13"),
    wymagania=(
        WymaganieGniazda(
            "prad_wymuszany_a",
            "prąd wymuszany po stronie pierwotnej",
            "ROWNE",
            "20–40 A",
            None,
            _p("§16"),
        ),
    ),
    interpretacja_pl=(
        "ramka rezystora załączanego stycznikiem równolegle z dławikiem na rys. Z.13 odczytana "
        "jako AWSC z §16 — interpretacja rysunku"
    ),
)

_REZYSTOR = GniazdoPola(
    id="RZ",
    izolacja="PUNKT_NEUTRALNY",
    rodzaj="NEUTRAL_RESISTOR",
    nazwa_pl="rezystor uziemiający punktu neutralnego",
    placement="OFF_PATH",
    podstawa_pl=_p("§16, rys. Z.14/Z.15"),
    wymagania=(
        WymaganieGniazda("obudowa", "obudowa", "ROWNE", "z blach nierdzewnych", None, _p("§16")),
        WymaganieGniazda(
            "przekladnik",
            "przekładnik prądowy rezystora",
            "ROWNE",
            "przekładnia wg specyfikacji, skrzynka obwodu wtórnego na zewnątrz obudowy",
            None,
            _p("§16"),
        ),
    ),
)


def _ct_punktu_neutralnego(id_: str, nazwa_pl: str, podstawa: str) -> GniazdoPola:
    return GniazdoPola(
        id=id_,
        rodzaj="CT",
        nazwa_pl=nazwa_pl,
        placement="OFF_PATH",
        podstawa_pl=_p(podstawa),
        wymagania=(),
        izolacja="PUNKT_NEUTRALNY",
    )


POLE_SN_ZESPOLU_UZIEMIAJACEGO_DLAWIK = SzablonPolaStandardu(
    id="ENEA_SN_ZU_DLAWIK",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem(
        "UZIEMIAJACE", "SN — dławik z regulacją nadążną (sieć skompensowana)"
    ),
    role_pola=("EARTHING",),
    podstawa_pl=_p("§16 (sieć kablowo-napowietrzna: punkt neutralny przez dławik), zał. Z.13"),
    gniazda=(
        *_gniazda_zu_wspolne(kompensowany=True),
        _odlacznik_zu("DS_DL", "odłącznik dławika z napędem ręcznym", "§16, rys. Z.13"),
        _DLAWIK,
        _ct_punktu_neutralnego("CT_DL", "przekładnik prądowy gałęzi dławika", "rys. Z.13"),
        _REZYSTOR_WYMUSZAJACY,
    ),
)

POLE_SN_ZESPOLU_UZIEMIAJACEGO_ROWNOLEGLY = SzablonPolaStandardu(
    id="ENEA_SN_ZU_DLAWIK_REZYSTOR",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem(
        "UZIEMIAJACE", "SN — układ równoległy dławik ‖ rezystor"
    ),
    role_pola=("EARTHING",),
    podstawa_pl=_p("§16 (uzasadnione przypadki: układ równoległy rezystor–dławik), zał. Z.14"),
    gniazda=(
        *_gniazda_zu_wspolne(kompensowany=True),
        _odlacznik_zu("DS_DL", "odłącznik gałęzi dławika", "rys. Z.14"),
        _DLAWIK,
        _odlacznik_zu("DS_RZ", "odłącznik gałęzi rezystora", "rys. Z.14"),
        _REZYSTOR,
        _ct_punktu_neutralnego("CT_RZ", "przekładnik prądowy gałęzi rezystora", "rys. Z.14"),
    ),
)

POLE_SN_ZESPOLU_UZIEMIAJACEGO_REZYSTOR = SzablonPolaStandardu(
    id="ENEA_SN_ZU_REZYSTOR",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("UZIEMIAJACE", "SN — rezystor (sieć kablowa)"),
    role_pola=("EARTHING",),
    podstawa_pl=_p("§16 (sieć kablowa: punkt neutralny przez rezystor), zał. Z.15"),
    gniazda=(
        *_gniazda_zu_wspolne(kompensowany=False),
        _odlacznik_zu("DS_RZ", "odłącznik rezystora", "rys. Z.15"),
        _REZYSTOR,
        _ct_punktu_neutralnego("CT_RZ", "przekładnik prądowy gałęzi rezystora", "rys. Z.15"),
    ),
)

POLE_SN_BKR = SzablonPolaStandardu(
    id="ENEA_SN_BKR",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("KOMPENSACYJNE", "SN — baterie równoległe (BKR)"),
    role_pola=("CAPACITOR",),
    podstawa_pl=_p("§17, zał. Z.2 (pola 3/4), zał. Z.16"),
    gniazda=(
        _odlacznik_trojpolozeniowy("DS_ES", glowny=False, rysunek="rys. Z.16"),
        _wylacznik_sn(glowny=False, rysunek="rys. Z.16"),
        _ct_sn(
            "CT",
            "przekładnik prądowy pola BKR",
            "100/5/5/5 A",
            "I 10 VA kl. 0,2S FS5; II 15 VA kl. 5P20; III 15 VA kl. 5P20",
            "rys. Z.16",
        ),
        _wskaznik(
            "VI_KB", "wskaźnik obecności napięcia od strony kabla", "DOWNSTREAM", "rys. Z.16"
        ),
        _ogranicznik_sn("OGR", "ogranicznik przepięć stanowiska BKR", "§19, rys. Z.16"),
        _vt_sn(
            "VT_L1L2",
            "przekładnik napięciowy rozładowczy L1–L2 (międzyfazowy)",
            "U_n/0,1 kV",
            "kl. 3P",
            "§17, rys. Z.16",
        ),
        _vt_sn(
            "VT_L2L3",
            "przekładnik napięciowy rozładowczy L2–L3 (międzyfazowy)",
            "U_n/0,1 kV",
            "kl. 3P",
            "§17, rys. Z.16",
        ),
        GniazdoPola(
            id="BK",
            rodzaj="CAPACITOR_BANK",
            nazwa_pl="bateria kondensatorów w układzie podwójnej gwiazdy",
            placement="DOWNSTREAM",
            podstawa_pl=_p("§17, rys. Z.16"),
            wymagania=(
                WymaganieGniazda(
                    "uklad", "układ połączeń", "ROWNE", "podwójna gwiazda", None, _p("§17")
                ),
                WymaganieGniazda(
                    "q_ogniwa_kvar",
                    "moc znamionowa jednego ogniwa",
                    "CO_NAJMNIEJ",
                    100.0,
                    "kvar",
                    _p("§17"),
                ),
                WymaganieGniazda(
                    "jednostki",
                    "jednostki kondensatorowe",
                    "ROWNE",
                    "jednofazowe, dwubiegunowo izolowane, z nietoksycznym impregnatem",
                    None,
                    _p("§17"),
                ),
            ),
        ),
        GniazdoPola(
            id="CT_N",
            rodzaj="CT",
            nazwa_pl="przekładnik prądowy niezrównoważenia (połączenie międzygwiazdowe)",
            placement="OFF_PATH",
            podstawa_pl=_p("§17, rys. Z.16"),
        ),
    ),
)

POLE_SN_POMIAROWE = SzablonPolaStandardu(
    id="ENEA_SN_POMIAR",
    nazwa_pl=nazwa_roli_pola_sn_z_okresleniem("POMIAROWE", "SN — pomiar napięcia szyn"),
    role_pola=("MEASUREMENT",),
    podstawa_pl=_p("§13 (pole pomiaru napięcia w każdej sekcji), zał. Z.2 (pola 9/10), zał. Z.17"),
    gniazda=(
        _odlacznik_trojpolozeniowy("DS_ES", glowny=False, rysunek="rys. Z.17"),
        _wskaznik("VI", "wskaźnik obecności napięcia", "MIDSTREAM", "rys. Z.17"),
        _vt_sn(
            "VT",
            "przekładnik napięciowy pomiaru napięcia szyn (złącze wtykowe)",
            _VT_POLA_SN_PRZEKLADNIA,
            "I 0–10 VA kl. 0,2; II 15 VA kl. 0,5/3P; III 15 VA kl. 3P",
            "rys. Z.17",
        ),
    ),
    uwagi_pl="Pole bez wyłącznika (rys. Z.17); bezpieczników po stronie pierwotnej przekładnika brak.",
)

#: Rejestr szablonów — JEDYNE wyliczenie (pola rozdzielnicy SN, kolejność wg zał. Z.2).
SZABLONY_POL_STANDARDU: dict[str, SzablonPolaStandardu] = {
    s.id: s
    for s in (
        POLE_SN_LACZNIKA_SZYN,
        POLE_SN_LACZNIKA_SZYN_CELA_SPRZEGLA,
        POLE_SN_LACZNIKA_SZYN_CELA_WYLACZNIKOWA,
        POLE_SN_BKR,
        POLE_SN_ZESPOLU_UZIEMIAJACEGO_DLAWIK,
        POLE_SN_ZESPOLU_UZIEMIAJACEGO_ROWNOLEGLY,
        POLE_SN_ZESPOLU_UZIEMIAJACEGO_REZYSTOR,
        POLE_SN_TRANSFORMATOROWE,
        POLE_SN_POMIAROWE,
        POLE_SN_LINIOWE_POMIAR_ROZLICZENIOWY,
        POLE_SN_LINIOWE_POMIAR_NAPIECIA,
        POLE_SN_LINIOWE,
    )
}

#: Szablony pól liniowych SN do wyboru projektanta (zał. Z.2: LINIA, LINIA*, LINIA**).
SZABLONY_POL_LINIOWYCH_SN: tuple[str, ...] = (
    POLE_SN_LINIOWE.id,
    POLE_SN_LINIOWE_POMIAR_ROZLICZENIOWY.id,
    POLE_SN_LINIOWE_POMIAR_NAPIECIA.id,
)

#: Wariant pola zespołu uziemiającego wg sposobu uziemienia punktu neutralnego (§16).
SZABLONY_POL_ZU_SN: tuple[str, ...] = (
    POLE_SN_ZESPOLU_UZIEMIAJACEGO_REZYSTOR.id,
    POLE_SN_ZESPOLU_UZIEMIAJACEGO_DLAWIK.id,
    POLE_SN_ZESPOLU_UZIEMIAJACEGO_ROWNOLEGLY.id,
)


def szablon_pola_standardu(ref: object) -> SzablonPolaStandardu | None:
    """Szablon pola standardu po identyfikatorze (``None`` — spoza rejestru)."""
    return SZABLONY_POL_STANDARDU.get(ref) if isinstance(ref, str) else None
