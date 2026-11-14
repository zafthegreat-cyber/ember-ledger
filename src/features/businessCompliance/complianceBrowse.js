import { deadlineHealth } from './businessComplianceModel.js';
export function filterDeadlines(rows,filter='all',date='',now=new Date()) {
 return rows.filter(row=>(!date||row.dueDate===date)&&(filter==='all'||(filter==='due_soon'?['due_today','due_soon'].includes(deadlineHealth(row,now).key):deadlineHealth(row,now).key===filter)));
}
export function monthDays(month) {
 if(!/^\d{4}-\d{2}$/.test(month))return [];
 const [year,m]=month.split('-').map(Number);if(m<1||m>12)return [];
 return Array.from({length:new Date(year,m,0).getDate()},(_,index)=>`${month}-${String(index+1).padStart(2,'0')}`);
}
export function filterComplianceDocuments(rows,{query='',type='all',expiry='all'}={},now=new Date()) {
 const q=query.trim().toLowerCase();return rows.filter(row=>(!q||[row.title,row.type,row.location,row.notes].some(value=>String(value||'').toLowerCase().includes(q)))&&(type==='all'||row.type===type)&&(expiry==='all'||(expiry==='no_date'?!row.expirationDate:expiry==='expired'?deadlineHealth({dueDate:row.expirationDate},now).key==='overdue':['due_today','due_soon'].includes(deadlineHealth({dueDate:row.expirationDate},now).key))));
}
