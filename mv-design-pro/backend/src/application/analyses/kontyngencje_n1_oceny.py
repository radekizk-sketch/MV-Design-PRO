"""Rekordy werdyktu wyjaśnialnego kontyngencji N-1 (karta WERDYKT-MIGRACJA-190).

Każda kontyngencja (i przypadek bazowy N-0) niesie trzy rekordy — po jednym na kategorię
dotkliwości, w kolejności rankingu:

- ``odbiory_bez_zasilania`` — rekord K: liczba odbiorów pozbawionych zasilania po wyłączeniu
  elementu wobec limitu 0 (kryterium N-1 programu); wielkość wynika z topologii wariantu, więc
  jest rozstrzygnięta także przy niezbieżnym biegu;
- ``przeciazenia`` — rekord W nad składowymi kontroli obciążenia gałęzi i transformatorów
  walidacji energetycznej wariantu (``analysis/energy_validation``): pozycja największa
  i zbiorcza składowa pozycji bez wyznaczonej wielkości (``_skladowe_kontroli``);
- ``naruszenia_napiecia`` — rekord W tak samo nad kontrolą odchylenia napięcia szyn.

Predykaty parami z jednego źródła: pozycja walidacji trafia do licznika naruszeń wyłącznie, gdy
jej status zastany to ``FAIL`` — a ten jest projekcją rekordu ``NIE_SPELNIA`` reguły
``analysis.energy_validation.oceny.ocena_pozycji``. Składowa „największa” jest oceniana TĄ
SAMĄ regułą przy relacji „nie więcej”, więc rekord W kategorii jest ``NIE_SPELNIA`` dokładnie
wtedy, gdy licznik kategorii jest dodatni (przypięte testem na każdej kontyngencji sieci
testowych). Brak wielkości (bieg niezbieżny, gałąź bez obciążalności) nie jest spełnieniem:
rekord W niesie brak, a ekran nie wnioskuje z licznika zero.

Warstwa APLIKACJI — zero fizyki: wielkości przychodzą z wyniku biegu wariantu i z wyspy
węzła bilansującego (``build_slack_island``), tu tylko porównanie przez pakiet ``werdykt``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Final

from analysis.energy_validation.models import EnergyCheckType, EnergyValidationConfig
from analysis.energy_validation.oceny import ocena_pozycji
from solver_input.provenance import classify_dynamic_capability
from werdykt import (
    OcenaKryterium,
    OdnosnikSladu,
    PodstawaWymagania,
    Przedmiot,
    WynikWymagania,
    ZakresWaznosci,
)
from werdykt.porownanie import (
    Porownanie,
    ocena_porownania,
    podstawa_zalozenia,
    wymaganie_z_ocen,
)

#: Zdolność dowodowa analizy N-1 (rejestr ``solver_input.provenance``).
ZDOLNOSC_N1: Final = "rozplyw.kontyngencje_n1"

_ODNIESIENIE: Final = "application/analyses/kontyngencje_n1.py"

_ZAKRES_N1: Final = ZakresWaznosci(
    rodzaj_analizy="POWER_FLOW",
    opis_pl=(
        "Stan ustalony sieci po wyłączeniu jednego elementu przesyłowego (linia, kabel, "
        "transformator) przy obciążeniach i generacji zapisanych w modelu — osobny bieg "
        "rozpływu mocy wariantu bez tego elementu."
    ),
    wykluczenia=(
        "przebieg przejściowy wyłączenia i działanie zabezpieczeń",
        "przełączenia ruchowe po zakłóceniu (rezerwa, samoczynne załączanie rezerwy)",
        "wyłączenia wielokrotne (N-2 i dalsze)",
        "aparaty łączeniowe i źródła jako kontyngencje",
        "przeciążalność krótkotrwała i cykliczna urządzeń",
    ),
)

_DOKUMENT_N1: Final = "Kryterium N-1 analizy kontyngencji programu"


def _podstawa_n1(jednostka_redakcyjna: str, uwagi_pl: str) -> PodstawaWymagania:
    return podstawa_zalozenia(_DOKUMENT_N1, jednostka_redakcyjna, uwagi_pl=uwagi_pl)


_PODSTAWA_ZASILANIA: Final = _podstawa_n1(
    "zasilanie odbiorów po wyłączeniu pojedynczego elementu przesyłowego",
    "kryterium projektowe niezawodności zasilania (żaden odbiór bez zasilania po wyłączeniu "
    "jednego elementu), nie wartość normowa; wymaganie operatora sieci może je zaostrzyć "
    "albo złagodzić",
)
_PODSTAWA_PRZECIAZEN: Final = _podstawa_n1(
    "obciążenie gałęzi i transformatorów w stanie po wyłączeniu elementu",
    "limity składowych z progów walidacji energetycznej sieci (ten sam próg co stan N-0)",
)
_PODSTAWA_NAPIEC: Final = _podstawa_n1(
    "odchylenie napięcia szyn w stanie po wyłączeniu elementu",
    "limity składowych z pasma odchylenia napięcia walidacji energetycznej (ten sam co stan "
    "N-0)",
)

#: Rodzaje kontroli walidacji energetycznej per kategoria rekordu W (jedno źródło z
#: ``kontyngencje_n1._skutki_z_walidacji`` — moduł serwisu importuje te zbiory stąd).
TYPY_PRZECIAZENIA: Final[frozenset[str]] = frozenset({"BRANCH_LOADING", "TRANSFORMER_LOADING"})
TYP_NAPIECIA: Final = "VOLTAGE_DEVIATION"

_POWOD_NIEZBIEZNOSCI: Final = (
    "bieg rozpływu wariantu nie dał rozwiązania — wielkości z wyniku rozpływu nie wyznaczono"
)
_POWOD_BRAKU_POZYCJI: Final = (
    "wariant nie ma żadnego elementu tej kategorii (brak pozycji walidacji do oceny)"
)
#: Przedmiot składowej zbiorczej kategorii, gdy bieg wariantu nie dał rozwiązania.
_NAZWA_ZBIORCZA: Final[dict[EnergyCheckType, str]] = {
    EnergyCheckType.BRANCH_LOADING: "gałęzie wariantu (linie i kable)",
    EnergyCheckType.TRANSFORMER_LOADING: "transformatory wariantu",
    EnergyCheckType.VOLTAGE_DEVIATION: "szyny wariantu",
}


def _przedmiot(element_ref: str | None, nazwa_pl: str) -> Przedmiot:
    """Przedmiot oceny: wariant N-1 wskazanego elementu albo (``element_ref is None``) stan
    bazowy N-0 liczony tą samą ścieżką."""
    return Przedmiot(
        element_ref=element_ref,
        nazwa_pl=nazwa_pl,
        opis_pl=(
            "Sieć w stanie normalnym (bez wyłączeń) — odniesienie dla kontyngencji"
            if element_ref is None
            else "Sieć w stanie po wyłączeniu wskazanego elementu (wariant N-1)"
        ),
    )


def _ocena_zasilania(
    *,
    element_ref: str | None,
    nazwa_pl: str,
    odbiory_bez_zasilania: int | None,
    dotyczy: bool,
    powod_niestosowalnosci_pl: str,
) -> OcenaKryterium:
    return ocena_porownania(
        Porownanie(
            kryterium_id="kontyngencje_n1.zasilanie_odbiorow",
            opis_pl="Żaden odbiór nie pozostaje poza wyspą zasilaną z węzła bilansującego",
            warunek_latex=r"n_{\text{odb}} \le 0",
            relacja="NIE_WIECEJ",
            wielkosc_pl="liczba odbiorów poza wyspą węzła bilansującego",
            symbol_latex=r"n_{\text{odb}}",
            jednostka="1",
            wynik=None if odbiory_bez_zasilania is None else float(odbiory_bez_zasilania),
            limit=0.0,
            limit_pl="dopuszczalna liczba odbiorów bez zasilania w stanie N-1",
            dotyczy=dotyczy,
            powod_stosowalnosci_pl=(
                "kontyngencja wyłączenia elementu przesyłowego"
                if dotyczy
                else powod_niestosowalnosci_pl
            ),
        ),
        przedmiot=_przedmiot(element_ref, nazwa_pl),
        podstawa=_PODSTAWA_ZASILANIA,
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_N1),
        zakres=_ZAKRES_N1,
        slad=(
            ()
            if odbiory_bez_zasilania is None or not dotyczy
            else (
                OdnosnikSladu(
                    krok="kontyngencje_n1.wyspa_zasilana",
                    opis_pl=(
                        "Wyspa węzła bilansującego wariantu (ślad kontyngencji: szyny zasilane, "
                        "szyny i odbiory poza wyspą)"
                    ),
                ),
            )
        ),
        odniesienie=_ODNIESIENIE,
    )


def _nazwa_pozycji(item: Mapping[str, Any]) -> str:
    return str(item["target_name"])


def _skladowe_kontroli(
    typ: EnergyCheckType,
    pozycje: Sequence[Mapping[str, Any]],
    indeks_ref: Mapping[str, str],
) -> list[OcenaKryterium]:
    """Składowe jednej kontroli walidacji wariantu — ZWARTE, bez utraty rozstrzygnięcia.

    - pozycja o NAJWIĘKSZEJ wielkości spośród wyznaczonych (remis: rosnąco po identyfikatorze
      pozycji) oceniona TĄ SAMĄ regułą co pozycja walidacji (``ocena_pozycji``, te same wejścia
      co builder walidacji: wielkość i limit przekroczenia). Kryterium jest relacją „nie
      więcej”, więc pozycja największa narusza limit wtedy i tylko wtedy, gdy narusza go
      KTÓRAKOLWIEK pozycja — to ten sam warunek, który wpisuje pozycję do listy naruszeń;
    - pozycje bez wyznaczonej wielkości (gałąź bez obciążalności, szyna bez napięcia) — jedna
      składowa ``NIE_OCENIONO`` z powodami i nazwami pozycji: brak danej nie jest spełnieniem.

    Zbiorczy rekord zamiast rekordu na każdą pozycję: wariant sieci referencyjnej 53 stacji
    ma ~630 pozycji, a widok niesie ponad sto wariantów — rekord per pozycja rozdąłby odpowiedź
    o rzędy wielkości przy identycznym rozstrzygnięciu.
    """
    wyznaczone = sorted(
        (item for item in pozycje if item["observed_value"] is not None),
        key=lambda item: (-float(item["observed_value"]), str(item["target_id"])),
    )
    niewyznaczone = sorted(
        (item for item in pozycje if item["observed_value"] is None),
        key=lambda item: str(item["target_id"]),
    )
    skladowe: list[OcenaKryterium] = []
    if wyznaczone:
        najwieksza = wyznaczone[0]
        skladowe.append(
            ocena_pozycji(
                check_type=typ,
                nazwa_pl=(
                    f"{_nazwa_pozycji(najwieksza)} — największa wartość spośród "
                    f"{len(wyznaczone)} pozycji ({_NAZWA_ZBIORCZA[typ]})"
                ),
                wynik=float(najwieksza["observed_value"]),
                limit=najwieksza["limit_fail"],
                slad_krok=f"kontyngencje_n1.{typ.value.lower()}",
                odniesienie=_ODNIESIENIE,
                zakres=_ZAKRES_N1,
                element_ref=indeks_ref.get(str(najwieksza["target_id"])),
                kryterium_sufiks="najwieksza",
            )
        )
    if niewyznaczone:
        powody: dict[str, list[str]] = {}
        for item in niewyznaczone:
            powody.setdefault(str(item["why_pl"]), []).append(_nazwa_pozycji(item))
        skladowe.append(
            ocena_pozycji(
                check_type=typ,
                nazwa_pl=f"{len(niewyznaczone)} pozycji bez wyznaczonej wielkości "
                f"({_NAZWA_ZBIORCZA[typ]})",
                wynik=None,
                limit=niewyznaczone[0]["limit_fail"],
                braki=tuple(
                    f"{powod.rstrip('.')} — {', '.join(nazwy)}"
                    for powod, nazwy in sorted(powody.items())
                ),
                odniesienie=_ODNIESIENIE,
                zakres=_ZAKRES_N1,
                kryterium_sufiks="niewyznaczone",
            )
        )
    return skladowe


def _wymaganie_kategorii(
    *,
    wymaganie_id: str,
    nazwa_pl: str,
    podstawa: PodstawaWymagania,
    typy: Sequence[EnergyCheckType],
    pozycje_walidacji: Sequence[Mapping[str, Any]] | None,
    indeks_ref: Mapping[str, str],
    config: EnergyValidationConfig,
    powod_niestosowalnosci_pl: str | None,
) -> WynikWymagania:
    """Rekord W kategorii nad składowymi kontroli tej kategorii.

    Bieg bez rozwiązania (``pozycje_walidacji is None``) — po jednej składowej ``NIE_OCENIONO``
    na kontrolę, z powodem; bieg zbieżny bez żadnej pozycji kategorii — wymaganie nie dotyczy
    wariantu (z powodem); element wyłączony już w modelu bazowym — nie dotyczy (z powodem)."""
    powod = powod_niestosowalnosci_pl
    skladowe: list[OcenaKryterium] = []
    if powod is None and pozycje_walidacji is None:
        skladowe = [
            ocena_pozycji(
                check_type=typ,
                nazwa_pl=_NAZWA_ZBIORCZA[typ],
                wynik=None,
                limit=_limit_przekroczenia(typ, config),
                braki=(_POWOD_NIEZBIEZNOSCI,),
                odniesienie=_ODNIESIENIE,
                zakres=_ZAKRES_N1,
                kryterium_sufiks="niewyznaczone",
            )
            for typ in typy
        ]
    elif powod is None and pozycje_walidacji is not None:
        for typ in typy:
            skladowe += _skladowe_kontroli(
                typ,
                [item for item in pozycje_walidacji if item["check_type"] == typ.value],
                indeks_ref,
            )
        if not skladowe:
            powod = _POWOD_BRAKU_POZYCJI
    return wymaganie_z_ocen(
        wymaganie_id=wymaganie_id,
        nazwa_pl=nazwa_pl,
        podstawa=podstawa,
        oceny=tuple(skladowe),
        zdolnosc=classify_dynamic_capability(ZDOLNOSC_N1),
        zakres=_ZAKRES_N1,
        odniesienie=_ODNIESIENIE,
        dotyczy=powod is None,
        powod_stosowalnosci_pl=(
            "kontyngencja wyłączenia elementu przesyłowego" if powod is None else powod
        ),
    )


def _limit_przekroczenia(typ: EnergyCheckType, config: EnergyValidationConfig) -> float:
    """Limit przekroczenia kontroli — ten sam parametr konfiguracji, który builder walidacji
    podaje jako ``limit_fail`` pozycji tej kontroli."""
    if typ is EnergyCheckType.VOLTAGE_DEVIATION:
        return float(config.voltage_fail_pct)
    return float(config.loading_fail_pct)


def oceny_kontyngencji(
    *,
    element_ref: str | None,
    nazwa_pl: str,
    pozycje_walidacji: Sequence[Mapping[str, Any]] | None,
    odbiory_bez_zasilania: int | None,
    config: EnergyValidationConfig,
    indeks_ref: Mapping[str, str] | None = None,
    powod_niestosowalnosci_pl: str | None = None,
) -> dict[str, dict[str, Any]]:
    """Trzy rekordy kategorii dotkliwości (słowniki JSON) dla jednego wariantu.

    ``pozycje_walidacji`` — pozycje widoku walidacji energetycznej biegu wariantu; ``None`` =
    bieg bez rozwiązania (rekordy W kategorii rozpływowych niosą składowe ``NIE_OCENIONO``).
    ``config`` — konfiguracja walidacji biegu (limity składowych przy biegu bez rozwiązania).
    ``indeks_ref`` — identyfikator grafu → ``ref_id`` modelu (element pozycji decydującej).
    ``powod_niestosowalnosci_pl`` — wariant, który nie jest kontyngencją (element wyłączony
    już w modelu bazowym): wszystkie trzy rekordy ``NIE_DOTYCZY`` z tym powodem.
    """
    dotyczy = powod_niestosowalnosci_pl is None
    indeks = indeks_ref or {}
    rekordy: dict[str, OcenaKryterium | WynikWymagania] = {
        "odbiory_bez_zasilania": _ocena_zasilania(
            element_ref=element_ref,
            nazwa_pl=nazwa_pl,
            odbiory_bez_zasilania=odbiory_bez_zasilania if dotyczy else None,
            dotyczy=dotyczy,
            powod_niestosowalnosci_pl=powod_niestosowalnosci_pl or "",
        ),
        "przeciazenia": _wymaganie_kategorii(
            wymaganie_id="kontyngencje_n1.przeciazenia",
            nazwa_pl=f"Obciążenie gałęzi i transformatorów — {nazwa_pl}",
            podstawa=_PODSTAWA_PRZECIAZEN,
            typy=(EnergyCheckType.BRANCH_LOADING, EnergyCheckType.TRANSFORMER_LOADING),
            pozycje_walidacji=pozycje_walidacji,
            indeks_ref=indeks,
            config=config,
            powod_niestosowalnosci_pl=powod_niestosowalnosci_pl,
        ),
        "naruszenia_napiecia": _wymaganie_kategorii(
            wymaganie_id="kontyngencje_n1.napiecia",
            nazwa_pl=f"Odchylenie napięcia szyn — {nazwa_pl}",
            podstawa=_PODSTAWA_NAPIEC,
            typy=(EnergyCheckType.VOLTAGE_DEVIATION,),
            pozycje_walidacji=pozycje_walidacji,
            indeks_ref=indeks,
            config=config,
            powod_niestosowalnosci_pl=powod_niestosowalnosci_pl,
        ),
    }
    return {klucz: rekord.model_dump(mode="json") for klucz, rekord in rekordy.items()}
