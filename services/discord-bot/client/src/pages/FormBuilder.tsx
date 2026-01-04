import { useState, useEffect } from "react";
import { useServerContext } from "@/contexts/ServerContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Trash2, 
  Edit2, 
  FileText, 
  Send, 
  Download,
  GripVertical,
  Eye,
  ChevronDown,
  ChevronUp,
  Copy,
  ToggleLeft,
  Hash,
  AlignLeft,
  List,
  Type
} from "lucide-react";

interface FormField {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "number";
  required: boolean;
  placeholder?: string;
  options?: string[];
  minLength?: number;
  maxLength?: number;
}

interface CustomForm {
  id: number;
  serverId: string;
  name: string;
  description: string | null;
  fields: FormField[];
  submitChannelId: string | null;
  createTicket: boolean | null;
  ticketCategoryId: number | null;
  isEnabled: boolean | null;
  buttonLabel: string | null;
  buttonEmoji: string | null;
  buttonStyle: string | null;
  embedColor: string | null;
  successMessage: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface FormSubmission {
  id: number;
  formId: number;
  serverId: string;
  userId: string;
  username: string | null;
  responses: Record<string, string | number>;
  ticketId: number | null;
  messageId: string | null;
  channelId: string | null;
  submittedAt: string | null;
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

const FIELD_TYPES = [
  { value: "text", label: "Short Text", icon: Type },
  { value: "textarea", label: "Paragraph", icon: AlignLeft },
  { value: "select", label: "Dropdown", icon: List },
  { value: "number", label: "Number", icon: Hash },
];

const BUTTON_STYLES = [
  { value: "Primary", label: "Primary (Blue)" },
  { value: "Secondary", label: "Secondary (Gray)" },
  { value: "Success", label: "Success (Green)" },
  { value: "Danger", label: "Danger (Red)" },
];

export default function FormBuilder() {
  const { selectedServerId } = useServerContext();
  const { toast } = useToast();
  
  const [forms, setForms] = useState<CustomForm[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("forms");
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [currentForm, setCurrentForm] = useState<Partial<CustomForm> | null>(null);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deployChannelId, setDeployChannelId] = useState("");
  const [submissionsDialogOpen, setSubmissionsDialogOpen] = useState(false);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [selectedFormForSubmissions, setSelectedFormForSubmissions] = useState<CustomForm | null>(null);

  useEffect(() => {
    if (selectedServerId) {
      fetchForms();
      fetchChannels();
    }
  }, [selectedServerId]);

  const fetchForms = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/servers/${selectedServerId}/forms`, {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        setForms(data);
      }
    } catch (error) {
      console.error("Error fetching forms:", error);
      toast({ title: "Error", description: "Failed to fetch forms", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchChannels = async () => {
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/channels`, {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        const channelList = data.channels || data || [];
        setChannels(channelList.filter((c: Channel) => c.type === 0));
      }
    } catch (error) {
      console.error("Error fetching channels:", error);
    }
  };

  const handleCreateForm = () => {
    setCurrentForm({
      name: "",
      description: "",
      fields: [{ id: crypto.randomUUID(), label: "", type: "text", required: false }],
      submitChannelId: null,
      createTicket: false,
      isEnabled: true,
      buttonLabel: "Open Form",
      buttonStyle: "Primary",
      embedColor: "#5865F2",
      successMessage: "Thank you for your submission!"
    });
    setEditDialogOpen(true);
  };

  const handleEditForm = (form: CustomForm) => {
    setCurrentForm({ ...form });
    setEditDialogOpen(true);
  };

  const handleSaveForm = async () => {
    if (!currentForm || !currentForm.name || !currentForm.fields?.length) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    try {
      const isNew = !currentForm.id;
      const url = isNew 
        ? `/api/servers/${selectedServerId}/forms`
        : `/api/servers/${selectedServerId}/forms/${currentForm.id}`;
      
      const response = await fetch(url, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(currentForm)
      });

      if (response.ok) {
        toast({ title: "Success", description: `Form ${isNew ? "created" : "updated"} successfully` });
        setEditDialogOpen(false);
        fetchForms();
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "Failed to save form", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error saving form:", error);
      toast({ title: "Error", description: "Failed to save form", variant: "destructive" });
    }
  };

