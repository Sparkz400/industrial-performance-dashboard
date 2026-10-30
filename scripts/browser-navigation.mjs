const groups = [
  [
    "Planning",
    "Planung",
    [
      "Planning",
      "Planung",
      "Work orders",
      "Changeovers",
      "Completion forecast",
    ],
  ],
  [
    "Maintenance",
    "Wartung",
    [
      "Maintenance",
      "Alarm actions",
      "Alarm usefulness",
      "Improvement actions",
      "Recommendations",
      "Alarmmaßnahmen",
      "Alarmbewertung",
    ],
  ],
  [
    "Analysis",
    "Analyse",
    ["Energy and losses", "Comparisons", "Calculated signals"],
  ],
  ["History", "Historie", ["History"]],
  [
    "Connections",
    "Verbindungen",
    ["Connection diagnostics", "PLC alarms", "Verbindungsdiagnose"],
  ],
  [
    "Assets",
    "Anlagen",
    ["Production line", "Asset overview", "Sites", "Produktionslinie"],
  ],
];

export async function selectOperation(page, name) {
  const group = groups.find((item) => item[2].includes(name));
  if (!group) throw new Error(`Unknown operations destination: ${name}`);
  await page
    .getByRole("combobox", { name: /^(Work area|Arbeitsbereich)$/ })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`^(${group[0]}|${group[1]})$`) })
    .click();
  const tab = page.getByRole("tab", { name, exact: true });
  if ((page.viewportSize()?.width ?? 1440) >= 900) await tab.click();
  else {
    await page
      .getByRole("combobox", { name: /^(Daily operations|Täglicher Betrieb)$/ })
      .click();
    await page.getByRole("option", { name, exact: true }).click();
  }
}

export async function selectSettings(page, name) {
  const tab = page.getByRole("tab", { name, exact: true });
  if ((page.viewportSize()?.width ?? 1440) >= 900) await tab.click();
  else {
    await page
      .getByRole("combobox", {
        name: /^(Settings section|Einstellungsbereich)$/,
      })
      .click();
    await page.getByRole("option", { name, exact: true }).click();
  }
}
