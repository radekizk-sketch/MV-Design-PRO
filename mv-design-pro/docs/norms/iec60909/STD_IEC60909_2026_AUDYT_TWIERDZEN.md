# Audyt STD-IEC60909-2026

Status: projekt procedury wewnętrznej, nie potwierdzenie zgodności z IEC 60909-0:2026.

| ID | Wymaganie z projektu SOP | Weryfikacja |
|---|---|---|
| C01 | cmax/cmin nN 1.05/0.95 dla każdej sieci | FAŁSZ: tabela IEC 2016 rozróżnia tolerancję napięcia ±6% i ±10% (dla ±10%: 1.10 i 0.90). Tabela IEC 2026 wymaga sprawdzenia źródła pierwotnego. |
| C02 | domyślne k_CIS=1.2 według IEC 2026 | NIEPOTWIERDZONE: zabroniony współczynnik normowy bez dowodu źródłowego. |
| C03 | IEC 2016 nie uwzględnia przekształtników | FAŁSZ: wydanie 2016 już uwzględnia jednostki z pełnym przekształtnikiem. |
| C04 | IEC 2016 zawsze bez C0 | FAŁSZ: punkt 5.2(f) reguluje warunkowo pojemność składowej zerowej. |
| C05 | IEC 2026 wymaga C0 we wszystkich sieciach SN | NIEPOTWIERDZONE: 1F w sieci izolowanej lub skompensowanej poza zakresem IEC 60909-0. |
| C06 | ip oraz Ib falownika można przyjąć bez składowej nieokresowej | NIEPOTWIERDZONE: zweryfikować paragrafy 8 i 9 dla kategorii źródła. |
| C07 | obowiązkowy podpis każdego raportu wg IEC | NIE: ewentualnie procedura organizacyjna i przepisy krajowe. |
| C08 | profil IEC 2026 jest obecnie zatwierdzony | NIE: brak pełnego zweryfikowanego modelu oraz testów referencyjnych. |

Zasady wdrożenia: nie przenosić do kodu żadnych domniemanych współczynników. Pełny opis znajduje się w NORMATIVE_EVIDENCE_2016_2026.md i standard_profiles.json. Przypadek obliczeniowy wymaga jawnego identyfikatora wydania; jego zmiana unieważnia wyniki. W żadnym wypadku nie wolno automatycznie wracać do 2016, gdy profil 2026 jest niekompletny.

Źródła: https://webstore.iec.ch/en/publication/68454 ; https://webstore.iec.ch/en/publication/24100 ; https://www.nen.nl/nen-en-iec-60909-0-2026-en-356880 ; https://faq.digsilent.de/en/faq-reader-powerfactory/why-are-the-results-of-short-citcuit-calculation-depending-on-max-voltage-tolerance.html
