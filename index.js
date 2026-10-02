import { fetchWithRetry as fetch, assertCanary } from "./src/premium.js";
import * as cheerio from "cheerio";
import fs from "fs";
import { fileURLToPath } from "url";
import { validateAndGetCompany } from "./company.js";
import { querySOLR, deleteJobByUrl, upsertJobs, upsertCompany } from "./solr.js";
import { generateJobsMarkdown } from "./src/markdown-generator.js";
import companyConfig from "./config/company.js";

const COMPANY_CIF = companyConfig.cif;
const CARIERE_URL = companyConfig.careerUrl;

const TIMEOUT = 10000;

let COMPANY_NAME = null;

function extractLocationFromTitle(title) {
  const match = title.match(/\bin\s+(.+)$/i);
  if (match) {
    const loc = match[1].trim();
    if (loc.length < 30) return loc;
  }
  return null;
}

async function fetchJobsPage() {
  const res = await fetch(CARIERE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8"
    },
    timeout: TIMEOUT
  });

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} for cariere page`);
  }

  return await res.text();
}

function hasJobsOnPage(html) {
  if (!html || html.trim().length === 0) return false;
  const $ = cheerio.load(html);
  return $('select#post option').length > 1;
}

function parseJobsPage(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('select#post option').each((i, el) => {
    const text = $(el).text().trim();
    if (text && text !== "Alege postul") {
      const url = `${CARIERE_URL}#post-${i}`;
      let location = extractLocationFromTitle(text) || companyConfig.defaultLocation;
      jobs.push({ url, title: text, location });
    }
  });

  return jobs;
}

async function scrapeAllListings() {
  console.log("Fetching careers page...");
  const html = await fetchJobsPage();

  if (!html || html.trim().length === 0) {
    console.log("Empty response, no jobs.");
    return [];
  }

  if (!hasJobsOnPage(html)) {
    console.log("No jobs found on careers page.");
    return [];
  }

  const jobs = parseJobsPage(html);
  console.log(`Total unique jobs collected: ${jobs.length}`);
  return jobs;
}

function mapToJobModel(rawJob, cif, companyName = COMPANY_NAME) {
  const now = new Date().toISOString();

  const job = {
    url: rawJob.url,
    title: rawJob.title,
    company: companyName,
    cif: cif,
    location: rawJob.location ? [rawJob.location] : undefined,
    workmode: "on-site",
    date: now,
    status: "scraped"
  };

  Object.keys(job).forEach((k) => job[k] === undefined && delete job[k]);

  return job;
}

function transformJobsForSOLR(payload) {
  const romanianCities = [
    'Bucharest', 'București', 'Cluj-Napoca', 'Cluj Napoca',
    'Timișoara', 'Timisoara', 'Iași', 'Iasi', 'Brașov', 'Brasov',
    'Constanța', 'Constanta', 'Craiova', 'Bacău', 'Sibiu',
    'Târgu Mureș', 'Targu Mures', 'Oradea', 'Baia Mare', 'Satu Mare',
    'Ploiești', 'Ploiesti', 'Pitești', 'Pitesti', 'Arad', 'Galați', 'Galati',
    'Brăila', 'Braila', 'Drobeta-Turnu Severin', 'Râmnicu Vâlcea', 'Ramnicu Valcea',
    'Buzău', 'Buzau', 'Botoșani', 'Botosani', 'Zalău', 'Zalau', 'Hunedoara', 'Deva',
    'Suceava', 'Bistrița', 'Bistrita', 'Tulcea', 'Călărași', 'Calarasi',
    'Giurgiu', 'Alba Iulia', 'Slatina', 'Piatra Neamț', 'Piatra Neamt', 'Roman',
    'Dumbrăvița', 'Dumbravita', 'Voluntari', 'Popești-Leordeni', 'Popesti-Leordeni',
    'Chitila', 'Mogoșoaia', 'Mogosoaia', 'Otopeni'
  ];

  const citySet = new Set(romanianCities.map(c => c.toLowerCase()));

  const normalizeWorkmode = (wm) => {
    if (!wm) return undefined;
    const lower = wm.toLowerCase();
    if (lower.includes('remote')) return 'remote';
    if (lower.includes('office') || lower.includes('on-site') || lower.includes('site')) return 'on-site';
    return 'hybrid';
  };

  const transformed = {
    ...payload,
    company: payload.company?.toUpperCase(),
    jobs: payload.jobs.map(job => {
      const validLocations = (job.location || []).filter(loc => {
        const lower = loc.toLowerCase().trim();
        if (lower === 'romania' || lower === 'românia') return true;
        return citySet.has(lower);
      }).map(loc => loc.toLowerCase() === 'romania' ? 'România' : loc);

      return {
        ...job,
        location: validLocations.length > 0 ? validLocations : ['România'],
        workmode: normalizeWorkmode(job.workmode)
      };
    })
  };

  return transformed;
}

