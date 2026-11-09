import type { CSSProperties } from "react";

const glyphs = "0010110101ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾏﾐﾑﾒﾓΞ∑∆";
const streams = Array.from({ length: 38 }, (_, column) => {
  const length = 13 + (column * 7) % 17;
  const glyphAt = (row: number) => glyphs[(column * 19 + row * 13 + row * column + row ** 2) % glyphs.length];
  return {
    text: Array.from({ length }, (_, row) => glyphAt(row)).join("\n"),
    head: glyphAt(length),
    duration: 9 + (column * 13) % 16,
    delay: -((column * 43 + 32) % 211) / 10,
  };
});

export function CodeRain() {
  return (
    <div className="matrix-field">
      <div className="matrix-field-top" aria-hidden="true">
        <span><i /> MATRIX</span>
        <span>PRIVATE BETA</span>
      </div>
      <input id="matrix-pause-rain" className="matrix-motion-toggle" type="checkbox" />
      <div className="matrix-field-window" aria-hidden="true">
        <div className="matrix-rain">
          {streams.map(({ text, head, duration, delay }, column) => (
            <div key={column} className="matrix-rain-stream" style={{
              "--rain-duration": `${duration}s`, "--rain-delay": `${delay}s`, "--rain-rest": `${(column * 23) % 78 - 16}%`,
            } as CSSProperties}>
              <span>{text}<b>{head}</b></span>
            </div>
          ))}
        </div>
        <svg className="matrix-field-mark" viewBox="0 0 240 220" fill="none" focusable="false">
          <path className="matrix-field-orbit" d="M120 7 222 59v102l-102 52L18 161V59L120 7Z" />
          <path className="matrix-field-orbit" d="M120 23 206 67v86l-86 44-86-44V67l86-44Z" />
          <path className="matrix-field-letter" d="M66 148V72l54 51 54-51v76" />
          <path className="matrix-field-edge" d="M66 148V72l54 51 54-51v76" />
          <path className="matrix-field-orbit" d="M120 0v15m0 190v15M10 110h17m186 0h17" />
        </svg>
      </div>
      <div className="matrix-field-bottom">
        <span aria-hidden="true">01 / MATRIX BETA</span>
        <label className="matrix-motion-label" htmlFor="matrix-pause-rain">
          <span className="matrix-motion-default">Pause code rain</span>
          <span className="matrix-motion-reduced">Play code rain</span>
        </label>
      </div>
    </div>
  );
}
