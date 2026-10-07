import { describe, it, expect, vi, beforeEach } from 'vitest'

const runJev = vi.fn()
const runTemplateContent = vi.fn()

vi.mock('../agents/jev.js', () => ({ runJev }))
vi.mock('../agents/template-content.js', () => ({ runTemplateContent }))

const { canvasTemplateRoute } = await import('./canvas-template.js')

const kid = (label: string) => ({ id: null, label, kind: 'idea', link: 'because', detail: 'd' })
const stepOf = (label: string) => ({ id: null, order: null, label, detail: 'd', transition: 'then' })
const hierarchyRaw = (n: number) => ({
  root: { id: null, label: 'claim', detail: 'd', children: Array.from({ length: n }, (_, i) => kid(`k${i}`)) },
})
const sequenceRaw = (n: number) => ({
  title: 'flow',
  detail: 'd',
  steps: Array.from({ length: n }, (_, i) => stepOf(`s${i}`)),
})

function post(body: unknown) {
  return canvasTemplateRoute.request('/canvas-template', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  runJev.mockReset()
  runTemplateContent.mockReset()
})

describe('POST /canvas-template', () => {
  it('returns a hierarchy payload for a root query', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockResolvedValue(hierarchyRaw(3))

    const res = await post({ query: 'why do teams fail?', context: null })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.shape).toBe('hierarchy')
    expect(json.payload.shape).toBe('hierarchy')
    expect(json.payload.root.children).toHaveLength(3)
    expect(runTemplateContent).toHaveBeenCalledTimes(1)
    expect(runTemplateContent).toHaveBeenCalledWith('hierarchy', expect.stringContaining('why do teams fail?'))
  })

  it('returns a sequence payload when Jev picks sequence', async () => {
    runJev.mockResolvedValue('sequence')
    runTemplateContent.mockResolvedValue(sequenceRaw(4))

    const json = await (await post({ query: 'how does a bill become law?' })).json()

    expect(json.shape).toBe('sequence')
    expect(json.payload.steps).toHaveLength(4)
    expect(runTemplateContent).toHaveBeenCalledWith('sequence', expect.any(String))
  })

  it('passes parent and sibling context to both agents', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockResolvedValue(hierarchyRaw(2))

    await post({
      query: 'expand',
      context: { parent_id: 'p', parent_label: 'Parent claim', parent_detail: 'Parent detail', sibling_labels: ['Sib A'] },
    })

    const input = runJev.mock.calls[0][0] as string
    expect(input).toContain('Parent claim')
    expect(input).toContain('Parent detail')
    expect(input).toContain('- Sib A')
    expect(runTemplateContent.mock.calls[0][1]).toBe(input)
  })

  it('retries once when under-filled and uses the retry', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockResolvedValueOnce(hierarchyRaw(1)).mockResolvedValueOnce(hierarchyRaw(3))

    const json = await (await post({ query: 'q' })).json()

    expect(runTemplateContent).toHaveBeenCalledTimes(2)
    expect(json.payload.root.children).toHaveLength(3)
  })

  it('returns the thin result after one retry, never looping', async () => {
    runJev.mockResolvedValue('sequence')
    runTemplateContent.mockResolvedValue(sequenceRaw(2))

    const res = await post({ query: 'q' })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(runTemplateContent).toHaveBeenCalledTimes(2)
    expect(json.payload.steps).toHaveLength(2)
  })

  it('keeps the first result when the retry throws', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockResolvedValueOnce(hierarchyRaw(1)).mockRejectedValueOnce(new Error('boom'))

    const res = await post({ query: 'q' })

    expect(res.status).toBe(200)
    expect((await res.json()).payload.root.children).toHaveLength(1)
  })

  it('clamps an over-long model response', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockResolvedValue(hierarchyRaw(7))

    const json = await (await post({ query: 'q' })).json()

    expect(json.payload.root.children).toHaveLength(4)
    expect(runTemplateContent).toHaveBeenCalledTimes(1)
  })

  it('returns the error shape when the content agent fails', async () => {
    runJev.mockResolvedValue('hierarchy')
    runTemplateContent.mockRejectedValue(new Error('model down'))

    const res = await post({ query: 'q' })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json).toEqual({ error: expect.any(String), fallback_shape: 'hierarchy' })
  })

  it('rejects an invalid payload with 400 and never calls an agent', async () => {
    const res = await post({ query: '   ' })

    expect(res.status).toBe(400)
    expect(runJev).not.toHaveBeenCalled()
    expect(runTemplateContent).not.toHaveBeenCalled()
  })
})
