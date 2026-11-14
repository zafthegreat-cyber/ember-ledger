import { QuietButton } from './operations/OperationsUI.jsx';
const money=value=>value==null||value===''?'Not recorded':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value)||0);
export default function SaleSavedReceipt({sale,item,remaining,onOpen,onDismiss}) {
 if(!sale)return null;
 return <section className="sale-saved-receipt" role="status"><strong>Sale saved</strong><p>{item?.name||item?.title||sale.itemName||'Inventory sale'} · Qty {sale.quantitySold} · {money(sale.grossSalePrice)} USD · {sale.status}</p><p>Remaining stock: {Number.isFinite(remaining)?remaining:'Quantity needs review'}</p><QuietButton onClick={()=>onOpen(sale)}>View saved sale</QuietButton><QuietButton onClick={onDismiss}>Dismiss confirmation</QuietButton></section>;
}
