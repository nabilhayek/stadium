import { centroid } from "@/lib/seatmap/geometry";
import type { SeatMapDoc } from "@/lib/seatmap/schema";

export const PERMISSIONS: readonly { id: string; label: string }[] = [
  { id: "orders.view", label: "See incoming orders" },
  { id: "orders.update", label: "Accept and mark orders ready" },
  { id: "orders.deliver", label: "Mark orders delivered or collected" },
  { id: "orders.refund", label: "Refund and cancel orders" },
  { id: "menu.edit", label: "Edit products and sold out" },
  { id: "seatmap.edit", label: "Edit and publish the seat map" },
  { id: "kitchens.pause", label: "Pause a kitchen" },
  { id: "team.manage", label: "Invite and remove staff" },
  { id: "settings.edit", label: "Change admin settings" },
];

const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.id);

export type StaffRole = {
  id: string;
  label: string;
  description: string;
  /** Shipped with the venue. Admin cannot be removed; the others can. */
  builtin: boolean;
  permissions: string[];
};

/** Admin, Manager, Kitchen and Runner. Pickup is part of Kitchen, not its own role. */
export function defaultRoles(): StaffRole[] {
  return [
    { id: "admin", label: "Admin", description: "Everything, including team, payouts and these settings.", builtin: true, permissions: [...ALL_PERMISSIONS] },
    {
      id: "manager",
      label: "Manager",
      description: "Runs match day: menu, kitchens, refunds and pausing orders.",
      builtin: true,
      permissions: ["orders.view", "orders.update", "orders.deliver", "orders.refund", "menu.edit", "kitchens.pause"],
    },
    {
      id: "kitchen",
      label: "Kitchen",
      description: "Prepares orders and hands pickup over at their kitchens.",
      builtin: true,
      permissions: ["orders.view", "orders.update", "orders.deliver", "menu.edit", "kitchens.pause"],
    },
    {
      id: "runner",
      label: "Runner",
      description: "Collects ready orders and delivers them to seats.",
      builtin: true,
      permissions: ["orders.view", "orders.deliver"],
    },
  ];
}

export type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  /**
   * Own permission set for this account. Null follows the role.
   * Admin accounts always follow the role.
   */
  permissions: string[] | null;
  /** Kitchens this person works in. Empty means all. */
  kitchens: string[];
  status: "active" | "invited" | "disabled";
  lastSeen: string | null;
};

export type Kitchen = {
  id: string;
  name: string;
  /** World position on the seat map, decimetres. */
  x: number;
  y: number;
  open: boolean;
  pickup: boolean;
  delivery: boolean;
  /** Orders in progress before the kitchen counts as full. */
  capacity: number;
  /** Minutes a typical order takes. */
  prepMinutes: number;
  overflow: boolean;
  /** Kitchen that takes orders once this one is full. */
  overflowTo: string | null;
  /** Share of capacity, in percent, at which overflow starts. */
  overflowAt: number;
  autoPause: boolean;
};

export type Edit = (change: (s: AdminSettings) => AdminSettings) => void;

/** Currencies an admin can pick. The venue's current code is always offered too. */
export const CURRENCIES = ["EUR", "SEK", "NOK", "DKK", "GBP", "CHF", "USD"] as const;

export type AdminSettings = {
  currency: string;
  members: Member[];
  roles: StaffRole[];
  kitchens: Kitchen[];
  /** Section id to kitchen id. */
  routes: Record<string, string>;
  ordering: {
    acceptOrders: boolean;
    seatDelivery: boolean;
    deliveryFee: boolean;
    deliveryFeeCents: number;
    freeDeliveryOver: boolean;
    freeDeliveryOverCents: number;
    minimumOrder: boolean;
    minimumOrderCents: number;
    pickup: "all" | "some" | "off";
    serviceFee: boolean;
    serviceFeePercent: number;
    tips: boolean;
    notes: boolean;
    alcoholLimit: boolean;
    alcoholPerOrder: number;
    ageCheck: boolean;
  };
  service: {
    preorder: boolean;
    busyMessage: string;
  };
  payments: {
    card: boolean;
    applePay: boolean;
    googlePay: boolean;
    swish: boolean;
    autoRefundMinutes: number;
  };
  notifications: {
    sound: boolean;
    slowOrderMinutes: number;
    dailyReport: boolean;
    reportEmail: string;
    lowStock: boolean;
  };
};

