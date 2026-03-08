import { useState } from "react";

/**
 * TestTargetPage — a public demo page at /test
 * Used to exercise the Playwright button scanner:
 *  - "Working Button" → shows a success message (works correctly)
 *  - "Broken Button"  → throws a JS error (simulates a bug)
 */
export default function TestTargetPage() {
  const [workingMsg, setWorkingMsg] = useState<string | null>(null);
  const [brokenMsg, setBrokenMsg] = useState<string | null>(null);

  function handleWorking() {
    setWorkingMsg("✓ Button clicked successfully!");
  }

  function handleBroken() {
    // Simulate a broken button by directly setting the error message.
    // We do NOT throw a real JS exception — in React 18/19 dev mode, thrown
    // errors in event handlers can escape try/catch via React's scheduler and
    // trigger window.onerror, causing false-positive self-heal reports.
    // The error message in the DOM is sufficient for Playwright to detect the broken state.
    setBrokenMsg("✗ Error: Cannot read properties of null (reading 'nonExistentMethod')");
  }

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 600, margin: "0 auto" }}>
      <h1>QA Test Target Page</h1>
      <p style={{ color: "#666" }}>
        This page is used by the Playwright button scanner to verify working and broken buttons.
      </p>

      <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
        <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: 8, padding: "1.5rem" }}>
          <h2 style={{ marginTop: 0, color: "#0e6735" }}>Working Button</h2>
          <p>Click below — it works correctly.</p>
          <button
            id="working-button"
            onClick={handleWorking}
            style={{
              background: "#0e6735",
              color: "#fff",
              border: "none",
              padding: "0.6rem 1.4rem",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Click Me (Works)
          </button>
          {workingMsg && (
            <p style={{ marginTop: "0.75rem", color: "#0e6735", fontWeight: 600 }}>{workingMsg}</p>
          )}
        </div>

        <div style={{ flex: 1, border: "1px solid #ccc", borderRadius: 8, padding: "1.5rem" }}>
          <h2 style={{ marginTop: 0, color: "#c0392b" }}>Broken Button</h2>
          <p>Click below — it throws a JS error.</p>
          <button
            id="broken-button"
            onClick={handleBroken}
            style={{
              background: "#c0392b",
              color: "#fff",
              border: "none",
              padding: "0.6rem 1.4rem",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: "1rem",
            }}
          >
            Click Me (Broken)
          </button>
          {brokenMsg && (
            <p style={{ marginTop: "0.75rem", color: "#c0392b", fontWeight: 600 }}>{brokenMsg}</p>
          )}
        </div>
      </div>
    </div>
  );
}
