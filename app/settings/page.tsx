import { appleSignInPath, appleSignOutPath, getAppleUser } from "../apple-auth";
import { getViewerRole } from "../authz";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getAppleUser();
  const role = user ? await getViewerRole(user) : null;
  return (
    <SettingsClient
      viewer={{ signedIn: Boolean(user), email: user?.email ?? null, displayName: user?.displayName ?? null, role }}
      appleSignInPath={appleSignInPath("/settings")}
      googleSignInPath={process.env.GOOGLE_CLIENT_ID ? "/api/auth/google?return_to=%2Fsettings" : null}
      signOutPath={appleSignOutPath("/settings")}
    />
  );
}
