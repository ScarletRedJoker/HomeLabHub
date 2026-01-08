"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  Search,
  Download,
  Star,
  Eye,
  Code2,
  Globe,
  Server,
  Bot,
  ShoppingCart,
  MessageSquare,
  BarChart3,
  Users,
  FileText,
  Loader2,
  CheckCircle2,
  ExternalLink,
  GitFork,
  Heart,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  stars: number;
  downloads: number;
  tags: string[];
  preview?: string;
  features: string[];
  stack: string[];
}

const categories = [
  { id: "all", label: "All", icon: Package },
  { id: "saas", label: "SaaS", icon: BarChart3 },
  { id: "ecommerce", label: "E-commerce", icon: ShoppingCart },
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "landing", label: "Landing Page", icon: Globe },
  { id: "api", label: "API", icon: Server },
  { id: "bot", label: "Bot", icon: Bot },
  { id: "blog", label: "Blog/CMS", icon: FileText },
  { id: "chat", label: "Chat/Social", icon: MessageSquare },
];

const templates: Template[] = [
  {
    id: "saas-starter",
    name: "SaaS Starter Kit",
    description: "Complete SaaS boilerplate with auth, billing, and admin dashboard",
    category: "saas",
    author: "nebula-team",
    stars: 2847,
    downloads: 15420,
    tags: ["next.js", "stripe", "tailwind", "prisma"],
    features: [
      "User authentication with NextAuth",
      "Stripe subscription billing",
      "Admin dashboard",
      "API key management",
      "Email notifications",
      "Dark/light mode",
    ],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Prisma", "PostgreSQL", "Stripe"],
  },
  {
    id: "ecommerce-pro",
    name: "E-commerce Pro",
    description: "Full-featured online store with cart, checkout, and inventory management",
    category: "ecommerce",
    author: "commerce-labs",
    stars: 1923,
    downloads: 8765,
    tags: ["next.js", "stripe", "inventory", "cart"],
    features: [
      "Product catalog with filters",
      "Shopping cart functionality",
      "Stripe checkout integration",
      "Order management",
      "Inventory tracking",
      "Customer accounts",
    ],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Drizzle", "Stripe", "Uploadthing"],
  },
  {
    id: "admin-dashboard",
    name: "Admin Dashboard Pro",
    description: "Modern admin panel with charts, tables, and user management",
    category: "dashboard",
    author: "nebula-team",
    stars: 3156,
    downloads: 21340,
    tags: ["react", "charts", "tables", "auth"],
    features: [
      "Beautiful analytics dashboard",
      "Data tables with pagination",
      "User role management",
      "Real-time notifications",
      "Dark/light theme",
      "Responsive design",
    ],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Recharts", "shadcn/ui"],
  },
  {
    id: "landing-starter",
    name: "Landing Page Starter",
    description: "Stunning marketing landing page with animations and CTA sections",
    category: "landing",
    author: "design-studio",
    stars: 987,
    downloads: 4532,
    tags: ["landing", "marketing", "animations", "responsive"],
    features: [
      "Hero section with gradient",
      "Feature showcase",
      "Testimonials carousel",
      "Pricing tables",
      "Contact form",
      "SEO optimized",
    ],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Framer Motion"],
  },
  {
    id: "rest-api",
    name: "REST API Boilerplate",
    description: "Production-ready REST API with auth, validation, and docs",
    category: "api",
    author: "api-masters",
    stars: 1456,
    downloads: 6789,
    tags: ["express", "api", "jwt", "swagger"],
    features: [
      "JWT authentication",
      "Request validation",
      "Rate limiting",
      "OpenAPI documentation",
      "Error handling",
      "Logging with Winston",
    ],
    stack: ["Node.js", "Express", "TypeScript", "Prisma", "Swagger"],
  },
  {
    id: "discord-bot-starter",
    name: "Discord Bot Starter",
    description: "Feature-rich Discord bot with commands, events, and database",
    category: "bot",
    author: "bot-builders",
    stars: 2134,
    downloads: 9876,
    tags: ["discord.js", "commands", "events", "database"],
    features: [
      "Slash command handler",
      "Event system",
      "Database integration",
      "Moderation commands",
      "Music player",
      "Leveling system",
    ],
    stack: ["Node.js", "Discord.js", "TypeScript", "SQLite/PostgreSQL"],
  },
  {
    id: "blog-cms",
    name: "Blog & CMS",
    description: "Full-featured blog with markdown support and admin panel",
    category: "blog",
    author: "content-team",
    stars: 1678,
    downloads: 5432,
    tags: ["blog", "markdown", "cms", "seo"],
    features: [
      "Markdown editor",
      "Categories and tags",
      "SEO optimization",
      "RSS feed",
      "Newsletter signup",
      "Admin panel",
    ],
    stack: ["Next.js 14", "TypeScript", "MDX", "Tailwind CSS"],
  },
  {
    id: "chat-app",
    name: "Real-time Chat App",
    description: "Modern chat application with rooms, DMs, and file sharing",
    category: "chat",
    author: "social-devs",
    stars: 1234,
    downloads: 4321,
    tags: ["websocket", "chat", "real-time", "rooms"],
    features: [
      "Real-time messaging",
      "Chat rooms",
      "Direct messages",
      "File uploads",
      "User presence",
      "Message reactions",
    ],
    stack: ["Next.js 14", "TypeScript", "Socket.io", "PostgreSQL", "Redis"],
  },
  {
    id: "team-portal",
    name: "Team Collaboration",
    description: "Project management tool with boards, tasks, and time tracking",
    category: "saas",
    author: "team-tools",
    stars: 1567,
    downloads: 6234,
    tags: ["projects", "tasks", "collaboration", "kanban"],
    features: [
      "Kanban boards",
      "Task management",
      "Team invitations",
      "Time tracking",
      "Comments",
      "File attachments",
    ],
    stack: ["Next.js 14", "TypeScript", "Tailwind CSS", "Prisma"],
  },
];

