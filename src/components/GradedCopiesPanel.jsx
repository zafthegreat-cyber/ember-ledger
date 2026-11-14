import { useId } from 'react';
import { QuietButton } from './operations/OperationsUI.jsx';
import { DetailList } from './operations/RecordExperience.jsx';
import { gradedCopiesFor, gradingDetails, gradedCopyEditValues } from '../utils/gradedCopies.mjs';
import { setCatalogKind } from '../utils/setCatalog.mjs';
import { collectionCopyQuantity } from '../utils/collectionCopyGroups.mjs';
import { cardVersionLabel } from '../utils/cardVersions.mjs';
import { presentAmount } from '../utils/recordPresentation.mjs';
import './graded-copies.css';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const costOf=row=>row.allocatedItemCost??row.allocatedCost??row.totalPurchaseCost??row.purchasePrice??row.actualPurchasePrice;
export default function GradedCopiesPanel({product,records=[],catalogProduct=false,onOpenRecord,onEditRecord,canEditRecord=()=>true,onAddCopy,hiddenValues=false,getAcquisitionCost=costOf}) {
 const id=useId();
 if(setCatalogKind(product)!=='card')return null;
 const copies=gradedCopiesFor(product,records,{catalogProduct});
 return <section className="graded-copies-panel" aria-labelledby={id}><header><div><h2 id={id}>Graded copies</h2><p>{copies.length ? `${copies.length} saved ${copies.length===1?'record':'records'} for this card and printing.`:'No graded copies recorded for this card and printing.'}</p></div>{onAddCopy?<QuietButton onClick={onAddCopy}>Add graded copy</QuietButton>:null}</header>
 {copies.length?<ol>{copies.map((record,index)=>{const details=gradingDetails(record),cost=presentAmount(getAcquisitionCost(record));return <li key={`${record._recordOrigin||''}:${record.id||index}`}><article aria-label={`Graded copy ${index+1}`}><div className="graded-copies-title"><h3>{[details.gradingCompany||'Company not recorded',details.grade||'Grade not recorded'].join(' · ')}</h3><span>Qty {collectionCopyQuantity(record)??'not recorded'}</span></div><DetailList items={[
 {label:'Certification number',value:details.certificationNumber||'Not recorded'},
 {label:'Printing',value:cardVersionLabel(record.variant||record.finish||record.printing)||'Not recorded'},
 {label:'Purchase date',value:gradedCopyEditValues(record).purchaseDate||'Not recorded'},
 {label:'Purchase source',value:gradedCopyEditValues(record).purchaseSource||'Not recorded'},
 {label:'Recorded cost',value:hiddenValues?'Cost hidden':cost===null?'Not recorded':money.format(cost),numeric:true},
 ]}/>{collectionCopyQuantity(record)>1?<p className="graded-copies-note">This purchase record contains multiple units. A certificate here applies to the whole record; use separate records for different certificates.</p>:null}<div className="graded-copies-actions">{onOpenRecord?<QuietButton onClick={event=>onOpenRecord(record,event.currentTarget)} aria-label={`Open graded copy ${index+1}`}>Open copy</QuietButton>:null}{onEditRecord&&canEditRecord(record)?<><QuietButton onClick={()=>onEditRecord(record,'grading')} aria-label={`Edit grading for copy ${index+1}`}>Edit grading</QuietButton><QuietButton onClick={()=>onEditRecord(record,'purchase')} aria-label={`Edit purchase for graded copy ${index+1}`}>Edit purchase</QuietButton></>:null}</div></article></li>})}</ol>:<p className="graded-copies-note">Track company, grade, certificate and purchase details separately for every slab.</p>}
 {copies.some(record=>record.marketPrice!=null&&!record.gradedMarketValue&&!record.marketValueGraded)?<p className="graded-copies-note">A saved raw-card price is a reference only; it is not a graded valuation.</p>:null}
 </section>;
}
