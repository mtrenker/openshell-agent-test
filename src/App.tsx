import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import './App.css'

const ARENA_WIDTH = 980
const ARENA_HEIGHT = 640
const PLAYER_RADIUS = 18
const MAX_HEALTH = 5
const WIN_RESTORE = 100
const ROUND_TIME = 90

type Phase = 'ready' | 'playing' | 'won' | 'lost'

type Vec2 = {
  x: number
  y: number
}

type Petal = Vec2 & {
  id: number
  radius: number
  hue: number
  spin: number
}

type Enemy = Vec2 & {
  id: number
  radius: number
  speed: number
  hp: number
  hue: number
  wobble: number
  vx: number
  vy: number
}

type Spark = Vec2 & {
  id: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
}

type Pulse = Vec2 & {
  id: number
  life: number
  maxLife: number
}

type Pane = {
  id: number
  points: string
  fill: string
  opacity: number
}

type RuntimeState = {
  phase: Phase
  elapsed: number
  timeLeft: number
  score: number
  restore: number
  combo: number
  bestCombo: number
  lastCollectAt: number
  nextId: number
  petalTimer: number
  enemyTimer: number
  enemyInterval: number
  player: {
    x: number
    y: number
    health: number
    energy: number
    pulseCooldown: number
    invulnerability: number
  }
  petals: Petal[]
  enemies: Enemy[]
  sparks: Spark[]
  pulses: Pulse[]
}

type Snapshot = RuntimeState

type InputState = {
  pointer: Vec2 & { active: boolean }
  keys: Set<string>
  pulseQueued: boolean
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const lerp = (start: number, end: number, amount: number) =>
  start + (end - start) * amount

const randomRange = (min: number, max: number) => min + Math.random() * (max - min)

const distanceBetween = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)

const normalize = (vector: Vec2) => {
  const length = Math.hypot(vector.x, vector.y)

  if (!length) {
    return { x: 0, y: 0 }
  }

  return { x: vector.x / length, y: vector.y / length }
}

const createRuntimeState = (): RuntimeState => ({
  phase: 'ready',
  elapsed: 0,
  timeLeft: ROUND_TIME,
  score: 0,
  restore: 0,
  combo: 1,
  bestCombo: 1,
  lastCollectAt: -10,
  nextId: 1,
  petalTimer: 0.25,
  enemyTimer: 1.4,
  enemyInterval: 2.6,
  player: {
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT * 0.72,
    health: MAX_HEALTH,
    energy: 24,
    pulseCooldown: 0,
    invulnerability: 0,
  },
  petals: [],
  enemies: [],
  sparks: [],
  pulses: [],
})

const getId = (state: RuntimeState) => {
  const id = state.nextId
  state.nextId += 1
  return id
}

const makePetal = (state: RuntimeState): Petal => ({
  id: getId(state),
  x: randomRange(94, ARENA_WIDTH - 94),
  y: randomRange(94, ARENA_HEIGHT - 110),
  radius: randomRange(14, 20),
  hue: randomRange(145, 205),
  spin: randomRange(-2.4, 2.4),
})

const makeEnemy = (state: RuntimeState): Enemy => {
  const side = Math.floor(randomRange(0, 4))
  const edgeOffset = randomRange(24, 72)
  const size = randomRange(20, 32)
  let x = 0
  let y = 0

  if (side === 0) {
    x = randomRange(42, ARENA_WIDTH - 42)
    y = -edgeOffset
  } else if (side === 1) {
    x = ARENA_WIDTH + edgeOffset
    y = randomRange(42, ARENA_HEIGHT - 42)
  } else if (side === 2) {
    x = randomRange(42, ARENA_WIDTH - 42)
    y = ARENA_HEIGHT + edgeOffset
  } else {
    x = -edgeOffset
    y = randomRange(42, ARENA_HEIGHT - 42)
  }

  return {
    id: getId(state),
    x,
    y,
    radius: size,
    speed: randomRange(52, 100),
    hp: size > 27 ? 2 : 1,
    hue: randomRange(320, 355),
    wobble: randomRange(-Math.PI, Math.PI),
    vx: 0,
    vy: 0,
  }
}

