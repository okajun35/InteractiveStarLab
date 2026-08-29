import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../state/auth";

export function AuthPanel() {
  const { cloudConfigured, loading, session, email, error, signIn, signOut, clearError } = useAuth();
  const [emailInput, setEmailInput] = useState("");
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);

  if (!cloudConfigured) return null;
  if (session) {
    return (
      <div className="auth-panel auth-panel-signed-in" aria-label="クラウドアカウント">
        <span className="auth-email" title={email ?? undefined}>{email ?? "Signed in"}</span>
        <button type="button" className="auth-action" onClick={() => void signOut()} disabled={loading}>ログアウト</button>
      </div>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void signIn(emailInput, password);
  };

  return (
    <div className={`auth-panel${open ? " auth-panel-open" : ""}`} aria-label="クラウドログイン">
      <button type="button" className="auth-toggle" onClick={() => { setOpen((value) => !value); clearError(); }} aria-expanded={open}>
        <span className="en">Cloud</span> ログイン
      </button>
      {open && (
        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>Email</span>
            <input type="email" autoComplete="username" value={emailInput} onChange={(event) => setEmailInput(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="primary auth-submit" disabled={loading}>{loading ? "確認中…" : "ログイン"}</button>
        </form>
      )}
    </div>
  );
}
