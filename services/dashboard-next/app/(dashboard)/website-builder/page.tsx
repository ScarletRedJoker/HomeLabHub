"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Eye,
  Code2,
  Save,
  Undo2,
  Redo2,
  Smartphone,
  Tablet,
  Monitor,
  Download,
  Upload,
  Palette,
  Layout,
  Type,
  Image as ImageIcon,
  Box,
  Sparkles,
  RefreshCw,
  Check,
  Plus,
  Trash2,
  Copy,
  Settings,
  Globe,
  FileCode,
  Layers,
  Settings2,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  Loader2,
  ExternalLink,
  Home,
  File,
  MoreVertical,
  Grip,
  ZoomIn,
  ZoomOut,
  Grid3X3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Link,
  LayoutGrid,
  Square,
  CircleDot,
  Mail,
  Navigation,
  Footer,
  PanelLeft,
  PanelRight,
  PanelLeftClose,
  PanelRightClose,
  MessageSquare,
  Wand2,
  Send,
  GripVertical,
  MousePointer2,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { toast } from "sonner";

const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((mod) => mod.default),
  { ssr: false }
);

interface WebsiteProject {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  thumbnail: string | null;
  domain: string | null;
  settings: Record<string, unknown> | null;
  globalCss: string | null;
  globalJs: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WebsitePage {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  title: string | null;
  description: string | null;
  isHomepage: boolean;
  components: ComponentInstance[];
  pageCss: string | null;
  pageJs: string | null;
  sortOrder: number;
}

interface ComponentInstance {
  id: string;
  type: string;
  category: string;
  html: string;
  css?: string;
  props: Record<string, unknown>;
  position: { x: number; y: number };
  size: { width: string; height: string };
}

interface ComponentDefinition {
  id: string;
  name: string;
  category: string;
  type: string;
  icon: React.ReactNode;
  defaultHtml: string;
  defaultCss?: string;
  defaultProps: Record<string, unknown>;
}

interface DiscoveredSite {
  id: string;
  name: string;
  domain: string;
  type: "static" | "dynamic" | "container";
  source: "linode" | "home" | "cloudflare" | "local";
  serverName?: string;
  containerName?: string;
  path?: string;
  status: "online" | "offline" | "unknown";
  lastChecked?: string;
  deploymentTarget?: {
    host: string;
    user: string;
    path: string;
    port?: number;
  };
}

interface DeploymentHistory {
  id: string;
  projectId: string;
  status: "pending" | "deploying" | "success" | "failed" | "rolled_back";
  startedAt: string;
  completedAt?: string;
  logs: string[];
  version: number;
}

interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  action?: string;
}

