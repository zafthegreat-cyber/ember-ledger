import {useRef,useState} from 'react';
import GradingFields from './GradingFields.jsx';
import {TextField} from './operations/RecordExperience.jsx';
import {PrimaryButton,QuietButton} from './operations/OperationsUI.jsx';
import {gradedCopyEditValues} from '../utils/gradedCopies.mjs';
export default function GradedCopyEditor({record,onSave,onCancel}) {
 const [draft,setDraft]=useState(()=>({id:record.id,...gradedCopyEditValues(record)}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),saving=useRef(false);
 const update=patch=>{setDraft(current=>({...current,...patch}));setError('');};
 async function submit(event){
  event.preventDefault();if(saving.current)return;
  if(draft.allocatedItemCost!==''&&(!Number.isFinite(Number(draft.allocatedItemCost))||Number(draft.allocatedItemCost)<0)){setError('Recorded cost must be zero or a positive number, or left blank.');return;}
  saving.current=true;setBusy(true);setError('');
  try{const saved=await onSave(draft);if(!saved)setError('This copy was not saved. Reopen it to review the latest details and try again.');}
  catch(failure){setError(failure.message||'This copy could not be saved. Your draft is still here.');}
  finally{saving.current=false;setBusy(false);}
 }
 return <main className="graded-copy-editor"><QuietButton onClick={onCancel} disabled={busy}>Back to card</QuietButton><h1>Edit graded copy</h1><p>{record.name||record.title||record.cardName}</p><form onSubmit={submit} noValidate><GradingFields record={draft} onChange={update} disabled={busy}/><fieldset disabled={busy}><legend>Purchase details for this copy</legend><div className="graded-copy-purchase-fields"><TextField label="Purchase source" value={draft.purchaseSource} onChange={value=>update({purchaseSource:value})} maxLength={200}/><TextField label="Purchase date" type="date" value={draft.purchaseDate} onChange={value=>update({purchaseDate:value})}/><TextField label="Recorded cost" type="number" min="0" step="0.01" inputMode="decimal" value={draft.allocatedItemCost} onChange={value=>update({allocatedItemCost:value})} helper="Saved acquisition cost for this purchase record, not the card’s market estimate."/></div></fieldset><p className="graded-copies-note">This updates the original copy's grading and purchase details. Its quantity, notes and latest saved prices stay attached.</p>{error?<p role="alert">{error}</p>:null}<div className="graded-copies-actions"><PrimaryButton type="submit" disabled={busy}>{busy?'Saving…':'Save graded copy'}</PrimaryButton><QuietButton onClick={onCancel} disabled={busy}>Cancel</QuietButton></div></form></main>;
}
