import { useEffect } from "react";
import { connectRealtimeStream } from "../api/realtimeStream";
import { useAuth } from "../context/AuthContext";

/** Opens the SSE data-change stream while authenticated (Phase-2 realtime). */
export function RealtimeSyncBridge() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    return connectRealtimeStream();
  }, [isAuthenticated]);

  return null;
}
