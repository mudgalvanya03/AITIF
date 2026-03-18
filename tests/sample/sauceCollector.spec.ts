import { test } from "@playwright/test";
import { collectLocatorMetadata } from "../../modules/locator-recovery/collector/LocatorCollector";

test("AITIF Metadata Capture - SauceDemo Login", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  const username = page.locator("#user-name");
  const password = page.locator("#password");
  const loginBtn = page.locator("#login-button");

  // Fill login form
  await username.fill("standard_user");
  await password.fill("secret_sauce");

  // Capture metadata BEFORE clicking
  await collectLocatorMetadata(username, "username_input");
  await collectLocatorMetadata(password, "password_input");
  await collectLocatorMetadata(loginBtn, "login_button");

  await loginBtn.click();

});