  const handleDeleteForm = async (formId: number) => {
    if (!confirm("Are you sure you want to delete this form? All submissions will also be deleted.")) return;

    try {
      const response = await fetch(`/api/servers/${selectedServerId}/forms/${formId}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        toast({ title: "Success", description: "Form deleted successfully" });
        fetchForms();
      } else {
        toast({ title: "Error", description: "Failed to delete form", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deleting form:", error);
      toast({ title: "Error", description: "Failed to delete form", variant: "destructive" });
    }
  };

  const handleDeployForm = async () => {
    if (!currentForm?.id || !deployChannelId) {
      toast({ title: "Error", description: "Please select a channel", variant: "destructive" });
      return;
    }

    try {
      const response = await fetch(`/api/servers/${selectedServerId}/forms/${currentForm.id}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channelId: deployChannelId })
      });

      if (response.ok) {
        toast({ title: "Success", description: "Form deployed to channel successfully" });
        setDeployDialogOpen(false);
        setDeployChannelId("");
      } else {
        const error = await response.json();
        toast({ title: "Error", description: error.error || "Failed to deploy form", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error deploying form:", error);
      toast({ title: "Error", description: "Failed to deploy form", variant: "destructive" });
    }
  };

  const handleViewSubmissions = async (form: CustomForm) => {
    setSelectedFormForSubmissions(form);
    try {
      const response = await fetch(`/api/servers/${selectedServerId}/forms/${form.id}/submissions`, {
        credentials: "include"
      });
      if (response.ok) {
        const data = await response.json();
        setSubmissions(data);
        setSubmissionsDialogOpen(true);
      }
    } catch (error) {
      console.error("Error fetching submissions:", error);
      toast({ title: "Error", description: "Failed to fetch submissions", variant: "destructive" });
    }
  };

  const handleExportSubmission = async (submission: FormSubmission) => {
    try {
      const response = await fetch(
        `/api/servers/${selectedServerId}/forms/${submission.formId}/submissions/${submission.id}/export`,
        {
          method: "POST",
          credentials: "include"
        }
      );

      if (response.ok) {
        const data = await response.json();
        const blob = new Blob([data.transcript], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `submission-${submission.id}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error("Error exporting submission:", error);
      toast({ title: "Error", description: "Failed to export submission", variant: "destructive" });
    }
  };

  const addField = () => {
    if (!currentForm) return;
    setCurrentForm({
      ...currentForm,
      fields: [
        ...(currentForm.fields || []),
        { id: crypto.randomUUID(), label: "", type: "text", required: false }
      ]
    });
  };

  const updateField = (index: number, updates: Partial<FormField>) => {
    if (!currentForm?.fields) return;
    const newFields = [...currentForm.fields];
    newFields[index] = { ...newFields[index], ...updates };
    setCurrentForm({ ...currentForm, fields: newFields });
  };

  const removeField = (index: number) => {
    if (!currentForm?.fields || currentForm.fields.length <= 1) return;
    const newFields = currentForm.fields.filter((_, i) => i !== index);
    setCurrentForm({ ...currentForm, fields: newFields });
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if (!currentForm?.fields) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentForm.fields.length) return;
    
    const newFields = [...currentForm.fields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setCurrentForm({ ...currentForm, fields: newFields });
  };

  if (!selectedServerId) {
    return (
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-discord-muted mb-4" />
          <p className="text-discord-muted">Please select a server to manage forms</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-white flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Form Builder
              </CardTitle>
              <CardDescription className="text-discord-muted mt-1">
                Create custom intake forms that users can fill out via Discord modals
              </CardDescription>
            </div>
            <Button onClick={handleCreateForm} className="bg-discord-blue hover:bg-discord-blue/90">
              <Plus className="h-4 w-4 mr-2" />
              New Form
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-discord-blue border-t-transparent rounded-full" />
            </div>
          ) : forms.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-discord-muted mb-4" />
              <p className="text-discord-muted mb-4">No forms created yet</p>
              <Button onClick={handleCreateForm} variant="outline" className="border-discord-dark">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Form
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {forms.map((form) => (
                <Card key={form.id} className="bg-discord-dark border-discord-dark hover:border-discord-blue/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white truncate">{form.name}</h3>
                        <p className="text-sm text-discord-muted truncate">{form.description || "No description"}</p>
                      </div>
                      <Badge variant={form.isEnabled ? "default" : "secondary"} className="ml-2 flex-shrink-0">
                        {form.isEnabled ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-discord-muted mb-4">
                      <span>{form.fields?.length || 0} field(s)</span>
                      {form.createTicket && (
                        <Badge variant="outline" className="text-xs">Creates ticket</Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="ghost" onClick={() => handleEditForm(form)} className="text-discord-text hover:text-white">
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleViewSubmissions(form)} className="text-discord-text hover:text-white">
                        <Eye className="h-4 w-4 mr-1" />
                        Submissions
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => {
                          setCurrentForm(form);
                          setDeployDialogOpen(true);
                        }} 
                        className="text-discord-blue hover:text-discord-blue/80"
                      >
                        <Send className="h-4 w-4 mr-1" />
                        Deploy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteForm(form.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-discord-sidebar border-discord-dark max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white">
              {currentForm?.id ? "Edit Form" : "Create New Form"}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="bg-discord-dark">
              <TabsTrigger value="form">Form Details</TabsTrigger>
              <TabsTrigger value="fields">Fields</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 pr-4">
              <TabsContent value="form" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-discord-text">Form Name *</Label>
                  <Input
                    value={currentForm?.name || ""}
                    onChange={(e) => setCurrentForm({ ...currentForm, name: e.target.value })}
                    placeholder="e.g., Support Request, Application Form"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Description</Label>
                  <Textarea
                    value={currentForm?.description || ""}
                    onChange={(e) => setCurrentForm({ ...currentForm, description: e.target.value })}
                    placeholder="Describe what this form is for..."
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Submission Channel</Label>
                  <Select
                    value={currentForm?.submitChannelId || ""}
                    onValueChange={(value) => setCurrentForm({ ...currentForm, submitChannelId: value || null })}
                  >
                    <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                      <SelectValue placeholder="Select a channel" />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-sidebar border-discord-dark">
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          #{channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between p-4 bg-discord-dark rounded-lg">
                  <div>
                    <Label className="text-white">Create Ticket on Submit</Label>
                    <p className="text-sm text-discord-muted">Automatically create a support ticket when a form is submitted</p>
                  </div>
                  <Switch
                    checked={currentForm?.createTicket || false}
                    onCheckedChange={(checked) => setCurrentForm({ ...currentForm, createTicket: checked })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="fields" className="space-y-4 mt-4">
                {currentForm?.fields?.map((field, index) => (
                  <Card key={field.id} className="bg-discord-dark border-discord-dark">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <GripVertical className="h-5 w-5 text-discord-muted cursor-move" />
                        <span className="text-sm text-discord-muted">Field {index + 1}</span>
                        <div className="flex-1" />
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => moveField(index, "up")} 
                          disabled={index === 0}
                          className="h-8 w-8"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => moveField(index, "down")} 
                          disabled={index === (currentForm?.fields?.length || 0) - 1}
                          className="h-8 w-8"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => removeField(index)}
                          disabled={(currentForm?.fields?.length || 0) <= 1}
                          className="h-8 w-8 text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label className="text-discord-text">Label *</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(index, { label: e.target.value })}
                            placeholder="e.g., Your Name, Email Address"
                            className="bg-discord-sidebar border-discord-dark text-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-discord-text">Type</Label>
                          <Select
                            value={field.type}
                            onValueChange={(value: any) => updateField(index, { type: value })}
                          >
                            <SelectTrigger className="bg-discord-sidebar border-discord-dark text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-discord-sidebar border-discord-dark">
                              {FIELD_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  <div className="flex items-center gap-2">
                                    <type.icon className="h-4 w-4" />
                                    {type.label}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-discord-text">Placeholder</Label>
                          <Input
                            value={field.placeholder || ""}
                            onChange={(e) => updateField(index, { placeholder: e.target.value })}
                            placeholder="Hint text..."
                            className="bg-discord-sidebar border-discord-dark text-white"
                          />
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) => updateField(index, { required: checked })}
                            />
                            <Label className="text-discord-text">Required</Label>
                          </div>
                        </div>

                        {field.type === "select" && (
                          <div className="col-span-2 space-y-2">
                            <Label className="text-discord-text">Options (one per line)</Label>
                            <Textarea
                              value={field.options?.join("\n") || ""}
                              onChange={(e) => updateField(index, { options: e.target.value.split("\n").filter(o => o.trim()) })}
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                              className="bg-discord-sidebar border-discord-dark text-white"
                              rows={4}
                            />
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <Button onClick={addField} variant="outline" className="w-full border-dashed border-discord-dark hover:border-discord-blue">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label className="text-discord-text">Button Label</Label>
                  <Input
                    value={currentForm?.buttonLabel || ""}
                    onChange={(e) => setCurrentForm({ ...currentForm, buttonLabel: e.target.value })}
                    placeholder="Open Form"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Button Emoji</Label>
                  <Input
                    value={currentForm?.buttonEmoji || ""}
                    onChange={(e) => setCurrentForm({ ...currentForm, buttonEmoji: e.target.value })}
                    placeholder="📝"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Button Style</Label>
                  <Select
                    value={currentForm?.buttonStyle || "Primary"}
                    onValueChange={(value) => setCurrentForm({ ...currentForm, buttonStyle: value })}
                  >
                    <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-discord-sidebar border-discord-dark">
                      {BUTTON_STYLES.map((style) => (
                        <SelectItem key={style.value} value={style.value}>
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Embed Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={currentForm?.embedColor || "#5865F2"}
                      onChange={(e) => setCurrentForm({ ...currentForm, embedColor: e.target.value })}
                      className="w-12 h-10 p-1 bg-discord-dark border-discord-dark"
                    />
                    <Input
                      value={currentForm?.embedColor || "#5865F2"}
                      onChange={(e) => setCurrentForm({ ...currentForm, embedColor: e.target.value })}
                      className="flex-1 bg-discord-dark border-discord-dark text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-discord-text">Success Message</Label>
                  <Textarea
                    value={currentForm?.successMessage || ""}
                    onChange={(e) => setCurrentForm({ ...currentForm, successMessage: e.target.value })}
                    placeholder="Thank you for your submission!"
                    className="bg-discord-dark border-discord-dark text-white"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-discord-dark rounded-lg">
                  <div>
                    <Label className="text-white">Enable Form</Label>
                    <p className="text-sm text-discord-muted">Allow users to submit this form</p>
                  </div>
                  <Switch
                    checked={currentForm?.isEnabled ?? true}
                    onCheckedChange={(checked) => setCurrentForm({ ...currentForm, isEnabled: checked })}
                  />
                </div>
              </TabsContent>
            </ScrollArea>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-discord-dark">
              Cancel
            </Button>
            <Button onClick={handleSaveForm} className="bg-discord-blue hover:bg-discord-blue/90">
              {currentForm?.id ? "Save Changes" : "Create Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="bg-discord-sidebar border-discord-dark">
          <DialogHeader>
            <DialogTitle className="text-white">Deploy Form to Channel</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-discord-muted">
              Select a channel where the form button will be posted. Users can click the button to open and submit the form.
            </p>

            <div className="space-y-2">
              <Label className="text-discord-text">Channel</Label>
              <Select value={deployChannelId} onValueChange={setDeployChannelId}>
                <SelectTrigger className="bg-discord-dark border-discord-dark text-white">
                  <SelectValue placeholder="Select a channel" />
                </SelectTrigger>
                <SelectContent className="bg-discord-sidebar border-discord-dark">
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      #{channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)} className="border-discord-dark">
              Cancel
            </Button>
            <Button onClick={handleDeployForm} className="bg-discord-blue hover:bg-discord-blue/90">
              <Send className="h-4 w-4 mr-2" />
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={submissionsDialogOpen} onOpenChange={setSubmissionsDialogOpen}>
        <DialogContent className="bg-discord-sidebar border-discord-dark max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white">
              Submissions - {selectedFormForSubmissions?.name}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1">
            {submissions.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-discord-muted mb-4" />
                <p className="text-discord-muted">No submissions yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {submissions.map((submission) => (
                  <Card key={submission.id} className="bg-discord-dark border-discord-dark">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="font-medium text-white">
                            {submission.username || `User ${submission.userId}`}
                          </p>
                          <p className="text-sm text-discord-muted">
                            {submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : "Unknown"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {submission.ticketId && (
                            <Badge variant="outline">Ticket #{submission.ticketId}</Badge>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleExportSubmission(submission)}>
                            <Download className="h-4 w-4 mr-1" />
                            Export
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {selectedFormForSubmissions?.fields?.map((field) => (
                          <div key={field.id} className="grid grid-cols-3 gap-2">
                            <span className="text-discord-muted text-sm">{field.label}:</span>
                            <span className="col-span-2 text-white text-sm">
                              {submission.responses[field.id] || "(empty)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
