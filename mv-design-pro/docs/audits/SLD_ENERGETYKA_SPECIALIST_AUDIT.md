# SLD - audyt energetyczny operator-grade

**Status:** aktywny audyt naprawczy  
**Powierzchnia:** GPZ, pole SN, odcinek SN, stacja SN/nN, mini-RMU, kanon aparatów  
**Werdykt dla aktualnego zrzutu użytkownika:** 0/10 jako schemat operatora sieci SN

## Panel oceny

Audit wykonany z perspektywy ról inżynierskich:

- projektant GPZ i rozdzielni SN,
- projektant stacji SN/nN,
- dyspozytor/eksploatacja OSD,
- specjalista topologii promieniowej i pierścieniowej SN,
- specjalista aparatury pierwotnej i uziemień,
- projektant HMI/SCADA SLD.

## Krytyczne braki widoczne na zrzucie

| ID | Obszar | Ocena | Co jest źle | Oczekiwany stan |
|---|---|---:|---|---|
| SLD-AUD-001 | GPZ | 0/10 | GPZ jest ramką z nazwą i sekcjami, bez czytelnych pól SN i aparatury odpływowej | GPZ musi pokazywać sekcje szyn, pola, aparaty i terminal odpływowy |
| SLD-AUD-002 | Ciąg SN | 0/10 | Kabel/magistrala nie wychodzi jednoznacznie z pola SN | Odcinek SN musi startować z portu odpływowego pola SN |
| SLD-AUD-003 | Stacja SN/nN | 1/10 | Stacja jest małym mini-blokiem na przewodzie, bez czytelnego wejścia, wyjścia i dalszych stacji | Stacja ma być mini-RMU z szyną, polami wej./wyj./TR i portami |
| SLD-AUD-004 | Dalsza topologia | 0/10 | Nie widać kolejnych odcinków i kolejnych stacji po pierwszej stacji | Schemat ma pokazać ciąg: GPZ -> pole SN -> kabel -> stacja -> kabel -> stacja |
| SLD-AUD-005 | Kanon aparatów | 2/10 | Część rendererów mieszała rozłącznik z kółkiem i odłącznik z blokiem | Wymuszony kanon: wyłącznik kwadrat, odłącznik kółko, rozłącznik romb, uziemnik boczny |
| SLD-AUD-006 | Uziemnik | 2/10 | Uziemnik/marker boczny nie był jednoznacznie podpisany jako uziemnik i mógł wyglądać jak aparat osiowy | Uziemnik wyłącznie na gałęzi bocznej z osobnym atrybutem kanonicznym |
| SLD-AUD-007 | PV po nN | 1/10 | PV nie może być tylko badge ani luźnym DER obok stacji | Stacja PV po nN musi pokazać tor SN -> TR -> szyna nN/PCC -> wyłączniki nN Q1/Q2 -> falowniki/generatory PV |

## Decyzje wdrożeniowe

1. Kanon symboli aparatów jest zapisany w `docs/sld/SLD_SYMBOLS_CANONICAL_OPERATOR_GRADE.md`.
2. Renderery muszą emitować `data-symbol-canon`, aby testy mogły wykryć pomyłkę symbolu.
3. Rozłącznik w GPZ i mini-RMU jest obróconym kwadratem, nie kółkiem.
4. Odłącznik jest kółkiem.
5. Wyłącznik jest kwadratem.
6. Uziemnik jest gałęzią boczną i nie może leżeć w osi toru.
7. Dla PV po stronie nN mini-RMU w LOD szczegółowym pokazuje widoczne wyłączniki nN oraz falowniki PV jako klikalne symbole.

## Pozostały blocker po tej poprawce

Ta poprawka wymusza symbolikę aparatów, ale nie kończy całego audytu SLD. Nadal krytyczne do naprawy w kolejnej pętli:

- pełne pola SN w GPZ przy LOD widocznym na zrzucie,
- wyprowadzenie kabla bezpośrednio z pola SN,
- pokazanie kolejnych stacji i odcinków na jednym ciągu,
- rozdzielenie dwóch sekcji szyn od dwóch systemów szyn,
- kompletna geometria operator-grade dla dużego ciągu SN.
