import TopNav from "../features/sign-in-and-sign-out/components/TopNav";

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <TopNav />
      <main style={{ flex: 1, maxWidth: 900, width: "100%", margin: "0 auto", padding: "2rem 1.5rem" }}>
        <p style={{ color: "var(--text-muted)" }}>
          Your app starts here. Replace this page with your first feature.
        </p>
      </main>
    </div>
  );
}
