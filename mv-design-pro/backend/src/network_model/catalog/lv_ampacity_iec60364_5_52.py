"""Zestawy wspolczynnikow korekcyjnych obciazalnosci Iz' kabli nN wg PN-HD 60364-5-52.

Karta P0.2 (docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.2, luka G-08/G-D1 —
docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md).

DLACZEGO TEN MODUL POWSTAL. Obciazalnosc katalogowa kabla nN (`LVCableType.i_max_a`)
obowiazuje dla WARUNKOW ODNIESIENIA producenta (temperatura otoczenia, metoda ulozenia,
brak grupowania). W rzeczywistej instalacji warunki sa inne, a obciazalnosc skorygowana
Iz' = Iz * f_temperatura * f_grupowanie * f_grunt jest zwykle MNIEJSZA — norma
PN-HD 60364-5-52 definiuje wspolczynniki korekcyjne per metoda instalacji (A1...F).

ZASADA TEGO MODULU (wzorzec: `network_model.solvers.cable_ampacity_derating`, ktory
realizuje analogiczna korekte dla kabli SN — `ZIEMIA_3_KABLE_200MM` ma podstawe
dokumentowa). Wspolczynnik pochodzi WYLACZNIE z nazwanego zestawu o UDOKUMENTOWANEJ
podstawie. Repozytorium NIE zawiera tablic normy PN-HD 60364-5-52 odtworzonych z
pamieci — G-D1 pozostaje jawnym brakiem danych do czasu zasilenia tablicami normy z
proweniencja (numer wydania, tabela, strona). BEZ FABRYKACJI: zgadniecie wspolczynnika
zamienia dobor przewodu w liczbe bez podstawy.

Domyslnie obowiazuje zestaw "warunki_katalogowe" (iloczyn 1,0x), wiec obecnosc tego
modulu NIE zmienia zadnego dotychczasowego wyniku — zmienia sie tylko to, ze zalozenie
"brak korekty" staje sie JAWNE w sladzie WHITE BOX zamiast byc niejawnym domyslem.

STRUKTURA (rejestr `ZESTAWY_KOREKT_IZ_NN`) jest gotowa PRZED danymi: kolejne zestawy
metod instalacji (A1, A2, B1, B2, C, D1, D2, E, F wg PN-HD 60364-5-52 Tabela B.52.1 i
nastepne) dokladane sa TU, z polem `podstawa_dokumentowa` wskazujacym wydanie normy i
numer tablicy — nigdy jako wartosc bez zrodla.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ZestawKorektIz:
    """Zestaw wspolczynnikow korekcyjnych obciazalnosci dlugotrwalej kabla nN.

    Zgodnie z PN-HD 60364-5-52: obciazalnosc skorygowana

        Iz' = Iz_katalogowe * f_temperatura * f_grupowanie * f_grunt

    gdzie kazdy wspolczynnik zalezy od metody ulozenia (`metoda_instalacji`,
    oznaczenia normy: A1, A2, B1, B2, C, D1, D2, E, F...). Kazdy zestaw MUSI
    podac `podstawa_dokumentowa` — norme/wydanie/tablice, z ktorej pochodzi.
    """

    id: str
    opis: str
    metoda_instalacji: str
    f_temperatura: float
    f_grupowanie: float
    f_grunt: float
    podstawa_dokumentowa: str

    def __post_init__(self) -> None:
        for pole, wartosc in (
            ("f_temperatura", self.f_temperatura),
            ("f_grupowanie", self.f_grupowanie),
            ("f_grunt", self.f_grunt),
        ):
            if not 0.0 < wartosc <= 1.5:
                raise ValueError(
                    f"Wspolczynnik {pole} musi lezec w zakresie (0; 1,5] — " f"otrzymano {wartosc}."
                )

    @property
    def iloczyn(self) -> float:
        """Sumaryczny wspolczynnik korekcyjny obciazalnosci Iz'/Iz."""
        return self.f_temperatura * self.f_grupowanie * self.f_grunt

    @property
    def bez_korekty(self) -> bool:
        """Czy zestaw odpowiada warunkom katalogowym (brak korekty)."""
        return self.f_temperatura == 1.0 and self.f_grupowanie == 1.0 and self.f_grunt == 1.0

    def zalozenie_pl(self) -> str:
        """Jedno zdanie do sladu WHITE BOX — co przyjeto i skad."""
        if self.bez_korekty:
            return (
                "Obciążalność Iz przyjęta dla WARUNKÓW KATALOGOWYCH (bez korekty "
                "ułożenia); w rzeczywistej instalacji może być mniejsza."
            )
        return (
            f"Obciążalność skorygowana dla metody instalacji {self.metoda_instalacji} "
            f"({self.opis}); f_temperatura = {self.f_temperatura:g}, "
            f"f_grupowanie = {self.f_grupowanie:g}, f_grunt = {self.f_grunt:g}, "
            f"iloczyn = {self.iloczyn:.4f}. Podstawa: {self.podstawa_dokumentowa}."
        )


