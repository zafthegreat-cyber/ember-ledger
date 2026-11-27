// Non-English cards (Nov 27 2026, owner: "support non-English cards all the way through Collect,
// Find and Sell. Japanese first"). The rules for a card's language, what a scan and a search say
// about it, the scanned row's language button, the search scope, and the screens that use them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { build } from "esbuild";
import {
  CARD_LANGUAGES, cardLanguageBadge, cardLanguageChoices, cardLanguageFromScan, cardLanguageInQuery, cardLanguagePrice,
  cardLanguagePriceRule, catalogLanguageFor, catalogRowLanguage, isEnglishCard, japaneseSetCodeIn, languageForCatalogCard,
  normalizeCardLanguage, rowsForCardLanguage, titleWithCardLanguage,
} from "../src/utils/cardLanguage.mjs";
import {
  applyCardScanDetailToAll, cardScanDetailsKey, cardScanLanguage, cardScanLanguageLabel, cardScanLanguagePatch, cardScanRowsToChange, cardScanSavedDetails,
} from "../src/utils/cardScanDetails.mjs";
import { mergeScannedCardRows } from "../src/utils/cardScanRows.mjs";

const flat = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");
const has = (source, piece, why) => assert.ok(source.includes(piece), `${why}: missing "${piece}"`);

test("a language in the app's words, and the catalog it is matched in", () => {
  assert.equal(CARD_LANGUAGES[0], "English");
  assert.equal(CARD_LANGUAGES.length, 10);
  assert.equal(normalizeCardLanguage(""), "English", "an item saved before languages were picked is English");
  assert.equal(normalizeCardLanguage(undefined), "English");
  assert.equal(normalizeCardLanguage("jp"), "Japanese");
  assert.equal(normalizeCardLanguage(" JAPANESE "), "Japanese");
  assert.equal(normalizeCardLanguage("zh-tw"), "Chinese (Traditional)");
  assert.equal(normalizeCardLanguage("Deutsch"), "German");
  assert.equal(normalizeCardLanguage("Klingon"), "Klingon", "a language the list does not know is kept as typed");
  assert.equal(isEnglishCard(""), true);
  assert.equal(isEnglishCard("fr"), false);
  assert.deepEqual(cardLanguageChoices("Japanese"), [...CARD_LANGUAGES]);
  assert.deepEqual(cardLanguageChoices("Unknown").slice(-1), ["Unknown"], "an imported word stays pickable");

  assert.equal(catalogLanguageFor("English"), "English");
  for (const language of ["French", "German", "Italian", "Spanish", "Portuguese"]) assert.equal(catalogLanguageFor(language), "English", `${language} prints the English sets`);
  assert.equal(catalogLanguageFor("Japanese"), "Japanese");
  assert.equal(catalogLanguageFor("Korean"), "Japanese", "Korean cards print the Japanese set codes and numbers");
  assert.equal(catalogLanguageFor("Chinese (Traditional)"), "Japanese");
  assert.equal(catalogLanguageFor("Chinese (Simplified)"), "", "not in the catalog");
  assert.equal(catalogLanguageFor("Klingon"), "English", "as before languages were picked");

  assert.equal(catalogRowLanguage({}), "English");
  assert.equal(catalogRowLanguage({ language: "Japanese" }), "Japanese");
  const rows = [{ id: "en", language: "English" }, { id: "jp", language: "Japanese" }, { id: "old" }];
  assert.deepEqual(rowsForCardLanguage(rows, "French").map((row) => row.id), ["en", "old"]);
  assert.deepEqual(rowsForCardLanguage(rows, "Korean").map((row) => row.id), ["jp"]);
  assert.deepEqual(rowsForCardLanguage(rows, "Chinese (Simplified)"), []);
});

