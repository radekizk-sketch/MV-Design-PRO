# Biblioteka źródeł technicznych MV-DESIGN PRO — ENEA i Dołęga

**Status:** materiał źródłowy i opracowanie referencyjne; nie jest odrębną mapą drogową, implementacją ani zgodą B-01/B-02.

**Cel:** zapewnić Fable/Opus/Codex powtarzalny dostęp do oficjalnych dokumentów ENEA Operator oraz do samodzielnego opracowania teorii układów stacyjnych na podstawie Dołęgi — z kontrolą wersji, praw autorskich i pochodzenia każdej reguły.

## Gdzie czego szukać

- [Rejestr źródeł](rejestr_zrodel.json): oficjalne adresy PDF, daty obowiązywania, identyfikatory i metadane.
- [GPZ H5 — źródła i reguły inżynierskie](GPZ_H5_ZRODLA_I_REGULY.md): źródło → paragraf/rysunek → opis autorski → konsekwencja dla ENM/SLD/solverów → status dowodu.
- [Instrukcja dla agentów i odbioru](INSTRUKCJA_DLA_AGENTOW.md): sposób dowodzenia wymagań i obsługi brakujących źródeł.
- [Narzędzie pobrania i weryfikacji](../../scripts/pobierz_zrodla_techniczne.py): pobiera oficjalne PDF operatora i rejestruje **prywatną kopię dostarczonego przez użytkownika** podręcznika (bez publikacji w Git).
- [Istniejący pakiet A–D GPZ](../plan/KOREKTA_GPZ_H5_ENEA_2026-10.md): analiza R1–R15, decyzje, testy; **to ten plan jest miejscem prac wykonawczych**.

## Uruchomienie

Z katalogu \`mv-design-pro/\`:

\`\`\`bash
python scripts/pobierz_zrodla_techniczne.py --list
python scripts/pobierz_zrodla_techniczne.py --all
python scripts/pobierz_zrodla_techniczne.py --verify
\`\`\`

W przypadku źródła Dołęgi, dostarczonego już właścicielowi w sesji ChatGPT:

\`\`\`bash
python scripts/pobierz_zrodla_techniczne.py --dolega /sciezka/do/dolega_stacje_elektroenergetyczne.pdf
\`\`\`

Pliki lądują w \`docs/zrodla/pobrane/\`, ignorowanym przez Git. Jeśli serwer ENEA odpowiada 403 / „Strona zablokowana”, należy otworzyć **oficjalny adres z rejestru** w przeglądarce i zapisać PDF w tym katalogu; \`--verify\` wykryje rzeczywiste pliki. Nie zastępować dokumentu tekstem z niezweryfikowanej strony pośredniczącej.

Nie trzeba kopiować oryginalnych PDF do historii repozytorium — użytkownik i wykonawca uzyskują dostęp do oryginałów lokalnie, a repo publikuje legalnie opracowane metadane, powiązania i wnioski techniczne.

## Prawa i dostęp

Dokument ENEA Zeszyt 1 na stronie tytułowej wyraźnie zastrzega prawa autorskie ENEA Operator. Podręcznik W. Dołęgi również jest utworem chronionym. **Nie kopiować pełnych PDF, skanów rysunków, aneksów ani masowego ekstraktu tekstowego do publicznego repo bez uprawnienia.** Dostęp dla agentów przez oficjalny link lub lokalny materiał dostarczony przez uprawnionego użytkownika.

Źródła w tej bibliotece nie oznaczają zgody na użycie dowolnego parametru. Standardy określają minimalne wymagania/układy, a **R/X, Z0/Z1, Sk'', parametry linii, stan łączeniowy i dane katalogowe dla rzeczywistego GPZ muszą pochodzić z wejścia projektowego lub jawnie udokumentowanego modelu**. Brak danych nie uprawnia do wymyślenia wartości.

## Świeżość

Rejestr zawiera stan sprawdzenia publicznej strony ENEA: **2026-10-22**. Serwis ENEA może zastępować pliki; przy każdym projekcie sprawdzić datę obowiązywania na stronie źródłowej. W szczególności standard linii 110 kV wskazuje nową wersję obowiązującą **od 01.10.2026**.
