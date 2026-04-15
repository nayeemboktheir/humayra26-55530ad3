import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const ALL_PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "analytics", label: "Analytics" },
  { key: "customers", label: "Customers" },
  { key: "users", label: "Users & Profiles" },
  { key: "roles", label: "User Roles" },
  { key: "orders", label: "Orders" },
  { key: "shipments", label: "Shipments" },
  { key: "messaging", label: "Messaging" },
  { key: "refunds", label: "Refunds" },
  { key: "transactions", label: "Transactions" },
  { key: "wallets", label: "Wallets" },
  { key: "notifications", label: "Notifications" },
  { key: "wishlist", label: "Wishlist" },
  { key: "marketing", label: "Marketing" },
  { key: "settings", label: "Settings" },
  { key: "permissions", label: "Permissions" },
];

const ROLES = ["admin", "moderator", "employee"] as const;

type PermMap = Record<string, Record<string, boolean>>;

export default function AdminPermissions() {
  const [perms, setPerms] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPerms = async () => {
    setLoading(true);
    const { data } = await supabase.from("role_permissions").select("*");
    const map: PermMap = {};
    ROLES.forEach((r) => {
      map[r] = {};
      ALL_PAGES.forEach((p) => (map[r][p.key] = false));
    });
    (data || []).forEach((row: any) => {
      if (map[row.role]) map[row.role][row.page_key] = row.can_access;
    });
    setPerms(map);
    setLoading(false);
  };

  useEffect(() => { fetchPerms(); }, []);

  const toggle = (role: string, pageKey: string) => {
    if (role === "admin") return; // admin always has all access
    setPerms((prev) => ({
      ...prev,
      [role]: { ...prev[role], [pageKey]: !prev[role][pageKey] },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const role of ROLES) {
        for (const page of ALL_PAGES) {
          const canAccess = perms[role]?.[page.key] ?? false;
          const { error } = await supabase
            .from("role_permissions")
            .upsert(
              { role: role as any, page_key: page.key, can_access: canAccess },
              { onConflict: "role,page_key" }
            );
          if (error) throw error;
        }
      }
      toast({ title: "Permissions saved successfully" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Role Permissions</h1>
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {ROLES.map((role) => (
          <Card key={role}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Badge variant={role === "admin" ? "default" : role === "employee" ? "secondary" : "outline"}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ALL_PAGES.map((page) => (
                <div key={page.key} className="flex items-center justify-between">
                  <span className="text-sm">{page.label}</span>
                  <Switch
                    checked={perms[role]?.[page.key] ?? false}
                    onCheckedChange={() => toggle(role, page.key)}
                    disabled={role === "admin"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