const COMPONENT_LIBRARY: ComponentDefinition[] = [
  {
    id: "navbar-1",
    name: "Navigation Bar",
    category: "headers",
    type: "navbar",
    icon: <Navigation className="h-4 w-4" />,
    defaultHtml: `<nav class="navbar">
  <div class="logo">Brand</div>
  <ul class="nav-links">
    <li><a href="#home">Home</a></li>
    <li><a href="#about">About</a></li>
    <li><a href="#services">Services</a></li>
    <li><a href="#contact">Contact</a></li>
  </ul>
</nav>`,
    defaultCss: `.navbar { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: #1a1a2e; color: white; }
.nav-links { display: flex; list-style: none; gap: 2rem; }
.nav-links a { color: white; text-decoration: none; }
.logo { font-size: 1.5rem; font-weight: bold; }`,
    defaultProps: { backgroundColor: "#1a1a2e", textColor: "#ffffff" },
  },
  {
    id: "hero-1",
    name: "Hero Section",
    category: "headers",
    type: "hero",
    icon: <Layout className="h-4 w-4" />,
    defaultHtml: `<section class="hero">
  <div class="hero-content">
    <h1>Welcome to Our Website</h1>
    <p>Create amazing experiences with our platform</p>
    <button class="cta-btn">Get Started</button>
  </div>
</section>`,
    defaultCss: `.hero { min-height: 80vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-align: center; }
.hero h1 { font-size: 3.5rem; margin-bottom: 1rem; }
.hero p { font-size: 1.3rem; opacity: 0.9; margin-bottom: 2rem; }
.cta-btn { background: white; color: #667eea; border: none; padding: 1rem 2.5rem; font-size: 1.1rem; border-radius: 50px; cursor: pointer; }`,
    defaultProps: { title: "Welcome", subtitle: "Create amazing experiences" },
  },
  {
    id: "text-1",
    name: "Text Block",
    category: "content",
    type: "text",
    icon: <Type className="h-4 w-4" />,
    defaultHtml: `<div class="text-block">
  <h2>Section Title</h2>
  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
</div>`,
    defaultCss: `.text-block { padding: 3rem 2rem; max-width: 800px; margin: 0 auto; }
.text-block h2 { font-size: 2rem; margin-bottom: 1rem; color: #1a1a2e; }
.text-block p { color: #666; line-height: 1.8; }`,
    defaultProps: {},
  },
  {
    id: "image-1",
    name: "Image Block",
    category: "content",
    type: "image",
    icon: <ImageIcon className="h-4 w-4" />,
    defaultHtml: `<figure class="image-block">
  <img src="https://via.placeholder.com/800x400" alt="Placeholder image" />
  <figcaption>Image caption goes here</figcaption>
</figure>`,
    defaultCss: `.image-block { padding: 2rem; text-align: center; }
.image-block img { max-width: 100%; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.image-block figcaption { margin-top: 1rem; color: #666; font-style: italic; }`,
    defaultProps: { src: "", alt: "Image" },
  },
  {
    id: "cards-1",
    name: "Card Grid",
    category: "content",
    type: "cards",
    icon: <LayoutGrid className="h-4 w-4" />,
    defaultHtml: `<div class="card-grid">
  <div class="card">
    <div class="card-icon">⚡</div>
    <h3>Feature One</h3>
    <p>Description of the first feature</p>
  </div>
  <div class="card">
    <div class="card-icon">🎨</div>
    <h3>Feature Two</h3>
    <p>Description of the second feature</p>
  </div>
  <div class="card">
    <div class="card-icon">🚀</div>
    <h3>Feature Three</h3>
    <p>Description of the third feature</p>
  </div>
</div>`,
    defaultCss: `.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; padding: 3rem 2rem; }
.card { background: white; padding: 2rem; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; transition: transform 0.3s; }
.card:hover { transform: translateY(-5px); }
.card-icon { font-size: 3rem; margin-bottom: 1rem; }
.card h3 { margin-bottom: 0.5rem; color: #667eea; }`,
    defaultProps: {},
  },
  {
    id: "gallery-1",
    name: "Image Gallery",
    category: "content",
    type: "gallery",
    icon: <Grid3X3 className="h-4 w-4" />,
    defaultHtml: `<div class="gallery">
  <img src="https://via.placeholder.com/300x300" alt="Gallery 1" />
  <img src="https://via.placeholder.com/300x300" alt="Gallery 2" />
  <img src="https://via.placeholder.com/300x300" alt="Gallery 3" />
  <img src="https://via.placeholder.com/300x300" alt="Gallery 4" />
  <img src="https://via.placeholder.com/300x300" alt="Gallery 5" />
  <img src="https://via.placeholder.com/300x300" alt="Gallery 6" />
</div>`,
    defaultCss: `.gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; padding: 2rem; }
.gallery img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 8px; transition: transform 0.3s; cursor: pointer; }
.gallery img:hover { transform: scale(1.05); }`,
    defaultProps: {},
  },
  {
    id: "contact-1",
    name: "Contact Form",
    category: "forms",
    type: "contact",
    icon: <Mail className="h-4 w-4" />,
    defaultHtml: `<form class="contact-form">
  <h2>Contact Us</h2>
  <div class="form-group">
    <input type="text" placeholder="Your Name" required />
  </div>
  <div class="form-group">
    <input type="email" placeholder="Your Email" required />
  </div>
  <div class="form-group">
    <textarea placeholder="Your Message" rows="5" required></textarea>
  </div>
  <button type="submit">Send Message</button>
</form>`,
    defaultCss: `.contact-form { max-width: 500px; margin: 0 auto; padding: 3rem 2rem; }
.contact-form h2 { text-align: center; margin-bottom: 2rem; }
.form-group { margin-bottom: 1rem; }
.contact-form input, .contact-form textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; }
.contact-form button { width: 100%; padding: 1rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; }`,
    defaultProps: {},
  },
  {
    id: "newsletter-1",
    name: "Newsletter Signup",
    category: "forms",
    type: "newsletter",
    icon: <Mail className="h-4 w-4" />,
    defaultHtml: `<div class="newsletter">
  <h3>Subscribe to Our Newsletter</h3>
  <p>Get the latest updates delivered to your inbox</p>
  <form class="newsletter-form">
    <input type="email" placeholder="Enter your email" />
    <button type="submit">Subscribe</button>
  </form>
</div>`,
    defaultCss: `.newsletter { background: #f8f9fa; padding: 3rem 2rem; text-align: center; }
.newsletter h3 { margin-bottom: 0.5rem; }
.newsletter p { color: #666; margin-bottom: 1.5rem; }
.newsletter-form { display: flex; gap: 0.5rem; max-width: 400px; margin: 0 auto; }
.newsletter-form input { flex: 1; padding: 0.75rem; border: 1px solid #ddd; border-radius: 8px; }
.newsletter-form button { padding: 0.75rem 1.5rem; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; }`,
    defaultProps: {},
  },
  {
    id: "footer-1",
    name: "Simple Footer",
    category: "footers",
    type: "footer",
    icon: <Footer className="h-4 w-4" />,
    defaultHtml: `<footer class="footer-simple">
  <p>&copy; 2025 Your Company. All rights reserved.</p>
</footer>`,
    defaultCss: `.footer-simple { background: #1a1a2e; color: white; text-align: center; padding: 2rem; }`,
    defaultProps: {},
  },
  {
    id: "footer-2",
    name: "Detailed Footer",
    category: "footers",
    type: "footer-detailed",
    icon: <Footer className="h-4 w-4" />,
    defaultHtml: `<footer class="footer-detailed">
  <div class="footer-grid">
    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><a href="#">About Us</a></li>
        <li><a href="#">Careers</a></li>
        <li><a href="#">Blog</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Support</h4>
      <ul>
        <li><a href="#">Help Center</a></li>
        <li><a href="#">Contact</a></li>
        <li><a href="#">FAQ</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4>Legal</h4>
      <ul>
        <li><a href="#">Privacy</a></li>
        <li><a href="#">Terms</a></li>
        <li><a href="#">Cookies</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <p>&copy; 2025 Your Company. All rights reserved.</p>
  </div>
</footer>`,
    defaultCss: `.footer-detailed { background: #1a1a2e; color: white; padding: 3rem 2rem 1rem; }
.footer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
.footer-col h4 { margin-bottom: 1rem; }
.footer-col ul { list-style: none; }
.footer-col a { color: #aaa; text-decoration: none; display: block; padding: 0.3rem 0; }
.footer-col a:hover { color: white; }
.footer-bottom { border-top: 1px solid #333; margin-top: 2rem; padding-top: 1rem; text-align: center; color: #666; }`,
    defaultProps: {},
  },
  {
    id: "section-1",
    name: "Content Section",
    category: "layout",
    type: "section",
    icon: <Square className="h-4 w-4" />,
    defaultHtml: `<section class="content-section">
  <div class="container">
    <h2>Section Title</h2>
    <p>Add your content here</p>
  </div>
</section>`,
    defaultCss: `.content-section { padding: 4rem 2rem; }
.content-section .container { max-width: 1200px; margin: 0 auto; }
.content-section h2 { font-size: 2.5rem; margin-bottom: 1rem; }`,
    defaultProps: {},
  },
  {
    id: "columns-1",
    name: "Two Columns",
    category: "layout",
    type: "columns",
    icon: <Layers className="h-4 w-4" />,
    defaultHtml: `<div class="two-columns">
  <div class="column">
    <h3>Left Column</h3>
    <p>Content for the left column goes here.</p>
  </div>
  <div class="column">
    <h3>Right Column</h3>
    <p>Content for the right column goes here.</p>
  </div>
</div>`,
    defaultCss: `.two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; padding: 3rem 2rem; }
.column { padding: 1rem; }
@media (max-width: 768px) { .two-columns { grid-template-columns: 1fr; } }`,
    defaultProps: {},
  },
  {
    id: "divider-1",
    name: "Divider",
    category: "layout",
    type: "divider",
    icon: <Separator className="h-4 w-4" />,
    defaultHtml: `<hr class="divider" />`,
    defaultCss: `.divider { border: none; height: 1px; background: linear-gradient(to right, transparent, #ddd, transparent); margin: 2rem 0; }`,
    defaultProps: {},
  },
  {
    id: "hero-2",
    name: "Hero with Image",
    category: "headers",
    type: "hero-image",
    icon: <Layout className="h-4 w-4" />,
    defaultHtml: `<section class="hero-image">
  <div class="hero-content">
    <div class="hero-text">
      <h1>Build Something Amazing</h1>
      <p>Transform your ideas into reality with our powerful platform</p>
      <div class="hero-buttons">
        <button class="btn-primary">Get Started</button>
        <button class="btn-secondary">Learn More</button>
      </div>
    </div>
    <div class="hero-img">
      <img src="https://via.placeholder.com/500x400" alt="Hero image" />
    </div>
  </div>
</section>`,
    defaultCss: `.hero-image { padding: 4rem 2rem; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); }
.hero-image .hero-content { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; max-width: 1200px; margin: 0 auto; align-items: center; }
.hero-image .hero-text { color: white; }
.hero-image h1 { font-size: 3rem; margin-bottom: 1rem; }
.hero-image p { font-size: 1.2rem; opacity: 0.9; margin-bottom: 2rem; }
.hero-buttons { display: flex; gap: 1rem; }
.btn-primary { background: #6366f1; color: white; border: none; padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer; }
.btn-secondary { background: transparent; color: white; border: 1px solid white; padding: 0.75rem 2rem; border-radius: 8px; cursor: pointer; }
.hero-img img { width: 100%; border-radius: 12px; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
@media (max-width: 768px) { .hero-image .hero-content { grid-template-columns: 1fr; } }`,
    defaultProps: { title: "Build Something Amazing" },
  },
  {
    id: "hero-3",
    name: "Hero Centered",
    category: "headers",
    type: "hero-centered",
    icon: <Layout className="h-4 w-4" />,
    defaultHtml: `<section class="hero-centered">
  <div class="hero-badge">New Feature Available</div>
  <h1>Supercharge Your Workflow</h1>
  <p>The all-in-one platform that helps you build, deploy, and scale your projects faster than ever before.</p>
  <div class="hero-actions">
    <button class="cta-main">Start Free Trial</button>
    <button class="cta-watch"><span>▶</span> Watch Demo</button>
  </div>
  <div class="hero-stats">
    <div class="stat"><strong>10K+</strong><span>Users</span></div>
    <div class="stat"><strong>99.9%</strong><span>Uptime</span></div>
    <div class="stat"><strong>24/7</strong><span>Support</span></div>
  </div>
</section>`,
    defaultCss: `.hero-centered { min-height: 90vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 4rem 2rem; background: radial-gradient(ellipse at top, #1e293b 0%, #0f172a 100%); color: white; }
.hero-badge { background: rgba(99, 102, 241, 0.2); color: #a5b4fc; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.875rem; margin-bottom: 1.5rem; }
.hero-centered h1 { font-size: 4rem; margin-bottom: 1.5rem; max-width: 800px; background: linear-gradient(to right, #fff, #a5b4fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero-centered > p { font-size: 1.25rem; opacity: 0.8; max-width: 600px; margin-bottom: 2.5rem; }
.hero-actions { display: flex; gap: 1rem; margin-bottom: 3rem; }
.cta-main { background: #6366f1; color: white; border: none; padding: 1rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }
.cta-watch { background: transparent; color: white; border: 1px solid rgba(255,255,255,0.3); padding: 1rem 2rem; border-radius: 8px; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.hero-stats { display: flex; gap: 4rem; }
.stat { display: flex; flex-direction: column; }
.stat strong { font-size: 2rem; }
.stat span { opacity: 0.7; font-size: 0.875rem; }`,
    defaultProps: {},
  },
  {
    id: "testimonials-1",
    name: "Testimonials Grid",
    category: "content",
    type: "testimonials",
    icon: <MessageSquare className="h-4 w-4" />,
    defaultHtml: `<section class="testimonials">
  <h2>What Our Customers Say</h2>
  <div class="testimonials-grid">
    <div class="testimonial">
      <p>"This product has completely transformed how we work. Couldn't imagine going back."</p>
      <div class="author">
        <div class="avatar">JD</div>
        <div class="info">
          <strong>John Doe</strong>
          <span>CEO, TechCorp</span>
        </div>
      </div>
    </div>
    <div class="testimonial">
      <p>"The best tool we've ever used. Our productivity increased by 300%."</p>
      <div class="author">
        <div class="avatar">SA</div>
        <div class="info">
          <strong>Sarah Anderson</strong>
          <span>CTO, StartupXYZ</span>
        </div>
      </div>
    </div>
    <div class="testimonial">
      <p>"Outstanding support and incredible features. Highly recommended!"</p>
      <div class="author">
        <div class="avatar">MJ</div>
        <div class="info">
          <strong>Mike Johnson</strong>
          <span>Founder, DevAgency</span>
        </div>
      </div>
    </div>
  </div>
</section>`,
    defaultCss: `.testimonials { padding: 5rem 2rem; background: #f8fafc; }
.testimonials h2 { text-align: center; font-size: 2.5rem; margin-bottom: 3rem; color: #1e293b; }
.testimonials-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
.testimonial { background: white; padding: 2rem; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
.testimonial p { font-size: 1.1rem; color: #475569; margin-bottom: 1.5rem; line-height: 1.7; font-style: italic; }
.author { display: flex; align-items: center; gap: 1rem; }
.avatar { width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
.author .info { display: flex; flex-direction: column; }
.author strong { color: #1e293b; }
.author span { font-size: 0.875rem; color: #64748b; }`,
    defaultProps: {},
  },
  {
    id: "testimonials-2",
    name: "Testimonial Carousel",
    category: "content",
    type: "testimonial-single",
    icon: <MessageSquare className="h-4 w-4" />,
    defaultHtml: `<section class="testimonial-single">
  <div class="quote-icon">❝</div>
  <blockquote>
    "This platform has been a game-changer for our business. The intuitive interface and powerful features have helped us achieve results we never thought possible."
  </blockquote>
  <div class="testimonial-author">
    <img src="https://via.placeholder.com/80x80" alt="Author" class="author-img" />
    <div>
      <strong>Emily Parker</strong>
      <span>VP of Engineering, InnovateCo</span>
    </div>
  </div>
</section>`,
    defaultCss: `.testimonial-single { padding: 5rem 2rem; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
.quote-icon { font-size: 5rem; opacity: 0.3; line-height: 1; }
.testimonial-single blockquote { font-size: 1.5rem; max-width: 800px; margin: 0 auto 2rem; line-height: 1.8; font-style: italic; }
.testimonial-author { display: flex; align-items: center; justify-content: center; gap: 1rem; }
.author-img { width: 64px; height: 64px; border-radius: 50%; border: 3px solid white; }
.testimonial-author strong { display: block; }
.testimonial-author span { opacity: 0.9; font-size: 0.875rem; }`,
    defaultProps: {},
  },
  {
    id: "features-1",
    name: "Features Grid",
    category: "content",
    type: "features",
    icon: <LayoutGrid className="h-4 w-4" />,
    defaultHtml: `<section class="features-section">
  <div class="features-header">
    <span class="features-badge">Features</span>
    <h2>Everything You Need</h2>
    <p>Powerful tools to help you build and grow your business</p>
  </div>
  <div class="features-grid">
    <div class="feature">
      <div class="feature-icon">⚡</div>
      <h3>Lightning Fast</h3>
      <p>Optimized performance that keeps your users engaged and happy.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">🔒</div>
      <h3>Secure by Default</h3>
      <p>Enterprise-grade security to protect your data and privacy.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">🎨</div>
      <h3>Fully Customizable</h3>
      <p>Tailor every aspect to match your brand and requirements.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">📊</div>
      <h3>Analytics Built-in</h3>
      <p>Track performance and make data-driven decisions.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">🔌</div>
      <h3>Easy Integrations</h3>
      <p>Connect with your favorite tools and services seamlessly.</p>
    </div>
    <div class="feature">
      <div class="feature-icon">💬</div>
      <h3>24/7 Support</h3>
      <p>Our team is always here to help you succeed.</p>
    </div>
  </div>
</section>`,
    defaultCss: `.features-section { padding: 5rem 2rem; }
.features-header { text-align: center; margin-bottom: 4rem; }
.features-badge { background: #eef2ff; color: #6366f1; padding: 0.5rem 1rem; border-radius: 20px; font-size: 0.875rem; font-weight: 500; }
.features-header h2 { font-size: 2.5rem; margin: 1rem 0 0.5rem; color: #1e293b; }
.features-header p { color: #64748b; font-size: 1.1rem; }
.features-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; max-width: 1200px; margin: 0 auto; }
.feature { padding: 2rem; border-radius: 16px; border: 1px solid #e2e8f0; transition: all 0.3s; }
.feature:hover { border-color: #6366f1; box-shadow: 0 10px 30px rgba(99,102,241,0.1); }
.feature-icon { font-size: 2.5rem; margin-bottom: 1rem; }
.feature h3 { font-size: 1.25rem; color: #1e293b; margin-bottom: 0.5rem; }
.feature p { color: #64748b; line-height: 1.6; }`,
    defaultProps: {},
  },
  {
    id: "pricing-1",
    name: "Pricing Table",
    category: "content",
    type: "pricing",
    icon: <LayoutGrid className="h-4 w-4" />,
    defaultHtml: `<section class="pricing">
  <h2>Simple, Transparent Pricing</h2>
  <p class="pricing-subtitle">Choose the plan that's right for you</p>
  <div class="pricing-grid">
    <div class="price-card">
      <h3>Starter</h3>
      <div class="price">$9<span>/month</span></div>
      <ul>
        <li>✓ Up to 3 projects</li>
        <li>✓ Basic analytics</li>
        <li>✓ Email support</li>
      </ul>
      <button>Get Started</button>
    </div>
    <div class="price-card featured">
      <div class="popular-badge">Most Popular</div>
      <h3>Pro</h3>
      <div class="price">$29<span>/month</span></div>
      <ul>
        <li>✓ Unlimited projects</li>
        <li>✓ Advanced analytics</li>
        <li>✓ Priority support</li>
        <li>✓ Custom domains</li>
      </ul>
      <button>Get Started</button>
    </div>
    <div class="price-card">
      <h3>Enterprise</h3>
      <div class="price">$99<span>/month</span></div>
      <ul>
        <li>✓ Everything in Pro</li>
        <li>✓ SSO & SAML</li>
        <li>✓ Dedicated support</li>
        <li>✓ Custom contracts</li>
      </ul>
      <button>Contact Sales</button>
    </div>
  </div>
</section>`,
    defaultCss: `.pricing { padding: 5rem 2rem; background: #f8fafc; text-align: center; }
.pricing h2 { font-size: 2.5rem; margin-bottom: 0.5rem; color: #1e293b; }
.pricing-subtitle { color: #64748b; margin-bottom: 3rem; }
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; max-width: 1000px; margin: 0 auto; }
.price-card { background: white; padding: 2rem; border-radius: 16px; border: 1px solid #e2e8f0; text-align: left; position: relative; }
.price-card.featured { border: 2px solid #6366f1; transform: scale(1.05); }
.popular-badge { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: #6366f1; color: white; padding: 0.25rem 1rem; border-radius: 20px; font-size: 0.75rem; }
.price-card h3 { font-size: 1.25rem; color: #1e293b; margin-bottom: 1rem; }
.price { font-size: 3rem; font-weight: bold; color: #1e293b; margin-bottom: 1.5rem; }
.price span { font-size: 1rem; font-weight: normal; color: #64748b; }
.price-card ul { list-style: none; padding: 0; margin-bottom: 2rem; }
.price-card li { padding: 0.5rem 0; color: #475569; }
.price-card button { width: 100%; padding: 0.75rem; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }`,
    defaultProps: {},
  },
  {
    id: "cta-1",
    name: "Call to Action",
    category: "content",
    type: "cta",
    icon: <Rocket className="h-4 w-4" />,
    defaultHtml: `<section class="cta-section">
  <h2>Ready to Get Started?</h2>
  <p>Join thousands of satisfied customers and transform your business today.</p>
  <div class="cta-buttons">
    <button class="cta-primary">Start Free Trial</button>
    <button class="cta-secondary">Schedule Demo</button>
  </div>
</section>`,
    defaultCss: `.cta-section { padding: 5rem 2rem; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); text-align: center; color: white; }
.cta-section h2 { font-size: 2.5rem; margin-bottom: 1rem; }
.cta-section p { font-size: 1.2rem; opacity: 0.9; margin-bottom: 2rem; max-width: 600px; margin-left: auto; margin-right: auto; }
.cta-buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.cta-primary { background: white; color: #6366f1; border: none; padding: 1rem 2rem; border-radius: 8px; font-size: 1rem; font-weight: 500; cursor: pointer; }
.cta-secondary { background: transparent; color: white; border: 2px solid white; padding: 1rem 2rem; border-radius: 8px; font-size: 1rem; cursor: pointer; }`,
    defaultProps: {},
  },
  {
    id: "custom-html-1",
    name: "Custom HTML/CSS",
    category: "layout",
    type: "custom",
    icon: <Code2 className="h-4 w-4" />,
    defaultHtml: `<div class="custom-block">
  <!-- Add your custom HTML here -->
  <p>This is a custom HTML/CSS block. Edit the code to create anything you want!</p>
</div>`,
    defaultCss: `.custom-block { padding: 2rem; background: #f0f9ff; border: 2px dashed #0ea5e9; border-radius: 8px; text-align: center; }
.custom-block p { color: #0369a1; }`,
    defaultProps: { isCustom: true },
  },
  {
    id: "spacer-1",
    name: "Spacer",
    category: "layout",
    type: "spacer",
    icon: <Box className="h-4 w-4" />,
    defaultHtml: `<div class="spacer"></div>`,
    defaultCss: `.spacer { height: 80px; }`,
    defaultProps: { height: 80 },
  },
  {
    id: "video-1",
    name: "Video Embed",
    category: "content",
    type: "video",
    icon: <Box className="h-4 w-4" />,
    defaultHtml: `<div class="video-container">
  <div class="video-wrapper">
    <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
  </div>
  <p class="video-caption">Watch our product demo</p>
</div>`,
    defaultCss: `.video-container { padding: 3rem 2rem; max-width: 900px; margin: 0 auto; }
.video-wrapper { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
.video-wrapper iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.video-caption { text-align: center; margin-top: 1rem; color: #64748b; }`,
    defaultProps: { videoUrl: "" },
  },
];

