import { useEffect, useRef } from "react";
import { BRAND_CONFIG } from "../config/brand.js";
import { useModalFocus } from "./operations/useModalFocus.js";
import "./smart-setup.css";

export default function SmartSetupDialog({ step, totalSteps, onClose, children, actions }) {
  const { dialogRef, onKeyDown } = useModalFocus(true, onClose);
  const bodyRef = useRef(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (dialogRef.current) dialogRef.current.scrollTop = 0;
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      const heading = bodyRef.current?.querySelector("h3");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step, dialogRef]);

  return (
    <div className="location-modal-backdrop smart-setup-backdrop" role="presentation" onClick={onClose}>
      <section ref={dialogRef} className="smart-setup-modal" role="dialog" aria-modal="true" aria-labelledby="smart-setup-title" tabIndex={-1} onKeyDown={onKeyDown} onClick={event => event.stopPropagation()}>
        <div ref={bodyRef} className="smart-setup-body" role="region" aria-labelledby="smart-setup-step-title">
          <header className="smart-setup-header">
          <div>
            <p className="smart-setup-eyebrow">Smart Setup <span>Step {step} of {totalSteps}</span></p>
            <h2 id="smart-setup-title">Your {BRAND_CONFIG.applicationDisplayName}</h2>
          </div>
          <button type="button" className="smart-setup-close secondary-button" aria-label="Skip Smart Setup" onClick={onClose}><span aria-hidden="true">×</span></button>
          </header>
          <div className="smart-setup-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={totalSteps} aria-valuenow={step}>
            {Array.from({ length: totalSteps }, (_, index) => <span key={index} className={index < step ? "active" : ""} />)}
          </div>
          {children}
        </div>
        <footer className="smart-setup-footer">{actions}</footer>
      </section>
    </div>
  );
}
