"""Kampania mutacyjna — czy detektory laboratorium wykrywają ZMIANĘ W KODZIE.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

PO CO. Zielony zestaw testów dowodzi, że kod robi to, czego testy żądają. NIE
dowodzi, że testy żądają czegokolwiek istotnego. Mutacja wprowadza ZNANY defekt
i sprawdza, czy którykolwiek mechanizm go zauważy. Mutacja, która PRZEŻYŁA, jest
luką kwalifikacji — nie ciekawostką.

DLACZEGO TA WERSJA POWSTAŁA (audyt niezależny, plan naprawy §4). Poprzednia
kampania meldowała „16/16 zabitych", a jej mutacje NIE ZMIENIAŁY KODU: sprawdzały
typy wyjątków (``issubclass(NiezgodnaDlugoscPrzebieguError, ValueError)``), wartości
wyliczeń i etykiety. Zarzut audytu był sprawdzalny wprost: po usunięciu walidacji
wyniku albo po zastąpieniu odcisku implementacji stałym SHA kampania NADAL
meldowała 16/16 — bo żadna mutacja tych miejsc nie dotykała.

CZYM JEST MUTACJA W TEJ WERSJI. Podmianą REALNIE WYKONYWANEGO kodu laboratorium
(metody, funkcji) na wersję z nazwanym defektem, na czas jednego przebiegu
SOND — czyli konkretnych testów laboratorium, które mają ten defekt złapać.
Mutacja jest ZABITA, gdy sondy padają pod mutacją.

KONTROLA BAZOWA JEST CZĘŚCIĄ POMIARU, NIE DODATKIEM. Przed każdą mutacją te same
sondy są uruchamiane na kodzie NIEZMUTOWANYM. Sonda, która pada także bez
mutacji, nie dowodzi niczego o detektorze — dowodzi, że jest zepsuta. Bez tej
kontroli „detektor" zwracający zawsze porażkę zabijałby komplet mutacji i dawał
100 % przy zerowej wartości poznawczej.

CZTERY WYNIKI, NIE DWA:
- ``ZABITA``            sondy przeszły bez mutacji i padły pod mutacją,
- ``PRZEZYLA``          sondy przeszły RÓWNIEŻ pod mutacją — luka kwalifikacji,
- ``SONDA_NIEWIARYGODNA`` sondy padły już bez mutacji — pomiar nieważny,
- ``BLAD_WYKONANIA``    przebieg sond nie doszedł do skutku (np. brak pliku).

Żaden z trzech ostatnich NIE JEST zabiciem.
"""

from __future__ import annotations

import traceback
from collections.abc import Callable, Iterable
from contextlib import AbstractContextManager
from dataclasses import dataclass, field
from enum import StrEnum


class WynikMutacji(StrEnum):
    ZABITA = "ZABITA"
    PRZEZYLA = "PRZEZYLA"
    SONDA_NIEWIARYGODNA = "SONDA_NIEWIARYGODNA"
    BLAD_WYKONANIA = "BLAD_WYKONANIA"


class KlasaDefektu(StrEnum):
    """Do czego mutacja się odnosi — wymiar SPRAWOZDAWCZY, nie bramka."""

    FIZYKA = "FIZYKA"
    NUMERYKA = "NUMERYKA"
    KONTRAKT = "KONTRAKT"
    TOZSAMOSC = "TOZSAMOSC"


#: Klasy, w których przeżycie mutacji jest LUKĄ KWALIFIKACJI.
#:
#: KOREKTA (plan naprawy §4). Poprzednia wersja obejmowała wyłącznie FIZYKĘ i
#: NUMERYKĘ, więc przeżycie mutacji KONTRAKTU albo TOŻSAMOŚCI nie wpływało na
#: gotowość. To automatyczne wyłączenie jest dokładnie tym, czego audyt zakazał:
#: kontrakt wyniku i odcisk implementacji są mechanizmami, na których opiera się
#: całe twierdzenie „ten wynik pochodzi z tego kodu i da się go podważyć".
#: Zbiór jest wymieniony JAWNIE (nie liczony dopełnieniem), a jego kompletność
#: pinuje `test_kazda_klasa_defektu_liczy_sie_do_gotowosci`.
KLASY_KRYTYCZNE: frozenset[KlasaDefektu] = frozenset(
    {
        KlasaDefektu.FIZYKA,
        KlasaDefektu.NUMERYKA,
        KlasaDefektu.KONTRAKT,
        KlasaDefektu.TOZSAMOSC,
    }
)


