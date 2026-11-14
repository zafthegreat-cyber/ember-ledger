import { useId } from 'react';
import { TextField } from './operations/RecordExperience.jsx';
import { gradingDetails, gradingFieldPatch } from '../utils/gradedCopies.mjs';
import './graded-copies.css';
export default function GradingFields({record={},onChange,disabled=false}) {
 const id=useId(),details=gradingDetails(record);
 return <fieldset className="grading-fields" disabled={disabled}><legend>Professional grading</legend><p>Record the label on this copy's slab. Leave blank for an ungraded card.</p><div>
 <TextField label="Grading company" value={details.gradingCompany} maxLength={60} list={id} onChange={value=>onChange?.(gradingFieldPatch(record,'gradingCompany',value))} placeholder="PSA, CGC, BGS…" autoComplete="off"/>
 <datalist id={id}>{['PSA','CGC','BGS','SGC','TAG','ACE'].map(company=><option key={company} value={company}/>)}</datalist>
 <TextField label="Grade" value={details.grade} maxLength={60} onChange={value=>onChange?.(gradingFieldPatch(record,'grade',value))} placeholder="10, 9.5, Authentic…" autoComplete="off"/>
 <TextField label="Certification number" value={details.certificationNumber} maxLength={120} onChange={value=>onChange?.(gradingFieldPatch(record,'certificationNumber',value))} helper="Keep leading zeroes. Use a separate purchase record for each different certificate." autoComplete="off" spellCheck={false}/>
 </div></fieldset>;
}
