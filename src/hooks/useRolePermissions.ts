import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useRolePermissions() {
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setUserRole(null);
      setAllowedPages([]);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      // Get user's role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleData) {
        setUserRole(null);
        setAllowedPages([]);
        setLoading(false);
        return;
      }

      setUserRole(roleData.role);

      // Get permissions for this role
      const { data: perms } = await supabase
        .from("role_permissions")
        .select("page_key")
        .eq("role", roleData.role)
        .eq("can_access", true);

      setAllowedPages((perms || []).map((p) => p.page_key));
      setLoading(false);
    };

    fetchPermissions();
  }, [user]);

  const hasAccess = (pageKey: string) => allowedPages.includes(pageKey);

  return { userRole, allowedPages, hasAccess, loading };
}
