"""Komunikat odmowy biegu `dynamika_rms` dla projektanta — NAZWY z modelu zamiast kluczy.

PO CO (karta modeli odbiorów, §0 pkt 6 — ten sam wzorzec co założenia). Odmowa rdzenia
(`OdmowaDynamiki`) i adaptera (`OdmowaWejsciaDynamiki`) trafia do projektanta jako komunikat
biegu zakończonego odmową (`CanonicalRun.error_message`, ekran dynamiki). Rdzeń nie zna
nazw elementów modelu sieci, więc jego komunikat niesie IDENTYFIKATORY węzłów, urządzeń,
gałęzi i odbiorów oraz ADRESY stanów `<element>.<stan>`. Tu, w warstwie aplikacji, jedna
funkcja zamienia je na nazwy z migawki biegu (jedno źródło nazw — `enm.nazwy_elementow`)
i opisy stanów po polsku (słownik opisu wyniku — `opis_wyniku.OPISY_STANOW_PL`). Kod
odmowy i pola maszynowe (`szczegoly`, `elementy`) zostają bez zmian — to dane, nie tekst.

Zamiana dotyczy WYŁĄCZNIE identyfikatorów elementów istniejących w migawce biegu i tylko
całych tokenów (`komunikat_z_nazwami`); cytowany identyfikator (`'G1'`) traci apostrofy
razem z zamianą, bo nazwa ma własny cudzysłów.

KLUCZE KODU. Komunikat rdzenia cytuje w odwrotnych apostrofach klucz pola kontraktu
(nastawa solvera, pole zdarzenia) albo wartość wyliczeniową (sposób usunięcia zwarcia). Te
same klucze projektant widzi w interfejsie jako ETYKIETY z opisu kontraktu scenariusza
(`enm.scenariusze.ETYKIETY_POL`, `ETYKIETY_RODZAJOW`, `ETYKIETY_WARTOSCI`) — tu klucz zamienia się na tę samą
etykietę (jedno źródło etykiet). Każdy klucz cytowany w komunikatach odmów rdzenia ma etykietę
— przypina to test skanujący wszystkie miejsca odmów rdzenia.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from application.dynamika.opis_wyniku import OPISY_STANOW_PL, komunikat_z_nazwami
from enm.nazwy_elementow import zbuduj_indeks_nazw
from enm.scenariusze import ETYKIETY_POL, ETYKIETY_RODZAJOW, ETYKIETY_WARTOSCI

#: Adres stanu po zamianie elementu na nazwę: `„Nazwa”.stan` (stan = identyfikator kodu).
_ADRES_STANU = re.compile(r"(„[^”]*”)\.([A-Za-z_][A-Za-z0-9_]*)")
#: Klucz kodu cytowany w komunikacie rdzenia: `klucz`.
_KLUCZ_KODU = re.compile(r"`([A-Za-z_][A-Za-z0-9_]*)`")

#: Rodzaje obiektów rdzenia dynamiki, które odmowa rdzenia cytuje NAZWĄ KLASY w apostrofach
#: odwróconych (`type(x).__name__`): urządzenia (klasa wyjaśnia, dlaczego stan nie jest
#: przypisywalny albo komenda nieobsługiwana), zdarzenia harmonogramu (akcja dozoru, tryb
#: stanowiska) i segmenty profilu źródła testowego. Projektant widzi rodzaj obiektu słowami —
#: nazwa klasy jest identyfikatorem kodu. Kompletność wobec rodzin klas rdzenia przypina
#: `tests/enm/test_klucze_pol_w_komunikatach_src.py` (każda klasa każdej rodziny ma wpis,
#: każdy wpis jest klasą rdzenia).
NAZWY_KLAS_DYNAMIKI_PL: dict[str, str] = {
    # urządzenia
    "MaszynaKlasyczna": "maszyna synchroniczna — model klasyczny (SEM za reaktancją przejściową)",
    "MaszynaSynchroniczna": "maszyna synchroniczna — model szczegółowy 6. rzędu",
    "PrzeksztaltnikGFL": "przekształtnik nadążający za siecią (GFL)",
    "PrzeksztaltnikGFM": "przekształtnik tworzący sieć (GFM)",
    "Magazyn": "magazyn energii",
    "TurbinaWiatrowa": "turbina wiatrowa",
    "SzynaSztywna": "ekwiwalent sieci nadrzędnej (stała SEM za impedancją)",
    "ZrodloTestowe": "źródło testowe (profil napięcia, częstotliwości i fazy)",
    "UrzadzenieOdlaczone": "urządzenie odłączone od sieci",
    "UrzadzenieCzesciowe": "agregat pracujący częścią jednostek",
    # zdarzenia harmonogramu
    "ZwarcieWezla": "zwarcie w węźle",
    "ZwarcieGalezi": "zwarcie w linii lub kablu",
    "ZmianaGalezi": "otwarcie lub zamknięcie gałęzi",
    "ZmianaOdsprzegu": "wyłączenie lub załączenie odsprzęgu",
    "ZmianaOdbioru": "odłączenie lub załączenie odbioru",
    "OdlaczenieZrodla": "odłączenie źródła",
    "UtrataCzesciowaZrodla": "częściowa utrata jednostek źródła",
    "SkokObciazenia": "skokowa zmiana mocy odbioru",
    "PrzypisanieStanu": "przypisanie wartości stanu urządzenia",
    "KomendaRegulacji": "zmiana nastawy regulatora źródła",
    # segmenty profilu źródła testowego
    "SkokNapiecia": "skok amplitudy napięcia",
    "RampaNapiecia": "rampa amplitudy napięcia",
    "SkokCzestotliwosci": "skok częstotliwości",
    "RampaCzestotliwosci": "rampa częstotliwości",
    "SkokFazy": "skok fazy",
}


def etykieta_klucza(klucz: str) -> str | None:
    """Etykieta pola albo wartości wyliczeniowej kontraktu scenariusza albo rodzaju obiektu
    rdzenia (nazwa klasy); `None` — brak etykiety (klucz spoza kontraktu scenariusza; test
    pilnuje, że rdzeń takich nie cytuje)."""
    if klucz in NAZWY_KLAS_DYNAMIKI_PL:
        return NAZWY_KLAS_DYNAMIKI_PL[klucz]
    if klucz in ETYKIETY_POL:
        return ETYKIETY_POL[klucz]
    if klucz in ETYKIETY_RODZAJOW:
        return ETYKIETY_RODZAJOW[klucz]
    wartosci = {
        etykieta for (_pole, wartosc), etykieta in ETYKIETY_WARTOSCI.items() if wartosc == klucz
    }
    return wartosci.pop() if len(wartosci) == 1 else None


def komunikat_dla_projektanta(tekst: str, migawka: Mapping[str, Any]) -> str:
    """Komunikat odmowy z identyfikatorami elementów zamienionymi na nazwy i adresami stanów
    zamienionymi na opis stanu (element nazwą)."""
    nazwy = zbuduj_indeks_nazw(dict(migawka))
    # Identyfikator w apostrofach (`repr` w komunikacie rdzenia) — apostrofy znikają razem
    # z identyfikatorem, nazwa ma cudzysłów „…”.
    for ref in sorted(nazwy, key=lambda r: (-len(r), r)):
        for cudzyslow in ("'", '"'):
            tekst = tekst.replace(f"{cudzyslow}{ref}{cudzyslow}", ref)
    tekst = komunikat_z_nazwami(tekst, nazwy.keys(), nazwy)

    def _stan(dopasowanie: re.Match[str]) -> str:
        opis = OPISY_STANOW_PL.get(dopasowanie.group(2))
        if opis is None:
            return dopasowanie.group(0)
        return f"{opis} ({dopasowanie.group(1)})"

    tekst = _ADRES_STANU.sub(_stan, tekst)

    def _klucz(dopasowanie: re.Match[str]) -> str:
        etykieta = etykieta_klucza(dopasowanie.group(1))
        return dopasowanie.group(0) if etykieta is None else f"„{etykieta}”"

    return _KLUCZ_KODU.sub(_klucz, tekst)


__all__ = ["NAZWY_KLAS_DYNAMIKI_PL", "etykieta_klucza", "komunikat_dla_projektanta"]
