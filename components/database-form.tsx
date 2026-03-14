"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DatabaseDef, TableDef, FieldDef } from "@/lib/db-types"
import { Plus, Trash2, Database, Table2, KeyRound, ChevronDown, ChevronRight, Link } from "lucide-react"

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

interface DatabaseFormProps {
  initialData?: DatabaseDef | null
  onSubmit: (db: DatabaseDef) => void
  onCancel?: () => void
}

export function DatabaseForm({ initialData, onSubmit, onCancel }: DatabaseFormProps) {
  const [dbName, setDbName] = useState(initialData?.name || "")
  const [tables, setTables] = useState<TableDef[]>(
    initialData?.tables || []
  )
  const [expandedTables, setExpandedTables] = useState<Set<string>>(
    new Set(initialData?.tables.map((t) => t.id) || [])
  )

  // Auto-suggest FK references when field names match PKs in other tables
  useEffect(() => {
    setTables((prev) => {
      let changed = false
      const updated = prev.map((table) => ({
        ...table,
        fields: table.fields.map((field) => {
          // Only auto-suggest if FK is checked but no reference is set yet
          if (field.isForeignKey && !field.referencesTableId) {
            const name = field.name.toLowerCase().trim()
            if (!name) return field
            // Find a PK with matching name in another table
            for (const otherTable of prev) {
              if (otherTable.id === table.id) continue
              for (const otherField of otherTable.fields) {
                if (
                  otherField.isPrimaryKey &&
                  otherField.name.toLowerCase().trim() === name
                ) {
                  changed = true
                  return {
                    ...field,
                    referencesTableId: otherTable.id,
                    referencesFieldId: otherField.id,
                  }
                }
              }
            }
          }
          return field
        }),
      }))
      return changed ? updated : prev
    })
  }, [tables.map((t) => t.fields.map((f) => `${f.isForeignKey}-${f.name}`).join(",")).join("|")])

  const addTable = () => {
    const newTable: TableDef = {
      id: generateId(),
      name: "",
      fields: [{ id: generateId(), name: "", isPrimaryKey: false, isForeignKey: false }],
    }
    setTables([...tables, newTable])
    setExpandedTables((prev) => new Set([...prev, newTable.id]))
  }

  const removeTable = (tableId: string) => {
    // Also clear any FK references pointing to this table
    setTables(
      tables
        .filter((t) => t.id !== tableId)
        .map((t) => ({
          ...t,
          fields: t.fields.map((f) =>
            f.referencesTableId === tableId
              ? { ...f, isForeignKey: false, referencesTableId: undefined, referencesFieldId: undefined }
              : f
          ),
        }))
    )
  }

  const updateTableName = (tableId: string, name: string) => {
    setTables(
      tables.map((t) => (t.id === tableId ? { ...t, name } : t))
    )
  }

  const addField = (tableId: string) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: [
                ...t.fields,
                { id: generateId(), name: "", isPrimaryKey: false, isForeignKey: false },
              ],
            }
          : t
      )
    )
  }

  const removeField = (tableId: string, fieldId: string) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? { ...t, fields: t.fields.filter((f) => f.id !== fieldId) }
          : t
      )
    )
  }

  const updateFieldName = (
    tableId: string,
    fieldId: string,
    name: string
  ) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: t.fields.map((f) =>
                f.id === fieldId
                  ? { ...f, name, referencesTableId: undefined, referencesFieldId: undefined }
                  : f
              ),
            }
          : t
      )
    )
  }

  const togglePrimaryKey = (tableId: string, fieldId: string) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: t.fields.map((f) =>
                f.id === fieldId
                  ? { ...f, isPrimaryKey: !f.isPrimaryKey }
                  : f
              ),
            }
          : t
      )
    )
  }

  const toggleForeignKey = (tableId: string, fieldId: string) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: t.fields.map((f) =>
                f.id === fieldId
                  ? {
                      ...f,
                      isForeignKey: !f.isForeignKey,
                      referencesTableId: !f.isForeignKey ? f.referencesTableId : undefined,
                      referencesFieldId: !f.isForeignKey ? f.referencesFieldId : undefined,
                    }
                  : f
              ),
            }
          : t
      )
    )
  }

  const updateFKReference = (
    tableId: string,
    fieldId: string,
    referencesTableId: string,
    referencesFieldId?: string
  ) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: t.fields.map((f) => {
                if (f.id !== fieldId) return f
                // If table changed, auto-select the first PK of that table
                const refTable = tables.find((rt) => rt.id === referencesTableId)
                let refFieldId = referencesFieldId
                if (!refFieldId && refTable) {
                  const firstPK = refTable.fields.find((rf) => rf.isPrimaryKey)
                  refFieldId = firstPK?.id
                }
                return {
                  ...f,
                  referencesTableId,
                  referencesFieldId: refFieldId,
                }
              }),
            }
          : t
      )
    )
  }

  const updateFKField = (
    tableId: string,
    fieldId: string,
    referencesFieldId: string
  ) => {
    setTables(
      tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              fields: t.fields.map((f) =>
                f.id === fieldId ? { ...f, referencesFieldId } : f
              ),
            }
          : t
      )
    )
  }

  const toggleExpanded = (tableId: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableId)) {
        next.delete(tableId)
      } else {
        next.add(tableId)
      }
      return next
    })
  }

  const handleSubmit = () => {
    const validTables = tables
      .filter((t) => t.name.trim() !== "")
      .map((t) => ({
        ...t,
        fields: t.fields.filter((f) => f.name.trim() !== ""),
      }))
      .filter((t) => t.fields.length > 0)

    if (dbName.trim() && validTables.length > 0) {
      onSubmit({
        name: dbName.trim(),
        tables: validTables,
      })
    }
  }

  const isValid =
    dbName.trim() !== "" &&
    tables.some(
      (t) =>
        t.name.trim() !== "" &&
        t.fields.some((f) => f.name.trim() !== "")
    )

  // Helper: get other tables (for FK dropdown)
  const getOtherTables = (currentTableId: string) =>
    tables.filter((t) => t.id !== currentTableId && t.name.trim() !== "")

  // Helper: get PKs of a table (for FK field dropdown)
  const getTablePKs = (tableId: string) => {
    const table = tables.find((t) => t.id === tableId)
    if (!table) return []
    return table.fields.filter((f) => f.isPrimaryKey && f.name.trim() !== "")
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Database Name */}
      <div className="flex flex-col gap-3">
        <Label className="flex items-center gap-2 text-foreground font-semibold text-base">
          <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/15">
            <Database className="h-4 w-4 text-primary" />
          </div>
          Nom de la Base de Données
        </Label>
        <Input
          value={dbName}
          onChange={(e) => setDbName(e.target.value)}
          placeholder="ex: GestionEcole"
          className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus:ring-primary focus:border-primary h-11 text-base font-mono"
        />
      </div>

      {/* Tables */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2 text-foreground font-semibold text-base">
            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/15">
              <Table2 className="h-4 w-4 text-primary" />
            </div>
            Tables
            <span className="ml-1 text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
              {tables.length}
            </span>
          </Label>
          <Button
            onClick={addTable}
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1" />
            Ajouter Table
          </Button>
        </div>

        {tables.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-border bg-secondary/30 p-10 text-center">
            <div className="flex items-center justify-center h-14 w-14 rounded-xl bg-muted mx-auto mb-4">
              <Table2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm mb-1">
              Aucune table ajoutée
            </p>
            <p className="text-muted-foreground/60 text-xs">
              {"Cliquez sur \"Ajouter Table\" pour commencer la conception."}
            </p>
          </div>
        )}

        {tables.map((table, tIndex) => (
          <div
            key={table.id}
            className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"
          >
            {/* Table Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-secondary/70 border-b border-border/50">
              <button
                onClick={() => toggleExpanded(table.id)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={expandedTables.has(table.id) ? "Replier" : "Déplier"}
              >
                {expandedTables.has(table.id) ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <span className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded font-bold">
                T{tIndex + 1}
              </span>
              <Input
                value={table.name}
                onChange={(e) => updateTableName(table.id, e.target.value)}
                placeholder={`Nom de la table ${tIndex + 1}`}
                className="flex-1 bg-card border-border text-foreground placeholder:text-muted-foreground h-9 text-sm font-semibold"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeTable(table.id)}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                aria-label="Supprimer table"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Fields */}
            {expandedTables.has(table.id) && (
              <div className="p-4 flex flex-col gap-2">
                {/* Fields header */}
                <div className="grid grid-cols-[1fr_60px_60px_36px] gap-2 items-center px-1">
                  <span className="text-xs text-muted-foreground font-medium">
                    Nom du champ
                  </span>
                  <span className="text-xs text-muted-foreground font-medium text-center">
                    PK
                  </span>
                  <span className="text-xs text-muted-foreground font-medium text-center">
                    FK
                  </span>
                  <span className="sr-only">Actions</span>
                </div>

                {table.fields.map((field, fIndex) => {
                  const otherTables = getOtherTables(table.id)
                  const refTablePKs = field.referencesTableId
                    ? getTablePKs(field.referencesTableId)
                    : []

                  return (
                    <div key={field.id} className="flex flex-col gap-1">
                      {/* Main field row */}
                      <div className="grid grid-cols-[1fr_60px_60px_36px] gap-2 items-center">
                        <div className="flex items-center gap-2">
                          <KeyRound
                            className={`h-3.5 w-3.5 flex-shrink-0 ${
                              field.isPrimaryKey
                                ? "text-primary"
                                : field.isForeignKey
                                ? "text-[#e5a435]"
                                : "text-muted-foreground/40"
                            }`}
                          />
                          <Input
                            value={field.name}
                            onChange={(e) =>
                              updateFieldName(table.id, field.id, e.target.value)
                            }
                            placeholder={`champ_${fIndex + 1}`}
                            className="bg-secondary border-border text-foreground placeholder:text-muted-foreground h-8 text-sm font-mono"
                          />
                        </div>
                        <div className="flex justify-center">
                          <Checkbox
                          
                            checked={field.isPrimaryKey}
                            onCheckedChange={() =>
                              togglePrimaryKey(table.id, field.id)
                            }
                            className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          />
                        </div>
                        <div className="flex justify-center">
                          <Checkbox
                            checked={field.isForeignKey}
                            onCheckedChange={() =>
                              toggleForeignKey(table.id, field.id)
                            }
                            className="border-[#e5a435]/50 data-[state=checked]:bg-[#e5a435] data-[state=checked]:border-[#e5a435] "
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeField(table.id, field.id)}
                          className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                          disabled={table.fields.length <= 1}
                          aria-label="Supprimer champ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {/* FK Reference selector (shown when FK is checked) */}
                      {field.isForeignKey && (
                        <div className="ml-7 flex items-center gap-2 p-2 rounded-lg bg-[#e5a435]/5 border border-[#e5a435]/20">
                          <Link className="h-3.5 w-3.5 text-[#e5a435] flex-shrink-0" />
                          <span className="text-[10px] text-[#e5a435] font-medium whitespace-nowrap">
                            {"Réf:"}
                          </span>
                          <Select
                            value={field.referencesTableId || ""}
                            onValueChange={(value) =>
                              updateFKReference(table.id, field.id, value)
                            }
                          >
                            <SelectTrigger className="h-7 text-xs bg-card border-border text-foreground flex-1 min-w-0">
                              <SelectValue placeholder="Table mère..." />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {otherTables.map((ot) => (
                                <SelectItem
                                  key={ot.id}
                                  value={ot.id}
                                  className="text-foreground text-xs"
                                >
                                  {ot.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {field.referencesTableId && refTablePKs.length > 0 && (
                            <>
                              <span className="text-muted-foreground text-[10px]">.</span>
                              <Select
                                value={field.referencesFieldId || ""}
                                onValueChange={(value) =>
                                  updateFKField(table.id, field.id, value)
                                }
                              >
                                <SelectTrigger className="h-7 text-xs bg-card border-border text-foreground flex-1 min-w-0">
                                  <SelectValue placeholder="Clé..." />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border">
                                  {refTablePKs.map((pk) => (
                                    <SelectItem
                                      key={pk.id}
                                      value={pk.id}
                                      className="text-foreground text-xs font-mono"
                                    >
                                      {pk.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </>
                          )}
                          {field.referencesTableId && refTablePKs.length === 0 && (
                            <span className="text-destructive text-[10px]">
                              {"Aucune clé primaire dans cette table"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                <Button
                  onClick={() => addField(table.id)}
                  variant="ghost"
                  size="sm"
                  className="mt-1 text-primary hover:text-primary hover:bg-primary/10 self-start text-xs"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ajouter Champ
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            className="border-border text-foreground hover:bg-secondary"
          >
            Annuler
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!isValid}
          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {initialData ? "Mettre à jour la base" : "Générer la représentation graphique"}
        </Button>
      </div>
    </div>
  )
}
