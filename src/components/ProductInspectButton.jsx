import { lazy, Suspense, useState } from "react";
import ItemPhoto from "./ItemPhoto.jsx";
import { getItemImageUrl } from "../utils/productDisplayUtils.js";
import { BottomSheet } from "./operations/OperationsUI.jsx";
import "./product-inspect.css";

const ProductInspectionContent = lazy(() => import("./ProductInspectionContent.jsx"));

export default function ProductInspectButton({ product, src = "", title = "Item", fallbackClassName = "", records }) {
  const [open, setOpen] = useState(false);
  const image = src || getItemImageUrl(product);
  if (!image) return <ItemPhoto product={product} src={image} alt={title} fallbackClassName={fallbackClassName} />;
  return <>
    <button type="button" className="product-inspect-launch" aria-label={`Inspect ${title} in 3D`} onClick={() => setOpen(true)}><ItemPhoto product={product} quality="detail" src={image} alt={title} loading="eager" fallbackClassName={fallbackClassName} /><span><span aria-hidden="true">↔</span>Inspect item</span></button>
    <BottomSheet className="product-inspect-sheet" open={open} title={title} onClose={() => setOpen(false)}>{open ? <Suspense fallback={<p className="product-inspect__loading" role="status">Loading interactive preview…</p>}><ProductInspectionContent product={product} records={records} src={image} title={title} /></Suspense> : null}</BottomSheet>
  </>;
}
