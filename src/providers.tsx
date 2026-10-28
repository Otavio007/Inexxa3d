import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { Session } from "@supabase/supabase-js";
import { CartItem } from "./domain";
import { configured, supabase } from "./supabase";
type State = {
  session: Session | null;
  authLoading: boolean;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  recovery: boolean;
};
const Context = createContext<State>({
  session: null,
  authLoading: true,
  cart: [],
  setCart: () => {},
  recovery: false,
});
export function Providers({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!configured) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data, error }) => {
      setSession(error ? null : data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") {
        setRecovery(false);
        setCart([]);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <Context.Provider value={{ session, authLoading, cart, setCart, recovery }}>
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
