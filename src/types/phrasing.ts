export type ClauseType =
  | 'main'
  | 'purpose'
  | 'result'
  | 'condition'
  | 'concession'
  | 'temporal'
  | 'causal'
  | 'relative'
  | 'infinitival'
  | 'participial'
  | 'contrast'

export interface Phrase {
  id: string
  text: string
  type: ClauseType
  level: number
  parentId: string | null
  connective: string | null
  connectiveFunction: string | null
  role: 'subject' | 'predicate' | 'object' | 'modifier'
  theologicalNote: string
}

export interface OutlinePoint {
  point: string
  label: string
  sub?: OutlinePoint[]
}

export interface CanonicalContext {
  bookTheme: string
  passageRole: string
  biblicalThemes: string[]
  canonicalConnections: string
  keyWords: string[]
}

export type GenreType =
  | 'Narrative'
  | 'Law'
  | 'Poetry'
  | 'Wisdom'
  | 'Prophecy'
  | 'Epistle'
  | 'Gospel'
  | 'Apocalyptic'
  | 'Discourse'

export interface GenreAnalysis {
  genre: GenreType
  subgenre: string        // e.g. "Pauline Theological Argument" or "Historical Narrative"
  readingRules: string[]  // 4–6 hermeneutical principles specific to this genre
}

export interface PhrasingAnalysis {
  reference: string
  mainTheme: string
  phrases: Phrase[]
  outline: OutlinePoint[]
  canonicalContext: CanonicalContext
  culturalNotes?: CulturalNote[]
  genre?: GenreAnalysis
}

export interface CrossRef {
  reference: string
  reason: string
}

export interface WordStudy {
  word: string
  original: string
  transliteration: string
  strongs: string
  gloss: string
  parsing?: string
  semanticRange: string
  keyUses: string[]
}

export type CulturalCategory =
  | 'greco-roman'
  | 'jewish'
  | 'roman-legal'
  | 'ane'
  | 'hellenistic'
  | 'household-code'
  | 'honor-shame'

export interface CulturalNote {
  id: string
  phraseId: string
  term: string
  category: CulturalCategory
  explanation: string
  significance: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface HistoryEntry {
  id: string
  savedAt: string
  analysis: PhrasingAnalysis
  annotations: Record<string, string>
  draft?: string
  scholarMessages?: ChatMessage[]
}
