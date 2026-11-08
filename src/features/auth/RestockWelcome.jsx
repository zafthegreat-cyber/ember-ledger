import "./restock-welcome.css";

export default function RestockWelcome({ onCreateAccount }) {
  return <div className="auth-login-scene restock-welcome">
    <div className="auth-login-scene-copy">
      <p className="restock-welcome-region">All 50 states + DC</p>
      <h2>Find restocks. Share what you see.</h2>
      <p>Check community observations before your next trip. After your own store visit, help the next collector with what, where, and when.</p>
      <button type="button" className="ember-gradient-button restock-welcome-cta" onClick={onCreateAccount}>Create a free account</button>
      <p className="restock-welcome-note">Confirm your email, then start using Code 3. Reports are observations; availability can change.</p>
    </div>
    <ol className="restock-welcome-steps" aria-label="Start using Code 3 Restocks">
      <li><strong>1. Create your account</strong><span>Use your own private app account. Community groups are optional.</span></li>
      <li><strong>2. Browse your area</strong><span>Choose a state, find a store, and check report status and observation time.</span></li>
      <li><strong>3. Report your visit</strong><span>Share what you observed. Photos are optional, and you review before saving.</span></li>
    </ol>
  </div>;
}
