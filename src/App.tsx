import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'
import './App.css'

const COLS = 118
const ROWS = 76
const CELL_COUNT = COLS * ROWS

type PaletteName = 'aurora' | 'dawn' | 'lagoon' | 'ember'
type DrawMode = 'paint' | 'erase'
type PatternName = 'Glider' | 'Pulsar' | 'Beacon' | 'Acorn' | 'Garden'

type Palette = {
  name: PaletteName
  label: string
  background: [string, string, string]
  ink: string
  glow: string
  bloom: string
  accent: string
  mist: string
}

const palettes: Record<PaletteName, Palette> = {
  aurora: {
    name: 'aurora',
    label: 'Aurora',
    background: ['#07131d', '#0c2130', '#102d33'],
    ink: '#dffdf2',
    glow: '#71f5d0',
    bloom: '#f4d06f',
    accent: '#98d9ff',
    mist: 'rgba(113, 245, 208, 0.14)',
  },
  dawn: {
    name: 'dawn',
    label: 'Dawn',
    background: ['#1a1621', '#2c2030', '#3b2b35'],
    ink: '#fff4df',
    glow: '#ffb58d',
    bloom: '#ffe28a',
    accent: '#d2b6ff',
    mist: 'rgba(255, 181, 141, 0.14)',
  },
  lagoon: {
    name: 'lagoon',
    label: 'Lagoon',
    background: ['#041720', '#092936', '#0f3f43'],
    ink: '#e8fff8',
    glow: '#5ce0e6',
    bloom: '#a8ffcf',
    accent: '#a4c7ff',
    mist: 'rgba(92, 224, 230, 0.15)',
  },
  ember: {
    name: 'ember',
    label: 'Ember',
    background: ['#171215', '#2a1717', '#3a2217'],
    ink: '#fff1df',
    glow: '#ff8f6e',
    bloom: '#ffd56a',
    accent: '#ffb4c8',
    mist: 'rgba(255, 143, 110, 0.13)',
  },
}

const patterns: Record<PatternName, number[][]> = {
  Glider: [
    [1, 0],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
  Pulsar: [
    [2, 0],
    [3, 0],
    [4, 0],
    [8, 0],
    [9, 0],
    [10, 0],
    [0, 2],
    [5, 2],
    [7, 2],
    [12, 2],
    [0, 3],
    [5, 3],
    [7, 3],
    [12, 3],
    [0, 4],
    [5, 4],
    [7, 4],
    [12, 4],
    [2, 5],
    [3, 5],
    [4, 5],
    [8, 5],
    [9, 5],
    [10, 5],
    [2, 7],
    [3, 7],
    [4, 7],
    [8, 7],
    [9, 7],
    [10, 7],
    [0, 8],
    [5, 8],
    [7, 8],
    [12, 8],
    [0, 9],
    [5, 9],
    [7, 9],
    [12, 9],
    [0, 10],
    [5, 10],
    [7, 10],
    [12, 10],
    [2, 12],
    [3, 12],
    [4, 12],
    [8, 12],
    [9, 12],
    [10, 12],
  ],
  Beacon: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 2],
    [3, 2],
    [2, 3],
    [3, 3],
  ],
  Acorn: [
    [1, 0],
    [3, 1],
    [0, 2],
    [1, 2],
    [4, 2],
    [5, 2],
    [6, 2],
  ],
  Garden: [
    [4, 0],
    [5, 0],
    [6, 0],
    [3, 1],
    [7, 1],
    [2, 2],
    [8, 2],
    [2, 3],
    [8, 3],
    [3, 4],
    [7, 4],
    [4, 5],
    [5, 5],
    [6, 5],
    [0, 8],
    [1, 8],
    [2, 8],
    [10, 8],
    [11, 8],
    [12, 8],
    [0, 9],
    [2, 9],
    [10, 9],
    [12, 9],
    [0, 10],
    [1, 10],
    [2, 10],
    [10, 10],
    [11, 10],
    [12, 10],
  ],
}

const makeGrid = () => new Uint8Array(CELL_COUNT)
const makeAges = () => new Uint16Array(CELL_COUNT)

const indexOf = (col: number, row: number) => row * COLS + col

