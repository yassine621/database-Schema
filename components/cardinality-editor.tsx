"use client"

import { Relation, DatabaseDef } from "@/lib/db-types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowRight } from "lucide-react"

interface CardinalityEditorProps {
  relations: Relation[]
  database: DatabaseDef
  onUpdateCardinality: (
    fromTableId: string,
    fromFieldId: string,
    toTableId: string,
    toFieldId: string,
    cardinalityFrom: string,
    cardinalityTo: string
  ) => void
}

const CARDINALITY_OPTIONS = [
  { value: "1", label: "1" },
  { value: "n", label: "n" },
  { value: "0", label: "0" },
]

export function CardinalityEditor({
  relations,
  database,
  onUpdateCardinality,
}: CardinalityEditorProps) {
  const getTableName = (tableId: string) =>
    database.tables.find((t) => t.id === tableId)?.name || "?"

  const getFieldName = (tableId: string, fieldId: string) =>
    database.tables
      .find((t) => t.id === tableId)
      ?.fields.find((f) => f.id === fieldId)?.name || "?"

  if (relations.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground text-sm">
          Aucune relation référentielle détectée.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Chaque relation a une cardinalité par table. Par exemple: <span className="font-mono text-primary">1</span> dans Table Mère et <span className="font-mono text-primary">n</span> dans Table Fille.
      </p>
      {relations.map((rel, index) => {
        const fromTable = getTableName(rel.fromTableId)
        const fromField = getFieldName(rel.fromTableId, rel.fromFieldId)
        const toTable = getTableName(rel.toTableId)
        const toField = getFieldName(rel.toTableId, rel.toFieldId)

        return (
          <div
            key={`${rel.fromTableId}-${rel.fromFieldId}-${rel.toTableId}-${rel.toFieldId}-${index}`}
            className="rounded-lg border border-border bg-secondary/50 p-3 flex flex-col gap-3"
          >
            {/* Relation header */}
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span className="font-mono text-[#e5a435] font-semibold text-xs">
                {fromTable}
              </span>
              <span className="text-muted-foreground font-mono text-[10px]">
                #{fromField}
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              <span className="font-mono text-primary font-semibold text-xs">
                {toTable}
              </span>
              <span className="text-muted-foreground font-mono text-[10px]">
                {toField}
              </span>
            </div>

            {/* Cardinality row: Table Mere (PK side) --- line --- Table Fille (FK side) */}
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  {toTable} <span className="text-primary">(Mère)</span>
                </span>
                <Select
                  value={rel.cardinalityTo}
                  onValueChange={(value) =>
                    onUpdateCardinality(
                      rel.fromTableId,
                      rel.fromFieldId,
                      rel.toTableId,
                      rel.toFieldId,
                      rel.cardinalityFrom,
                      value
                    )
                  }
                >
                  <SelectTrigger className="h-9 text-sm bg-card border-border text-foreground font-mono font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CARDINALITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-foreground font-mono font-bold">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Visual separator */}
              <div className="flex flex-col items-center mt-4 gap-0.5">
                <div className="w-8 border-t-2 border-dashed border-primary" />
              </div>

              <div className="flex flex-col gap-1 flex-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                  {fromTable} <span className="text-[#e5a435]">(Fille)</span>
                </span>
                <Select
                  value={rel.cardinalityFrom}
                  onValueChange={(value) =>
                    onUpdateCardinality(
                      rel.fromTableId,
                      rel.fromFieldId,
                      rel.toTableId,
                      rel.toFieldId,
                      value,
                      rel.cardinalityTo
                    )
                  }
                >
                  <SelectTrigger className="h-9 text-sm bg-card border-border text-foreground font-mono font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {CARDINALITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-foreground font-mono font-bold">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
