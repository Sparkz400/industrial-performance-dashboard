import { test, expect } from "@playwright/test";
import { login } from "./login";

test("machine settings survive create, edit and reload, and can be deleted", async ({
  page,
}) => {
  await login(page);
  await page.goto("/machines");
  await expect(
    page.getByRole("heading", { name: "Machines", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Machine", exact: true }).click();
  const form = page.getByRole("form");
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form.getByText("Name and IP are required")).toBeVisible();
  const name = `E2E machine ${Date.now()}`;
  await form.getByLabel("Machine Name").fill(name);
  await form.getByLabel("IP Address").fill("localhost");
  await form.getByLabel(/^Port/).fill("4841");
  await form.getByLabel("Resource Path").fill("/UA/Test");
  await form.getByRole("switch", { name: "Active" }).uncheck();
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  const card = page.locator(".MuiCard-root").filter({ hasText: name });
  await expect(
    card.getByText("opc.tcp://localhost:4841/UA/Test"),
  ).toBeVisible();
  await expect(card.getByText("Inactive")).toBeVisible();
  await card.getByRole("button", { name: /^Edit:/ }).click();
  await expect(form.getByLabel(/^Port/)).toHaveValue("4841");
  await expect(
    form.getByRole("switch", { name: "Active" }),
  ).not.toBeChecked();
  await form.getByLabel("Resource Path").fill("/UA/Updated");
  await form.getByRole("button", { name: "Update", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  await expect(
    card.getByText("opc.tcp://localhost:4841/UA/Updated"),
  ).toBeVisible();
  await card.getByRole("button", { name: /^Delete:/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(card).toHaveCount(0);
});
