export function fileName(value: string) {
  return (
    Array.from(value)
      .filter(
        (c) =>
          c.charCodeAt(0) >= 32 &&
          (c.length > 1 ||
            c.charCodeAt(0) < 0xd800 ||
            c.charCodeAt(0) > 0xdfff) &&
          c.charCodeAt(0) !== 127 &&
          c !== "/" &&
          c !== "\\",
      )
      .join("")
      .trim()
      .slice(0, 255)
      .replace(/[\uD800-\uDBFF]$/, "") || "文件"
  );
}
