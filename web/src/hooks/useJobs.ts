import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getJobs, patchJob } from "../lib/api";
import type { Job, Status } from "../lib/types";

export type JobPatch = Partial<{ status: Status; starred: boolean; note: string }>;

export function useJobs() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["jobs"], queryFn: getJobs });

  const mutation = useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: JobPatch }) => patchJob(key, patch),
    onMutate: async ({ key, patch }) => {
      await qc.cancelQueries({ queryKey: ["jobs"] });
      const prev = qc.getQueryData<Job[]>(["jobs"]);
      qc.setQueryData<Job[]>(["jobs"], (old) =>
        (old ?? []).map((j) => (j.key === key ? { ...j, ...patch } : j)),
      );
      return { prev };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["jobs"], ctx.prev);
      toast.error(`Update failed: ${(e as Error).message}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  return { jobs: query.data, isLoading: query.isLoading, patch: (key: string, patch: JobPatch) => mutation.mutate({ key, patch }) };
}
