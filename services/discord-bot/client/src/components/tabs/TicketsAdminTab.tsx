import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TicketCategory } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useServerContext } from "@/contexts/ServerContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Edit, Trash, Loader2 } from "lucide-react";

/**
 * TicketsAdminTab Component
 * 
 * Advanced ticket queue and category management for administrators.
 * Allows admins to create, edit, and delete ticket categories.
 */
export default function TicketsAdminTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { selectedServerId } = useServerContext();
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<TicketCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');

  // Fetch categories
  const { data: categories = [], isLoading, refetch: refetchCategories } = useQuery<TicketCategory[]>({
    queryKey: ['/api/categories'],
    queryFn: () => fetch('/api/categories', {
      credentials: 'include'
    }).then(res => {
      if (!res.ok) throw new Error(`Failed to fetch categories: ${res.statusText}`);
      return res.json();
    })
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const response = await apiRequest('POST', '/api/categories', data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Category created successfully"
      });
      refetchCategories();
      setAddCategoryOpen(false);
      setNewCategoryName('');
      setNewCategoryColor('#3b82f6');
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create category",
        variant: "destructive"
      });
    }
  });

  // Update category mutation
  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string; color: string } }) => {
      const response = await apiRequest('PUT', `/api/categories/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Category updated successfully"
      });
      refetchCategories();
      setEditingCategory(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update category",
        variant: "destructive"
      });
    }
  });

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/categories/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Category deleted successfully"
      });
      refetchCategories();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete category",
        variant: "destructive"
      });
    }
  });

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive"
      });
      return;
    }

    createCategoryMutation.mutate({
      name: newCategoryName.trim(),
      color: newCategoryColor
    });
  };

  const handleUpdateCategory = () => {
    if (!editingCategory || !newCategoryName.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive"
      });
      return;
    }

    updateCategoryMutation.mutate({
      id: editingCategory.id,
      data: {
        name: newCategoryName.trim(),
        color: newCategoryColor
      }
    });
  };

  const handleDeleteCategory = (id: number) => {
    deleteCategoryMutation.mutate(id);
  };

  const handleEditClick = (category: TicketCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryColor(category.color || '#3b82f6');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-discord-blue mx-auto mb-4" />
          <p className="text-discord-text">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Category Management</h2>
          <p className="text-sm sm:text-base text-discord-muted">
            Organize support tickets by creating and managing categories.
          </p>
        </div>
        
        <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
          <DialogTrigger asChild>
            <Button className="bg-discord-blue hover:bg-discord-blue/80 h-11 w-full sm:w-auto" data-testid="button-add-category">
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-discord-sidebar border-discord-dark max-w-full sm:max-w-md mx-4">
            <DialogHeader>
              <DialogTitle className="text-white">Add New Category</DialogTitle>
              <DialogDescription className="text-discord-muted text-sm">
                Create a new ticket category for organizing support tickets.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium text-white">
                  Category Name
                </label>
                <Input
                  id="name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="bg-discord-dark border-discord-dark text-white h-11"
                  placeholder="e.g. Technical Support"
                  data-testid="input-category-name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="color" className="text-sm font-medium text-white">
                  Category Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="color"
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-14 h-11 p-1 border rounded bg-discord-dark"
                    data-testid="input-category-color"
                  />
                  <span className="text-sm text-white">{newCategoryColor}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setAddCategoryOpen(false);
                  setNewCategoryName('');
                  setNewCategoryColor('#3b82f6');
                }}
                className="border-discord-dark text-white h-11 w-full sm:w-auto"
                data-testid="button-cancel-add"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleCreateCategory}
                disabled={createCategoryMutation.isPending}
                className="bg-discord-blue hover:bg-discord-blue/80 h-11 w-full sm:w-auto"
                data-testid="button-create-category"
              >
                {createCategoryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Create Category
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Categories List */}
      <Card className="bg-discord-sidebar border-discord-dark">
        <CardHeader>
          <CardTitle className="text-white">Ticket Categories ({categories.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {categories.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-discord-muted mb-4 text-sm sm:text-base">No categories have been created yet</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="border-discord-blue text-discord-blue hover:bg-discord-blue hover:text-white h-11"
                onClick={() => setAddCategoryOpen(true)}
                data-testid="button-create-first-category"
              >
                Create your first category
              </Button>
            </div>
          ) : (
            <div className="rounded-md overflow-x-auto">
              {/* Desktop table view - hidden on mobile */}
              <div className="hidden md:block">
                <div className="grid grid-cols-5 gap-4 p-4 font-medium bg-discord-dark text-white">
                  <div>ID</div>
                  <div className="col-span-2">Name</div>
                  <div>Color</div>
                  <div>Actions</div>
                </div>
                <Separator className="bg-discord-dark" />
                {categories.map(category => (
                  <div 
                    key={category.id} 
                    className="grid grid-cols-5 gap-4 p-4 items-center hover:bg-discord-dark/50 text-white"
                    data-testid={`row-category-${category.id}`}
                  >
                    <div className="font-mono text-sm" data-testid={`text-category-id-${category.id}`}>
                      {category.id}
                    </div>
                    <div className="col-span-2 font-medium" data-testid={`text-category-name-${category.id}`}>
                      {category.name}
                    </div>
                    <div className="flex items-center">
                      <div 
                        className="w-6 h-6 rounded-full mr-2" 
                        style={{ backgroundColor: category.color }}
                        data-testid={`color-preview-${category.id}`}
                      ></div>
                      <span className="text-sm">{category.color}</span>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-11 w-11 hover:bg-discord-dark"
                        onClick={() => handleEditClick(category)}
                        data-testid={`button-edit-${category.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-11 w-11 text-red-500 hover:bg-red-500/20"
                            data-testid={`button-delete-${category.id}`}
                          >
                            <Trash className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-discord-sidebar border-discord-dark max-w-full sm:max-w-md mx-4">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Delete Category</AlertDialogTitle>
                            <AlertDialogDescription className="text-discord-muted text-sm">
                              Are you sure you want to delete "{category.name}"? 
                              This may affect existing tickets in this category.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                            <AlertDialogCancel className="bg-discord-dark border-discord-dark text-white h-11 w-full sm:w-auto m-0">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteCategory(category.id)}
                              className="bg-red-500 hover:bg-red-600 text-white h-11 w-full sm:w-auto"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile card view */}
              <div className="md:hidden space-y-3 p-4">
                {categories.map(category => (
                  <Card 
                    key={category.id}
                    className="bg-discord-dark border-discord-sidebar"
                    data-testid={`card-category-${category.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="font-medium text-white mb-1" data-testid={`text-category-name-${category.id}`}>
                            {category.name}
                          </div>
                          <div className="text-xs text-discord-muted font-mono">
                            ID: {category.id}
                          </div>
                        </div>
                        <div 
                          className="w-8 h-8 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: category.color }}
                          data-testid={`color-preview-${category.id}`}
                        ></div>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 h-11 border-discord-sidebar hover:bg-discord-sidebar"
                          onClick={() => handleEditClick(category)}
                          data-testid={`button-edit-${category.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="outline"
                              size="sm"
                              className="flex-1 h-11 text-red-500 border-red-500/20 hover:bg-red-500/20"
                              data-testid={`button-delete-${category.id}`}
                            >
                              <Trash className="h-4 w-4 mr-2" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-discord-sidebar border-discord-dark max-w-full sm:max-w-md mx-4">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-white">Delete Category</AlertDialogTitle>
                              <AlertDialogDescription className="text-discord-muted text-sm">
                                Are you sure you want to delete "{category.name}"? 
                                This may affect existing tickets in this category.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                              <AlertDialogCancel className="bg-discord-dark border-discord-dark text-white h-11 w-full sm:w-auto m-0">
                                Cancel
                              </AlertDialogCancel>
                              <AlertDialogAction 
                                onClick={() => handleDeleteCategory(category.id)}
                                className="bg-red-500 hover:bg-red-600 text-white h-11 w-full sm:w-auto"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Category Dialog */}
      {editingCategory && (
        <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
          <DialogContent className="bg-discord-sidebar border-discord-dark max-w-full sm:max-w-md mx-4">
            <DialogHeader>
              <DialogTitle className="text-white">Edit Category</DialogTitle>
              <DialogDescription className="text-discord-muted text-sm">
                Update the category name and color.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="edit-name" className="text-sm font-medium text-white">
                  Category Name
                </label>
                <Input
                  id="edit-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="bg-discord-dark border-discord-dark text-white h-11"
                  placeholder="e.g. Technical Support"
                  data-testid="input-edit-category-name"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-color" className="text-sm font-medium text-white">
                  Category Color
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="edit-color"
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-14 h-11 p-1 border rounded bg-discord-dark"
                    data-testid="input-edit-category-color"
                  />
                  <span className="text-sm text-white">{newCategoryColor}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditingCategory(null);
                  setNewCategoryName('');
                  setNewCategoryColor('#3b82f6');
                }}
                className="border-discord-dark text-white h-11 w-full sm:w-auto"
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateCategory}
                disabled={updateCategoryMutation.isPending}
                className="bg-discord-blue hover:bg-discord-blue/80 h-11 w-full sm:w-auto"
                data-testid="button-update-category"
              >
                {updateCategoryMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Update Category
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
