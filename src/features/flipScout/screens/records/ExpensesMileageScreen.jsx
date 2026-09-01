import { useRef, useState } from "react";
import { EXPENSE_CATEGORIES } from "../../constants.js";
import { formatCurrency } from "../../selectors.js";
import {
  EmptyState,
  FormActions,
  MoneyInput,
  NumberInput,
  RecordActions,
  SectionHeading,
  SelectInput,
  TextArea,
  TextInput,
} from "../../components/Fields.jsx";

function blankExpense() {
  return {
    date: new Date().toISOString().slice(0, 10),
    category: "Other",
    merchant: "",
    description: "",
    amount: "",
    paymentMethod: "",
    businessPercentage: 100,
    relatedRecordType: "",
    relatedRecordId: "",
    receiptReference: "",
    notes: "",
  };
}

function blankMileage() {
  return {
    date: new Date().toISOString().slice(0, 10),
    startLocation: "",
    destination: "",
    purpose: "",
    miles: "",
    relatedRecordType: "",
    relatedRecordId: "",
    notes: "",
  };
}

export default function ExpensesMileageScreen({ view, state, onSave, onDelete }) {
  const [expenseForm, setExpenseForm] = useState(blankExpense);
  const [mileageForm, setMileageForm] = useState(blankMileage);
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const saveInFlightRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const setExpense = (key) => (value) => setExpenseForm((current) => ({ ...current, [key]: value }));
  const setMileage = (key) => (value) => setMileageForm((current) => ({ ...current, [key]: value }));
  const relationOptions = (type) => {
    const map = { purchase: state.purchases, auction: state.auctions, sale: state.sales, inventory: state.inventory };
    return (map[type] || []).map((record) => ({ value: record.id, label: record.title || record.name || record.id }));
  };

  const saveExpense = async (event) => {
    event.preventDefault();
    if (!expenseForm.description.trim() && !expenseForm.merchant.trim()) return setMessage("Add a merchant or description.");
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const saved = await onSave("expenses", expenseForm, { title: expenseForm.id ? "Expense updated" : "Expense recorded", detail: expenseForm.description || expenseForm.merchant });
      if (!saved) return setMessage("The expense was not saved. Your entries remain available to review and try again.");
      setExpenseForm(blankExpense());
      setFormOpen(false);
      setMessage("Expense saved as a business record estimate.");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  const saveMileage = async (event) => {
    event.preventDefault();
    if (!mileageForm.purpose.trim()) return setMessage("Add the trip purpose.");
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      const saved = await onSave("mileage", mileageForm, { title: mileageForm.id ? "Mileage updated" : "Mileage recorded", detail: `${mileageForm.purpose} - ${mileageForm.miles || 0} mi` });
      if (!saved) return setMessage("The mileage record was not saved. Your entries remain available to review and try again.");
      setMileageForm(blankMileage());
      setFormOpen(false);
      setMessage("Mileage record saved. No tax-deduction claim is made.");
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  if (view === "expenses") {
    return (
      <div className="flip-record-workspace">
        <section className="flip-section">
          <SectionHeading
            eyebrow="Bookkeeping estimate"
            title="Business expenses"
            detail="Track records for review. This application does not label entries as definitive tax deductions."
            actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setExpenseForm(blankExpense()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Add Expense"}</button>}
          />
          {formOpen ? (
            <form className="flip-form" onSubmit={saveExpense}>
              <div className="flip-form-grid">
                <TextInput label="Date" type="date" value={expenseForm.date} onChange={setExpense("date")} />
                <SelectInput label="Category" value={expenseForm.category} onChange={setExpense("category")} options={EXPENSE_CATEGORIES} />
                <TextInput label="Merchant" value={expenseForm.merchant} onChange={setExpense("merchant")} />
                <TextInput label="Description" value={expenseForm.description} onChange={setExpense("description")} />
                <MoneyInput label="Amount" value={expenseForm.amount} onChange={setExpense("amount")} />
                <TextInput label="Payment method" value={expenseForm.paymentMethod} onChange={setExpense("paymentMethod")} />
                <NumberInput label="Business percentage" helper="Bookkeeping estimate only." value={expenseForm.businessPercentage} onChange={setExpense("businessPercentage")} min="0" max="100" step="0.1" />
                <SelectInput label="Related record type" value={expenseForm.relatedRecordType} onChange={(value) => setExpenseForm((current) => ({ ...current, relatedRecordType: value, relatedRecordId: "" }))} options={[{ value: "", label: "No related record" }, "purchase", "auction", "sale", "inventory"]} />
                <SelectInput label="Related record" value={expenseForm.relatedRecordId} onChange={setExpense("relatedRecordId")} options={[{ value: "", label: "No record selected" }, ...relationOptions(expenseForm.relatedRecordType)]} />
                <TextInput label="Receipt reference" value={expenseForm.receiptReference} onChange={setExpense("receiptReference")} />
                <TextArea label="Notes" value={expenseForm.notes} onChange={setExpense("notes")} />
              </div>
              <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : expenseForm.id ? "Update expense" : "Save expense"}</button></FormActions>
            </form>
          ) : null}
          {message ? <p className="flip-form-message" role="status">{message}</p> : null}
        </section>
        <section className="flip-section">
          {state.expenses.length ? (
            <div className="flip-record-list">
              {state.expenses.map((expense) => (
                <article className="flip-record-card" key={expense.id}>
                  <div className="flip-record-card__head"><div><span>{expense.date} - {expense.category}</span><h3>{expense.description || expense.merchant}</h3></div><strong>{formatCurrency(expense.amount)}</strong></div>
                  <p>{expense.merchant || "Merchant not recorded"} - {expense.businessPercentage || 0}% business estimate</p>
                  <RecordActions onEdit={() => { if (saveInFlightRef.current) return; setExpenseForm({ ...blankExpense(), ...expense }); setFormOpen(true); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("expenses", expense.id, expense.description || expense.merchant); return false; }} />
                </article>
              ))}
            </div>
          ) : <EmptyState title="No expenses recorded">Add a real business expense to begin the bookkeeping record.</EmptyState>}
        </section>
      </div>
    );
  }

  return (
    <div className="flip-record-workspace">
      <section className="flip-section">
        <SectionHeading
          eyebrow="Travel log"
          title="Mileage"
          detail="Keep a factual trip record with related sourcing activity. No tax treatment is asserted."
          actions={<button type="button" className="primary-button" disabled={saving} onClick={() => { if (saveInFlightRef.current) return; setMileageForm(blankMileage()); setFormOpen((open) => !open); }}>{formOpen ? "Close form" : "Add Mileage"}</button>}
        />
        {formOpen ? (
          <form className="flip-form" onSubmit={saveMileage}>
            <div className="flip-form-grid">
              <TextInput label="Date" type="date" value={mileageForm.date} onChange={setMileage("date")} />
              <TextInput label="Start location" value={mileageForm.startLocation} onChange={setMileage("startLocation")} />
              <TextInput label="Destination" value={mileageForm.destination} onChange={setMileage("destination")} />
              <TextInput label="Purpose" value={mileageForm.purpose} onChange={setMileage("purpose")} />
              <NumberInput label="Miles" value={mileageForm.miles} onChange={setMileage("miles")} />
              <SelectInput label="Related record type" value={mileageForm.relatedRecordType} onChange={(value) => setMileageForm((current) => ({ ...current, relatedRecordType: value, relatedRecordId: "" }))} options={[{ value: "", label: "No related record" }, "auction", "purchase", "sale", "inventory"]} />
              <SelectInput label="Related auction, purchase, sale, or item" value={mileageForm.relatedRecordId} onChange={setMileage("relatedRecordId")} options={[{ value: "", label: "No record selected" }, ...relationOptions(mileageForm.relatedRecordType)]} />
              <TextArea label="Notes" value={mileageForm.notes} onChange={setMileage("notes")} />
            </div>
            <FormActions><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : mileageForm.id ? "Update mileage" : "Save mileage"}</button></FormActions>
          </form>
        ) : null}
        {message ? <p className="flip-form-message" role="status">{message}</p> : null}
      </section>
      <section className="flip-section">
        {state.mileage.length ? (
          <div className="flip-record-list">
            {state.mileage.map((trip) => (
              <article className="flip-record-card" key={trip.id}>
                <div className="flip-record-card__head"><div><span>{trip.date}</span><h3>{trip.purpose}</h3></div><strong>{trip.miles || 0} mi</strong></div>
                <p>{[trip.startLocation, trip.destination].filter(Boolean).join(" to ") || "Locations not recorded"}</p>
                <RecordActions onEdit={() => { if (saveInFlightRef.current) return; setMileageForm({ ...blankMileage(), ...trip }); setFormOpen(true); }} onDelete={() => { if (!saveInFlightRef.current) return onDelete("mileage", trip.id, trip.purpose); return false; }} />
              </article>
            ))}
          </div>
        ) : <EmptyState title="No mileage recorded">Add a real sourcing, pickup, delivery, or business trip.</EmptyState>}
      </section>
    </div>
  );
}
