const WIDTH = 420;
const AMPLITUDE = 112;
const TILE_HEIGHT = 880;
const TURNS = 2;
const SAMPLES = 160;
const RUNG_EVERY = 2;

type Base = { x: number; y: number; depth: number };

type Rung = { x1: number; x2: number; y: number; depth: number; index: number };

function buildTile() {
  const strandA: Base[] = [];
  const strandB: Base[] = [];
  const rungs: Rung[] = [];
  const totalAngle = Math.PI * 2 * TURNS;

  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const theta = totalAngle * t;
    const y = TILE_HEIGHT * t;
    const sway = Math.sin(theta);
    const depth = Math.cos(theta);
    const ax = WIDTH / 2 + AMPLITUDE * sway;
    const bx = WIDTH / 2 - AMPLITUDE * sway;

    strandA.push({ x: ax, y, depth });
    strandB.push({ x: bx, y, depth: -depth });

    if (i % RUNG_EVERY === 0) {
      rungs.push({ x1: ax, x2: bx, y, depth, index: i });
    }
  }

  return { strandA, strandB, rungs };
}

const tile = buildTile();

const toPath = (points: Base[]) =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");

const strandAPath = toPath(tile.strandA);
const strandBPath = toPath(tile.strandB);

function HelixTile({ offset }: { offset: number }) {
  return (
    <g transform={`translate(0 ${offset})`}>
      {tile.rungs.map((rung) => {
        const strength = Math.abs(rung.depth);
        return (
          <line
            key={rung.index}
            x1={rung.x1}
            y1={rung.y}
            x2={rung.x2}
            y2={rung.y}
            stroke="url(#cp-dna-rung)"
            strokeWidth={1}
            strokeLinecap="round"
            opacity={0.12 + 0.34 * strength}
          />
        );
      })}

      <path
        className="cp-dna-glow"
        d={strandAPath}
        stroke="#67e8f9"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <path
        className="cp-dna-glow"
        d={strandBPath}
        stroke="#a5b4fc"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />

      <path
        d={strandAPath}
        stroke="#67e8f9"
        strokeWidth={1.15}
        fill="none"
        strokeLinecap="round"
        opacity={0.75}
      />
      <path
        d={strandBPath}
        stroke="#a5b4fc"
        strokeWidth={1.15}
        fill="none"
        strokeLinecap="round"
        opacity={0.7}
      />

      {tile.rungs.map((rung) => {
        const front = (rung.depth + 1) / 2;
        return (
          <g key={`node-${rung.index}`}>
            <circle
              cx={rung.x1}
              cy={rung.y}
              r={0.9 + 1.7 * front}
              fill="#cffafe"
              opacity={0.25 + 0.5 * front}
            />
            <circle
              cx={rung.x2}
              cy={rung.y}
              r={0.9 + 1.7 * (1 - front)}
              fill="#e0e7ff"
              opacity={0.25 + 0.5 * (1 - front)}
            />
          </g>
        );
      })}
    </g>
  );
}

export function DnaHelix() {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${TILE_HEIGHT * 2}`}
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="cp-dna-rung"
          gradientUnits="userSpaceOnUse"
          x1={WIDTH / 2 - AMPLITUDE}
          y1={0}
          x2={WIDTH / 2 + AMPLITUDE}
          y2={0}
        >
          <stop offset="0" stopColor="#67e8f9" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#bae6fd" stopOpacity="0.45" />
          <stop offset="1" stopColor="#a5b4fc" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <g className="cp-dna-flow">
        <HelixTile offset={0} />
        <HelixTile offset={TILE_HEIGHT} />
      </g>
    </svg>
  );
}
