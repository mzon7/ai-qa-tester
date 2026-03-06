/**
 * FeatureDescriptionInput
 *
 * A self-contained textarea for capturing an optional plain-text description
 * of the feature being tested. Reusable across any run-creation context.
 */

import { validateFeatureDescription, FEATURE_DESCRIPTION_MAX_LENGTH } from "../lib/featureDescriptionUtils";

interface FeatureDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  disabled?: boolean;
}

export default function FeatureDescriptionInput({
  value,
  onChange,
  error: externalError,
  disabled,
}: FeatureDescriptionInputProps) {
  const inlineError = value.trim() ? validateFeatureDescription(value) : null;
  const displayError = externalError ?? inlineError;
  const remaining = FEATURE_DESCRIPTION_MAX_LENGTH - value.length;

  return (
    <div className="fdi-wrapper">
      <label className="fdi-label" htmlFor="fdi-textarea">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <rect x="1" y="2" width="10" height="1.2" rx="0.6" fill="currentColor" opacity="0.5" />
          <rect x="1" y="5.4" width="7" height="1.2" rx="0.6" fill="currentColor" opacity="0.5" />
          <rect x="1" y="8.8" width="8.5" height="1.2" rx="0.6" fill="currentColor" opacity="0.5" />
        </svg>
        Feature description
        <span className="fdi-optional">(optional)</span>
      </label>
      <textarea
        id="fdi-textarea"
        className={`fdi-textarea${displayError ? " fdi-textarea-error" : ""}`}
        placeholder="Describe what this feature does and how it's expected to behave — e.g. 'Users can sign up with an email and password. After confirming their email they are redirected to the dashboard.'"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={FEATURE_DESCRIPTION_MAX_LENGTH + 1} // allow slight overage so we can show the error
        disabled={disabled}
        aria-describedby={displayError ? "fdi-error" : undefined}
      />
      <div className="fdi-footer">
        {displayError ? (
          <p className="fdi-error" id="fdi-error" role="alert">{displayError}</p>
        ) : (
          <span />
        )}
        <span className={`fdi-counter${remaining < 100 ? " fdi-counter-warn" : ""}`}>
          {remaining.toLocaleString()} left
        </span>
      </div>
    </div>
  );
}
