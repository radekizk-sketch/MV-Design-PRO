"""JEDNA taksonomia walidacji — dwie ORTOGONALNE osie.

KOD BADAWCZY — patrz `backend/research/README.md`.

DLACZEGO POWSTAŁ TEN MODUŁ. Laboratorium miało dwie sprzeczne definicje „poziomu
4": ``benchmarki.py`` nazywał tak *sieć SN z DER* (złożoność przypadku), a
``wzorzec_zewnetrzny.py`` nazywał tak *porównanie z ANDES* (rodzaj wyroczni).
Ten sam identyfikator znaczył dwie różne rzeczy, więc zdanie „przypadek na
poziomie 4" nie niosło informacji. Komentarz tego nie naprawia — naprawia to
jeden zbiór identyfikatorów.

DLACZEGO DWIE OSIE, A NIE JEDNA DŁUŻSZA DRABINA. Bo te wymiary są niezależne:
ten sam przypadek fizyczny (SMIB) bywa sprawdzany na czterech różnych poziomach
dowodowych — od testu kształtu, przez własność metamorficzną i wzór analityczny,
po narzędzie zewnętrzne. Sklejenie ich w jeden ciąg wymusiłoby wybór, który z
dwóch wymiarów zignorować; audyt (§28) pokazał, co się dzieje, gdy się je myli:
84 % produkcyjnych testów dynamicznych sprawdzało wyłącznie kształt kontraktu,
a całość raportowano jako działającą.

Oś **C** (*case*) mówi, CO liczymy. Oś **W** (*wyrocznia*) mówi, WOBEC CZEGO
sprawdzamy, że wynik jest poprawny. Test ma zawsze parę ``(C, W)``.

Taksonomia jest **neutralna architektonicznie**: nie przesądza ani rdzenia, ani
kontraktu, ani wyboru narzędzia wzorcowego. To wyłącznie sposób nazywania
dowodów, żeby dwa różne dowody nie nosiły tej samej etykiety.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class ZlozonoscPrzypadku(StrEnum):
    """Oś C — złożoność przypadku fizycznego (co jest liczone)."""

    C0_JEDNO_ROWNANIE = "C0"
    """Pojedyncze równanie / transformacja bez sieci (konwencje dq, integrator)."""

    C1_MASZYNA_NA_SZYNIE_SZTYWNEJ = "C1"
    """SMIB: jedno urządzenie, jedna gałąź, szyna sztywna."""

    C2_WIELE_URZADZEN = "C2"
    """Co najmniej dwa urządzenia dzielące sieć — sprawdza INTERAKCJĘ."""

    C3_ZDARZENIE_ZMIENIAJACE_SIEC = "C3"
    """Zwarcie / wyłączenie gałęzi — zdarzenie zmienia model, nie napięcie."""

    C4_SIEC_SN_Z_DER = "C4"
    """Sieć SN zdominowana przez źródła przekształtnikowe (przypadek produktu)."""


class PoziomWyroczni(StrEnum):
    """Oś W — wobec czego sprawdzamy poprawność (jak mocny jest dowód)."""

    W0_KSZTALT = "W0"
    """Test kontraktu/kształtu: czy się wykonuje, czy pola są. NIE dowodzi fizyki."""

    W1_WLASNOSC = "W1"
    """Własność metamorficzna: „zmiana X musi zmienić Y w tę stronę".

    Silniejsze od W0, bo wykrywa brak fizyki (np. wynik niezależny od urządzenia),
    ale nie orzeka o WARTOŚCI — model może być konsekwentnie przesunięty.
    """

    W2_WYROCZNIA_ANALITYCZNA = "W2"
    """Zamknięty wzór wyprowadzony niezależnie od implementacji.

    Orzeka o wartości. Ryzyko resztkowe: wzór i model mogą dzielić ten sam błąd
    koncepcyjny, bo autor jest ten sam.
    """

    W3_WYROCZNIA_ZEWNETRZNA = "W3"
    """Niezależne narzędzie o własnej implementacji równań (np. ANDES).

    Najmocniejszy dostępny poziom. Ryzyko resztkowe: **mapowanie parametrów**
    do narzędzia piszemy my, więc wspólny błąd interpretacji wejścia nadal jest
    możliwy — dlatego W3 nie jest tożsame z „udowodnione".
    """


@dataclass(frozen=True)
class PozycjaDrabiny:
    """Jeden dowód: co liczy, wobec czego sprawdza, czym jest realizowany."""

    identyfikator: str
    zlozonosc: ZlozonoscPrzypadku
    wyrocznia: PoziomWyroczni
    opis_pl: str
    realizacja: str
    """Nazwa funkcji/testu, który ten dowód wykonuje."""

    @property
    def etykieta(self) -> str:
        """Np. ``C1/W3`` — jednoznacznie, bez kolizji „poziomu 4"."""
        return f"{self.zlozonosc.value}/{self.wyrocznia.value}"


