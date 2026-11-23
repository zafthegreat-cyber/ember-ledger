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
  assert.equal(label.query, "Pikachu 085");
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
