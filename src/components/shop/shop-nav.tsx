"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NavDrawer = dynamic(() => import("./nav-drawer").then((mod) => mod.NavDrawer), {
  ssr: false,
});

type Props = { stadiumSlug: string };

/** Top-right hamburger. The drawer (HeroUI) loads the first time the menu opens. */
export function ShopNav({ stadiumSlug }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  const open = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, []);

  const warm = useCallback(() => {
    router.prefetch(`/${stadiumSlug}/orders`);
    router.prefetch(`/${stadiumSlug}/support`);
  }, [router, stadiumSlug]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-30">
        <div className="mx-auto flex w-full max-w-md justify-end px-4 pt-[max(1.1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={open}
            onPointerEnter={warm}
            onFocus={warm}
            aria-label="Open menu"
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            className="pointer-events-auto grid size-10 place-items-center rounded-full bg-white text-black [box-shadow:0px_0px_20px_0px_rgba(0,0,0,0.5)]"
          >
            <HamburgerIcon open={isOpen} />
          </button>
        </div>
      </div>

      {hasOpened ? (
        <NavDrawer stadiumSlug={stadiumSlug} isOpen={isOpen} onOpenChange={setIsOpen} />
      ) : null}
    </>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block size-4" aria-hidden>
      <span
        className={[
          "absolute left-0 block h-[1.5px] w-4 bg-current transition-transform duration-200",
          open ? "top-[7.5px] rotate-45" : "top-[3px]",
        ].join(" ")}
      />
      <span
        className={[
          "absolute left-0 top-[7.5px] block h-[1.5px] w-4 bg-current transition-opacity duration-200",
          open ? "opacity-0" : "opacity-100",
        ].join(" ")}
      />
      <span
        className={[
          "absolute left-0 block h-[1.5px] w-4 bg-current transition-transform duration-200",
          open ? "top-[7.5px] -rotate-45" : "top-[12px]",
        ].join(" ")}
      />
    </span>
  );
}
