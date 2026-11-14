import { useEffect, useState } from "react";
import CardVersionPicker from "./CardVersionPicker.jsx";
import ProductInspectViewer from "./ProductInspectViewer.jsx";
import { loadSetCatalog } from "../services/setCatalogLoader.mjs";
import { collectionSetNameKey } from "../utils/collectionSets.mjs";
import { getRecordGame } from "../utils/collectibleGames.mjs";
import { setCatalogKind } from "../utils/setCatalog.mjs";
import { cardVersionOf } from "../utils/cardVersions.mjs";

export default function ProductInspectionContent({ product, src, title, records, loadCatalog = loadSetCatalog }) {
  const canLoad = setCatalogKind(product) === "card" && !product.versions?.length && Boolean(product.setName || product.set_name);
  const [catalog, setCatalog] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!canLoad) return;
    const controller = new AbortController();
    const game = getRecordGame(product), name = product.setName || product.set_name;
    loadCatalog(`${game}:${collectionSetNameKey(name,game)}`, {signal:controller.signal}).then(result => {
      if (controller.signal.aborted) return;
      const exact = result.products.find(row => product.tcgplayerProductId ? String(row.tcgplayerProductId) === String(product.tcgplayerProductId) : product.catalogProductId && row.id === product.catalogProductId);
      setCatalog({product,versions:exact?.versions || [],status:"ready",attempt});
    }).catch(() => { if(!controller.signal.aborted)setCatalog({product,versions:[],status:"error",attempt}); });
    return () => controller.abort();
  }, [product, canLoad, loadCatalog, attempt]);
  const current = catalog?.product === product && catalog?.attempt === attempt ? catalog : null;
  const display = {...product,versions:product.versions?.length ? product.versions : current?.versions || []};
  return <>
    {canLoad && !current ? <p className="product-inspect__loading" role="status">Loading card versions… You can inspect the saved image now.</p> : null}
    {canLoad && current?.status === "error" ? <div className="product-inspect__version-error" role="status"><p>Card versions could not be loaded. Your saved image and details are available.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Retry versions</button></div> : null}
    {canLoad && current?.status === "ready" && !current.versions.length ? <p className="product-inspect__loading">No catalog versions are recorded for this item.</p> : null}
    <CardVersionPicker product={display} records={records || [product]} quantityLabel="In these records">{selected => {
      const version = display.versions.find(option => option.key === cardVersionOf(selected));
      const versionImage = version?.frontImageUrl || version?.imageUrl || version?.largeImageUrl || version?.images?.large;
      return <ProductInspectViewer product={selected} src={versionImage || src} title={title}/>;
    }}</CardVersionPicker>
  </>;
}
