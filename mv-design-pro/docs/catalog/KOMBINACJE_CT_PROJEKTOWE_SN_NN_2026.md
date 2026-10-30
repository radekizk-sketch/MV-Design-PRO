# Kombinacje przekładników CT jak w przykładach projektowych MV-DESIGN-PRO

Stan 30.10.2026. **Szablony projektowe**, nie zatwierdzone aparaty
konkretnego producenta ani nieudokumentowane tabliczki użytkownika.

## Warianty w API katalogu

- **SN:** I1=75, 100, 150, 200, 300, 400, 600, 800 A; I2=1 A.
- **nN:** I1=400, 600, 800, 1000, 1500 A; I2=1 A.
- **Rdzeń 1 — pomiar:** klasa 0,2S / 0,5 / 0,5S, moc 5 VA.
- **Rdzeń 2 — EAZ:** 5P10 przy 10 VA albo 5P20 przy 15 VA.

W sumie **48 szablonów SN + 30 szablonów nN = 78**.
Przykłady: `200/1/1 A; 0,2S 5 VA + 5P20 15 VA`,
`600/1/1 A; 0,5 5 VA + 5P10 10 VA`,
`1000/1/1 A nN; 0,5S 5 VA + 5P20 15 VA`.

**Pochodzenie:** wcześniejsze robocze przykłady projektowe MV-DESIGN-PRO.
Nie są to odczytane karty konkretnych stacji klienta, a wszystkie
kombinacje klas i mocy są wariantami doborowymi. Nie gwarantują,
że producent wykona dokładnie dany układ.

## Rozdzielenie zastosowań

- **Stan istniejący:** zachowaj dokładną przekładnię, liczbę rdzeni,
  klasę, VA i typ z tabliczki, także 200/5 A bez dodatkowych zaczepów.
- **Nowe pomiary rozliczeniowe ENEA:** wymagania standardu i warunki
  przyłączenia rozpatruj niezależnie od dostępności szablonu.
  Szablon 0,2S 5 VA nie jest automatycznie zatwierdzonym układem ENEA.
- **Przekładniki wieloprzekładniowe:** wyłącznie z potwierdzonym
  `primary_taps_a`. Dwa rdzenie nie oznaczają dwóch zaczepów.
- **Projektowanie EAZ:** 5P10 i 5P20 to osobne warianty; nie wyprowadzać
  FS, Rct, Ith ani Idyn z samych klas. Sprawdź nasycenie, rzeczywiste
  obciążenie i prądy zwarciowe.
- **CT nN:** brak napięcia izolacji i wymiarów konkretnych produktów;
  dobór do szyny/kabla i rozdzielnicy wymaga karty wykonania.

## Dla Opusa

Rekordy są już dostępne przez istniejące `get_all_ct_types()` oraz
`get_default_mv_catalog().ct_types`, z `secondary_cores` i
`core_count=2`. Nie zmieniono selektora aktywnego zaczepu ani SLD.
Projektowy szablon ma `catalog_status=REFERENCYJNY_V1` i
`verification_status=REFERENCYJNY`, więc UI nie może udawać, że
jest potwierdzonym wyrobem. Wymaga doboru rzeczywistego producenta.

Testy Ubuntu: `bash scripts/catalog_audit_ubuntu.sh` i
`backend/tests/network_model/catalog/test_ct_project_combinations.py`.
