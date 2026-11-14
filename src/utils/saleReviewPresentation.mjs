import { nonNegative } from '../features/flipScout/calculations.js';
const normalized=value=>String(value||'').trim().toLocaleLowerCase();
export function possibleDuplicateSales(sales, draft) {
  if(!draft.inventoryItemId||!draft.saleDate||!normalized(draft.salesChannel)||draft.grossSalePrice===''||draft.grossSalePrice==null||!Number.isFinite(Number(draft.grossSalePrice)))return [];
  return sales.filter(row=>row.grossSalePrice!==''&&row.grossSalePrice!=null&&row.id!==draft.id&&row.inventoryItemId===draft.inventoryItemId&&String(row.saleDate).slice(0,10)===String(draft.saleDate).slice(0,10)&&normalized(row.salesChannel)===normalized(draft.salesChannel)&&Number(row.quantitySold)===Number(draft.quantitySold)&&Number(row.grossSalePrice)===Number(draft.grossSalePrice));
}
export function saleStockPreview(available,draft) {
  const consumes=!['draft','cancelled'].includes(normalized(draft.status));
  const quantity=Number(draft.quantitySold);
  return {available:Number.isFinite(available)?available:null,consumes,after:Number.isFinite(available)&&Number.isFinite(quantity)?available-(consumes?quantity:0):null};
}
export function saleCalculationRows(form,cogs) {
  return [['Sale total','grossSalePrice',1],['Buyer-paid shipping','shippingChargedToBuyer',1],['Discounts','discounts',-1],['Selling fees','sellingFees',-1],['Payment fees','paymentFees',-1],['Outbound shipping','actualOutboundShipping',-1],['Packaging','packaging',-1],['Refunds','refunds',-1],['Other costs','otherCosts',-1]].map(([label,key,sign])=>({label,amount:sign*nonNegative(form[key]),unrecorded:form[key]===''||form[key]==null})).concat({label:'Cost of goods sold',amount:-nonNegative(cogs),unrecorded:cogs===''||cogs==null});
}
