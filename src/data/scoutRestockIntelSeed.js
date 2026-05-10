export const SCOUT_SOURCE_TYPES = [
  "user_report",
  "photo_report",
  "text_screenshot",
  "group_chat",
  "planner_guess",
  "employee_tip",
  "called_store",
  "social_media_post",
  "manual_prediction",
  "user_correction",
];

export const SCOUT_CONFIDENCE_LEVELS = ["confirmed", "likely", "possible", "rumor", "guess"];

export const SCOUT_VISIBILITY_LEVELS = ["private", "shared_with_team", "public_cleaned"];

export const SCOUT_VISIBILITY_COPY = {
  private: {
    label: "Private from other users",
    helper: "Only you and app admins can see this. It will not be shown publicly or shared with other users.",
  },
  shared_with_team: {
    label: "Shared with team",
    helper: "People in your shared workspace and app admins can see this. It will not be shown publicly.",
  },
  public_cleaned: {
    label: "Public",
    helper: "Other users may see this report or guess.",
  },
};

export const SCOUT_STORE_ALIASES = [
  { alias: "PA", likelyStore: "Princess Anne Target" },
  { alias: "NN", likelyArea: "Newport News" },
  { alias: "Mil Hwy", likelyStoreOptions: ["Military Highway Target", "Military Highway Walmart"] },
  { alias: "Ches Square", likelyStoreOptions: ["Chesapeake Square Target", "Chesapeake Square Walmart"] },
  { alias: "Ches sq", likelyStoreOptions: ["Chesapeake Square Target", "Chesapeake Square Walmart"] },
  { alias: "Greenbrier", likelyStoreOptions: ["Greenbrier Target", "Greenbrier Barnes & Noble", "Greenbrier Walmart"] },
  { alias: "Redmill", likelyStore: "Redmill Target" },
  { alias: "Red Mill", likelyStore: "Redmill Target" },
  { alias: "Pembroke", likelyStore: "Pembroke Target" },
  { alias: "First Colonial", likelyStore: "First Colonial Target" },
  { alias: "Hillcrest", likelyStoreOptions: ["Hillcrest Target", "Hillcrest Walmart"] },
  { alias: "South Independence", likelyStore: "South Independence Target" },
  { alias: "WC", likelyArea: "Williamsburg" },
  { alias: "Burg", likelyArea: "Williamsburg" },
  { alias: "B&N", retailer: "Barnes & Noble" },
  { alias: "Barnes", retailer: "Barnes & Noble" },
  { alias: "Dicks", retailer: "DICK'S Sporting Goods" },
  { alias: "OP", productText: "One Piece" },
  { alias: "PO", productText: "Prismatic/Pokemon product context-dependent; mark needs review" },
  { alias: "AH", productText: "Ascended Heroes" },
  { alias: "ETB", productText: "Elite Trainer Box" },
];

