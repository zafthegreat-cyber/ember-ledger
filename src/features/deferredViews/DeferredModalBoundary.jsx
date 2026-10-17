import { Suspense, useLayoutEffect, useRef } from "react";

import { focusFlowModalContent } from "./flowModalFocus.js";

function ResolvedModalContent({ children, modalRef, type, transferFocusRef }) {
  useLayoutEffect(() => {
    if (!transferFocusRef.current) return;
    transferFocusRef.current = false;
    focusFlowModalContent(modalRef.current, type);
  }, [modalRef, transferFocusRef, type]);
  return children;
}

export default function DeferredModalBoundary({ children, label, modalRef, type }) {
  const transferFocusRef = useRef(false);
  return (
    <Suspense fallback={(
      <div className="route-loading-card" role="status" aria-live="polite" tabIndex={-1}
        data-deferred-modal-loading="true"
        onFocus={() => { transferFocusRef.current = true; }}
        onBlur={() => { transferFocusRef.current = false; }}>
        {label}
      </div>
    )}>
      <ResolvedModalContent modalRef={modalRef} type={type} transferFocusRef={transferFocusRef}>
        {children}
      </ResolvedModalContent>
    </Suspense>
  );
}
