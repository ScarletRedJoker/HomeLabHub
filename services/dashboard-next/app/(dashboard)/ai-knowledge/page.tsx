"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Database,
  Search,
  FileText,
  Link,
  Upload,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Clock,
  Layers,
  HardDrive,
  Globe,
  File,
  Type,
} from "lucide-react";

interface KnowledgeSource {
  id: string;
  name: string;
  type: "document" | "url" | "text";
  chunkCount: number;
  status: "indexed" | "processing" | "error";
  createdAt: string;
}

interface SearchResult {
  text: string;
  score: number;
  sourceId?: string;
  chunkIndex?: number;
  metadata?: Record<string, unknown>;
}

interface Stats {
  totalChunks: number;
  uniqueSources: number;
  embeddingDimension: number;
}

const sourceTypeConfig = {
  document: { icon: <File className="h-4 w-4" />, label: "Document", color: "bg-blue-500/20 text-blue-400" },
  url: { icon: <Globe className="h-4 w-4" />, label: "URL", color: "bg-green-500/20 text-green-400" },
  text: { icon: <Type className="h-4 w-4" />, label: "Text", color: "bg-purple-500/20 text-purple-400" },
};

const statusConfig = {
  indexed: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Indexed", color: "bg-green-500/20 text-green-400" },
  processing: { icon: <Loader2 className="h-3 w-3 animate-spin" />, label: "Processing", color: "bg-yellow-500/20 text-yellow-400" },
  error: { icon: <Trash2 className="h-3 w-3" />, label: "Error", color: "bg-red-500/20 text-red-400" },
};

