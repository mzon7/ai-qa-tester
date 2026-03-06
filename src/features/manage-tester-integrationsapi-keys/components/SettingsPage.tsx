import AppLayout from "../../session-handling-and-protected-routes/components/AppLayout";
import ApiKeyForm from "./ApiKeyForm";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="settings-page">
        {/* Page header */}
        <div className="settings-header">
          <div className="settings-header-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="3" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M11 2v2M11 18v2M2 11h2M18 11h2M4.22 4.22l1.42 1.42M16.36 16.36l1.42 1.42M4.22 17.78l1.42-1.42M16.36 5.64l1.42-1.42"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div>
            <h1 className="settings-title">Integrations</h1>
            <p className="settings-subtitle">
              Configure the AI provider your QA agent uses to analyse and test your product.
            </p>
          </div>
        </div>

        {/* Settings card */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h2 className="settings-card-title">LLM API Key</h2>
            <span className="settings-card-badge">Required</span>
          </div>
          <p className="settings-card-description">
            The QA agent needs an LLM API key to plan test scenarios, evaluate results, and generate
            reports. Keys are encrypted at rest and never exposed to the browser.
          </p>
          <ApiKeyForm />
        </div>

        {/* Info strip */}
        <div className="settings-info">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
            <line x1="7" y1="6" x2="7" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="4" r="0.7" fill="currentColor" />
          </svg>
          <span>
            Keys are encrypted with AES-256-GCM before storage. Only the last 4 characters
            are ever shown in this UI.
          </span>
        </div>
      </div>
    </AppLayout>
  );
}
