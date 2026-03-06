import { useState } from "react";
import type { ScopeMode } from "../../../lib/api";
import FeatureDescriptionInput from "../../test-app-feature/components/FeatureDescriptionInput";
import { validateFeatureDescription, normaliseFeatureDescription } from "../../test-app-feature/lib/featureDescriptionUtils";

interface RunCreateFormProps {
  onSubmit: (scopeMode: ScopeMode, instructions?: string, featureDescription?: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  hasActiveRun: boolean;
}

export default function RunCreateForm({ onSubmit, loading, error, hasActiveRun }: RunCreateFormProps) {
  const [scopeMode, setScopeMode] = useState<ScopeMode>("everything");
  const [instructions, setInstructions] = useState("");
  const [featureDescription, setFeatureDescription] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (scopeMode === "instructions" && !instructions.trim()) {
      setLocalError("Please describe what to test.");
      return;
    }
    const descErr = validateFeatureDescription(featureDescription);
    if (descErr) { setLocalError(descErr); return; }
    setLocalError(null);
    await onSubmit(
      scopeMode,
      scopeMode === "instructions" ? instructions.trim() : undefined,
      normaliseFeatureDescription(featureDescription),
    );
  };

  const displayError = localError ?? error;

  return (
    <form className="rcf-form" onSubmit={handleSubmit} noValidate>
      <div className="rcf-header">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
          <path d="M5 7l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="rcf-header-label">New test run</span>
      </div>

      {/* Scope toggle */}
      <div className="rcf-scope-row">
        <button
          type="button"
          className={`rcf-scope-btn${scopeMode === "everything" ? " rcf-scope-btn-active" : ""}`}
          onClick={() => { setScopeMode("everything"); setLocalError(null); }}
        >
          Test everything
        </button>
        <button
          type="button"
          className={`rcf-scope-btn${scopeMode === "instructions" ? " rcf-scope-btn-active" : ""}`}
          onClick={() => setScopeMode("instructions")}
        >
          Custom instructions
        </button>
      </div>

      {/* Instructions textarea */}
      {scopeMode === "instructions" && (
        <textarea
          className={`rcf-textarea${localError ? " rcf-textarea-error" : ""}`}
          placeholder="Describe what to test — e.g. 'Test the checkout flow, verify form validation on the signup page, and check that the dashboard loads correctly for new users.'"
          value={instructions}
          onChange={(e) => { setInstructions(e.target.value); setLocalError(null); }}
          rows={4}
          autoFocus
        />
      )}

      {/* Feature description — optional, helps AI assess correctness */}
      <FeatureDescriptionInput
        value={featureDescription}
        onChange={setFeatureDescription}
        disabled={loading || hasActiveRun}
      />

      {displayError && (
        <p className="rcf-error" role="alert">{displayError}</p>
      )}

      <button
        type="submit"
        className="rcf-submit"
        disabled={loading || hasActiveRun}
        title={hasActiveRun ? "Wait for the current run to finish" : undefined}
      >
        {loading ? (
          <span className="auth-btn-loading">
            <span className="auth-spinner" />
            Starting…
          </span>
        ) : hasActiveRun ? (
          "Run in progress…"
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <polygon points="3,2 10,6 3,10" fill="currentColor" />
            </svg>
            Start test run
          </>
        )}
      </button>
    </form>
  );
}
