// crawl-site.cjs
// Custom Puppeteer crawler for local Astro site
// Usage: node crawl-site.cjs

const puppeteer = require('puppeteer');
const fs = require('fs').promises; // Use promises for async file operations
const path = require('path');

const startUrl = 'http://localhost:4321';
const visited = new Set();
const siteMap = {};
const errors = [];

const navigationLogPath = path.join(__dirname, 'navigation_log.json');
const errorLogPath = path.join(__dirname, 'error_log.json');

console.log('Starting site crawl at', startUrl);

// Pass browser instance to the crawl function
async function crawl(browser, url, depth = 0) {
  if (visited.has(url)) return;
  visited.add(url);
  siteMap[url] = [];
  console.log(`Visiting: ${url} (Depth: ${depth})`);

  let page; // Define page outside try block
  try {
    page = await browser.newPage();
    // Wait longer, until network is idle
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract links starting with '/' or the startUrl base
    const links = await page.$$eval(`a[href^="/"], a[href^="${startUrl}"]`, anchors =>
      anchors.map(a => a.href)
    );

    await page.close(); // Close page after use

    const internalLinks = new Set(); // Use a Set to avoid duplicates for this level

    for (const link of links) {
      let absoluteLink = link;
      // Ensure links are absolute and within the target domain
      if (absoluteLink.startsWith('/')) {
        const urlObject = new URL(startUrl);
        absoluteLink = `${urlObject.origin}${link}`;
      }

      // Only process links starting with the base URL
      if (absoluteLink.startsWith(startUrl)) {
         // Clean up potential trailing slashes or fragments for consistent checking
         const cleanedLink = absoluteLink.split('#')[0].replace(/\/$/, '');
         if (!visited.has(cleanedLink)) {
            siteMap[url].push(cleanedLink); // Add to siteMap before adding to processing set
            internalLinks.add(cleanedLink);
         }
      }
    }

    // Recursively crawl newly found internal links
    for (const linkToCrawl of internalLinks) {
        await crawl(browser, linkToCrawl, depth + 1); // Pass browser instance
    }

  } catch (e) {
    console.error(`Error visiting ${url}: ${e.message}`);
    errors.push({ url: url, error: e.message, stack: e.stack });
    if (page && !page.isClosed()) {
      await page.close(); // Ensure page is closed on error
    }
  }
}

(async () => {
  let browser;
  try {
    console.log('Crawl script started.');
    browser = await puppeteer.launch({ headless: true }); // Launch browser once
    await crawl(browser, startUrl); // Start crawl with the browser instance

    console.log('Crawl finished. Writing logs...');

    // Write Site Map
    try {
      await fs.writeFile(navigationLogPath, JSON.stringify(siteMap, null, 2));
      console.log(`Site map saved to ${navigationLogPath}`);
    } catch (writeErr) {
      console.error(`Failed to write navigation log: ${writeErr.message}`);
    }

    // Write Errors
    if (errors.length > 0) {
      try {
        await fs.writeFile(errorLogPath, JSON.stringify(errors, null, 2));
        console.log(`Errors saved to ${errorLogPath}`);
      } catch (writeErr) {
        console.error(`Failed to write error log: ${writeErr.message}`);
      }
    } else {
      console.log('No errors encountered during crawl.');
      // Ensure error log file doesn't exist if there are no errors
      try {
        await fs.unlink(errorLogPath);
      } catch (unlinkErr) {
        if (unlinkErr.code !== 'ENOENT') { // Ignore if file doesn't exist
             console.error(`Could not remove old error log: ${unlinkErr.message}`);
        }
      }
    }

  } catch (err) {
    console.error('Fatal error in crawl script:', err);
    errors.push({ url: 'N/A', error: `Fatal error: ${err.message}`, stack: err.stack });
     // Attempt to write errors even on fatal script error
     try {
        await fs.writeFile(errorLogPath, JSON.stringify(errors, null, 2));
        console.log(`Errors (including fatal) saved to ${errorLogPath}`);
      } catch (writeErr) {
        console.error(`Failed to write fatal error log: ${writeErr.message}`);
      }
  } finally {
    if (browser) {
      await browser.close(); // Close browser at the very end
      console.log('Browser closed.');
    }
    console.log('Crawl script finished.');
  }
})();
