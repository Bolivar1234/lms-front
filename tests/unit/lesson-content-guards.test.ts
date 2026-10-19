import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import { blocksToMdx } from '@/components/teacher/block-editor/serializer'
import { createBlock, type Block, type BlockType } from '@/components/teacher/block-editor/types'
import { resolveCalloutType } from '@/components/lesson/callout'

/**
 * Guards for the components that render inside lesson MDX. They only show up
 * when a lesson actually uses them, so a regression here is easy to miss by
 * clicking around:
 *
 * - Their labels used to be hardcoded Spanish and rendered on every locale.
 * - The block editor, docs and AI catalog wrote props the components ignored
 *   (`<Spoiler label>`, `<Vocabulary audioUrl>`), silently dropping what the
 *   teacher entered, and `<Callout type="error">` crashed the lesson.
 */

const ROOT = join(__dirname, '..', '..')
const LESSON_DIR = join(ROOT, 'components', 'lesson')

function listTsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listTsx(path)
    return entry.name.endsWith('.tsx') ? [path] : []
  })
}

/** Source with comments removed, so prose in comments is not flagged. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .split('\n')
    .map((line) => line.replace(/(^|\s)\/\/.*$/, ''))
    .join('\n')
}

function at(catalog: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined),
    catalog
  )
}

const SPANISH_UI = /[áéíóúñ¿¡]|\b(Comprobar|Reintentar|Mostrar|Ocultar|Respuesta|Siguiente|Anterior|Paso|Pista|Tarjeta|Parejas|Antes|Advertencia|Consejo|Importante|Correcto|Incorrecto)\b/

const LESSON_FILES = listTsx(LESSON_DIR)
const EDITOR_DEFAULT_FILES = [
  join(ROOT, 'components', 'teacher', 'block-editor', 'types.ts'),
  join(ROOT, 'components', 'teacher', 'block-editor', 'serializer.ts'),
  join(ROOT, 'components', 'teacher', 'block-editor', 'editors', 'steps-block.tsx'),
]

describe('lesson components: no hardcoded Spanish', () => {
  it.each([...LESSON_FILES, ...EDITOR_DEFAULT_FILES].map((f) => [relative(ROOT, f), f]))('%s', (_label, file) => {
    const offending = codeOnly(readFileSync(file, 'utf8'))
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => SPANISH_UI.test(line))
    expect(offending, 'move these strings into messages/{en,es}.json').toEqual([])
  })
})

describe('lesson components: translation keys exist', () => {
  it.each(LESSON_FILES.map((f) => [relative(ROOT, f), f]))('%s', (_label, file) => {
    const source = readFileSync(file, 'utf8')
    const namespaces = [...source.matchAll(/useTranslations\('([^']+)'\)/g)].map((m) => m[1])
    const keys = [...new Set([...source.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]))]
    if (namespaces.length === 0) return

    for (const key of keys) {
      for (const [label, catalog] of [['en', en], ['es', es]] as const) {
        const found = namespaces.some((ns) => typeof at(catalog, `${ns}.${key}`) === 'string')
        expect(found, `${label}: ${namespaces.join('|')}.${key}`).toBe(true)
      }
    }
  })

  it('has a callout title for every callout type', () => {
    for (const type of ['info', 'warning', 'tip', 'success', 'danger']) {
      for (const [label, catalog] of [['en', en], ['es', es]] as const) {
        expect(at(catalog, `lessonContent.callout.${type}`), `${label}:${type}`).toBeTruthy()
      }
    }
  })
})

describe('Callout type', () => {
  it('renders the block editor’s "error" variant as danger', () => {
    expect(resolveCalloutType('error')).toBe('danger')
  })

  it('falls back to info for unknown values instead of crashing', () => {
    expect(resolveCalloutType('nope')).toBe('info')
    expect(resolveCalloutType('constructor')).toBe('info')
  })

  it('keeps known types', () => {
    for (const type of ['info', 'warning', 'tip', 'success', 'danger']) {
      expect(resolveCalloutType(type)).toBe(type)
    }
  })
})

const ALL_BLOCK_TYPES: BlockType[] = [
  'text', 'heading', 'callout', 'code', 'quiz', 'spoiler', 'steps', 'vocabulary',
  'definition', 'image', 'video', 'divider', 'audio', 'embed', 'file-download',
  'glossary', 'comparison', 'table', 'flashcard-set', 'fill-in-the-blank',
  'matching-pairs', 'ordering', 'checkpoint',
]

/**
 * Every block with its optional fields filled, so every attribute is emitted.
 * The serializer only reads the fields its block type has, so the extras on
 * other types are ignored.
 */
function fullBlock(type: BlockType): Block {
  return {
    ...createBlock(type),
    label: 'Show me',
    audioUrl: '/a.mp3',
    explanation: 'Because.',
    title: 'Title',
    caption: 'Caption',
    description: 'Desc',
    summary: 'Summary',
    striped: true,
    checkpointId: 1,
  } as Block
}

/** Component name -> source file, from the lesson barrel and the MDX map. */
function componentFiles(): Map<string, string> {
  const map = new Map<string, string>()
  const barrel = readFileSync(join(LESSON_DIR, 'index.ts'), 'utf8')
  for (const m of barrel.matchAll(/export \{([^}]+)\} from '\.\/([^']+)'/g)) {
    for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      map.set(name, join(LESSON_DIR, `${m[2]}.tsx`))
    }
  }
  map.set('LessonCheckpoint', join(LESSON_DIR, 'checkpoints', 'lesson-checkpoint.tsx'))
  return map
}

describe('block editor output: every attribute is a prop the component reads', () => {
  const files = componentFiles()
  const mdx = blocksToMdx(ALL_BLOCK_TYPES.map(fullBlock))
  const uses = [...mdx.matchAll(/<([A-Z]\w*)((?:\s+\w+=(?:"(?:[^"\\]|\\.)*"|\{[^}]*\}+))*)\s*\/?>/g)].map((m) => ({
    tag: m[1],
    attrs: [...m[2].matchAll(/(\w+)=/g)].map((a) => a[1]),
  }))

  it('found the components the editor emits', () => {
    expect(uses.map((u) => u.tag)).toEqual(expect.arrayContaining(['Callout', 'Quiz', 'Spoiler', 'Vocabulary', 'Steps']))
  })

  it.each(uses.map((u) => [u.tag, u.attrs] as const))('<%s>', (tag, attrs) => {
    const file = files.get(tag)
    expect(file, `no source file for <${tag}>`).toBeTruthy()
    const source = readFileSync(file!, 'utf8')
    for (const attr of attrs) {
      expect(new RegExp(`\\b${attr}\\??\\s*:`).test(source), `<${tag} ${attr}> is not a prop in ${relative(ROOT, file!)}`).toBe(true)
    }
  })
})
