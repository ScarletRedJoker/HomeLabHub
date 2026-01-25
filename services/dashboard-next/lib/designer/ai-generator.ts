import { aiOrchestrator } from '@/lib/ai/orchestrator';
import type { ChatMessage } from '@/lib/ai/types';

export interface GeneratedComponent {
  code: string;
  name: string;
  type: ComponentType;
  prompt: string;
  timestamp: string;
  metadata?: {
    provider: string;
    latency: number;
  };
}

export type ComponentType = 
  | 'hero'
  | 'pricing'
  | 'features'
  | 'contact'
  | 'testimonials'
  | 'navbar'
  | 'footer'
  | 'cta'
  | 'gallery'
  | 'stats'
  | 'custom';

export interface ComponentPreset {
  id: string;
  name: string;
  type: ComponentType;
  description: string;
  prompt: string;
  thumbnail?: string;
}

const SYSTEM_PROMPT = `You are an expert React/Next.js developer specializing in beautiful, modern UI components.

Generate a React component based on the user's request following these strict rules:

REQUIREMENTS:
- Use 'use client' directive at the top
- Use TypeScript with proper typing
- Use TailwindCSS utility classes ONLY for styling
- Use mobile-first responsive design (sm:, md:, lg:, xl: breakpoints)
- Include proper accessibility (ARIA labels, semantic HTML, focus states)
- Use modern design patterns: gradients, shadows, smooth animations
- NO external images - use CSS gradients, patterns, or placeholder divs
- Use Lucide React icons if icons are needed (import from 'lucide-react')
- Export as named function component
- Include hover states and transitions
- Use dark mode support (dark: variants)

STRUCTURE:
- Component should be self-contained
- Use descriptive variable names
- Include TypeScript interface for props if needed

Return ONLY the component code. No markdown fences, no explanations.

EXAMPLE OUTPUT:
'use client';

import { ArrowRight } from 'lucide-react';

interface HeroProps {
  title?: string;
  subtitle?: string;
}

export function HeroSection({ title = "Welcome", subtitle = "Get started today" }: HeroProps) {
  return (
    <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-600 to-blue-500">
      <div className="text-center px-4">
        <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">{title}</h1>
        <p className="text-lg md:text-xl text-white/80 mb-8">{subtitle}</p>
        <button className="px-8 py-3 bg-white text-purple-600 rounded-full font-semibold hover:scale-105 transition-transform flex items-center gap-2 mx-auto">
          Get Started <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}`;

