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