async function main() {
  const testOnlyOnePage = process.argv.includes("--test");

  try {
    fs.mkdirSync("tmp", { recursive: true });

    console.log("=== Step 1: Get existing jobs count ===");
    const existingResult = await querySOLR(COMPANY_CIF);
    const existingCount = existingResult.numFound;
    console.log(`Found ${existingCount} existing jobs in SOLR`);

    console.log("=== Step 2: Validate company via ANAF ===");
    const { company, cif, address } = await validateAndGetCompany();
    COMPANY_NAME = company;
    const localCif = cif;

    try {
      await upsertCompany({
        id: cif,
        company,
        brand: companyConfig.brand,
        status: "activ",
        location: address ? [address] : [companyConfig.defaultLocation],
        website: [companyConfig.website],
        career: [companyConfig.careerUrl],
        lastScraped: new Date().toISOString().split('T')[0],
        scraperFile: companyConfig.scraperFile
      });
    } catch (err) {
      console.log(`Note: Could not upsert company to SOLR core: ${err.message}`);
    }

    console.log("=== Step 3: Scrape jobs from GAMINVEST website ===");
    const rawJobs = await scrapeAllListings();
    const scrapedCount = rawJobs.length;
    assertCanary({ scraped: scrapedCount, existing: existingCount, source: "careers site" });
    console.log(`📊 Jobs scraped from GAMINVEST website: ${scrapedCount}`);

    const jobs = rawJobs.map(job => mapToJobModel(job, localCif));

    const payload = {
      source: "gaminvest.ro",
      scrapedAt: new Date().toISOString(),
      company: COMPANY_NAME,
      cif: localCif,
      jobs
    };

    console.log("Transforming jobs for SOLR...");
    const transformedPayload = transformJobsForSOLR(payload);
    const validCount = transformedPayload.jobs.filter(j => j.location).length;
    console.log(`📊 Jobs with valid Romanian locations: ${validCount}`);

    fs.writeFileSync("tmp/jobs.json", JSON.stringify(transformedPayload, null, 2), "utf-8");
    console.log("Saved tmp/jobs.json");

    const companyData = {
      id: localCif,
      company: transformedPayload.company,
      brand: companyConfig.brand,
      status: "activ",
      location: address ? [address] : [companyConfig.defaultLocation],
      website: [companyConfig.website],
      career: [companyConfig.careerUrl],
      lastScraped: new Date().toISOString().split('T')[0]
    };
    const markdown = generateJobsMarkdown(companyData, transformedPayload.jobs);
    fs.mkdirSync("docs", { recursive: true });
    fs.writeFileSync("docs/jobs.md", markdown, "utf-8");
    console.log("Saved docs/jobs.md");

    fs.writeFileSync("docs/company.json", JSON.stringify(companyConfig, null, 2), "utf-8");
    console.log("Saved docs/company.json");

    console.log("\n=== Step 4: Upsert jobs to SOLR ===");
    await upsertJobs(transformedPayload.jobs);

    const finalResult = await querySOLR(COMPANY_CIF);
    console.log(`\n📊 === SUMMARY ===`);
    console.log(`📊 Jobs existing in SOLR before scrape: ${existingCount}`);
    console.log(`📊 Jobs scraped from GAMINVEST website: ${scrapedCount}`);
    console.log(`📊 Jobs in SOLR after scrape: ${finalResult.numFound}`);
    console.log(`====================`);

    console.log("\n=== DONE ===");
    console.log("Scraper completed successfully!");

  } catch (err) {
    console.error("Scraper failed:", err);
    process.exit(1);
  }
}

export { parseJobsPage, mapToJobModel, transformJobsForSOLR };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
