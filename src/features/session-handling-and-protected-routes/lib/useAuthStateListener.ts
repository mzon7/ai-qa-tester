import { useEffect, useRef } from "react";
import { useAuth } from "@mzon7/zon-incubator-sdk/auth";

/** localStorage key prefixes that belong to this app and should be cleared on sign-out. */
const SENSITIVE_PREFIXES = ["ai_qa_tester_", "qa_", "supabase.auth.token"];

/**
 * Detects sign-out events by watching the `user` value from AuthProvider.
 * When the user transitions from authenticated → null, clears all app-owned
 * localStorage keys so stale session data does not persist for the next user.
 *
 * Place this hook once in the component tree, just below AuthProvider
 * (e.g. inside App).
 */
export function useAuthStateListener() {
  const { user } = useAuth();
  const prevUserRef = useRef(user);

  useEffect(() => {
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;

    // Transition: was authenticated → now null (signed out)
    if (prevUser !== null && user === null) {
      clearSensitiveStorage();
    }
  }, [user]);
}

/** Remove all localStorage keys that match any of the sensitive prefixes. */
function clearSensitiveStorage() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && SENSITIVE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage may be unavailable in some environments — fail silently
  }
}