const KITCHEN_NAMES = ["North kitchen", "South kitchen", "East grill", "West bar"];

/** Kitchens on the map, or four around the edge of the venue when none are drawn yet. */
function kitchensFor(doc: SeatMapDoc): Kitchen[] {
  const base = (id: string, name: string, x: number, y: number, i: number): Kitchen => ({
    id,
    name,
    x,
    y,
    open: true,
    pickup: i !== 1,
    delivery: true,
    capacity: 24,
    prepMinutes: 8,
    overflow: i < 2,
    overflowTo: null,
    overflowAt: 85,
    autoPause: false,
  });
  const drawn = doc.pois.filter((p) => p.kind === "kitchen");
  if (drawn.length) return drawn.map((p, i) => base(p.id, p.label || KITCHEN_NAMES[i % KITCHEN_NAMES.length], p.x, p.y, i));
  const b = mapBounds(doc);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const spots: [number, number][] = [
    [cx, b.minY],
    [cx, b.maxY],
    [b.maxX, cy],
    [b.minX, cy],
  ];
  return spots.map(([x, y], i) => base(`kitchen-${i + 1}`, KITCHEN_NAMES[i], x, y, i));
}

export function mapBounds(doc: SeatMapDoc) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of doc.sections)
    for (const [x, y] of s.points) {
      xs.push(x);
      ys.push(y);
    }
  for (const d of doc.decorations) {
    const r = Math.hypot(d.w, d.h) / 2;
    xs.push(d.x - r, d.x + r);
    ys.push(d.y - r, d.y + r);
  }
  for (const p of doc.pois) {
    xs.push(p.x);
    ys.push(p.y);
  }
  if (!xs.length) return { minX: -500, minY: -350, maxX: 500, maxY: 350 };
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Each section to its nearest kitchen. */
export function nearestRoutes(doc: SeatMapDoc, kitchens: readonly Kitchen[]): Record<string, string> {
  const routes: Record<string, string> = {};
  if (!kitchens.length) return routes;
  for (const s of doc.sections) {
    const [x, y] = centroid(s.points);
    let best = kitchens[0];
    for (const k of kitchens) if (Math.hypot(k.x - x, k.y - y) < Math.hypot(best.x - x, best.y - y)) best = k;
    routes[s.id] = best.id;
  }
  return routes;
}

export function initialSettings(doc: SeatMapDoc, currency = "EUR"): AdminSettings {
  const kitchens = kitchensFor(doc);
  if (kitchens.length > 1) {
    kitchens[0].overflowTo = kitchens[1].id;
    kitchens[1].overflowTo = kitchens[0].id;
  }
  return {
    currency: currency.toUpperCase(),
    members: [],
    roles: defaultRoles(),
    kitchens,
    routes: nearestRoutes(doc, kitchens),
    ordering: {
      acceptOrders: true,
      seatDelivery: true,
      deliveryFee: true,
      deliveryFeeCents: 300,
      freeDeliveryOver: false,
      freeDeliveryOverCents: 3000,
      minimumOrder: true,
      minimumOrderCents: 500,
      pickup: "some",
      serviceFee: false,
      serviceFeePercent: 5,
      tips: true,
      notes: true,
      alcoholLimit: true,
      alcoholPerOrder: 4,
      ageCheck: true,
    },
    service: {
      preorder: true,
      busyMessage: "Kitchens are busy right now. Your order may take a little longer.",
    },
    payments: { card: true, applePay: true, googlePay: true, swish: false, autoRefundMinutes: 20 },
    notifications: { sound: true, slowOrderMinutes: 15, dailyReport: true, reportEmail: "reports@stadium.example", lowStock: true },
  };
}

/** Distinct hues so each kitchen's sections read apart on the map. */
export const KITCHEN_COLORS = ["#3b82f6", "#f97316", "#8b5cf6", "#10b981", "#ec4899", "#eab308"];

export function kitchenColor(kitchens: readonly Kitchen[], id: string | undefined) {
  const i = kitchens.findIndex((k) => k.id === id);
  return i < 0 ? null : KITCHEN_COLORS[i % KITCHEN_COLORS.length];
}
