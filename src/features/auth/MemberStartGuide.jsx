import { useId, useState } from "react";
import { MEMBER_DESTINATIONS, MEMBER_PATHS, readMemberIntro, saveMemberIntro } from "./memberStart.mjs";
import "./member-start.css";

export default function MemberStartGuide(props) {
  // Remount on account changes; preferences can never carry into another member.
  return <AccountStartGuide key={props.userId || "preview"} {...props} />;
}
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
function AccountStartGuide({ userId, onCollect, onSell, hasCollectionItems = false, storage = safeStorage() }) {
  const [choice, setChoice] = useState(() => readMemberIntro(storage, userId));
  const [reviewRequested, setReviewRequested] = useState(false);
  const [saveWarning, setSaveWarning] = useState("");
  const id = useId();
  function update(patch) {
    const next = { ...choice, ...patch }; setChoice(next);
    if (!saveMemberIntro(storage, userId, next)) setSaveWarning("This choice is temporary here. It could not be saved for this account on this device.");
    else setSaveWarning("");
  }
  if (choice.hidden || hasCollectionItems && !reviewRequested) return <section className="member-start member-start--closed" aria-label="First collecting task"><p>{hasCollectionItems ? "Your collection is started. Revisit the introduction any time." : "Ready when you are."}</p><button type="button" className="secondary-button" onClick={() => { setReviewRequested(true); update({ hidden: false }); }}>Reopen getting started</button></section>;
  const selected = MEMBER_PATHS[choice.path];
  return <section className="member-start" aria-labelledby={`${id}-title`}>
    <div className="member-start-heading"><h2 id={`${id}-title`}>Start with one collecting task</h2><button type="button" className="secondary-button" onClick={() => update({ hidden: true })}>Skip for now</button></div>
    <p>Your account is ready to use. Choose an introduction; interests, area preferences, feedback, and community groups are optional.</p>
    <label htmlFor={`${id}-path`}>What brings you here?</label>
    <select id={`${id}-path`} value={choice.path} onChange={event => update({ path: event.target.value })}>{Object.entries(MEMBER_PATHS).map(([key, path]) => <option key={key} value={key}>{path.label}</option>)}</select>
    <article className="member-start-task"><p className="member-start-meta">{choice.path === "collector" ? "About a minute · optional first task" : "Optional introduction"}</p><h3>{selected.title}</h3><p>{selected.body}</p>
      {choice.path === "shop" ? <a className="member-start-action" href="/support?topic=shop">{selected.action}</a> : <button type="button" className="member-start-action" onClick={choice.path === "collector" ? onCollect : onSell}>{selected.action}</button>}
      <p className="member-start-meta">{selected.destination}</p>
    </article>
    <details><summary>Find your way around</summary><dl className="member-destinations">{MEMBER_DESTINATIONS.map(([name, purpose]) => <div key={name}><dt>{name}</dt><dd>{purpose}</dd></div>)}</dl>
      <p>Area preferences in Scout personalize nearby content. They do not decide whether you can join the app. Online reports are a separate choice from local areas. Your device location is optional.</p>
    </details>
    <p className="member-start-meta">Introduction choices stay with this account on this device. They do not change membership, workspace permissions, or Discord roles.</p>
    {saveWarning && <p role="status">{saveWarning}</p>}
  </section>;
}
