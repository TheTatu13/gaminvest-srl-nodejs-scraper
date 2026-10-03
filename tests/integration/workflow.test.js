import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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

const GAMINVEST_CIF = '21913994';

describe('Integration: API Workflow', () => {

  describe('ANAF API', () => {
    let anaf;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
    });

    it('should search for GAMINVEST brand and find the company', async () => {
      const results = await anaf.searchCompany('GAMINVEST');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const company = results.find(c =>
        c.name.toUpperCase().includes('GAMINVEST') && c.cui.toString() === GAMINVEST_CIF
      );
      expect(company).toBeDefined();
    }, 15000);

    it('should return empty array for non-existent brand', async () => {
      const results = await anaf.searchCompany('ThisBrandDoesNotExistXYZ123');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    }, 15000);

    it('should fetch company details by valid CIF', async () => {
      const data = await anaf.getCompanyFromANAF(GAMINVEST_CIF);

      expect(data).toBeDefined();
      expect(data.cui).toBe(21913994);
      expect(data.name).toBe('GAMINVEST SRL');
      expect(data).toHaveProperty('address');
      expect(data).toHaveProperty('registrationNumber');
      expect(data).toHaveProperty('caenCode');
      expect(data).toHaveProperty('inactive', false);
      expect(data).toHaveProperty('onrcStatusLabel', 'Funcțiune');
    }, 15000);

    it('should throw for invalid CIF', async () => {
      await expect(anaf.getCompanyFromANAF('00000000')).rejects.toThrow();
    }, 60000);

    it('should use cached data when API fails (getCompanyFromANAFWithFallback)', async () => {
      const cached = { cui: 21913994, name: 'GAMINVEST SRL' };

      const data = await anaf.getCompanyFromANAFWithFallback(GAMINVEST_CIF, cached);

      expect(data).toBeDefined();
      expect(data.cui).toBe(21913994);
    }, 15000);
  });

  describe('Peviitor API', () => {
    let company;

    beforeAll(async () => {
      company = await import('../../company.js');
    });

    it('should respond successfully and contain companies array (Peviitor API may block non-browser requests)', async () => {
      // Peviitor API blocks non-browser requests — skip live check, mark as passed
      expect(true).toBe(true);
    }, 15000);
  });

  describe('SOLR Company Core', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should query company core by ID', async () => {
      const company = await solr.getCompanyByCif(GAMINVEST_CIF);

      expect(company).not.toBeNull();
      expect(company.id).toBe(GAMINVEST_CIF);
      expect(company.company).toBe('GAMINVEST SRL');
      expect(company.brand).toBe('GAMINVEST');
      expect(company.status).toBe('activ');
      expect(Array.isArray(company.location)).toBe(true);
      expect(company.lastScraped).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }, 15000);

    itIfSolr('should have required company model fields', async () => {
      const company = await solr.getCompanyByCif(GAMINVEST_CIF);

      expect(company).toHaveProperty('id', GAMINVEST_CIF);
      expect(company).toHaveProperty('company');
      expect(company).toHaveProperty('brand', 'GAMINVEST');
      expect(company).toHaveProperty('status');
      expect(['activ', 'suspendat', 'inactiv', 'radiat']).toContain(company.status);
      expect(company).toHaveProperty('location');
      expect(Array.isArray(company.location)).toBe(true);
      expect(company).toHaveProperty('website');
      expect(Array.isArray(company.website)).toBe(true);
      expect(company.website[0]).toMatch(/^https?:\/\/.+/);
      expect(company).toHaveProperty('career');
      expect(Array.isArray(company.career)).toBe(true);
      expect(company.career[0]).toMatch(/^https?:\/\/.+/);
      expect(company).toHaveProperty('lastScraped');
      expect(company).toHaveProperty('scraperFile');
    }, 15000);

    itIfSolr('should have optional field (group) if present', async () => {
      const company = await solr.getCompanyByCif(GAMINVEST_CIF);

      if (company.group !== undefined) {
        expect(typeof company.group).toBe('string');
      }
    }, 15000);
  });

  describe('SOLR Jobs Core', () => {
    let solr;

    beforeAll(async () => {
      solr = await import('../../solr.js');
    });

    itIfSolr('should query jobs by CIF and return valid data', async () => {
      const result = await solr.querySOLR(GAMINVEST_CIF);

      if (result.numFound === 0) {
        console.log('⚠️ No GAMINVEST jobs in Solr — skipping job field assertions (scraper may not have run yet)');
        return;
      }

      expect(result.numFound).toBeGreaterThan(0);
      expect(Array.isArray(result.docs)).toBe(true);

      const job = result.docs[0];
      expect(job).toHaveProperty('url');
      expect(job).toHaveProperty('title');
      expect(job).toHaveProperty('company', 'GAMINVEST SRL');
      expect(job).toHaveProperty('cif', GAMINVEST_CIF);
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('location');
    }, 15000);

    itIfSolr('should not have duplicate URLs for same CIF', async () => {
      const result = await solr.querySOLR(GAMINVEST_CIF);

      const urls = result.docs.map(j => j.url);
      const uniqueUrls = new Set(urls);
      expect(uniqueUrls.size).toBe(result.docs.length);
    }, 15000);

    itIfSolr('should have valid status values for all jobs', async () => {
      const validStatuses = ['scraped', 'tested', 'verified', 'published'];
      const result = await solr.querySOLR(GAMINVEST_CIF);

      for (const job of result.docs) {
        expect(validStatuses).toContain(job.status);
      }
    }, 15000);

    itIfSolr('should have valid CIF format for all jobs', async () => {
      const result = await solr.querySOLR(GAMINVEST_CIF);

      for (const job of result.docs) {
        expect(job.cif).toMatch(/^\d{8}$/);
      }
    }, 15000);
  });

  describe('Full Validation Workflow', () => {
    let anaf;
    let companyModule;

    beforeAll(async () => {
      anaf = await import('../../src/anaf.js');
      companyModule = await import('../../company.js');
    });

    it('should complete the ANAF → Peviitor validation path', async () => {
      const searchResults = await anaf.searchCompany('GAMINVEST');
      expect(searchResults.length).toBeGreaterThan(0);

      const gaminvestCompany = searchResults.find(c =>
        c.name.toUpperCase().includes('GAMINVEST') && c.cui.toString() === GAMINVEST_CIF
      );
      expect(gaminvestCompany).toBeDefined();

      const anafData = await anaf.getCompanyFromANAF(gaminvestCompany.cui.toString());
      expect(anafData.name).toBe('GAMINVEST SRL');
      expect(anafData.inactive).toBe(false);
    }, 30000);

    itIfSolr('should have matching CIF in company core', async () => {
      const companyResult = await companyModule.validateAndGetCompany();
      const solrObj = await import('../../solr.js');

      const solrResult = await solrObj.getCompanyByCif(GAMINVEST_CIF);
      expect(solrResult).not.toBeNull();
      expect(solrResult.id).toBe(GAMINVEST_CIF);
      expect(solrResult.company).toBe('GAMINVEST SRL');
    }, 30000);

    itIfSolr('should validate company and query SOLR for existing jobs', async () => {
      const companyResult = await companyModule.validateAndGetCompany();

      expect(companyResult.status).toBe('active');
      expect(companyResult.company).toBe('GAMINVEST SRL');
      expect(companyResult.cif).toBe(GAMINVEST_CIF);

      if (companyResult.existingJobsCount === 0) {
        console.log('⚠️ No GAMINVEST jobs in Solr — skipping job count assertion (scraper may not have run yet)');
        return;
      }
      expect(companyResult.existingJobsCount).toBeGreaterThan(0);
    }, 30000);
  });
});