@dataclass(frozen=True)
class WynikSondy:
    """Wynik jednego przebiegu sond: czy przeszły i co zostało zapisane."""

    przeszly: bool
    slad: str
    polecenie: str
    """Polecenie ODTWARZAJĄCE ten przebieg — bez niego raport nie jest sprawdzalny."""


@dataclass(frozen=True)
class Mutacja:
    """Jeden nazwany defekt: CO podmieniamy i KTÓRE sondy mają to złapać."""

    ident: str
    opis: str
    klasa: KlasaDefektu
    zakres: str
    """Podmieniany element kodu, np. ``dynamic_lab.wynik.WynikDynamiczny.__post_init__``."""
    oczekiwany_detektor: str
    sondy: tuple[str, ...]
    """Identyfikatory testów (węzły pytest), które mają PAŚĆ pod mutacją."""
    zastosuj: Callable[[], AbstractContextManager[None]]
    """Menedżer kontekstu instalujący defekt na czas przebiegu sond."""

    def __post_init__(self) -> None:
        if not self.ident:
            raise ValueError("Mutacja bez identyfikatora nie ma tożsamości w raporcie.")
        if not self.zakres:
            raise ValueError(
                f"Mutacja „{self.ident}” nie podaje ZAKRESU. Mutacja, która nie mówi, jaki "
                "kod podmienia, nie da się odtworzyć ani zrecenzować."
            )
        if not self.oczekiwany_detektor:
            raise ValueError(
                f"Mutacja „{self.ident}” nie wskazuje detektora. Mutacja bez wskazanego "
                "miejsca, które ma ją złapać, jest zgadywaniem, a nie badaniem."
            )
        if not self.sondy:
            raise ValueError(
                f"Mutacja „{self.ident}” nie ma sond. Mutacja bez wykonywalnego sprawdzenia "
                "nie mierzy niczego — jej „zabicie” byłoby deklaracją."
            )


@dataclass(frozen=True)
class RaportMutacji:
    ident: str
    opis: str
    klasa: KlasaDefektu
    zakres: str
    oczekiwany_detektor: str
    sondy: tuple[str, ...]
    wynik: WynikMutacji
    slad_odtworzenia: str = ""
    szczegoly: str = ""

    def to_dict(self) -> dict[str, object]:
        return {
            "ident": self.ident,
            "opis": self.opis,
            "klasa": str(self.klasa),
            "zakres": self.zakres,
            "oczekiwany_detektor": self.oczekiwany_detektor,
            "sondy": list(self.sondy),
            "wynik": str(self.wynik),
            "slad_odtworzenia": self.slad_odtworzenia,
            "szczegoly": self.szczegoly,
        }


@dataclass(frozen=True)
class WynikKampanii:
    raporty: tuple[RaportMutacji, ...] = field(default_factory=tuple)

    @property
    def zabite(self) -> int:
        return sum(1 for r in self.raporty if r.wynik is WynikMutacji.ZABITA)

    @property
    def przezyly(self) -> tuple[RaportMutacji, ...]:
        """Wszystko, co NIE jest zabiciem — łącznie z błędem i niewiarygodną sondą."""
        return tuple(r for r in self.raporty if r.wynik is not WynikMutacji.ZABITA)

    @property
    def przezyly_krytyczne(self) -> tuple[RaportMutacji, ...]:
        return tuple(r for r in self.przezyly if r.klasa in KLASY_KRYTYCZNE)

    @property
    def wynik_punktowy(self) -> float:
        return self.zabite / len(self.raporty) if self.raporty else 0.0

    @property
    def bez_luk_krytycznych(self) -> bool:
        """Czy kampania NIE ZNALAZŁA luki krytycznej.

        PUSTA KAMPANIA DAJE ``False`` ŚWIADOMIE (plan naprawy §4). ``not ()``
        dawałoby ciche ``True``, czyli „nie ma luk" wyprowadzone z faktu, że
        niczego nie zbadano — to jest ta sama fałszywa pewność, przed którą ma
        chronić `DziennikKrokow.strict_convergence` dla pustego dziennika.
        """
        return bool(self.raporty) and not self.przezyly_krytyczne

    def to_dict(self) -> dict[str, object]:
        return {
            "liczba_mutacji": len(self.raporty),
            "zabite": self.zabite,
            "przezyly": len(self.przezyly),
            "przezyly_krytyczne": [r.ident for r in self.przezyly_krytyczne],
            "wynik_punktowy": self.wynik_punktowy,
            "bez_luk_krytycznych": self.bez_luk_krytycznych,
            "raporty": [r.to_dict() for r in self.raporty],
        }


