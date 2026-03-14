"use client"
import { useState, useMemo,useEffect,useRef   } from "react"
import { DatabaseDef, Relation } from "@/lib/db-types"
import { DatabaseForm } from "@/components/database-form"
import { SchemaDiagram } from "@/components/schema-diagram"
import { CardinalityEditor } from "@/components/cardinality-editor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from "@/components/ui/alert-dialog"
import {
  Database,
  Pencil,
  Plus,
  Link2,
  LayoutGrid,
  ArrowLeft,
  Table2,
  KeyRound,
  Save,
} from "lucide-react"
type Attribute = {
  name: string
  pk: boolean
  fk: boolean
}

type Table = {
  name: string
  attributes: Attribute[]
}
type AppView = "empty" | "form" | "diagram"
function parseTextualDB(text: string) {
  const tables: Table[] = []

  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(l => l !== "")

  lines.forEach(line => {

    const match = line.match(/^(.+?)\s*\((.+)\)\s*$/)
    if (!match) return

    const tableName = match[1].trim()
    const rawAttrs  = match[2]


    const pkSet = new Set<string>()
    const uMatches = [...rawAttrs.matchAll(/<u>([\s\S]*?)<\/u>/g)]
    uMatches.forEach(m => {
      m[1]
        .split(",")
        .map(a => a.replace(/\s*#\s*/g, "").trim())   
        .filter(Boolean)
        .forEach(a => pkSet.add(a))
    })

    const cleanAttrs = rawAttrs.replace(/<\/?u>/g, "").split(",")

    const attributes: Attribute[] = cleanAttrs
      .map(attr => attr.trim())
      .filter(Boolean)
      .map(attr => {
        // # can appear anywhere in the token, with or without space
        const isFK = /\s*#/.test(attr)
        const name = attr.replace(/\s*#\s*/g, "").trim()
        const isPK = pkSet.has(name)
        return { name, pk: isPK, fk: isFK }
      })

    if (tableName && attributes.length > 0) {
      tables.push({ name: tableName, attributes })
    }
  })

  return { tables }
}
function buildRelationsFromFKs(database: DatabaseDef): Relation[] {
  const relations: Relation[] = []
  database.tables.forEach((table) => {
    table.fields.forEach((field) => {
      if (
        field.isForeignKey &&
        field.referencesTableId &&
        field.referencesFieldId
      ) {
        relations.push({
          fromTableId: table.id,
          fromFieldId: field.id,
          toTableId: field.referencesTableId,
          toFieldId: field.referencesFieldId,
          cardinalityFrom: "n",
          cardinalityTo: "1",
        })
      }
    })
  })
  return relations
}

export default function Page() {
  const [view, setView] = useState<AppView>("empty")
  const [database, setDatabase] = useState<DatabaseDef | null>(null)
  const [relations, setRelations] = useState<Relation[]>([])
  const [showCardinality, setShowCardinality] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const diagramRef = useRef<SVGSVGElement | null>(null)
  const [textSchema, setTextSchema] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [dbName, setDbName] = useState("")
  const handleJsonFile = (file: File) => {
  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target?.result as string)

      setDatabase(parsed.database)
      setRelations(parsed.relations || [])

      setUploadedFileName(file.name)
      setJsonError(null)

    } catch {
      setJsonError("Fichier JSON invalide")
      setUploadedFileName(null)
    }
  }

  reader.readAsText(file)
}
  const underlineSelection = () => {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return

  const range = selection.getRangeAt(0)
  const selectedText = range.extractContents()

  const underline = document.createElement("u")
  underline.appendChild(selectedText)

  range.insertNode(underline)

  selection.removeAllRanges()
}
function handleImport() {
  if (!editorRef.current) return

  const editor = editorRef.current

  // Save HTML for the "modifier" feature
  setTextSchema(editor.innerHTML)

  function nodeToText(node: ChildNode): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent ?? ""
    }
    const el = node as HTMLElement
    const tag = el.tagName?.toLowerCase() ?? ""

    if (tag === "u") {
      const inner = Array.from(el.childNodes).map(nodeToText).join("")
      return `<u>${inner}</u>`
    }
    if (tag === "br") {
      return "\n"
    }
    if (tag === "div" || tag === "p") {
      const inner = Array.from(el.childNodes).map(nodeToText).join("")
      return "\n" + inner
    }
    return Array.from(el.childNodes).map(nodeToText).join("")
  }


  const rawText = Array.from(editor.childNodes).map(nodeToText).join("")
  const lines = rawText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l !== "")

  const text = lines.join("\n")

  const result = parseTextualDB(text)

  if (!dbName && result.tables.length > 0) {
    setDbName(result.tables[0].name + "DB")
  }


  const newDatabase: DatabaseDef = {
    name: dbName.trim() || "Schema texte",
    tables: result.tables.map((t: Table, ti: number) => ({
      id: "t" + ti,
      name: t.name,
      fields: t.attributes.map((a: Attribute, fi: number) => ({
        id: "f" + ti + "_" + fi,
        name: a.name,
        isPrimaryKey: a.pk,
        isForeignKey: a.fk,
        referencesTableId: undefined,
        referencesFieldId: undefined,
      }))
    }))
  }


  newDatabase.tables.forEach((table) => {
    table.fields.forEach((field) => {
      if (!field.isForeignKey) return
      const name = field.name.toLowerCase()

      const parentTable = newDatabase.tables.find(
        (t) => t.id !== table.id &&
          t.fields.some((f) => f.isPrimaryKey && f.name.toLowerCase() === name)
      )
      if (!parentTable) return

      const parentField = parentTable.fields.find(
        (f) => f.isPrimaryKey && f.name.toLowerCase() === name
      )
      if (!parentField) return

      field.referencesTableId = parentTable.id
      field.referencesFieldId = parentField.id
    })
  })

  // Build and set relations
  const detectedRelations = buildRelationsFromFKs(newDatabase)

  setDatabase(newDatabase)
  setRelations(detectedRelations)
  setView("diagram")
}