const CATEGORIES = [
  { id: "headers", name: "Headers", icon: <Navigation className="h-4 w-4" /> },
  { id: "content", name: "Content", icon: <Type className="h-4 w-4" /> },
  { id: "forms", name: "Forms", icon: <Mail className="h-4 w-4" /> },
  { id: "footers", name: "Footers", icon: <Footer className="h-4 w-4" /> },
  { id: "layout", name: "Layout", icon: <Layers className="h-4 w-4" /> },
];

const PROJECT_TYPES = [
  { value: "all", label: "All Types" },
  { value: "portfolio", label: "Portfolio" },
  { value: "landing", label: "Landing Page" },
  { value: "blog", label: "Blog" },
  { value: "ecommerce", label: "E-Commerce" },
  { value: "custom", label: "Custom" },
];

const ZOOM_LEVELS = [50, 75, 100, 125, 150];

type ViewportSize = "desktop" | "tablet" | "mobile";

export default function WebsiteBuilderPage() {
  const [projects, setProjects] = useState<WebsiteProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<WebsiteProject | null>(null);
  const [pages, setPages] = useState<WebsitePage[]>([]);
  const [selectedPage, setSelectedPage] = useState<WebsitePage | null>(null);
  const [selectedComponent, setSelectedComponent] = useState<ComponentInstance | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  
  const [viewport, setViewport] = useState<ViewportSize>("desktop");
  const [zoom, setZoom] = useState(100);
  const [showGrid, setShowGrid] = useState(false);
  const [showCodeView, setShowCodeView] = useState(false);
  
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<"components" | "properties" | "pages" | "deploy" | "ai">("components");
  
  const [projectFilter, setProjectFilter] = useState("all");
  const [projectSearch, setProjectSearch] = useState("");
  const [componentSearch, setComponentSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  const [showNewProjectDialog, setShowNewProjectDialog] = useState(false);
  const [showNewPageDialog, setShowNewPageDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState("custom");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  
  const [newPageName, setNewPageName] = useState("");
  const [newPageSlug, setNewPageSlug] = useState("");
  
  const [history, setHistory] = useState<ComponentInstance[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [draggedComponent, setDraggedComponent] = useState<ComponentDefinition | null>(null);
  
  const [discoveredSites, setDiscoveredSites] = useState<DiscoveredSite[]>([]);
  const [discoveringInProgress, setDiscoveringInProgress] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [selectedSiteToImport, setSelectedSiteToImport] = useState<DiscoveredSite | null>(null);
  const [importing, setImporting] = useState(false);
  
  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [deploymentHistory, setDeploymentHistory] = useState<DeploymentHistory[]>([]);
  const [deploying, setDeploying] = useState(false);
  const [deployTarget, setDeployTarget] = useState<string>("local");
  
  const [showAiChatPanel, setShowAiChatPanel] = useState(false);
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([]);
  const [aiChatInput, setAiChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [seoScore, setSeoScore] = useState<{score: number; issues: string[]; recommendations: string[]} | null>(null);
  const [accessibilityScore, setAccessibilityScore] = useState<{score: number; issues: string[]; recommendations: string[]} | null>(null);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const aiChatScrollRef = useRef<HTMLDivElement>(null);

  const viewportWidths = {
    desktop: "100%",
    tablet: "768px",
    mobile: "375px",
  };

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/websites");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchProjectDetails = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/websites/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedProject(data.project);
        setPages(data.pages || []);
        const homepage = data.pages?.find((p: WebsitePage) => p.isHomepage) || data.pages?.[0];
        if (homepage) {
          setSelectedPage(homepage);
          pushToHistory(homepage.components || []);
        }
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
      toast.error("Failed to load project");
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const discoverSites = useCallback(async () => {
    setDiscoveringInProgress(true);
    try {
      const res = await fetch("/api/websites/discover?health=true");
      if (res.ok) {
        const data = await res.json();
        setDiscoveredSites(data.sites || []);
      }
    } catch (error) {
      console.error("Failed to discover sites:", error);
      toast.error("Failed to discover sites");
    } finally {
      setDiscoveringInProgress(false);
    }
  }, []);

  const handleImportSite = async (site: DiscoveredSite) => {
    setImporting(true);
    try {
      const res = await fetch("/api/websites/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "discovered",
          domain: site.domain,
          path: site.path,
          name: site.name,
          deploymentTarget: site.deploymentTarget,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.project) {
          setProjects([data.project, ...projects]);
          await fetchProjectDetails(data.project.id);
          toast.success(`Imported ${site.name} successfully!`);
        } else if (data.preview) {
          toast.info("Import preview generated. Database connection required for full import.");
        }
        setShowImportDialog(false);
        setSelectedSiteToImport(null);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to import site");
      }
    } catch (error) {
      toast.error("Failed to import site");
    } finally {
      setImporting(false);
    }
  };

  const handleDeploy = async () => {
    if (!selectedProject) return;

    setDeploying(true);
    try {
      const settings = selectedProject.settings as Record<string, unknown> || {};
      const target = deployTarget === "local" ? {
        type: "local",
        host: "localhost",
        path: `static-site/${selectedProject.domain || selectedProject.name.toLowerCase().replace(/\s+/g, "-")}`,
        method: "local",
      } : settings.deploymentTarget;

      const res = await fetch(`/api/websites/${selectedProject.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.deployment) {
          setDeploymentHistory(prev => [data.deployment, ...prev]);
        }
        toast.success("Deployment successful!");
      } else {
        const error = await res.json();
        toast.error(error.error || "Deployment failed");
      }
    } catch (error) {
      toast.error("Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleAiChat = async () => {
    if (!aiChatInput.trim() || !selectedProject || !selectedPage) return;

    const userMessage: AIMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: aiChatInput,
      timestamp: new Date().toISOString(),
    };
    setAiMessages(prev => [...prev, userMessage]);
    setAiChatInput("");
    setAiChatLoading(true);

    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiChatInput,
          pageId: selectedPage.id,
          action: "edit",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let responseContent = "";
        
        if (data.changes && data.changes.length > 0) {
          responseContent = `I've made the following changes:\n${data.changes.map((c: { description: string }) => `- ${c.description}`).join("\n")}`;
          
          for (const change of data.changes) {
            if (change.type === "html" && change.componentId) {
              const updatedComponents = selectedPage.components.map(c =>
                c.id === change.componentId ? { ...c, html: change.after } : c
              );
              setSelectedPage({ ...selectedPage, components: updatedComponents });
            }
          }
        } else if (data.suggestions) {
          responseContent = `Here are my suggestions:\n${data.suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join("\n")}`;
        } else {
          responseContent = "I've processed your request. Check the preview for changes.";
        }

        const assistantMessage: AIMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: responseContent,
          timestamp: new Date().toISOString(),
          action: data.changes ? "edit" : undefined,
        };
        setAiMessages(prev => [...prev, assistantMessage]);
      } else {
        const error = await res.json();
        const errorMessage: AIMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: `Sorry, I encountered an error: ${error.error || "Unknown error"}`,
          timestamp: new Date().toISOString(),
        };
        setAiMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: AIMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        content: "Sorry, I couldn't process your request. Please try again.",
        timestamp: new Date().toISOString(),
      };
      setAiMessages(prev => [...prev, errorMessage]);
    } finally {
      setAiChatLoading(false);
    }
  };

  const handleAnalyzeSEO = async () => {
    if (!selectedProject || !selectedPage) return;

    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "seo",
          pageId: selectedPage.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.analysis?.seo) {
          setSeoScore(data.analysis.seo);
          toast.success(`SEO Score: ${data.analysis.seo.score}/100`);
        }
      }
    } catch (error) {
      toast.error("Failed to analyze SEO");
    }
  };

  const handleAnalyzeAccessibility = async () => {
    if (!selectedProject || !selectedPage) return;

    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accessibility",
          pageId: selectedPage.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.analysis?.accessibility) {
          setAccessibilityScore(data.analysis.accessibility);
          toast.success(`Accessibility Score: ${data.analysis.accessibility.score}/100`);
        }
      }
    } catch (error) {
      toast.error("Failed to analyze accessibility");
    }
  };

  useEffect(() => {
    if (aiChatScrollRef.current) {
      aiChatScrollRef.current.scrollTop = aiChatScrollRef.current.scrollHeight;
    }
  }, [aiMessages]);

  const pushToHistory = (components: ComponentInstance[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...components]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      const prevComponents = history[historyIndex - 1];
      if (selectedPage) {
        setSelectedPage({ ...selectedPage, components: prevComponents });
      }
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      const nextComponents = history[historyIndex + 1];
      if (selectedPage) {
        setSelectedPage({ ...selectedPage, components: nextComponents });
      }
    }
  };

  const generatePreview = useCallback(() => {
    if (!selectedPage || !selectedProject) return "";
    
    const globalCss = selectedProject.globalCss || "";
    const pageCss = selectedPage.pageCss || "";
    const componentsHtml = selectedPage.components?.map(c => c.html).join("\n") || "";
    const componentsCss = selectedPage.components?.map(c => c.css || "").join("\n") || "";
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${selectedPage.title || selectedProject.name}</title>
  <style>
    ${globalCss}
    ${pageCss}
    ${componentsCss}
    
    .component-wrapper { position: relative; transition: outline 0.2s; }
    .component-wrapper:hover { outline: 2px dashed #667eea; }
    .component-wrapper.selected { outline: 2px solid #667eea; }
  </style>
</head>
<body>
  ${componentsHtml}
</body>
</html>`;
  }, [selectedPage, selectedProject]);

  useEffect(() => {
    if (iframeRef.current && selectedPage) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write(generatePreview());
        doc.close();
      }
    }
  }, [generatePreview, selectedPage]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      toast.error("Project name is required");
      return;
    }

    try {
      const res = await fetch("/api/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProjectName,
          type: newProjectType,
          description: newProjectDescription,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setProjects([data.project, ...projects]);
        setSelectedProject(data.project);
        setPages(data.pages || []);
        if (data.pages?.[0]) {
          setSelectedPage(data.pages[0]);
        }
        setShowNewProjectDialog(false);
        setNewProjectName("");
        setNewProjectDescription("");
        toast.success("Project created!");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create project");
      }
    } catch (error) {
      toast.error("Failed to create project");
    }
  };

  const handleCreatePage = async () => {
    if (!selectedProject || !newPageName.trim()) {
      toast.error("Page name is required");
      return;
    }

    const slug = newPageSlug || `/${newPageName.toLowerCase().replace(/\s+/g, "-")}`;

    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/pages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPageName,
          slug,
          title: newPageName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPages([...pages, data.page]);
        setSelectedPage(data.page);
        setShowNewPageDialog(false);
        setNewPageName("");
        setNewPageSlug("");
        toast.success("Page created!");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create page");
      }
    } catch (error) {
      toast.error("Failed to create page");
    }
  };

  const handleSave = async () => {
    if (!selectedProject || !selectedPage) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/pages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageId: selectedPage.id,
          components: selectedPage.components,
          pageCss: selectedPage.pageCss,
          pageJs: selectedPage.pageJs,
        }),
      });

      if (res.ok) {
        toast.success("Saved!");
      } else {
        toast.error("Failed to save");
      }
    } catch (error) {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!selectedProject) return;

    setPublishing(true);
    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "production" }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Published to ${data.publishedUrl}`);
        setSelectedProject({ ...selectedProject, status: "published" });
      } else {
        toast.error("Failed to publish");
      }
    } catch (error) {
      toast.error("Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  const handleExportHtml = () => {
    if (!selectedProject || !selectedPage) {
      toast.error("No page to export");
      return;
    }

    const globalCss = selectedProject.globalCss || "";
    const pageCss = selectedPage.pageCss || "";
    const componentsHtml = selectedPage.components?.map(c => c.html).join("\n\n") || "";
    const componentsCss = selectedPage.components?.map(c => c.css || "").join("\n\n") || "";

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${selectedPage.description || selectedProject.description || ""}">
  <title>${selectedPage.title || selectedProject.name}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
${globalCss}

${pageCss}

${componentsCss}

/* Animation keyframes */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideLeft { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes slideRight { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
@keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

.animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
.animate-slide-up { animation: slideUp 0.5s ease-out forwards; }
.animate-slide-down { animation: slideDown 0.5s ease-out forwards; }
.animate-slide-left { animation: slideLeft 0.5s ease-out forwards; }
.animate-slide-right { animation: slideRight 0.5s ease-out forwards; }
.animate-zoom-in { animation: zoomIn 0.5s ease-out forwards; }
.animate-bounce { animation: bounce 1s ease-in-out infinite; }
  </style>
</head>
<body>
${componentsHtml}
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedProject.name.toLowerCase().replace(/\s+/g, "-")}-${selectedPage.slug.replace(/\//g, "") || "home"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("HTML exported successfully!");
  };

  const handleDragStart = (component: ComponentDefinition) => {
    setDraggedComponent(component);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggedComponent || !selectedPage) return;

    const newComponent: ComponentInstance = {
      id: `${draggedComponent.id}-${Date.now()}`,
      type: draggedComponent.type,
      category: draggedComponent.category,
      html: draggedComponent.defaultHtml,
      css: draggedComponent.defaultCss,
      props: { ...draggedComponent.defaultProps },
      position: { x: 0, y: 0 },
      size: { width: "100%", height: "auto" },
    };

    const updatedComponents = [...(selectedPage.components || []), newComponent];
    setSelectedPage({ ...selectedPage, components: updatedComponents });
    pushToHistory(updatedComponents);
    setSelectedComponent(newComponent);
    setDraggedComponent(null);
    toast.success(`Added ${draggedComponent.name}`);
  };

  const handleDeleteComponent = (componentId: string) => {
    if (!selectedPage) return;

    const updatedComponents = selectedPage.components.filter(c => c.id !== componentId);
    setSelectedPage({ ...selectedPage, components: updatedComponents });
    pushToHistory(updatedComponents);
    setSelectedComponent(null);
    toast.success("Component deleted");
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim() || !selectedProject) return;

    setAiLoading(true);
    try {
      const res = await fetch(`/api/websites/${selectedProject.id}/ai-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          type: "layout",
          currentHtml: selectedPage?.components?.map(c => c.html).join("\n"),
          currentCss: selectedPage?.components?.map(c => c.css).join("\n"),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.html && selectedPage) {
          const newComponent: ComponentInstance = {
            id: `ai-${Date.now()}`,
            type: "ai-generated",
            category: "content",
            html: data.html,
            css: data.css,
            props: {},
            position: { x: 0, y: 0 },
            size: { width: "100%", height: "auto" },
          };
          const updatedComponents = [...(selectedPage.components || []), newComponent];
          setSelectedPage({ ...selectedPage, components: updatedComponents });
          pushToHistory(updatedComponents);
          toast.success("AI content generated!");
        }
        setShowAiDialog(false);
        setAiPrompt("");
      } else {
        const error = await res.json();
        toast.error(error.error || "AI generation failed");
      }
    } catch (error) {
      toast.error("AI generation failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleComponentPropertyChange = (property: string, value: unknown) => {
    if (!selectedComponent || !selectedPage) return;

    const updatedComponent = {
      ...selectedComponent,
      props: { ...selectedComponent.props, [property]: value },
    };

    const updatedComponents = selectedPage.components.map(c =>
      c.id === selectedComponent.id ? updatedComponent : c
    );

    setSelectedPage({ ...selectedPage, components: updatedComponents });
    setSelectedComponent(updatedComponent);
  };

  const filteredProjects = projects.filter(p => {
    if (projectFilter !== "all" && p.type !== projectFilter) return false;
    if (projectSearch && !p.name.toLowerCase().includes(projectSearch.toLowerCase())) return false;
    return true;
  });

  const filteredComponents = COMPONENT_LIBRARY.filter(c => {
    if (activeCategory && c.category !== activeCategory) return false;
    if (componentSearch && !c.name.toLowerCase().includes(componentSearch.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading Website Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-4rem)]">
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLeftPanelOpen(!leftPanelOpen)}
              >
                {leftPanelOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
              </Button>
              
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                <span className="font-semibold">
                  {selectedProject?.name || "Website Builder"}
                </span>
                {selectedProject && (
                  <Badge variant={selectedProject.status === "published" ? "default" : "secondary"}>
                    {selectedProject.status}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewport === "desktop" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewport("desktop")}
                    >
                      <Monitor className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Desktop</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewport === "tablet" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewport("tablet")}
                    >
                      <Tablet className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Tablet</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={viewport === "mobile" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setViewport("mobile")}
                    >
                      <Smartphone className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mobile</TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-1 border rounded-lg p-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setZoom(Math.max(50, zoom - 25))}
                      disabled={zoom <= 50}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom Out</TooltipContent>
                </Tooltip>
                <span className="text-xs w-10 text-center">{zoom}%</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setZoom(Math.min(150, zoom + 25))}
                      disabled={zoom >= 150}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Zoom In</TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showGrid ? "secondary" : "ghost"}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowGrid(!showGrid)}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle Grid</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleUndo}
                    disabled={historyIndex <= 0}
                  >
                    <Undo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Undo</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRedo}
                    disabled={historyIndex >= history.length - 1}
                  >
                    <Redo2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Redo</TooltipContent>
              </Tooltip>

              <Separator orientation="vertical" className="h-6" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showCodeView ? "secondary" : "ghost"}
                    size="icon"
                    onClick={() => setShowCodeView(!showCodeView)}
                  >
                    <Code2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Code View</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleExportHtml}
                    disabled={!selectedProject}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export HTML</TooltipContent>
              </Tooltip>

              <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Sparkles className="h-4 w-4" />
                    Ask Jarvis
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Wand2 className="h-5 w-5 text-purple-500" />
                      AI Assistant
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Textarea
                      placeholder="Describe what you want to create or modify... e.g., 'Add a testimonials section with 3 customer quotes'"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={4}
                    />
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={handleAiGenerate}
                        disabled={aiLoading || !aiPrompt.trim()}
                      >
                        {aiLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-2" />
                            Generate
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Page Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Page Title</Label>
                      <Input
                        value={selectedPage?.title || ""}
                        onChange={(e) => selectedPage && setSelectedPage({ ...selectedPage, title: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Page Description</Label>
                      <Textarea
                        value={selectedPage?.description || ""}
                        onChange={(e) => selectedPage && setSelectedPage({ ...selectedPage, description: e.target.value })}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Separator orientation="vertical" className="h-6" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={saving || !selectedProject}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>

              <Button
                size="sm"
                onClick={handlePublish}
                disabled={publishing || !selectedProject}
                className="bg-gradient-to-r from-green-500 to-emerald-600"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-1" />
                )}
                Publish
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
              >
                {rightPanelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <AnimatePresence>
            {leftPanelOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-r bg-background overflow-hidden"
              >
                <div className="p-3 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm">Projects</h3>
                    <div className="flex gap-1">
                      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7" onClick={() => discoverSites()}>
                            <Upload className="h-3 w-3 mr-1" />
                            Import
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Globe className="h-5 w-5 text-primary" />
                              Import Existing Site
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground">
                                Discovered sites from your deployments
                              </p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={discoverSites}
                                disabled={discoveringInProgress}
                              >
                                {discoveringInProgress ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <ScrollArea className="h-[300px] border rounded-lg">
                              {discoveringInProgress ? (
                                <div className="flex items-center justify-center h-full py-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              ) : discoveredSites.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                  <Globe className="h-12 w-12 mx-auto mb-2 opacity-20" />
                                  <p className="text-sm">No sites discovered</p>
                                  <p className="text-xs">Click refresh to scan deployment configs</p>
                                </div>
                              ) : (
                                <div className="p-2 space-y-2">
                                  {discoveredSites.map((site) => (
                                    <div
                                      key={site.id}
                                      className={cn(
                                        "p-3 rounded-lg border cursor-pointer transition-colors",
                                        selectedSiteToImport?.id === site.id
                                          ? "border-primary bg-primary/5"
                                          : "hover:bg-muted"
                                      )}
                                      onClick={() => setSelectedSiteToImport(site)}
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className={cn(
                                          "w-2 h-2 rounded-full",
                                          site.status === "online" ? "bg-green-500" :
                                          site.status === "offline" ? "bg-red-500" : "bg-yellow-500"
                                        )} />
                                        <div className="flex-1 min-w-0">
                                          <p className="font-medium text-sm truncate">{site.name}</p>
                                          <p className="text-xs text-muted-foreground">{site.domain}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs">
                                            {site.source}
                                          </Badge>
                                          <Badge variant="secondary" className="text-xs">
                                            {site.type}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </ScrollArea>
                            {selectedSiteToImport && (
                              <div className="p-3 border rounded-lg bg-muted/30">
                                <h4 className="font-medium text-sm mb-2">Selected: {selectedSiteToImport.name}</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                  <div>Domain: {selectedSiteToImport.domain}</div>
                                  <div>Type: {selectedSiteToImport.type}</div>
                                  <div>Source: {selectedSiteToImport.source}</div>
                                  <div>Path: {selectedSiteToImport.path || "N/A"}</div>
                                </div>
                              </div>
                            )}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => {
                              setShowImportDialog(false);
                              setSelectedSiteToImport(null);
                            }}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={() => selectedSiteToImport && handleImportSite(selectedSiteToImport)}
                              disabled={!selectedSiteToImport || importing}
                            >
                              {importing ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Importing...
                                </>
                              ) : (
                                <>
                                  <Upload className="h-4 w-4 mr-2" />
                                  Import Site
                                </>
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                      <Dialog open={showNewProjectDialog} onOpenChange={setShowNewProjectDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="h-7">
                            <Plus className="h-3 w-3 mr-1" />
                            New
                          </Button>
                        </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New Website</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Project Name</Label>
                            <Input
                              value={newProjectName}
                              onChange={(e) => setNewProjectName(e.target.value)}
                              placeholder="My Website"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Type</Label>
                            <Select value={newProjectType} onValueChange={setNewProjectType}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PROJECT_TYPES.slice(1).map((t) => (
                                  <SelectItem key={t.value} value={t.value}>
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              value={newProjectDescription}
                              onChange={(e) => setNewProjectDescription(e.target.value)}
                              placeholder="Optional description..."
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowNewProjectDialog(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleCreateProject}>Create</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                      <Input
                        className="h-8 pl-7 text-xs"
                        placeholder="Search..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                      />
                    </div>
                    <Select value={projectFilter} onValueChange={setProjectFilter}>
                      <SelectTrigger className="h-8 w-24 text-xs">
                        <Filter className="h-3 w-3 mr-1" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <ScrollArea className="h-[calc(100vh-12rem)]">
                  <div className="p-2 space-y-1">
                    {filteredProjects.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No projects found
                      </div>
                    ) : (
                      filteredProjects.map((project) => (
                        <div
                          key={project.id}
                          className={cn(
                            "p-3 rounded-lg cursor-pointer transition-colors",
                            selectedProject?.id === project.id
                              ? "bg-primary/10 border border-primary/20"
                              : "hover:bg-muted"
                          )}
                          onClick={() => fetchProjectDetails(project.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-12 h-12 rounded bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                              <Globe className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{project.name}</p>
                              <p className="text-xs text-muted-foreground capitalize">{project.type}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {new Date(project.updatedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge
                              variant={project.status === "published" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {project.status}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className={cn(
              "flex-1 bg-muted/30 flex flex-col overflow-hidden",
              showGrid && "bg-[url('/grid.svg')]"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {!selectedProject ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                  <Globe className="h-16 w-16 mx-auto text-muted-foreground/50" />
                  <div>
                    <h3 className="text-lg font-semibold">Select a Project</h3>
                    <p className="text-muted-foreground">
                      Choose a project from the sidebar or create a new one
                    </p>
                  </div>
                  <Button onClick={() => setShowNewProjectDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Website
                  </Button>
                </div>
              </div>
            ) : showCodeView ? (
              <div className="flex-1 flex">
                <div className="w-1/2 border-r">
                  <div className="p-2 border-b bg-background text-xs font-medium flex items-center gap-2">
                    <FileCode className="h-4 w-4" />
                    HTML
                  </div>
                  <MonacoEditor
                    height="calc(100% - 40px)"
                    defaultLanguage="html"
                    value={selectedPage?.components?.map(c => c.html).join("\n\n") || ""}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: "on",
                      readOnly: true,
                    }}
                  />
                </div>
                <div className="w-1/2">
                  <div className="p-2 border-b bg-background text-xs font-medium flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    CSS
                  </div>
                  <MonacoEditor
                    height="calc(100% - 40px)"
                    defaultLanguage="css"
                    value={`${selectedProject?.globalCss || ""}\n\n${selectedPage?.components?.map(c => c.css).join("\n\n") || ""}`}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: "on",
                      readOnly: true,
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                <motion.div
                  layout
                  className="bg-white rounded-lg shadow-2xl overflow-hidden"
                  style={{
                    width: viewportWidths[viewport],
                    height: viewport === "mobile" ? "667px" : "100%",
                    maxWidth: "100%",
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: "top center",
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    className="w-full h-full border-0"
                    title="Preview"
                    sandbox="allow-scripts"
                  />
                </motion.div>
              </div>
            )}
          </div>

          <AnimatePresence>
            {rightPanelOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l bg-background overflow-hidden"
              >
                <Tabs value={rightPanelTab} onValueChange={(v) => setRightPanelTab(v as "components" | "properties" | "pages" | "deploy" | "ai")}>
                  <TabsList className="w-full rounded-none border-b h-10 grid grid-cols-5">
                    <TabsTrigger value="components" className="text-xs px-1">
                      <Box className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="properties" className="text-xs px-1">
                      <Settings2 className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="pages" className="text-xs px-1">
                      <File className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="deploy" className="text-xs px-1">
                      <Rocket className="h-3 w-3" />
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="text-xs px-1">
                      <Sparkles className="h-3 w-3" />
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="components" className="m-0">
                    <div className="p-3 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                          className="h-8 pl-7 text-xs"
                          placeholder="Search components..."
                          value={componentSearch}
                          onChange={(e) => setComponentSearch(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        <Button
                          variant={activeCategory === null ? "secondary" : "ghost"}
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setActiveCategory(null)}
                        >
                          All
                        </Button>
                        {CATEGORIES.map((cat) => (
                          <Button
                            key={cat.id}
                            variant={activeCategory === cat.id ? "secondary" : "ghost"}
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => setActiveCategory(cat.id)}
                          >
                            {cat.icon}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <ScrollArea className="h-[calc(100vh-14rem)]">
                      <div className="p-2 space-y-1">
                        {filteredComponents.map((component) => (
                          <div
                            key={component.id}
                            draggable
                            onDragStart={() => handleDragStart(component)}
                            className="p-3 rounded-lg border bg-card hover:bg-accent cursor-grab active:cursor-grabbing transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary">
                                {component.icon}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-medium">{component.name}</p>
                                <p className="text-xs text-muted-foreground capitalize">{component.category}</p>
                              </div>
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="properties" className="m-0">
                    <ScrollArea className="h-[calc(100vh-10rem)]">
                      {selectedComponent ? (
                        <div className="p-4 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{selectedComponent.type}</h4>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDeleteComponent(selectedComponent.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>

                          <Separator />

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-xs">Background Color</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="color"
                                  className="h-8 w-12 p-1"
                                  value={(selectedComponent.props.backgroundColor as string) || "#ffffff"}
                                  onChange={(e) => handleComponentPropertyChange("backgroundColor", e.target.value)}
                                />
                                <Input
                                  className="h-8 flex-1 text-xs"
                                  value={(selectedComponent.props.backgroundColor as string) || "#ffffff"}
                                  onChange={(e) => handleComponentPropertyChange("backgroundColor", e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs">Text Color</Label>
                              <div className="flex gap-2">
                                <Input
                                  type="color"
                                  className="h-8 w-12 p-1"
                                  value={(selectedComponent.props.textColor as string) || "#000000"}
                                  onChange={(e) => handleComponentPropertyChange("textColor", e.target.value)}
                                />
                                <Input
                                  className="h-8 flex-1 text-xs"
                                  value={(selectedComponent.props.textColor as string) || "#000000"}
                                  onChange={(e) => handleComponentPropertyChange("textColor", e.target.value)}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs">Padding</Label>
                              <Slider
                                value={[(selectedComponent.props.padding as number) || 16]}
                                max={100}
                                step={4}
                                onValueChange={([v]) => handleComponentPropertyChange("padding", v)}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs">Margin</Label>
                              <Slider
                                value={[(selectedComponent.props.margin as number) || 0]}
                                max={100}
                                step={4}
                                onValueChange={([v]) => handleComponentPropertyChange("margin", v)}
                              />
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label className="text-xs">Custom CSS Class</Label>
                              <Input
                                className="h-8 text-xs font-mono"
                                placeholder="my-custom-class"
                                value={(selectedComponent.props.className as string) || ""}
                                onChange={(e) => handleComponentPropertyChange("className", e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs">Custom CSS</Label>
                              <Textarea
                                className="text-xs font-mono"
                                placeholder=".my-class { ... }"
                                rows={4}
                                value={selectedComponent.css || ""}
                              />
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold flex items-center gap-2">
                                <Link className="h-3 w-3" />
                                Link Configuration
                              </Label>
                              <div className="space-y-2">
                                <Input
                                  className="h-8 text-xs"
                                  placeholder="https://example.com or /page"
                                  value={(selectedComponent.props.linkUrl as string) || ""}
                                  onChange={(e) => handleComponentPropertyChange("linkUrl", e.target.value)}
                                />
                                <Select
                                  value={(selectedComponent.props.linkTarget as string) || "_self"}
                                  onValueChange={(v) => handleComponentPropertyChange("linkTarget", v)}
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Open in..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="_self">Same Tab</SelectItem>
                                    <SelectItem value="_blank">New Tab</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold flex items-center gap-2">
                                <Sparkles className="h-3 w-3" />
                                Animation
                              </Label>
                              <Select
                                value={(selectedComponent.props.animation as string) || "none"}
                                onValueChange={(v) => handleComponentPropertyChange("animation", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select animation" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  <SelectItem value="fade-in">Fade In</SelectItem>
                                  <SelectItem value="slide-up">Slide Up</SelectItem>
                                  <SelectItem value="slide-down">Slide Down</SelectItem>
                                  <SelectItem value="slide-left">Slide Left</SelectItem>
                                  <SelectItem value="slide-right">Slide Right</SelectItem>
                                  <SelectItem value="zoom-in">Zoom In</SelectItem>
                                  <SelectItem value="bounce">Bounce</SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Duration (ms)</Label>
                                  <Input
                                    type="number"
                                    className="h-8 text-xs"
                                    placeholder="500"
                                    value={(selectedComponent.props.animationDuration as number) || 500}
                                    onChange={(e) => handleComponentPropertyChange("animationDuration", parseInt(e.target.value) || 500)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Delay (ms)</Label>
                                  <Input
                                    type="number"
                                    className="h-8 text-xs"
                                    placeholder="0"
                                    value={(selectedComponent.props.animationDelay as number) || 0}
                                    onChange={(e) => handleComponentPropertyChange("animationDelay", parseInt(e.target.value) || 0)}
                                  />
                                </div>
                              </div>
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold flex items-center gap-2">
                                <AlignCenter className="h-3 w-3" />
                                Text Alignment
                              </Label>
                              <div className="flex gap-1">
                                <Button
                                  variant={(selectedComponent.props.textAlign as string) === "left" ? "secondary" : "ghost"}
                                  size="sm"
                                  className="h-8 flex-1"
                                  onClick={() => handleComponentPropertyChange("textAlign", "left")}
                                >
                                  <AlignLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant={(selectedComponent.props.textAlign as string) === "center" ? "secondary" : "ghost"}
                                  size="sm"
                                  className="h-8 flex-1"
                                  onClick={() => handleComponentPropertyChange("textAlign", "center")}
                                >
                                  <AlignCenter className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant={(selectedComponent.props.textAlign as string) === "right" ? "secondary" : "ghost"}
                                  size="sm"
                                  className="h-8 flex-1"
                                  onClick={() => handleComponentPropertyChange("textAlign", "right")}
                                >
                                  <AlignRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold flex items-center gap-2">
                                <Type className="h-3 w-3" />
                                Font Size
                              </Label>
                              <Select
                                value={(selectedComponent.props.fontSize as string) || "base"}
                                onValueChange={(v) => handleComponentPropertyChange("fontSize", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Font size" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="xs">Extra Small</SelectItem>
                                  <SelectItem value="sm">Small</SelectItem>
                                  <SelectItem value="base">Normal</SelectItem>
                                  <SelectItem value="lg">Large</SelectItem>
                                  <SelectItem value="xl">Extra Large</SelectItem>
                                  <SelectItem value="2xl">2X Large</SelectItem>
                                  <SelectItem value="3xl">3X Large</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant={(selectedComponent.props.fontWeight as string) === "bold" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-8"
                                onClick={() => handleComponentPropertyChange("fontWeight", (selectedComponent.props.fontWeight as string) === "bold" ? "normal" : "bold")}
                              >
                                <Bold className="h-4 w-4" />
                              </Button>
                              <Button
                                variant={(selectedComponent.props.fontStyle as string) === "italic" ? "secondary" : "ghost"}
                                size="sm"
                                className="h-8"
                                onClick={() => handleComponentPropertyChange("fontStyle", (selectedComponent.props.fontStyle as string) === "italic" ? "normal" : "italic")}
                              >
                                <Italic className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center text-muted-foreground">
                          <MousePointer2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Select a component to edit its properties</p>
                        </div>
                      )}
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="pages" className="m-0">
                    <div className="p-3 border-b">
                      <Dialog open={showNewPageDialog} onOpenChange={setShowNewPageDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" className="w-full">
                            <Plus className="h-4 w-4 mr-2" />
                            Add Page
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Create New Page</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label>Page Name</Label>
                              <Input
                                value={newPageName}
                                onChange={(e) => setNewPageName(e.target.value)}
                                placeholder="About Us"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>URL Slug</Label>
                              <Input
                                value={newPageSlug}
                                onChange={(e) => setNewPageSlug(e.target.value)}
                                placeholder="/about"
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowNewPageDialog(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleCreatePage}>Create</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <ScrollArea className="h-[calc(100vh-12rem)]">
                      <div className="p-2 space-y-1">
                        {pages.map((page) => (
                          <div
                            key={page.id}
                            className={cn(
                              "p-3 rounded-lg cursor-pointer transition-colors flex items-center gap-3",
                              selectedPage?.id === page.id
                                ? "bg-primary/10 border border-primary/20"
                                : "hover:bg-muted"
                            )}
                            onClick={() => {
                              setSelectedPage(page);
                              pushToHistory(page.components || []);
                            }}
                          >
                            {page.isHomepage ? (
                              <Home className="h-4 w-4 text-primary" />
                            ) : (
                              <File className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div className="flex-1">
                              <p className="text-sm font-medium">{page.name}</p>
                              <p className="text-xs text-muted-foreground">{page.slug}</p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Duplicate
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Home className="h-4 w-4 mr-2" />
                                  Set as Homepage
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="deploy" className="m-0">
                    <ScrollArea className="h-[calc(100vh-10rem)]">
                      <div className="p-4 space-y-4">
                        <div className="text-center space-y-2 py-2">
                          <Rocket className="h-8 w-8 mx-auto text-primary" />
                          <h4 className="font-semibold">Deployment Panel</h4>
                          <p className="text-xs text-muted-foreground">
                            Deploy your site to various targets
                          </p>
                        </div>

                        {selectedProject && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-xs font-semibold">Deploy Target</Label>
                              <Select value={deployTarget} onValueChange={setDeployTarget}>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Select target" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="local">Local (Static Files)</SelectItem>
                                  <SelectItem value="linode">Linode Server</SelectItem>
                                  <SelectItem value="home">Home Server</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <Button
                              className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                              onClick={handleDeploy}
                              disabled={deploying}
                            >
                              {deploying ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Deploying...
                                </>
                              ) : (
                                <>
                                  <Rocket className="h-4 w-4 mr-2" />
                                  Deploy Now
                                </>
                              )}
                            </Button>

                            <Separator />

                            <div className="space-y-2">
                              <Label className="text-xs font-semibold">Deployment History</Label>
                              {deploymentHistory.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-4">
                                  No deployments yet
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {deploymentHistory.slice(0, 5).map((deployment) => (
                                    <div
                                      key={deployment.id}
                                      className="p-2 border rounded-lg text-xs"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-medium">v{deployment.version}</span>
                                        <Badge
                                          variant={
                                            deployment.status === "success" ? "default" :
                                            deployment.status === "failed" ? "destructive" :
                                            "secondary"
                                          }
                                          className="text-xs"
                                        >
                                          {deployment.status}
                                        </Badge>
                                      </div>
                                      <p className="text-muted-foreground mt-1">
                                        {new Date(deployment.startedAt).toLocaleString()}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {!selectedProject && (
                          <div className="text-center text-muted-foreground py-8">
                            <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Select a project to deploy</p>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="ai" className="m-0 flex flex-col h-[calc(100vh-10rem)]">
                    <div className="p-3 border-b space-y-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        <span className="font-semibold text-sm">AI Assistant</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleAnalyzeSEO}
                          disabled={!selectedPage}
                        >
                          SEO {seoScore && `(${seoScore.score})`}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleAnalyzeAccessibility}
                          disabled={!selectedPage}
                        >
                          A11y {accessibilityScore && `(${accessibilityScore.score})`}
                        </Button>
                      </div>
                    </div>

                    {seoScore && (
                      <div className="p-2 border-b bg-muted/30 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">SEO Score</span>
                          <Badge variant={seoScore.score >= 70 ? "default" : "destructive"}>
                            {seoScore.score}/100
                          </Badge>
                        </div>
                        {seoScore.issues.length > 0 && (
                          <ul className="text-muted-foreground list-disc list-inside">
                            {seoScore.issues.slice(0, 2).map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    {accessibilityScore && (
                      <div className="p-2 border-b bg-muted/30 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Accessibility Score</span>
                          <Badge variant={accessibilityScore.score >= 70 ? "default" : "destructive"}>
                            {accessibilityScore.score}/100
                          </Badge>
                        </div>
                        {accessibilityScore.issues.length > 0 && (
                          <ul className="text-muted-foreground list-disc list-inside">
                            {accessibilityScore.issues.slice(0, 2).map((issue, i) => (
                              <li key={i}>{issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}

                    <ScrollArea ref={aiChatScrollRef} className="flex-1 p-3">
                      <div className="space-y-3">
                        {aiMessages.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            <Wand2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm font-medium">Ask Jarvis to edit your page</p>
                            <p className="text-xs mt-1">Try: "Make the hero section blue"</p>
                          </div>
                        ) : (
                          aiMessages.map((message) => (
                            <div
                              key={message.id}
                              className={cn(
                                "p-3 rounded-lg text-sm",
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground ml-4"
                                  : "bg-muted mr-4"
                              )}
                            >
                              <p className="whitespace-pre-wrap">{message.content}</p>
                              <p className="text-xs opacity-70 mt-1">
                                {new Date(message.timestamp).toLocaleTimeString()}
                              </p>
                            </div>
                          ))
                        )}
                        {aiChatLoading && (
                          <div className="flex items-center gap-2 text-muted-foreground p-3">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm">Thinking...</span>
                          </div>
                        )}
                      </div>
                    </ScrollArea>

                    <div className="p-3 border-t">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ask Jarvis to edit..."
                          value={aiChatInput}
                          onChange={(e) => setAiChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAiChat()}
                          disabled={!selectedProject || !selectedPage}
                          className="text-sm"
                        />
                        <Button
                          size="icon"
                          onClick={handleAiChat}
                          disabled={aiChatLoading || !aiChatInput.trim() || !selectedPage}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </TooltipProvider>
  );
}