def uruchom_kampanie(
    mutacje: Iterable[Mutacja],
    *,
    wykonaj_sondy: Callable[[tuple[str, ...], Mutacja | None], WynikSondy],
) -> WynikKampanii:
    """Uruchom komplet mutacji z KONTROLĄ BAZOWĄ przed każdą.

    ``wykonaj_sondy(sondy, mutacja)`` uruchamia wskazane sondy; ``mutacja=None``
    znaczy „bez podmiany kodu". Wykonawca jest WSTRZYKIWANY, żeby dało się go
    podmienić w testach samej ramy — inaczej testy ramy musiałyby uruchamiać
    prawdziwe podprocesy pytest i badałyby pytest, a nie ramę.

    Wynik bazowy jest CACHOWANY po zestawie sond: ten sam zestaw uruchamiany dla
    kilku mutacji nie musi być liczony wielokrotnie.
    """
    mutacje = tuple(mutacje)
    identy = [m.ident for m in mutacje]
    powtorzone = sorted({i for i in identy if identy.count(i) > 1})
    if powtorzone:
        raise ValueError(f"Powtórzone identyfikatory mutacji: {powtorzone}")

    bazowe: dict[tuple[str, ...], WynikSondy] = {}
    raporty: list[RaportMutacji] = []
    for mutacja in mutacje:
        try:
            if mutacja.sondy not in bazowe:
                bazowe[mutacja.sondy] = wykonaj_sondy(mutacja.sondy, None)
            baza = bazowe[mutacja.sondy]
            if not baza.przeszly:
                raporty.append(
                    RaportMutacji(
                        ident=mutacja.ident,
                        opis=mutacja.opis,
                        klasa=mutacja.klasa,
                        zakres=mutacja.zakres,
                        oczekiwany_detektor=mutacja.oczekiwany_detektor,
                        sondy=mutacja.sondy,
                        wynik=WynikMutacji.SONDA_NIEWIARYGODNA,
                        slad_odtworzenia=baza.polecenie,
                        szczegoly=(
                            "Sondy padają JUŻ BEZ MUTACJI, więc ich porażka pod mutacją "
                            f"niczego by nie dowiodła. Ślad przebiegu bazowego:\n{baza.slad}"
                        ),
                    )
                )
                continue
            pod_mutacja = wykonaj_sondy(mutacja.sondy, mutacja)
        except Exception:  # noqa: BLE001 - porażka przebiegu to OSOBNY stan
            raporty.append(
                RaportMutacji(
                    ident=mutacja.ident,
                    opis=mutacja.opis,
                    klasa=mutacja.klasa,
                    zakres=mutacja.zakres,
                    oczekiwany_detektor=mutacja.oczekiwany_detektor,
                    sondy=mutacja.sondy,
                    wynik=WynikMutacji.BLAD_WYKONANIA,
                    szczegoly=traceback.format_exc(limit=4),
                )
            )
            continue
        raporty.append(
            RaportMutacji(
                ident=mutacja.ident,
                opis=mutacja.opis,
                klasa=mutacja.klasa,
                zakres=mutacja.zakres,
                oczekiwany_detektor=mutacja.oczekiwany_detektor,
                sondy=mutacja.sondy,
                wynik=(WynikMutacji.ZABITA if not pod_mutacja.przeszly else WynikMutacji.PRZEZYLA),
                slad_odtworzenia=pod_mutacja.polecenie,
                szczegoly=pod_mutacja.slad if not pod_mutacja.przeszly else "",
            )
        )
    return WynikKampanii(raporty=tuple(raporty))
