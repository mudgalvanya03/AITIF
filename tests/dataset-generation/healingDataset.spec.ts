import { test } from "@playwright/test";
import { getHealedLocator } from "../../modules/locator-recovery/healer/healingExecutor";

test("Generate healing dataset", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  // broken login selectors
  await getHealedLocator(page, "#wrong-user", "username_input");
  await getHealedLocator(page, "#wrong-pass", "password_input");
  await getHealedLocator(page, "#wrong-login", "login_button");

  await page.locator("#user-name").fill("standard_user");
  await page.locator("#password").fill("secret_sauce");
  await page.locator("#login-button").click();

  // broken navigation
  await getHealedLocator(page, "#wrong-cart", "shopping_cart_link");
  await getHealedLocator(page, "#wrong-menu", "menu_button");

  // broken filter
  await getHealedLocator(page, "#wrong-sort", "filter_dropdown");

  // broken product buttons
  await getHealedLocator(page, "#wrong-backpack", "add_backpack");
  await getHealedLocator(page, "#wrong-bike", "add_bike_light");
  await getHealedLocator(page, "#wrong-shirt", "add_bolt_shirt");

});