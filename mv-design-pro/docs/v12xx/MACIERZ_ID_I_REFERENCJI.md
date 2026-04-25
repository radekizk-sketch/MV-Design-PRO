# Macierz ID i referencji V12.xx

Status: aktywna  
Cel: stabilna tozsamosc obiektow, wynikow, raportow i uzasadnien

## Typy identyfikatorow

| Pole | Znaczenie | Zmiennosc | Uzycie |
|---|---|---|---|
| `id` | Techniczny identyfikator zapisu. | Moze zmienic sie przy migracji fizycznej danych. | Baza danych, transport techniczny. |
| `ref_id` | Stabilny identyfikator domenowy. | Nie zmienia sie przy zwyklej edycji. | ENM, wyniki, raport, uzasadnienie, SLD. |
| `name` | Edytowalna nazwa uzytkowa. | Moze zmienic sie bez invalidacji tozsamosci. | UI i raport jako etykieta. |
| `snapshot_id` | Id migawki ENM. | Nowe przy kazdym zamrozeniu modelu. | Solver, wynik, raport. |
| `catalog_snapshot_id` | Id snapshotu katalogow. | Nowe przy materializacji katalogow dla runu. | Reprodukowalnosc wynikow. |
| `proof_id` | Id uzasadnienia inzynierskiego. | Nowe dla nowego wyniku. | Raport i audyt. |

## Reguly `ref_id`

- Zmiana nazwy nie zmienia `ref_id`.
- Zmiana parametrow nie zmienia `ref_id`.
- Ponowne obliczenie nie zmienia `ref_id`.
- Rozciecie odcinka tworzy nowe `ref_id` dla nowych odcinkow i wygasza `ref_id` odcinka dzielonego.
- Zastapienie elementu innym typem tworzy nowe `ref_id`.
- Migracja bez utraty tozsamosci zachowuje `ref_id`.
- Migracja z utrata tozsamosci wymaga wpisu w `REJESTR_KONFLIKTOW.md`.

## Powiazania

| Obszar | Powiazanie wymagane |
|---|---|
| Wynik | `result_id`, `snapshot_id`, `catalog_snapshot_id`, `case_id`, `variant_id`, `switching_snapshot_id`, `proof_id`. |
| Raport | Lista `result_id`, `proof_id`, `ref_id`, hash ENM, hash katalogow, wersja szablonu. |
| Uzasadnienie | `proof_id`, `result_id`, `ref_id`, dane wejsciowe, jednostki, pochodzenie i status jakosci. |
| SLD | Symbol wskazuje `ref_id`, nie lokalny identyfikator renderu jako prawde domenowa. |
| Migracja | Kazdy stary `ref_id` ma status: zachowany, wygaszony, podzielony, scalony albo zastapiony. |
