/** The venue this phone used last. Home-screen shortcuts open `/` and land here. */
export const LAST_STADIUM_KEY = "last-stadium:v1";

export const SHORTCUTS = { menu: "", orders: "/orders" } as const;

export type Shortcut = keyof typeof SHORTCUTS;

/** Where `/?go=…` should send this phone, or null to stay on the venue list. */
export function shortcutPath(go: string | null, lastStadium: string | null, activeSlugs: string[]): string | null {
  if (!go || !Object.hasOwn(SHORTCUTS, go) || !lastStadium || !activeSlugs.includes(lastStadium)) return null;
  return `/${lastStadium}${SHORTCUTS[go as Shortcut]}`;
}