test("the price a copy shows, and the label it wears", () => {
  assert.deepEqual(cardLanguagePriceRule("English"), { source: "own", note: "" });
  assert.deepEqual(cardLanguagePriceRule("Japanese"), { source: "own", note: "" });
  assert.deepEqual(cardLanguagePriceRule("French"), { source: "english", note: "English card's price" }, "owner's yes: European copies show the English card's price, labelled");
  assert.deepEqual(cardLanguagePriceRule("Korean"), { source: "none", note: "No price for Korean copies yet" });
  assert.deepEqual(cardLanguagePriceRule("Chinese (Simplified)"), { source: "none", note: "No price for Chinese copies yet" });
  assert.deepEqual(cardLanguagePriceRule("Unknown"), { source: "own", note: "" }, "an import that named no language keeps its price");
  assert.equal(cardLanguagePrice("French", 12.5), 12.5, "counted in totals");
  assert.equal(cardLanguagePrice("Korean", 12.5), 0);
  assert.equal(cardLanguagePrice("Japanese", "3.10"), 3.1);
  assert.equal(cardLanguagePrice("English", -1), 0);

  assert.equal(cardLanguageBadge("English"), "");
  assert.equal(cardLanguageBadge(""), "");
  assert.equal(cardLanguageBadge("Unknown"), "", "not a language to show");
  assert.equal(cardLanguageBadge("jp"), "Japanese");
  assert.equal(titleWithCardLanguage("Pikachu", "Japanese"), "Pikachu Japanese");
  assert.equal(titleWithCardLanguage("Pikachu Japanese Promo", "jp"), "Pikachu Japanese Promo", "said once");
  assert.equal(titleWithCardLanguage("Pikachu", "English"), "Pikachu");
  assert.equal(titleWithCardLanguage("", "Japanese"), "");

  // A copy filed under a catalog card keeps its language when that card stands for it.
  assert.equal(languageForCatalogCard("French", "English"), "French");
  assert.equal(languageForCatalogCard("Korean", "Japanese"), "Korean");
  assert.equal(languageForCatalogCard("English", "Japanese"), "Japanese", "a Japanese card picked for an English row");
  assert.equal(languageForCatalogCard("Japanese", "English"), "English");
  assert.equal(languageForCatalogCard("", undefined), "English");
});

test("what a scanned card says about its language", () => {
  assert.deepEqual(cardLanguageFromScan({ text: "" }), { language: "English", source: "", check: false, setCode: "" });
  assert.deepEqual(cardLanguageFromScan({ text: "Pikachu HP 60 Thunder Shock 025/165" }), { language: "English", source: "", check: false, setCode: "" }, "nothing said: English, as before");
  assert.equal(cardLanguageFromScan({ text: "Pikachu MEW EN 025/165" }).language, "English");
  assert.equal(cardLanguageFromScan({ text: "Pikachu MEW EN 025/165" }).source, "code");
  assert.deepEqual(cardLanguageFromScan({ text: "Dracaufeu PAF FR 232/091" }), { language: "French", source: "code", check: false, setCode: "" });
  assert.equal(cardLanguageFromScan({ text: "Glurak OBF DE 125/197" }).language, "German");
  assert.equal(cardLanguageFromScan({ text: "Pikachu PAL FR" }).language, "English", "a language code with no number after it is not taken (a stray read)");
  const japanese = cardLanguageFromScan({ text: "ピカチュウ HP60 SV2a 025/165 C" });
  assert.deepEqual(japanese, { language: "Japanese", source: "set code", check: true, setCode: "SV2a" }, "Korean and Traditional Chinese cards print the same code, so it asks to be checked");
  assert.equal(cardLanguageFromScan({ text: "s12a 100/098" }).setCode, "s12a");
  assert.equal(cardLanguageFromScan({ text: "M2a 210/193" }).language, "Japanese");
  assert.equal(cardLanguageFromScan({ text: "MEW EN 025/165 and SV2a 025/165" }).language, "English", "an English code wins over a Japanese-looking one");
  // A slab's label names the language, but only on a slab (a card's own text says "Japanese" rarely, and never as its language).
  assert.deepEqual(cardLanguageFromScan({ text: "2023 POKEMON JAPANESE SV2a PIKACHU #025 PSA 10", slab: true }), { language: "Japanese", source: "slab", check: false, setCode: "" });
  assert.equal(cardLanguageFromScan({ text: "2023 POKEMON JAPANESE", slab: false }).language, "English");
  assert.deepEqual(cardLanguageFromScan({ text: "2021 POKEMON CHINESE PIKACHU PSA 9", slab: true }), { language: "Chinese (Traditional)", source: "slab", check: true, setCode: "" });
});