const createSparks = (
  state: RuntimeState,
  origin: Vec2,
  count: number,
  hueRange: [number, number],
) => {
  for (let index = 0; index < count; index += 1) {
    const angle = randomRange(0, Math.PI * 2)
    const speed = randomRange(50, 210)
    state.sparks.push({
      id: getId(state),
      x: origin.x,
      y: origin.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomRange(0.35, 0.8),
      maxLife: 0.8,
      size: randomRange(2, 5),
      hue: randomRange(hueRange[0], hueRange[1]),
    })
  }
}

const startRun = (input: InputState) => {
  const state = createRuntimeState()

  for (let index = 0; index < 4; index += 1) {
    state.petals.push(makePetal(state))
  }

  if (input.pointer.active) {
    state.player.x = input.pointer.x
    state.player.y = input.pointer.y
  }

  return state
}

const panesTemplate = (): Pane[] => {
  const fills = ['#ecf7ff', '#b8f2e6', '#ffd9a4', '#f7c8ff', '#fff5b3']
  const panes: Pane[] = []
  let id = 1

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const x = 44 + col * 184
      const y = 42 + row * 142
      const inset = 18 + ((row + col) % 3) * 9
      panes.push({
        id,
        points: `${x},${y + inset} ${x + inset},${y} ${x + 184 - inset},${y} ${x + 184},${
          y + inset
        } ${x + 184},${y + 142 - inset} ${x + 184 - inset},${y + 142} ${x + inset},${
          y + 142
        } ${x},${y + 142 - inset}`,
        fill: fills[(row * 5 + col) % fills.length],
        opacity: 0.17 + ((row + col) % 4) * 0.05,
      })
      id += 1
    }
  }

  return panes
}