export const SCOUT_HISTORICAL_INTEL_SEED = [
  { storeAlias: "College Drive Walmart", retailer: "Walmart", pattern: "Thursday", confidence: "possible", sourceType: "user_correction" },
  { storeAlias: "Franklin Walmart", retailer: "Walmart", pattern: "Wednesday", confidence: "possible", sourceType: "user_correction" },
  { storeAlias: "Suffolk Walmart", retailer: "Walmart", pattern: "Wednesday", confidence: "possible", sourceType: "user_correction" },
  { storeAlias: "Chesapeake Square Target", retailer: "Target", sourceText: "Only 5 pin collections, everything else was perfect order.", productsMentioned: ["pin collections", "perfect order"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Chesapeake Square Target", retailer: "Target", sourceText: "Target Chesapeake Square just hit, all perfect order. ETBs, 3 pack blisters and singles.", productsMentioned: ["ETBs", "3 pack blisters", "singles"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Chesapeake Square Target", retailer: "Target", sourceText: "They had 40 bundles, 30 ex boxes, 3 pack blisters.", productsMentioned: ["bundles", "ex boxes", "3 pack blisters"], quantityText: "40 bundles, 30 ex boxes", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Portsmouth Target", retailer: "Target", sourceText: "Portsmouth and Chesapeake Square are confirmed Thursday or Friday. Worker told me.", pattern: "Thursday or Friday", confidence: "likely", sourceType: "employee_tip" },
  { storeAlias: "Chesapeake Square Target", retailer: "Target", sourceText: "Portsmouth and Chesapeake Square are confirmed Thursday or Friday. Worker told me.", pattern: "Thursday or Friday", confidence: "likely", sourceType: "employee_tip" },
  { storeAlias: "Military Highway Target", retailer: "Target", sourceText: "Military highway being stocked now target apparently.", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Target", retailer: "Target", sourceText: "Greenbrier restocks every Monday and Tuesday morning. Monday is small stuff and Tuesday is big stuff from my research.", pattern: "Monday and Tuesday morning; Monday small items, Tuesday bigger restock", confidence: "possible", sourceType: "manual_prediction" },
  { storeAlias: "Greenbrier Target", retailer: "Target", sourceText: "Insider info that Greenbrier Target is gonna have a restock this morning.", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Target", retailer: "Target", sourceText: "Greenbrier Target perfect order ETBs.", productsMentioned: ["ETBs", "perfect order"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Target", retailer: "Target", sourceText: "Greenbrier has amended tins.", productsMentioned: ["tins"], confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Target", retailer: "Target", sourceText: "PA Target and Greenbrier restocked. AH poster, pin and blisters at Greenbrier.", productsMentioned: ["AH poster", "pin collections", "blisters"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Princess Anne Target", retailer: "Target", sourceText: "PA Target and Greenbrier restocked.", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Princess Anne Target", retailer: "Target", sourceText: "When was PA last drop? Tuesday.", pattern: "Tuesday", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Pembroke Target", retailer: "Target", sourceText: "Pembroke stocked in the AM.", pattern: "Morning", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Pembroke Target", retailer: "Target", sourceText: "Restock at Pembroke. EX boxes. Pokeballs, AH 2 pack blisters, One Piece, PO ETBs, sleeves.", productsMentioned: ["EX boxes", "Pokeballs", "AH 2 pack blisters", "One Piece", "PO ETBs", "sleeves"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Pembroke Target", retailer: "Target", sourceText: "Pembroke Target Monday, Wednesday PM around 12, and if they don't then Thursday/Friday, all per employee.", pattern: "Monday, Wednesday around noon, possibly Thursday/Friday if delayed", confidence: "likely", sourceType: "employee_tip" },
  { storeAlias: "First Colonial Target", retailer: "Target", sourceText: "First Colonial has Ascended ETBs.", productsMentioned: ["Ascended ETBs"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "First Colonial Target", retailer: "Target", sourceText: "Line of 15 at First Colonial in Pembroke already.", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "Redmill still has 4 blisters, 1 per person.", productsMentioned: ["blisters"], quantityText: "4 blisters", limits: "1 per person", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "Redmill got First Partner boxes and Charizard tins.", productsMentioned: ["First Partner boxes", "Charizard tins"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "Redmill has 2 full cases of First Partner. I just called.", productsMentioned: ["First Partner boxes"], quantityText: "2 full cases", confidence: "confirmed", sourceType: "called_store" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "Just called and Target still has first partner boxes, and now PO ETBs.", productsMentioned: ["First Partner boxes", "PO ETBs"], confidence: "confirmed", sourceType: "called_store" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "AH Booster and 2 pack blister at Redmill. 15 left of booster.", productsMentioned: ["AH booster", "2 pack blister"], quantityText: "15 boosters left", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Redmill Target", retailer: "Target", sourceText: "Just called Redmill Target. They only got One Piece this morning.", productsMentioned: ["One Piece"], confidence: "confirmed", sourceType: "called_store" },
  { storeAlias: "Hillcrest Target", retailer: "Target", sourceText: "Hillcrest has stuff, mini tins mentioned.", productsMentioned: ["mini tins"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Hillcrest Target", retailer: "Target", sourceText: "Hillcrest Target Monday and Friday, occasionally Wednesday or weekend.", pattern: "Monday and Friday; occasional Wednesday or weekend", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "South Independence Target", retailer: "Target", pattern: "Thursday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Independence Target", retailer: "Target", pattern: "Tuesday and Thursday", confidence: "guess", sourceType: "manual_prediction" },
  { storeAlias: "Hampton Target", retailer: "Target", pattern: "Thursday or Friday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Hilltop Target", retailer: "Target", sourceText: "Facebook screenshot says Hilltop Target dropped a bunch of Ascended, only a few First Partner boxes left.", productsMentioned: ["Ascended", "First Partner boxes"], confidence: "likely", sourceType: "social_media_post" },
  { storeAlias: "Northern Suffolk Walmart", retailer: "Walmart", pattern: "Friday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Military Highway Walmart", retailer: "Walmart", pattern: "Wednesday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Chesapeake Square Walmart", retailer: "Walmart", pattern: "Wednesday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Yorktown Walmart", retailer: "Walmart", sourceText: "Yorktown midday for Walmart. Yup between 9:30 to 12 typically.", pattern: "Friday midday, usually 9:30 AM - 12 PM", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Hillcrest Walmart", retailer: "Walmart", pattern: "Wednesday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Williamsburg Walmart", retailer: "Walmart", pattern: "Friday morning, uncertain", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "Salem Walmart", retailer: "Walmart", sourceText: "Salem Walmart dropped but too many people so I left.", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Barnes & Noble", retailer: "Barnes & Noble", sourceText: "One Piece Ascended Greenbrier Barnes and Noble. Tins. Not many visible.", productsMentioned: ["One Piece", "Ascended", "tins"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Greenbrier Barnes & Noble", retailer: "Barnes & Noble", sourceText: "Greenbrier B&N and Target have OP.", productsMentioned: ["One Piece"], confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Barnes & Noble", retailer: "Barnes & Noble", sourceText: "Barnes is random restocks typically 10:30 AM to 1 PM. Usually a few times a week. UPS drops off the box and they put it on the shelf behind customer service.", pattern: "Random, often 10:30 AM - 1 PM, tied to UPS delivery", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Barnes & Noble", retailer: "Barnes & Noble", sourceText: "B&N has been random for me but mostly 10:30 to 2. When the delivery guy comes. UPS truck.", pattern: "Random, mostly 10:30 AM - 2 PM, tied to UPS delivery", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Barnes & Noble Newport News", retailer: "Barnes & Noble", sourceText: "Barnes NN has OP as well. Limit 1.", productsMentioned: ["One Piece"], limits: "Limit 1", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "DICK'S Suffolk", retailer: "DICK'S Sporting Goods", sourceText: "Dicks Suffolk is Mon/Wed. Truck day switched.", pattern: "Monday and Wednesday", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "DICK'S Suffolk", retailer: "DICK'S Sporting Goods", sourceText: "Dicks Suffolk around 2 PM Monday and Wednesday.", pattern: "Monday and Wednesday around 2 PM", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "DICK'S Sporting Goods", retailer: "DICK'S Sporting Goods", sourceText: "Dicks Tuesday & Thursday.", pattern: "Tuesday and Thursday", confidence: "guess", sourceType: "planner_guess" },
  { storeAlias: "CVS Nimmo", retailer: "CVS", sourceText: "CVS had AH tins. 4 per person. About a box left. General Booth and Nimmo.", productsMentioned: ["AH tins"], limits: "4 per person", quantityText: "about a box left", confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Walgreens Nimmo", retailer: "Walgreens", sourceText: "AH tins at Walgreens Nimmo. They do have a lot.", productsMentioned: ["AH tins"], confidence: "likely", sourceType: "text_screenshot" },
  { storeAlias: "Best Buy", retailer: "Best Buy", sourceText: "Best Buy stock? I think there's chairs at Best Buy already.", confidence: "possible", sourceType: "text_screenshot" },
  { storeAlias: "Hot Topic", retailer: "Hot Topic", sourceText: "Hot Topic line is starting.", confidence: "possible", sourceType: "text_screenshot" },
].map((entry, index) => ({
  id: `seed-intel-${index + 1}`,
  visibility: "private",
  rawProductText: (entry.productsMentioned || []).join(", "),
  matchedProducts: [],
  needsCatalogReview: Boolean(entry.productsMentioned?.length),
  createdAt: "2026-05-09T12:00:00.000Z",
  ...entry,
}));

export function buildScoutRestockPatterns(intel = SCOUT_HISTORICAL_INTEL_SEED) {
  const grouped = intel.reduce((acc, entry) => {
    const key = `${entry.retailer || "Unknown"}|${entry.storeAlias || "Unknown store"}`;
    acc[key] = acc[key] || {
      id: `pattern-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      storeAlias: entry.storeAlias || "Unknown store",
      retailer: entry.retailer || "Unknown",
      nickname: entry.storeAlias || "Unknown store",
      usualDays: [],
      usualTimeWindow: "",
      productTypePattern: "",
      confidence: "guess",
      sourceCount: 0,
      lastConfirmedRestockAt: "",
      notes: "",
      patternCandidates: [],
      computedConfidence: "guess",
    };
    const candidate = {
      pattern: entry.pattern || entry.sourceText || (entry.productsMentioned || []).join(", ") || "Report saved",
      sourceType: entry.sourceType || "user_report",
      confidence: entry.confidence || "possible",
    };
    acc[key].patternCandidates.push(candidate);
    acc[key].sourceCount += 1;
    if (entry.pattern && !acc[key].productTypePattern) acc[key].productTypePattern = entry.pattern;
    if (entry.quantityText || entry.limits) {
      acc[key].notes = [acc[key].notes, entry.quantityText, entry.limits].filter(Boolean).join(" | ");
    }
    const dayMatches = String(entry.pattern || "").match(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/gi) || [];
    acc[key].usualDays = [...new Set([...acc[key].usualDays, ...dayMatches.map((day) => day[0].toUpperCase() + day.slice(1).toLowerCase())])];
    const timeMatch = String(entry.pattern || entry.sourceText || "").match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b(?:\s*-\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)\b)?/);
    if (timeMatch && !acc[key].usualTimeWindow) acc[key].usualTimeWindow = timeMatch[0].replace(/\bam\b/g, "AM").replace(/\bpm\b/g, "PM");
    return acc;
  }, {});

  const confidenceRank = { guess: 1, rumor: 2, possible: 3, likely: 4, confirmed: 5 };
  return Object.values(grouped).map((pattern) => {
    const best = pattern.patternCandidates.reduce((winner, candidate) =>
      confidenceRank[candidate.confidence] > confidenceRank[winner.confidence] ? candidate : winner,
      pattern.patternCandidates[0] || { confidence: "guess" }
    );
    return {
      ...pattern,
      confidence: best.confidence || "guess",
      computedConfidence: best.confidence || "guess",
      usualTimeWindow: pattern.usualTimeWindow || "Unknown",
      productTypePattern: pattern.productTypePattern || pattern.patternCandidates[0]?.pattern || "Needs more reports",
    };
  });
}