#: Rejestr dowodów laboratorium. Lista jest ZAMKNIĘTA — pilnuje jej
#: `tests/research/test_drabina.py`, więc nowy dowód wymaga świadomego wpisu,
#: a nie tylko nowego testu gdzieś obok.
DRABINA: tuple[PozycjaDrabiny, ...] = (
    PozycjaDrabiny(
        identyfikator="konwencje-dq",
        zlozonosc=ZlozonoscPrzypadku.C0_JEDNO_ROWNANIE,
        wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
        opis_pl="Transformacja dq daje kanoniczne Pe = E'·V·sin(δ−θ)/X'd",
        realizacja="test_konwencja_dq_daje_kanoniczne_pe",
    ),
    PozycjaDrabiny(
        identyfikator="integratory-zbieznosc",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl="Wszystkie integratory zbiegają na wspólnym zadaniu odniesienia",
        realizacja="test_wszystkie_integratory_zbiegaja_na_zadaniu_referencyjnym",
    ),
    PozycjaDrabiny(
        identyfikator="wahania-malosygnalowe",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
        opis_pl="Częstotliwość wahań = √(ω_s·Ps/2H) z linearyzacji",
        realizacja="test_czestotliwosc_wahan_zgadza_sie_z_wyrocznia",
    ),
    PozycjaDrabiny(
        identyfikator="punkt-pracy-i-wahania-andes",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA,
        opis_pl="δ0, E', V oraz częstotliwość wahań wobec wartości własnych ANDES",
        realizacja="tests/research/test_wzorzec_zewnetrzny.py",
    ),
    PozycjaDrabiny(
        identyfikator="interakcja-dwoch-maszyn",
        zlozonosc=ZlozonoscPrzypadku.C2_WIELE_URZADZEN,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl="Dwie maszyny dzielące sieć oddziałują na siebie",
        realizacja="test_maszyny_oddzialuja_na_siebie",
    ),
    PozycjaDrabiny(
        identyfikator="cct-rowne-pola",
        zlozonosc=ZlozonoscPrzypadku.C3_ZDARZENIE_ZMIENIAJACE_SIEC,
        wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
        opis_pl="Czas krytyczny zwarcia wobec kryterium równych pól (H = 1…16 s)",
        realizacja="tests/research/test_cct_wyrocznia.py",
    ),
    PozycjaDrabiny(
        identyfikator="zdarzenie-zmienia-siec",
        zlozonosc=ZlozonoscPrzypadku.C3_ZDARZENIE_ZMIENIAJACE_SIEC,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl="Miejsce, głębokość i czas trwania zwarcia zmieniają wynik",
        realizacja="test_zdarzenie_na_wskazanej_szynie_ma_znaczenie",
    ),
    PozycjaDrabiny(
        identyfikator="der-rozroznialne",
        zlozonosc=ZlozonoscPrzypadku.C4_SIEC_SN_Z_DER,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl="GFL i GFM dają różne trajektorie; parametry urządzenia zmieniają wynik",
        realizacja="test_gfm_i_gfl_roznia_sie_trajektoria",
    ),
    PozycjaDrabiny(
        identyfikator="sztywnosc-widmo-i-krok-graniczny",
        zlozonosc=ZlozonoscPrzypadku.C2_WIELE_URZADZEN,
        wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
        opis_pl=("Wskaźnik sztywności 4,3·10³; najszybsze wartości własne = −1/T pętli prądowej"),
        realizacja="test_najszybsze_wartosci_wlasne_zgadzaja_sie_z_odwrotnoscia_stalej_czasowej",
    ),
    PozycjaDrabiny(
        identyfikator="sztywnosc-a-stabilnosc",
        zlozonosc=ZlozonoscPrzypadku.C2_WIELE_URZADZEN,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl=(
            "Przyspieszenie pętli prądowej skraca krok graniczny metod jawnych, "
            "nie zmieniając niejawnych"
        ),
        realizacja="test_zaostrzenie_petli_pradowej_skraca_krok_jawny_a_nie_niejawny",
    ),
    PozycjaDrabiny(
        identyfikator="magazyn-energia-ogranicza-wsparcie",
        zlozonosc=ZlozonoscPrzypadku.C4_SIEC_SN_Z_DER,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl=(
            "Magazyn o małej pojemności przestaje wspierać częstotliwość po wyczerpaniu "
            "okna SOC, o dużej — nie (iloczyn: pojemność × głębokość zapadu)"
        ),
        realizacja="test_mala_pojemnosc_przestaje_wspierac_czestotliwosc",
    ),
    PozycjaDrabiny(
        identyfikator="dwustronnie-zasilana-vs-falownik",
        zlozonosc=ZlozonoscPrzypadku.C4_SIEC_SN_Z_DER,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl=(
            "Maszyna dwustronnie zasilana i falownik pełnomocowy dają na tym samym "
            "zwarciu różny prąd, różny zapad napięcia i różny przebieg mocy"
        ),
        realizacja="test_maszyna_dwustronnie_zasilana_i_falownik_daja_rozne_prady_zwarciowe",
    ),
    PozycjaDrabiny(
        identyfikator="mapowanie-na-przypadku-natywnym",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA,
        opis_pl=(
            "Interpretacja pól M/xd1/fn/D odtwarza wartość własną przypadku "
            "AUTORSTWA ANDES (cases/smib/SMIB.xlsx) — walidacja mapowania, nie fizyki"
        ),
        realizacja="tests/research/test_wzorzec_natywny.py",
    ),
    PozycjaDrabiny(
        identyfikator="dynamika-4-rzedu-andes-genrou",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA,
        opis_pl=(
            "Punkt pracy i PEŁNE widmo modelu 4. rzędu (Td0', Tq0', sprzężenie E' "
            "z prądem) wobec ANDES GENROU zredukowanego do dwuosiowego"
        ),
        realizacja="tests/research/test_wzorzec_genrou.py",
    ),
    PozycjaDrabiny(
        identyfikator="regulatory-andes-sexs-tgov1",
        zlozonosc=ZlozonoscPrzypadku.C1_MASZYNA_NA_SZYNIE_SZTYWNEJ,
        wyrocznia=PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA,
        opis_pl=(
            "AVR i governor — część wspólna z ANDES SEXS i TGOV1 (lead-lag "
            "unieczynniony, ograniczniki nieaktywne, więc anti-windup poza zakresem)"
        ),
        realizacja="tests/research/test_wzorzec_genrou.py",
    ),
    PozycjaDrabiny(
        identyfikator="ogranicznik-gfm-kres-analityczny",
        zlozonosc=ZlozonoscPrzypadku.C0_JEDNO_ROWNANIE,
        wyrocznia=PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA,
        opis_pl=(
            "Kres prądu ogranicznika impedancyjnego GFM = max(i_max, |Z_w|/k), "
            "wyprowadzony ze znaku g'(y); próg twardości k* = |Z_w|/i_max = 0,125277"
        ),
        realizacja="test_kres_gorny_impedancji_wirtualnej_zgadza_sie_z_wyprowadzeniem",
    ),
    PozycjaDrabiny(
        identyfikator="ogranicznik-pradu-gfm",
        zlozonosc=ZlozonoscPrzypadku.C4_SIEC_SN_Z_DER,
        wyrocznia=PoziomWyroczni.W1_WLASNOSC,
        opis_pl=(
            "Ogranicznik prądu GFM (impedancja wirtualna vs nasycenie zadania) ścina prąd "
            "zwarciowy, osłabia sztywność napięciową i skraca zwarcie, po którym falownik "
            "zachowuje synchronizm"
        ),
        realizacja="test_ogranicznik_skraca_najdluzsze_zwarcie_z_synchronizmem",
    ),
)


def pozycje_o_wyroczni(poziom: PoziomWyroczni) -> tuple[PozycjaDrabiny, ...]:
    return tuple(p for p in DRABINA if p.wyrocznia is poziom)


def podsumowanie() -> str:
    """Tabela do meldunku — żeby nie przepisywać jej ręcznie i nie rozjechać."""
    wiersze = ["| Etykieta | Dowód | Realizacja |", "|---|---|---|"]
    wiersze += [
        f"| `{p.etykieta}` | {p.opis_pl} | `{p.realizacja}` |"
        for p in sorted(DRABINA, key=lambda q: (q.zlozonosc.value, q.wyrocznia.value))
    ]
    return "\n".join(wiersze)
