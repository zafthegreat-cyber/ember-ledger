export type EmberRole = "Free" | "Collector" | "Family" | "Seller" | "Shop" | "Admin" | "Beta";

export type Accent =
  | "hearth"
  | "scout"
  | "vault"
  | "forge"
  | "market"
  | "tidepool"
  | "spark"
  | "assist"
  | "parent"
  | "shop"
  | "admin"
  | "more";

export type NavDestination = "Hearth" | "Scout" | "Vault" | "Market" | "More";

export type ScreenState =
  | "default"
  | "empty"
  | "loading"
  | "error"
  | "restricted"
  | "upgrade"
  | "waitlist"
  | "review"
  | "verified"
  | "disputed"
  | "stale"
  | "parentApproval";

export type FeatureKind =
  | "home"
  | "map"
  | "scan"
  | "review"
  | "vaultGrid"
  | "itemDetail"
  | "trade"
  | "market"
  | "productDetail"
  | "community"
  | "spark"
  | "donation"
  | "assist"
  | "settings"
  | "admin"
  | "onboarding"
  | "state";

export type CardVariantType =
  | "normal"
  | "reverse_holo"
  | "holo"
  | "foil"
  | "etched"
  | "pokeball"
  | "masterball"
  | "stamped"
  | "promo"
  | "full_art"
  | "illustration"
  | "special_illustration"
  | "secret"
  | "graded"
  | "sealed_related"
  | "other";

export type CardCondition =
  | "mint"
  | "near_mint"
  | "light_play"
  | "moderate_play"
  | "heavy_play"
  | "damaged"
  | "sealed";

export type GradingCompany = "PSA" | "BGS" | "CGC" | "SGC" | "Other";

export type CardVariant = {
  id: string;
  masterCardId: string;
  variantType: CardVariantType;
  label: string;
  condition?: CardCondition;
  gradingCompany?: GradingCompany;
  grade?: string;
  ownedCount: number;
  estimatedValue?: number;
  imageUrl?: string;
  notes?: string;
  tags?: string[];
};

export type MasterCard = {
  id: string;
  name: string;
  setName: string;
  setCode?: string;
  cardNumber?: string;
  franchise?: "pokemon" | "tcg" | "other";
  category: "card";
  imageUrl?: string;
  rarity?: string;
  artist?: string;
  ownedTotal: number;
  wanted: boolean;
  completionStatus?: "owned" | "missing" | "partial";
  variants: CardVariant[];
};

export type Stat = {
  label: string;
  value: string;
  detail?: string;
};

export type ActionItem = {
  title: string;
  detail: string;
  meta?: string;
  status?: string;
  accent?: Accent;
  icon?: string;
};

export type ScreenSection = {
  title: string;
  detail?: string;
  variant?: "list" | "compact" | "grid" | "steps" | "queue";
  items: ActionItem[];
};

export type ScreenFeature = {
  kind: FeatureKind;
  title?: string;
  detail?: string;
  badge?: string;
  confidence?: string;
  progressLabel?: string;
  progressValue?: string;
  safety?: string;
  items?: ActionItem[];
};

export type EmberScreen = {
  key: string;
  title: string;
  subtitle: string;
  accent: Accent;
  nav: NavDestination;
  group: string;
  role?: EmberRole;
  state?: ScreenState;
  hero?: {
    eyebrow?: string;
    title: string;
    detail: string;
  };
  stats?: Stat[];
  tabs?: string[];
  activeTab?: string;
  notice?: string;
  primaryAction?: string;
  secondaryActions?: string[];
  feature?: ScreenFeature;
  sections: ScreenSection[];
};

export type Principle = {
  title: string;
  detail: string;
  icon: string;
};

export type RoleGuidance = {
  role: EmberRole;
  title: string;
  detail: string;
  accent: Accent;
};

export type EmberTideMockData = {
  profile: {
    name: string;
    state: string;
    tier: EmberRole;
    sparkPoints: number;
  };
  roles: EmberRole[];
  roleGuidance: RoleGuidance[];
  masterCards: MasterCard[];
  screens: EmberScreen[];
  principles: Principle[];
};
