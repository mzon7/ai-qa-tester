import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";

export default function SignInForm() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate("/home", { replace: true });
    }
  };

  return (
    <>
      <div className="auth-heading">
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your QA command center</p>
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="••••••••"
            autoComplete="current-password"
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
              Authenticating…
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="auth-switch">
        No account?{" "}
        <Link to="/signup" className="auth-link">
          Create one
        </Link>
      </p>
    </>
  );
}
