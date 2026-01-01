import { Link, useLocation } from "wouter";
import { Home, Zap, Settings, Radio, Layers } from "lucide-react";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/trigger", icon: Zap, label: "Fact" },
  { href: "/announcements", icon: Radio, label: "Announce" },
  { href: "/overlay-editor", icon: Layers, label: "Overlays" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function BottomNavigation() {
  const [location] = useLocation();

  return (
    <nav className="candy-bottom-nav md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href;
        
        return (
          <Link key={item.href} href={item.href}>
            <button
              className={`candy-bottom-nav-item ${isActive ? "active" : ""}`}
              data-testid={`bottom-nav-${item.label.toLowerCase()}`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </button>
          </Link>
        );
      })}
    </nav>
  );
}