test("what a search says about the language it wants", () => {
  assert.deepEqual(cardLanguageInQuery("pikachu"), { language: "", query: "pikachu", setCode: "" });
  assert.deepEqual(cardLanguageInQuery("pikachu japanese"), { language: "Japanese", query: "pikachu", setCode: "" });
  assert.deepEqual(cardLanguageInQuery("jp pikachu 025/165"), { language: "Japanese", query: "pikachu 025/165", setCode: "" });
  assert.deepEqual(cardLanguageInQuery("sv2a pikachu"), { language: "Japanese", query: "pikachu", setCode: "sv2a" }, "a Japanese set code is Japanese");
  assert.deepEqual(cardLanguageInQuery("M7 booster box"), { language: "Japanese", query: "booster box", setCode: "M7" });
  assert.deepEqual(cardLanguageInQuery("japanese"), { language: "", query: "japanese", setCode: "" }, "a search of only the word is searched as typed");
  assert.deepEqual(cardLanguageInQuery("sv3 charizard"), { language: "", query: "sv3 charizard", setCode: "" }, "sv3 is an English set id too");
  assert.equal(japaneseSetCodeIn("charizard sv4a"), "sv4a");
  assert.equal(japaneseSetCodeIn("charizard sv4"), "");
});

test("a scanned row's language button", () => {
  assert.equal(cardScanLanguage({}), "English");
  assert.equal(cardScanLanguage({ language: "jp" }), "Japanese");
  assert.equal(cardScanLanguageLabel({ language: "Japanese", languageCheck: true }), "Japanese? Check");
  assert.equal(cardScanLanguageLabel({ language: "Korean" }), "Korean");
  assert.deepEqual(cardScanLanguagePatch("kr"), { language: "Korean", languageSource: "picked", languageCheck: false });

  const row = (id, extra = {}) => ({ id, cardName: "Pikachu", cardNumber: "025/165", scanned: true, ...extra });
  assert.notEqual(cardScanDetailsKey(row("a")), cardScanDetailsKey(row("b", { language: "Japanese" })), "a Japanese copy is another kind of copy");
  assert.equal(cardScanDetailsKey(row("a")), cardScanDetailsKey(row("b", { language: "en" })));
  // The same card in two languages is two lines, not two copies.
  const merged = mergeScannedCardRows([row("a")], [row("b", { language: "Japanese" }), row("c")]);
  assert.deepEqual(merged.map((entry) => [entry.id, entry.quantity]), [["a", 2], ["b", undefined]]);
  // "Use Japanese for every card": rows already Japanese are left, a row that asked to be checked is settled.
  const rows = [row("a"), row("b", { language: "Japanese" }), row("c", { language: "Japanese", languageCheck: true })];
  const all = applyCardScanDetailToAll(rows, "language", "Japanese");
  assert.equal(all[1], rows[1], "already Japanese: the same row");
  assert.deepEqual([all[0].language, all[0].languageSource, all[2].languageCheck], ["Japanese", "picked", false]);
  assert.equal(cardScanRowsToChange(rows, "b", "language", "Japanese"), 2);
  // What Save stores for the copy's details is as before (the language is set beside it).
  assert.deepEqual(cardScanSavedDetails(row("a", { language: "Japanese" })), { variant: "", printing: "", conditionName: "Near Mint" });
});

