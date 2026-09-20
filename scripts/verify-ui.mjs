import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: chromePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1040 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await expectText(page, "Live intake");

  const startButton = page.getByRole("button", { name: "Start consented intake" });
  assert.equal(await startButton.isDisabled(), true, "intake must be disabled before consent");

  await page.locator('input[type="checkbox"]').first().click();
  await page.waitForTimeout(250);
  assert.equal(await startButton.isEnabled(), true, "intake must unlock after transcription consent");

  await page.getByRole("button", { name: "Add demo turns" }).click();
  await expectText(page, "Urgent review");
  await expectText(page, "Scripted urgent-review cue");

  await page.getByRole("button", { name: "Prepare clinician alert" }).click();
  await expectText(page, "Duty clinician workspace");
  await expectText(page, "Human confirmation required");

  await page.getByLabel("Clinician note / override reason").fill("Demo review complete.");
  await page.getByRole("button", { name: "Confirm prepared action" }).click();
  await expectText(page, "Prepared action confirmed");

  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({ path: "test-artifacts/clinician-review.png", fullPage: true });

  await page.getByRole("button", { name: "Coverage & tasks" }).click();
  await expectText(page, "Care task queue");
  await expectText(page, "Demo case #24");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-artifacts/mobile-coverage.png", fullPage: true });

  assert.deepEqual(consoleErrors, [], `browser console errors: ${consoleErrors.join(" | ")}`);
  console.log("Playwright flow passed: consent gate → policy result → clinician confirmation → task queue → mobile layout.");
} finally {
  await context.close();
  await browser.close();
}

async function expectText(page, text) {
  const matches = page.getByText(text, { exact: false });
  await matches.first().waitFor({ state: "visible", timeout: 10_000 });
  assert.ok((await matches.count()) > 0, `expected visible text: ${text}`);
}
