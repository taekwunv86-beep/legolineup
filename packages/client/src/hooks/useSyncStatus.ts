import { useEffect, useState } from "react";
import { subscribeSync } from "../lib/sync.js";

type State = { status: "online" | "syncing" | "offline"; queued: number };

export function useSyncStatus(): State {
  const [state, setState] = useState<State>({ status: "online", queued: 0 });
  useEffect(() => subscribeSync(setState), []);
  return state;
}
