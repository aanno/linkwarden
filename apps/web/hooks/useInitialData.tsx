import { useContext, useEffect } from "react";
import { SessionContext } from "next-auth/react";
import useLocalSettingsStore from "@/store/localSettings";

export default function useInitialData() {
  const _session = useContext(SessionContext);
  const status = _session?.status ?? "loading";
  const data = _session?.data;
  const { setSettings } = useLocalSettingsStore();
  useEffect(() => {
    setSettings();
  }, [status, data]);

  return status;
}
