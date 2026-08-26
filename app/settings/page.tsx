import { appleSignInPath, appleSignOutPath, getAppleUser } from "../apple-auth";
import { getViewerRole } from "../authz";
import { getSiteVisibility, listConnectedProviders, listLinksFor, resolveMemberEmail } from "../../db/store";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAppleUser();
  const accountEmail = user ? await resolveMemberEmail(user.email) : null;
  const role = user ? await getViewerRole(user) : null;
  const links = accountEmail ? await listLinksFor(accountEmail) : [];
  const sessionProvider = user ? (user.subject.startsWith("google:") ? "google" : user.subject.startsWith("temporary-open-editor") ? null : "apple") : null;
  const connectedProviders = [...new Set([...(accountEmail ? await listConnectedProviders(accountEmail) : []), ...(sessionProvider ? [sessionProvider] : [])])];
  const siteVisibility = role === "admin" ? await getSiteVisibility() : null;
  return (
    <SettingsClient
      viewer={{ signedIn: Boolean(user), email: user?.email ?? null, accountEmail, displayName: user?.displayName ?? null, role, links, connectedProviders }}
      siteVisibility={siteVisibility}
      appleSignInPath={appleSignInPath("/settings")}
      googleSignInPath={process.env.GOOGLE_CLIENT_ID ? "/api/auth/google?return_to=%2Fsettings" : null}
      signOutPath={appleSignOutPath("/settings")}
    />
  );
}
