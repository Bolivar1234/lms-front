import { describe, expect, it } from 'vitest'
import { blocksToMdx, mdxToBlocks } from '@/components/teacher/block-editor/serializer'

const reference = 'lesson-resource://42/91'

describe('Vocabulary MDX preservation', () => {
  it('round-trips every supported string prop, including empty values and both audio aliases', () => {
    const source = `<Vocabulary word="Hola" translation="Hello" pronunciation="/ˈola/" audioUrl="${reference}" audio="https://audio.example/legacy.mp3" example="¡Hola! ¿Cómo estás?" exampleTranslation="Hello! How are you?" image="/hola.webp" className="wide" />`
    const expected = { type: 'vocabulary', word: 'Hola', translation: 'Hello', pronunciation: '/ˈola/', audioUrl: reference, audio: 'https://audio.example/legacy.mp3', example: '¡Hola! ¿Cómo estás?', exampleTranslation: 'Hello! How are you?', image: '/hola.webp', className: 'wide' }
    const blocks = mdxToBlocks(source)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject(expected)
    expect(mdxToBlocks(blocksToMdx(blocks))[0]).toMatchObject(expected)
    expect(blocksToMdx(mdxToBlocks('<Vocabulary word="" translation="" pronunciation="" example="" exampleTranslation="" image="" className="" />'))).toContain('pronunciation="" example="" exampleTranslation="" image="" className=""')
  })

  it('consumes the entire documented multiline element without turning attributes into paragraphs', () => {
    const source = `Before.\n\n<Vocabulary\n  word="Hola"\n  translation="Hello"\n  pronunciation="/ˈola/"\n  audioUrl="${reference}"\n  example="¡Hola! ¿Cómo estás?"\n  exampleTranslation="Hello! How are you?"\n  image="/hola.webp"\n/>\n\nAfter.`
    const blocks = mdxToBlocks(source)
    expect(blocks.map((block) => block.type)).toEqual(['text', 'vocabulary', 'text'])
    expect(blocks[1]).toMatchObject({ word: 'Hola', translation: 'Hello', pronunciation: '/ˈola/', audioUrl: reference, example: '¡Hola! ¿Cómo estás?', exampleTranslation: 'Hello! How are you?', image: '/hola.webp' })
    expect(blocksToMdx(blocks)).not.toMatch(/\n\s+(word|translation|pronunciation|audioUrl|example|image)=/)
    expect(blocksToMdx(blocks)).toMatch(/^Before\.\n\n<Vocabulary[^\n]+\/>\n\nAfter\.$/)
  })

  it('preserves string entities, quote characters and legitimate zero-length optional strings', () => {
    const source = '<Vocabulary word=\'Say "hola"\' translation="A &amp; B" example="&lt;Hello&gt; &#x1F44B;" exampleTranslation="line&#10;two" />'
    const blocks = mdxToBlocks(source)
    expect(blocks[0]).toMatchObject({ word: 'Say "hola"', translation: 'A & B', example: '<Hello> 👋', exampleTranslation: 'line\ntwo' })
    expect(mdxToBlocks(blocksToMdx(blocks))[0]).toMatchObject({ word: 'Say "hola"', translation: 'A & B', example: '<Hello> 👋', exampleTranslation: 'line\ntwo' })
  })

  it.each([
    '<Vocabulary word={currentWord} translation="Hello" />',
    '<Vocabulary\n  {...props}\n  word="Hola"\n  translation="Hello"\n/>',
    '<Vocabulary word="Hola" translation="Hello" example={lookup("a > b")} />',
    '<Vocabulary word="Hola" translation="Hello" unsupported="keep me" />',
    '<Vocabulary word="Hola" translation="Hello"><strong>Keep children</strong></Vocabulary>',
    '<Vocabulary word="Hola" translation="Hello" example="&eacute;" />',
  ])('preserves unsupported JSX instead of silently dropping it: %s', (source) => {
    expect(blocksToMdx(mdxToBlocks(source))).toBe(source)
    expect(mdxToBlocks(source)).toMatchObject([{ type: 'text', content: source }])
  })

  it('keeps unsupported multiline JSX as one raw element between adjacent paragraphs', () => {
    const element = '<Vocabulary\n  word={translate("hello")}\n  translation="Hola"\n/>'
    const source = `Before.\n\n${element}\n\nAfter.`
    const blocks = mdxToBlocks(source)
    expect(blocks).toMatchObject([{ type: 'text', content: 'Before.' }, { type: 'text', content: element }, { type: 'text', content: 'After.' }])
    expect(blocksToMdx(blocks)).toBe(source)
  })
})
