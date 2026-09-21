"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";

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

  // Close on navigation: remember the path the drawer opened on and compare during render.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (isOpen && openedAt !== pathname) {
    setIsOpen(false);
    setOpenedAt(pathname);
  }

  const open = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
    setOpenedAt(pathname);
  }, [pathname]);

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
            {isOpen ? (
              <X className="size-4" strokeWidth={2} aria-hidden />
            ) : (
              <Menu className="size-4" strokeWidth={2} aria-hidden />
            )}
          </button>
        </div>
      </div>

      {hasOpened ? (
        <NavDrawer stadiumSlug={stadiumSlug} isOpen={isOpen} onOpenChange={setIsOpen} />
      ) : null}
    </>
  );
}
