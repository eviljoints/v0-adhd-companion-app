//app\contacts\page.tsx
"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Plus,
  Phone,
  MessageSquare,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MoreVertical,
  Edit,
  Trash2,
  Import,
  Users2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface VIPContact {
  id: string
  user_id: string
  name: string
  relationship: string
  phone?: string
  email?: string
  notes: string
  priority: "high" | "medium" | "low"
  contact_frequency_days: number
  last_contacted: string | null
  created_at: string
  updated_at: string
}

export default function ContactsPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [contacts, setContacts] = useState<VIPContact[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<VIPContact | null>(null)
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false)
  const [importedContacts, setImportedContacts] = useState<any[]>([])
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push("/auth/login")
        return
      }

      setUser(user)
      await loadContacts(user.id)
    }

    getUser()
  }, [router])

  const loadContacts = async (userId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("vip_contacts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error loading contacts:", error)
    } else {
      setContacts(data || [])
    }
    setIsLoading(false)
  }

  const deleteContact = async (id: string) => {
    if (!user) return

    const supabase = createClient()
    const { error } = await supabase.from("vip_contacts").delete().eq("id", id).eq("user_id", user.id)

    if (error) {
      console.error("Error deleting contact:", error)
    } else {
      setContacts((prev) => prev.filter((contact) => contact.id !== id))
    }
  }

  const importMobileContacts = async () => {
    if (!("contacts" in navigator) || !("ContactsManager" in window)) {
      alert(
        "Contact import is not supported on this device. This feature works best on mobile devices with contact access.",
      )
      return
    }

    try {
      setIsImporting(true)
      const props = ["name", "tel", "email"]
      const opts = { multiple: true }

      // @ts-ignore - Contacts API is experimental
      const contacts = await navigator.contacts.select(props, opts)

      const formattedContacts = contacts.map((contact: any) => ({
        name: contact.name?.[0] || "Unknown",
        phone: contact.tel?.[0] || "",
        email: contact.email?.[0] || "",
        relationship: "",
        priority: "medium" as const,
        contact_frequency_days: 7,
        notes: "",
        selected: false,
      }))

      setImportedContacts(formattedContacts)
      setIsImportDialogOpen(true)
    } catch (error) {
      console.error("Error importing contacts:", error)
      alert("Unable to import contacts. Please make sure you grant permission when prompted.")
    } finally {
      setIsImporting(false)
    }
  }

  const saveImportedContacts = async () => {
    if (!user) return

    const selectedContacts = importedContacts.filter((contact) => contact.selected)
    if (selectedContacts.length === 0) return

    const supabase = createClient()

    try {
      const contactsToInsert = selectedContacts.map((contact) => ({
        user_id: user.id,
        name: contact.name,
        relationship: contact.relationship || "Friend",
        phone: contact.phone || null,
        email: contact.email || null,
        priority: contact.priority,
        contact_frequency_days: contact.contact_frequency_days,
        notes: contact.notes,
        last_contacted: null,
      }))

      const { error } = await supabase.from("vip_contacts").insert(contactsToInsert)

      if (error) throw error

      await loadContacts(user.id)
      setIsImportDialogOpen(false)
      setImportedContacts([])
    } catch (error) {
      console.error("Error saving imported contacts:", error)
      alert("Error saving contacts. Please try again.")
    }
  }

  const getDaysSinceLastContact = (lastContact: string | null) => {
    if (!lastContact) return 999 // Never contacted
    const now = new Date()
    const lastContactDate = new Date(lastContact)
    const diffTime = Math.abs(now.getTime() - lastContactDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const isOverdue = (contact: VIPContact) => {
    return getDaysSinceLastContact(contact.last_contacted) > contact.contact_frequency_days
  }

  const getUrgencyLevel = (contact: VIPContact) => {
    const daysSince = getDaysSinceLastContact(contact.last_contacted)
    const overdueDays = daysSince - contact.contact_frequency_days

    if (overdueDays <= 0) return "current"
    if (overdueDays <= 2) return "due"
    if (overdueDays <= 5) return "overdue"
    return "urgent"
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "current":
        return "text-green-600 bg-green-50 border-green-200"
      case "due":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "overdue":
        return "text-orange-600 bg-orange-50 border-orange-200"
      case "urgent":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-50 border-red-200"
      case "medium":
        return "text-orange-600 bg-orange-50 border-orange-200"
      case "low":
        return "text-green-600 bg-green-50 border-green-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const markAsContacted = async (id: string) => {
    if (!user) return

    const supabase = createClient()
    const { error } = await supabase
      .from("vip_contacts")
      .update({
        last_contacted: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      console.error("Error updating contact:", error)
    } else {
      setContacts((prev) =>
        prev.map((contact) => (contact.id === id ? { ...contact, last_contacted: new Date().toISOString() } : contact)),
      )
    }
  }

  if (isLoading) {
    return (
      <div className="md:pl-64">
        <div className="p-6">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  const overdueContacts = contacts.filter(isOverdue).sort((a, b) => {
    const urgencyA = getUrgencyLevel(a)
    const urgencyB = getUrgencyLevel(b)
    const urgencyOrder = { urgent: 4, overdue: 3, due: 2, current: 1 }
    return urgencyOrder[urgencyB as keyof typeof urgencyOrder] - urgencyOrder[urgencyA as keyof typeof urgencyOrder]
  })

  const upcomingContacts = contacts
    .filter((contact) => !isOverdue(contact))
    .sort((a, b) => getDaysSinceLastContact(b.last_contacted) - getDaysSinceLastContact(a.last_contacted))

  return (
    <div className="md:pl-64">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">VIP Contacts</h1>
            <p className="text-muted-foreground mt-1">Stay connected with the people who matter most</p>
          </div>
          <div className="flex gap-2">
            {/* Import Contacts Button */}
            <Button variant="outline" onClick={importMobileContacts} disabled={isImporting}>
              <Import className="h-4 w-4 mr-2" />
              {isImporting ? "Importing..." : "Import Contacts"}
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contact
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Add VIP Contact</DialogTitle>
                  <DialogDescription>Add someone important to your regular contact reminders.</DialogDescription>
                </DialogHeader>
                <ContactForm
                  user={user}
                  onClose={() => setIsDialogOpen(false)}
                  onSuccess={() => user && loadContacts(user.id)}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{overdueContacts.length}</div>
              <div className="text-sm text-gray-600">Need Contact</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-blue-600">{contacts.length}</div>
              <div className="text-sm text-gray-600">Total VIPs</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">
                {contacts.filter((c) => getDaysSinceLastContact(c.last_contacted) <= 1).length}
              </div>
              <div className="text-sm text-gray-600">Contacted Today</div>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-purple-600">
                {contacts.filter((c) => c.priority === "high").length}
              </div>
              <div className="text-sm text-gray-600">High Priority</div>
            </CardContent>
          </Card>
        </div>

        {/* Overdue Contacts */}
        {overdueContacts.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Need to Reach Out ({overdueContacts.length})
            </h2>
            <div className="grid gap-4">
              {overdueContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  isOverdue={true}
                  urgency={getUrgencyLevel(contact)}
                  onMarkContacted={markAsContacted}
                  onEdit={setEditingContact}
                  onDelete={deleteContact}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Contacts */}
        <div>
          <h2 className="text-xl font-semibold mb-4">All VIP Contacts</h2>
          {contacts.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-center py-8">
                  <p className="text-gray-600">No VIP contacts yet. Add your first one!</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {contacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  isOverdue={isOverdue(contact)}
                  urgency={getUrgencyLevel(contact)}
                  onMarkContacted={markAsContacted}
                  onEdit={setEditingContact}
                  onDelete={deleteContact}
                />
              ))}
            </div>
          )}
        </div>

        {/* Import Contacts Dialog */}
        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users2 className="h-5 w-5" />
                Import Mobile Contacts
              </DialogTitle>
              <DialogDescription>
                Select contacts from your phone to add as VIP contacts. You can customize their details after importing.
              </DialogDescription>
            </DialogHeader>

            {importedContacts.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {importedContacts.filter((c) => c.selected).length} of {importedContacts.length} contacts selected
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setImportedContacts((prev) => prev.map((c) => ({ ...c, selected: true })))}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setImportedContacts((prev) => prev.map((c) => ({ ...c, selected: false })))}
                    >
                      Clear All
                    </Button>
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto space-y-2">
                  {importedContacts.map((contact, index) => (
                    <Card key={index} className={cn("p-3", contact.selected && "ring-2 ring-blue-500")}>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={contact.selected}
                          onChange={(e) => {
                            setImportedContacts((prev) =>
                              prev.map((c, i) => (i === index ? { ...c, selected: e.target.checked } : c)),
                            )
                          }}
                          className="rounded"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{contact.name}</div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            {contact.phone && <div>📞 {contact.phone}</div>}
                            {contact.email && <div>✉️ {contact.email}</div>}
                          </div>
                        </div>
                        {contact.selected && (
                          <div className="flex gap-2">
                            <Select
                              value={contact.relationship}
                              onValueChange={(value) => {
                                setImportedContacts((prev) =>
                                  prev.map((c, i) => (i === index ? { ...c, relationship: value } : c)),
                                )
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Relationship" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Family">Family</SelectItem>
                                <SelectItem value="Friend">Friend</SelectItem>
                                <SelectItem value="Partner">Partner</SelectItem>
                                <SelectItem value="Colleague">Colleague</SelectItem>
                                <SelectItem value="Doctor">Doctor</SelectItem>
                                <SelectItem value="Therapist">Therapist</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>

                <div className="flex gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={saveImportedContacts}
                    className="flex-1"
                    disabled={importedContacts.filter((c) => c.selected).length === 0}
                  >
                    Import {importedContacts.filter((c) => c.selected).length} Contacts
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Users2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No contacts imported yet.</p>
                <Button onClick={importMobileContacts} className="mt-4" disabled={isImporting}>
                  <Import className="h-4 w-4 mr-2" />
                  {isImporting ? "Importing..." : "Import from Phone"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={!!editingContact} onOpenChange={() => setEditingContact(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit VIP Contact</DialogTitle>
              <DialogDescription>Update your VIP contact information.</DialogDescription>
            </DialogHeader>
            <ContactForm
              user={user}
              contact={editingContact}
              onClose={() => setEditingContact(null)}
              onSuccess={() => {
                user && loadContacts(user.id)
                setEditingContact(null)
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

function ContactCard({
  contact,
  isOverdue,
  urgency,
  onMarkContacted,
  onEdit,
  onDelete,
}: {
  contact: VIPContact
  isOverdue: boolean
  urgency: string
  onMarkContacted: (id: string) => void
  onEdit: (contact: VIPContact) => void
  onDelete: (id: string) => void
}) {
  const getDaysSinceLastContact = (lastContact: string | null) => {
    if (!lastContact) return 999 // Never contacted
    const now = new Date()
    const lastContactDate = new Date(lastContact)
    const diffTime = Math.abs(now.getTime() - lastContactDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "current":
        return "text-green-600 bg-green-50 border-green-200"
      case "due":
        return "text-yellow-600 bg-yellow-50 border-yellow-200"
      case "overdue":
        return "text-orange-600 bg-orange-50 border-orange-200"
      case "urgent":
        return "text-red-600 bg-red-50 border-red-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "text-red-600 bg-red-50 border-red-200"
      case "medium":
        return "text-orange-600 bg-orange-50 border-orange-200"
      case "low":
        return "text-green-600 bg-green-50 border-green-200"
      default:
        return "text-gray-600 bg-gray-50 border-gray-200"
    }
  }

  const daysSince = getDaysSinceLastContact(contact.last_contacted)
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
  }

  return (
    <Card className={cn("transition-all duration-200", isOverdue && "ring-2 ring-red-500 bg-red-50 dark:bg-red-950")}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-12 w-12">
            <AvatarImage src="/placeholder.svg" alt={contact.name} />
            <AvatarFallback className="bg-blue-100 text-blue-600">{getInitials(contact.name)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{contact.name}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">{contact.relationship}</p>

                <div className="flex items-center gap-2 mt-2">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Last contact: {daysSince === 999 ? "Never" : `${daysSince} day${daysSince !== 1 ? "s" : ""} ago`}
                  </span>
                  <Badge className={getUrgencyColor(urgency)}>
                    {urgency === "current"
                      ? "Up to date"
                      : urgency === "due"
                        ? "Due soon"
                        : urgency === "overdue"
                          ? "Overdue"
                          : "Urgent"}
                  </Badge>
                </div>

                {contact.notes && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 text-pretty">{contact.notes}</p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge className={getPriorityColor(contact.priority)}>{contact.priority} priority</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(contact)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(contact.id)} className="text-red-600">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="text-xs text-gray-500">Every {contact.contact_frequency_days} days</div>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              {/* Contact Methods */}
              {contact.phone && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`tel:${contact.phone}`}>
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`sms:${contact.phone}`}>
                      <MessageSquare className="h-3 w-3 mr-1" />
                      Text
                    </a>
                  </Button>
                </>
              )}
              {contact.email && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`mailto:${contact.email}`}>
                    <Mail className="h-3 w-3 mr-1" />
                    Email
                  </a>
                </Button>
              )}

              <Button variant="default" size="sm" onClick={() => onMarkContacted(contact.id)} className="ml-auto">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Mark as Contacted
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ContactForm({
  user,
  contact,
  onClose,
  onSuccess,
}: {
  user: User | null
  contact?: VIPContact | null
  onClose: () => void
  onSuccess: () => void
}) {
  const [formData, setFormData] = useState({
    name: contact?.name || "",
    relationship: contact?.relationship || "",
    phone: contact?.phone || "",
    email: contact?.email || "",
    priority: contact?.priority || ("medium" as "low" | "medium" | "high"),
    contact_frequency_days: contact?.contact_frequency_days?.toString() || "7",
    notes: contact?.notes || "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSubmitting(true)

    try {
      const supabase = createClient()

      const contactData = {
        name: formData.name,
        relationship: formData.relationship,
        phone: formData.phone || null,
        email: formData.email || null,
        priority: formData.priority,
        contact_frequency_days: Number.parseInt(formData.contact_frequency_days),
        notes: formData.notes,
        updated_at: new Date().toISOString(),
      }

      if (contact) {
        // Update existing contact
        const { error } = await supabase
          .from("vip_contacts")
          .update(contactData)
          .eq("id", contact.id)
          .eq("user_id", user.id)

        if (error) throw error
      } else {
        // Create new contact
        const { error } = await supabase.from("vip_contacts").insert([
          {
            user_id: user.id,
            last_contacted: null,
            ...contactData,
          },
        ])

        if (error) throw error
      }

      onSuccess()
      onClose()
    } catch (error) {
      console.error("Error saving contact:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="e.g., Mom, Sarah, Dr. Smith"
          required
        />
      </div>

      <div>
        <Label htmlFor="relationship">Relationship</Label>
        <Input
          id="relationship"
          value={formData.relationship}
          onChange={(e) => setFormData((prev) => ({ ...prev, relationship: e.target.value }))}
          placeholder="e.g., Parent, Friend, Therapist"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="+1 (555) 123-4567"
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="email@example.com"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="priority">Priority</Label>
          <Select
            value={formData.priority}
            onValueChange={(value: "low" | "medium" | "high") => setFormData((prev) => ({ ...prev, priority: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="frequency">Reminder Frequency</Label>
          <Select
            value={formData.contact_frequency_days}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, contact_frequency_days: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Daily</SelectItem>
              <SelectItem value="3">Every 3 days</SelectItem>
              <SelectItem value="7">Weekly</SelectItem>
              <SelectItem value="14">Bi-weekly</SelectItem>
              <SelectItem value="30">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
          placeholder="Any special notes about this person..."
          rows={2}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1 bg-transparent">
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? (contact ? "Updating..." : "Adding...") : contact ? "Update Contact" : "Add Contact"}
        </Button>
      </div>
    </form>
  )
}
