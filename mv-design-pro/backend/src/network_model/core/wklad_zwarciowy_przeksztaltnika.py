"""Współczynnik wkładu zwarciowego źródła przekształtnikowego — JEDNO miejsce.

CO OPISUJE. ``k_sc`` mnoży prąd znamionowy falownika, dając jego wkład do prądu
zwarciowego: ``I_k = k_sc · I_n`` (model źródła prądowego o ograniczonej
wydajności, IEC 60909). Wartość zależy od ogranicznika prądu KONKRETNEGO
przekształtnika i pochodzi z karty producenta albo z certyfikatu jednostki
wytwórczej — nie z rodzaju technologii.

DEFEKT, KTÓRY TEN MODUŁ ZAMYKA (pomiar 2026-09-11). Liczba ``1.1`` była wpisana
NA SZTYWNO w DZIEWIĘCIU niezależnych miejscach (dwie klasy rdzenia po dwa wpisy,
ich `from_dict`, mapowanie ENM i dwa tory `analysis_run`), bez jednego zdania
uzasadnienia w całym repozytorium. Jednocześnie:

  * `solver_input/builder.py` deklaruje we własnym docstringu niezmiennik
    „NO heuristics, NO default physical values, NO data guessing";
  * `SourceKind.DEFAULT_FORBIDDEN` istnieje w kontrakcie proweniencji i NIE BYŁ
    emitowany ANI RAZU — obietnica bez testu;
  * ślad proweniencji oznaczał ``k_sc`` jako ``CATALOG`` ze ścieżką
    ``converter_types[<ref>]``, mimo że ŻADEN typ katalogu takiego pola nie ma;
  * `MaterializedSourceParams.k_sc` istnieje w kontrakcie (i w lustrze TS), ale
    żadna operacja domenowa go nie zapisuje — pole bez producenta.

Efekt: wkład zwarciowy KAŻDEGO źródła OZE w produkcie brał się z liczby, której
nikt nie wybrał ani nie widział, a audyt pokazywał ją jako daną katalogową.
Wynik trafia do doboru aparatury i nastaw zabezpieczeń.

CZEGO TEN MODUŁ NIE ROBI. Nie orzeka, że ``1.1`` jest wartością normatywną —
takiego przypisu nie da się tu uczciwie postawić bez dokumentu normy w ręku, a
zmyślona podstawa normatywna byłaby gorsza niż jawnie nazwana domyślka. Wartość
zostaje jako DOMYŚLNA SYSTEMOWA, czyli stan „nikt nie podał danych", i tak jest
raportowana w śladzie. Rozstrzygnięcie, czy ma blokować gotowość, czy tylko
ostrzegać, należy do właściciela — jest opisane w audycie, nie przesądzone tutaj.
"""

from __future__ import annotations

#: Wartość używana, gdy nikt nie podał współczynnika: ANI karta producenta, ANI
#: użytkownik. NIE jest to wartość normatywna ani „typowa dla technologii" —
#: to jawnie oznaczony stan braku danych, wspólny dla wszystkich torów,
#: żeby nie dało się go zmienić w jednym miejscu i przeoczyć w ośmiu innych.
K_SC_DOMYSLNY_SYSTEMOWY: float = 1.1

#: Znacznik pochodzenia współczynnika w śladzie White Box. Rozróżnienie jest
#: całym sensem tej zmiany: wynik policzony z deklaracji producenta i wynik
#: policzony z domyślki systemowej mają RÓŻNĄ wiarygodność, a do tej pory ślad
#: pokazywał oba tak samo.
K_SC_ZRODLO_DEKLARACJA = "DEKLARACJA"
K_SC_ZRODLO_DOMYSLNE = "DOMYSLNE_SYSTEMOWE"


def wspolczynnik_wkladu_zwarciowego(wartosc: object) -> tuple[float, str]:
    """Zwróć ``(k_sc, znacznik_pochodzenia)`` dla podanej (albo brakującej) danej.

    JEDEN predykat akceptacji dla wszystkich torów. Wcześniej każde z dziewięciu
    miejsc sprawdzało co innego — ``data.get("k_sc", 1.1)`` przyjmowało zero i
    wartości ujemne, a ``isinstance(...) and k_sc > 0`` je odrzucało. Dwa różne
    warunki na tę samą daną to defekt czekający na dane brzegowe: ``k_sc = 0``
    dawało wkład zwarciowy równy zeru w jednym torze i ``1.1`` w drugim.

    Wartość dodatnia jest DEKLARACJĄ; brak, zero, wartość ujemna i typ inny niż
    liczbowy to BRAK DANYCH — nie okazja do „poprawienia" liczby po cichu.
    """
    if isinstance(wartosc, bool):
        # `bool` jest podklasą `int` — bez tej gałęzi `True` przeszłoby jako 1.0.
        return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE
    if isinstance(wartosc, int | float) and float(wartosc) > 0.0:
        return float(wartosc), K_SC_ZRODLO_DEKLARACJA
    return K_SC_DOMYSLNY_SYSTEMOWY, K_SC_ZRODLO_DOMYSLNE


def deklaracja_k_sc(wartosc: object) -> float | None:
    """Deklarowana wartość albo ``None`` — jeden odsiew dla wszystkich torów.

    Modele rdzenia przechowują DEKLARACJĘ (``None`` = nikt nie podał), a wartość
    użytą w rachunku i znacznik pochodzenia WYPROWADZAJĄ z niej właściwościami.
    Ta funkcja jest jedynym miejscem, w którym dane wejściowe zamieniają się w
    deklarację — bez niej każdy tor miałby własny warunek akceptacji, a to jest
    ten sam defekt, który tu naprawiamy.
    """
    _, zrodlo = wspolczynnik_wkladu_zwarciowego(wartosc)
    if zrodlo != K_SC_ZRODLO_DEKLARACJA:
        return None
    return float(wartosc)  # type: ignore[arg-type]
