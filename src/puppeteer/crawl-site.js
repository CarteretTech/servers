// crawl-site.js
// Custom Puppeteer crawler for local Astro site
// Usage: node crawl-site.js

const puppeteer = require('puppeteer');
const startUrl = 'http://localhost:4321';
const visited = new Set();
const siteMap = {};

console.log('Starting site crawl at', startUrl);

async function crawl(url, depth = 0) {
  if (visited.has(url) || depth > 3) return;
  visited.add(url);
  siteMap[url] = [];
  console.log('Visiting:', url, 'at depth', depth);
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const links = await page.$$eval('a[href^="/"]', as => as.map(a => a.href));
    for (const link of links) {
      if (!visited.has(link)) {
        siteMap[url].push(link);
        await crawl(link, depth + 1);
      }
    }
    await page.close();
  } catch (e) {
    console.error('Error visiting', url, e.message);
  } finally {
    if (browser) await browser.close();
  }
}

(async () => {
  await crawl(startUrl);
  console.log('Site Map:', JSON.stringify(siteMap, null, 2));
})();
