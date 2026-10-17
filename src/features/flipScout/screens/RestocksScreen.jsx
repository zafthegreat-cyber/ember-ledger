import { EmptyState, PrimaryButton, SectionHeader } from "../../../components/operations/OperationsUI.jsx";

export default function RestocksScreen({ onOpenRestocks }) {
  return (
    <section className="flip-section">
      <SectionHeader title="Restocks" description="Live reports and pattern analysis use saved local records. Predictions remain probabilistic." />
      <EmptyState title="Open restock intelligence" action={<PrimaryButton onClick={onOpenRestocks}>Open Restocks</PrimaryButton>}>
        Review live reports, stores, products, and patterns in the protected owner workspace. No store is guaranteed to restock.
      </EmptyState>
    </section>
  );
}