// TAB 3 FUNCTION
const generateFromJson = () => {
  console.log("Generate diagram from JSON")

  setView("diagram")
}
  type EditorTab = "form" | "text" | "import"
  const [activeTab, setActiveTab] = useState<EditorTab>("form")

  useEffect(() => {
  const saved = localStorage.getItem("db-schema-designer")

  if (saved) {
    const parsed = JSON.parse(saved)
    setDatabase(parsed.database)
    setRelations(parsed.relations || [])
    setView("diagram")
  }
  setLoaded(true)
}, [])
useEffect(() => {

  if (view !== "form" || activeTab !== "text") return
  if (!textSchema) return

  const raf = requestAnimationFrame(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = textSchema
    }
  })
  return () => cancelAnimationFrame(raf)
}, [view, activeTab, textSchema])
useEffect(() => {
  if (!database) return

  const data = { database, relations }

  localStorage.setItem("db-schema-designer", JSON.stringify(data))
}, [database, relations])


  const handleSubmit = (db: DatabaseDef) => {
    setDatabase(db)
    const detected = buildRelationsFromFKs(db)
    // Preserve existing cardinalities if possible
    const merged = detected.map((newRel) => {
      const existing = relations.find(
        (r) =>
          r.fromTableId === newRel.fromTableId &&
          r.fromFieldId === newRel.fromFieldId &&
          r.toTableId === newRel.toTableId &&
          r.toFieldId === newRel.toFieldId
      )
      if (existing) {
        return {
          ...newRel,
          cardinalityFrom: existing.cardinalityFrom,
          cardinalityTo: existing.cardinalityTo,
        }
      }
      return newRel
    })
    setRelations(merged)
    setView("diagram")
  }

  const handleEdit = () => {
    setView("form")
    setActiveTab("text")
  }

  const handleNewDatabase = () => {

  // clear saved schema
  localStorage.removeItem("db-schema-designer")

  // reset states
  setDatabase(null)
  setRelations([])
  setDbName("")
  setTextSchema("")

  if (editorRef.current) {
    editorRef.current.innerHTML = ""
  }

  setView("form")
  setActiveTab("form")
}
function exportSVG() {
  if (!diagramRef.current) return

  const serializer = new XMLSerializer()
  const source = serializer.serializeToString(diagramRef.current)

  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download =  `${database?.name || "diagram"}.svg`
  link.click()

  URL.revokeObjectURL(url)
}
function exportPNG() {
  if (!diagramRef.current) return

  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(diagramRef.current)

  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")

  const img = new Image()

  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(svgBlob)

  img.onload = () => {
    canvas.width = img.width
    canvas.height = img.height

    ctx?.drawImage(img, 0, 0)

    const pngFile = canvas.toDataURL("image/png")

    const downloadLink = document.createElement("a")
    downloadLink.download =  `${database?.name || "diagram"}.png`
    downloadLink.href = pngFile
    downloadLink.click()

    URL.revokeObjectURL(url)
  }

  img.src = url
}
  const handleSave = () => {
  if (!database) return

  const data = {
    database,
    relations,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })

  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = `${database.name || "schema"}.json`
  a.click()

  URL.revokeObjectURL(url)
}

  const handleUpdateCardinality = (
    fromTableId: string,
    fromFieldId: string,
    toTableId: string,
    toFieldId: string,
    cardinalityFrom: string,
    cardinalityTo: string
  ) => {
    setRelations((prev) =>
      prev.map((r) =>
        r.fromTableId === fromTableId &&
        r.fromFieldId === fromFieldId &&
        r.toTableId === toTableId &&
        r.toFieldId === toFieldId
          ? { ...r, cardinalityFrom, cardinalityTo }
          : r
      )
    )
  }

  const relationCount = useMemo(() => relations.length, [relations])
  if (!loaded) {
  return (
    <div className="flex items-center justify-center h-screen text-muted-foreground">
      Chargement...
    </div>
  )
}

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-foreground font-bold text-lg leading-tight">
                DB Schema Designer
              </h1>
              <p className="text-muted-foreground text-xs">
                Représentation graphique de bases de données
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view === "diagram" && database && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCardinality(!showCardinality)}
                  className="border-border text-foreground hover:bg-secondary h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" />
                  Cardinalités ({relationCount})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEdit}
                  className="border-border text-foreground hover:bg-secondary h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Modifier
                </Button>
                
                <Button
  variant="outline"
  size="sm"
  onClick={handleSave}
  className="border-border text-foreground hover:bg-secondary h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
