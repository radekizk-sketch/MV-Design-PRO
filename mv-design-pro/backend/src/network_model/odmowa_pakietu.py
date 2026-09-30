"""Nazwana odmowa „brak pakietu danych właściciela" (karta OD-17a, decyzja OD-17).

PO CO. Dane zewnętrzne, których nie da się wyprowadzić z modelu ani z normy, dostarcza
właściciel systemu w trzech rozłącznych pakietach (decyzja OD-17, doradca architektoniczny
z delegacją O-59):

* **P1** — wykaz certyfikowanych urządzeń PTPiREE (WiPWC): certyfikat typu przekształtnika;
* **P2** — karty katalogowe producentów: poziomy izolacji BIL/LIWL pozycji, widma harmoniczne,
  dane zasobnika magazynu (sprawności, okno stanu naładowania) i inne dane tabliczki, których
  katalog nie niesie;
* **P3** — pakiety wymagań operatorów systemu dystrybucyjnego (IRiESD) dla Reference Engine.

Do tej karty każdy konsument tych danych przy ich braku zwracał pusty wynik, ``None`` albo
własny komunikat — projektant nie wiedział, że brakuje DANYCH (a nie spełnienia wymagania) ani
który pakiet je dostarcza. Odtąd każdy konsument kończy się JEDNĄ nazwaną odmową tego typu:

* wyjątek ``OdmowaBrakuPakietuDanych`` (podklasa ``OdmowaNazwana`` — handler API daje 422
  z polami ``detail``, ``kod``, ``dane``) tam, gdzie operacja nie może być wykonana;
* rekord ``RekordBrakuPakietu`` (``odmowa.rekord()``) tam, gdzie konsument zwraca listę ocen
  albo warunków gotowości — ten sam kod i to samo zdanie co wyjątek (predykat i treść z JEDNEJ
  fabryki), status maszynowy ZAWSZE związany z wyjaśnieniem (kontrakt werdyktu wyjaśnialnego:
  brak danych ≠ spełnia).

KOD MASZYNOWY = prefiks rodzaju + dwukropek + identyfikator:
``BRAK_CERTYFIKATU_WIPWC:<model urządzenia>``, ``BRAK_KARTY_PRODUCENTA:<pole karty>`` (kilka pól
— lista po przecinku w kolejności kanonicznej konsumenta), ``BRAK_PAKIETU_OSD:<operator>``.
Kod żyje w POLU, nigdy w zdaniu dla projektanta; zdanie nazywa element nazwą z modelu, mówi,
czego brakuje i który pakiet właściciela to dostarcza.

Moduł jest LIŚCIEM grafu importów: stdlib, pydantic, ``werdykt.kontrakt``,
``network_model.nazwy`` i ``network_model.odmowa_danych`` — katalogi, ENM, most solverów i warstwa aplikacji importują go
bez cyklu.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

from network_model.nazwy import nazwa_nadana
from network_model.odmowa_danych import OdmowaNazwana
from pydantic import BaseModel, ConfigDict
from werdykt.kontrakt import Tekst, WyjasnienieWerdyktu

__all__ = [
    "OPIS_PAKIETU_PL",
    "PAKIET_RODZAJU",
    "PakietWlasciciela",
    "RekordBrakuPakietu",
    "RodzajBrakuPakietu",
    "StatusBrakuPakietu",
    "OdmowaBrakuPakietuDanych",
    "brak_certyfikatu_wipwc",
    "brak_z_pakietem_pl",
    "brak_karty_producenta",
    "brak_pakietu_osd",
]

#: Rodzaj braku = prefiks kodu maszynowego.
RodzajBrakuPakietu = Literal["BRAK_CERTYFIKATU_WIPWC", "BRAK_KARTY_PRODUCENTA", "BRAK_PAKIETU_OSD"]
#: Pakiet właściciela, który dostarcza brakujące dane (decyzja OD-17).
PakietWlasciciela = Literal["P1", "P2", "P3"]
#: Statusy maszynowe rekordu braku — wyłącznie „brak danych", nigdy werdykt merytoryczny.
StatusBrakuPakietu = Literal["NIE_OCENIONO", "BRAK_PODSTAWY", "BRAK_DOWODU"]

#: JEDNO źródło przypisania rodzaju braku do pakietu właściciela.
PAKIET_RODZAJU: dict[RodzajBrakuPakietu, PakietWlasciciela] = {
    "BRAK_CERTYFIKATU_WIPWC": "P1",
    "BRAK_KARTY_PRODUCENTA": "P2",
    "BRAK_PAKIETU_OSD": "P3",
}

#: Nazwa pakietu w zdaniu dla projektanta (bez oznaczeń P1/P2/P3 — to identyfikatory robocze).
OPIS_PAKIETU_PL: dict[PakietWlasciciela, str] = {
    "P1": (
        "pakiet wykazu certyfikowanych urządzeń PTPiREE (WiPWC), dostarczany przez właściciela "
        "systemu"
    ),
    "P2": "pakiet kart katalogowych producentów, dostarczany przez właściciela systemu",
    "P3": (
        "pakiet wymagań operatora opracowany z jego instrukcji ruchu i eksploatacji sieci "
        "dystrybucyjnej, dostarczany przez właściciela systemu"
    ),
}

#: Status domyślny rodzaju (kontrakt werdyktu wyjaśnialnego §2): brak certyfikatu = brak dowodu
#: zgodności; brak karty producenta = ocena niewykonana z braku danych wejściowych; brak pakietu
#: operatora = wymaganie bez podstawy (dokument wymagań nie istnieje w żadnej warstwie).
_STATUS_RODZAJU: dict[RodzajBrakuPakietu, StatusBrakuPakietu] = {
    "BRAK_CERTYFIKATU_WIPWC": "BRAK_DOWODU",
    "BRAK_KARTY_PRODUCENTA": "NIE_OCENIONO",
    "BRAK_PAKIETU_OSD": "BRAK_PODSTAWY",
}


class RekordBrakuPakietu(BaseModel):
    """Rekord nazwanej odmowy w liście ocen albo warunków gotowości (addytywny w kontraktach).

    Ten sam ``kod`` i ``komunikat_pl`` co wyjątek, z którego powstał (``odmowa.rekord()``).
    ``status_maszynowy`` służy wyłącznie agregacji i filtrom; człowiek czyta ``wyjasnienie``.
    """

    model_config = ConfigDict(frozen=True, extra="forbid")

    kod: Tekst
    rodzaj: RodzajBrakuPakietu
    pakiet: PakietWlasciciela
    identyfikator: Tekst
    nazwa_elementu: Tekst
    status_maszynowy: StatusBrakuPakietu
    komunikat_pl: Tekst
    wyjasnienie: WyjasnienieWerdyktu


class OdmowaBrakuPakietuDanych(OdmowaNazwana):
    """Brak danych, które dostarcza pakiet właściciela P1/P2/P3 — JEDEN typ dla trzech pakietów.

    Tworzony WYŁĄCZNIE fabrykami ``brak_certyfikatu_wipwc``, ``brak_karty_producenta``,
    ``brak_pakietu_osd`` (kod, pakiet i treść z jednego miejsca).
    """

    def __init__(
        self,
        komunikat: str,
        *,
        rodzaj: RodzajBrakuPakietu,
        identyfikator: str,
        nazwa_elementu: str,
        czego_brakuje_pl: str,
        status: StatusBrakuPakietu | None = None,
    ) -> None:
        if not identyfikator.strip():
            raise ValueError("Odmowa braku pakietu wymaga niepustego identyfikatora.")
        if nazwa_nadana(nazwa_elementu) is None:
            raise ValueError("Odmowa braku pakietu wymaga nazwy elementu z modelu.")
        pakiet = PAKIET_RODZAJU[rodzaj]
        super().__init__(
            komunikat,
            kod=f"{rodzaj}:{identyfikator}",
            dane={
                "rodzaj": rodzaj,
                "pakiet": pakiet,
                "identyfikator": identyfikator,
                "nazwa_elementu": nazwa_elementu,
            },
        )
        self.rodzaj: RodzajBrakuPakietu = rodzaj
        self.pakiet: PakietWlasciciela = pakiet
        self.identyfikator = identyfikator
        self.nazwa_elementu = nazwa_elementu
        self.czego_brakuje_pl = czego_brakuje_pl
        self.status: StatusBrakuPakietu = status or _STATUS_RODZAJU[rodzaj]

    @property
    def komunikat(self) -> str:
        """Zdanie dla projektanta (treść wyjątku)."""
        return str(self)

    def rekord(self) -> RekordBrakuPakietu:
        """Ta sama odmowa jako rekord listy ocen / warunków gotowości."""
        return RekordBrakuPakietu(
            kod=self.kod,
            rodzaj=self.rodzaj,
            pakiet=self.pakiet,
            identyfikator=self.identyfikator,
            nazwa_elementu=self.nazwa_elementu,
            status_maszynowy=self.status,
            komunikat_pl=self.komunikat,
            wyjasnienie=WyjasnienieWerdyktu(
                zdanie_pl=self.komunikat,
                przyczyna_pl=(
                    "brak danych zewnętrznych — dostarcza je "
                    f"{OPIS_PAKIETU_PL[self.pakiet]}; brak danych nie oznacza spełnienia "
                    "ani niespełnienia wymagania"
                ),
                czego_brakuje=(self.czego_brakuje_pl,),
            ),
        )


def brak_z_pakietem_pl(rekord: RekordBrakuPakietu) -> str:
    """Pozycja listy „czego brakuje" oceny wymagania: brak + pakiet, który go dostarcza."""
    return (
        f"{rekord.wyjasnienie.czego_brakuje[0]} — dane dostarcza {OPIS_PAKIETU_PL[rekord.pakiet]}"
    )