function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function TemplatesPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.name.toLowerCase().includes(search.toLowerCase()) ||
      template.description.toLowerCase().includes(search.toLowerCase()) ||
      template.tags.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = category === "all" || template.category === category;
    return matchesSearch && matchesCategory;
  });

  async function installTemplate(template: Template) {
    setInstalling(template.id);
    
    await new Promise((r) => setTimeout(r, 2000));
    
    setInstalling(null);
    setSelectedTemplate(null);
    
    toast({
      title: "Template Installed",
      description: `${template.name} is ready to use`,
    });
    
    router.push(`/factory?template=${template.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500">
          <Package className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Template Marketplace</h1>
          <p className="text-muted-foreground">
            Browse and install community-built project templates
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <ScrollArea className="w-full sm:w-auto">
          <div className="flex gap-2 pb-2">
            {categories.map((cat) => (
              <Button
                key={cat.id}
                variant={category === cat.id ? "default" : "outline"}
                size="sm"
                onClick={() => setCategory(cat.id)}
                className="shrink-0 gap-2"
              >
                <cat.icon className="h-4 w-4" />
                {cat.label}
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <Card
            key={template.id}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setSelectedTemplate(template)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    by {template.author}
                  </CardDescription>
                </div>
                <Badge variant="secondary">{template.category}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {template.description}
              </p>

              <div className="flex flex-wrap gap-1">
                {template.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    {formatNumber(template.stars)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    {formatNumber(template.downloads)}
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    installTemplate(template);
                  }}
                  disabled={installing === template.id}
                >
                  {installing === template.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Use"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">No templates found matching your search</p>
        </div>
      )}

      <Dialog open={!!selectedTemplate} onOpenChange={() => setSelectedTemplate(null)}>
        {selectedTemplate && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-xl">{selectedTemplate.name}</DialogTitle>
                  <DialogDescription className="mt-1">
                    by {selectedTemplate.author}
                  </DialogDescription>
                </div>
                <Badge>{selectedTemplate.category}</Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <p className="text-muted-foreground">{selectedTemplate.description}</p>

              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <Star className="h-4 w-4 text-yellow-500" />
                  {formatNumber(selectedTemplate.stars)} stars
                </span>
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {formatNumber(selectedTemplate.downloads)} downloads
                </span>
                <span className="flex items-center gap-1">
                  <GitFork className="h-4 w-4" />
                  Open source
                </span>
              </div>

              <Tabs defaultValue="features">
                <TabsList>
                  <TabsTrigger value="features">Features</TabsTrigger>
                  <TabsTrigger value="stack">Tech Stack</TabsTrigger>
                </TabsList>
                <TabsContent value="features" className="mt-4">
                  <div className="grid grid-cols-2 gap-2">
                    {selectedTemplate.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        {feature}
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="stack" className="mt-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedTemplate.stack.map((tech) => (
                      <Badge key={tech} variant="secondary">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelectedTemplate(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => installTemplate(selectedTemplate)}
                disabled={installing === selectedTemplate.id}
                className="gap-2"
              >
                {installing === selectedTemplate.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Use Template
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
