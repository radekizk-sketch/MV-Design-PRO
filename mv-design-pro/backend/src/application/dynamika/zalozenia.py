"""Założenia biegu `dynamika_rms` po polsku — zdania z REKORDÓW rdzenia i NAZW z modelu.

PO CO (karta modeli odbiorów, §0 pkt 6). Rdzeń dynamiki oddaje założenie jako rekord
strukturalny (`network_model.solvers.dynamika.wynik.ZalozenieRdzenia`: kod, odwołania do
elementów, wielkości z jednostką, pozycje wyliczeń), bo nie zna nazw elementów modelu
sieci. Do odbioru AB-P1 rdzeń pisał zdania sam — bez polskich znaków, z identyfikatorami
węzłów i kluczami kodu — a ekran dynamiki chował je w zwiniętym zapisie technicznym.

TU jest jedyne miejsce zdań: ekran dynamiki (E-32), raport PDF/DOCX biegu i opis wyniku
API czytają pole `zalozenia` wyniku, które wykonawca biegu (`enm.canonical_analysis.
_execute_dynamika_rms`) składa tą funkcją z rekordów rdzenia i założeń wejścia adaptera.
Nazwy elementów z jednego źródła (`enm.nazwy_elementow.zbuduj_indeks_nazw`) — migawka BIEGU.

Słownik zdań jest ZAMKNIĘTY wobec rejestru kodów rdzenia (`KODY_ZALOZEN_RDZENIA`) w obie
strony — przypina to test; kod bez zdania albo zdanie bez kodu jest błędem programu.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from enm.nazwy_elementow import nazwa_po_identyfikatorze, zbuduj_indeks_nazw
from enm.slownik_komunikatow import lista_pl
from network_model.solvers.dynamika.wynik import KODY_ZALOZEN_RDZENIA

#: Rodziny urządzeń składanych przez rdzeń (`fabryka.RODZINY_OBSLUGIWANE`) słowami
#: projektanta — zbiór RÓWNY rejestrowi rdzenia (test w obie strony: każda pozycja rekordu
#: `rodziny_urzadzen` ma nazwę, a nazwa rodziny, której rdzeń nie składa, byłaby fantomem).
NAZWY_RODZIN_PL: dict[str, str] = {
    "synchroniczna": "maszyna synchroniczna z regulatorami",
    "przeksztaltnikowa_gfl": "przekształtnik nadążny (grid-following)",
    "przeksztaltnikowa_gfm": "przekształtnik tworzący sieć (grid-forming)",
    "magazyn": "magazyn energii z przekształtnikiem",
    "wiatr_typ_3": "turbina wiatrowa typu 3 (maszyna dwustronnie zasilana)",
    "wiatr_typ_4": "turbina wiatrowa typu 4 (pełny przekształtnik)",
}

Rekord = Mapping[str, Any]
Nazwy = Mapping[str, str]


def _nazwa(ref: str, nazwy: Nazwy) -> str:
    return f"„{nazwa_po_identyfikatorze(ref, indeks=nazwy)}”"


def _wielkosc(rekord: Rekord, nazwa: str) -> float:
    for wielkosc in rekord.get("wielkosci") or []:
        if wielkosc.get("nazwa") == nazwa:
            return float(wielkosc["wartosc"])
    raise AssertionError(f"Rekord założenia {rekord.get('kod')!r} bez wielkości {nazwa!r}.")


def _liczba(wartosc: float) -> str:
    """Liczba po polsku (przecinek dziesiętny), bez zbędnych zer."""
    return f"{wartosc:g}".replace(".", ",")


def _model_rms(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Model RMS składowej zgodnej: oś czasu niesie obwiednie fazorów napięć i prądów przy "
        "częstotliwości znamionowej, nie przebiegi chwilowe."
    )


def _model_odbiorow(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Odbiory: charakterystyka statyczna z rozpływu (wielomian ZIP — składowe stałej "
        "impedancji, stałego prądu i stałej mocy) razy liniowy czynnik częstotliwościowy; "
        "poniżej napięcia przejścia z modelu dynamicznego odbioru składowe prądowa i mocowa "
        "przechodzą w stałą impedancję (moc i prąd ciągłe w napięciu przejścia, pochodna mocy "
        "po napięciu ma tam załamanie), więc przy zapadzie do zera prąd odbioru maleje do zera. "
        "Odbiory jednofazowe wchodzą jako symetryczne, jak w rozpływie symetrycznym."
    )


def _zwarcia_trojfazowe(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Zwarcia wyłącznie trójfazowe symetryczne; zwarcia niesymetryczne wymagają składowych "
        "symetrycznych, których ten bieg nie liczy."
    )


def _rodziny_urzadzen(rekord: Rekord, _nazwy: Nazwy) -> str:
    pozycje = [str(p) for p in rekord.get("pozycje") or []]
    return (
        "Rodziny urządzeń, których modele elektryczne składa rdzeń: "
        f"{lista_pl((NAZWY_RODZIN_PL[p] for p in pozycje), 'i')}."
    )


def _probki_obustronne(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "W chwili każdego zdarzenia wynik niesie dwie próbki: przed naniesieniem zdarzeń tej "
        "chwili i po zdarzeniach z jedną ponowną inicjalizacją algebry sieci; częstotliwość "
        "szyny w obu jest niedostępna (chwila nieciągłości)."
    )


def _estymator(rekord: Rekord, nazwy: Nazwy) -> str:
    odbiory = [str(e) for e in rekord.get("elementy") or []]
    liczba = "Odbiór czuły" if len(odbiory) == 1 else "Odbiory czułe"
    return (
        f"{liczba} częstotliwościowo {lista_pl((_nazwa(r, nazwy) for r in odbiory), 'i')} "
        "widzą częstotliwość szyny przez estymator z inercją pierwszego rzędu (stała czasowa "
        "pomiaru z modelu dynamicznego odbioru); estymata jest ograniczona, a przejście "
        "różnicy fazy przez ±π jest odmową nazwaną (poza zakresem ważności modelu)."
    )


def _obszar_beznapieciowy(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Obszar beznapięciowy (wyspa, w której żadne urządzenie nie wnosi prądu) ma napięcie "
        "dokładnie zerowe, a jego odbiory nie pobierają prądu — obwód bez drogi do źródła nie "
        "przewodzi; odcięte szyny i odbiory wymienia każde wykonane zdarzenie."
    )


def _start_ponownego_zasilenia(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Szyna ponownie zasilona (albo po zdjęciu zwarcia metalicznego) startuje obliczenie "
        "chwili od napięcia najbliższej szyny zasilanej, a gdy takiej nie ma — od napięcia "
        "jałowego urządzenia przyłączonego do tej szyny; to wybór punktu startowego iteracji, "
        "nie korekta rozwiązania."
    )


def _reinicjalizacja_estymatora(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Odbiór czuły częstotliwościowo po ponownym zasileniu jego szyny zaczyna pomiar od "
        "nowa: w chwili zasilenia widzi częstotliwość znamionową, a stan estymatora dostaje "
        "fazę napięcia po zasileniu (odbiór odcięty nie mierzył, faza po przerwie jest "
        "dowolna); przypisanie niesie wykonane zdarzenie."
    )


def _przypisanie_stanu(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Przypisanie stanu i komenda regulacji zmieniają w chwili zdarzenia wyłącznie "
        "wielkości wymienione w zdarzeniu (wartość zadana dokładnie, bez ponownego wyznaczania "
        "stanu urządzenia z punktu pracy); pozostałe stany różniczkowe są ciągłe, a każde "
        "przypisanie (przed, po) i zmierzony skok stanów nieprzypisanych niesie zdarzenie."
    )


def _utrata_czesciowa(_rekord: Rekord, _nazwy: Nazwy) -> str:
    return (
        "Częściowa utrata źródła: źródło jest zespołem identycznych jednostek równoległych; "
        "ubytek jednostek zmienia wyłącznie prąd oddawany do sieci (proporcjonalnie do udziału "
        "pozostałego), nie stan jednostki; nastawa mocy wydana po utracie dotyczy jednostek "
        "pozostałych."
    )


def _tryb_stanowiska(rekord: Rekord, nazwy: Nazwy) -> str:
    zrodlo, szyna = (str(e) for e in rekord["elementy"])
    (sprzezenie,) = rekord["pozycje"]
    opis_sprzezenia = {
        "idealne": (
            "jako idealne źródło napięciowe (impedancja zerowa, napięcie szyny przyłączenia "
            "narzucone równe sile elektromotorycznej)"
        ),
        "za_impedancja": "za impedancją zastępczą sieci (sprzężenie prądowe)",
    }[str(sprzezenie)]
    return (
        f"Tryb stanowiska badawczego: źródło testowe {_nazwa(zrodlo, nazwy)} na szynie "
        f"{_nazwa(szyna, nazwy)} zadaje siłę elektromotoryczną o profilu amplitudy, "
        f"częstotliwości i fazy {opis_sprzezenia}; przebieg jest odpowiedzią sieci i badanych "
        "urządzeń na profil stanowiska, nie na zakłócenie sieci."
    )


def _zwarcie_samoczynne(rekord: Rekord, nazwy: Nazwy) -> str:
    (miejsce,) = (str(e) for e in rekord["elementy"])
    (rodzaj,) = rekord["pozycje"]
    t_s = _liczba(_wielkosc(rekord, "t_s"))
    t_usuniecia = _liczba(_wielkosc(rekord, "t_usuniecia_s"))
    if rodzaj == "galaz":
        polozenie = _liczba(_wielkosc(rekord, "polozenie_wzgledne"))
        gdzie = f"w gałęzi {_nazwa(miejsce, nazwy)} w miejscu x = {polozenie} długości"
    else:
        gdzie = f"na szynie {_nazwa(miejsce, nazwy)}"
    return (
        f"Zwarcie {gdzie} (t = {t_s} s) usunięte samoczynnie w t = {t_usuniecia} s — "
        "idealizacja zwarcia przemijającego: łuk gaśnie pod napięciem, bez zmiany topologii "
        "i bez działania aparatu."
    )


#: Kod założenia rdzenia -> funkcja zdania (rekord, indeks nazw). Zbiór ZAMKNIĘTY wobec
#: `KODY_ZALOZEN_RDZENIA` (test w obie strony).
ZDANIA_ZALOZEN: dict[str, Callable[[Rekord, Nazwy], str]] = {
    "model_rms_skladowej_zgodnej": _model_rms,
    "model_odbiorow": _model_odbiorow,
    "zwarcia_trojfazowe": _zwarcia_trojfazowe,
    "rodziny_urzadzen": _rodziny_urzadzen,
    "probki_obustronne": _probki_obustronne,
    "estymator_czestotliwosci_odbiorow": _estymator,
    "obszar_beznapieciowy": _obszar_beznapieciowy,
    "start_ponownego_zasilenia": _start_ponownego_zasilenia,
    "reinicjalizacja_estymatora_odbioru": _reinicjalizacja_estymatora,
    "przypisanie_stanu": _przypisanie_stanu,
    "utrata_czesciowa_zrodla": _utrata_czesciowa,
    "tryb_stanowiska": _tryb_stanowiska,
    "zwarcie_usuniete_samoczynnie": _zwarcie_samoczynne,
}
if set(ZDANIA_ZALOZEN) != set(KODY_ZALOZEN_RDZENIA):  # pragma: no cover - obrona rejestru
    raise AssertionError("Słownik zdań założeń rozjechał się z rejestrem kodów rdzenia.")


def zdania_zalozen_rdzenia(rekordy: Sequence[Rekord], migawka: Mapping[str, Any]) -> list[str]:
    """Zdania po polsku z rekordów założeń rdzenia (kolejność rekordów) i nazw migawki biegu."""
    nazwy = zbuduj_indeks_nazw(dict(migawka))
    return [ZDANIA_ZALOZEN[str(rekord["kod"])](rekord, nazwy) for rekord in rekordy]


__all__ = ["NAZWY_RODZIN_PL", "ZDANIA_ZALOZEN", "zdania_zalozen_rdzenia"]
