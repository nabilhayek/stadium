"use client";

import { useEffect, useState } from "react";

type State = "checking" | "ok" | "down";

export function StatusLight({ checking, ok, down }: { checking: string; ok: string; down: string }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancel = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("down"))))
      .then((body: { ok?: boolean }) => {
        if (!cancel) setState(body.ok ? "ok" : "down");
      })
      .catch(() => {
        if (!cancel) setState("down");
      });
    return () => {
      cancel = true;
    };
  }, []);

  const label = state === "ok" ? ok : state === "down" ? down : checking;
  const dot = state === "ok" ? "bg-emerald-700" : state === "down" ? "bg-red-700" : "bg-neutral-400";

  return (
    <p className="mt-6 flex items-center gap-2 text-[15px] font-medium" role="status">
      <span className={`size-2.5 rounded-full ${dot}`} aria-hidden />
      {label}
    </p>
  );
}
