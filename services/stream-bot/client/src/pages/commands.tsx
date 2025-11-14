import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Info, Copy } from "lucide-react";
import type { CustomCommand } from "@shared/schema";

const commandFormSchema = z.object({
  name: z.string().min(1, "Command name is required").max(50, "Command name too long"),
  response: z.string().min(1, "Response is required").max(500, "Response too long"),
  cooldown: z.coerce.number().min(0).max(86400),
  permission: z.enum(["everyone", "subs", "mods", "broadcaster"]),
  isActive: z.boolean(),
});

type CommandFormValues = z.infer<typeof commandFormSchema>;

interface VariableInfo {
  variable: string;
  description: string;
  example: string;
}

export default function Commands() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCommand, setSelectedCommand] = useState<CustomCommand | null>(null);
  const [showVariablesInfo, setShowVariablesInfo] = useState(false);

  const { data: commands, isLoading } = useQuery<CustomCommand[]>({
    queryKey: ["/api/commands"],
  });

  const { data: variables } = useQuery<VariableInfo[]>({
    queryKey: ["/api/commands-variables"],
  });

  const form = useForm<CommandFormValues>({
    resolver: zodResolver(commandFormSchema),
    defaultValues: {
      name: "",
      response: "",
      cooldown: 0,
      permission: "everyone",
      isActive: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CommandFormValues) => {
      return await apiRequest("POST", "/api/commands", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commands"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Command created",
        description: "Your custom command has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create command",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CommandFormValues> }) => {
      return await apiRequest("PATCH", `/api/commands/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commands"] });
      setIsEditDialogOpen(false);
      setSelectedCommand(null);
      form.reset();
      toast({
        title: "Command updated",
        description: "Your command has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update command",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/commands/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/commands"] });
      setIsDeleteDialogOpen(false);
      setSelectedCommand(null);
      toast({
        title: "Command deleted",
        description: "Your command has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete command",
        variant: "destructive",
      });
    },
  });

  const handleCreateCommand = (data: CommandFormValues) => {
    createMutation.mutate(data);
  };

  const handleEditCommand = (data: CommandFormValues) => {
    if (!selectedCommand) return;
    updateMutation.mutate({ id: selectedCommand.id, data });
  };

  const handleDeleteCommand = () => {
    if (!selectedCommand) return;
    deleteMutation.mutate(selectedCommand.id);
  };

  const openEditDialog = (command: CustomCommand) => {
    setSelectedCommand(command);
    form.reset({
      name: command.name,
      response: command.response,
      cooldown: command.cooldown,
      permission: command.permission as "everyone" | "subs" | "mods" | "broadcaster",
      isActive: command.isActive,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (command: CustomCommand) => {
    setSelectedCommand(command);
    setIsDeleteDialogOpen(true);
  };

  const copyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast({
      title: "Copied",
      description: `${variable} copied to clipboard`,
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Custom Commands</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage custom chat commands for your stream
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              New Command
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Custom Command</DialogTitle>
              <DialogDescription>
                Add a new command that users can trigger in chat
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateCommand)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Command Name</FormLabel>
                      <FormControl>
                        <div className="flex items-center">
                          <span className="mr-1 text-muted-foreground">!</span>
                          <Input placeholder="discord" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription>
                        The command name without the ! prefix (lowercase recommended)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="response"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Response</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Join our Discord at https://discord.gg/example"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        The message to send when the command is triggered. You can use variables like {"{user}"}, {"{count}"}, etc.
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-2"
                          onClick={() => setShowVariablesInfo(!showVariablesInfo)}
                        >
                          <Info className="h-4 w-4 mr-1" />
                          {showVariablesInfo ? "Hide" : "Show"} Variables
                        </Button>
                      </FormDescription>
                      {showVariablesInfo && variables && (
                        <div className="mt-2 p-3 bg-muted rounded-lg space-y-2">
                          <p className="text-sm font-medium">Available Variables:</p>
                          {variables.map((v) => (
                            <div key={v.variable} className="text-sm space-y-1">
                              <div className="flex items-center justify-between">
                                <code className="px-2 py-1 bg-background rounded">{v.variable}</code>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyVariable(v.variable)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              <p className="text-muted-foreground">{v.description}</p>
                              <p className="text-xs italic">{v.example}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cooldown"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cooldown (seconds)</FormLabel>
                        <FormControl>
                          <Input type="number" min={0} max={86400} {...field} />
                        </FormControl>
                        <FormDescription>
                          Time before command can be used again (0 = no cooldown)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permission"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permission Level</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select permission" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="everyone">Everyone</SelectItem>
                            <SelectItem value="subs">Subscribers</SelectItem>
                            <SelectItem value="mods">Moderators</SelectItem>
                            <SelectItem value="broadcaster">Broadcaster Only</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Who can use this command
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>
                          Enable or disable this command
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending}>
                    Create Command
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Commands</CardTitle>
          <CardDescription>
            Manage all your custom chat commands
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commands && commands.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Command</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Cooldown</TableHead>
                  <TableHead>Permission</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commands.map((command) => (
                  <TableRow key={command.id}>
                    <TableCell className="font-mono">!{command.name}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {command.response}
                    </TableCell>
                    <TableCell>
                      {command.cooldown === 0 ? "None" : `${command.cooldown}s`}
                    </TableCell>
                    <TableCell className="capitalize">{command.permission}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{command.usageCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={command.isActive ? "default" : "outline"}>
                        {command.isActive ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(command)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDeleteDialog(command)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No commands yet. Create your first custom command!
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Command
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Command</DialogTitle>
            <DialogDescription>
              Update your custom command settings
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleEditCommand)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Command Name</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <span className="mr-1 text-muted-foreground">!</span>
                        <Input placeholder="discord" {...field} />
                      </div>
                    </FormControl>
                    <FormDescription>
                      The command name without the ! prefix
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="response"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Response</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Join our Discord at https://discord.gg/example"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      The message to send when the command is triggered
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-2"
                        onClick={() => setShowVariablesInfo(!showVariablesInfo)}
                      >
                        <Info className="h-4 w-4 mr-1" />
                        {showVariablesInfo ? "Hide" : "Show"} Variables
                      </Button>
                    </FormDescription>
                    {showVariablesInfo && variables && (
                      <div className="mt-2 p-3 bg-muted rounded-lg space-y-2">
                        <p className="text-sm font-medium">Available Variables:</p>
                        {variables.map((v) => (
                          <div key={v.variable} className="text-sm space-y-1">
                            <div className="flex items-center justify-between">
                              <code className="px-2 py-1 bg-background rounded">{v.variable}</code>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => copyVariable(v.variable)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="text-muted-foreground">{v.description}</p>
                            <p className="text-xs italic">{v.example}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="cooldown"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cooldown (seconds)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} max={86400} {...field} />
                      </FormControl>
                      <FormDescription>
                        Time before command can be used again
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="permission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Permission Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select permission" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="everyone">Everyone</SelectItem>
                          <SelectItem value="subs">Subscribers</SelectItem>
                          <SelectItem value="mods">Moderators</SelectItem>
                          <SelectItem value="broadcaster">Broadcaster Only</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Who can use this command
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable or disable this command
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the command "!{selectedCommand?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCommand}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
