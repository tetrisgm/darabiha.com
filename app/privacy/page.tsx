export const metadata = { title: "Privacy · Darabiha" };

export default function PrivacyPage() {
  return (
    <main className="settings-page">
      <header className="settings-masthead">
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load; client-side Link navigation is unreliable here */}
        <a className="settings-back-pill" href="/">← Back to the family tree</a>
      </header>
      <section className="settings-panel legal-page">
        <h1>Privacy</h1>
        <div className="settings-card">
          <p>Darabiha.com is a private family archive run by the Darabiha family for its members and relatives. It is not a commercial service and carries no advertising or analytics trackers.</p>
          <h2>What we store</h2>
          <p>The archive holds genealogical records the family contributes: names, dates and places of birth and death, family relationships, biographies, stories, and photographs. If you sign in, we store the email address and display name provided by Apple or Google sign-in, the role a family admin assigns to your account, and an audit log of changes made to the archive.</p>
          <h2>What we do with it</h2>
          <p>This information is used only to present the family tree and to control who can see and edit it. It is never sold, shared with advertisers, or used for any purpose beyond running the archive. Sign-in uses Apple or Google only to confirm your email address; we never see your password.</p>
          <h2>Your choices</h2>
          <p>You can disconnect a linked sign-in yourself on the <a href="/settings">settings page</a>. To correct or remove information about you, contact the site owner at ramine@ramine.net.</p>
        </div>
      </section>
    </main>
  );
}
