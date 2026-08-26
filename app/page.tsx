import FamilyTreeApp from "./components/FamilyTreeApp";
import { appleSignInPath, appleSignOutPath, getAppleUser } from "./apple-auth";
import { getViewerRole, TEMPORARY_OPEN_EDITOR } from "./authz";

export const dynamic = "force-dynamic";

export default async function Home() {
  // The tree is fetched client-side: serializing 400+ people into every
  // server response repeatedly exceeded the Worker CPU limit.
  const user = await getAppleUser();
  const role = user ? await getViewerRole(user) : null;
  return (
    <FamilyTreeApp
      initialTree={null}
      viewer={{ signedIn: Boolean(user), canEdit: TEMPORARY_OPEN_EDITOR || role !== null, role, displayName: user?.displayName ?? null }}
      signInPath={appleSignInPath("/")}
      signOutPath={appleSignOutPath("/")}
      signInEnabled={!TEMPORARY_OPEN_EDITOR}
    />
  );
}
