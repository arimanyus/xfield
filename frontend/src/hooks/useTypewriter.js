import { useEffect, useState } from "react";

export function useTypewriter(text = "", enabled = false, delay = 0, speed = 16) {
  const [out, setOut] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      setOut(text);
      return undefined;
    }
    setOut("");
    let i = 0;
    let timer;
    const start = setTimeout(() => {
      timer = setInterval(() => {
        i += 1;
        setOut(text.slice(0, i));
        if (i >= text.length) clearInterval(timer);
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [text, enabled, delay, speed]);

  return out;
}

export function useRollingCode(active = true, every = 90) {
  const [code, setCode] = useState("S00E00");
  useEffect(() => {
    if (!active) return undefined;
    const r = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    const t = setInterval(() => setCode(`S${String(r(1, 30)).padStart(2, "0")}E${String(r(1, 24)).padStart(2, "0")}`), every);
    return () => clearInterval(t);
  }, [active, every]);
  return code;
}
