import type { CSSProperties } from "react";

const glyphs = "0010110101ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾏﾐﾑﾒﾓΞ∑∆";
const streams = Array.from({ length: 66 }, (_, column) => {
  const length = 18 + (column * 7) % 21;
  const glyphAt = (row: number) => glyphs[(column * 19 + row * 13 + row * column + row ** 2) % glyphs.length];
  return {
    text: Array.from({ length }, (_, row) => glyphAt(row)).join("\n"),
    head: glyphAt(length),
    duration: 13 + (column * 13) % 18,
    delay: -((column * 43 + 32) % 261) / 10,
  };
});

export function CodeRain() {
  return (
    <div className="matrix-rain" aria-hidden="true">
      {streams.map(({ text, head, duration, delay }, column) => (
        <div key={column} className="matrix-rain-stream" style={{
          "--rain-duration": `${duration}s`, "--rain-delay": `${delay}s`, "--rain-rest": `${(column * 23) % 110 - 28}%`,
        } as CSSProperties}>
          <span>{text}<b>{head}</b></span>
        </div>
      ))}
    </div>
  );
}
