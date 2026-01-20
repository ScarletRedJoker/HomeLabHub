"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Layout,
  MessageSquare,
  Radio,
  Brain,
  Server,
  Copy,
  Check,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Terminal,
  Download,
  Info,
  ChevronDown,
  ChevronRight,
  Wand2,
} from "lucide-react";
import {
  serviceConfigs,
  EnvVariable,
  generateEnvFileContent,
  deployCommands,
} from "@/lib/env-schemas";

type Environment = "development" | "production";

const serviceIcons: Record<string, React.ReactNode> = {
  Layout: <Layout className="h-5 w-5" />,
  MessageSquare: <MessageSquare className="h-5 w-5" />,
  Radio: <Radio className="h-5 w-5" />,
  Brain: <Brain className="h-5 w-5" />,
  Server: <Server className="h-5 w-5" />,
};

function VariableInput({
  variable,
  value,
  onChange,
  error,
}: {
  variable: EnvVariable;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  const [showValue, setShowValue] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const inputType = variable.sensitive && !showValue ? "password" : "text";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor={variable.key} className="font-mono text-sm">
            {variable.key}
          </Label>
          {variable.required && (
            <Badge variant="destructive" className="text-xs px-1 py-0">
              Required
            </Badge>
          )}
          {!variable.required && (
            <Badge variant="outline" className="text-xs px-1 py-0">
              Optional
            </Badge>
          )}
        </div>
        {variable.hint && (
          <a
            href={variable.hint}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:text-blue-600 hover:underline"
          >
            Get credentials →
          </a>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{variable.description}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id={variable.key}
            type={inputType}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={variable.example || variable.default || ""}
            className={`font-mono text-sm pr-10 ${error ? "border-red-500" : value ? "border-green-500" : ""}`}
          />
          {variable.sensitive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setShowValue(!showValue)}
            >
              {showValue ? (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Eye className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
        {variable.default && !value && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(variable.default!)}
            title="Use default value"
          >
            Default
          </Button>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
      {variable.instructions && (
        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setShowInstructions(!showInstructions)}
          >
            {showInstructions ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <Info className="h-3 w-3" /> Instructions
          </button>
          {showInstructions && (
            <div className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap">
              {variable.instructions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceSection({
  serviceName,
  icon,
  description,
  variables,
  values,
  errors,
  onValueChange,
  expanded,
  onToggleExpand,
}: {
  serviceName: string;
  icon: string;
  description: string;
  variables: EnvVariable[];
  values: Record<string, string>;
  errors: Record<string, string | null>;
  onValueChange: (key: string, value: string) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const requiredCount = variables.filter((v) => v.required).length;
  const filledRequired = variables.filter((v) => v.required && values[v.key]).length;
  const filledOptional = variables.filter((v) => !v.required && values[v.key]).length;
  const hasErrors = Object.values(errors).some((e) => e !== null);

  return (
    <Card className={hasErrors ? "border-red-500/50" : filledRequired === requiredCount ? "border-green-500/50" : ""}>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              {serviceIcons[icon] || <Server className="h-5 w-5" />}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {serviceName}
                {filledRequired === requiredCount && requiredCount > 0 && (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm">
              <div className="text-muted-foreground">
                {filledRequired}/{requiredCount} required
              </div>
              {filledOptional > 0 && (
                <div className="text-muted-foreground text-xs">
                  +{filledOptional} optional
                </div>
              )}
            </div>
            {expanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-6">
          <div className="grid gap-6">
            {requiredCount > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Required Variables
                </h4>
                {variables
                  .filter((v) => v.required)
                  .map((variable) => (
                    <VariableInput
                      key={variable.key}
                      variable={variable}
                      value={values[variable.key] || ""}
                      onChange={(val) => onValueChange(variable.key, val)}
                      error={errors[variable.key] || null}
                    />
                  ))}
              </div>
            )}
            {variables.filter((v) => !v.required).length > 0 && (
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Optional Variables
                </h4>
                {variables
                  .filter((v) => !v.required)
                  .map((variable) => (
                    <VariableInput
                      key={variable.key}
                      variable={variable}
                      value={values[variable.key] || ""}
                      onChange={(val) => onValueChange(variable.key, val)}
                      error={errors[variable.key] || null}
                    />
                  ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function DeployCommandsSection({ environment }: { environment: Environment }) {
  const [copied, setCopied] = useState<string | null>(null);
  const commands = environment === "development" ? deployCommands.development : deployCommands.production;

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          <CardTitle>Deploy Commands</CardTitle>
        </div>
        <CardDescription>
          CLI commands for deploying with your environment configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(commands).map(([platform, cmds]) => (
          <div key={platform} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-medium capitalize">{platform}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copyToClipboard(cmds.join("\n"), platform)}
              >
                {copied === platform ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <pre className="bg-muted p-3 rounded-lg text-sm font-mono overflow-x-auto">
              {cmds.join("\n")}
            </pre>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function EnvSetupPage() {
  const { toast } = useToast();
  const [environment, setEnvironment] = useState<Environment>("development");
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [expandedServices, setExpandedServices] = useState<string[]>(["Dashboard"]);
  const [copied, setCopied] = useState(false);
  const [showOnlyRequired, setShowOnlyRequired] = useState(false);

  const validateValue = useCallback((variable: EnvVariable, value: string): string | null => {
    if (!value && variable.required) {
      return `${variable.key} is required`;
    }
    if (!value) return null;

    if (variable.type === "number" && isNaN(Number(value))) {
      return "Must be a number";
    }

    return null;
  }, []);

  const handleValueChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));

      const variable = serviceConfigs
        .flatMap((s) => s.variables)
        .find((v) => v.key === key);

      if (variable) {
        const error = validateValue(variable, value);
        setErrors((prev) => ({ ...prev, [key]: error }));
      }
    },
    [validateValue]
  );

  const toggleService = useCallback((serviceName: string) => {
    setExpandedServices((prev) =>
      prev.includes(serviceName)
        ? prev.filter((s) => s !== serviceName)
        : [...prev, serviceName]
    );
  }, []);

  const envFileContent = useMemo(() => {
    return generateEnvFileContent(values, environment);
  }, [values, environment]);

  const copyEnvFile = async () => {
    await navigator.clipboard.writeText(envFileContent);
    setCopied(true);
    toast({
      title: "Copied!",
      description: ".env file content copied to clipboard",
    });
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadEnvFile = () => {
    const blob = new Blob([envFileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = environment === "development" ? ".env" : ".env.production";
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Downloaded!",
      description: `${environment === "development" ? ".env" : ".env.production"} file downloaded`,
    });
  };

  const generateSecrets = () => {
    const secretFields = ["SESSION_SECRET", "POSTGRES_PASSWORD", "REDIS_PASSWORD", "SERVICE_AUTH_TOKEN", "NEBULA_AGENT_TOKEN", "JWT_SECRET", "OBS_ENCRYPTION_KEY", "STREAM_BOT_WEBHOOK_SECRET"];
    const newValues = { ...values };
    
    for (const field of secretFields) {
      if (!newValues[field]) {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        newValues[field] = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
      }
    }
    
    setValues(newValues);
    toast({
      title: "Secrets Generated",
      description: "Random secrets have been generated for empty fields",
    });
  };

  const stats = useMemo(() => {
    let totalRequired = 0;
    let filledRequired = 0;
    let totalOptional = 0;
    let filledOptional = 0;

    for (const config of serviceConfigs) {
      for (const v of config.variables) {
        if (v.required) {
          totalRequired++;
          if (values[v.key]) filledRequired++;
        } else {
          totalOptional++;
          if (values[v.key]) filledOptional++;
        }
      }
    }

    return { totalRequired, filledRequired, totalOptional, filledOptional };
  }, [values]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Wand2 className="h-7 w-7" />
            Environment Setup Wizard
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure environment variables for all Nebula Command services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={generateSecrets}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Generate Secrets
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm">
                  <strong>{stats.filledRequired}</strong>/{stats.totalRequired} required
                </span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">
                  <strong>{stats.filledOptional}</strong>/{stats.totalOptional} optional
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={showOnlyRequired}
                  onCheckedChange={setShowOnlyRequired}
                />
                Show only required
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={environment} onValueChange={(v) => setEnvironment(v as Environment)}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="development">Development</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
        </TabsList>

        <TabsContent value="development" className="space-y-4 mt-4">
          <div className="grid gap-4">
            {serviceConfigs.map((config) => (
              <ServiceSection
                key={config.name}
                serviceName={config.name}
                icon={config.icon}
                description={config.description}
                variables={
                  showOnlyRequired
                    ? config.variables.filter((v) => v.required)
                    : config.variables
                }
                values={values}
                errors={errors}
                onValueChange={handleValueChange}
                expanded={expandedServices.includes(config.name)}
                onToggleExpand={() => toggleService(config.name)}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="production" className="space-y-4 mt-4">
          <Card className="border-yellow-500/50 bg-yellow-500/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                <div>
                  <h4 className="font-medium">Production Environment</h4>
                  <p className="text-sm text-muted-foreground">
                    Use strong, unique secrets for production. Never commit production secrets to version control.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-4">
            {serviceConfigs.map((config) => (
              <ServiceSection
                key={config.name}
                serviceName={config.name}
                icon={config.icon}
                description={config.description}
                variables={
                  showOnlyRequired
                    ? config.variables.filter((v) => v.required)
                    : config.variables
                }
                values={values}
                errors={errors}
                onValueChange={handleValueChange}
                expanded={expandedServices.includes(config.name)}
                onToggleExpand={() => toggleService(config.name)}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Generated .env File
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyEnvFile}>
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={downloadEnvFile}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardDescription>
              Copy or download the generated environment file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={envFileContent}
              readOnly
              className="font-mono text-xs h-64 resize-none"
            />
          </CardContent>
        </Card>

        <DeployCommandsSection environment={environment} />
      </div>
    </div>
  );
}