export const COMPONENT_PRESETS: ComponentPreset[] = [
  {
    id: 'hero-gradient',
    name: 'Gradient Hero',
    type: 'hero',
    description: 'Full-screen hero with gradient background and CTA',
    prompt: 'Create a full-screen hero section with a purple to blue gradient background, large bold heading, subtitle text, and a prominent call-to-action button with hover animation'
  },
  {
    id: 'hero-split',
    name: 'Split Hero',
    type: 'hero',
    description: 'Two-column hero with content and visual',
    prompt: 'Create a split hero section with text content on the left (heading, paragraph, two buttons) and an abstract gradient shape on the right, responsive for mobile'
  },
  {
    id: 'hero-minimal',
    name: 'Minimal Hero',
    type: 'hero',
    description: 'Clean, minimal hero section',
    prompt: 'Create a minimal hero section with centered text, clean typography, subtle background, and a simple CTA button with dark mode support'
  },
  {
    id: 'hero-animated',
    name: 'Animated Hero',
    type: 'hero',
    description: 'Hero with animated elements',
    prompt: 'Create a hero section with animated gradient background that shifts colors, floating elements, and text that fades in on load using CSS animations'
  },
  {
    id: 'hero-video-style',
    name: 'Video-Style Hero',
    type: 'hero',
    description: 'Cinematic hero without actual video',
    prompt: 'Create a full-screen hero with a dark overlay, large centered text with a glowing effect, and animated scan lines for a cinematic feel'
  },
  {
    id: 'pricing-simple',
    name: 'Simple Pricing',
    type: 'pricing',
    description: 'Clean three-tier pricing',
    prompt: 'Create a pricing section with 3 cards (Basic, Pro, Enterprise), each with price, feature list, and CTA button. Highlight the middle card as recommended'
  },
  {
    id: 'pricing-toggle',
    name: 'Toggle Pricing',
    type: 'pricing',
    description: 'Monthly/yearly toggle pricing',
    prompt: 'Create a pricing section with a monthly/yearly toggle switch at the top, 3 pricing tiers, feature checkmarks, and highlighted best value option'
  },
  {
    id: 'pricing-comparison',
    name: 'Comparison Pricing',
    type: 'pricing',
    description: 'Feature comparison table',
    prompt: 'Create a pricing comparison table with features as rows and plans as columns, checkmarks for included features, and sticky header'
  },
  {
    id: 'features-grid',
    name: 'Features Grid',
    type: 'features',
    description: '3x2 feature cards',
    prompt: 'Create a 6-card features grid (3 columns on desktop, 2 on tablet, 1 on mobile) with icon, heading, and description in each card'
  },
  {
    id: 'features-alternating',
    name: 'Alternating Features',
    type: 'features',
    description: 'Zig-zag feature layout',
    prompt: 'Create a features section with alternating left/right layout - image/visual on one side, text content on the other, switching each row'
  },
  {
    id: 'features-icons',
    name: 'Icon Features',
    type: 'features',
    description: 'Large icon feature cards',
    prompt: 'Create a features section with large icon circles, bold headings, and descriptions. Use gradient backgrounds on the icons'
  },
  {
    id: 'features-bento',
    name: 'Bento Grid',
    type: 'features',
    description: 'Bento-style feature grid',
    prompt: 'Create a bento grid layout with varied card sizes (some 2x2, some 1x1), featuring icons, headings, and hover effects'
  },
  {
    id: 'contact-form',
    name: 'Contact Form',
    type: 'contact',
    description: 'Modern contact form',
    prompt: 'Create a contact form with name, email, subject, and message fields. Include floating labels, validation states, and a submit button with loading state'
  },
  {
    id: 'contact-split',
    name: 'Split Contact',
    type: 'contact',
    description: 'Form with contact info',
    prompt: 'Create a split contact section with form on the left and contact information (email, phone, address with icons) on the right'
  },
  {
    id: 'contact-card',
    name: 'Card Contact',
    type: 'contact',
    description: 'Floating card contact form',
    prompt: 'Create a contact form inside a floating card with shadow, gradient header, and social media links at the bottom'
  },
  {
    id: 'testimonials-carousel',
    name: 'Testimonial Carousel',
    type: 'testimonials',
    description: 'Sliding testimonials',
    prompt: 'Create a testimonials section with carousel navigation (arrows and dots), showing quote, author name, title, and avatar placeholder'
  },
  {
    id: 'testimonials-grid',
    name: 'Testimonial Grid',
    type: 'testimonials',
    description: 'Grid of testimonial cards',
    prompt: 'Create a testimonial grid with 3 cards showing quotes, star ratings, author info with avatar circles, and subtle card hover effects'
  },
  {
    id: 'testimonials-marquee',
    name: 'Marquee Testimonials',
    type: 'testimonials',
    description: 'Auto-scrolling testimonials',
    prompt: 'Create an infinite scrolling marquee of testimonial cards that auto-scrolls horizontally with CSS animation'
  },
  {
    id: 'navbar-simple',
    name: 'Simple Navbar',
    type: 'navbar',
    description: 'Clean navigation bar',
    prompt: 'Create a responsive navbar with logo, navigation links, and CTA button. Include mobile hamburger menu that toggles'
  },
  {
    id: 'footer-full',
    name: 'Full Footer',
    type: 'footer',
    description: 'Multi-column footer',
    prompt: 'Create a footer with logo, 4 link columns (Product, Company, Resources, Legal), newsletter signup, and social icons'
  },
  {
    id: 'cta-banner',
    name: 'CTA Banner',
    type: 'cta',
    description: 'Call-to-action banner',
    prompt: 'Create a full-width CTA banner with gradient background, bold heading, subtext, and prominent button'
  },
  {
    id: 'stats-counter',
    name: 'Stats Counter',
    type: 'stats',
    description: 'Animated stat numbers',
    prompt: 'Create a stats section with 4 large numbers (users, projects, countries, uptime), labels below each, and clean layout'
  },
  {
    id: 'gallery-masonry',
    name: 'Masonry Gallery',
    type: 'gallery',
    description: 'Image placeholder gallery',
    prompt: 'Create a masonry-style gallery grid with gradient placeholder blocks of varying heights and hover overlay effects'
  },
];

