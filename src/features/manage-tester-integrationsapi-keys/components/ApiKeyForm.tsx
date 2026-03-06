import { useState, useEffect } from "react";
import { reportSelfHealError } from "@mzon7/zon-incubator-sdk";
import { settingsGet, settingsSaveKeys, settingsValidateKeys } from "../../../lib/api";
import type { SettingsData } from "../../../lib/api";
import { supabase } from "../../../lib/supabase";

const PROVIDERS = [
  { value: "grok", label: "Grok (xAI)", hint: "xai-..." },
  { value: "openai", label: "OpenAI (GPT)", hint: "sk-..." },
];

type ValidationState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "success" }
  | { status: "error"; message: string };

export default function ApiKeyForm() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState("grok");
  const [apiKey, setApiKey] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });

  // Load existing settings on mount
  useEffect(() => {
    settingsGet().then(({ data, error }) => {
      setLoading(false);
      if (error || !data) return;
      setSettings(data);
      setProvider(data.provider);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setSaveState({ status: "pending" });
    setValidation({ status: "idle" });

    const { data, error } = await settingsSaveKeys(provider, apiKey.trim());
    if (error || !data) {
      const msg = error ?? "Failed to save key";
      setSaveState({ status: "error", message: msg });
      reportSelfHealError(supabase, {
        category: "frontend",
        source: "ApiKeyForm",
        errorMessage: msg,
        projectPrefix: "ai_qa_tester_",
        metadata: { action: "settingsSaveKeys", provider },
      });
      return;
    }

    setSettings((prev) => ({
      ...(prev ?? {
        memory_retention_days: 30,
        updated_at: new Date().toISOString(),
      }),
      provider,
      key_hint: data.hint,
      key_set: true,
      updated_at: new Date().toISOString(),
    }));
    setApiKey(""); // clear input after save
    setSaveState({ status: "success" });

    // Reset success after 3s
    setTimeout(() => setSaveState({ status: "idle" }), 3000);
  };

  const handleValidate = async () => {
    setValidation({ status: "pending" });
    const { data, error } = await settingsValidateKeys();
    if (error) {
      setValidation({ status: "error", message: error });
      reportSelfHealError(supabase, {
        category: "frontend",
        source: "ApiKeyForm",
        errorMessage: error,
        projectPrefix: "ai_qa_tester_",
        metadata: { action: "settingsValidateKeys" },
      });
      return;
    }
    if (!data) {
      setValidation({ status: "error", message: "No response from server" });
      return;
    }
    setValidation(
      data.valid
        ? { status: "success", message: data.message }
        : { status: "error", message: data.message }
    );
  };

  if (loading) {
    return (
      <div className="settings-loading" aria-busy="true">
        <span className="auth-spinner" />
        <span>Loading settings…</span>
      </div>
    );
  }

  return (
    <form className="settings-form" onSubmit={handleSave} noValidate>
      {/* Provider selector */}
      <div className="settings-field">
        <label className="settings-label" htmlFor="provider">
          LLM Provider
        </label>
        <div className="settings-provider-grid">
          {PROVIDERS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`settings-provider-btn${provider === p.value ? " settings-provider-btn-active" : ""}`}
              onClick={() => {
                setProvider(p.value);
                setSaveState({ status: "idle" });
                setValidation({ status: "idle" });
              }}
            >
              <span className="settings-provider-label">{p.label}</span>
              <span className="settings-provider-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Key status indicator */}
      {settings?.key_set && settings.provider === provider && (
        <div className="settings-key-status">
          <span className="settings-key-dot" aria-hidden="true" />
          <span>
            Key set — ending in <code className="settings-key-hint">••••{settings.key_hint}</code>
          </span>
          <span className="settings-key-age">
            Updated {new Date(settings.updated_at).toLocaleDateString()}
          </span>
        </div>
      )}

      {/* API key input */}
      <div className="settings-field">
        <label className="settings-label" htmlFor="api-key">
          {settings?.key_set && settings.provider === provider
            ? "Replace API Key"
            : "API Key"}
        </label>
        <div className="settings-key-row">
          <input
            id="api-key"
            type="password"
            className="auth-input settings-key-input"
            placeholder={
              settings?.key_set && settings.provider === provider
                ? "Enter new key to replace existing…"
                : PROVIDERS.find((p) => p.value === provider)?.hint ?? "Paste your API key…"
            }
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaveState({ status: "idle" });
            }}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="settings-field-hint">
          Your key is encrypted server-side and never returned to the browser.
        </p>
      </div>

      {/* Save error */}
      {saveState.status === "error" && (
        <div className="auth-error" role="alert">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
            <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
          </svg>
          {saveState.message}
        </div>
      )}

      {/* Validation result */}
      {(validation.status === "success" || validation.status === "error") && (
        <div
          className={validation.status === "success" ? "settings-validation-ok" : "settings-validation-err"}
          role="status"
        >
          {validation.status === "success" ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 7l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
              <line x1="7" y1="4" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="7" cy="9.5" r="0.7" fill="currentColor" />
            </svg>
          )}
          {validation.message}
        </div>
      )}

      {/* Actions */}
      <div className="settings-actions">
        <button
          type="submit"
          className="auth-btn-primary settings-btn-save"
          disabled={!apiKey.trim() || saveState.status === "pending"}
        >
          {saveState.status === "pending" ? (
            <span className="auth-btn-loading">
              <span className="auth-spinner" />
              Saving…
            </span>
          ) : saveState.status === "success" ? (
            <span className="auth-btn-loading">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                <path d="M4 7l2.5 2.5 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Saved!
            </span>
          ) : (
            "Save Key"
          )}
        </button>

        <button
          type="button"
          className="settings-btn-validate"
          onClick={handleValidate}
          disabled={validation.status === "pending" || !(settings?.key_set && settings.provider === provider)}
          title={
            !(settings?.key_set && settings.provider === provider)
              ? "Save a key first, then validate"
              : undefined
          }
        >
          {validation.status === "pending" ? (
            <span className="auth-btn-loading">
              <span className="auth-spinner" />
              Testing…
            </span>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M5 7l1.5 1.5 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Validate Key
            </>
          )}
        </button>
      </div>
    </form>
  );
}
