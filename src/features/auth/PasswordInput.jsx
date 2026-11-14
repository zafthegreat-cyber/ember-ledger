import { useId, useState } from 'react';

/** Password visibility changes presentation only; the caller owns the value. */
export default function PasswordInput({ label = 'Password', id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [visible, setVisible] = useState(false);
  return <div className="auth-password-control"><label htmlFor={id}>{label}{props.required ? ' (required)' : ''}</label><div className="drawer-inline-actions"><input {...props} id={id} type={visible ? 'text' : 'password'} /><button type="button" className="secondary-button" aria-controls={id} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? 'Hide password' : 'Show password'}</button></div></div>;
}