function App() {
  const arenaRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<InputState>({
    pointer: { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, active: false },
    keys: new Set<string>(),
    pulseQueued: false,
  })
  const runtimeRef = useRef<RuntimeState>(createRuntimeState())
  const [game, setGame] = useState<Snapshot>(() => runtimeRef.current)
  const panes = useMemo(() => panesTemplate(), [])
  const twinkles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        id: index,
        x: randomRange(90, ARENA_WIDTH - 90),
        y: randomRange(72, ARENA_HEIGHT - 70),
        r: randomRange(3, 8),
      })),
    [],
  )

  const syncSnapshot = useEffectEvent(() => {
    setGame({ ...runtimeRef.current })
  })

  const queuePulse = useEffectEvent(() => {
    inputRef.current.pulseQueued = true
  })

  const resetToReady = useEffectEvent(() => {
    inputRef.current.keys.clear()
    inputRef.current.pulseQueued = false
    runtimeRef.current = createRuntimeState()
    setGame(runtimeRef.current)
  })

  const beginGame = useEffectEvent(() => {
    inputRef.current.keys.clear()
    inputRef.current.pulseQueued = false
    runtimeRef.current = startRun(inputRef.current)
    setGame(runtimeRef.current)
    arenaRef.current?.focus()
  })

  const pulseFromPlayer = (state: RuntimeState) => {
    if (state.player.energy < 25 || state.player.pulseCooldown > 0) {
      return
    }

    state.player.energy -= 25
    state.player.pulseCooldown = 0.9
    state.pulses.push({
      id: getId(state),
      x: state.player.x,
      y: state.player.y,
      life: 0.55,
      maxLife: 0.55,
    })

    createSparks(state, state.player, 28, [170, 210])

    state.enemies = state.enemies.flatMap((enemy) => {
      const distance = distanceBetween(enemy, state.player)

      if (distance > 170) {
        return [enemy]
      }

      const direction = normalize({
        x: enemy.x - state.player.x,
        y: enemy.y - state.player.y,
      })
      const impact = clamp((190 - distance) / 190, 0.2, 1)
      enemy.vx += direction.x * 380 * impact
      enemy.vy += direction.y * 380 * impact
      enemy.hp -= distance < 118 ? 2 : 1

      if (enemy.hp <= 0) {
        state.score += 55
        createSparks(state, enemy, 16, [320, 360])
        return []
      }

      return [enemy]
    })
  }

  const updateFrame = useEffectEvent((deltaSeconds: number) => {
    const state = runtimeRef.current

    for (const spark of state.sparks) {
      spark.life -= deltaSeconds
      spark.x += spark.vx * deltaSeconds
      spark.y += spark.vy * deltaSeconds
      spark.vx *= 0.97
      spark.vy *= 0.97
    }
    state.sparks = state.sparks.filter((spark) => spark.life > 0)

    for (const pulse of state.pulses) {
      pulse.life -= deltaSeconds
    }
    state.pulses = state.pulses.filter((pulse) => pulse.life > 0)

    if (state.phase !== 'playing') {
      syncSnapshot()
      return
    }

    const input = inputRef.current
    state.elapsed += deltaSeconds
    state.timeLeft = clamp(ROUND_TIME - state.elapsed, 0, ROUND_TIME)
    state.player.pulseCooldown = Math.max(0, state.player.pulseCooldown - deltaSeconds)
    state.player.invulnerability = Math.max(0, state.player.invulnerability - deltaSeconds)

    const keyboardVector = { x: 0, y: 0 }
    if (input.keys.has('arrowup') || input.keys.has('w')) {
      keyboardVector.y -= 1
    }
    if (input.keys.has('arrowdown') || input.keys.has('s')) {
      keyboardVector.y += 1
    }
    if (input.keys.has('arrowleft') || input.keys.has('a')) {
      keyboardVector.x -= 1
    }
    if (input.keys.has('arrowright') || input.keys.has('d')) {
      keyboardVector.x += 1
    }

    const keyboardDirection = normalize(keyboardVector)
    let velocity = {
      x: keyboardDirection.x * 310,
      y: keyboardDirection.y * 310,
    }

    if (input.pointer.active) {
      const chase = {
        x: input.pointer.x - state.player.x,
        y: input.pointer.y - state.player.y,
      }
      const distance = Math.hypot(chase.x, chase.y)
      const chaseDirection = normalize(chase)
      const chaseSpeed = clamp(distance * 3.6, 0, 360)

      velocity = {
        x: velocity.x + chaseDirection.x * chaseSpeed,
        y: velocity.y + chaseDirection.y * chaseSpeed,
      }
    }

    state.player.x = clamp(state.player.x + velocity.x * deltaSeconds, 42, ARENA_WIDTH - 42)
    state.player.y = clamp(state.player.y + velocity.y * deltaSeconds, 42, ARENA_HEIGHT - 42)

    if (input.pulseQueued) {
      pulseFromPlayer(state)
      input.pulseQueued = false
    }

    state.petalTimer -= deltaSeconds
    if (state.petalTimer <= 0 && state.petals.length < 5) {
      state.petals.push(makePetal(state))
      state.petalTimer = randomRange(1.15, 1.9)
    }

    state.enemyTimer -= deltaSeconds
    if (state.enemyTimer <= 0) {
      state.enemies.push(makeEnemy(state))
      state.enemyInterval = Math.max(0.7, state.enemyInterval - 0.045)
      state.enemyTimer = state.enemyInterval
    }

    state.petals = state.petals.filter((petal) => {
      if (distanceBetween(petal, state.player) > petal.radius + PLAYER_RADIUS + 3) {
        return true
      }

      state.combo =
        state.elapsed - state.lastCollectAt < 2.35 ? clamp(state.combo + 0.55, 1, 7) : 1
      state.bestCombo = Math.max(state.bestCombo, state.combo)
      state.lastCollectAt = state.elapsed
      state.restore = clamp(state.restore + 7, 0, WIN_RESTORE)
      state.player.energy = clamp(state.player.energy + 18, 0, 100)
      state.score += Math.round(125 * state.combo)
      createSparks(state, petal, 18, [petal.hue - 15, petal.hue + 15])
      return false
    })

    state.enemies = state.enemies.flatMap((enemy) => {
      const target = {
        x: state.player.x - enemy.x,
        y: state.player.y - enemy.y,
      }
      const direction = normalize(target)
      const sway = {
        x: -direction.y,
        y: direction.x,
      }
      const swirl = Math.sin(state.elapsed * 1.4 + enemy.wobble) * 26

      enemy.vx += (direction.x * enemy.speed + sway.x * swirl - enemy.vx) * 0.08
      enemy.vy += (direction.y * enemy.speed + sway.y * swirl - enemy.vy) * 0.08
      enemy.vx *= 0.99
      enemy.vy *= 0.99
      enemy.x += enemy.vx * deltaSeconds
      enemy.y += enemy.vy * deltaSeconds

      if (distanceBetween(enemy, state.player) < enemy.radius + PLAYER_RADIUS - 2) {
        createSparks(state, enemy, 14, [320, 360])

        if (state.player.invulnerability <= 0) {
          state.player.health -= 1
          state.player.invulnerability = 1.05
          state.player.energy = clamp(state.player.energy + 8, 0, 100)
        }

        return []
      }

      if (
        enemy.x < -110 ||
        enemy.x > ARENA_WIDTH + 110 ||
        enemy.y < -110 ||
        enemy.y > ARENA_HEIGHT + 110
      ) {
        return []
      }

      return [enemy]
    })

    if (state.elapsed - state.lastCollectAt > 3.2) {
      state.combo = lerp(state.combo, 1, clamp(deltaSeconds * 2.8, 0, 1))
    }

    if (state.restore >= WIN_RESTORE) {
      state.phase = 'won'
      state.score += Math.round(state.timeLeft * 40)
      createSparks(state, { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 }, 60, [155, 215])
    } else if (state.player.health <= 0 || state.timeLeft <= 0) {
      state.phase = 'lost'
      createSparks(state, state.player, 42, [330, 360])
    }

    syncSnapshot()
  })

  useEffect(() => {
    let frameId = 0
    let previous = 0

    const tick = (timestamp: number) => {
      if (!previous) {
        previous = timestamp
      }

      const deltaSeconds = Math.min((timestamp - previous) / 1000, 0.033)
      previous = timestamp
      updateFrame(deltaSeconds)
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [updateFrame])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()

      if (key === ' ' || key === 'spacebar') {
        event.preventDefault()
        if (runtimeRef.current.phase === 'ready') {
          beginGame()
        } else {
          queuePulse()
        }
        return
      }

      if (key === 'enter' && runtimeRef.current.phase !== 'playing') {
        if (runtimeRef.current.phase === 'ready') {
          beginGame()
        } else {
          beginGame()
        }
        return
      }

      inputRef.current.keys.add(key)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      inputRef.current.keys.delete(event.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [beginGame, queuePulse])

  const handlePointerMove = (clientX: number, clientY: number) => {
    const bounds = arenaRef.current?.getBoundingClientRect()

    if (!bounds) {
      return
    }

    inputRef.current.pointer = {
      x: clamp(((clientX - bounds.left) / bounds.width) * ARENA_WIDTH, 0, ARENA_WIDTH),
      y: clamp(((clientY - bounds.top) / bounds.height) * ARENA_HEIGHT, 0, ARENA_HEIGHT),
      active: true,
    }
  }

  const phaseLabel =
    game.phase === 'won'
      ? 'Glasshouse restored'
      : game.phase === 'lost'
        ? 'Signal collapsed'
        : game.phase === 'playing'
          ? 'Restoration in progress'
          : 'Waiting for first flight'

  return (
    <main className="game-shell">
      <section className="headline-panel">
        <div>
          <p className="eyebrow">Browser arcade experiment</p>
          <h1>Glasshouse of Static</h1>
          <p className="lede">
            Pilot a prismatic moth through a shattered midnight conservatory. Gather bloom
            shards, dodge static brambles, and fire pulsewaves before the lantern light expires.
          </p>
        </div>
        <div className="headline-stats" aria-label="Run summary">
          <article>
            <span>Restore</span>
            <strong>{Math.round(game.restore)}%</strong>
          </article>
          <article>
            <span>Score</span>
            <strong>{game.score}</strong>
          </article>
          <article>
            <span>Best chain</span>
            <strong>{game.bestCombo.toFixed(1)}x</strong>
          </article>
        </div>
      </section>

      <section className="stage-layout">
        <div
          ref={arenaRef}
          className="arena-frame"
          tabIndex={0}
          onMouseMove={(event) => handlePointerMove(event.clientX, event.clientY)}
          onMouseEnter={(event) => handlePointerMove(event.clientX, event.clientY)}
          onMouseLeave={() => {
            inputRef.current.pointer.active = false
          }}
          onClick={() => {
            if (game.phase === 'ready') {
              beginGame()
            } else {
              queuePulse()
            }
          }}
        >
          <svg
            className="arena"
            viewBox={`0 0 ${ARENA_WIDTH} ${ARENA_HEIGHT}`}
            role="img"
            aria-label="Game arena"
          >
            <defs>
              <radialGradient id="skyBloom" cx="50%" cy="38%" r="70%">
                <stop offset="0%" stopColor="#173b61" />
                <stop offset="55%" stopColor="#0b1832" />
                <stop offset="100%" stopColor="#050812" />
              </radialGradient>
              <radialGradient id="floorGlow" cx="50%" cy="72%" r="68%">
                <stop offset="0%" stopColor="rgba(255, 216, 122, 0.18)" />
                <stop offset="100%" stopColor="rgba(255, 216, 122, 0)" />
              </radialGradient>
            </defs>

            <rect width={ARENA_WIDTH} height={ARENA_HEIGHT} fill="url(#skyBloom)" />

            {panes.map((pane) => (
              <polygon
                key={pane.id}
                points={pane.points}
                fill={pane.fill}
                opacity={pane.opacity}
                className="glass-pane"
              />
            ))}

            <circle cx={ARENA_WIDTH / 2} cy={ARENA_HEIGHT * 0.72} r="194" fill="url(#floorGlow)" />
            <circle
              cx={ARENA_WIDTH / 2}
              cy={ARENA_HEIGHT * 0.52}
              r="118"
              className="rosette-ring"
            />
            <circle
              cx={ARENA_WIDTH / 2}
              cy={ARENA_HEIGHT * 0.52}
              r="55"
              className="rosette-core"
            />

            {twinkles.map((twinkle) => (
              <circle
                key={twinkle.id}
                cx={twinkle.x}
                cy={twinkle.y}
                r={twinkle.r}
                className="twinkle"
              />
            ))}

            {game.petals.map((petal) => (
              <g key={petal.id} transform={`translate(${petal.x} ${petal.y})`}>
                <circle className="petal-aura" r={petal.radius + 10} />
                <g
                  style={{
                    transform: `rotate(${game.elapsed * petal.spin * 28}deg)`,
                    transformOrigin: 'center',
                  }}
                >
                  <ellipse rx={petal.radius * 0.55} ry={petal.radius * 1.3} fill={`hsl(${petal.hue} 90% 70%)`} />
                  <ellipse
                    rx={petal.radius * 0.55}
                    ry={petal.radius * 1.3}
                    fill={`hsl(${petal.hue - 18} 95% 74%)`}
                    transform="rotate(60)"
                  />
                  <ellipse
                    rx={petal.radius * 0.55}
                    ry={petal.radius * 1.3}
                    fill={`hsl(${petal.hue + 18} 90% 76%)`}
                    transform="rotate(120)"
                  />
                </g>
                <circle r={petal.radius * 0.4} fill="#fff4b3" />
              </g>
            ))}

            {game.pulses.map((pulse) => {
              const progress = 1 - pulse.life / pulse.maxLife
              return (
                <circle
                  key={pulse.id}
                  cx={pulse.x}
                  cy={pulse.y}
                  r={38 + progress * 160}
                  className="pulse-ring"
                  style={{ opacity: 0.9 - progress * 0.9 }}
                />
              )
            })}

            {game.enemies.map((enemy) => (
              <g key={enemy.id} transform={`translate(${enemy.x} ${enemy.y})`}>
                <circle
                  r={enemy.radius + 8}
                  fill={`hsla(${enemy.hue} 85% 56% / 0.18)`}
                />
                <path
                  d={`M 0 ${-enemy.radius} L ${enemy.radius * 0.62} ${-enemy.radius * 0.22} L ${
                    enemy.radius
                  } ${enemy.radius * 0.1} L ${enemy.radius * 0.3} ${enemy.radius} L ${
                    -enemy.radius * 0.28
                  } ${enemy.radius * 0.68} L ${-enemy.radius} ${enemy.radius * 0.12} L ${
                    -enemy.radius * 0.58
                  } ${-enemy.radius * 0.44} Z`}
                  fill={`hsl(${enemy.hue} 88% 60%)`}
                  stroke="rgba(255,255,255,0.36)"
                  strokeWidth="1.5"
                />
              </g>
            ))}

            {game.sparks.map((spark) => (
              <circle
                key={spark.id}
                cx={spark.x}
                cy={spark.y}
                r={spark.size}
                fill={`hsla(${spark.hue} 95% 72% / ${spark.life / spark.maxLife})`}
              />
            ))}

            <g transform={`translate(${game.player.x} ${game.player.y})`}>
              <circle
                r={PLAYER_RADIUS + 14}
                className={game.player.invulnerability > 0 ? 'player-aura danger' : 'player-aura'}
              />
              <path
                d={`M 0 ${-PLAYER_RADIUS - 7} L ${PLAYER_RADIUS} 0 L 0 ${PLAYER_RADIUS + 7} L ${
                  -PLAYER_RADIUS
                } 0 Z`}
                className="player-core"
              />
              <path
                d={`M ${-PLAYER_RADIUS - 6} 0 C ${-PLAYER_RADIUS - 24} ${-PLAYER_RADIUS - 6}, ${
                  -PLAYER_RADIUS - 28
                } ${PLAYER_RADIUS + 6}, ${-6} ${PLAYER_RADIUS + 8}`}
                className="player-wing"
              />
              <path
                d={`M ${PLAYER_RADIUS + 6} 0 C ${PLAYER_RADIUS + 24} ${-PLAYER_RADIUS - 6}, ${
                  PLAYER_RADIUS + 28
                } ${PLAYER_RADIUS + 6}, 6 ${PLAYER_RADIUS + 8}`}
                className="player-wing"
              />
            </g>
          </svg>

          <div className="arena-hud">
            <div className="status-ribbon">
              <span>{phaseLabel}</span>
              <span>{game.timeLeft.toFixed(1)}s left</span>
            </div>
            <div className="meter-grid">
              <label>
                Hull
                <div className="meter">
                  <div style={{ width: `${(game.player.health / MAX_HEALTH) * 100}%` }} />
                </div>
              </label>
              <label>
                Pulse
                <div className="meter gold">
                  <div style={{ width: `${game.player.energy}%` }} />
                </div>
              </label>
              <label>
                Bloom chain
                <div className="meter teal">
                  <div style={{ width: `${clamp((game.combo / 7) * 100, 0, 100)}%` }} />
                </div>
              </label>
            </div>
          </div>

          {game.phase !== 'playing' && (
            <div className="overlay-card">
              <p className="eyebrow">{game.phase === 'ready' ? 'New run' : 'Run complete'}</p>
              <h2>
                {game.phase === 'won'
                  ? 'The glasshouse is glowing again.'
                  : game.phase === 'lost'
                    ? 'Static swallowed the lantern path.'
                    : 'Steady your wings.'}
              </h2>
              <p>
                {game.phase === 'won'
                  ? 'You restored the conservatory and banked a time bonus.'
                  : game.phase === 'lost'
                    ? 'Restart and try tighter bloom routes with earlier pulse clears.'
                    : 'Move with mouse, WASD, or arrows. Click or press Space to fire a pulsewave.'}
              </p>
              <div className="overlay-actions">
                <button type="button" onClick={beginGame}>
                  {game.phase === 'ready' ? 'Begin flight' : 'Fly again'}
                </button>
                {game.phase !== 'ready' && (
                  <button type="button" className="secondary" onClick={resetToReady}>
                    Back to briefing
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="info-rail">
          <article className="info-card lore">
            <p className="eyebrow">Objective</p>
            <h3>Restore the lantern glass before the static bloom closes in.</h3>
            <p>
              Each bloom shard repairs the dome, charges your pulsewave, and extends your scoring
              chain if you keep moving.
            </p>
          </article>

          <article className="info-card controls">
            <p className="eyebrow">Controls</p>
            <ul>
              <li>
                <code>Mouse</code> steers the moth toward the cursor.
              </li>
              <li>
                <code>WASD</code> or arrow keys add precise movement.
              </li>
              <li>
                <code>Click</code> or <code>Space</code> spends pulse energy to clear nearby
                brambles.
              </li>
            </ul>
          </article>

          <article className="info-card tips">
            <p className="eyebrow">Run notes</p>
            <ul>
              <li>Brambles grow denser over time; route for shards instead of chasing kills.</li>
              <li>Pulse early when lanes close, not after you are boxed in.</li>
              <li>Finishing faster converts remaining time into score.</li>
            </ul>
          </article>
        </aside>
      </section>
    </main>
  )
}

export default App
