"""Rekordy werdyktu wyjaśnialnego kryteriów wyposażenia stacji (karta WERDYKT-MIGRACJA-190).

DLACZEGO TU. Bilans CT, bilans VT i starzenie izolacji kabla zwracały same słowa statusu
(``PASS`` / ``FAIL`` / ``UNAVAILABLE``) składane własną kopią warunku. Kontrakt werdyktu
wyjaśnialnego (``docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md``) wymaga przy każdym statusie
pełnego rekordu: co oceniono, kryterium, wynik z jednostką, limit z podstawą i stanem źródła,
margines, przyczynę, dowód i zakres ważności. Ten moduł składa rekordy K (jedno kryterium)
i W (kryterium wieloczłonowe) z wielkości JUŻ policzonych przez solver — niczego nie liczy —
wspólnym budowniczym ``werdykt.porownanie``. Kody zastane wyniku (``status`` …) są projekcją
statusów maszynowych tych rekordów (``werdykt.porownanie.projekcja_statusu``): jedno źródło
rozstrzygnięcia, bez drugiej kopii warunku ``≤``.

PODSTAWY. Kryteria bilansu mocy wtórnej i nasycenia: IEC 61869-2:2012 (przekładniki prądowe)
i IEC 61869-3:2011 (napięciowe) — stan ``WSKAZANE`` (treść normy poza repozytorium). Moc
znamionowa i klasa uzwojenia: karta katalogowa pozycji. Limit zmiany napięcia obwodu wtórnego
VT (0,5 % pomiarowe / 1,0 % zabezpieczeniowe) i reguła Montsingera starzenia izolacji są
ZAŁOŻENIAMI inżynierskimi programu (nie wartościami normowymi) — rekord niesie je jako dane
przyjęte ``ESTIMATED``, więc kompletność dowodu jest ``NIEPELNY`` (zasada nr 4).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Final

from network_model.solvers.equipment_checks.slad import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
)
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    DanaPrzyjeta,
    FieldQuality,
    OcenaKryterium,
    OdnosnikSladu,
    Przedmiot,
    Wielkosc,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_katalogu,
    podstawa_normy,
    podstawa_zalozenia,
    projekcja_statusu,
    wymaganie_z_ocen,
)

#: Kody zastane kryteriów wyposażenia (kontrakt HTTP `StatusSprawdzenia`) — projekcja rekordu.
KOD_SPELNIA: Final = STATUS_PASS
KOD_NIE_SPELNIA: Final = STATUS_FAIL
KOD_NIEROZSTRZYGNIETE: Final = STATUS_UNAVAILABLE

ZDOLNOSC_CT: Final = "aparatura.przekladnik_pradowy_bilans_nasycenie"
ZDOLNOSC_VT: Final = "aparatura.przekladnik_napieciowy_bilans_spadek"
ZDOLNOSC_STARZENIE: Final = "kabel.starzenie_izolacji"

DOKUMENT_ZALOZEN: Final = "Rejestr założeń inżynierskich kryteriów wyposażenia stacji MV-DESIGN-PRO"

_PODSTAWA_CT: Final = podstawa_normy(
    "IEC 61869-2 (przekładniki prądowe)",
    "2012",
    "5.6 — moc znamionowa i współczynnik graniczny dokładności uzwojenia zabezpieczeniowego",
)
_PODSTAWA_VT: Final = podstawa_normy(
    "IEC 61869-3 (przekładniki napięciowe)",
    "2011",
    "5.6 — moc znamionowa uzwojenia wtórnego",
)
_PODSTAWA_LIMITU_DELTA_U: Final = podstawa_zalozenia(
    DOKUMENT_ZALOZEN,
    "limit zmiany napięcia obwodu wtórnego przekładnika napięciowego wg kategorii uzwojenia",
    uwagi_pl=(
        "0,5 % dla uzwojenia pomiarowego i 1,0 % dla zabezpieczeniowego — praktyka projektowa "
        "obwodów wtórnych, nie wartość normowa"
    ),
)
_PODSTAWA_MONTSINGERA: Final = podstawa_zalozenia(
    DOKUMENT_ZALOZEN,
    "reguła Montsingera (reguła 10 stopni) starzenia izolacji polimerowej",
    uwagi_pl=(
        "przybliżenie inżynierskie zależności Arrheniusa — każde +10 °C ponad temperaturę "
        "znamionową izolacji podwaja szybkość starzenia"
    ),
)
_PODSTAWA_ALF_WYMAGANEGO: Final = podstawa_zalozenia(
    "wymaganie funkcji zabezpieczeniowych pola",
    "ALF_wym = I_k,max / I_1n (krotność prądu zwarciowego względem prądu pierwotnego)",
    wydanie="bieżący stan modelu sieci",
)

_OPIS_OBWODU: Final = (
    "Obwód wtórny dwuprzewodowy jednego uzwojenia przekładnika; rezystancja przewodów "
    "miedzianych w 20 °C (IEC 60228), reaktancja przewodów pominięta."
)
#: CT: nasycenie ocenia się przy prądzie zwarciowym (ALF_wym = I_k,max/I_1n).
_ZAKRES_OBWODU_CT: Final = ZakresWaznosci(
    rodzaj_analizy="SHORT_CIRCUIT",
    opis_pl=_OPIS_OBWODU,
    wykluczenia=(
        "składowa nieokresowa prądu zwarciowego i remanencja rdzenia",
        "nagrzewanie przewodów obwodu wtórnego ponad 20 °C",
    ),
)
#: VT: obwód napięciowy w stanie ustalonym pracy normalnej.
_ZAKRES_OBWODU_VT: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=_OPIS_OBWODU,
    wykluczenia=("nagrzewanie przewodów obwodu wtórnego ponad 20 °C",),
)
_ZAKRES_STARZENIA: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Względna szybkość starzenia izolacji przy stałej temperaturze pracy żyły wobec "
        "temperatury znamionowej izolacji z katalogu."
    ),
    wykluczenia=(
        "zmienny profil obciążenia (wymaga całkowania współczynnika po profilu)",
        "żywotność bezwzględna w latach",
    ),
)

_BRAK_OBWODU_CT: Final = (
    "Dane obwodu wtórnego przekładnika prądowego (prąd znamionowy wtórny, długość i przekrój "
    "przewodów) — uzupełnij obwód w kroku przekładników kreatora stacji."
)
_BRAK_MOCY_CT: Final = (
    "Moc znamionowa uzwojenia przekładnika prądowego — pozycja katalogowa jej nie podaje."
)
_BRAK_ALF: Final = (
    "Współczynnik graniczny dokładności z klasy zabezpieczeniowej (np. 5P20) — wybrana pozycja "
    "nie ma rdzenia zabezpieczeniowego."
)
_BRAK_ALF_WYM: Final = (
    "Wymagany współczynnik graniczny ALF_wym = I_k,max / I_1n z funkcji zabezpieczeniowych "
    "pola — podaj go, żeby ocenić nasycenie."
)
_BRAK_OBWODU_VT: Final = (
    "Dane obwodu wtórnego przekładnika napięciowego (napięcie znamionowe wtórne, długość "
    "i przekrój przewodów) — uzupełnij obwód w kroku przekładników kreatora stacji."
)
_BRAK_MOCY_VT: Final = (
    "Moc znamionowa uzwojenia przekładnika napięciowego — pozycja katalogowa jej nie podaje."
)
_BRAK_KATEGORII_VT: Final = (
    "Kategoria sprawdzanego uzwojenia (pomiarowe albo zabezpieczeniowe) z klasy dokładności — "
    "pozycja nie ma klasy opisującej to uzwojenie, więc limit zmiany napięcia nie jest przyjęty."
)
_BRAK_IZOLACJI: Final = (
    "Typ izolacji i jej temperatura znamionowa długotrwała z pozycji katalogowej kabla."
)
_BRAK_TEMPERATURY_PRACY: Final = "Temperatura pracy żyły kabla (podaj ją w polu kryterium)."


def _slad(wynik: float | None, *kroki: tuple[str, str]) -> tuple[OdnosnikSladu, ...]:
    """Odnośniki do kroków śladu WHITE BOX solvera — tylko gdy wynik został policzony (bez
    wyniku solver nie emituje kroków, więc odnośnik wskazywałby pustkę)."""
    if wynik is None:
        return ()
    return tuple(OdnosnikSladu(krok=krok, opis_pl=opis) for krok, opis in kroki)


def _przedmiot(nazwa_pl: str, opis_pl: str) -> Przedmiot:
    return Przedmiot(element_ref=None, nazwa_pl=nazwa_pl, opis_pl=opis_pl)


def ocena_bilansu_ct(
    *,
    nazwa_pl: str,
    moc_obliczeniowa_va: float | None,
    moc_znamionowa_va: float | None,
    alf_efektywny: float | None,
    alf_wymagany: float | None,
    obwod_kompletny: bool,
    alf_znany: bool,
    wariant_uproszczony: bool,
) -> WynikWymagania:
    """Rekord W bilansu CT: kryterium obciążenia (S2obl ≤ Sn) i nasycenia (ALF_eff ≥ ALF_wym)."""
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_CT)
    przedmiot = _przedmiot(nazwa_pl, "Uzwojenie zabezpieczeniowe przekładnika prądowego pola")
    braki_obciazenia: list[str] = []
    if not obwod_kompletny:
        braki_obciazenia.append(_BRAK_OBWODU_CT)
    if moc_znamionowa_va is None:
        braki_obciazenia.append(_BRAK_MOCY_CT)
    obciazenie = ocena_porownania(
        Porownanie(
            kryterium_id="przekladnik_pradowy.obciazenie",
            opis_pl="Moc obliczeniowa obwodu wtórnego nie większa od mocy znamionowej uzwojenia",
            warunek_latex=r"S_{2obl} \le S_n",
            relacja="NIE_WIECEJ",
            wielkosc_pl="moc obliczeniowa obwodu wtórnego",
            symbol_latex=r"S_{2obl}",
            jednostka="VA",
            wynik=moc_obliczeniowa_va,
            limit=moc_znamionowa_va,
            limit_pl="moc znamionowa uzwojenia z karty katalogowej",
            braki=tuple(braki_obciazenia),
        ),
        przedmiot=przedmiot,
        podstawa=_PODSTAWA_CT,
        podstawa_limitu=podstawa_katalogu(nazwa_pl, "moc znamionowa uzwojenia S_n"),
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_CT,
        slad=_slad(
            moc_obliczeniowa_va,
            ("ct_rezystancja_przewodow", "Rezystancja przewodów obwodu wtórnego"),
            ("ct_bilans_mocy", "Bilans mocy obwodu wtórnego"),
            ("ct_wykorzystanie_mocy", "Wykorzystanie mocy znamionowej przekładnika"),
        ),
    )
    braki_nasycenia: list[str] = []
    if alf_efektywny is None:
        braki_nasycenia.extend(braki_obciazenia)
        if not alf_znany:
            braki_nasycenia.append(_BRAK_ALF)
    if alf_wymagany is None:
        braki_nasycenia.append(_BRAK_ALF_WYM)
    dane_nasycenia = (
        (
            DanaPrzyjeta(
                nazwa_pl="Rezystancja uzwojenia wtórnego przekładnika R_ct",
                wartosc=Wielkosc(wartosc=0.0, jednostka="Ω"),
                powod_pl=(
                    "pozycja katalogowa nie podaje rezystancji uzwojenia — przyjęto moc "
                    "wewnętrzną S_w = 0 (wariant uproszczony ALF_eff = ALF·S_n/S_2obl), wynik "
                    "optymistyczny do potwierdzenia kartą producenta"
                ),
                jakosc=FieldQuality.ESTIMATED,
            ),
        )
        if wariant_uproszczony and alf_efektywny is not None
        else ()
    )
    nasycenie = ocena_porownania(
        Porownanie(
            kryterium_id="przekladnik_pradowy.nasycenie",
            opis_pl=(
                "Efektywny współczynnik graniczny dokładności nie mniejszy od wymaganego przez "
                "funkcje zabezpieczeniowe pola"
            ),
            warunek_latex=r"ALF_{eff} \ge ALF_{wym}",
            relacja="NIE_MNIEJ",
            wielkosc_pl="efektywny współczynnik graniczny dokładności",
            symbol_latex=r"ALF_{eff}",
            jednostka="1",
            wynik=alf_efektywny,
            limit=alf_wymagany,
            limit_pl="krotność prądu zwarciowego względem prądu pierwotnego przekładnika",
            braki=tuple(braki_nasycenia),
            dane_przyjete=dane_nasycenia,
        ),
        przedmiot=przedmiot,
        podstawa=_PODSTAWA_CT,
        podstawa_limitu=_PODSTAWA_ALF_WYMAGANEGO,
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_CT,
        slad=_slad(
            alf_efektywny,
            ("ct_alf_efektywny", "Efektywny współczynnik graniczny dokładności"),
            *(
                (("ct_werdykt_nasycenia", "Kryterium nasycenia przekładnika"),)
                if alf_wymagany is not None
                else ()
            ),
        ),
    )
    return wymaganie_z_ocen(
        wymaganie_id="przekladnik_pradowy.bilans_i_nasycenie",
        nazwa_pl="Bilans mocy wtórnej i nasycenie przekładnika prądowego",
        podstawa=_PODSTAWA_CT,
        oceny=(obciazenie, nasycenie),
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_CT,
    )


def ocena_bilansu_vt(
    *,
    nazwa_pl: str,
    moc_obliczeniowa_va: float | None,
    moc_znamionowa_va: float | None,
    delta_u_procent: float | None,
    limit_delta_u_procent: float | None,
    kategoria_pl: str | None,
    obwod_kompletny: bool,
) -> WynikWymagania:
    """Rekord W bilansu VT: kryterium obciążenia (S2obl ≤ Sn) i zmiany napięcia (ΔU ≤ limit)."""
    zdolnosc = classify_dynamic_capability(ZDOLNOSC_VT)
    przedmiot = _przedmiot(nazwa_pl, "Uzwojenie wtórne przekładnika napięciowego pola")
    braki_obciazenia: list[str] = []
    if not obwod_kompletny:
        braki_obciazenia.append(_BRAK_OBWODU_VT)
    if moc_znamionowa_va is None:
        braki_obciazenia.append(_BRAK_MOCY_VT)
    obciazenie = ocena_porownania(
        Porownanie(
            kryterium_id="przekladnik_napieciowy.obciazenie",
            opis_pl="Moc obliczeniowa obwodu wtórnego nie większa od mocy znamionowej uzwojenia",
            warunek_latex=r"S_{2obl} \le S_n",
            relacja="NIE_WIECEJ",
            wielkosc_pl="moc obliczeniowa obwodu wtórnego",
            symbol_latex=r"S_{2obl}",
            jednostka="VA",
            wynik=moc_obliczeniowa_va,
            limit=moc_znamionowa_va,
            limit_pl="moc znamionowa uzwojenia z karty katalogowej",
            braki=tuple(braki_obciazenia),
        ),
        przedmiot=przedmiot,
        podstawa=_PODSTAWA_VT,
        podstawa_limitu=podstawa_katalogu(nazwa_pl, "moc znamionowa uzwojenia S_n"),
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_VT,
        slad=_slad(moc_obliczeniowa_va, ("vt_bilans_mocy", "Bilans mocy obwodu wtórnego")),
    )
    braki_spadku: list[str] = []
    if delta_u_procent is None:
        braki_spadku.extend(braki_obciazenia)
    if limit_delta_u_procent is None:
        braki_spadku.append(_BRAK_KATEGORII_VT)
    dane_spadku = (
        ()
        if limit_delta_u_procent is None
        else (
            DanaPrzyjeta(
                nazwa_pl=f"Limit zmiany napięcia obwodu wtórnego ({kategoria_pl})",
                wartosc=Wielkosc(wartosc=limit_delta_u_procent, jednostka="%"),
                powod_pl=(
                    "założenie inżynierskie programu wg kategorii uzwojenia z klasy dokładności "
                    "— nie wartość normowa"
                ),
                jakosc=FieldQuality.ESTIMATED,
            ),
        )
    )
    spadek = ocena_porownania(
        Porownanie(
            kryterium_id="przekladnik_napieciowy.zmiana_napiecia",
            opis_pl="Zmiana napięcia na przewodach obwodu wtórnego nie większa od limitu kategorii",
            warunek_latex=r"\Delta U\% \le \Delta U_{lim}\%",
            relacja="NIE_WIECEJ",
            wielkosc_pl="zmiana napięcia obwodu wtórnego",
            symbol_latex=r"\Delta U\%",
            jednostka="%",
            wynik=delta_u_procent,
            limit=limit_delta_u_procent,
            limit_pl=None if kategoria_pl is None else f"kategoria: {kategoria_pl}",
            braki=tuple(braki_spadku),
            dane_przyjete=dane_spadku,
        ),
        przedmiot=przedmiot,
        podstawa=_PODSTAWA_VT,
        podstawa_limitu=_PODSTAWA_LIMITU_DELTA_U,
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_VT,
        slad=_slad(
            delta_u_procent,
            ("vt_rezystancja_przewodow", "Rezystancja przewodów obwodu wtórnego"),
            ("vt_prad_obwodu", "Prąd obwodu wtórnego"),
            ("vt_zmiana_napiecia", "Zmiana napięcia na przewodach obwodu wtórnego"),
            *(
                (("vt_werdykt_spadku", "Kryterium zmiany napięcia obwodu wtórnego"),)
                if limit_delta_u_procent is not None
                else ()
            ),
        ),
    )
    return wymaganie_z_ocen(
        wymaganie_id="przekladnik_napieciowy.bilans_i_zmiana_napiecia",
        nazwa_pl="Bilans mocy wtórnej i zmiana napięcia obwodu przekładnika napięciowego",
        podstawa=_PODSTAWA_VT,
        oceny=(obciazenie, spadek),
        zdolnosc=zdolnosc,
        zakres=_ZAKRES_OBWODU_VT,
    )


def ocena_starzenia_kabla(
    *,
    nazwa_pl: str,
    temperatura_pracy_c: float | None,
    temperatura_znamionowa_c: float | None,
    izolacja_znana: bool,
) -> OcenaKryterium:
    """Rekord K starzenia izolacji: temperatura pracy żyły nie wyższa od znamionowej izolacji
    (współczynnik Montsingera V ≤ 1)."""
    braki: list[str] = []
    if temperatura_znamionowa_c is None or not izolacja_znana:
        braki.append(_BRAK_IZOLACJI)
    if temperatura_pracy_c is None:
        braki.append(_BRAK_TEMPERATURY_PRACY)
    dane = (
        ()
        if temperatura_pracy_c is None
        else (
            DanaPrzyjeta(
                nazwa_pl="Temperatura pracy żyły kabla",
                wartosc=Wielkosc(wartosc=temperatura_pracy_c, jednostka="°C"),
                powod_pl=(
                    "podana przez projektanta w polu kryterium — nie wyznaczona z rozpływu "
                    "i warunków ułożenia kabla"
                ),
                jakosc=FieldQuality.ESTIMATED,
            ),
        )
    )
    # Bez typu izolacji i jej temperatury znamionowej porównanie nie ma odniesienia — wynik
    # nie jest pokazywany jako policzony (brak danych ≠ spełnia).
    wynik = temperatura_pracy_c if izolacja_znana and temperatura_znamionowa_c is not None else None
    return ocena_porownania(
        Porownanie(
            kryterium_id="kabel.starzenie_izolacji",
            opis_pl=(
                "Temperatura pracy żyły nie wyższa od temperatury znamionowej izolacji "
                "(starzenie nie szybsze niż znamionowe)"
            ),
            warunek_latex=r"\theta_{pracy} \le \theta_{zn} \iff V = 2^{\Delta T/10} \le 1",
            relacja="NIE_WIECEJ",
            wielkosc_pl="temperatura pracy żyły",
            symbol_latex=r"\theta_{pracy}",
            jednostka="°C",
            wynik=wynik,
            limit=temperatura_znamionowa_c,
            limit_pl="temperatura znamionowa długotrwała izolacji z karty katalogowej",
            braki=tuple(braki),
            dane_przyjete=dane,
        ),
        przedmiot=_przedmiot(nazwa_pl, "Izolacja kabla przy stałej temperaturze pracy żyły"),
        podstawa=_PODSTAWA_MONTSINGERA,
        podstawa_limitu=podstawa_katalogu(nazwa_pl, "temperatura znamionowa izolacji θ_zn"),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_STARZENIE),
        zakres=_ZAKRES_STARZENIA,
        slad=_slad(
            wynik,
            ("kabel_roznica_temperatur", "Różnica temperatury pracy i znamionowej izolacji"),
            ("kabel_wspolczynnik_starzenia", "Względny współczynnik starzenia"),
            ("kabel_wzgledna_zywotnosc", "Względna żywotność izolacji"),
        ),
    )


def kod_statusu(oceny: Sequence[OcenaKryterium]) -> str:
    """Kod zastany kryterium (``PASS`` / ``FAIL`` / ``UNAVAILABLE``) — projekcja rekordów."""
    return projekcja_statusu(
        oceny,
        spelnia=KOD_SPELNIA,
        nie_spelnia=KOD_NIE_SPELNIA,
        nierozstrzygniete=KOD_NIEROZSTRZYGNIETE,
    )
