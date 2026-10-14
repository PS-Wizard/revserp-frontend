import type { QueryClient } from "@tanstack/react-query";

import { fetchProjectSetup } from "~/lib/api";
import type { ProjectSetupResponse } from "~/lib/api.types";
import { projectSetupQueryKey } from "~/hooks/use-project-setup";

/** Setup-managed crawl check: true only when the crawl id equals the project's persisted setup crawl id. */
export async function isSetupManagedCrawl(
  queryClient: QueryClient,
  orgId: string,
  projectId: string,
  crawlId: string,
): Promise<boolean> {
  if (!orgId || !projectId || !crawlId) return false;
  let setup = queryClient.getQueryData<ProjectSetupResponse | null>(
    projectSetupQueryKey(projectId),
  );
  if (setup === undefined) {
    try {
      setup = await queryClient.fetchQuery({
        queryKey: projectSetupQueryKey(projectId),
        queryFn: () => fetchProjectSetup(projectId),
      });
    } catch {
      return false;
    }
  }
  return setup?.organization_id === orgId && setup?.crawl_id === crawlId;
}
