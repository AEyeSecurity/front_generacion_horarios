"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  getIsOnline,
  handleSessionExpired,
  notifyOffline,
  notifyOnline,
  dispatchNetworkStatus,
  SESSION_EXPIRED_EVENT,
} from "@/lib/network-auth";

export function useNetworkAndAuth() {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(getIsOnline);

  useEffect(() => {
    const syncOnlineState = () => {
      const nextOnline = getIsOnline();
      setIsOnline(nextOnline);
      dispatchNetworkStatus(nextOnline);
      if (nextOnline) {
        notifyOnline();
      } else {
        notifyOffline();
      }
    };

    const onSessionExpired = () => {
      void handleSessionExpired({ redirectWith: (url) => router.replace(url) });
    };

    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    window.addEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);

    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onSessionExpired);
    };
  }, [router]);

  return { isOnline, shouldPausePolling: !isOnline };
}

export default function NetworkAuthProvider({ children }: { children: ReactNode }) {
  useNetworkAndAuth();
  return <>{children}</>;
}
