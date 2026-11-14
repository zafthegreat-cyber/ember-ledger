import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectionGeometry, productInspectionProfile, resolveInspectionArtwork, validInspectionQuad } from '../src/utils/productInspection.mjs';

const registry = JSON.parse(fs.readFileSync(process.env.CODE3_PHOTO_AUDIT_CANDIDATE || 'src/data/productInspectionFaces.json'));
const catalog = [...JSON.parse(fs.readFileSync('src/data/generated/sealedProducts.json')), ...JSON.parse(fs.readFileSync('src/data/generated/pokemonTcgCards.json'))];
const completedModels = Object.entries(registry)
  .filter(([, model]) => Object.keys(model.faces || {}).length === 6 && model.dimensions)
  .map(([key, model]) => ({ key, model, record: catalog.find(row => key.startsWith('tcgplayer:')
    ? row.tcgplayerProductId === key.slice('tcgplayer:'.length) : row.id === key.slice('catalog:'.length)) }));

test('completed models resolve only to their exact catalog record without changing stored prices or ownership data', () => {
  for (const { key: id, record: source } of completedModels) {
    assert.ok(source, id);
    const record = Object.freeze({ ...source, quantity: 3, unitCost: 0, purchaseDate: '2026-01-15', notes: 'Owner notes', marketPrice: source.marketPrice });
    const before = JSON.stringify(record);
    const artwork = resolveInspectionArtwork(record, registry);
    assert.ok(artwork, id);
    assert.equal(artwork.name, source.name, id);
    assert.equal(resolveInspectionArtwork({ ...record, edition: artwork.identity.edition, packageUnit: artwork.identity.packageUnit }, registry), artwork);
    assert.equal(inspectionGeometry(productInspectionProfile(record, artwork)), 'box', id);
    assert.equal(JSON.stringify(record), before, id);
  }
});

test('PC edition, retail, case and language edits cannot keep an old provider ID to borrow the wrong six faces', () => {
  for (const { key: id, record, model } of completedModels) {
    const expected = model.identity;
    for (const patch of [
      { edition: expected.edition === 'Pokemon Center' ? 'Standard' : 'Pokemon Center' },
      { packageUnit: 'case' }, { productType: 'Elite Trainer Box Case' },
      { language: 'Japanese' }, { game: 'Magic: The Gathering' },
      { name: 'Code Card ' + record.name }, { name: record.name + ' Case' },
    ]) assert.equal(resolveInspectionArtwork({ ...record, ...patch }, registry), null, `${id} ${JSON.stringify(patch)}`);
    const valid = { ...(id.startsWith('tcgplayer:') ? { tcgplayerProductId: id.slice('tcgplayer:'.length) } : { catalogProductId: id.slice('catalog:'.length) }), language: 'en', game: 'Pokémon TCG' };
    assert.equal(resolveInspectionArtwork(valid, registry), model, 'Missing owner metadata does not erase an exact known model');
  }
});

test('PC GTIN-13 and UPC-A aliases identify one box while another PC or retail barcode is rejected', () => {
  const ids = ['648415', '654135', '593324', '624675'];
  for (const [index, id] of ids.entries()) {
    const record = catalog.find(row => row.tcgplayerProductId === id), expected = registry[`tcgplayer:${id}`];
    const other = registry[`tcgplayer:${ids[(index + 1) % ids.length]}`];
    assert.equal(resolveInspectionArtwork({ ...record, upc: expected.identity.upc.replace(/^0/, '') }, registry), expected);
    assert.equal(resolveInspectionArtwork({ ...record, upc: other.identity.upc }, registry), null);
    assert.equal(resolveInspectionArtwork({ ...record, modelNumber: other.identity.model }, registry), null);
    assert.equal(expected.dimensionEvidence.basis, 'photo-proportion-estimate');
    assert.equal(expected.dimensionEvidence.unit, 'relative');
  }
});

test('every new six-face model degrades honestly when a face or physical proportion is removed', () => {
  for (const { key: id, record, model: artwork } of completedModels) {
    const profile = productInspectionProfile(record, artwork);
    assert.equal(Object.keys(artwork.faces).length, 6, id);
    for (const face of Object.keys(artwork.faces)) {
      assert.ok(validInspectionQuad(artwork.faces[face].quad), `${id}:${face}`);
      const partial = { ...profile.faces }; delete partial[face];
      assert.equal(inspectionGeometry({ ...profile, faces: partial }), 'photo', `${id}:${face}`);
    }
    assert.equal(inspectionGeometry({ ...profile, dimensions: undefined }), 'photo');
    assert.equal(inspectionGeometry({ ...profile, dimensions: { ...profile.dimensions, depth: 0 } }), 'photo');
    assert.equal(inspectionGeometry({ ...profile, faces: { ...profile.faces, right: profile.faces.left } }), 'photo', 'Opposite side cannot be mirrored/reused as a sixth genuine photo');
  }
});

test('manual catalog models require an exact registered internal ID and never override a provider identity', () => {
  const id = 'sealed-prismatic-evolutions-surprise-box-pre';
  const record = catalog.find(row => row.id === id);
  assert.ok(record);
  assert.equal(Boolean(record.tcgplayerProductId), false);
  const manual = { ...registry['tcgplayer:593324'], name: record.name, identity: { language: 'English', game: 'Pokemon', edition: 'Standard', packageUnit: 'single' } };
  const other = { ...manual, name: 'Other manual model' };
  const fixture = { ...registry, [`catalog:${id}`]: manual, 'catalog:other-model': other };
  const owned = Object.freeze({ ...record, id: 'owner-record-42', catalogProductId: id, quantity: 2, unitCost: 38, purchaseDate: '2026-02-08', notes: 'Private receipt remains attached', marketPrice: 97.12 });
  const before = JSON.stringify(owned);
  assert.equal(resolveInspectionArtwork(record, fixture), manual);
  assert.equal(resolveInspectionArtwork(owned, fixture), manual);
  assert.equal(JSON.stringify(owned), before);
  assert.equal(resolveInspectionArtwork({ name: record.name }, fixture), null, 'No name matching');
  assert.equal(resolveInspectionArtwork({ id: id + '-copy', name: record.name }, fixture), null, 'No ID prefixes');
  assert.equal(resolveInspectionArtwork({ id, catalogProductId: 'other-model' }, fixture), null, 'Two exact contradictory catalog links');
  for (const tcgplayerProductId of ['593324', '999999999', 'invalid-id', 0]) assert.equal(resolveInspectionArtwork({ ...owned, tcgplayerProductId }, fixture), null, 'Present provider identity cannot fall through to manual');
  for (const patch of [{ name: record.name + ' Case' }, { language: 'Japanese' }, { game: 'Magic' }, { edition: 'Pokemon Center' }, { packageUnit: 'case' }]) assert.equal(resolveInspectionArtwork({ ...owned, ...patch }, fixture), null);
});

test('the new PC registry entries do not populate retail, code-card or case records sharing their set name', () => {
  const pairs = [['593324', '593355'], ['624675', '624676'], ['648415', '643603']];
  for (const [pcId, retailId] of pairs) {
    const pc = registry[`tcgplayer:${pcId}`];
    const retail = catalog.find(row => row.tcgplayerProductId === retailId);
    if (retail) assert.equal(resolveInspectionArtwork({ ...retail, tcgplayerProductId: pcId }, registry), null);
    for (const suffix of [' Case', ' Code Card', ' 2-Pack Bundle']) {
      assert.equal(resolveInspectionArtwork({ tcgplayerProductId: pcId, name: pc.name + suffix }, registry), null);
    }
  }
});
