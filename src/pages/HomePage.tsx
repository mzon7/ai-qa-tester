import AppLayout from "../features/session-handling-and-protected-routes/components/AppLayout";

export default function HomePage() {
  return (
    <AppLayout>
      <p style={{ color: "var(--text-muted)" }}>
        Your app starts here. Replace this page with your first feature.
      </p>
    </AppLayout>
  );
}
