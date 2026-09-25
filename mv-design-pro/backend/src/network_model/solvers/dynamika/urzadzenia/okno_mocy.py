"""Okno mocy czynnej urzadzenia przeksztaltnikowego — JEDNO miejsce ograniczenia.

PO CO OSOBNY TYP. Ten sam przeksztaltnik nadazny wystepuje w kontrakcie ENM w
TRZECH rolach: jako zrodlo samodzielne, jako czlon magazynu i jako czlon turbiny
wiatrowej typu 3/4. Granice mocy czynnej sa w kazdej z tych rol inne i pochodza
z innego miejsca kontraktu:

* zrodlo samodzielne — z mocy znamionowej przeksztaltnika (`s_n_mva`), symetrycznie;
* magazyn — z `p_ladowania_max_kw` i `p_rozladowania_max_kw`, NIESYMETRYCZNIE,
  dodatkowo zamykane przez stan naladowania (pusty magazyn nie rozladowuje sie,
  pelny nie laduje);
* turbina wiatrowa — z mocy przeksztaltnika, ale wylacznie w strone oddawania
  (turbina nie pobiera mocy czynnej z sieci w tym modelu).

Gdyby kazde z tych miejsc mialo wlasny ogranicznik, ten sam predykat „czy moc
miesci sie w oknie" istnialby w trzech kopiach — a rownowaga poczatkowa
sprawdzana jest tym samym predykatem, ktorym bieg ogranicza zadanie. Dwa
niezalezne warunki, ktore „dzis sie zgadzaja", sa defektem czekajacym na dane
brzegowe (CLAUDE.md, KLASA NIE INSTANCJA p. 3), dlatego jest tu jeden typ z
jednym predykatem uzywanym w obu miejscach.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import ClassVar

from ..kontrakty import KOD_PARAMETRY_SPRZECZNE, OdmowaDynamiki
from .pochodne_kierunkowe import Dual, ogranicz


@dataclass(frozen=True)
class OknoMocy:
    """Dopuszczalny przedzial mocy czynnej [dol, gora] w pu bazy UKLADU.

    `dol_pu < 0` znaczy „urzadzenie potrafi pobierac moc czynna" (magazyn w
    ladowaniu). Zerowa szerokosc okna (`dol == gora`) jest dopuszczalna i znaczy
    „moc czynna zablokowana" — tak wyglada magazyn na granicy stanu naladowania.

    `domkniecie_gory` to udzial (0..1) gornej granicy pozostawiony przez element
    ZALEZNY OD STANU — w tej bibliotece crowbar turbiny DFIG. Jest liczba dualna,
    a nie zwyklym mnoznikiem, bo jego gradient MUSI wejsc do jakobianu: stan
    crowbar wplywa na zadanie mocy, wiec blok `df/dx` bez tej sciezki bylby
    niezgodny z wlasna funkcja (pomiar roznicy skonczonej: 2,1e+01 zamiast ~1e-7).
    Zwezenia NIEZALEZNE od stanu (stan naladowania magazynu, granice ladowania)
    wchodza przez `zwezone` jako zwykle liczby — ich pochodna jest tozsamosciowo
    zerowa poza punktem przelaczenia.
    """

    dol_pu: float
    gora_pu: float
    domkniecie_gory: Dual | None = None

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = (
        (
            "domkniecie_gory",
            "domkniecie ZALEZNE OD STANU (crowbar) skladane w trakcie "
            "liczenia pochodnych (`z_domknieciem`); w urzadzeniu zbudowanym przez fabryke "
            "jest zawsze `None`, a nastawy crowbar wchodza do odcisku przez `crowbar`",
        ),
    )

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Komplet parametrow do odcisku migawki — jawnie, pole po polu."""
        return {
            "dol_pu": self.dol_pu,
            "gora_pu": self.gora_pu,
        }

    def __post_init__(self) -> None:
        if self.dol_pu > self.gora_pu:
            raise OdmowaDynamiki(
                KOD_PARAMETRY_SPRZECZNE,
                f"Okno mocy [{self.dol_pu}, {self.gora_pu}] pu jest puste "
                "(dolna granica powyzej gornej)",
                dol_pu=self.dol_pu,
                gora_pu=self.gora_pu,
            )

    def granica_gorna(self) -> Dual:
        """Gorna granica z uwzglednieniem domkniecia zaleznego od stanu."""
        if self.domkniecie_gory is None:
            return Dual(self.gora_pu)
        return self.domkniecie_gory * self.gora_pu

    def ogranicz(self, moc: Dual) -> Dual:
        """Zadanie mocy czynnej sprowadzone do okna (gradient galezi aktywnej)."""
        return ogranicz(moc, self.dol_pu, self.granica_gorna())

    def zawiera(self, moc_pu: float) -> bool:
        """Ten sam predykat, ktorym `ogranicz` decyduje o nasyceniu."""
        return self.dol_pu <= moc_pu <= self.granica_gorna().wartosc

    def zwezone(self, *, dol_pu: float | None = None, gora_pu: float | None = None) -> OknoMocy:
        """Okno zwezone przez warunek NIEZALEZNY od stanu (np. stan naladowania)."""
        return OknoMocy(
            dol_pu=self.dol_pu if dol_pu is None else max(self.dol_pu, dol_pu),
            gora_pu=self.gora_pu if gora_pu is None else min(self.gora_pu, gora_pu),
            domkniecie_gory=self.domkniecie_gory,
        )

    def z_domknieciem(self, udzial: Dual) -> OknoMocy:
        """Okno z domknieciem gornej granicy ZALEZNYM od stanu (crowbar)."""
        return OknoMocy(dol_pu=self.dol_pu, gora_pu=self.gora_pu, domkniecie_gory=udzial)


def okno_symetryczne(moc_znamionowa_pu: float) -> OknoMocy:
    """Okno `[-S_n, +S_n]` — przeksztaltnik bez wlasnego ograniczenia kierunku."""
    return OknoMocy(dol_pu=-moc_znamionowa_pu, gora_pu=moc_znamionowa_pu)


def okno_tylko_oddawanie(moc_znamionowa_pu: float) -> OknoMocy:
    """Okno `[0, +S_n]` — zrodlo, ktore nie pobiera mocy czynnej z sieci."""
    return OknoMocy(dol_pu=0.0, gora_pu=moc_znamionowa_pu)


def moc_znamionowa_pu(s_n_mva: float, s_bazowa_mva: float) -> float:
    """Moc znamionowa urzadzenia w pu bazy UKLADU — jedno miejsce przeliczenia."""
    if s_bazowa_mva <= 0.0:
        raise OdmowaDynamiki(
            KOD_PARAMETRY_SPRZECZNE,
            f"Baza mocy musi byc dodatnia (otrzymano {s_bazowa_mva})",
            s_bazowa_mva=s_bazowa_mva,
        )
    return s_n_mva / s_bazowa_mva


__all__ = [
    "OknoMocy",
    "moc_znamionowa_pu",
    "okno_symetryczne",
    "okno_tylko_oddawanie",
]
