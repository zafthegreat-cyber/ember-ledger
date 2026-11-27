// Graded slab label text (src/utils/slabLabelText.mjs).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSlabLabel, findGrade, findCertNumber } from "../src/utils/slabLabelText.mjs";

test("PSA label", () => {
  const label = parseSlabLabel("2023 POKEMON SVP EN-SV BLACK STAR PROMO\n#085 PIKACHU\nGEM MT 10\n84512367\nPSA");
  assert.equal(label.gradingCompany, "PSA");
  assert.equal(label.grade, "10");
  assert.equal(label.certificationNumber, "84512367");
  assert.equal(label.name, "Pikachu");
  assert.equal(label.number, "085");
  assert.equal(label.query, "Pikachu SVP085");
  assert.equal(label.certainty, "most");
});

test("CGC, Beckett and SGC labels", () => {
  const cgc = parseSlabLabel("CGC TRADING CARDS\nPokémon (2022) Lost Origin\nGiratina V - 186/196\nGEM MINT 10\nCert# 4291234001");
  assert.deepEqual([cgc.gradingCompany, cgc.grade, cgc.certificationNumber, cgc.number], ["CGC", "10", "4291234001", "186/196"]);
  const bgs = parseSlabLabel("BECKETT\n1999 Pokemon Base Set\nCharizard Holo #4\nPRISTINE 10\n0012345678");
  assert.deepEqual([bgs.gradingCompany, bgs.grade, bgs.certificationNumber], ["Beckett (BGS)", "10 Pristine", "0012345678"]);
  const sgc = parseSlabLabel("SGC\nMINT 9\n1234567\n2021 Celebrations Umbreon #4");
  assert.deepEqual([sgc.gradingCompany, sgc.grade, sgc.certificationNumber], ["SGC", "9", "1234567"]);
});

test("grades and certs on their own", () => {
  assert.equal(findGrade("MINT 9"), "9");
  assert.equal(findGrade("NM-MT 8"), "8");
  assert.equal(findGrade("GEM MT 10"), "10");
  assert.equal(findGrade("BGS 9.5 GEM MINT\nBLACK LABEL"), "10 Black Label");
  assert.equal(findGrade("hello"), "");
  assert.equal(findCertNumber("2023 Pokemon 84512367", "PSA"), "84512367", "years are not certs");
  assert.equal(findCertNumber("no numbers here", "PSA"), "");
  assert.equal(parseSlabLabel("").certainty, "none");
});

test("real label wording: grade beside the words, no grader as a name, PSA without its logo, searchable numbers (Nov 24 2026)", async () => {
  const { catalogCardQueryMatchesRow: matches } = await import("../src/utils/catalogResultIdentity.mjs");
  const bgs = parseSlabLabel("BECKETT\n2021 Pokemon Evolving Skies\nUmbreon VMAX Alt Art #215\n9.5 GEM MINT\n0012345678");
  assert.deepEqual([bgs.gradingCompany, bgs.grade, bgs.name, bgs.query], ["Beckett (BGS)", "9.5", "Umbreon VMAX", "Umbreon VMAX #215"]);
  const psa = parseSlabLabel("2023 POKEMON SV 151\n#199 CHARIZARD EX\nSPECIAL ILLUSTRATION RARE\nGEM MT 10\n84512367");
  assert.deepEqual([psa.gradingCompany, psa.grade, psa.name, psa.query], ["PSA", "10", "Charizard ex", "Charizard ex #199"]);
  assert.equal(matches(psa.query, { name: "Charizard ex", cardNumber: "199/165" }), true, "#199 matches the card's own number");
  assert.equal(matches(psa.query, { name: "Charizard ex", cardNumber: "125/197" }), false);
  const base = parseSlabLabel("1999 POKEMON GAME\n#4 CHARIZARD-HOLO\nNM-MT 8\n12345678");
  assert.deepEqual([base.gradingCompany, base.grade, base.name], ["PSA", "8", "Charizard"]);
  const cgc = parseSlabLabel("CGC\nPokemon Base Set\nCharizard - Holo\n4/102\n9.5\nMINT+\n4012345678");
  assert.deepEqual([cgc.grade, cgc.name, cgc.query], ["9.5", "Charizard", "Charizard 4/102"]);
  const promo = parseSlabLabel("2023 POKEMON SV BLACK STAR PROMO\n#085 ALAKAZAM EX\nGEM MT 10\n90123456");
  assert.equal(promo.query, "Alakazam ex SVP085");
  assert.equal(parseSlabLabel("BECKETT\nBLACK LABEL\nPRISTINE 10\nPikachu #25\n0012345679").grade, "10 Black Label");
});

