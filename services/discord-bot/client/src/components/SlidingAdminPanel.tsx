import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { TicketCategory, Ticket } from '@shared/schema';
import { getCategoryColor, getStatusColor, getPriorityColor } from '@/lib/ticketUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuthContext } from '@/components/AuthProvider';
import { Edit, Loader2, Plus, RefreshCw, Trash, X } from 'lucide-react';
import ChannelManager from '@/components/ChannelManager';

interface SlidingAdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SlidingAdminPanel({ isOpen, onClose }: SlidingAdminPanelProps) {
  const { toast } = useToast();
  const { user } = useAuthContext();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#3b82f6');
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  
  const { 
    data: tickets = [] as Ticket[], 
    isLoading: isLoadingTickets,
    refetch: refetchTickets
  } = useQuery<Ticket[]>({
    queryKey: ['/api/tickets'],
    enabled: isOpen // Only fetch data when panel is open
  });
  
  const { 
    data: categories = [] as TicketCategory[], 
    isLoading: isLoadingCategories,
    refetch: refetchCategories
  } = useQuery<TicketCategory[]>({
    queryKey: ['/api/categories'],
    enabled: isOpen
  });
  
  const { 
    data: stats,
    isLoading: isLoadingStats,
    refetch: refetchStats
  } = useQuery({
    queryKey: ['/api/admin/stats'],
    enabled: isOpen && !!user?.isAdmin
  });
  
  // Calculate ticket stats
  const openTickets = tickets.filter(ticket => ticket.status === 'open').length;
  const closedTickets = tickets.filter(ticket => ticket.status === 'closed').length;
  const pendingTickets = tickets.filter(ticket => ticket.status === 'pending').length;
  