function extractComponentName(code: string): string {
  const exportMatch = code.match(/export\s+(?:function|const)\s+(\w+)/);
  if (exportMatch) return exportMatch[1];
  
  const functionMatch = code.match(/function\s+(\w+)/);
  if (functionMatch) return functionMatch[1];
  
  return 'GeneratedComponent';
}

function cleanGeneratedCode(code: string): string {
  let cleaned = code.trim();
  
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
  }
  
  if (!cleaned.startsWith("'use client'") && !cleaned.startsWith('"use client"')) {
    cleaned = "'use client';\n\n" + cleaned;
  }
  
  return cleaned.trim();
}

export async function generateComponent(
  prompt: string,
  type: ComponentType = 'custom'
): Promise<GeneratedComponent> {
  const startTime = Date.now();
  
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  const response = await aiOrchestrator.chat({
    messages,
    temperature: 0.7,
    maxTokens: 4000,
  });

  const code = cleanGeneratedCode(response.content);
  const name = extractComponentName(code);

  return {
    code,
    name,
    type,
    prompt,
    timestamp: new Date().toISOString(),
    metadata: {
      provider: response.metadata.provider,
      latency: Date.now() - startTime,
    },
  };
}

export async function* generateComponentStream(
  prompt: string,
  type: ComponentType = 'custom'
): AsyncGenerator<{ content: string; done: boolean; component?: GeneratedComponent }> {
  const startTime = Date.now();
  let fullContent = '';
  let provider = 'unknown';

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt }
  ];

  const stream = aiOrchestrator.chatStream({
    messages,
    temperature: 0.7,
    maxTokens: 4000,
  });

  for await (const chunk of stream) {
    fullContent += chunk.content;
    provider = chunk.provider || provider;
    
    yield {
      content: chunk.content,
      done: false,
    };
  }

  const code = cleanGeneratedCode(fullContent);
  const name = extractComponentName(code);

  yield {
    content: '',
    done: true,
    component: {
      code,
      name,
      type,
      prompt,
      timestamp: new Date().toISOString(),
      metadata: {
        provider,
        latency: Date.now() - startTime,
      },
    },
  };
}

export function generateStaticHtml(componentCode: string, componentName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${componentName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {}
      }
    }
  </script>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script type="text/babel">
    ${componentCode.replace(/'use client';?\n?/g, '').replace(/import.*from.*;\n?/g, '')}
    
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<${componentName} />);
  </script>
</body>
</html>`;
}

export function getPresetsByType(type: ComponentType): ComponentPreset[] {
  return COMPONENT_PRESETS.filter(p => p.type === type);
}

export function getPresetById(id: string): ComponentPreset | undefined {
  return COMPONENT_PRESETS.find(p => p.id === id);
}

export const aiGenerator = {
  generate: generateComponent,
  generateStream: generateComponentStream,
  toHtml: generateStaticHtml,
  presets: COMPONENT_PRESETS,
  getPresetsByType,
  getPresetById,
};

export default aiGenerator;
