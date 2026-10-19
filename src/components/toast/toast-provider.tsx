"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { animate, m, useAnimation, useMotionValue, type PanInfo, type Variants } from "framer-motion";
import { EASE } from "@/components/motion/variants";

export type ToastStatus = "default" | "success" | "error" | "warning";

export type ToastOptions = {
  message: string;
  status?: ToastStatus;
  /** Milliseconds before the toast hides itself. `0` keeps it until `dismiss`. */
  duration?: number;
};

type ToastApi = {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
};

type ToastItem = {
  id: string;
  message: string;
  status: ToastStatus;
  duration: number;
  phase: "open" | "leaving";
  /** Leave with the collapsed pile, which slides as one. */
  exitWithStack: boolean;
};

type Store = {
  toasts: ToastItem[];
  listeners: Set<() => void>;
  timers: Map<string, number>;
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissIds: (ids: string[], exitWithStack?: boolean) => void;
  finish: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE: Record<ToastStatus, string> = {
  default: "bg-white text-[#111111]",
  success: "bg-[#15803d] text-white",
  error: "bg-[#dc2626] text-white",
  warning: "bg-[#b45309] text-white",
};

function defaultDuration(status: ToastStatus) {
  if (status === "error") return 6000;
  if (status === "warning") return 5000;
  if (status === "success") return 3200;
  return 4000;
}

function emit(store: Store) {
  for (const listener of store.listeners) listener();
}

function createStore(): Store {
  const store: Store = {
    toasts: [],
    listeners: new Set(),
    timers: new Map(),
    toast(options) {
      const id = crypto.randomUUID();
      const status = options.status ?? "default";
      const duration = options.duration ?? defaultDuration(status);
      store.toasts = [
        ...store.toasts,
        { id, message: options.message, status, duration, phase: "open", exitWithStack: false },
      ];
      emit(store);
      return id;
    },
    dismiss(id) {
      store.dismissIds([id], false);
    },
    dismissIds(ids, exitWithStack = false) {
      const wanted = new Set(ids);
      let changed = false;
      const next = store.toasts.map((item) => {
        if (!wanted.has(item.id) || item.phase !== "open") return item;
        const handle = store.timers.get(item.id);
        if (handle !== undefined) {
          window.clearTimeout(handle);
          store.timers.delete(item.id);
        }
        changed = true;
        return { ...item, phase: "leaving" as const, exitWithStack };
      });
      if (!changed) return;
      store.toasts = next;
      emit(store);
    },
    finish(id) {
      store.timers.delete(id);
      const next = store.toasts.filter((item) => item.id !== id);
      if (next.length === store.toasts.length) return;
      store.toasts = next;
      emit(store);
    },
  };
  return store;
}

const pill: Variants = {
  enter: { opacity: 0, scale: 0.94, x: 0 },
  show: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: {
      opacity: { duration: 0.18, ease: EASE },
      scale: { type: "spring", stiffness: 480, damping: 28, mass: 0.75 },
    },
  },
  exit: {
    opacity: 0,
    scale: 1,
    transition: { duration: 0.24, ease: EASE },
  },
};

const SWIPE_PX = 72;
const SWIPE_VELOCITY = 500;
/** How far each card behind the front of the pile sits lower than the one in front of it. */
const STACK_STEP = 8;

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used within ToastProvider");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const store = useRef<Store>(null);
  if (!store.current) store.current = createStore();
  const current = store.current;
  const api = useMemo<ToastApi>(() => ({ toast: current.toast, dismiss: current.dismiss }), [current]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport store={current} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ store }: { store: Store }) {
  const toasts = useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.toasts,
    () => store.toasts,
  );
  const [expanded, setExpanded] = useState(false);
  const stackX = useMotionValue(0);
  const stacked = toasts.length > 3 && !expanded;

  useEffect(() => {
    for (const item of toasts) {
      if (item.phase !== "open" || item.duration <= 0 || store.timers.has(item.id)) continue;
      store.timers.set(
        item.id,
        window.setTimeout(() => store.dismiss(item.id), item.duration),
      );
    }
  }, [store, toasts]);

  useEffect(
    () => () => {
      for (const handle of store.timers.values()) window.clearTimeout(handle);
    },
    [store],
  );

  useEffect(() => {
    if (toasts.length <= 3) setExpanded(false);
  }, [toasts.length]);

  useEffect(() => {
    const sliding = toasts.some((item) => item.exitWithStack);
    if (!stacked && !sliding) stackX.set(0);
  }, [stacked, stackX, toasts]);

  function dismissStack() {
    const ids = store.toasts.filter((item, index) => index >= 2 && item.phase === "open").map((item) => item.id);
    if (ids.length === 0) return;
    void animate(stackX, window.innerWidth, { duration: 0.32, ease: EASE });
    store.dismissIds(ids, true);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 top-[calc(max(1.1rem,env(safe-area-inset-top))+3rem)]">
      <div className="flex w-full max-w-md flex-col" role="region" aria-label="Notifications">
        {toasts.map((item, index) => (
          <ToastCard
            key={item.id}
            item={item}
            index={index}
            total={toasts.length}
            piled={stacked && index >= 2}
            covered={stacked && index >= 2 && index < toasts.length - 1}
            stackX={stackX}
            onExpand={() => setExpanded(true)}
            onDismissStack={dismissStack}
            onExitComplete={store.finish}
            onDismiss={store.dismiss}
          />
        ))}
      </div>
    </div>
  );
}

