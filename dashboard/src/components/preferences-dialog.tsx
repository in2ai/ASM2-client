"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type LogtoUser } from "@/lib/auth";
import { api } from "@/trpc/react";
import { Loader2, Settings } from "lucide-react";
import { useEffect, useState } from "react";

interface PreferencesDialogProps {
  readonly user: LogtoUser | null;
}

export function PreferencesDialog({ user }: PreferencesDialogProps) {
  const [open, setOpen] = useState(false);

  // Fetch current preferences
  const { data: preferences, isLoading } = api.preferences.get.useQuery(
    undefined,
    {
      enabled: open && !!user,
    },
  );

  // Mutation to update preferences
  const updateMutation = api.preferences.update.useMutation({
    onSuccess: () => {
      setOpen(false);
    },
  });

  // Mutation to reset preferences
  const resetMutation = api.preferences.reset.useMutation({
    onSuccess: () => {
      setOpen(false);
    },
  });

  // Form state
  const [defaultDateRange, setDefaultDateRange] = useState<number>(30);
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  // Load preferences into form when they're fetched
  useEffect(() => {
    if (preferences) {
      if (preferences.defaultDateRange !== undefined) {
        setDefaultDateRange(preferences.defaultDateRange);
      }
      if (preferences.theme !== undefined) {
        setTheme(preferences.theme);
      }
    }
  }, [preferences]);

  const handleSave = () => {
    updateMutation.mutate({
      defaultDateRange,
      theme,
    });
  };

  const handleReset = () => {
    if (
      confirm(
        "¿Estás seguro de que quieres restablecer todas las preferencias a los valores predeterminados?",
      )
    ) {
      resetMutation.mutate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Preferencias
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Preferencias de usuario</DialogTitle>
          <DialogDescription>
            Configura tus preferencias predeterminadas para el dashboard
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Default Date Range */}
            <div className="space-y-2">
              <Label htmlFor="dateRange">Rango de fechas predeterminado</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="dateRange"
                  type="number"
                  min="1"
                  max="365"
                  value={defaultDateRange}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setDefaultDateRange(
                      Number.parseInt(e.target.value, 10) || 30,
                    )
                  }
                  className="w-24"
                />
                <span className="text-muted-foreground text-sm">días</span>
              </div>
              <p className="text-muted-foreground text-xs">
                El dashboard mostrará datos de los últimos {defaultDateRange}{" "}
                días por defecto
              </p>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <Label htmlFor="theme">Tema</Label>
              <Select
                value={theme}
                onValueChange={(value: string) =>
                  setTheme(value as "light" | "dark" | "system")
                }
              >
                <SelectTrigger id="theme">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Claro</SelectItem>
                  <SelectItem value="dark">Oscuro</SelectItem>
                  <SelectItem value="system">Sistema</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Apariencia de la interfaz
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={
              isLoading || updateMutation.isPending || resetMutation.isPending
            }
          >
            Restablecer
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={updateMutation.isPending || resetMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isLoading || updateMutation.isPending || resetMutation.isPending
              }
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
