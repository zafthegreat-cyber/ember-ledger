import { useState } from "react";
import { SecondaryButton, StatusBadge } from "../../../components/operations/OperationsUI.jsx";

// An isolated display example: never read from or written to owner records.
export default function OrderExample() {
  const [visible, setVisible] = useState(false);
  return <section className="account-ops-order-example" aria-label="Sample order preview">
    <div><h3>See how order tracking works</h3><p>Explore a sample shipment before adding your own records.</p></div>
    <SecondaryButton onClick={() => setVisible(!visible)} aria-expanded={visible} aria-controls="account-ops-sample-order">{visible ? "Hide sample order" : "Show sample order"}</SecondaryButton>
    {visible ? <article id="account-ops-sample-order" className="account-ops-sample-order">
      <header><div><span className="account-ops-section-kicker">SAMPLE DATA · NOT SAVED</span><h3>Weekend collection order</h3><p>Example retailer · Personal collection</p></div><StatusBadge tone="neutral">In transit</StatusBadge></header>
      <ol className="account-ops-order-timeline" aria-label="Sample order progress">
        <li className="is-complete"><strong>Order recorded</strong><span>2 sealed boxes · $84.00</span></li>
        <li className="is-complete"><strong>Shipment sent</strong><span>One package on the way</span></li>
        <li><strong>Confirm receipt</strong><span>Review condition and quantities when it arrives</span></li>
        <li><strong>Review inventory</strong><span>Add received items through Purchase & Receiving</span></li>
      </ol>
      <p className="account-ops-operations-quiet">This example does not create an order, purchase, or inventory item.</p>
    </article> : null}
  </section>;
}