function ToastCard({
  item,
  index,
  total,
  piled,
  covered,
  stackX,
  onExpand,
  onDismissStack,
  onExitComplete,
  onDismiss,
}: {
  item: ToastItem;
  index: number;
  total: number;
  piled: boolean;
  covered: boolean;
  stackX: ReturnType<typeof useMotionValue<number>>;
  onExpand: () => void;
  onDismissStack: () => void;
  onExitComplete: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const controls = useAnimation();
  const ownX = useMotionValue(0);
  const dragX = piled ? stackX : ownX;
  // 0 is the front of the pile. Each step back sits lower, so the stack grows downward.
  const depth = piled ? total - 1 - index : 0;

  useEffect(() => {
    if (item.phase === "open") {
      void controls.start("show");
      return;
    }
    let live = true;
    const fade = controls.start("exit");
    const slide = item.exitWithStack
      ? new Promise((resolve) => window.setTimeout(resolve, 320))
      : animate(ownX, window.innerWidth, { duration: 0.32, ease: EASE });
    void Promise.all([fade, slide]).then(
      () => {
        if (live) onExitComplete(item.id);
      },
      () => {
        if (live) onExitComplete(item.id);
      },
    );
    return () => {
      live = false;
    };
  }, [controls, item.exitWithStack, item.id, item.phase, onExitComplete, ownX]);

  function expandFromKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onExpand();
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    const passed = info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_VELOCITY;
    if (!passed) {
      void animate(dragX, 0, { type: "spring", stiffness: 520, damping: 36, mass: 0.8 });
      return;
    }
    if (piled) onDismissStack();
    else onDismiss(item.id);
  }

  const gap = index === 0 || (piled && index > 2) ? "" : "mt-2";
  // Full overlap, then the y step shifts the cards behind downward.
  const stack = piled && index > 2 ? "-mt-11 md:-mt-10" : "";
  const draggable = !covered && item.phase === "open";

  return (
    <m.div
      layout="position"
      transition={{ layout: { duration: 0.34, ease: EASE } }}
      className={["pointer-events-auto w-full", gap, stack].filter(Boolean).join(" ")}
      style={{ zIndex: index + 1 }}
      onKeyDown={piled && !covered ? expandFromKey : undefined}
      role={piled && !covered ? "button" : undefined}
      tabIndex={piled && !covered ? 0 : undefined}
      aria-expanded={piled && !covered ? false : undefined}
      aria-label={
        piled && !covered ? `${item.message}. Show all ${total} notifications, or swipe right to dismiss the stack` : undefined
      }
      aria-hidden={covered ? true : undefined}
    >
      <m.div
        style={{ x: piled ? stackX : 0 }}
        animate={{ y: depth * STACK_STEP }}
        transition={{ y: { duration: 0.34, ease: EASE } }}
        drag={piled && draggable ? "x" : false}
        dragListener={piled && draggable}
        dragConstraints={{ left: 0, right: 420 }}
        dragElastic={{ left: 0.08, right: 0.12 }}
        dragMomentum={false}
        dragSnapToOrigin={false}
        dragDirectionLock
        onDragEnd={piled && draggable ? onDragEnd : undefined}
        onTap={piled && item.phase === "open" ? onExpand : undefined}
        className={[
          "w-full",
          piled && !covered
            ? "rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111]"
            : "",
        ].join(" ")}
      >
        <m.div
          style={{ x: ownX }}
          drag={!piled && draggable ? "x" : false}
          dragListener={!piled && draggable}
          dragConstraints={{ left: 0, right: 420 }}
          dragElastic={{ left: 0.08, right: 0.12 }}
          dragMomentum={false}
          dragSnapToOrigin={false}
          dragDirectionLock
          onDragEnd={!piled && draggable ? onDragEnd : undefined}
          className="w-full"
        >
        <m.div initial={{ opacity: 0, scale: 0.94 }} animate={controls} variants={pill} className="w-full">
          <div
            role={item.status === "error" ? "alert" : "status"}
            title={item.message}
            className={[
              "flex h-11 w-full items-center justify-center rounded-full px-4 text-center text-base font-medium select-none md:h-10",
              "[box-shadow:0px_0px_20px_0px_rgba(0,0,0,0.5)]",
              piled ? "cursor-pointer" : "",
              TONE[item.status],
            ].join(" ")}
          >
            <p className="line-clamp-2 w-full leading-tight">{item.message}</p>
          </div>
        </m.div>
        </m.div>
      </m.div>
    </m.div>
  );
}
