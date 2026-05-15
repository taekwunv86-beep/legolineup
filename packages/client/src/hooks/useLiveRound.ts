import { useQuery } from "@tanstack/react-query";
import { POLLING, type LiveResponse } from "@desco/shared";
import { apiFetch } from "../lib/api.js";

export function useLiveRound(roundId: number) {
  return useQuery({
    queryKey: ["rounds", roundId, "live"],
    queryFn: () => apiFetch<LiveResponse>(`/api/rounds/${roundId}/live`),
    refetchInterval: POLLING.teamCardMs,
    refetchIntervalInBackground: false,
    staleTime: 0,
    enabled: Number.isFinite(roundId),
  });
}