  const handleRefreshData = () => {
    refetchTickets();
    refetchCategories();
    refetchStats();
    toast({
      title: 'Data refreshed',
      description: 'The admin panel data has been refreshed',
    });
  };
  
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        title: 'Error',
        description: 'Category name cannot be empty',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newCategoryName,
          color: newCategoryColor
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create category');
      }
      
      setNewCategoryName('');
      setNewCategoryColor('#3b82f6');
      setAddCategoryOpen(false);
      refetchCategories();
      
      toast({
        title: 'Success',
        description: `Category "${newCategoryName}" has been created`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create category',
        variant: 'destructive'
      });
    }
  };
  
  const renderCategoryStats = (categoryId: number) => {
    const category = categories.find(c => c.id === categoryId);
    return category ? category.name : 'Uncategorized';
  };

  if (isLoadingTickets || isLoadingCategories || isLoadingStats) {
    return (
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:w-[800px] lg:w-[1000px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Admin Panel</SheetTitle>
            <SheetDescription>
              Manage tickets, categories, and view overall system statistics
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-center h-64 mt-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-lg">Loading admin panel...</span>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[800px] lg:w-[1000px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="text-2xl">Admin Panel</SheetTitle>
              <SheetDescription>
                Manage tickets, categories, and view overall system statistics
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Logged in as: <span className="font-medium">{user?.username}</span>
              </p>
              <Button variant="outline" size="sm" onClick={handleRefreshData}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
            </div>
          </div>
        </SheetHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Open Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-500">{openTickets}</div>
              <p className="text-sm text-muted-foreground">
                {openTickets === 1 ? 'Ticket' : 'Tickets'} waiting for response
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Pending Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-yellow-500">{pendingTickets}</div>
              <p className="text-sm text-muted-foreground">
                {pendingTickets === 1 ? 'Ticket' : 'Tickets'} in progress
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Closed Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-500">{closedTickets}</div>
              <p className="text-sm text-muted-foreground">
                {closedTickets === 1 ? 'Ticket has' : 'Tickets have'} been resolved
              </p>
            </CardContent>
          </Card>
        </div>
        
        <Tabs defaultValue="overview" className="mb-8">
          <TabsList className="mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Tickets</CardTitle>
                </CardHeader>
                <CardContent>
                  {tickets.length === 0 ? (
                    <p className="text-muted-foreground">No tickets found</p>
                  ) : (
                    <div className="space-y-4">
                      {tickets.slice(0, 5).map(ticket => (
                        <div key={ticket.id} className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{ticket.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {ticket.createdAt && new Date(ticket.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge className={getStatusColor(ticket.status)}>{ticket.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Category Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {categories.length === 0 ? (
                    <p className="text-muted-foreground">No categories found</p>
                  ) : (
                    <div className="space-y-4">
                      {categories.map(category => {
                        const categoryTickets = tickets.filter(
                          t => t.categoryId === category.id
                        );
                        const percentage = tickets.length 
                          ? Math.round((categoryTickets.length / tickets.length) * 100) 
                          : 0;
                        
                        return (
                          <div key={category.id}>
                            <div className="flex justify-between items-center mb-1">
                              <p className="font-medium">{category.name}</p>
                              <span className="text-sm">{categoryTickets.length} tickets ({percentage}%)</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-2.5">
                              <div 
                                className="h-2.5 rounded-full" 
                                style={{ 
                                  width: `${percentage}%`,
                                  backgroundColor: category.color || '#3b82f6'
                                }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          
          <TabsContent value="tickets">
            <Card>
              <CardHeader>
                <CardTitle>All Tickets</CardTitle>
              </CardHeader>
              <CardContent>
                {tickets.length === 0 ? (
                  <p className="text-muted-foreground">No tickets found</p>
                ) : (
                  <div className="rounded-md border">
                    <div className="grid grid-cols-6 gap-4 p-4 font-medium bg-muted">
                      <div>ID</div>
                      <div className="col-span-2">Title</div>
                      <div>Category</div>
                      <div>Priority</div>
                      <div>Status</div>
                    </div>
                    <Separator />
                    {tickets.map(ticket => (
                      <div key={ticket.id} className="grid grid-cols-6 gap-4 p-4 items-center hover:bg-muted/50">
                        <div className="font-mono text-sm">{ticket.id}</div>
                        <div className="col-span-2">
                          <p className="font-medium">{ticket.title}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {ticket.description.substring(0, 50)}
                            {ticket.description.length > 50 ? '...' : ''}
                          </p>
                        </div>
                        <div>
                          <Badge 
                            style={{ 
                              backgroundColor: ticket.categoryId 
                                ? getCategoryColor(ticket.categoryId) 
                                : 'var(--primary)' 
                            }}
                          >
                            {ticket.categoryId 
                              ? renderCategoryStats(ticket.categoryId) 
                              : 'Uncategorized'}
                          </Badge>
                        </div>
                        <div>
                          <Badge className={getPriorityColor(ticket.priority || 'medium')}>
                            {ticket.priority || 'medium'}
                          </Badge>
                        </div>
                        <div>
                          <Badge className={getStatusColor(ticket.status)}>
                            {ticket.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="categories">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Category Management</h3>
              <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Category
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Category</DialogTitle>
                    <DialogDescription>
                      Create a new ticket category for organizing support tickets.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label htmlFor="name" className="text-sm font-medium">
                        Category Name
                      </label>
                      <input
                        id="name"
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        className="w-full p-2 border rounded-md"
                        placeholder="e.g. Technical Support"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="color" className="text-sm font-medium">
                        Category Color
                      </label>
                      <div className="flex items-center space-x-2">
                        <input
                          id="color"
                          type="color"
                          value={newCategoryColor}
                          onChange={(e) => setNewCategoryColor(e.target.value)}
                          className="w-12 h-8 p-1 border rounded"
                        />
                        <span className="text-sm">{newCategoryColor}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setAddCategoryOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateCategory}>
                      Create Category
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            
            <Card>
              <CardContent className="p-0">
                {categories.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-muted-foreground">No categories have been created yet</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2"
                      onClick={() => setAddCategoryOpen(true)}
                    >
                      Create your first category
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-md">
                    <div className="grid grid-cols-5 gap-4 p-4 font-medium bg-muted">
                      <div>ID</div>
                      <div className="col-span-2">Name</div>
                      <div>Color</div>
                      <div>Actions</div>
                    </div>
                    <Separator />
                    {categories.map(category => (
                      <div key={category.id} className="grid grid-cols-5 gap-4 p-4 items-center hover:bg-muted/50">
                        <div className="font-mono text-sm">{category.id}</div>
                        <div className="col-span-2 font-medium">{category.name}</div>
                        <div className="flex items-center">
                          <div 
                            className="w-6 h-6 rounded-full mr-2" 
                            style={{ backgroundColor: category.color }}
                          ></div>
                          <span className="text-sm">{category.color}</span>
                        </div>
                        <div className="flex space-x-2">
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                            <Trash className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="channels">
            <ChannelManager />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}