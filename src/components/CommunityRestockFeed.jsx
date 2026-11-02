import {useEffect,useId,useMemo,useState} from 'react';
import {AppNavIcon} from './command-system/AppNavIcon.jsx';
import CommunityReleaseCalendar from './CommunityReleaseCalendar.jsx';
import {COMMUNITY_PRODUCTS,COMMUNITY_STATUS,DISCORD_COMMUNITY,filterCommunityReports,loadCommunityReports} from '../services/communityReports.mjs';
import './community-restock-feed.css';

const timeLabel = value => new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value));
function OutsideLink({href,children,className=''}) {return <a className={className} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{children}<span className="sr-only"> (opens Discord in a new tab)</span></a>;}

export default function CommunityRestockFeed({compact=false,onOpenMap}) {
  const id=useId();
  const [view,setView]=useState(()=>new URLSearchParams(globalThis.location?.search||'').get('community')==='calendar'?'calendar':'reports');
  const [reload,setReload]=useState(0),[data,setData]=useState(null),[state,setState]=useState('loading');
  const [search,setSearch]=useState(''),[category,setCategory]=useState('all'),[status,setStatus]=useState('all');
  const [expanded,setExpanded]=useState(!compact);
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{const interval=window.setInterval(()=>setNow(Date.now()),60000);return ()=>window.clearInterval(interval);},[]);
  useEffect(()=>{
    const controller=new AbortController();
    loadCommunityReports({signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setData(result);setState('ready');}}).catch(()=>{if(!controller.signal.aborted){setData(null);setState('error');}});
    return ()=>controller.abort();
  },[reload]);
  const reports=useMemo(()=>filterCommunityReports(data?.reports||[],{search,category,status,now}),[data,search,category,status,now]);
  const visible=expanded?reports:reports.slice(0,3);
  function refresh(){setData(null);setState('loading');setReload(value=>value+1);}
  return <section className="community-scout" aria-labelledby={`${id}-title`}>
    <div className="community-scout__masthead">
      <div><span className="community-scout__eyebrow">Code 3 TCG · together</span><h2 id={`${id}-title`}>A good find is worth sharing.</h2><p>Reviewed community observations, from Discord to Scout. Check the observed time before making a trip.</p></div>
      <div className="community-scout__seal" aria-hidden="true"><AppNavIcon kind="scout"/><span>Community<br/>first</span></div>
    </div>
    <nav className="community-scout__actions" aria-label="Community shortcuts">
      <OutsideLink className="community-scout__primary" href={DISCORD_COMMUNITY.reports}><AppNavIcon kind="plus"/>Report in Discord</OutsideLink>
      <button type="button" onClick={onOpenMap}><AppNavIcon kind="map"/>Scout map</button>
      <button type="button" onClick={()=>setView('calendar')}><AppNavIcon kind="calendar"/>Release calendar</button>
      <OutsideLink href={DISCORD_COMMUNITY.roles}><AppNavIcon kind="bell"/>Choose alerts</OutsideLink>
    </nav>
    <div className="community-scout__tabs" role="group" aria-label="Community view"><button type="button" aria-pressed={view==='reports'} onClick={()=>setView('reports')}>Recent reports</button><button type="button" aria-pressed={view==='calendar'} onClick={()=>setView('calendar')}>Release dates</button></div>
    {view==='calendar'?<CommunityReleaseCalendar/>:<>
    <div className="community-scout__heading"><div><h3>Reviewed community reports</h3><p>Past 24 hours · stock can change · staff review is not a retailer guarantee</p></div><button className="community-scout__refresh" type="button" disabled={state==='loading'} onClick={refresh}>Refresh</button></div>
    <div className="community-scout__filters" role="search" aria-label="Filter reviewed community reports">
      <label htmlFor={`${id}-search`}><span>Find a report</span><input id={`${id}-search`} value={search} onChange={event=>setSearch(event.target.value)} type="search" placeholder="Product, store, or area"/></label>
      <label htmlFor={`${id}-product`}><span id={`${id}-product-label`}>Collecting</span><select id={`${id}-product`} aria-labelledby={`${id}-product-label`} value={category} onChange={event=>setCategory(event.target.value)}><option value="all">All products</option>{Object.entries(COMMUNITY_PRODUCTS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label htmlFor={`${id}-status`}><span id={`${id}-status-label`}>Observed status</span><select id={`${id}-status`} aria-labelledby={`${id}-status-label`} value={status} onChange={event=>setStatus(event.target.value)}><option value="all">All observations</option>{Object.entries(COMMUNITY_STATUS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    {state==='loading'?<p className="community-scout__notice" role="status">Loading reviewed reports…</p>:null}
    {state==='error'?<div className="community-scout__notice" role="alert"><strong>Community reports could not load.</strong><p>Try Refresh, or check the reviewed reports in Discord. Your saved app reports are still available below.</p><OutsideLink href={DISCORD_COMMUNITY.reports}>Open community reporting</OutsideLink></div>:null}
    {state==='ready'&&reports.length===0?<div className="community-scout__notice" role="status"><strong>{data.reports.length?'No reports match these filters.':'No recent reviewed reports yet.'}</strong><p>{data.reports.length?'Try a different product, status, or search.':'New observations appear here after staff approve them in Discord. This is not a live inventory check.'}</p></div>:null}
    {state==='ready'&&visible.length?<div className="community-scout__list">{visible.map(report=><article key={report.id} className="community-scout__report">
      <div className="community-scout__report-top"><span className={`community-scout__stock community-scout__stock--${report.status}`}>{COMMUNITY_STATUS[report.status]}</span><span>{report.kind==='online'?'Online':report.areaKey?.replaceAll('-',' ')||'Local observation'}</span></div>
      <span className="community-scout__product">{COMMUNITY_PRODUCTS[report.category]}</span><h4>{report.product}</h4><p className="community-scout__store">{report.store}</p>
      <div className="community-scout__report-footer"><span>Observed <time dateTime={report.observedAt}>{timeLabel(report.observedAt)}</time></span><OutsideLink href={report.discordUrl}>View in Discord ↗</OutsideLink></div>
    </article>)}</div>:null}
    {!expanded&&reports.length>3?<button className="community-scout__more" type="button" onClick={()=>setExpanded(true)}>Show all {reports.length} reports</button>:null}
    </>}
    <footer className="community-scout__footer"><span>Only approved public report details are shared. New reports start with staff review.</span>{state==='ready'?<span>Checked {timeLabel(data.generatedAt)}</span>:null}</footer>
  </section>;
}
