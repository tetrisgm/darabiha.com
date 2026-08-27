import { readTree } from "../../../db/store";
import { requireEditor } from "../../authz";
import { buildGedcom } from "../../../lib/gedcom";

export const runtime = "edge";

/** The family's data in the format every genealogy program reads. Editors
 * only: it is the whole archive in one file. */
export async function GET() {
  const auth = await requireEditor();
  if (!auth.ok) return auth.response;
  const tree = await readTree();
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(buildGedcom(tree), {
    headers: {
      "content-type": "text/vnd.familysearch.gedcom; charset=utf-8",
      "content-disposition": `attachment; filename="darabiha-${stamp}.ged"`,
      "cache-control": "no-store",
    },
  });
}