test("the catalog search looks in English, in the language asked for, and everywhere when nothing English matches", async () => {
  const out = resolve("artifacts/qa/catalog-search-100");
  await mkdir(out, { recursive: true });
  const bundlePath = resolve(out, "catalog-language-test.mjs");
  await build({ entryPoints: [resolve("src/services/pokemonCatalogSearch.js")], bundle: true, outfile: bundlePath, format: "esm", platform: "node", define: { "import.meta.env": "{}" } });
  const { searchPokemonCatalog, fetchCardsByNumber, fetchCardsForClues, CATALOG_SEARCH_VIEW } = await import(pathToFileURL(bundlePath) + "?language");
  assert.equal(CATALOG_SEARCH_VIEW, "catalog_search_all_languages");
  const japaneseOnly = { id: "jp-1", name: "Pikachu - 025/165", card_number: "025/165", set_name: "SV2a: Pokemon Card 151", set_code: "SV2a", language: "Japanese", category: "Pokemon" };
  const english = { id: "en-1", name: "Pikachu", card_number: "025/165", set_name: "151", set_code: "MEW", language: "English", category: "Pokemon" };
  // A client that answers from these rows and records what each request asked.
  const client = (rows) => {
    const asked = [];
    return {
      asked,
      from(source) {
        const request = { source, language: undefined, setCode: undefined };
        asked.push(request);
        const query = {
          select() { return query; }, neq() { return query; }, or() { return query; }, order() { return query; }, range() { return query; }, limit() { return query; }, in() { return query; },
          eq(column, value) { if (column === "language") request.language = value; return query; },
          ilike(column, value) { if (column === "set_code") request.setCode = value; return query; },
          abortSignal() { return query; },
          then(done) {
            const data = request.source === "tcg_card_details" ? [] : rows.filter((row) => (request.language === undefined || row.language === request.language) && (!request.setCode || row.set_code.toLowerCase() === request.setCode.toLowerCase()));
            return Promise.resolve({ data, error: null, count: data.length }).then(done);
          },
        };
        return query;
      },
    };
  };
  const searches = (supabase) => supabase.asked.filter((request) => request.source === CATALOG_SEARCH_VIEW);

  // A plain search: English only, as before.
  let supabase = client([english, japaneseOnly]);
  let result = await searchPokemonCatalog({ supabase, query: "pikachu", pageSize: 10, force: true });
  assert.deepEqual(result.rows.map((row) => row.id), ["en-1"]);
  assert.ok(searches(supabase).every((request) => request.language === "English"));
  assert.equal(result.searchedLanguage, "English");

  // "pikachu japanese": the Japanese catalog, the word taken out.
  supabase = client([english, japaneseOnly]);
  result = await searchPokemonCatalog({ supabase, query: "pikachu japanese", pageSize: 10, force: true });
  assert.deepEqual(result.rows.map((row) => row.id), ["jp-1"]);
  assert.ok(searches(supabase).every((request) => request.language === "Japanese"));

  // A Japanese set code: Japanese, filtered by the set.
  supabase = client([english, japaneseOnly]);
  result = await searchPokemonCatalog({ supabase, query: "sv2a pikachu", pageSize: 10, force: true });
  assert.deepEqual(result.rows.map((row) => row.id), ["jp-1"]);
  assert.ok(searches(supabase).some((request) => request.setCode === "sv2a"));

  // Nothing English: every language is looked in.
  // (other words than above: a search is kept for a while, by its words and language)
  supabase = client([japaneseOnly]);
  result = await searchPokemonCatalog({ supabase, query: "pikachu card", pageSize: 10, force: true });
  assert.deepEqual(result.rows.map((row) => row.id), ["jp-1"]);
  assert.equal(result.searchedLanguage, "");
  assert.deepEqual(searches(supabase).map((request) => request.language).filter((value, index, list) => list.indexOf(value) === index), ["English", undefined]);

  // A named language (the scanner's) is strict: no second look.
  supabase = client([japaneseOnly]);
  result = await searchPokemonCatalog({ supabase, query: "pikachu", pageSize: 10, force: true, language: "English" });
  assert.deepEqual(result.rows, []);
  assert.ok(searches(supabase).every((request) => request.language === "English"));
  supabase = client([english, japaneseOnly]);
  result = await searchPokemonCatalog({ supabase, query: "pikachu", pageSize: 10, force: true, language: "Korean" });
  assert.deepEqual(result.rows.map((row) => row.id), ["jp-1"], "a Korean card is looked for in the Japanese catalog");

  // The scanner's lookups ask one catalog.
  supabase = client([english, japaneseOnly]);
  assert.deepEqual((await fetchCardsByNumber({ supabase, number: "025/165" })).rows.map((row) => row.id), ["en-1"], "English unless asked");
  assert.deepEqual((await fetchCardsByNumber({ supabase, number: "025/165", language: "Japanese" })).rows.map((row) => row.id), ["jp-1"]);
  assert.deepEqual((await fetchCardsByNumber({ supabase, number: "025/165", language: "" })).rows.map((row) => row.id).sort(), ["en-1", "jp-1"], "every language when asked for none");
  const clues = await fetchCardsForClues({ supabase, names: ["Pikachu"], language: "Japanese" });
  assert.ok(clues.rows.every((row) => row.language === "Japanese"));
});

