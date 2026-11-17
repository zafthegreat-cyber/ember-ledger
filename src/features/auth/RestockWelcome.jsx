import "./restock-welcome.css";

export default function RestockWelcome({ onCreateAccount }) {
  return <div className="auth-login-scene restock-welcome">
    <div className="auth-login-scene-copy">
      <p className="restock-welcome-region">All 50 states + DC</p>
      <h2>Track your collection. Get free restock alerts.</h2>
      <p className="restock-welcome-promise">Built for collectors, not scalpers.</p>
      <p>Keep every card and sealed product in one place, follow the stores you visit, and see what other collectors report before your next trip. Any trading card game.</p>
      <button type="button" className="ember-gradient-button restock-welcome-cta" onClick={onCreateAccount}>Create a free account</button>
      <p className="restock-welcome-note">Confirm your email, then start using Code 3. Reports are observations; availability can change.</p>
    </div>
    <ol className="restock-welcome-steps" aria-label="Start using Code 3 Restocks">
      <li><strong>1. Create your account</strong><span>Use your own private app account. Community groups are optional.</span></li>
      <li><strong>2. Add cards and follow stores</strong><span>Scan or search to build your collection. Follow stores to get restock alerts for free.</span></li>
      <li><strong>3. Report your visit</strong><span>Share what you observed. Photos are optional, and you review before saving.</span></li>
    </ol>
  </div>;
}