# ---------------------------------------------------------------------------
# Nazwany zestaw bez korekty — jedyny zasilony w P0.2 (dane G-D1 poza zakresem)
# ---------------------------------------------------------------------------

ID_WARUNKI_KATALOGOWE = "warunki_katalogowe"

WARUNKI_KATALOGOWE = ZestawKorektIz(
    id=ID_WARUNKI_KATALOGOWE,
    opis="Warunki katalogowe (bez korekty)",
    metoda_instalacji="ODNIESIENIE",
    f_temperatura=1.0,
    f_grupowanie=1.0,
    f_grunt=1.0,
    podstawa_dokumentowa=(
        "Obciążalność znamionowa z karty katalogowej producenta (warunki odniesienia)."
    ),
)

# G-D1 (docs/nn/G_MACIERZ_LUK_BACKENDU_NN.md): rejestr docelowy tablic
# PN-HD 60364-5-52 (metody instalacji A1...F, temperatura otoczenia,
# grupowanie obwodow, rezystywnosc cieplna gruntu). Poza `WARUNKI_KATALOGOWE`
# rejestr jest PUSTY do czasu zasilenia danymi normy z proweniencja — kazdy
# kolejny wpis wymaga `podstawa_dokumentowa` wskazujacej wydanie i tablice
# normy. Wypelnianie z pamieci jest zakazane (zasada zero fabrykacji).
ZESTAWY_KOREKT_IZ_NN: dict[str, ZestawKorektIz] = {
    WARUNKI_KATALOGOWE.id: WARUNKI_KATALOGOWE,
}

# Powod, dla ktorego rejestr jest krotki — zapisany w kodzie, zeby nie
# wygladal na przeoczenie.
OGRANICZENIE_ZESTAWOW_PL = (
    "Rejestr zawiera wyłącznie zestawy o udokumentowanej podstawie w tym repozytorium. "
    "Tablice metod instalacji PN-HD 60364-5-52 (A1...F) wymagają zasilenia danymi normy "
    "z proweniencją (G-D1) — system nie fabrykuje współczynników z pamięci."
)


def zestaw_korekt(id_zestawu: str) -> ZestawKorektIz:
    """Zestaw wspolczynnikow po identyfikatorze. ``ValueError`` dla nieznanego (fail-closed)."""
    zestaw = ZESTAWY_KOREKT_IZ_NN.get(id_zestawu)
    if zestaw is None:
        dostepne = ", ".join(sorted(ZESTAWY_KOREKT_IZ_NN))
        raise ValueError(
            f"Nieznany zestaw korekt Iz' nN: {id_zestawu}. Dostępne: {dostepne}. "
            f"{OGRANICZENIE_ZESTAWOW_PL}"
        )
    return zestaw


def obciazalnosc_skorygowana(obciazalnosc_katalogowa_a: float, zestaw: ZestawKorektIz) -> float:
    """Iz' = Iz * f_temperatura * f_grupowanie * f_grunt."""
    if obciazalnosc_katalogowa_a <= 0.0:
        raise ValueError("Obciążalność katalogowa musi być dodatnia.")
    return obciazalnosc_katalogowa_a * zestaw.iloczyn


def widok_zestawow() -> dict[str, object]:
    """Dane dla warstwy prezentacji: lista zestawow + powod krotkiego rejestru.

    Jedno zrodlo prawdy — warstwa UI/analizy nie utrzymuje wlasnej listy
    wspolczynnikow (sa danymi doborowymi, nie tekstem interfejsu).
    """
    return {
        "sets": [
            {
                "id": zestaw.id,
                "label_pl": zestaw.opis,
                "installation_method": zestaw.metoda_instalacji,
                "f_temperature": zestaw.f_temperatura,
                "f_grouping": zestaw.f_grupowanie,
                "f_ground": zestaw.f_grunt,
                "total": zestaw.iloczyn,
                "basis": zestaw.podstawa_dokumentowa,
                "assumption_pl": zestaw.zalozenie_pl(),
            }
            for zestaw in sorted(ZESTAWY_KOREKT_IZ_NN.values(), key=lambda item: item.id)
        ],
        "default_id": ID_WARUNKI_KATALOGOWE,
        "limitation_pl": OGRANICZENIE_ZESTAWOW_PL,
    }