test("live matching names the language and prices the copy by its language", async () => {
  const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  async function matchCardScanRows(rows = []) {");
  const end = source.indexOf("\n  function setQuickAddPath(", start);
  assert.ok(start > 0 && end > start, "the live matcher is extractable");
  const products = {
    Pikachu: { id: "en", name: "Pikachu", setName: "151", cardNumber: "025/165", marketPrice: 4, language: "English" },
    Pikachu2: { id: "jp", name: "Pikachu", setName: "SV2a: Pokemon Card 151", cardNumber: "025/165", marketPrice: 3, language: "Japanese" },
  };
  let state = { cardScanRows: [
    { id: "fr", cardName: "Pikachu", cardNumber: "025/165", language: "French" },
    { id: "kr", cardName: "Pikachu2", cardNumber: "025/165", language: "Korean" },
    { id: "jp", cardName: "Pikachu2", cardNumber: "025/165", language: "Japanese" },
    { id: "moved", cardName: "Pikachu", cardNumber: "025/165", language: "English" },
  ] };
  const cardLanguage = await import("../src/utils/cardLanguage.mjs");
  const scope = {
    ...cardLanguage,
    matchScannedCardRow: async (row) => {
      // The person changes this row's language while it is being matched.
      if (row.id === "moved") state = { ...state, cardScanRows: state.cardScanRows.map((candidate) => (candidate.id === "moved" ? { ...candidate, language: "Japanese" } : candidate)) };
      return { card: products[row.cardName] || null, others: 0 };
    },
    getTideTradrMarketInfo: (product) => ({ currentMarketValue: product.marketPrice }),
    catalogTitle: (product) => product.name,
    cardNameForChoice: (name) => name,
    setQuickAddWizard: (fn) => { state = fn(state); },
  };
  vm.runInNewContext(source.slice(start, end) + "\nglobalThis.match = matchCardScanRows;", scope);
  await scope.match(state.cardScanRows);
  const byId = Object.fromEntries(state.cardScanRows.map((row) => [row.id, row]));
  assert.equal(byId.fr.matchedValue, 4, "a French copy shows the English card's price");
  assert.equal(byId.fr.matchedLabel, "Pikachu · 151 · 025/165");
  assert.equal(byId.kr.matchedValue, 0, "no price for a Korean copy");
  assert.equal(byId.kr.matchedLabel, "Pikachu · SV2a: Pokemon Card 151 · 025/165 · Japanese", "the card is named with its language");
  assert.equal(byId.jp.matchedValue, 3);
  assert.equal(byId.jp.matchedLanguage, "Japanese");
  assert.equal(byId.moved.matchState, undefined, "a row whose language changed is not given the old language's card");
});

test("wiring: scan, search results, Collect, Sell and listings use the language", () => {
  const app = flat("../src/App.jsx");
  const screen = flat("../src/features/deferredViews/AddAnythingContent.jsx");
  const details = flat("../src/components/CardScanRowDetails.jsx");
  const scanner = flat("../src/components/MultiCardScanner.jsx");
  const vault = flat("../src/features/vault/VaultPanels.jsx");
  const several = flat("../src/features/deferredViews/MultiDestinationContent.jsx");
  // The scanner reads the language; the row has a fourth one-tap button for it.
  has(scanner, "...scanLanguage(read),", "a scanned row takes the language the reader saw");
  has(details, 'aria-label={`Language: ', "the language button says what it is");
  has(details, "onChange?.(cardScanLanguagePatch(value));", "one tap sets it");
  // A language change finds the card again; a pick sets the copy's language.
  has(app, "rematchCardScanRows: matchCardScanRows,", "the add screen can match a row again");
  has(screen, 'const { rows: next, changed } = "matchedProduct" in patch ? { rows: updated, changed: [] } : rematchRelanguagedRows(rows, updated);', "a language change clears the match and finds it again");
  has(screen, "if (changed.length && rematchCardScanRows) void rematchCardScanRows(changed);", "the cleared rows are matched again");
  has(screen, "const language = languageForCatalogCard(row.language, choice.product.language);", "a picked card sets the copy's language");
  has(screen, 'rule.source === "none" || (rule.source === "english" && row.matchedValue) ? ` · ${rule.note}` : ""', "the matched row says whose price it shows");
  // Save all files the copy with its language and the price its language shows.
  has(app, "const copyLanguage = languageForCatalogCard(row.language, product.language);", "Save all keeps the copy's language");
  has(app, 'marketPrice: cardLanguagePriceRule(copyLanguage).source === "none" ? null : blankToNull(', "a Korean copy is saved with no price");
  // Search results and the picked item name a non-English card's language.
  has(app, "cardLanguageBadge(product.language), ].filter((label) => label && label !== \"Unknown\"))];", "Market results name the language");
  has(screen, "...productTypeLabels, cardLanguageBadge(product.language)]", "add results name the language");
  has(several, "cardLanguageBadge(selectedCatalog.language)", "the picked item names its language");
  // Collect and Sell: a Language choice beside Condition; the card in the collection names it.
  has(vault, '<CardLanguageField value={form.language} onChange={(language) => setForm("language", language)} /> <Field label="Condition Notes">', "Collect: beside Manual condition");
  has(vault, '<Field label="Condition"><input value={form.condition || ""} onChange={(e) => setForm("condition", e.target.value)} placeholder="Sealed, damaged box, NM, LP..." /></Field> <CardLanguageField', "Sell: beside Condition");
  has(vault, 'cardLanguageBadge(item.language)].filter(Boolean).join(" · ")', "the collection card names a non-English copy's language");
  has(several, '<Field label="Language">', "add to several places has a Language choice");
  has(app, "language: copyLanguage,", "and saves it");
  // Listings name the copy's language.
  has(app, "const title = titleWithCardLanguage(", "a listing's title names the language");
});

test("a scanned card is looked for in its language's catalog; a Japanese set code and number file their card", async () => {
  const source = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = source.indexOf("  async function findVerifiedCardForScanRow(row) {");
  const end = source.indexOf("\n  async function saveAllCardScanRows()", start);
  assert.ok(start > 0 && end > start, "the real matching functions are extractable");
  const identity = await import("../src/utils/catalogResultIdentity.mjs");
  const clueMatch = await import("../src/utils/cardClueMatch.mjs");
  const cardLanguage = await import("../src/utils/cardLanguage.mjs");
  const japanese = [
    { id: "jp-sv2a", name: "Pikachu - 025/165", cardNumber: "025/165", setCode: "SV2a", setName: "SV2a: Pokemon Card 151", language: "Japanese" },
    { id: "jp-s9a", name: "Gyarados", cardNumber: "025/165", setCode: "s9a", setName: "S9a: Battle Region", language: "Japanese" },
  ];
  const english = [{ id: "en-mew", name: "Pikachu", cardNumber: "025/165", setCode: "MEW", setName: "SV: Scarlet & Violet 151", language: "English" }];
  const asked = [];
  const scope = {
    ...cardLanguage,
    getCatalogCollectorQuery: identity.getCatalogCollectorQuery, catalogCardQueryMatchesRow: identity.catalogCardQueryMatchesRow,
    pickScannedCard: identity.pickScannedCard, settleScanMatch: identity.settleScanMatch,
    isSupabaseConfigured: true, supabase: {}, mapCatalog: (row) => row, getBestCatalogMatches: () => [], catalogProducts: [],
    fetchCardsByNumberOnDemand: async ({ language }) => { asked.push(language); return { rows: language === "Japanese" ? japanese : language === "English" ? english : [], facts: [] }; },
    searchPokemonCatalogOnDemand: async ({ language }) => { asked.push(`search:${language}`); return { rows: [] }; },
    fetchCardsForCluesOnDemand: async () => ({ rows: [], facts: [] }),
    loadClueMatch: async () => clueMatch,
  };
  // The app loads the clue picker on demand; the test hands it over the same way.
  const code = source.slice(start, end).split('import("./utils/cardClueMatch.mjs")').join("loadClueMatch()");
  vm.runInNewContext(code + "\nglobalThis.match = matchScannedCardRow;", scope);

  // A Japanese card: the name could not be read, the set code beside the number was.
  let result = await scope.match({ cardName: "Zqgx", cardNumber: "025/165", language: "Japanese", languageSource: "set code", languageCheck: true, scanSetCode: "SV2a" });
  assert.equal(result.card?.id, "jp-sv2a", "code and number name one card");
  assert.equal(result.nameAgrees, false, "the row says the name was hard to read");
  assert.ok(asked.length && asked.every((language) => language === "Japanese" || language === "search:Japanese"), "only the Japanese catalog was asked");

  // A Korean copy is looked for in the Japanese catalog too.
  asked.length = 0;
  result = await scope.match({ cardName: "", cardNumber: "025/165", language: "Korean", languageSource: "picked", scanSetCode: "SV2a" });
  assert.equal(result.card?.id, "jp-sv2a");
  assert.ok(asked.every((language) => language === "Japanese"));

  // Simplified Chinese cards are not in the catalog: nothing is looked up.
  asked.length = 0;
  result = await scope.match({ cardName: "Pikachu", cardNumber: "025/165", language: "Chinese (Simplified)" });
  assert.equal(result.card, null);
  assert.deepEqual(asked, []);

  // An English card read as before is matched as before, in the English catalog only.
  asked.length = 0;
  result = await scope.match({ cardName: "Pikachu", cardNumber: "025/165" });
  assert.equal(result.card?.id, "en-mew");
  assert.deepEqual(asked, ["English"]);

  // Number read, no name, nothing said the language, no English card: the Japanese cards with the number are offered.
  scope.fetchCardsByNumberOnDemand = async ({ language }) => { asked.push(language); return { rows: language === "Japanese" ? japanese : [], facts: [] }; };
  asked.length = 0;
  result = await scope.match({ cardName: "", cardNumber: "025/165" });
  assert.equal(result.card, null, "never filed this way");
  assert.deepEqual([...result.choices].map((card) => card.id), ["jp-sv2a", "jp-s9a"]);
  assert.equal(result.choicesBy, "number");
  // A row whose language was read or picked gets no such offer.
  result = await scope.match({ cardName: "", cardNumber: "025/165", languageSource: "code" });
  assert.equal((result.choices || []).length, 0);
});
