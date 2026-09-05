"""Tłumacz `case_id` → klucz Canonical Project Twin (CV-1; JEDYNE miejsce tłumaczenia).

docs/architecture/CANONICAL_TWIN_ARCHITECTURE.md §A.2: projekt posiada jeden kanoniczny
model sieci; przypadek obliczeniowy jest konfiguracją analizy. Warstwa API nadal
adresuje model przez `/api/cases/{case_id}/enm/...` (fasada na czas migracji
stranglerowej), ale magazyn ENM czyta i pisze WYŁĄCZNIE pod kluczem projektu
(`enm/klucz_twin.py`). Tłumaczenie jest jawne: przypadek spoza bazy = błąd
`PrzypadekBezProjektuError`, nigdy „utwórz model domyślny".

Migracja zastanych plików per przypadek odbywa się tu, przy PIERWSZYM
tłumaczeniu dla projektu (`migruj_projekt_z_legacy`): model przypadku aktywnego
staje się modelem projektu, pozostałe przypadki lądują w
`legacy_przypadki/` z manifestem (ZGODNY / ROZBIEZNY). Wynik migracji jest
zwracany wołającemu i zapisany w manifeście — nic nie ginie po cichu.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from enm import store
from enm.klucz_twin import PrzypadekBezProjektuError, klucz_twin_projektu

#: Klucze projektów, dla których migracja z plików per przypadek już się odbyła
#: w tym procesie (idempotencja: powtórne wywołanie nie skanuje przypadków).
_zmigrowane_projekty: set[str] = set()


@dataclass(frozen=True)
class WynikMigracjiProjektu:
    klucz_projektu: str
    wyniki: tuple[store.WynikMigracjiKlucza, ...]

    @property
    def rozbiezne(self) -> tuple[store.WynikMigracjiKlucza, ...]:
        return tuple(w for w in self.wyniki if w.status == "ROZBIEZNY")


def _project_id_przypadku(case_id: str, uow_factory: Callable[[], object]) -> UUID:
    try:
        parsed = UUID(str(case_id))
    except ValueError as exc:
        raise PrzypadekBezProjektuError(
            f"case_id {case_id!r} nie jest identyfikatorem przypadku (UUID)"
        ) from exc
    with uow_factory() as uow:  # type: ignore[attr-defined]
        study_case = uow.cases.get_study_case(parsed)  # type: ignore[attr-defined]
    if study_case is None:
        raise PrzypadekBezProjektuError(
            f"przypadek {case_id} nie istnieje w bazie — nie należy do żadnego projektu"
        )
    return UUID(str(study_case.project_id))


def kolejnosc_promocji(przypadki: Sequence[str], aktywny: str | None) -> list[str]:
    """Kolejność, w jakiej przypadki ubiegają się o rolę modelu projektu — JEDNA reguła.

    Pierwszy w kolejności jest przypadek AKTYWNY (to on odpowiada temu, co projektant
    ostatnio widział na ekranie), a po nim pozostałe w porządku, w jakim podał je
    wołający. Reguła siedzi tutaj, bo listę przypadków dostarczają TRZY różne źródła:
    baza (`migruj_projekt_z_legacy_z_repozytorium`), zestaw przypadków eksportu
    archiwum (`project_archive/service.py::_collect_enm`) i wpisy wewnątrz archiwum
    przy imporcie (`…::import_project`). Trzy kopie tej samej reguły byłyby trzema
    okazjami do rozjazdu — kolejność decyduje o tym, CZYJ model zostaje modelem
    projektu, więc rozjazd byłby cichą podmianą sieci.
    """
    kolejnosc: list[str] = []
    if aktywny:
        kolejnosc.append(aktywny)
    kolejnosc.extend(c for c in przypadki if c not in kolejnosc)
    return kolejnosc


def migruj_projekt_z_legacy_z_repozytorium(
    project_id: UUID, przypadki_repo: Any
) -> WynikMigracjiProjektu:
    """Migracja projektu — RDZEŃ; wołający podaje repozytorium przypadków.

    Wariant dla konsumenta, który ma repozytorium, ale nie `uow_factory`: eksport i
    import archiwum projektu (`ProjectArchiveService` trzyma sesję, nie fabrykę
    jednostek pracy). Wersja z `uow_factory` (niżej) otwiera jednostkę pracy i
    deleguje TUTAJ, więc źródło listy przypadków i kolejność promocji są w obu
    drogach te same.

    Idempotentne w procesie (`_zmigrowane_projekty`): powtórne wywołanie dla tego
    samego projektu nie skanuje przypadków ponownie.
    """
    klucz = klucz_twin_projektu(project_id)
    if klucz in _zmigrowane_projekty:
        return WynikMigracjiProjektu(klucz, ())
    przypadki = [str(c.id) for c in przypadki_repo.list_study_cases(project_id)]
    aktywny = przypadki_repo.get_active_study_case(project_id)
    kolejnosc = kolejnosc_promocji(przypadki, str(aktywny.id) if aktywny is not None else None)
    wyniki: list[store.WynikMigracjiKlucza] = []
    for indeks, case_id in enumerate(kolejnosc):
        wyniki.append(
            store.migruj_klucz_przypadku_do_projektu(
                case_id, klucz, przyjmij_jako_model_projektu=(indeks == 0)
            )
        )
    _zmigrowane_projekty.add(klucz)
    return WynikMigracjiProjektu(klucz, tuple(wyniki))


def migruj_projekt_z_legacy(
    project_id: UUID, uow_factory: Callable[[], object]
) -> WynikMigracjiProjektu:
    """Przenieś modele zastane pod kluczami przypadków projektu pod klucz projektu.

    Kolejność jest deterministyczna i jawna: najpierw przypadek AKTYWNY projektu
    (`uow.cases.get_active_study_case`), a gdy go nie ma — pierwszy przypadek w
    porządku `list_study_cases`; ten jeden przyjmuje rolę modelu projektu
    (`przyjmij_jako_model_projektu=True`). Pozostałe są porównywane hashem.
    """
    klucz = klucz_twin_projektu(project_id)
    if klucz in _zmigrowane_projekty:
        return WynikMigracjiProjektu(klucz, ())
    with uow_factory() as uow:  # type: ignore[attr-defined]
        return migruj_projekt_z_legacy_z_repozytorium(project_id, uow.cases)  # type: ignore[attr-defined]


def klucz_twin_dla_przypadku(case_id: str, uow_factory: Callable[[], object] | None) -> str:
    """Klucz magazynu ENM dla przypadku: `projekt:<uuid projektu>`.

    Podnosi `PrzypadekBezProjektuError`, gdy nie ma warstwy DB, `case_id` nie jest
    UUID albo przypadek nie istnieje. Przy pierwszym tłumaczeniu dla projektu w tym
    procesie wykonuje migrację zastanych plików per przypadek.
    """
    if uow_factory is None:
        raise PrzypadekBezProjektuError(
            "brak warstwy bazy danych — nie da się ustalić projektu przypadku"
        )
    project_id = _project_id_przypadku(case_id, uow_factory)
    migruj_projekt_z_legacy(project_id, uow_factory)
    return klucz_twin_projektu(project_id)


def klucz_twin_dla_projektu(project_id: UUID, uow_factory: Callable[[], object]) -> str:
    """Klucz magazynu ENM dla PROJEKTU — z migracją zastanych plików per przypadek.

    ŚCIEŻKA ADRESOWANA PROJEKTEM (przegląd adwersaryjny CV-1). Nie każdy konsument
    magazynu wchodzi przez `/api/cases/{case_id}/...`: rozdział analiz nN
    (`application/analysis_dispatch/service.py`) i eksport archiwum projektu mają
    `project_id` wprost. Budowały więc klucz przez `enm.klucz_twin.klucz_twin_projektu`
    — czystą funkcję, która NIC nie wie o migracji — i w świeżym procesie trafiały na
    klucz projektu, pod którym jeszcze nic nie leżało. `get_enm` TWORZY tam model
    domyślny i go ZAPISUJE, więc realny model projektanta (nadal pod kluczem
    przypadku) przy pierwszym wejściu przez API był porównywany hashem z tą pustką i
    lądował w `legacy_przypadki/` jako ROZBIEZNY; `has_enm` z kolei oddawał `False`,
    czyli archiwum ZIP bez sieci. Ta funkcja jest jedynym poprawnym adresem projektu
    do magazynu: najpierw migracja, potem klucz.
    """
    migruj_projekt_z_legacy(project_id, uow_factory)
    return klucz_twin_projektu(project_id)


def zapomnij_migracje() -> None:
    """Reset pamięci migracji (testy; po `store.reset_enm_store`)."""
    _zmigrowane_projekty.clear()