const countAlive = (grid: Uint8Array) => {
  let total = 0

  for (let index = 0; index < grid.length; index += 1) {
    total += grid[index]
  }

  return total
}

const seedRandom = (grid: Uint8Array, ages: Uint16Array, density: number) => {
  for (let index = 0; index < grid.length; index += 1) {
    const alive = Math.random() < density
    grid[index] = alive ? 1 : 0
    ages[index] = alive ? 1 + Math.floor(Math.random() * 12) : 0
  }
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef(makeGrid())
  const nextGridRef = useRef(makeGrid())
  const agesRef = useRef(makeAges())
  const runningRef = useRef(true)
  const speedRef = useRef(8)
  const paletteRef = useRef<Palette>(palettes.aurora)
  const pointerDownRef = useRef(false)
  const drawModeRef = useRef<DrawMode>('paint')
  const lastPaintedRef = useRef<number | null>(null)
  const generationRef = useRef(0)

  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState(8)
  const [density, setDensity] = useState(28)
  const [paletteName, setPaletteName] = useState<PaletteName>('aurora')
  const [patternName, setPatternName] = useState<PatternName>('Garden')
  const [drawMode, setDrawMode] = useState<DrawMode>('paint')
  const [generation, setGeneration] = useState(0)
  const [alive, setAlive] = useState(0)
  const densityRef = useRef(density)

  const activePalette = palettes[paletteName]

  const updateStats = useCallback(() => {
    setGeneration(generationRef.current)
    setAlive(countAlive(gridRef.current))
  }, [])

  const randomize = useCallback(() => {
    seedRandom(gridRef.current, agesRef.current, densityRef.current / 100)
    generationRef.current = 0
    updateStats()
  }, [updateStats])

  const clear = useCallback(() => {
    gridRef.current.fill(0)
    agesRef.current.fill(0)
    generationRef.current = 0
    setRunning(false)
    runningRef.current = false
    updateStats()
  }, [updateStats])

  const seedPattern = useCallback(
    (name: PatternName = patternName) => {
      const shape = patterns[name]
      const width = Math.max(...shape.map(([x]) => x)) + 1
      const height = Math.max(...shape.map(([, y]) => y)) + 1
      const startCol = Math.floor((COLS - width) / 2)
      const startRow = Math.floor((ROWS - height) / 2)

      gridRef.current.fill(0)
      agesRef.current.fill(0)

      shape.forEach(([x, y]) => {
        const index = indexOf(startCol + x, startRow + y)
        gridRef.current[index] = 1
        agesRef.current[index] = 1
      })

      generationRef.current = 0
      setRunning(true)
      runningRef.current = true
      updateStats()
    },
    [patternName, updateStats],
  )

  const stepLife = useCallback(() => {
    const grid = gridRef.current
    const nextGrid = nextGridRef.current
    const ages = agesRef.current

    for (let row = 0; row < ROWS; row += 1) {
      const above = row === 0 ? ROWS - 1 : row - 1
      const below = row === ROWS - 1 ? 0 : row + 1

      for (let col = 0; col < COLS; col += 1) {
        const left = col === 0 ? COLS - 1 : col - 1
        const right = col === COLS - 1 ? 0 : col + 1
        const index = indexOf(col, row)
        const neighbors =
          grid[indexOf(left, above)] +
          grid[indexOf(col, above)] +
          grid[indexOf(right, above)] +
          grid[indexOf(left, row)] +
          grid[indexOf(right, row)] +
          grid[indexOf(left, below)] +
          grid[indexOf(col, below)] +
          grid[indexOf(right, below)]
        const survives = grid[index] ? neighbors === 2 || neighbors === 3 : neighbors === 3

        nextGrid[index] = survives ? 1 : 0
        ages[index] = survives ? ages[index] + 1 : 0
      }
    }

    gridRef.current = nextGrid
    nextGridRef.current = grid
    generationRef.current += 1

    if (generationRef.current % 3 === 0) {
      updateStats()
    }
  }, [updateStats])

  const drawScene = useCallback((time: number) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')

    if (!canvas || !context) {
      return
    }

    const { width, height } = canvas
    const palette = paletteRef.current
    const cellWidth = width / COLS
    const cellHeight = height / ROWS
    const radius = Math.min(cellWidth, cellHeight) * 0.52
    const phase = time * 0.00008
    const background = context.createLinearGradient(0, 0, width, height)

    background.addColorStop(0, palette.background[0])
    background.addColorStop(0.52, palette.background[1])
    background.addColorStop(1, palette.background[2])
    context.fillStyle = background
    context.fillRect(0, 0, width, height)

    context.save()
    context.globalAlpha = 0.45
    context.fillStyle = palette.mist
    for (let index = 0; index < 7; index += 1) {
      const x = width * (0.08 + index * 0.15 + Math.sin(phase + index) * 0.025)
      const y = height * (0.18 + Math.cos(phase * 1.8 + index) * 0.16)
      const glow = context.createRadialGradient(x, y, 0, x, y, width * 0.22)
      glow.addColorStop(0, palette.mist)
      glow.addColorStop(1, 'rgba(255, 255, 255, 0)')
      context.fillStyle = glow
      context.beginPath()
      context.arc(x, y, width * 0.22, 0, Math.PI * 2)
      context.fill()
    }
    context.restore()

    const grid = gridRef.current
    const ages = agesRef.current

    context.save()
    context.shadowBlur = radius * 3.4
    context.shadowColor = palette.glow

    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const index = indexOf(col, row)

        if (!grid[index]) {
          continue
        }

        const age = Math.min(ages[index], 32)
        const x = (col + 0.5) * cellWidth
        const y = (row + 0.5) * cellHeight
        const pulse = 0.82 + Math.sin(time * 0.003 + col * 0.4 + row * 0.27) * 0.12
        const size = radius * pulse * (0.68 + age / 70)
        const cellGradient = context.createRadialGradient(x, y, 0, x, y, size * 1.8)

        cellGradient.addColorStop(0, palette.ink)
        cellGradient.addColorStop(0.55, age < 4 ? palette.bloom : palette.glow)
        cellGradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
        context.globalAlpha = 0.72 + Math.min(age, 10) * 0.025
        context.fillStyle = cellGradient
        context.beginPath()
        context.arc(x, y, size * 1.75, 0, Math.PI * 2)
        context.fill()

        context.globalAlpha = 0.95
        context.fillStyle = age < 3 ? palette.bloom : palette.ink
        context.beginPath()
        context.arc(x, y, Math.max(1.1, size * 0.54), 0, Math.PI * 2)
        context.fill()
      }
    }

    context.restore()
  }, [])

  useEffect(() => {
    runningRef.current = running
  }, [running])

  useEffect(() => {
    densityRef.current = density
  }, [density])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    paletteRef.current = activePalette
  }, [activePalette])

  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  useEffect(() => {
    seedRandom(gridRef.current, agesRef.current, densityRef.current / 100)
    updateStats()
  }, [updateStats])

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return undefined
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * pixelRatio))
      canvas.height = Math.max(1, Math.floor(rect.height * pixelRatio))
    }
    const observer = new ResizeObserver(resize)

    observer.observe(canvas)
    resize()

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let animationFrame = 0
    let lastStep = performance.now()

    const animate = (time: number) => {
      const interval = 1000 / speedRef.current

      if (runningRef.current && time - lastStep >= interval) {
        const steps = Math.min(4, Math.floor((time - lastStep) / interval))

        for (let index = 0; index < steps; index += 1) {
          stepLife()
        }

        lastStep = time
      }

      drawScene(time)
      animationFrame = requestAnimationFrame(animate)
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [drawScene, stepLife])

  useEffect(() => {
    const interval = window.setInterval(updateStats, 700)

    return () => window.clearInterval(interval)
  }, [updateStats])

  const paintAtPointer = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const col = Math.floor(((event.clientX - rect.left) / rect.width) * COLS)
    const row = Math.floor(((event.clientY - rect.top) / rect.height) * ROWS)

    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) {
      return
    }

    const centerIndex = indexOf(col, row)

    if (lastPaintedRef.current === centerIndex) {
      return
    }

    lastPaintedRef.current = centerIndex

    const brush = event.pointerType === 'touch' ? 2 : 1
    const value = drawModeRef.current === 'paint' ? 1 : 0

    for (let dy = -brush; dy <= brush; dy += 1) {
      for (let dx = -brush; dx <= brush; dx += 1) {
        if (Math.hypot(dx, dy) > brush + 0.2) {
          continue
        }

        const nextCol = col + dx
        const nextRow = row + dy

        if (nextCol < 0 || nextRow < 0 || nextCol >= COLS || nextRow >= ROWS) {
          continue
        }

        const index = indexOf(nextCol, nextRow)
        gridRef.current[index] = value
        agesRef.current[index] = value ? Math.max(agesRef.current[index], 1) : 0
      }
    }

    updateStats()
  }, [updateStats])

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      pointerDownRef.current = true
      lastPaintedRef.current = null
      paintAtPointer(event)
    },
    [paintAtPointer],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDownRef.current) {
        return
      }

      paintAtPointer(event)
    },
    [paintAtPointer],
  )

  const handlePointerUp = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    pointerDownRef.current = false
    lastPaintedRef.current = null
  }, [])

  const population = useMemo(() => Math.round((alive / CELL_COUNT) * 1000) / 10, [alive])

  return (
    <main className="life-shell" data-palette={paletteName}>
      <section className="studio">
        <div className="title-block">
          <p className="eyebrow">Conway's Game of Life</p>
          <h1>Living Canvas</h1>
          <p className="lede">
            A calm cellular automaton that grows, fades, and recomposes itself as generative
            light.
          </p>
        </div>

        <div className="metric-strip" aria-label="Simulation statistics">
          <article>
            <span>Generation</span>
            <strong>{generation.toLocaleString()}</strong>
          </article>
          <article>
            <span>Living Cells</span>
            <strong>{alive.toLocaleString()}</strong>
          </article>
          <article>
            <span>Field</span>
            <strong>{population}%</strong>
          </article>
        </div>
      </section>

      <section className="workbench" aria-label="Game of Life workbench">
        <div className="canvas-panel">
          <canvas
            ref={canvasRef}
            aria-label="Interactive Conway's Game of Life canvas"
            className="life-canvas"
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerCancel={handlePointerUp}
            onPointerLeave={() => {
              pointerDownRef.current = false
              lastPaintedRef.current = null
            }}
            onPointerUp={handlePointerUp}
          />
          <div className="canvas-glass" aria-hidden="true" />
        </div>

        <aside className="controls" aria-label="Simulation controls">
          <div className="control-row primary-actions">
            <button className="primary-button" type="button" onClick={() => setRunning(!running)}>
              {running ? 'Pause' : 'Play'}
            </button>
            <button className="quiet-button" type="button" onClick={randomize}>
              Randomize
            </button>
            <button className="quiet-button" type="button" onClick={clear}>
              Clear
            </button>
          </div>

          <label className="control-field">
            <span>Seed Pattern</span>
            <div className="inline-control">
              <select
                value={patternName}
                onChange={(event) => setPatternName(event.target.value as PatternName)}
              >
                {Object.keys(patterns).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button className="quiet-button compact" type="button" onClick={() => seedPattern()}>
                Seed
              </button>
            </div>
          </label>

          <label className="control-field">
            <span>Speed</span>
            <input
              type="range"
              min="1"
              max="24"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
            <output>{speed} steps/s</output>
          </label>

          <label className="control-field">
            <span>Density</span>
            <input
              type="range"
              min="6"
              max="58"
              value={density}
              onChange={(event) => setDensity(Number(event.target.value))}
            />
            <output>{density}% random fill</output>
          </label>

          <div className="control-field">
            <span>Palette</span>
            <div className="swatch-grid">
              {(Object.keys(palettes) as PaletteName[]).map((name) => (
                <button
                  aria-pressed={paletteName === name}
                  className="swatch-button"
                  key={name}
                  style={
                    {
                      '--swatch': palettes[name].glow,
                      '--swatch-alt': palettes[name].bloom,
                    } as CSSProperties
                  }
                  type="button"
                  onClick={() => setPaletteName(name)}
                >
                  {palettes[name].label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-field">
            <span>Drawing</span>
            <div className="segmented">
              <button
                aria-pressed={drawMode === 'paint'}
                type="button"
                onClick={() => setDrawMode('paint')}
              >
                Paint
              </button>
              <button
                aria-pressed={drawMode === 'erase'}
                type="button"
                onClick={() => setDrawMode('erase')}
              >
                Erase
              </button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
