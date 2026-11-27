import { useId } from 'react';
import { useModalFocus } from './operations/useModalFocus.js';
/** Opening the dialog never invokes the mutation; Cancel receives initial focus. */
export default function ConfirmRecordAction({open,title='Remove record?',message,confirmLabel='Remove record',tone='danger',onConfirm,onCancel,busy=false}) {
 const id=useId(); const {dialogRef,onKeyDown}=useModalFocus(open,busy?undefined:onCancel);
 if(!open)return null;
 return <div className="ops-overlay"><section ref={dialogRef} className="ops-dialog" role="alertdialog" aria-modal="true" aria-labelledby={id} aria-describedby={id+'-message'} tabIndex={-1} onKeyDown={onKeyDown}><h2 id={id}>{title}</h2><p id={id+'-message'}>{message}</p><footer><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={`ops-button ops-button--${tone === "primary" ? "primary" : "danger"}`} disabled={busy} aria-busy={busy} onClick={onConfirm}>{busy?'Working…':confirmLabel}</button></footer></section></div>;
}
