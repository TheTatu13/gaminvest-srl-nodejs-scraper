import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

jest.retryTimes(2, { logErrorsBeforeRetry: true }); // live third-party ANAF/search calls are occasionally slow in CI

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Live API tests hit api.peviitor.ro (no credential needed) -- opt in explicitly.
const HAS_SOLR = !!process.env.RUN_LIVE_API_TESTS;

function itIfSolr(name, fn, timeout) {
  if (HAS_SOLR) {
    return it(name, fn, timeout);
  }
  return it.skip(`${name} (skipped: set RUN_LIVE_API_TESTS=1 to run)`, fn, timeout);
}

const TEST_CIF = '21913994';
const CAREERS_URL = 'https://www.gaminvest.ro/cariere.html';

describe('E2E: Full Scraping Pipeline', () => {
  let htmlData;

  beforeAll(async () => {
    const res = await fetch(CAREERS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.8"
      }
    });
    htmlData = await res.text();
  }, 15000);

  describe('GAMINVEST Careers Page — Real Data Fetch', () => {

    it('should respond with HTML from GAMINVEST careers page', () => {
      expect(htmlData.length).toBeGreaterThan(0);
    }, 10000);

    it('should contain job options if site is accessible', () => {
      const hasJobs = htmlData && htmlData.includes('id="post"');
      if (!hasJobs) {
        console.log('⚠️ No jobs section on page — site may have challenge page');
        return;
      }
      expect(htmlData).toContain('id="post"');
      expect(htmlData).toContain('<option');
      const optionMatches = htmlData.match(/<option value="[^"]*">[^<]+<\/option>/g);
      expect(optionMatches).not.toBeNull();
      expect(optionMatches.length).toBeGreaterThan(0);
    });
  });

  describe('Parse + Transform Pipeline', () => {
    let index;
    let parsed;

    beforeAll(async () => {
      index = await import('../../index.js');
      parsed = index.parseJobsPage(htmlData);
    }, 15000);

    it('should parse HTML into standardized format', () => {
      expect(Array.isArray(parsed)).toBe(true);

      const hasJobs = htmlData && htmlData.includes('id="post"');
      if (hasJobs) {
        expect(parsed.length).toBeGreaterThan(0);
        const job = parsed[0];
        expect(job).toHaveProperty('url');
        expect(job).toHaveProperty('title');
        expect(job).toHaveProperty('location');
        expect(typeof job.location).toBe('string');
        expect(job.location.length).toBeGreaterThan(0);
      } else {
        console.log('⚠️ No jobs on page — skipping content assertions');
      }
    });

    it('should map parsed jobs to job model', () => {
      const hasJobs = htmlData && htmlData.includes('id="post"');
      if (!hasJobs) {
        console.log('⚠️ No jobs on page — skipping mapping test');
        return;
      }

      const model = index.mapToJobModel(parsed[0], TEST_CIF);
      expect(model).toHaveProperty('url');
      expect(model).toHaveProperty('title');
      expect(model).toHaveProperty('company');
      expect(model).toHaveProperty('cif', TEST_CIF);
      expect(model).toHaveProperty('status', 'scraped');
      expect(model).toHaveProperty('date');
    });

    it('should transform jobs and filter to Romanian locations', () => {
      const hasJobs = htmlData && htmlData.includes('id="post"');
      if (!hasJobs) {
        console.log('⚠️ No jobs on page — skipping transform test');
        return;
      }

      const jobs = parsed.map(j => index.mapToJobModel(j, TEST_CIF));
      const payload = {
        source: 'gaminvest.ro',
        company: 'GAMINVEST SRL',
        cif: TEST_CIF,
        jobs
      };
      const transformed = index.transformJobsForSOLR(payload);
      expect(transformed.company).toBe('GAMINVEST SRL');
      expect(transformed.jobs.length).toBe(jobs.length);
      for (const job of transformed.jobs) {
        expect(job).toHaveProperty('location');
        expect(Array.isArray(job.location)).toBe(true);
        expect(job.location.length).toBeGreaterThan(0);
        expect(job.workmode).toMatch(/^(remote|on-site|hybrid)$/);
      }
    });
  });

  describe('Company Validation Path', () => {
    let anaf;
    let company;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      company = await import('../../company.js');
    });

    it('should find GAMINVEST in ANAF and validate active status', async () => {
      const anafData = await anaf.getCompanyFromANAF(TEST_CIF);

      expect(anafData).toBeDefined();
      expect(anafData.name).toBe('GAMINVEST SRL');
      expect(anafData.cui).toBe(Number(TEST_CIF));
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should run full validation and report active status with job count', async () => {
      const result = await company.validateAndGetCompany();

      expect(result.status).toBe('active');
      expect(result.company).toBe('GAMINVEST SRL');
      expect(result.cif).toBe(TEST_CIF);

      if (result.existingJobsCount === 0) {
        console.log('⚠️ No GAMINVEST jobs in Solr — skipping job count assertion');
        return;
      }
      expect(result.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });

  describe('SOLR Data Verification', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should have GAMINVEST jobs in SOLR with correct company name', async () => {
      const result = await solr.querySOLR(TEST_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No GAMINVEST jobs in Solr — skipping SOLR data verification');
        return;
      }

      for (const job of result.docs) {
        expect(job.company).toBe('GAMINVEST SRL');
        expect(job.cif).toBe(TEST_CIF);
      }
    }, 15000);

    itIfSolr('should have GAMINVEST company core entry with required fields', async () => {
      const company = await solr.getCompanyByCif(TEST_CIF);

      expect(company).not.toBeNull();
      expect(company.company).toBe('GAMINVEST SRL');
      expect(company.status).toBe('activ');
    }, 15000);
  });
});
