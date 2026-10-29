import calendar from '../data/communityReleases.json';
import {COMMUNITY_PRODUCTS,DISCORD_COMMUNITY} from '../services/communityReports.mjs';
export default function CommunityReleaseCalendar(){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const releases=calendar.releases.filter(release=>release.date>=today).sort((a,b)=>a.date.localeCompare(b.date));
 return <section className="community-scout__calendar" aria-label="Publisher release calendar"><h3>Dates from the publishers</h3><p>Release dates are calendar markers. They do not promise an in-stock item, store shipment, or retailer sale time.</p>
  {releases.length?<div className="community-scout__list">{releases.map(release=><article className="community-scout__report" key={release.key}><span className="community-scout__product">{COMMUNITY_PRODUCTS[release.game]}</span><h4>{release.name}</h4><p><time dateTime={release.date}>{new Intl.DateTimeFormat(undefined,{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${release.date}T12:00:00Z`))}</time></p><p>{release.region}</p><a href={release.source} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Publisher source ↗<span className="sr-only"> (opens a new tab)</span></a></article>)}</div>:<p className="community-scout__notice">No upcoming dates are currently listed. Check the publisher before planning a trip.</p>}
  <p className="community-scout__calendar-note">Sources checked {calendar.checkedOn}. <a href={DISCORD_COMMUNITY.releases} target="_blank" rel="noopener noreferrer">Open the Discord release board ↗</a></p>
 </section>;
}
