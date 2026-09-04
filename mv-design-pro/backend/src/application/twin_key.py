"""Tłumacz `case_id` → klucz Canonical Project Twin (CV-1; JEDYNE miejsce tłumaczenia).

docs/architecture/CANONICAL_DIGITAL_TWIN.md §2: projekt posiada jeden kanoniczny
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

from collections.abc import Callable
from dataclasses import dataclass
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
        przypadki = list(uow.cases.list_study_cases(project_id))  # type: ignore[attr-defined]
        aktywny = uow.cases.get_active_study_case(project_id)  # type: ignore[attr-defined]
    kolejnosc: list[str] = []
    if aktywny is not None:
        kolejnosc.append(str(aktywny.id))
    kolejnosc.extend(str(c.id) for c in przypadki if str(c.id) not in kolejnosc)
    wyniki: list[store.WynikMigracjiKlucza] = []
    for indeks, case_id in enumerate(kolejnosc):
        wyniki.append(
            store.migruj_klucz_przypadku_do_projektu(
                case_id, klucz, przyjmij_jako_model_projektu=(indeks == 0)
            )
        )
    _zmigrowane_projekty.add(klucz)
    return WynikMigracjiProjektu(klucz, tuple(wyniki))


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


def zapomnij_migracje() -> None:
    """Reset pamięci migracji (testy; po `store.reset_enm_store`)."""
    _zmigrowane_projekty.clear()
