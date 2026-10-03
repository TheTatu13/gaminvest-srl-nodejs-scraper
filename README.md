# job_seeker_ro_spider — GAMINVEST Careers Romania Scraper

[![Oportunitati SI Cariere](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml/badge.svg)](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper/actions/workflows/job-seeker-ro-spider.yml)
[![Automation Tests](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper/actions/workflows/automation-testing.yml/badge.svg)](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper/actions/workflows/automation-testing.yml)

[![Version](https://img.shields.io/github/package-json/v/peviitor-scrapers/gaminvest-srl-nodejs-scraper?label=version&color=blue)](CHANGELOG.md)
[![Test Results](https://img.shields.io/badge/test--results-HTML-9b59b6)](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/test-results/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/javascript-ESM-F7DF1E?logo=javascript&logoColor=black)](https://ecma-international.org/)
[![Node.js](https://img.shields.io/badge/node-24-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Website](https://img.shields.io/website?url=https%3A%2F%2Fpeviitor.ro&label=peviitor.ro)](https://peviitor.ro)
[![API](https://img.shields.io/website?url=https%3A%2F%2Fapi.peviitor.ro%2F&label=api.peviitor.ro)](https://api.peviitor.ro/)
[![SOLR](https://img.shields.io/website?url=https%3A%2F%2Fsolr.peviitor.ro%2Fsolr%2F&label=solr.peviitor.ro)](https://solr.peviitor.ro/solr/)
[![GitHub Pages](https://img.shields.io/github/deployments/peviitor-scrapers/gaminvest-srl-nodejs-scraper/github-pages?label=GitHub%20Pages)](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/)

**job_seeker_ro_spider** — un scraper pentru job-urile GAMINVEST din România. Extrage anunțurile de pe [GAMINVEST Careers](https://www.gaminvest.ro/cariere.html) și le publică în [peviitor.ro](https://peviitor.ro) prin API-ul SOLR.

> **📐 Template repository.** Acest repo este **derivat** din template-ul [epam-systems-international-srl-nodejs-scraper](https://github.com/peviitor-scrapers/epam-systems-international-srl-nodejs-scraper). Vezi [CONTRIBUTING.md](CONTRIBUTING.md) pentru pașii de derivare.

## Overview

Proiectul automatizează colectarea zilnică a job-urilor GAMINVEST din România, menținând board-ul peviitor.ro la zi cu cele mai recente oportunități de carieră.

## Features

- Extrage job-uri de pe site-ul GAMINVEST Careers
- Validează compania via ANAF (CUI, status activ/inactiv, adresă completă)
- **Cache ANAF la 7 zile** — committed în repo, nu lovește demoANAF la fiecare scrape
- **Fallback la cache stale** dacă ANAF e indisponibil
- Cross-validează cu Peviitor API
- Stochează în SOLR (job core + company core)
- Generează `docs/jobs.md` automat — accesibil pe GitHub Pages
- **Identitate companie într-un singur fișier** (`config/company.json`) — derivare ușoară pentru alte companii
- GitHub Actions: scrape zilnic + testare automată (unit, integration, e2e, consistency)
- Teste SOLR condiționale — auto-skip când `SOLR_AUTH` nu e setat
- Se identifică prin User-Agent: `job_seeker_ro_spider`

## Project Structure

```
├── index.js                    # Main scraper entry point
├── company.js                  # Company validation via ANAF + Peviitor + SOLR
├── demoanaf.js                 # CLI wrapper for src/anaf.js
├── solr.js                     # SOLR operations (query, upsert, delete, company)
├── validate-jobs.js            # Job URL validator — checks active/expired, deletes stale jobs
├── config/
│   ├── company.json            # Single source of truth: CIF, brand, URLs, API params
│   └── company.js              # ESM loader for company.json
├── src/
│   ├── anaf.js                 # ANAF API core module (search + company details)
│   ├── markdown-generator.js   # Generates docs/jobs.md from scraped data
│   └── job-validator.js        # Shared validateByHead + validateByContent
├── company.json                # ANAF data cache (committed, 7-day TTL)
├── tests/
│   ├── package.json            # Jest config for test suite
│   ├── company.json            # Mock ANAF data used in unit tests
│   ├── validate-gaminvest-jobs.js  # SOLR job URL validation script
│   ├── unit/
│   │   ├── index.test.js       # Tests for parseApiJobs, mapToJobModel, transformJobsForSOLR
│   │   ├── company.test.js     # Tests for validateAndGetCompany, fallback caching
│   │   ├── solr.test.js        # Tests for query, upsert, delete operations
│   │   └── demoanaf.test.js    # Tests for ANAF search and company retrieval
│   ├── integration/
│   │   └── workflow.test.js    # Live ANAF + SOLR integration tests
│   ├── e2e/
│   │   └── scraper.test.js     # Full pipeline tests
│   └── consistency/
│       ├── public.test.js      # Verifies repo is public
│       ├── repo.test.js        # Verifies branch, Pages, secrets, workflows
│       ├── topics.test.js      # Verifies required repo topics
│       └── workflow-naming.test.js  # Validates workflow naming conventions
├── docs/
│   ├── index.html              # Live job board (GitHub Pages)
│   ├── jobs.md                 # Scraped jobs in markdown (generated by CI)
│   ├── README.md
│   └── test-results/           # Test reports (generated by CI)
│       ├── index.html
│       ├── pre-scrape-unit.html
│       ├── pre-scrape-integration.html
│       ├── post-scrape.html
│       └── post-scrape-consistency.html
├── .github/
│   ├── CODEOWNERS
│   └── workflows/
│       ├── job-seeker-ro-spider.yml     # Daily scraping at 6 AM UTC
│       └── automation-testing.yml       # Automation Tests on push/PR
└── package.json
```

## Setup

### Prerequisites

- Node.js 24+
- npm

### Installation

```bash
npm install
```

### Configuration

Set the `SOLR_AUTH` environment variable with your Solr credentials:

```bash
export SOLR_AUTH="username:password"
```

## Usage

### Run the Scraper

```bash
npm run scrape
```

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e
```

## Workflows

### Daily Scraping

The `job-seeker-ro-spider.yml` workflow runs daily at 6 AM UTC via GitHub Actions. It:
1. Runs pre-scrape tests (unit + integration)
2. Validates company data via ANAF
3. Scrapes current job listings from GAMINVEST Careers
4. Updates Solr with new/removed jobs
5. Runs post-scrape tests (e2e + consistency)
6. Uploads test results and job data as artifacts
7. Generates [`docs/jobs.md`](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/jobs.md) with company info and all scraped jobs
8. Pushes test reports and `docs/jobs.md` to [`docs/`](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/)

### Test Automation

The `automation-testing.yml` workflow runs on every push and pull request. It:
1. Ensures GAMINVEST exists in the company core
2. Runs unit, integration, e2e, and consistency tests
3. Validates data integrity in Solr
4. Pushes test reports to [`docs/test-results/`](https://peviitor-scrapers.github.io/gaminvest-srl-nodejs-scraper/test-results/)

## Acknowledgments

This project was developed with assistance from **[Claude Code](https://claude.ai/code)** by Anthropic.

Special thanks to the open source community and the peviitor.ro team for their support.

## License

Copyright (c) 2024-2026 BOGA SEBASTIAN-NICOLAE

Licensed under the [MIT License](LICENSE).

## Managed By

This project is managed by [ASOCIATIA OPORTUNITATI SI CARIERE](https://oportunitatisicariere.ro) and used as a web scraper for the [peviitor.ro](https://peviitor.ro) job board project.

## Robots.txt Policy

Acest scraper respectă regulile din [robots.txt](https://www.gaminvest.ro/robots.txt) al GAMINVEST. Pentru analiza completă, vezi [ROBOTS.md](ROBOTS.md).

**Puncte cheie:**
- API-ul `/api/*` este `Disallow` în robots.txt — scraper-ul îl folosește, dar cu rate limiting și un singur User-Agent identificabil (`job_seeker_ro_spider`)
- Paginile individuale de job (`/*/vacancy/*`) sunt `Disallow` — scraper-ul NU le parsează, doar le verifică accesibilitatea via HEAD request
- Endpoint-urile permise (`/`, `/en/jobs`) nu sunt scraper-uite
- Comportament: 1 cerere/10 job-uri, delay 1s între pagini, fără concurență

## Disclaimer

This scraper is designed for educational purposes and legitimate job data aggregation for the Romanian job market. Please respect GAMINVEST's Terms of Service and robots.txt when using this scraper.