test("a slab shown to the card camera: its label is read from the top of the picture (Nov 27 2026)", async () => {
  const { readFileSync } = await import("node:fs");
  const { createNameIndex } = await import("../src/utils/cardNameSnap.mjs");
  const { findSlabInCardText } = await import("../src/utils/slabLabelText.mjs");
  const nameIndex = createNameIndex(JSON.parse(readFileSync(new URL("../src/data/generated/cardNames.json", import.meta.url), "utf8")));
  const find = (...texts) => findSlabInCardText(texts.join("\n"), { nameIndex });
  // What the card reader really read from the owner's slab photos (name strip, then the wide strip).
  // PSA, no logo read: its "2025 POKEMON" line and certificate; "MINT" over a "9" on the next line.
  assert.deepEqual(find(
    "PW A——                   Bm\narr =              p—t  \\\n:\n2025 POKEMON PRE EN             #151\nPALAFIN ex                         MINT\n",
    "-~\n\nh\n\n———\n\narm\n\n2025 POKEMON PRE EN\n\n#151\n\nMINT\n\neller ex\n\n9\n\nIt\n\nAL ILLUS TRATION RARE\n\ni iii I\n\n138296840\n\nLo _\n",
  ), { gradingCompany: "PSA", grade: "9", certificationNumber: "138296840", name: "Palafin ex", number: "151" });
  // CGC: the company's name is not the card's name; the number comes from "Set - 077/071".
  assert.deepEqual(find(
    "EE ——\n    «CGC        CERTIFIED GUARANTY COMPANY\n| |      Snoriax                          GEM MINT       | |\nli]    Pokémon (2022) Japanese     a\n",
    "«CGC\n\nCERTIFIED GUARANTY COMPANY\n\nSnorlax\n\nGEM MINT\n\nPokémon (2022) Japanese\n\nDark Phantasma - 077/071\n\nCharacter Rare - Holo\n\n10\n\nOLE ULL CRT I\n\n6019768064\n\n|\n",
  ), { gradingCompany: "CGC", grade: "10", certificationNumber: "6019768064", name: "Snorlax", number: "077/071" });
  // PSA's "GEM MT" with no certificate read is still a PSA 10 label.
  assert.deepEqual(find(
    "2025 POKEMON CBB2 CS            #12 HE\nGLACEON                     GEM MT   i\nSSE Re Ee                     ol\n",
    "re ee—\n\nmre\n\npe —— eee\n\n2025 POKEMON CBB2 C\n\nN\n\nC\n\n~\n\n#12\n\nGLACEON\n\nGEM MT\n\n§\n\n10\n\n§\n\nmm\n\nBe a——\n\n12\n\n-\n\n[|\n",
  ), { gradingCompany: "PSA", grade: "10", certificationNumber: "", name: "Glaceon", number: "12" });
  // Beckett is a row company's short name; a promo keeps its series.
  assert.deepEqual(find("BECKETT\n2022 Pokemon Brilliant Stars\nCharizard VSTAR #174\n9.5 GEM MINT\n0012345678"),
    { gradingCompany: "BGS", grade: "9.5", certificationNumber: "0012345678", name: "Charizard VSTAR", number: "174" });
  assert.equal(find("2023 POKEMON SVP EN-SV BLACK STAR PROMO #051\nSNORLAX MINT\n9\n87654321").number, "SVP051");
  // A raw card's own text is never a label: its copyright line, "TAG TEAM", "ACE SPEC",
  // an old "EX" card with a number after it, and a stray 9-digit number in a foil pattern.
  assert.equal(find("©2025 Pokémon / Nintendo / Creatures / GAME FREAK\n151/131"), null);
  assert.equal(find("Pikachu & Zekrom GX\nTAG TEAM\nHP 240\n2019 Pokemon 123456789"), null);
  assert.equal(find("Prime Catcher\nACE SPEC\nItem 2023"), null);
  assert.equal(find("Charizard EX 9\nHP 180\n012345678"), null);
  assert.equal(find("STAGE 1 Palafin ex HP 340\nEvolves from Finizen"), null);
  assert.equal(find(""), null);
  // Without the card names list, the grade is still read; the name is left to the card read.
  assert.equal(findSlabInCardText("PSA\nGEM MT 10\nPIKACHU #25\n12345678").name, "");
});
