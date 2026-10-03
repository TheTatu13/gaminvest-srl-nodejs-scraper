# job_seeker_ro_spider

**job_seeker_ro_spider** — scraper pentru job-urile GAMINVEST SRL din România.

Extrage anunțurile de pe [GAMINVEST Careers](https://www.gaminvest.ro/cariere.html) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

## Identificare

Toate request-urile HTTP folosesc User-Agent-ul:

```
job_seeker_ro_spider
```

## Ce face

1. **Validează compania** — interoghează API-ul public ANAF ([demoanaf.ro](https://demoanaf.ro)) după CIF-ul GAMINVEST (21913994) și verifică:
   - Denumirea oficială: GAMINVEST SRL
   - Status: activ/inactiv/radiat
   - Adresa completă din registrul comerțului
2. **Cross-validează cu Peviitor** — verifică existența companiei în API-ul Peviitor
3. **Scrape-uiește job-urile** — extrage lista completă de job-uri de pe site-ul GAMINVEST Careers, filtrat pe România
4. **Transformă datele** — normalizează locațiile (doar orașe românești), tag-urile (lowercase), workmode-ul (remote/on-site/hybrid)
5. **Stochează în SOLR** — upsert în `job` core (job-urile) și `company` core (datele companiei cu adresa completă)
6. **Generează docs/jobs.md** — fișier markdown cu informații companie + toate job-urile curente, publicat pe [GitHub Pages](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/jobs.md)

## Structură proiect

```
├── config/company.json         # Sursa unică de adevăr (CIF, brand, URL-uri, API)
├── config/company.js           # Loader ESM pentru config/company.json
├── index.js                    # Orchestrator principal
├── company.js                  # Validare companie (ANAF + Peviitor + SOLR) cu cache 7 zile
├── demoanaf.js                 # CLI wrapper pentru src/anaf.js
├── src/anaf.js                 # Modul ANAF API (search + company details)
├── src/markdown-generator.js   # Generează docs/jobs.md după scrape
├── src/job-validator.js        # Primitivă comună: validateByHead, validateByContent
├── solr.js                     # Operații SOLR (query, upsert, delete, company)
├── company.json                # Cache ANAF (committed, TTL 7 zile, fallback la stale)
├── ROBOTS.md          # Analiză robots.txt și politici de scraping
├── tests/
│   ├── unit/          # 56 teste unitare (API-uri mock-uite)
│   ├── integration/   # 16 teste de integrare (ANAF + SOLR live)
│   └── e2e/           # 13 teste end-to-end (pipelin complet)
└── .github/workflows/
    ├── job-seeker-ro-spider.yml     # Rulează zilnic la 6 AM UTC
    └── automation-testing.yml       # Teste automate la fiecare push/PR
```

## API-uri folosite

| API | URL | Autentificare |
|---|---|---|
| GAMINVEST Careers | `https://www.gaminvest.ro/` | Public |
| ANAF (demoanaf) | `https://demoanaf.ro/api/...` | Public |
| Peviitor | `https://api.peviitor.ro/v1/company/` | Public |
| SOLR (job core) | `https://solr.peviitor.ro/solr/job` | `SOLR_AUTH` |
| SOLR (company core) | `https://solr.peviitor.ro/solr/company` | `SOLR_AUTH` |

## Robots.txt

GAMINVEST [robots.txt](https://www.gaminvest.ro/robots.txt) nu blochează API-ul sau paginile de job.

Scraper-ul folosește rate limiting (1s delay între pagini) și un singur User-Agent identificabil.

Pentru analiza completă, vezi [ROBOTS.md](../ROBOTS.md).

## Derived Scrapers

Acest scraper este derivat din [epam-systems-international-srl-nodejs-scraper](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper).

## Testare

```bash
# Toate testele
npm test

# Doar unitare
npm run test:unit

# Doar integrare (necesită ANAF live, SOLR conditional)
npm run test:integration

# Doar E2E (API real GAMINVEST + ANAF + SOLR)
npm run test:e2e
```

Testele SOLR folosesc `itIfSolr` — se auto-skip dacă variabila `SOLR_AUTH` nu e setată.
