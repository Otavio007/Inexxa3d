import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { errorText } from "./supabase";
export function useResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const counter = useRef(0);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const reload = useCallback(async () => {
    const n = ++counter.current;
    setLoading(true);
    setError("");
    try {
      const result = await loader();
      if (mounted.current && n === counter.current) setData(result);
    } catch (e) {
      if (mounted.current && n === counter.current) setError(errorText(e));
    } finally {
      if (mounted.current && n === counter.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      void reload();
    }, [reload]),
  );
  return { data, loading, error, reload };
}