>
  <Save className="h-3.5 w-3.5 mr-1" />
  Sauvegarder
</Button>
<Button
  variant="outline"
  size="sm"
  onClick={() => (window as any).downloadDiagramSVG()}
  className="border-border text-foreground hover:bg-secondary h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
>
  Export SVG
</Button>

<Button
  variant="outline"
  size="sm"
  onClick={() => (window as any).downloadDiagramPNG()}
  className="border-border text-foreground hover:bg-secondary h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
>
  Export PNG
</Button>
  <AlertDialog>
  <AlertDialogTrigger asChild>

    <Button
      size="sm"
      className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 md:h-9 md:px-4 text-xs md:text-sm"
    >
      <Plus className="h-3.5 w-3.5 mr-1" />
      Nouvelle Base
    </Button>

  </AlertDialogTrigger>

  <AlertDialogContent>

    <AlertDialogHeader>

      <AlertDialogTitle>
        Créer une nouvelle base ?
      </AlertDialogTitle>

      <AlertDialogDescription>
        La base actuelle sera supprimée et toutes les modifications non sauvegardées seront perdues.
      </AlertDialogDescription>

    </AlertDialogHeader>

    <AlertDialogFooter>
      <AlertDialogCancel>
        Annuler
      </AlertDialogCancel>

      <AlertDialogAction onClick={handleNewDatabase}>
        Continuer
      </AlertDialogAction>
    </AlertDialogFooter>

  </AlertDialogContent>
