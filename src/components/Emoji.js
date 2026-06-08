import twemoji from "@twemoji/api";

export function getTwemojiSrc(emoji) {
  if (!emoji) return null;
  const icon = twemoji.convert.toCodePoint(
    emoji.indexOf(String.fromCharCode(8205)) < 0 ? emoji.replace(/\uFE0F/g, "") : emoji
  );
  return `${twemoji.base}svg/${icon}.svg`;
}

export function Emoji({ emoji, size = 24, alt = "", className, style }) {
  const src = getTwemojiSrc(emoji);
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt || emoji}
      draggable={false}
      className={className ? `twemoji ${className}` : "twemoji"}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
    />
  );
}
