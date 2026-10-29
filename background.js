"use strict";

// Firefox MV3 event page. No host permissions, automatic content scripts or polling.
let localInterface;
const activating = new Set();
function interfaceFiles() {
  // These are packaged moz-extension:// resources, never remote requests.
  return (localInterface ||= Promise.all(
    ["interface.html", "interface.css"].map(async (file) => {
      const response = await fetch(browser.runtime.getURL(file));
      if (!response.ok) throw new Error("Risorsa locale non disponibile");
      return response.text();
    }),
  )
    .then(([html, css]) => ({ html, css }))
    .catch((error) => {
      localInterface = null;
      throw error;
    }));
}
browser.action.onClicked.addListener(async (tab) => {
  if (!Number.isInteger(tab.id) || activating.has(tab.id)) return;
  activating.add(tab.id);
  try {
    const assets = await interfaceFiles();
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await browser.tabs.sendMessage(tab.id, {
      type: "akhbar-blur:activate",
      ...assets,
    });
    await browser.action.setBadgeText({ tabId: tab.id, text: "" });
    await browser.action.setTitle({
      tabId: tab.id,
      title: "Akhbar Blur — seleziona un’area",
    });
  } catch {
    await browser.action
      .setBadgeBackgroundColor({ tabId: tab.id, color: "#a02b36" })
      .catch(() => {});
    await browser.action
      .setBadgeText({ tabId: tab.id, text: "!" })
      .catch(() => {});
    await browser.action
      .setTitle({
        tabId: tab.id,
        title:
          "Akhbar Blur: Firefox protegge questa pagina o la scheda non è più disponibile. Prova un normale articolo web.",
      })
      .catch(() => {});
  } finally {
    activating.delete(tab.id);
  }
});
