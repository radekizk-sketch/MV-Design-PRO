# Specyfikacja danych właściciela — krzywa napięcia dotykowego dopuszczalnego U_Tp(t_F) wg PN-EN 50522

Status: **DANE NIEDOSTARCZONE** (2026-09-30). Dokument wiążący dla karty UZIEMIENIE-JEDEN-PRAD.

## 1. Po co te dane

Projektant stacji SN/nN wykazuje, że wzrost potencjału uziomu U_E (albo napięcie dotykowe
spodziewane) nie przekracza napięcia dotykowego dopuszczalnego U_Tp dla czasu trwania
zwarcia t_F (PN-EN 50522, powołana przez PN-EN 61936-1). Program liczy dziś z modelu i biegu
zwarcia jednofazowego:

- prąd uziomowy I_E = r · I″k1 (sieć uziemiona przez rezystor albo bezpośrednio),
- wzrost potencjału uziomu U_E = I_E · R_E

(`application/analyses/earthing/ground_fault_bridge.py`, algebra w
`network_model/pochodne/wielkosci_pochodne.py`). Treści PN-EN 50522 **nie ma w repozytorium**,
więc ocena U_E względem U_Tp(t_F) kończy się statusem `BRAK_PODSTAWY` z liczbami I_E i U_E
(kontrakt `docs/domain/KONTRAKT_WERDYKTU_WYJASNIALNEGO.md`) — nigdy „spełnia”. Wartości U_Tp
z pamięci są zakazane.

## 2. Czego potrzeba od właściciela

| Pozycja | Wymaganie |
|---|---|
| Dokument źródłowy | Numer i wydanie normy (np. PN-EN 50522:2011 lub nowsze), język, ewentualne poprawki krajowe |
| Miejsce w normie | Numer tabeli albo rysunku z krzywą U_Tp(t_F) oraz numer załącznika z założeniami (ścieżka prądu, opór ciała, obuwie, stanowisko) |
| Punkty krzywej | Pary (t_F [s], U_Tp [V]) w pełnym zakresie tabeli normy, bez interpolacji wykonanej przez dostarczającego |
| Reguła interpolacji | Reguła podana w normie (liniowa w skali log–log / liniowa / schodkowa) albo jawna decyzja właściciela, jeśli norma jej nie podaje |
| Zakres ważności | Najkrótszy i najdłuższy czas t_F objęty krzywą; zachowanie poza zakresem (odmowa, nie ekstrapolacja) |
| Warunki dodatkowe | Czy krzywa dotyczy U_Tp, czy U_vTp (napięcie spodziewane z oporami dodatkowymi); jeśli U_vTp — wartości R_F1/R_F2 z normy i ich podstawa |
| Czas trwania zwarcia | Skąd program bierze t_F (czas wyłączenia zabezpieczenia z analizy zabezpieczeń vs dana projektowa) — decyzja właściciela |

## 3. Forma dostarczenia

Plik danych (CSV albo JSON) z nagłówkiem: wydanie normy, numer tabeli/rysunku, data wprowadzenia,
osoba zatwierdzająca. Dane trafiają do katalogu profili normatywnych (wzór:
`backend/src/catalog/profiles/nc_rfg/` — profil z proweniencją i stanem źródła), nie do kodu
solvera ani UI.

## 4. Co się zmieni po dostarczeniu

- Rekord werdyktu stacji na ekranie bezpieczeństwa uziemienia przejdzie z `BRAK_PODSTAWY` na
  ocenę U_E ≤ U_Tp(t_F) z marginesem, limitem z podstawą (wydanie, tabela) i zakresem ważności.
- Pakiet dowodowy P19 dostanie krok porównania z krzywą.
- Do czasu dostarczenia żadna ścieżka programu nie wydaje werdyktu dodatniego dla napięć rażenia
  opartego na U_Tp z PN-EN 50522.

## 5. Powiązania

`docs/plan/MAPA_DOMKNIECIA_PRODUKTU_2026-09.md` §3.7 #13/#15/#16; wpis decyzji
`docs/v12xx/REJESTR_KONFLIKTOW.md` (UZIEMIENIE-JEDEN-PRAD).
