import { test } from "@playwright/test";
import { getHealedLocator } from "../../modules/locator-recovery/healer/healingExecutor";

test("Collect SauceDemo metadata", async ({ page }) => {

  await page.goto("https://www.saucedemo.com");

  // login page
  await getHealedLocator(page, "#user-name", "username_input");
  await getHealedLocator(page, "#password", "password_input");
  await getHealedLocator(page, "#login-button", "login_button");

  await page.locator("#user-name").fill("standard_user");
  await page.locator("#password").fill("secret_sauce");
  await page.locator("#login-button").click();

  // navigation
  await getHealedLocator(page, ".shopping_cart_link", "shopping_cart_link");
  await getHealedLocator(page, "#react-burger-menu-btn", "menu_button");

  // filters
  await getHealedLocator(page, ".product_sort_container", "filter_dropdown");

  // product elements
  await getHealedLocator(page, "#add-to-cart-sauce-labs-backpack", "add_backpack");
  await getHealedLocator(page, "#add-to-cart-sauce-labs-bike-light", "add_bike_light");
  await getHealedLocator(page, "#add-to-cart-sauce-labs-bolt-t-shirt", "add_bolt_shirt");

  // product titles
  await getHealedLocator(page, "#item_4_title_link", "item_backpack_title");
  await getHealedLocator(page, "#item_0_title_link", "item_bike_light_title");

});