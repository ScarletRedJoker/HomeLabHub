import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  files: TemplateFile[];
}

const templates: ProjectTemplate[] = [
  {
    id: "react-express",
    name: "Full Stack Web App",
    description: "React frontend with Express.js backend API. Perfect for building modern web applications.",
    icon: "Globe",
    difficulty: "intermediate",
    tags: ["React", "Express", "Node.js", "API"],
    files: [
      {
        path: "package.json",
        language: "json",
        content: `{
  "name": "fullstack-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \\"npm run server\\" \\"npm run client\\"",
    "server": "node server/index.js",
    "client": "cd client && npm run dev"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "concurrently": "^8.2.0"
  }
}`
      },
      {
        path: "server/index.js",
        language: "javascript",
        content: `const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/data', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

app.listen(PORT, () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});`
      },
      {
        path: "client/src/App.jsx",
        language: "jsx",
        content: `import { useState, useEffect } from 'react';

export default function App() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(setData);
  }, []);

  return (
    <div className="app">
      <h1>Full Stack App</h1>
      <p>{data?.message || 'Loading...'}</p>
    </div>
  );
}`
      }
    ]
  },
  {
    id: "discord-bot",
    name: "Discord Bot",
    description: "Node.js Discord bot with slash commands and event handling. Ready to deploy.",
    icon: "MessageSquare",
    difficulty: "beginner",
    tags: ["Discord", "Node.js", "Bot"],
    files: [
      {
        path: "package.json",
        language: "json",
        content: `{
  "name": "discord-bot",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "discord.js": "^14.14.0"
  }
}`
      },
      {
        path: "index.js",
        language: "javascript",
        content: `const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('hello')
    .setDescription('Say hello!')
];

client.once('ready', async () => {
  console.log(\`Logged in as \${client.user.tag}\`);
  
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  console.log('Commands registered!');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(\`Pong! Latency: \${client.ws.ping}ms\`);
  }
  
  if (interaction.commandName === 'hello') {
    await interaction.reply(\`Hello, \${interaction.user.username}!\`);
  }
});

client.login(process.env.DISCORD_TOKEN);`
      },
      {
        path: ".env.example",
        language: "text",
        content: `DISCORD_TOKEN=your_bot_token_here`
      }
    ]
  },
  {
    id: "flask-api",
    name: "Python REST API",
    description: "Flask REST API with SQLAlchemy ORM. Clean, scalable backend structure.",
    icon: "Server",
    difficulty: "beginner",
    tags: ["Python", "Flask", "API", "SQLAlchemy"],
    files: [
      {
        path: "requirements.txt",
        language: "text",
        content: `flask==3.0.0
flask-sqlalchemy==3.1.1
flask-cors==4.0.0
python-dotenv==1.0.0`
      },
      {
        path: "app.py",
        language: "python",
        content: `from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///app.db')
db = SQLAlchemy(app)

class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    
    def to_dict(self):
        return {'id': self.id, 'name': self.name}

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok'})

@app.route('/api/items', methods=['GET'])
def get_items():
    items = Item.query.all()
    return jsonify([item.to_dict() for item in items])

@app.route('/api/items', methods=['POST'])
def create_item():
    data = request.json
    item = Item(name=data['name'])
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True, port=5000)`
      }
    ]
  },
  {
    id: "landing-page",
    name: "Landing Page",
    description: "Modern landing page with Tailwind CSS. Responsive and beautiful out of the box.",
    icon: "Layout",
    difficulty: "beginner",
    tags: ["HTML", "CSS", "Tailwind", "Landing"],
    files: [
      {
        path: "index.html",
        language: "html",
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Landing Page</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 min-h-screen">
  <nav class="container mx-auto px-6 py-4 flex justify-between items-center">
    <div class="text-white text-2xl font-bold">MyApp</div>
    <div class="space-x-4">
      <a href="#features" class="text-white/80 hover:text-white">Features</a>
      <a href="#pricing" class="text-white/80 hover:text-white">Pricing</a>
      <button class="bg-white text-purple-900 px-4 py-2 rounded-lg font-semibold hover:bg-opacity-90">
        Get Started
      </button>
    </div>
  </nav>

  <main class="container mx-auto px-6 py-20 text-center">
    <h1 class="text-5xl md:text-7xl font-bold text-white mb-6">
      Build Something Amazing
    </h1>
    <p class="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
      The all-in-one platform to bring your ideas to life. Fast, secure, and scalable.
    </p>
    <div class="flex gap-4 justify-center">
      <button class="bg-white text-purple-900 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-opacity-90">
        Start Free Trial
      </button>
      <button class="border border-white/50 text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-white/10">
        Watch Demo
      </button>
    </div>
  </main>

  <section id="features" class="container mx-auto px-6 py-20">
    <div class="grid md:grid-cols-3 gap-8">
      <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6">
        <div class="w-12 h-12 bg-purple-500 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
        <p class="text-white/70">Optimized for speed with edge computing and smart caching.</p>
      </div>
      <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6">
        <div class="w-12 h-12 bg-pink-500 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Secure by Default</h3>
        <p class="text-white/70">Enterprise-grade security with encryption at rest and in transit.</p>
      </div>
      <div class="bg-white/10 backdrop-blur-sm rounded-xl p-6">
        <div class="w-12 h-12 bg-indigo-500 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path>
          </svg>
        </div>
        <h3 class="text-xl font-semibold text-white mb-2">Fully Customizable</h3>
        <p class="text-white/70">Adapt every aspect to match your brand and workflow.</p>
      </div>
    </div>
  </section>
</body>
</html>`
      }
    ]
  },
  {
    id: "cli-tool",
    name: "CLI Tool",
    description: "Node.js command-line tool with argument parsing. Perfect for automation scripts.",
    icon: "Terminal",
    difficulty: "intermediate",
    tags: ["Node.js", "CLI", "Automation"],
    files: [
      {
        path: "package.json",
        language: "json",
        content: `{
  "name": "my-cli",
  "version": "1.0.0",
  "bin": {
    "mycli": "./index.js"
  },
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "commander": "^11.1.0",
    "chalk": "^5.3.0",
    "ora": "^7.0.1"
  }
}`
      },
      {
        path: "index.js",
        language: "javascript",
        content: `#!/usr/bin/env node
const { Command } = require('commander');
const chalk = require('chalk');

const program = new Command();

program
  .name('mycli')
  .description('A powerful CLI tool')
  .version('1.0.0');

program
  .command('greet <name>')
  .description('Greet someone')
  .option('-l, --loud', 'shout the greeting')
  .action((name, options) => {
    let greeting = \`Hello, \${name}!\`;
    if (options.loud) {
      greeting = greeting.toUpperCase();
    }
    console.log(chalk.green(greeting));
  });

program
  .command('info')
  .description('Show system information')
  .action(() => {
    console.log(chalk.blue('System Information:'));
    console.log(\`  Node.js: \${process.version}\`);
    console.log(\`  Platform: \${process.platform}\`);
    console.log(\`  Architecture: \${process.arch}\`);
    console.log(\`  Memory: \${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB used\`);
  });

program.parse();`
      }
    ]
  }
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    const template = templates.find(t => t.id === id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    return NextResponse.json(template);
  }

  const list = templates.map(({ id, name, description, icon, difficulty, tags }) => ({
    id, name, description, icon, difficulty, tags
  }));

  return NextResponse.json({ templates: list });
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { templateId, customizations } = body;

    const template = templates.find(t => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    let files = template.files.map(f => ({ ...f }));

    if (customizations?.projectName) {
      files = files.map(f => ({
        ...f,
        content: f.content.replace(/fullstack-app|discord-bot|my-cli/g, customizations.projectName)
      }));
    }

    return NextResponse.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
      },
      files,
      instructions: getInstructions(template.id)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getInstructions(templateId: string): string[] {
  const instructions: Record<string, string[]> = {
    "react-express": [
      "1. Run `npm install` to install dependencies",
      "2. Run `npm run dev` to start both frontend and backend",
      "3. Frontend runs on http://localhost:5173, API on http://localhost:3001"
    ],
    "discord-bot": [
      "1. Create a bot at https://discord.com/developers/applications",
      "2. Copy your bot token to .env file",
      "3. Run `npm install && npm start`",
      "4. Invite the bot to your server using OAuth2 URL Generator"
    ],
    "flask-api": [
      "1. Create virtual environment: `python -m venv venv`",
      "2. Activate it: `source venv/bin/activate`",
      "3. Install dependencies: `pip install -r requirements.txt`",
      "4. Run: `python app.py`"
    ],
    "landing-page": [
      "1. Open index.html in your browser",
      "2. Edit the content to match your brand",
      "3. Deploy to any static hosting (Netlify, Vercel, GitHub Pages)"
    ],
    "cli-tool": [
      "1. Run `npm install` to install dependencies",
      "2. Test with `node index.js greet World`",
      "3. Install globally with `npm link`",
      "4. Then use: `mycli greet World --loud`"
    ]
  };
  return instructions[templateId] || ["Follow the README for setup instructions"];
}
