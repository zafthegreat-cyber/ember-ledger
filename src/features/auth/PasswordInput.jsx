import { useId, useState } from 'react';

/** Password visibility changes presentation only; the caller owns the value. */
export default function PasswordInput({ label = 'Password', id: providedId, ...props }) {
  const generatedId = useId();
  const id = providedId || generatedId;
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  function trackCaps(event) { setCapsLock(Boolean(event.getModifierState?.('CapsLock'))); }
  const description = [props['aria-describedby'], capsLock ? `${id}-caps-lock` : ''].filter(Boolean).join(' ') || undefined;
  return <div className="auth-password-control"><label htmlFor={id}>{label}{props.required ? ' (required)' : ''}</label><div className="drawer-inline-actions"><input {...props} id={id} type={visible ? 'text' : 'password'} aria-describedby={description} onKeyDown={event => {trackCaps(event);props.onKeyDown?.(event);}} onKeyUp={event => {trackCaps(event);props.onKeyUp?.(event);}} onBlur={event => {setCapsLock(false);props.onBlur?.(event);}} /><button type="button" className="secondary-button" aria-controls={id} aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(value => !value)}>{visible ? 'Hide' : 'Show'}</button></div>{capsLock && <small id={`${id}-caps-lock`} role="status">Caps Lock is on</small>}</div>;
}