</AlertDialog>

              </>
            )}
          </div>
        </div>
      </header>

      {/* Empty State */}
      {view === "empty" && (
        <div className="flex items-center justify-center min-h-[calc(100vh-60px)]">
          <div className="flex flex-col items-center gap-8 max-w-lg text-center px-4">
            {/* Decorative icon with rings */}
            <div className="relative">
              <div className="absolute inset-0 h-24 w-24 rounded-2xl bg-primary/5 -rotate-6" />
              <div className="relative flex items-center justify-center h-24 w-24 rounded-2xl bg-primary/10 border border-primary/20">
                <LayoutGrid className="h-11 w-11 text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-foreground text-3xl font-bold mb-3 text-balance">
                {'Représentation Graphique'}
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
                {'Définissez vos tables, leurs champs et clés primaires. L\'outil détectera automatiquement les relations référentielles et générera un schéma visuel.'}
              </p>
            </div>

            {/* Feature highlights */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-border">
                <Table2 className="h-5 w-5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium">Tables</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-border">
                <KeyRound className="h-5 w-5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium">{'Clés PK / FK'}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-border">
                <Link2 className="h-5 w-5 text-primary" />
                <span className="text-[10px] text-muted-foreground font-medium">{'Cardinalités'}</span>
              </div>
            </div>
            
            <Button
              onClick={() => setView("form")}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-8 text-base"
            >
              <Plus className="h-5 w-5 mr-2" />
              Nouvelle Base de Données
            </Button>
          </div>
        </div>
      )}

      {}
      {view === "form" && (
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-6">
            <button
              onClick={() => (database ? setView("diagram") : setView("empty"))}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>
          </div>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
            {}
            <div className="bg-gradient-to-r from-primary/20 via-primary/10 to-transparent px-6 py-5 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/20 border border-primary/30">
                  <Database className="h-5 w-5 text-primary" />
                  
                </div>
                
                <div>
                  
                  <h2 className="text-foreground text-lg font-bold">
                    {database ? "Modifier la Base de Données" : "Nouvelle Base de Données"}
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {database
                      ? "Modifiez les tables et champs ci-dessous, puis mettez à jour."
                      : "Ajoutez les tables et définissez les champs avec leurs clés primaires."}
                  </p>
                </div>
              </div>
            </div>

            {}
            <div className="px-6 py-3 bg-secondary/30 border-b border-border/30 flex items-center gap-6 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">1</span>
                <span className="text-foreground font-medium">Nom de la base</span>
              </div>
              <div className="h-px flex-1 bg-border max-w-6" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">2</span>
                <span className="text-foreground font-medium">Ajouter les tables</span>
              </div>
              <div className="h-px flex-1 bg-border max-w-6" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">3</span>
                <span className="text-foreground font-medium">{'Définir les champs & clés'}</span>
              </div>
            </div>

            <div className="p-6">
              <div className="flex gap-2 mb-6 border-b border-border pb-2">
  <button
    onClick={() => setActiveTab("form")}
    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${
      activeTab === "form"
        ? "bg-primary/20 text-primary"
        : "text-muted-foreground hover:bg-secondary"
    }`}
  >
    Remplir manuellement
  </button>

  <button
    onClick={() => setActiveTab("text")}
    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${
      activeTab === "text"
        ? "bg-primary/20 text-primary"
        : "text-muted-foreground hover:bg-secondary"
    }`}
  >
    Schéma Texte
  </button>

  <button
    onClick={() => setActiveTab("import")}
    className={`px-5 py-2.5 text-sm font-medium rounded-lg transition ${
      activeTab === "import"
        ? "bg-primary/20 text-primary"
        : "text-muted-foreground hover:bg-secondary"
    }`}
  >
    Import JSON
  </button>
  
</div>
              {activeTab === "form" && (
  <DatabaseForm
    initialData={database}
    onSubmit={handleSubmit}
    onCancel={database ? () => setView("diagram") : undefined}
  />
)}

{activeTab === "text" && (
  <div className="flex flex-col gap-3">
     

  <div className="flex flex-col gap-2 mb-4">
  <label className="text-sm font-medium text-foreground">
    Nom de la Base de Données
  </label>

  <Input
    placeholder="ex : GestionEcole"
    value={dbName}
    onChange={(e) => setDbName(e.target.value)}
  />
</div>
    <div className="flex gap-2 text-xs md:text-sm">
      <Button
        size="sm"
        variant="outline"
        onClick={underlineSelection}
      >
        Souligner
      </Button>
    </div>

    <div
  id="schema-text"
  ref={editorRef}
  contentEditable
  suppressContentEditableWarning
  className="w-full h-72 p-3 bg-background border border-border rounded-lg font-mono text-sm overflow-auto outline-none"
  spellCheck={false}
/>

    <Button onClick={handleImport}>
      Générer la représentation graphique
    </Button>

  </div>
)}

{activeTab === "import" && (
  <div className="flex flex-col items-center gap-6">

    <div
      className="w-full max-w-md border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary hover:bg-primary/5 transition"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) handleJsonFile(file)
      }}
    >

      <Database className="h-10 w-10 text-primary" />

      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">
          Importer un fichier JSON
        </p>

        <p className="text-xs text-muted-foreground">
          Glissez-déposez votre fichier ou cliquez pour sélectionner
        </p>
      </div>

      <label
        htmlFor="json-upload"
        className="text-xs text-primary cursor-pointer hover:underline"
      >
        Choisir un fichier
      </label>

      <input
        id="json-upload"
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleJsonFile(file)
        }}
      />

    </div>

    {
    {uploadedFileName && (
      <div className="flex items-center gap-2 text-green-500 text-sm">
        ✓ {uploadedFileName} chargé
      </div>
    )}

    {}
    {jsonError && (
      <div className="text-red-500 text-sm">
        {jsonError}
      </div>
    )}

    <Button onClick={generateFromJson}>
      Générer la représentation graphique
    </Button>

  </div>
)}
            </div>
          </div>
        </div>
      )}

      {}
      {view === "diagram" && database && (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-60px)]  ">
          {}
          {showCardinality && (
            <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card p-4 overflow-y-auto flex-shrink-0 ">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-foreground text-sm font-semibold flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Cardinalités
                </h3>
                <button
                  onClick={() => setShowCardinality(false)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Fermer
                </button>
              </div>
              <CardinalityEditor
                relations={relations}
                database={database}
                onUpdateCardinality={handleUpdateCardinality}
              />
            </div>
          )}

          {}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-border/60 bg-card/70 backdrop-blur-sm flex-shrink-0 flex-wrap">
              {}
              <div className="flex items-center gap-2 mr-2">
                <span className="text-primary font-mono text-sm font-bold leading-none">
                  {database.name}
                </span>
                <span className="text-muted-foreground text-xs">
                  {database.tables.length} table{database.tables.length !== 1 ? "s" : ""}
                  &nbsp;&middot;&nbsp;
                  {relationCount} relation{relationCount !== 1 ? "s" : ""}
                </span>
              </div>

              {}
              <div className="h-4 w-px bg-border hidden sm:block" />

              {}
              <div className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Disposition :</span>
                {(["auto", "grid", "wide"] as const).map((mode) => {
                  const labels = { auto: "Auto", grid: "Grille", wide: "Ligne" }
                  return (
                    <button
                      key={mode}
                      onClick={() => (window as any).__diagramSetLayout?.(mode)}
                      className="px-2.5 py-1 rounded-md text-xs font-medium transition-colors text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      {labels[mode]}
                    </button>
                  )
                })}
              </div>

              {}
              <div className="flex-1" />

              {}
              <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="font-mono font-bold text-primary bg-primary/10 px-1 py-0.5 rounded text-[10px]">PK</span>
                  Clé Primaire
                </span>
                <span className="flex items-center gap-1">
                  <span className="font-mono font-bold text-[#e5a435] bg-[#e5a435]/10 px-1 py-0.5 rounded text-[10px]">FK</span>
                  Clé Étrangère
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-5 h-0 border-t-2 border-dashed border-primary inline-block" />
                  Relation
                </span>
              </div>
            </div>

            {}
            <div className="flex-1 min-h-0 overflow-hidden">
              <SchemaDiagram database={database} relations={relations} />
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
