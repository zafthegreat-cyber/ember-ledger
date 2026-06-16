import { EtMockupPageShell } from "../components/command-system";

export default function MarketPage({ renderHeader, children }) {
  return (
    <EtMockupPageShell
      accent="market"
      className="market-mockup-rebuild"
      ariaLabel="Market Watch fair price discovery"
    >
      <div className="et-mockup-main-column market-mockup-main">
        {renderHeader()}
        {children}
      </div>
    </EtMockupPageShell>
  );
}
