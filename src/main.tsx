import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@mzon7/zon-incubator-sdk/auth";
import { installFrontendErrorCapture } from "@mzon7/zon-incubator-sdk";
import { supabase } from "./lib/supabase";
import App from "./App";
import "./index.css";

// Self-heal: capture uncaught errors + unhandled rejections
installFrontendErrorCapture(supabase, "ai_qa_tester_");

// Register service worker with error handling to avoid unhandled rejection noise
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // SW registration can fail in dev, incognito, or when sw.js is not yet built — safe to ignore
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider supabase={supabase}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
