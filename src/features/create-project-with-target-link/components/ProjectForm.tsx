import { useState, useRef, useEffect } from "react";
import { validateTargetUrl, normalizeUrl } from "../../../lib/validators";

interface ProjectFormProps {
  onSubmit: (targetUrl: string, name?: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
  existedWarning?: boolean;
}

export default function ProjectForm({
  onSubmit,
  onCancel,
  loading,
  error,
  existedWarning,
}: ProjectFormProps) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateTargetUrl(url);
    if (validationError) {
      setUrlError(validationError);
      return;
    }
    setUrlError(null);
    await onSubmit(normalizeUrl(url), name.trim() || undefined);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (urlError) setUrlError(null);
  };

  return (
    <div className="pform-overlay" role="dialog" aria-modal="true" aria-label="Create project">
      <div className="pform-drawer">
        {/* Header */}
        <div className="pform-header">
          <div className="pform-header-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.3" opacity="0.4" />
              <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
              <circle cx="9" cy="9" r="1.8" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h2 className="pform-title">New Project</h2>
            <p className="pform-subtitle">Enter the URL of the site or app to test.</p>
          </div>
          <button
            type="button"
            className="pform-close"
            onClick={onCancel}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="pform-body" noValidate>
          <div className="settings-field">
            <label className="settings-label" htmlFor="project-url">
              Target URL <span className="pform-required">*</span>
            </label>
            <input
              ref={urlRef}
              id="project-url"
              type="url"
              className={`auth-input pform-url-input${urlError ? " pform-input-error" : ""}`}
              placeholder="https://your-app.com"
              value={url}
              onChange={handleUrlChange}
              required
              autoComplete="off"
              spellCheck={false}
            />
            {urlError && (
              <p className="pform-field-error" role="alert">{urlError}</p>
            )}
          </div>

          <div className="settings-field">
            <label className="settings-label" htmlFor="project-name">
              Project name <span className="pform-optional">(optional)</span>
            </label>
            <input
              id="project-name"
              type="text"
              className="auth-input"
              placeholder="My App — Production"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
            <p className="settings-field-hint">Defaults to the URL if left blank.</p>
          </div>

          {/* Server error */}
          {error && !urlError && (
            <div className="auth-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
              </svg>
              {error}
            </div>
          )}

          {/* Existing project warning */}
          {existedWarning && (
            <div className="pform-warn" role="status">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
              </svg>
              A project for this URL already exists — it has been selected.
            </div>
          )}

          <div className="settings-actions pform-actions">
            <button
              type="submit"
              className="auth-btn-primary settings-btn-save"
              disabled={loading || !url.trim()}
            >
              {loading ? (
                <span className="auth-btn-loading">
                  <span className="auth-spinner" />
                  Creating…
                </span>
              ) : (
                "Create project"
              )}
            </button>
            <button
              type="button"
              className="settings-btn-validate"
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
