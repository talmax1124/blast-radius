import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));

async function shoot(file, width, height, out) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(join(dir, file)).href, { waitUntil: "load" });
    await page.waitForFunction(() => document.fonts.status === "loaded");
    await page.waitForTimeout(200);
    await page.screenshot({ path: out, type: "png", omitBackground: false });
  } finally {
    await browser.close();
  }
}

await shoot("og.html", 1200, 630, join(dir, "og.png"));
await shoot("banner.html", 1200, 264, join(dir, "banner.png"));
console.log("shot og + banner");
