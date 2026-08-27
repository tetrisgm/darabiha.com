import Link from "next/link";

export const metadata = { title: "Terms · Darabiha" };

export default function TermsPage() {
  return (
    <main className="settings-page">
      <header className="settings-masthead">
        <Link className="settings-back-pill" href="/">← Back to the family tree</Link>
      </header>
      <section className="settings-panel legal-page">
        <h1>Terms of use</h1>
        <div className="settings-card">
          <p>Darabiha.com is a private, non-commercial family archive. By using it you agree to a few common-sense rules.</p>
          <h2>Use of the archive</h2>
          <p>The archive exists so the Darabiha family can record and share its own history. Content is contributed by family members and is intended for family eyes; please do not republish records or photographs from the archive elsewhere without asking the people concerned.</p>
          <h2>Accounts and editing</h2>
          <p>Anyone may sign in with Apple or Google; what an account can see and change is decided by the family admins on the <Link href="/settings">settings page</Link>. Editors agree to add only information they believe to be accurate and to respect other members&rsquo; corrections. All changes are recorded in an audit log.</p>
          <h2>No warranty</h2>
          <p>The archive is a family effort, provided as-is. Records may contain mistakes; corrections are welcome. For any question about these terms, contact ramine@ramine.net.</p>
        </div>
      </section>
    </main>
  );
}