def _identyfikator(wartosc: str) -> str:
    """Identyfikator w kodzie: bez odstępów na brzegach i bez dwukropka (separator kodu)."""
    return wartosc.strip().replace(":", "_")


def brak_certyfikatu_wipwc(
    model: str, *, nazwa_elementu: str, opis_typu_pl: str
) -> OdmowaBrakuPakietuDanych:
    """P1: typ urządzenia elementu nie ma certyfikatu w wykazie PTPiREE dostępnym w systemie.

    ``model`` — oznaczenie typu (model producenta; gdy tabliczka go nie niesie — pozycja
    katalogu), wyłącznie do kodu. ``opis_typu_pl`` — typ w zdaniu z nazwą z katalogu
    (np. „typ przekształtnika „Huawei SUN2000””, „typ przekształtnika spoza katalogu”).
    """
    czego = f"certyfikat PTPiREE w wykazie certyfikowanych urządzeń — {opis_typu_pl}"
    return OdmowaBrakuPakietuDanych(
        f"Źródło „{nazwa_elementu}”: {opis_typu_pl} nie ma certyfikatu PTPiREE w wykazie "
        "certyfikowanych urządzeń dostępnym w systemie — zgodność z wymaganiami "
        "przyłączeniowymi nie ma dowodu, a wniosek do OSD może zostać odrzucony. Certyfikaty "
        f"dostarcza {OPIS_PAKIETU_PL['P1']}. Ostateczna akceptacja przyłączeniowa pozostaje "
        "po stronie właściwego OSD.",
        rodzaj="BRAK_CERTYFIKATU_WIPWC",
        identyfikator=_identyfikator(model),
        nazwa_elementu=nazwa_elementu,
        czego_brakuje_pl=czego,
    )


