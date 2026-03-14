export interface FieldDef {
  id: string
  name: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  referencesTableId?: string
  referencesFieldId?: string
}

export interface TableDef {
  id: string
  name: string
  fields: FieldDef[]
}

export interface DatabaseDef {
  name: string
  tables: TableDef[]
}

export interface Relation {
  fromTableId: string
  fromFieldId: string
  toTableId: string
  toFieldId: string
  cardinalityFrom: string
  cardinalityTo: string
}

export interface TablePosition {
  x: number
  y: number
}