export default function AIKnowledgePage() {
  const [stats, setStats] = useState<Stats>({ totalChunks: 0, uniqueSources: 0, embeddingDimension: 0 });
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sourceType, setSourceType] = useState<"text" | "document" | "url">("text");
  const [textContent, setTextContent] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/embeddings");
      if (res.ok) {
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
        }
        setLastUpdated(new Date().toISOString());
      }
    } catch (error) {
      console.error("Failed to fetch embeddings data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshData() {
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);

    try {
      const res = await fetch("/api/ai/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query: searchQuery, topK: 10 }),
      });

      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      } else {
        const error = await res.json();
        console.error("Search failed:", error);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setSearching(false);
    }
  }

  async function handleAddSource() {
    if (!sourceName.trim()) return;
    setAdding(true);

    try {
      let content = "";
      if (sourceType === "text") {
        content = textContent;
      } else if (sourceType === "url") {
        content = urlInput;
      }

      if (!content.trim()) {
        setAdding(false);
        return;
      }

      const chunkRes = await fetch("/api/ai/embeddings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chunk", text: content }),
      });

      if (chunkRes.ok) {
        const chunkData = await chunkRes.json();

        if (chunkData.chunks && chunkData.chunks.length > 0) {
          const embedRes = await fetch("/api/ai/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "embed",
              text: chunkData.chunks.map((c: { text: string }) => c.text),
            }),
          });

          if (embedRes.ok) {
            const newSource: KnowledgeSource = {
              id: Date.now().toString(),
              name: sourceName,
              type: sourceType,
              chunkCount: chunkData.count,
              status: "indexed",
              createdAt: new Date().toISOString(),
            };
            setSources((prev) => [...prev, newSource]);
            setStats((prev) => ({
              ...prev,
              totalChunks: prev.totalChunks + chunkData.count,
              uniqueSources: prev.uniqueSources + 1,
            }));
          }
        }
      }

      setShowAddDialog(false);
      setSourceName("");
      setTextContent("");
      setUrlInput("");
      setSourceType("text");
    } catch (error) {
      console.error("Failed to add source:", error);
    } finally {
      setAdding(false);
    }
  }

  function removeSource(id: string) {
    const source = sources.find((s) => s.id === id);
    if (source) {
      setSources((prev) => prev.filter((s) => s.id !== id));
      setStats((prev) => ({
        ...prev,
        totalChunks: Math.max(0, prev.totalChunks - source.chunkCount),
        uniqueSources: Math.max(0, prev.uniqueSources - 1),
      }));
    }
  }

  function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-500/30 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  function formatTimeAgo(date: string): string {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  const estimatedIndexSize = stats.totalChunks * stats.embeddingDimension * 4;
  const indexSizeFormatted = estimatedIndexSize > 1024 * 1024
    ? `${(estimatedIndexSize / (1024 * 1024)).toFixed(1)} MB`
    : estimatedIndexSize > 1024
    ? `${(estimatedIndexSize / 1024).toFixed(1)} KB`
    : `${estimatedIndexSize} B`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
            <Database className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Knowledge Base</h1>
            <p className="text-muted-foreground">
              Manage RAG embeddings for semantic search and AI context
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refreshData} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Knowledge Source</DialogTitle>
                <DialogDescription>
                  Add content to be indexed for semantic search
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Source Name</Label>
                  <Input
                    placeholder="My Document"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source Type</Label>
                  <Select value={sourceType} onValueChange={(v: "text" | "document" | "url") => setSourceType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">
                        <div className="flex items-center gap-2">
                          <Type className="h-4 w-4" />
                          Paste Text
                        </div>
                      </SelectItem>
                      <SelectItem value="document">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4" />
                          Upload File
                        </div>
                      </SelectItem>
                      <SelectItem value="url">
                        <div className="flex items-center gap-2">
                          <Link className="h-4 w-4" />
                          Enter URL
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sourceType === "text" && (
                  <div className="space-y-2">
                    <Label>Text Content</Label>
                    <Textarea
                      placeholder="Paste your text content here..."
                      rows={6}
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {textContent.length} characters
                    </p>
                  </div>
                )}

                {sourceType === "document" && (
                  <div className="space-y-2">
                    <Label>Upload Document</Label>
                    <div className="border-2 border-dashed rounded-lg p-8 text-center">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Drag and drop or click to upload
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports PDF, TXT, MD, DOCX
                      </p>
                      <input
                        type="file"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        accept=".pdf,.txt,.md,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              setTextContent(ev.target?.result as string || "");
                            };
                            reader.readAsText(file);
                            if (!sourceName) setSourceName(file.name);
                          }
                        }}
                      />
                    </div>
                  </div>
                )}

                {sourceType === "url" && (
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <Input
                      placeholder="https://example.com/page"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      The content will be fetched and indexed
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddSource} disabled={adding || !sourceName.trim()}>
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add & Index
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Total Sources</div>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">{stats.uniqueSources}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Total Chunks</div>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">{stats.totalChunks}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Index Size</div>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">{indexSizeFormatted}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Last Updated</div>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1">
              {lastUpdated ? formatTimeAgo(lastUpdated) : "Never"}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Knowledge Sources
            </CardTitle>
            <CardDescription>
              Documents and content indexed for search
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No sources added yet</p>
                <p className="text-sm">Add a source to start building your knowledge base</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sources.map((source) => (
                  <div
                    key={source.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${sourceTypeConfig[source.type].color}`}>
                        {sourceTypeConfig[source.type].icon}
                      </div>
                      <div>
                        <p className="font-medium">{source.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{source.chunkCount} chunks</span>
                          <span>•</span>
                          <span>{formatTimeAgo(source.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusConfig[source.status].color}>
                        {statusConfig[source.status].icon}
                        <span className="ml-1">{statusConfig[source.status].label}</span>
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeSource(source.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Semantic Search
            </CardTitle>
            <CardDescription>
              Search your knowledge base using natural language
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter your search query..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {searchResults.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {searchResults.map((result, idx) => (
                  <Card key={idx} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-3">
                          {highlightMatch(result.text, searchQuery)}
                        </p>
                        {result.sourceId && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Source: {result.sourceId}
                            {result.chunkIndex !== undefined && ` • Chunk ${result.chunkIndex + 1}`}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {(result.score * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            ) : searchQuery && !searching ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No results found</p>
                <p className="text-sm">Try a different search query</p>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Enter a query to search</p>
                <p className="text-sm">Find relevant content using semantic similarity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