def brak_karty_producenta(
    pola: Sequence[tuple[str, str]],
    *,
    nazwa_elementu: str,
    rodzaj_elementu_pl: str,
    skutek_pl: str,
    status: StatusBrakuPakietu | None = None,
) -> OdmowaBrakuPakietuDanych:
    """P2: element nie ma danych karty producenta ``pola`` = ``[(pole, opis PL), ...]``.

    Kolejność ``pola`` jest kanoniczną kolejnością konsumenta (kod deterministyczny).
    ``skutek_pl`` — co konsument przez ten brak robi (zdanie bez kodów). ``status`` — gdy
    konsument liczy informacyjnie wobec przyjętej wartości normowej (``BRAK_PODSTAWY``).
    """
    if not pola:
        raise ValueError("Odmowa braku karty producenta wymaga co najmniej jednego pola.")
    opisy = [opis for _, opis in pola]
    lista = opisy[0] if len(opisy) == 1 else ", ".join(opisy[:-1]) + " i " + opisy[-1]
    return OdmowaBrakuPakietuDanych(
        f"{rodzaj_elementu_pl} „{nazwa_elementu}”: brak danych karty producenta — {lista}. "
        f"{skutek_pl} Dane dostarcza {OPIS_PAKIETU_PL['P2']}.",
        rodzaj="BRAK_KARTY_PRODUCENTA",
        identyfikator=",".join(_identyfikator(pole) for pole, _ in pola),
        nazwa_elementu=nazwa_elementu,
        czego_brakuje_pl=f"dane karty producenta: {lista}",
        status=status,
    )


def brak_pakietu_osd(
    operator: str, *, nazwa_operatora_pl: str, nazwa_elementu: str
) -> OdmowaBrakuPakietuDanych:
    """P3: w rejestrze wymagań nie ma pakietu operatora wskazanego w przypadku obliczeniowym."""
    return OdmowaBrakuPakietuDanych(
        f"Przypadek obliczeniowy „{nazwa_elementu}”: operator {nazwa_operatora_pl} nie ma "
        "pakietu wymagań w rejestrze wymagań referencyjnych, więc zgodności ze standardami "
        f"tego operatora nie oceniono. Wymagania dostarcza {OPIS_PAKIETU_PL['P3']}.",
        rodzaj="BRAK_PAKIETU_OSD",
        identyfikator=_identyfikator(operator),
        nazwa_elementu=nazwa_elementu,
        czego_brakuje_pl=f"pakiet wymagań operatora {nazwa_operatora_pl}",
    )
