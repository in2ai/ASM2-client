import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2 } from "lucide-react";

/**
 * Loading Component for Admin Nodes Page
 *
 * Displays a skeleton loading state while the page is being loaded
 */
export default function Loading() {
  return (
    <div className="bg-muted/10 min-h-screen">
      <div className="mx-auto max-w-screen-2xl p-6 lg:p-8">
        {/* Header Skeleton */}
        <div className="mb-6">
          <div className="bg-muted mb-2 h-8 w-48 animate-pulse rounded" />
          <div className="bg-muted h-4 w-64 animate-pulse rounded" />
        </div>

        {/* Table Skeleton */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Nodos Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="bg-muted h-12 w-full animate-pulse rounded" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
