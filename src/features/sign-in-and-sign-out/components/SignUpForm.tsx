import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";

export default function SignUpForm() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err, needsConfirmation } = await signUp(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else if (needsConfirmation) {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <div className="auth-confirm">
        <div className="auth-confirm-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
            <circle cx="18" cy="18" r="16" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            <path d="M10 18l5.5 5.5 10.5-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="auth-title">Check your inbox</h1>
        <p className="auth-subtitle">
          Confirmation link sent to <strong className="auth-email-highlight">{email}</strong>.
          Click the link to activate your account.
        </p>
        <Link to="/login" className="auth-btn-ghost">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="auth-heading">
        <h1 className="auth-title">Create account</h1>
        <p className="auth-subtitle">Join the QA command center</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <div className="auth-field">
          <label htmlFor="email" className="auth-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <div className="auth-field">
          <label htmlFor="password" className="auth-label">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="••••••••  (min 6 chars)"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div className="auth-error" role="alert">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? (
            <span className="auth-btn-loading">
              <span className="auth-spinner" />
              Creating account…
            </span>
          ) : (
            "Sign up"
          )}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account?{" "}
        <Link to="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </>
  );
}
