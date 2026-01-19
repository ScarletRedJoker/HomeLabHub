"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Link2,
  QrCode,
  Copy,
  Download,
  Loader2,
  ExternalLink,
  Trash2,
  BarChart3,
  Plus,
} from "lucide-react";

interface ShortUrl {
  id: string;
  shortCode: string;
  originalUrl: string;
  title: string | null;
  createdAt: string;
  expiresAt: string | null;
  clickCount: number;
  lastClickedAt: string | null;
  isActive: boolean;
}

export default function MarketingPage() {
  const [urls, setUrls] = useState<ShortUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [qrSize, setQrSize] = useState("256");
  const [qrFormat, setQrFormat] = useState("png");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [generatingQr, setGeneratingQr] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchUrls();
  }, []);

  const fetchUrls = async () => {
    try {
      const res = await fetch("/api/shortener");
      if (res.ok) {
        const data = await res.json();
        setUrls(data.urls || []);
      }
    } catch (error) {
      console.error("Failed to fetch URLs:", error);
    } finally {
      setLoading(false);
    }
  };

  const createShortUrl = async () => {
    if (!urlInput.trim()) {
      toast({ title: "Error", description: "Please enter a URL", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/shortener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: urlInput,
          title: titleInput || undefined,
          customCode: customCode || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      toast({ title: "Success", description: "Short URL created successfully" });
      setUrlInput("");
      setTitleInput("");
      setCustomCode("");
      fetchUrls();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (code: string) => {
    const fullUrl = `${window.location.origin}/api/s/${code}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied", description: "Short URL copied to clipboard" });
  };

  const deleteUrl = async (id: string) => {
    try {
      const res = await fetch(`/api/shortener?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "Success", description: "URL deactivated" });
        fetchUrls();
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const generateQrCode = async (directData?: string) => {
    const dataToEncode = directData || qrInput.trim();
    if (!dataToEncode) {
      toast({ title: "Error", description: "Please enter text or URL", variant: "destructive" });
      return;
    }

    setGeneratingQr(true);
    try {
      const res = await fetch("/api/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: dataToEncode,
          size: parseInt(qrSize),
          format: qrFormat,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return;
      }

      setQrDataUrl(data.dataUrl);
      toast({ title: "Success", description: "QR code generated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setGeneratingQr(false);
    }
  };

  const downloadQrCode = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qrcode.${qrFormat}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Marketing Tools</h1>
        <p className="text-muted-foreground mt-1">URL shortener and QR code generator</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              URL Shortener
            </CardTitle>
            <CardDescription>Create short, shareable links</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url">Original URL</Label>
              <Input
                id="url"
                placeholder="https://example.com/very-long-url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="My Link"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customCode">Custom Code (optional)</Label>
                <Input
                  id="customCode"
                  placeholder="my-link"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value)}
                  maxLength={10}
                />
              </div>
            </div>
            <Button onClick={createShortUrl} disabled={creating} className="w-full">
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Short URL
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              QR Code Generator
            </CardTitle>
            <CardDescription>Generate QR codes for any text or URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qrInput">Text or URL</Label>
              <Input
                id="qrInput"
                placeholder="https://example.com or any text"
                value={qrInput}
                onChange={(e) => setQrInput(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={qrSize} onValueChange={setQrSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="128">128 x 128</SelectItem>
                    <SelectItem value="256">256 x 256</SelectItem>
                    <SelectItem value="512">512 x 512</SelectItem>
                    <SelectItem value="1024">1024 x 1024</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={qrFormat} onValueChange={setQrFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="svg">SVG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => generateQrCode()} disabled={generatingQr} className="w-full">
              {generatingQr ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <QrCode className="h-4 w-4 mr-2" />
              )}
              Generate QR Code
            </Button>

            {qrDataUrl && (
              <div className="flex flex-col items-center gap-4 pt-4 border-t">
                <img src={qrDataUrl} alt="QR Code" className="max-w-[200px] rounded-lg border" />
                <Button variant="outline" onClick={downloadQrCode}>
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Your Short URLs
          </CardTitle>
          <CardDescription>Track clicks and manage your links</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : urls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No short URLs created yet. Create your first one above!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title / Code</TableHead>
                    <TableHead>Original URL</TableHead>
                    <TableHead className="text-center">Clicks</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {urls.filter(u => u.isActive).map((url) => (
                    <TableRow key={url.id}>
                      <TableCell>
                        <div className="font-medium">{url.title || url.shortCode}</div>
                        <div className="text-sm text-muted-foreground font-mono">/{url.shortCode}</div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        <a
                          href={url.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1"
                        >
                          {url.originalUrl.substring(0, 40)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </TableCell>
                      <TableCell className="text-center font-medium">{url.clickCount}</TableCell>
                      <TableCell>{formatDate(url.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => copyToClipboard(url.shortCode)}
                            title="Copy short URL"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              const shortUrl = `${window.location.origin}/api/s/${url.shortCode}`;
                              setQrInput(shortUrl);
                              generateQrCode(shortUrl);
                            }}
                            title="Generate QR Code"
                          >
                            <QrCode className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteUrl(url.id)}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
