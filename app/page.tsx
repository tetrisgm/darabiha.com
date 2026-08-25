import FamilyTreeApp from "./components/FamilyTreeApp";
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";
import { isEditor } from "./authz";
import { readTree } from "../db/store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [tree, user] = await Promise.all([readTree(), getChatGPTUser()]);
  return (
    <FamilyTreeApp
      initialTree={tree}
      viewer={{ signedIn: Boolean(user), canEdit: isEditor(user), displayName: user?.displayName ?? null }}
      signInPath={chatGPTSignInPath("/")}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
