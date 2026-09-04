"""Klucz Canonical Project Twin — tożsamość magazynu ENM per PROJEKT (CV-1).

KONTRAKT (docs/architecture/CANONICAL_DIGITAL_TWIN.md §2): projekt posiada
jeden kanoniczny model sieci; przypadek obliczeniowy (`StudyCase`) jest
konfiguracją analizy i NIE posiada własnej kopii sieci. Magazyn ENM
(`enm/store.py`) jest więc kluczowany kluczem twin projektu, a `case_id`
jest wyłącznie adresem WEJŚCIOWYM API, tłumaczonym na klucz projektu w JEDNYM
miejscu (`application/twin_key.py`).

Stan przed CV-1 (defekt P0, pomiar A9 §3.3 poz. 1): klucz magazynu =
`sha256(case_id)`, magazyn tworzył domyślny model dla DOWOLNEGO `case_id`,
więc każdy przypadek miał osobną sieć („StudyCase owns ENM").

Ten moduł nie zależy od bazy danych ani od warstwy API — jest czystą
definicją postaci klucza, żeby magazyn, tłumacz i guard mówiły tym samym
językiem.
"""

from __future__ import annotations

from uuid import UUID

#: Prefiks klucza projektu w magazynie ENM. Klucz bez prefiksu jest kluczem
#: SUROWYM (dawny `case_id`, klucze fixture testowych) — dopuszczalny w testach
#: jednostkowych magazynu, ZAKAZANY w warstwie API/aplikacji (guard
#: `scripts/enm_store_key_guard.py`).
PREFIKS_PROJEKTU = "projekt:"


class PrzypadekBezProjektuError(LookupError):
    """`case_id` nie wskazuje przypadku należącego do żadnego projektu.

    Podnoszony przez tłumacz `application/twin_key.py`, gdy przypadku nie ma w
    bazie (albo `case_id` nie jest UUID). NIE jest to sytuacja „utwórz domyślny
    model” — magazyn per projekt nie ma czego utworzyć bez projektu.
    """


def klucz_twin_projektu(project_id: UUID | str) -> str:
    """Kanoniczny klucz magazynu ENM dla projektu (`projekt:<uuid>`)."""
    ident = project_id if isinstance(project_id, UUID) else UUID(str(project_id))
    return f"{PREFIKS_PROJEKTU}{ident}"


def czy_klucz_projektu(klucz: str) -> bool:
    """Czy klucz ma postać kanoniczną projektu."""
    if not klucz.startswith(PREFIKS_PROJEKTU):
        return False
    try:
        UUID(klucz[len(PREFIKS_PROJEKTU) :])
    except ValueError:
        return False
    return True


def project_id_z_klucza(klucz: str) -> UUID:
    """Odwrotność `klucz_twin_projektu`; `ValueError` dla klucza surowego."""
    if not czy_klucz_projektu(klucz):
        raise ValueError(f"klucz magazynu ENM nie jest kluczem projektu: {klucz!r}")
    return UUID(klucz[len(PREFIKS_PROJEKTU) :])
