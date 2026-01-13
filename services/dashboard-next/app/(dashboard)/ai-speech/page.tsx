"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Volume2,
  Mic,
  Play,
  Loader2,
  Upload,
  FileAudio,
  Languages,
  Clock,
  Activity,
} from "lucide-react";

interface TTSResult {
  success: boolean;
  audioUrl?: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  error?: string;
}

interface STTResult {
  success: boolean;
  text?: string;
  language?: string;
  durationMs?: number;
  provider?: string;
  model?: string;
  error?: string;
}

export default function AISpeechPage() {
  const [activeTab, setActiveTab] = useState("tts");

  const [ttsText, setTtsText] = useState("");
  const [ttsModel, setTtsModel] = useState("edge-tts");
  const [ttsLanguage, setTtsLanguage] = useState("en");
  const [ttsVoice, setTtsVoice] = useState("");
  const [ttsLoading, setTtsLoading] = useState(false);
  const [ttsResult, setTtsResult] = useState<TTSResult | null>(null);

  const [sttFile, setSttFile] = useState<File | null>(null);
  const [sttModel, setSttModel] = useState("whisper-small");
  const [sttLoading, setSttLoading] = useState(false);
  const [sttResult, setSttResult] = useState<STTResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleGenerateSpeech() {
    if (!ttsText.trim()) return;

    setTtsLoading(true);
    setTtsResult(null);

    try {
      const res = await fetch("/api/ai/speech/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ttsText,
          model: ttsModel,
          language: ttsLanguage,
          voice: ttsVoice || undefined,
        }),
      });

      const data = await res.json();
      setTtsResult(data);
    } catch (error) {
      setTtsResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate speech",
      });
    } finally {
      setTtsLoading(false);
    }
  }

  async function handleTranscribe() {
    if (!sttFile) return;

    setSttLoading(true);
    setSttResult(null);

    try {
      const formData = new FormData();
      formData.append("audio", sttFile);
      formData.append("model", sttModel);

      const res = await fetch("/api/ai/speech/stt", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setSttResult(data);
    } catch (error) {
      setSttResult({
        success: false,
        error: error instanceof Error ? error.message : "Failed to transcribe audio",
      });
    } finally {
      setSttLoading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSttFile(file);
      setSttResult(null);
    }
  }

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="h-6 w-6 text-blue-500" />
          Speech Testing
        </h1>
        <p className="text-muted-foreground">
          Test text-to-speech and speech-to-text capabilities
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="tts" className="flex items-center gap-2">
            <Volume2 className="h-4 w-4" />
            Text to Speech
          </TabsTrigger>
          <TabsTrigger value="stt" className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Speech to Text
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tts" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Volume2 className="h-5 w-5 text-blue-500" />
                  Generate Speech
                </CardTitle>
                <CardDescription>
                  Convert text to natural-sounding speech
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Text to Convert</Label>
                  <Textarea
                    placeholder="Enter the text you want to convert to speech..."
                    value={ttsText}
                    onChange={(e) => setTtsText(e.target.value)}
                    rows={5}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    {ttsText.length} / 5000 characters
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Select value={ttsModel} onValueChange={setTtsModel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="edge-tts">Edge TTS (Fast)</SelectItem>
                        <SelectItem value="piper">Piper (Local)</SelectItem>
                        <SelectItem value="xtts">XTTS (High Quality)</SelectItem>
                        <SelectItem value="openai">OpenAI TTS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select value={ttsLanguage} onValueChange={setTtsLanguage}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="it">Italian</SelectItem>
                        <SelectItem value="pt">Portuguese</SelectItem>
                        <SelectItem value="zh">Chinese</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                        <SelectItem value="ko">Korean</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Voice (Optional)</Label>
                  <Input
                    placeholder="Leave empty for default voice"
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                  />
                </div>

                <Button
                  onClick={handleGenerateSpeech}
                  disabled={ttsLoading || !ttsText.trim()}
                  className="w-full"
                >
                  {ttsLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Generate Speech
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Audio Output</CardTitle>
                <CardDescription>
                  Listen to the generated speech
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg bg-muted/50 min-h-[200px] flex items-center justify-center p-6">
                  {ttsLoading ? (
                    <div className="text-center">
                      <Loader2 className="h-12 w-12 animate-spin mx-auto mb-3 text-blue-500" />
                      <p className="text-muted-foreground">Generating audio...</p>
                    </div>
                  ) : ttsResult?.success && ttsResult.audioUrl ? (
                    <div className="w-full space-y-4">
                      <audio
                        src={ttsResult.audioUrl}
                        controls
                        className="w-full"
                        autoPlay
                      />
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {ttsResult.durationMs
                            ? formatDuration(ttsResult.durationMs)
                            : "N/A"}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Activity className="h-4 w-4" />
                          {ttsResult.model || ttsResult.provider || "Unknown"}
                        </div>
                      </div>
                    </div>
                  ) : ttsResult?.error ? (
                    <div className="text-center text-red-400">
                      <p className="font-medium">Error</p>
                      <p className="text-sm">{ttsResult.error}</p>
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <Volume2 className="h-16 w-16 mx-auto mb-3 opacity-50" />
                      <p>Generated audio will appear here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stt" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mic className="h-5 w-5 text-green-500" />
                  Transcribe Audio
                </CardTitle>
                <CardDescription>
                  Convert speech to text using Whisper
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Audio File</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/wav,audio/mp3,audio/mpeg,audio/webm,audio/ogg"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    {sttFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileAudio className="h-8 w-8 text-green-500" />
                        <div className="text-left">
                          <p className="font-medium">{sttFile.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(sttFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-muted-foreground">
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          WAV, MP3, WebM, OGG
                        </p>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Model</Label>
                  <Select value={sttModel} onValueChange={setSttModel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whisper-small">
                        Whisper Small (Fast)
                      </SelectItem>
                      <SelectItem value="whisper-medium">
                        Whisper Medium (Balanced)
                      </SelectItem>
                      <SelectItem value="whisper-large">
                        Whisper Large (Accurate)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleTranscribe}
                  disabled={sttLoading || !sttFile}
                  className="w-full"
                >
                  {sttLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Transcribing...
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2" />
                      Transcribe
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transcription Result</CardTitle>
                <CardDescription>
                  Detected text from the audio file
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg bg-muted/50 min-h-[200px] p-4">
                  {sttLoading ? (
                    <div className="flex items-center justify-center h-full min-h-[168px]">
                      <div className="text-center">
                        <Loader2 className="h-12 w-12 animate-spin mx-auto mb-3 text-green-500" />
                        <p className="text-muted-foreground">
                          Transcribing audio...
                        </p>
                      </div>
                    </div>
                  ) : sttResult?.success && sttResult.text ? (
                    <div className="space-y-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <p className="whitespace-pre-wrap">{sttResult.text}</p>
                      </div>
                      <div className="flex flex-wrap gap-4 pt-4 border-t text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Languages className="h-4 w-4" />
                          {sttResult.language?.toUpperCase() || "Unknown"}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          {sttResult.durationMs
                            ? formatDuration(sttResult.durationMs)
                            : "N/A"}
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Activity className="h-4 w-4" />
                          {sttResult.model || sttResult.provider || "Unknown"}
                        </div>
                      </div>
                    </div>
                  ) : sttResult?.error ? (
                    <div className="flex items-center justify-center h-full min-h-[168px]">
                      <div className="text-center text-red-400">
                        <p className="font-medium">Error</p>
                        <p className="text-sm">{sttResult.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-[168px]">
                      <div className="text-center text-muted-foreground">
                        <FileAudio className="h-16 w-16 mx-auto mb-3 opacity-50" />
                        <p>Transcription will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
